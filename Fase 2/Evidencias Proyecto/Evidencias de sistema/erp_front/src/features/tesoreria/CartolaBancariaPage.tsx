import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MockListPage } from '@/components/common/MockListPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { fmtDate } from '@/lib/utils';
import { useQueryScope, useEmpresaScopeId, usePeriodoScopeCodigo, listQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { useAppSettings } from '@/app/app-settings-context';
import {
  BANCOS_CARTOLA,
  MONEDAS_CARTOLA,
  bancoDesdeDetectado,
  bancoSugeridoPorHoja,
  fmtMontoCartola,
  hojasDefaultPorEmpresa,
  labelMonedaCartola,
  mesesContablesCercanos,
  monedaSugeridaPorHoja,
  periodoDesdeCodigoYm,
} from './cartola-periodo';
import {
  faltanDimensionesPlan,
  mensajesPlanSinConfig,
  opcionesLigadasAlPlan,
  prefillDimensionesPlan,
} from './cartola-plan-dimensiones';
import { fmtMonedaNativa } from './flujo-caja';
import {
  defaultWeekForPeriodo,
  yearOptions,
} from './period-week';
import { NominaSemanaSelects } from './NominaSemanaSelects';
import { calcularDiferenciaTcClient } from './tipo-cambio';
import type {
  AreaNegocio,
  CartolaBancaria,
  CentroCosto,
  Cliente,
  CodigoFinanciero,
  CuentaContable,
  ElementoCosto,
  MovimientoCartola,
  Proveedor,
  TipoDocumento,
} from '@/types/domain';
import * as api from '@/services/api';

const ESTADO_LABEL: Record<CartolaBancaria['estado'], string> = {
  CARGADA: 'Cargada',
  EN_CONCILIACION: 'En proceso',
  CERRADA: 'Cerrada',
};

const DESTINO_OPCIONES = [
  { value: 'FACTURA', label: 'Factura' },
  { value: 'ANTICIPO', label: 'Anticipo' },
  { value: 'TRASPASO', label: 'Traspaso' },
  { value: 'SUELDO', label: 'Sueldo' },
  { value: 'RENDICION', label: 'Rendición' },
  { value: 'OTRO', label: 'Otro' },
] as const;

const DESTINO_LABEL: Record<string, string> = Object.fromEntries(
  DESTINO_OPCIONES.map((d) => [d.value, d.label]),
);

type FormContab = {
  cuentaContraId: string;
  destinoTipo: string;
  codigoFinancieroId: string;
  tipoDocumento: string;
  folioDocumento: string;
  proveedorId: string;
  clienteId: string;
  centroCostoId: string;
  areaNegocioId: string;
  elementoCostoId: string;
  nominaSemana: string;
  tcManual: string;
};

const FORM_VACIO: FormContab = {
  cuentaContraId: '',
  destinoTipo: '',
  codigoFinancieroId: '',
  tipoDocumento: '',
  folioDocumento: '',
  proveedorId: '',
  clienteId: '',
  centroCostoId: '',
  areaNegocioId: '',
  elementoCostoId: '',
  nominaSemana: '',
  tcManual: '',
};

function flattenCuentas(rows: CuentaContable[]): CuentaContable[] {
  const out: CuentaContable[] = [];
  for (const c of rows) {
    out.push(c);
    if (c.children?.length) out.push(...flattenCuentas(c.children));
  }
  return out;
}

export default function CartolaBancariaPage() {
  const qc = useQueryClient();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const { selectedEmpresa } = useAppSettings();
  const periodoHeader = usePeriodoScopeCodigo();
  const periodoVista = usePeriodoVista();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('q')?.trim() || '';
  const [detalle, setDetalle] = useState<CartolaBancaria | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banco, setBanco] = useState('TODOS');
  const [monedaFiltro, setMonedaFiltro] = useState('TODOS');
  const [mesContable, setMesContable] = useState(() => periodoVista.mesContableCartola ?? 'TODOS');
  const [formato, setFormato] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Awaited<ReturnType<typeof api.previewCartolaArchivo>> | null>(null);
  const [importMeta, setImportMeta] = useState(() => ({
    periodo: periodoDesdeCodigoYm(periodoHeader)?.periodo ?? '',
  }));
  const [hojasSel, setHojasSel] = useState<string[]>([]);
  const [bancoPorHoja, setBancoPorHoja] = useState<Record<string, string>>({});
  const [monedaPorHoja, setMonedaPorHoja] = useState<Record<string, string>>({});
  const [bancoUnico, setBancoUnico] = useState('Banco Chile');
  const [monedaUnica, setMonedaUnica] = useState('CLP');
  const [vistaHoja, setVistaHoja] = useState('TODAS');
  const [importBusy, setImportBusy] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroMonto, setFiltroMonto] = useState('');
  const [filtroId, setFiltroId] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS');
  const [selEgresos, setSelEgresos] = useState<Record<string, boolean>>({});
  const [nominaLote, setNominaLote] = useState('');
  const [formMovId, setFormMovId] = useState<string | null>(null);
  const [form, setForm] = useState<FormContab>(FORM_VACIO);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [lookupOk, setLookupOk] = useState(false);
  const [lookupDoc, setLookupDoc] = useState<Awaited<ReturnType<typeof api.lookupDocumentoCartola>> | null>(null);

  useEffect(() => {
    setMesContable(periodoVista.todo ? 'TODOS' : (periodoVista.mesContableCartola ?? 'TODOS'));
  }, [periodoVista.todo, periodoVista.mesContableCartola]);

  const movQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'movimientos-cartola', detalle?.id ?? ''),
    queryFn: () => api.getMovimientosCartola(detalle!.id),
    enabled: detalle != null,
  });
  const codigosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'codigos-financieros'),
    queryFn: api.getCodigosFinancieros,
    enabled: detalle != null,
  });
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
    enabled: detalle != null,
  });
  const proveedoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedores'),
    queryFn: api.getProveedores,
    enabled: detalle != null,
  });
  const clientesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'clientes'),
    queryFn: api.getClientes,
    enabled: detalle != null,
  });
  const tiposQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'tipos-documento'),
    queryFn: api.getTiposDocumento,
    enabled: detalle != null,
  });
  const centrosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
    enabled: detalle != null,
  });
  const areasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'areas-negocio'),
    queryFn: api.getAreasNegocio,
    enabled: detalle != null,
  });
  const elementosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'elementos-costo'),
    queryFn: api.getElementosCosto,
    enabled: detalle != null,
  });
  const saldosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'saldos-bancos'),
    queryFn: api.getSaldosBancos,
  });

  const cuentaOptions = useMemo(() => {
    return flattenCuentas((cuentasQ.data ?? []) as CuentaContable[])
      .filter((c) => c.activa && !c.noImputable)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [cuentasQ.data]);
  const cuentaContra = useMemo(() => {
    return flattenCuentas((cuentasQ.data ?? []) as CuentaContable[]).find((c) => c.id === form.cuentaContraId);
  }, [cuentasQ.data, form.cuentaContraId]);
  const codigoOptions = useMemo(() => {
    return ((codigosQ.data ?? []) as CodigoFinanciero[])
      .filter((c) => c.activa)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [codigosQ.data]);
  const proveedorOptions = useMemo(() => {
    return ((proveedoresQ.data ?? []) as Proveedor[])
      .filter((p) => p.activo !== false)
      .map((p) => ({ value: p.id, label: `${p.razonSocial}${p.rut ? ` · ${p.rut}` : ''}` }));
  }, [proveedoresQ.data]);
  const clienteOptions = useMemo(() => {
    return ((clientesQ.data ?? []) as Cliente[])
      .filter((c) => c.activo !== false)
      .map((c) => ({ value: c.id, label: `${c.razonSocial}${c.rut ? ` · ${c.rut}` : ''}` }));
  }, [clientesQ.data]);
  const tipoDocOptions = useMemo(() => {
    return ((tiposQ.data ?? []) as TipoDocumento[])
      .filter((t) => t.activo)
      .map((t) => ({ value: t.codigo, label: `${t.codigo} · ${t.nombre}` }));
  }, [tiposQ.data]);
  const centroOptions = useMemo(() => {
    const todas = ((centrosQ.data ?? []) as CentroCosto[])
      .filter((c) => c.activa)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
    return opcionesLigadasAlPlan(todas, cuentaContra?.requiereCc, cuentaContra?.centroCostoIds);
  }, [centrosQ.data, cuentaContra]);
  const areaOptions = useMemo(() => {
    const todas = ((areasQ.data ?? []) as AreaNegocio[])
      .filter((c) => c.activa)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
    return opcionesLigadasAlPlan(todas, cuentaContra?.requiereArea, cuentaContra?.areaNegocioIds);
  }, [areasQ.data, cuentaContra]);
  const elementoOptions = useMemo(() => {
    const todas = ((elementosQ.data ?? []) as ElementoCosto[])
      .filter((c) => c.vigencia !== 'ANULADO')
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
    return opcionesLigadasAlPlan(todas, cuentaContra?.requiereElemento, cuentaContra?.elementoCostoIds);
  }, [elementosQ.data, cuentaContra]);
  const planSinConfig = useMemo(() => mensajesPlanSinConfig(cuentaContra), [cuentaContra]);
  const nominaYears = useMemo(() => {
    const yPeriodo = Number(periodoHeader.slice(0, 4));
    return yearOptions(new Date(), 2, 2, Number.isFinite(yPeriodo) ? yPeriodo : undefined);
  }, [periodoHeader]);
  const nominaDefaultWeek = useMemo(
    () => defaultWeekForPeriodo(periodoHeader),
    [periodoHeader],
  );

  const filterRows = useMemo(() => {
    return (rows: CartolaBancaria[]) => rows.filter((r) => {
      if (banco !== 'TODOS' && r.banco !== banco) return false;
      if (monedaFiltro !== 'TODOS' && (r.moneda ?? 'CLP') !== monedaFiltro) return false;
      if (mesContable !== 'TODOS' && (r.mesContable ?? '') !== mesContable) return false;
      if (formato !== 'TODOS' && r.formato !== formato) return false;
      if (estado !== 'TODOS' && r.estado !== estado) return false;
      return true;
    });
  }, [banco, monedaFiltro, mesContable, formato, estado]);

  const invalidateCartola = async (cartolaId: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cartolas-bancarias') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'movimientos-cartola', cartolaId) }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'saldos-bancos') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'flujo-caja') }),
    ]);
  };

  const abrirForm = (mov: MovimientoCartola) => {
    setFormMovId(mov.id);
    setForm({
      ...FORM_VACIO,
      nominaSemana: mov.tipo === 'EGRESO' ? nominaDefaultWeek : '',
    });
    setLookupMsg(null);
    setLookupOk(false);
    setLookupDoc(null);
  };

  const aplicarContracuenta = (cuentaId: string) => {
    const cta = flattenCuentas((cuentasQ.data ?? []) as CuentaContable[]).find((c) => c.id === cuentaId);
    const dims = prefillDimensionesPlan(cta);
    setForm((s) => ({ ...s, cuentaContraId: cuentaId, ...dims }));
    const msgs = mensajesPlanSinConfig(cta);
    if (msgs.length) toast.warning(msgs.join(' '));
  };

  const buscarDocumento = async (mov: MovimientoCartola) => {
    if (!form.folioDocumento.trim()) {
      setLookupMsg('Indica el número de documento');
      setLookupOk(false);
      setLookupDoc(null);
      return;
    }
    try {
      const res = await api.lookupDocumentoCartola({
        folio: form.folioDocumento.trim(),
        tipoDocumento: form.tipoDocumento || undefined,
        sentido: mov.tipo,
      });
      setLookupDoc(res);
      let msg = res.mensaje;
      if (res.found && res.moneda && res.moneda !== 'CLP') {
        const tcDoc = res.tipoCambio || 1;
        msg += ` · Moneda: ${res.moneda} (TC emisión: $${tcDoc.toFixed(2)})`;
        if (!form.tcManual) {
          const movMonto = Math.abs(mov.monto);
          const me = res.montoOtraMoneda;
          if (me && me > 0) {
            const tcCalculado = (movMonto / me).toFixed(2);
            setForm((s) => ({ ...s, tcManual: tcCalculado }));
          }
        }
      }
      setLookupMsg(msg);
      setLookupOk(Boolean(res.found));
      if (res.found && res.origen === 'COMPRA') {
        setForm((s) => ({ ...s, proveedorId: res.proveedorId ?? s.proveedorId }));
      }
      if (res.found && res.origen === 'VENTA') {
        setForm((s) => ({ ...s, clienteId: res.clienteId ?? s.clienteId }));
      }
    } catch (e) {
      setLookupOk(false);
      setLookupDoc(null);
      setLookupMsg(e instanceof Error ? e.message : 'No se pudo buscar el documento');
    }
  };

  const contabilizar = async (mov: MovimientoCartola) => {
    if (!form.cuentaContraId || !form.destinoTipo || !form.codigoFinancieroId) {
      toast.error('Completa contracuenta, destino y código financiero');
      return;
    }
    const dimErr = faltanDimensionesPlan(cuentaContra, form);
    if (dimErr) {
      toast.error(dimErr);
      return;
    }
    setBusyId(mov.id);
    try {
      const row = await api.contabilizarMovimientoCartola(mov.id, {
        cuentaContraId: form.cuentaContraId,
        destinoTipo: form.destinoTipo,
        codigoFinancieroId: form.codigoFinancieroId,
        tipoDocumento: form.tipoDocumento || undefined,
        folioDocumento: form.folioDocumento || undefined,
        proveedorId: form.proveedorId || undefined,
        clienteId: form.clienteId || undefined,
        centroCostoId: form.centroCostoId || undefined,
        areaNegocioId: form.areaNegocioId || undefined,
        elementoCostoId: form.elementoCostoId || undefined,
        nominaSemana:
          mov.tipo === 'EGRESO' && !selEgresos[mov.id]
            ? (form.nominaSemana || nominaDefaultWeek)
            : undefined,
        tcManual: form.tcManual ? Number(form.tcManual) : undefined,
      });
      await invalidateCartola(mov.cartolaId);
      toast.success(`Contabilizado ${mov.referencia} · asiento ${row.asientoNumero}`);
      setFormMovId(null);
      setForm(FORM_VACIO);
      setLookupMsg(null);
      setLookupDoc(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al contabilizar');
    } finally {
      setBusyId(null);
    }
  };

  const asociarNominaSel = async () => {
    const ids = Object.entries(selEgresos).filter(([, v]) => v).map(([id]) => id);
    if (!ids.length) {
      toast.error('Selecciona egresos');
      return;
    }
    const semana = (nominaLote.trim() || nominaDefaultWeek).trim();
    if (!semana) {
      toast.error('Indica la semana de nómina');
      return;
    }
    setBusyId('nomina');
    try {
      const res = await api.asociarNominaCartola({ ids, nominaSemana: semana });
      if (detalle) await invalidateCartola(detalle.id);
      setSelEgresos({});
      if (res.warning) toast.warning(res.warning);
      else toast.success(`Asociados ${res.asociados} egresos a ${res.nominaSemana}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asociar la nómina');
    } finally {
      setBusyId(null);
    }
  };

  const cerrarCartola = async () => {
    if (!detalle) return;
    setBusyId('cerrar');
    try {
      await api.cerrarCartolaBancaria(detalle.id);
      await invalidateCartola(detalle.id);
      toast.success('Cartola cerrada');
      setDetalle(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar la cartola');
    } finally {
      setBusyId(null);
    }
  };

  const pendientesCount = (movQ.data ?? []).filter((m) => m.estadoContable === 'PENDIENTE').length;
  const totalMovs = movQ.data?.length ?? 0;
  const contabilizadosCount = totalMovs - pendientesCount;

  const movimientosFiltrados = useMemo(() => {
    return (movQ.data ?? []).filter((m) => {
      if (filtroTipo !== 'TODOS' && m.tipo !== filtroTipo) return false;
      if (filtroFecha && m.fecha.slice(0, 10) !== filtroFecha) return false;
      if (filtroMonto && !String(m.monto).includes(filtroMonto.trim())) return false;
      if (filtroId) {
        const q = filtroId.trim().toLowerCase();
        if (!m.id.toLowerCase().includes(q) && !m.referencia.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [movQ.data, filtroTipo, filtroFecha, filtroMonto, filtroId]);

  const resetFiltrosDetalle = () => {
    setFiltroFecha('');
    setFiltroMonto('');
    setFiltroId('');
    setFiltroTipo('TODOS');
    setSelEgresos({});
    setNominaLote('');
    setFormMovId(null);
    setForm(FORM_VACIO);
    setLookupMsg(null);
    setLookupOk(false);
  };

  const openDetalle = (row: CartolaBancaria) => {
    resetFiltrosDetalle();
    setDetalle(row);
  };

  const runPreviewImport = async (file: File) => {
    setImportBusy(true);
    try {
      const preview = await api.previewCartolaArchivo(file);
      setImportFile(file);
      setImportPreview(preview);
      setImportMeta({
        periodo: preview.suggestedPeriodo || periodoDesdeCodigoYm(periodoHeader)?.periodo || '',
      });
      const hojas = preview.hojas ?? [];
      const def = hojasDefaultPorEmpresa(hojas, selectedEmpresa?.razonSocial);
      setHojasSel(def.length ? def : hojas.map((h) => h.nombre));
      setBancoPorHoja(
        Object.fromEntries(hojas.map((h) => [h.nombre, bancoSugeridoPorHoja(h.nombre)])),
      );
      setMonedaPorHoja(
        Object.fromEntries(hojas.map((h) => [h.nombre, monedaSugeridaPorHoja(h.nombre)])),
      );
      setBancoUnico(bancoDesdeDetectado(preview.bancoDetectado));
      setMonedaUnica(monedaSugeridaPorHoja(hojas[0]?.nombre ?? ''));
      setVistaHoja('TODAS');
      setImportOpen(true);
      if (!preview.lineas.length) toast.warning(preview.avisos.join(' ') || 'Sin movimientos');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al leer archivo');
    } finally {
      setImportBusy(false);
    }
  };

  const lineasImportVista = useMemo(() => {
    const all = importPreview?.lineas ?? [];
    if (!hojasSel.length || !(importPreview?.hojas?.length)) return all;
    const allow = new Set(hojasSel.map((h) => h.trim().toLowerCase()));
    return all.filter((l) => !l.hoja || allow.has(l.hoja.trim().toLowerCase()));
  }, [importPreview, hojasSel]);

  const conteoPorHojaVista = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lineasImportVista) {
      const n = (l.hoja ?? '').trim();
      if (!n) continue;
      map.set(n, (map.get(n) ?? 0) + 1);
    }
    return map;
  }, [lineasImportVista]);

  const vistaHojaActiva = hojasSel.includes(vistaHoja) ? vistaHoja : 'TODAS';

  const lineasImportTabla = useMemo(() => {
    if (vistaHojaActiva === 'TODAS') return lineasImportVista;
    const key = vistaHojaActiva.trim().toLowerCase();
    return lineasImportVista.filter((l) => (l.hoja ?? '').trim().toLowerCase() === key);
  }, [lineasImportVista, vistaHojaActiva]);

  const mesContableBanner = periodoDesdeCodigoYm(periodoHeader)?.mesContable ?? '';

  const confirmImport = async () => {
    if (!importFile) return;
    const mesContable = mesContableBanner;
    if (!mesContable) {
      toast.error('Selecciona un periodo contable en el banner');
      return;
    }
    if (!importMeta.periodo.trim()) {
      toast.error('Indica el periodo de la cartola');
      return;
    }
    const hojasArchivo = importPreview?.hojas ?? [];
    if (hojasArchivo.length && !hojasSel.length) {
      toast.error('Selecciona al menos una hoja del archivo');
      return;
    }
    const sinBanco = hojasSel.filter((n) => !bancoPorHoja[n]?.trim());
    if (sinBanco.length) {
      toast.error(`Indica el banco de: ${sinBanco.join(', ')}`);
      return;
    }
    setImportBusy(true);
    try {
      if (hojasArchivo.length) {
        for (const hoja of hojasSel) {
          await api.importCartolaArchivo(importFile, {
            banco: bancoPorHoja[hoja],
            periodo: importMeta.periodo,
            mesContable,
            hojas: [hoja],
            moneda: monedaPorHoja[hoja] ?? monedaSugeridaPorHoja(hoja),
          });
        }
        toast.success(
          `${hojasSel.length} cartola(s) · ${lineasImportVista.length} movimientos · mes ${mesContable}`,
        );
      } else {
        await api.importCartolaArchivo(importFile, {
          banco: bancoUnico,
          periodo: importMeta.periodo,
          mesContable,
          moneda: monedaUnica,
        });
        toast.success(`Cartola importada · ${lineasImportVista.length} movimientos`);
      }
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cartolas-bancarias') });
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      setHojasSel([]);
      setBancoPorHoja({});
      setMonedaPorHoja({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(saldosQ.data?.saldos ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Saldo por banco y moneda: se arma con aperturas y cartola contabilizada.
          </p>
        ) : (
          (saldosQ.data?.saldos ?? []).map((s) => (
            <div
              key={`${s.banco}-${s.moneda}`}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                {s.banco} · {s.moneda === 'CNY' ? 'Yuan (CNY)' : s.moneda}
              </div>
              <div className="font-semibold tabular-nums">{fmtMonedaNativa(s.saldo, s.moneda)}</div>
            </div>
          ))
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
        <div className="text-[var(--color-muted)]">
          Formatos: CSV/Excel (<code className="text-xs">fecha;glosa;monto</code> o headers) y PDF con texto seleccionable (heurística fecha+monto; no banco-específico).
        </div>
        <label className="inline-flex">
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls,.pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runPreviewImport(f);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={importBusy}
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector('input[type=file]') as HTMLInputElement | null;
              input?.click();
            }}
          >
            {importBusy ? 'Leyendo…' : 'Importar Excel/CSV/PDF'}
          </Button>
        </label>
      </div>
      <MockListPage<CartolaBancaria>
        title="Cartolas bancarias"
        subtitle="La única vía de carga es importar el archivo del banco (Excel, CSV o PDF)."
        breadcrumbs={['Tesorería']}
        queryKey="cartolas-bancarias"
        queryFn={api.getCartolasBancarias}
        initialSearch={initialSearch}
        searchPlaceholder="Buscar banco, referencia, archivo…"
        filterRows={filterRows}
        toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        filters={(
          <>
            <Select className="max-w-[160px]" value={banco} onChange={(e) => setBanco(e.target.value)}>
              <option value="TODOS">Todos los bancos</option>
              {BANCOS_CARTOLA.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
            <Select className="max-w-[120px]" value={monedaFiltro} onChange={(e) => setMonedaFiltro(e.target.value)}>
              <option value="TODOS">Moneda</option>
              {MONEDAS_CARTOLA.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
            <Select
              className="max-w-[150px]"
              value={mesContable}
              disabled={!periodoVista.todo}
              onChange={(e) => setMesContable(e.target.value)}
            >
              <option value="TODOS">Mes contable</option>
              {mesesContablesCercanos(periodoHeader).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
            <Select className="max-w-[120px]" value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="TODOS">Formato</option>
              <option value="EXCEL">Excel</option>
              <option value="PDF">PDF</option>
            </Select>
            <Select className="max-w-[160px]" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="TODOS">Todos los estados</option>
              <option value="CARGADA">Cargada</option>
              <option value="EN_CONCILIACION">En proceso</option>
              <option value="CERRADA">Cerrada</option>
            </Select>
          </>
        )}
        columns={[
          { key: 'fecha', header: 'Carga', cell: (r) => fmtDate(r.fechaCarga) },
          {
            key: 'banco',
            header: 'Banco',
            cell: (r) => (
              <span>
                {r.banco}
                {r.bancoCodigo ? (
                  <span className="ml-1 font-mono text-xs text-[var(--color-muted)]">{r.bancoCodigo}</span>
                ) : null}
              </span>
            ),
          },
          { key: 'moneda', header: 'Moneda', cell: (r) => labelMonedaCartola(r.moneda) },
          { key: 'mes', header: 'Mes contable', cell: (r) => r.mesContable ?? '—' },
          { key: 'periodo', header: 'Periodo', cell: (r) => r.periodo },
          { key: 'archivo', header: 'Archivo', cell: (r) => r.archivoNombre },
          { key: 'fmt', header: 'Fmt', cell: (r) => r.formato },
          { key: 'mov', header: 'Mov.', cell: (r) => r.movimientos, align: 'right' },
          {
            key: 'pend',
            header: 'Contabilizados',
            cell: (r) => {
              const total = r.movimientos ?? 0;
              const pend = r.pendientesContabilizar ?? 0;
              const done = Math.max(0, total - pend);
              return (
                <Badge tone={pend > 0 ? 'warning' : 'success'}>
                  {done} / {total}
                </Badge>
              );
            },
            align: 'right',
          },
          { key: 'monto', header: 'Total', cell: (r) => fmtMontoCartola(r.montoTotal, r.moneda), align: 'right' },
          { key: 'usr', header: 'Usuario', cell: (r) => r.usuarioCarga ?? '—' },
          {
            key: 'est',
            header: 'Estado',
            cell: (r) => (
              <Badge tone={r.estado === 'CERRADA' ? 'success' : r.estado === 'EN_CONCILIACION' ? 'warning' : 'muted'}>
                {ESTADO_LABEL[r.estado]}
              </Badge>
            ),
          },
          {
            key: 'acc',
            header: '',
            cell: (r) => (
              <span className="inline-flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  openDetalle(r);
                }}
              >
                Trabajar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  void api.deleteCartolaBancaria(r.id).then(
                    () => {
                      toast.success('Cartola eliminada');
                      void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cartolas-bancarias') });
                    },
                    (err: unknown) => toast.error(err instanceof Error ? err.message : 'No se pudo eliminar'),
                  );
                }}
              >
                Eliminar
              </Button>
              </span>
            ),
          },
        ]}
        onRowClick={(r) => openDetalle(r)}
      />

      <Modal
        open={detalle != null}
        onClose={() => {
          setDetalle(null);
          resetFiltrosDetalle();
        }}
        title={detalle ? `${detalle.banco} · ${detalle.periodo}` : 'Movimientos'}
        size="full"
        footer={(
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--color-muted)]">
              {totalMovs > 0
                ? `${contabilizadosCount} / ${totalMovs} contabilizados`
                : 'Sin movimientos'}
            </p>
            <div className="flex flex-wrap gap-2">
              {detalle && detalle.estado !== 'CERRADA' && (
                <Button
                  variant="outline"
                  disabled={busyId === 'cerrar' || !!pendientesCount}
                  onClick={() => void cerrarCartola()}
                >
                  {busyId === 'cerrar' ? 'Cerrando…' : 'Cerrar cartola'}
                </Button>
              )}
              <Button variant="ghost" onClick={() => { setDetalle(null); resetFiltrosDetalle(); }}>Cerrar</Button>
            </div>
          </div>
        )}
      >
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Contabiliza cada movimiento con contracuenta, destino y código financiero. Si no hay documento, elige Anticipo.
        </p>
        {!codigoOptions.length && detalle?.estado !== 'CERRADA' && (
          <p className="mb-3 text-sm text-[var(--color-warning)]">
            No hay códigos financieros activos. Cárgalos en Parametrización › Códigos financieros.
          </p>
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          <Select
            className="max-w-[160px]"
            value={filtroTipo}
            onChange={(e) => {
              const next = e.target.value as 'TODOS' | 'INGRESO' | 'EGRESO';
              setFiltroTipo(next);
              if (next !== 'EGRESO') {
                setSelEgresos({});
                setNominaLote('');
              } else {
                setNominaLote(nominaDefaultWeek);
              }
            }}
            aria-label="Filtrar ingresos o egresos"
            title="Ingresos o egresos"
          >
            <option value="TODOS">Todos</option>
            <option value="INGRESO">Ingresos</option>
            <option value="EGRESO">Egresos</option>
          </Select>
          <Input
            className="max-w-[140px]"
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            title="Filtrar fecha"
          />
          <Input
            className="max-w-[120px]"
            placeholder="Monto"
            value={filtroMonto}
            onChange={(e) => setFiltroMonto(e.target.value)}
          />
          <Input
            className="max-w-[160px]"
            placeholder="Id / referencia"
            value={filtroId}
            onChange={(e) => setFiltroId(e.target.value)}
          />
        </div>
        {filtroTipo === 'EGRESO' && (
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
            <p className="mr-1 min-w-[12rem] flex-1 text-sm text-[var(--color-muted)]">
              Marca egresos y asígnalos a una semana de nómina (pueden ser meses anteriores).
            </p>
            {Object.values(selEgresos).some(Boolean) && (
              <>
                <NominaSemanaSelects
                  idPrefix="cartola-lote"
                  value={nominaLote || nominaDefaultWeek}
                  years={nominaYears}
                  onChange={setNominaLote}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === 'nomina'}
                  onClick={() => void asociarNominaSel()}
                >
                  {busyId === 'nomina' ? 'Asociando…' : 'Asociar nómina'}
                </Button>
              </>
            )}
          </div>
        )}
        {movQ.isLoading && <p className="text-sm text-[var(--color-muted)]">Cargando…</p>}
        {!movQ.isLoading && (movQ.data?.length ?? 0) === 0 && (
          <p className="text-sm text-[var(--color-muted)]">Sin movimientos para esta cartola.</p>
        )}
        {!movQ.isLoading && (movQ.data?.length ?? 0) > 0 && movimientosFiltrados.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">Ningún movimiento coincide con el filtro.</p>
        )}
        <div className="max-h-[min(70vh,36rem)] space-y-2 overflow-auto">
          {movimientosFiltrados.map((m) => (
            <div
              key={m.id}
              className="rounded border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {filtroTipo === 'EGRESO' && m.tipo === 'EGRESO' && (
                      <Checkbox
                        className="mr-2 inline-flex align-middle"
                        checked={Boolean(selEgresos[m.id])}
                        onChange={(e) => {
                          const on = e.target.checked;
                          const nextSel = { ...selEgresos, [m.id]: on };
                          const habia = Object.values(selEgresos).some(Boolean);
                          const hay = Object.values(nextSel).some(Boolean);
                          setSelEgresos(nextSel);
                          if (hay && !habia) setNominaLote(nominaDefaultWeek);
                          if (!hay) setNominaLote('');
                        }}
                        aria-label={`Seleccionar egreso ${m.referencia}`}
                      />
                    )}
                    {fmtDate(m.fecha)} · <span className="font-mono text-xs">{m.referencia}</span>
                    {' · '}
                    <Badge tone={m.estadoContable === 'CONTABILIZADO' ? 'success' : 'warning'}>
                      {m.estadoContable === 'CONTABILIZADO' ? 'Contabilizado' : 'Pendiente'}
                    </Badge>
                    {' '}
                    <Badge tone="muted">{m.tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'}</Badge>
                    {m.destinoTipo ? (
                      <Badge tone="muted">{DESTINO_LABEL[m.destinoTipo] ?? m.destinoTipo}</Badge>
                    ) : null}
                    {m.pagoId ? <Badge tone="success">Calzado</Badge> : null}
                    {m.tipo === 'EGRESO' && m.nominaSemana ? (
                      <Badge tone="info">Nómina {m.nominaSemana}</Badge>
                    ) : null}
                  </div>
                  <div className="text-[var(--color-muted)]">{m.glosa}</div>
                  <div className="font-mono text-xs">
                    {fmtMontoCartola(m.monto, detalle?.moneda)}
                    {m.asientoNumero ? ` · Asiento ${m.asientoNumero}` : ''}
                    {m.codigoFinanciero ? ` · ${m.codigoFinanciero}` : ''}
                    {m.folioDocumento ? ` · Doc. ${m.folioDocumento}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.estadoContable === 'PENDIENTE' && detalle?.estado !== 'CERRADA' && (
                    <Button
                      size="sm"
                      variant={formMovId === m.id ? 'secondary' : 'primary'}
                      disabled={busyId === m.id}
                      onClick={() => (formMovId === m.id ? setFormMovId(null) : abrirForm(m))}
                    >
                      {formMovId === m.id ? 'Cancelar' : 'Contabilizar'}
                    </Button>
                  )}
                </div>
              </div>
              {formMovId === m.id && detalle?.estado !== 'CERRADA' && (
                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-3 sm:grid-cols-3">
                  <Field className="min-w-0" label="Contracuenta">
                    <SearchableSelect
                      value={form.cuentaContraId}
                      onChange={aplicarContracuenta}
                      options={cuentaOptions}
                      placeholder="Cuenta de contrapartida"
                    />
                  </Field>
                  <Field className="min-w-0" label="Código financiero">
                    <SearchableSelect
                      value={form.codigoFinancieroId}
                      onChange={(v) => setForm((s) => ({ ...s, codigoFinancieroId: v }))}
                      options={codigoOptions}
                      placeholder="Código financiero"
                      emptyLabel="Sin códigos activos"
                    />
                  </Field>
                  <Field className="min-w-0" label="Destino">
                    <Select
                      value={form.destinoTipo}
                      onChange={(e) => {
                        setForm((s) => ({ ...s, destinoTipo: e.target.value }));
                        setLookupMsg(null);
                        setLookupOk(false);
                      }}
                    >
                      <option value="">Seleccionar…</option>
                      {DESTINO_OPCIONES.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </Select>
                  </Field>
                  {(form.destinoTipo === 'FACTURA' || form.destinoTipo === 'ANTICIPO') && (
                    <>
                      <Field label="Tipo de documento">
                        <SearchableSelect
                          value={form.tipoDocumento}
                          onChange={(v) => setForm((s) => ({ ...s, tipoDocumento: v }))}
                          options={tipoDocOptions}
                          placeholder="Tipo de documento"
                        />
                      </Field>
                      <Field label="Número">
                        <div className="flex gap-2">
                          <Input
                            value={form.folioDocumento}
                            onChange={(e) => {
                              setForm((s) => ({ ...s, folioDocumento: e.target.value }));
                              setLookupOk(false);
                            }}
                            placeholder="Folio o factura"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void buscarDocumento(m)}
                          >
                            Buscar
                          </Button>
                        </div>
                      </Field>
                    </>
                  )}
                  {lookupMsg && (
                    <p className={`sm:col-span-3 text-sm ${lookupOk ? 'text-[var(--color-muted)]' : 'text-[var(--color-warning)]'}`}>
                      {lookupMsg}
                    </p>
                  )}
                  {lookupDoc?.found && lookupDoc.moneda && lookupDoc.moneda !== 'CLP' && (
                    <>
                      <Field label={`TC Aplicado (${lookupDoc.moneda})`}>
                        <Input
                          type="number"
                          step="0.01"
                          value={form.tcManual}
                          onChange={(e) => setForm((s) => ({ ...s, tcManual: e.target.value }))}
                          placeholder={lookupDoc.tipoCambio ? String(lookupDoc.tipoCambio) : '950.00'}
                        />
                      </Field>
                      {(() => {
                        const tcPago = Number(form.tcManual) || Number(lookupDoc.tipoCambio) || 1;
                        const tcDoc = Number(lookupDoc.tipoCambio) || 1;
                        const resDif = calcularDiferenciaTcClient({
                          monto: Math.abs(m.monto),
                          monedaDocumento: lookupDoc.moneda || 'CLP',
                          monedaPago: 'CLP',
                          tcDocumento: tcDoc,
                          tcPago,
                          sentido: m.tipo === 'INGRESO' ? 'COBRO' : 'PAGO',
                          montoMonedaExtranjera: lookupDoc.montoOtraMoneda ?? undefined,
                        });
                        if (!resDif.aplica || resDif.diferenciaTc === 0) return null;
                        return (
                          <div
                            className={`sm:col-span-3 text-xs p-2.5 rounded border ${
                              resDif.tipoResultado === 'GANANCIA'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            <span>{resDif.tipoResultado === 'GANANCIA' ? '✨' : '⚠️'} {resDif.glosa}</span>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {(form.destinoTipo === 'FACTURA' || form.destinoTipo === 'ANTICIPO') && (
                    m.tipo === 'INGRESO' ? (
                      <Field label="Cliente">
                        <SearchableSelect
                          value={form.clienteId}
                          onChange={(v) => setForm((s) => ({ ...s, clienteId: v, proveedorId: '' }))}
                          options={clienteOptions}
                          placeholder="Cliente"
                        />
                      </Field>
                    ) : (
                      <Field label="Proveedor">
                        <SearchableSelect
                          value={form.proveedorId}
                          onChange={(v) => setForm((s) => ({ ...s, proveedorId: v, clienteId: '' }))}
                          options={proveedorOptions}
                          placeholder="Proveedor"
                        />
                      </Field>
                    )
                  )}
                  {planSinConfig.length > 0 && (
                    <p className="sm:col-span-3 text-sm text-[var(--color-warning)]">
                      {planSinConfig.join(' ')}
                    </p>
                  )}
                  {cuentaContra?.requiereCc && (
                    <Field label="Centro de costo">
                      <SearchableSelect
                        value={form.centroCostoId}
                        onChange={(v) => setForm((s) => ({ ...s, centroCostoId: v }))}
                        options={centroOptions}
                        placeholder="Centro de costo"
                        emptyLabel="Esta cuenta no tiene centros ligados en el plan"
                      />
                    </Field>
                  )}
                  {cuentaContra?.requiereArea && (
                    <Field label="Área de negocio">
                      <SearchableSelect
                        value={form.areaNegocioId}
                        onChange={(v) => setForm((s) => ({ ...s, areaNegocioId: v }))}
                        options={areaOptions}
                        placeholder="Área de negocio"
                        emptyLabel="Esta cuenta no tiene áreas ligadas en el plan"
                      />
                    </Field>
                  )}
                  {cuentaContra?.requiereElemento && (
                    <Field label="Elemento de costo">
                      <SearchableSelect
                        value={form.elementoCostoId}
                        onChange={(v) => setForm((s) => ({ ...s, elementoCostoId: v }))}
                        options={elementoOptions}
                        placeholder="Elemento de costo"
                        emptyLabel="Esta cuenta no tiene elementos ligados en el plan"
                      />
                    </Field>
                  )}
                  {m.tipo === 'EGRESO' && !selEgresos[m.id] && (
                    <div className="sm:col-span-3 min-w-0">
                      <NominaSemanaSelects
                        idPrefix={`cartola-mov-${m.id}`}
                        value={form.nominaSemana || nominaDefaultWeek}
                        years={nominaYears}
                        onChange={(key) => setForm((s) => ({ ...s, nominaSemana: key }))}
                      />
                    </div>
                  )}
                  {m.tipo === 'EGRESO' && selEgresos[m.id] && (
                    <p className="sm:col-span-3 text-sm text-[var(--color-muted)]">
                      La semana de nómina se asigna arriba, en lote, a todos los egresos marcados.
                    </p>
                  )}
                  <div className="sm:col-span-3">
                    <Button
                      size="sm"
                      disabled={busyId === m.id || !codigoOptions.length || planSinConfig.length > 0}
                      onClick={() => void contabilizar(m)}
                    >
                      {busyId === m.id ? 'Contabilizando…' : 'Confirmar contabilización'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Preview importación cartola"
        size="full"
        className="self-start mt-4 sm:mt-6"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button
              disabled={importBusy || !lineasImportVista.length}
              onClick={() => void confirmImport()}
            >
              {importBusy ? 'Importando…' : `Importar ${lineasImportVista.length} movs`}
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex min-w-0 items-center gap-2">
            <span className="w-[6.75rem] shrink-0 text-xs font-medium text-[var(--color-muted)]">Empresa actual</span>
            <Input
              className="min-w-0 truncate"
              value={selectedEmpresa?.razonSocial ?? '—'}
              title={selectedEmpresa?.razonSocial ?? undefined}
              readOnly
              disabled
            />
          </label>
          <label className="flex min-w-0 items-center gap-2">
            <span className="w-[6.75rem] shrink-0 text-xs font-medium text-[var(--color-muted)]">Periodo</span>
            <Input
              className="min-w-0"
              value={importMeta.periodo}
              onChange={(e) => setImportMeta((s) => ({ ...s, periodo: e.target.value }))}
            />
          </label>
          <label className="flex min-w-0 items-center gap-2">
            <span className="w-[6.75rem] shrink-0 text-xs font-medium text-[var(--color-muted)]">Mes contable</span>
            <Input className="min-w-0" value={mesContableBanner || '—'} readOnly disabled />
          </label>
        </div>
        {!(importPreview?.hojas?.length) && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 items-center gap-2">
              <span className="w-[6.75rem] shrink-0 text-xs font-medium text-[var(--color-muted)]">Banco</span>
              <Select
                className="min-w-0"
                value={bancoUnico}
                onChange={(e) => setBancoUnico(e.target.value)}
              >
                {BANCOS_CARTOLA.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </label>
            <label className="flex min-w-0 items-center gap-2">
              <span className="w-[6.75rem] shrink-0 text-xs font-medium text-[var(--color-muted)]">Moneda</span>
              <Select
                className="min-w-0"
                value={monedaUnica}
                onChange={(e) => setMonedaUnica(e.target.value)}
              >
                {MONEDAS_CARTOLA.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </label>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {importPreview?.formatoEsperado}
          {importPreview?.avisos?.length ? ` · ${importPreview.avisos.join(' · ')}` : ''}
        </p>
        {(importPreview?.hojas?.length ?? 0) > 0 && (
          <div className="mt-3 rounded border border-[var(--color-border)] p-3">
            <p className="mb-2 text-center text-sm font-medium">Hojas a importar</p>
            <p className="mb-3 text-center text-xs text-[var(--color-muted)]">
              Elige banco y moneda de cada hoja. Se crea una cartola por hoja.
              En Export se marcan ALMAHUE*; en Services, ALM.
            </p>
            <div className="flex flex-col items-center gap-2">
              {importPreview!.hojas!.map((h) => {
                const checked = hojasSel.includes(h.nombre);
                return (
                  <div key={h.nombre} className="flex flex-wrap items-center justify-center gap-3 text-sm">
                    <label className="inline-flex w-[14rem] items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setHojasSel((prev) => (
                            checked ? prev.filter((n) => n !== h.nombre) : [...prev, h.nombre]
                          ));
                        }}
                      />
                      <span>{h.nombre}</span>
                      <span className="text-xs text-[var(--color-muted)]">{h.movimientos} mov.</span>
                    </label>
                    <Select
                      className="w-[11rem]"
                      value={bancoPorHoja[h.nombre] ?? 'Banco Chile'}
                      disabled={!checked}
                      onChange={(e) => {
                        setBancoPorHoja((prev) => ({ ...prev, [h.nombre]: e.target.value }));
                      }}
                      aria-label={`Banco de ${h.nombre}`}
                    >
                      {BANCOS_CARTOLA.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </Select>
                    <Select
                      className="w-[7.5rem]"
                      value={monedaPorHoja[h.nombre] ?? monedaSugeridaPorHoja(h.nombre)}
                      disabled={!checked}
                      onChange={(e) => {
                        setMonedaPorHoja((prev) => ({ ...prev, [h.nombre]: e.target.value }));
                      }}
                      aria-label={`Moneda de ${h.nombre}`}
                    >
                      {MONEDAS_CARTOLA.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(importPreview?.hojas?.length ?? 0) > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-[var(--color-muted)]">
              Filtro de la lista (no cambia lo que se importa). Se importarán {lineasImportVista.length} movs.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={vistaHojaActiva === 'TODAS' ? 'primary' : 'outline'}
                onClick={() => setVistaHoja('TODAS')}
              >
                Todas · {lineasImportVista.length}
              </Button>
              {(importPreview?.hojas ?? [])
                .filter((h) => hojasSel.includes(h.nombre))
                .map((h) => {
                const n = conteoPorHojaVista.get(h.nombre) ?? h.movimientos;
                return (
                  <Button
                    key={h.nombre}
                    type="button"
                    size="sm"
                    variant={vistaHojaActiva === h.nombre ? 'primary' : 'outline'}
                    onClick={() => setVistaHoja(h.nombre)}
                  >
                    {h.nombre} · {n}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-3 max-h-[min(42vh,28rem)] overflow-auto rounded border border-[var(--color-border)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                <th className="px-2 py-1">Fecha</th>
                <th className="px-2 py-1">Glosa</th>
                <th className="px-2 py-1">Tipo</th>
                <th className="px-2 py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {lineasImportTabla.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-[var(--color-muted)]">
                    Sin movimientos en este filtro
                  </td>
                </tr>
              ) : lineasImportTabla.map((l, i) => (
                <tr key={`${l.referencia}-${i}`} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1">{l.fecha}</td>
                  <td className="px-2 py-1">{l.glosa}</td>
                  <td className="px-2 py-1">{l.tipo}</td>
                  <td className="px-2 py-1 text-right">{fmtMontoCartola(l.monto, monedaPorHoja[l.hoja ?? ''] ?? monedaSugeridaPorHoja(l.hoja ?? ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
