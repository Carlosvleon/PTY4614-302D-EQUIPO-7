import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useQueryScope,
  useEmpresaScopeId,
  usePeriodoScopeCodigo,
  listQueryKey,
  periodListQueryKey,
} from '@/hooks/useQueryScope';
import { PageHeader } from '@/components/common/PageHeader';
import { EstadoAsientoBadge } from '@/components/common/Badges';
import { DataTable } from '@/components/common/DataTable';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Modal } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { AreaNegocio, Asiento, CentroCosto, CuentaContable, ElementoCosto, EstadoAsiento, IndicadorBc } from '@/types/domain';
import * as api from '@/services/api';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';

const MONEDAS_ASIENTO = ['CLP', 'USD', 'EUR', 'CNY'];

type LineaDraft = {
  key: string;
  cuentaId: string;
  debe: string;
  haber: string;
  glosa: string;
  centroCostoId: string;
  areaNegocioId: string;
  elementoCostoId: string;
  moneda: string;
  tipoCambio: string;
};

function emptyLine(): LineaDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cuentaId: '',
    debe: '',
    haber: '',
    glosa: '',
    centroCostoId: '',
    areaNegocioId: '',
    elementoCostoId: '',
    moneda: 'CLP',
    tipoCambio: '',
  };
}

export function AsientosPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const periodoGlobal = usePeriodoScopeCodigo();
  const periodoVista = usePeriodoVista();
  const qKey = periodListQueryKey(scope, empresaId, periodoGlobal, 'asientos');

  const asientosQ = useQuery({ queryKey: qKey, queryFn: api.getAsientos });
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const centrosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const areasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'areas-negocio'),
    queryFn: api.getAreasNegocio,
  });
  const elementosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'elementos-costo'),
    queryFn: api.getElementosCosto,
  });
  const indicadoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'indicadores-bc-recientes'),
    queryFn: () => api.getIndicadoresBc(),
  });

  const cuentaOptions = useMemo(() => {
    const flat = (cuentasQ.data ?? []) as CuentaContable[];
    return flat
      .filter((c) => c.activa && !c.noImputable)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [cuentasQ.data]);

  const centroCostoOptions = useMemo(() => {
    const flat = (centrosQ.data ?? []) as CentroCosto[];
    return flat.filter((c) => c.activa).map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [centrosQ.data]);

  const areaOptions = useMemo(() => {
    const flat = (areasQ.data ?? []) as AreaNegocio[];
    return flat.filter((c) => c.activa).map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [areasQ.data]);

  const elementoOptions = useMemo(() => {
    const flat = (elementosQ.data ?? []) as ElementoCosto[];
    return flat.filter((c) => c.vigencia !== 'ANULADO').map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [elementosQ.data]);

  const tcDelDia = useMemo(() => {
    const rows = (indicadoresQ.data ?? []) as IndicadorBc[];
    const byFecha = new Map(rows.map((r) => [r.fecha.slice(0, 10), r]));
    return (fechaAsiento: string, moneda: string): number | undefined => {
      const row = byFecha.get(fechaAsiento);
      if (!row) return undefined;
      if (moneda === 'USD') return row.usd;
      if (moneda === 'EUR') return row.eur;
      if (moneda === 'CNY') return row.cny;
      return undefined;
    };
  }, [indicadoresQ.data]);

  const defaultPeriodo = periodoGlobal;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState(
    'numero;periodo;fecha;tipo;glosa;cuentaDebe;debe;cuentaHaber;haber\n;2026-07;2026-07-28;MANUAL;Asiento prueba;1-1-01-01;1000;2-1-01-01;1000',
  );
  const [bulkPreview, setBulkPreview] = useState<Array<{
    ok: boolean;
    message: string;
    payload?: Parameters<typeof api.createAsiento>[0];
  }>>([]);
  const [numero, setNumero] = useState('');
  const [periodo, setPeriodo] = useState(defaultPeriodo);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState('MANUAL');
  const [estado, setEstado] = useState<EstadoAsiento>('BORRADOR');
  const [originalEstado, setOriginalEstado] = useState<EstadoAsiento | null>(null);
  const [glosa, setGlosa] = useState('');
  const [lineas, setLineas] = useState<LineaDraft[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [detalle, setDetalle] = useState<Asiento | null>(null);

  // Header periodo/empresa: actualizar default del formulario si no hay edición abierta.
  useEffect(() => {
    if (!open && !editingId) setPeriodo(defaultPeriodo);
  }, [defaultPeriodo, empresaId, open, editingId]);

  // P0-2: un asiento CONTABILIZADO no se edita in-place; solo se puede
  // anular (el backend genera el reverso formal automáticamente).
  const bloqueadoPorContabilizado = Boolean(editingId) && originalEstado === 'CONTABILIZADO';

  const totDebe = lineas.reduce((a, l) => a + (Number(l.debe) || 0), 0);
  const totHaber = lineas.reduce((a, l) => a + (Number(l.haber) || 0), 0);
  const cuadrado = Math.round(totDebe * 100) === Math.round(totHaber * 100) && totDebe > 0;

  const resetForm = () => {
    setEditingId(null);
    setNumero('');
    setPeriodo(defaultPeriodo);
    setFecha(new Date().toISOString().slice(0, 10));
    setTipo('MANUAL');
    setEstado('BORRADOR');
    setOriginalEstado(null);
    setGlosa('');
    setLineas([emptyLine(), emptyLine()]);
  };

  const openEdit = (row: Asiento) => {
    setEditingId(row.id);
    setNumero(row.numero);
    setPeriodo(row.periodo ?? defaultPeriodo);
    setFecha(row.fecha);
    setTipo(row.tipo ?? 'MANUAL');
    setEstado(row.estado);
    setOriginalEstado(row.estado);
    setGlosa(row.glosa);
    const ls = (row.lineas ?? []).map((l) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cuentaId: l.cuentaId ?? '',
      debe: String(l.debe || ''),
      haber: String(l.haber || ''),
      glosa: l.glosa ?? '',
      centroCostoId: l.centroCostoId ?? '',
      areaNegocioId: (l as { areaNegocioId?: string }).areaNegocioId ?? '',
      elementoCostoId: (l as { elementoCostoId?: string }).elementoCostoId ?? '',
      moneda: l.moneda ?? 'CLP',
      tipoCambio: l.tipoCambio != null ? String(l.tipoCambio) : '',
    }));
    setLineas(ls.length >= 2 ? ls : [emptyLine(), emptyLine()]);
    setOpen(true);
  };

  const save = async (forceAnular = false) => {
    if (cuentasQ.isError || centrosQ.isError || areasQ.isError || elementosQ.isError) {
      toast.error('No se puede guardar el asiento porque falló la carga de cuentas o dimensiones.');
      return;
    }
    if (bloqueadoPorContabilizado && estado !== 'ANULADO') {
      toast.error(
        'El asiento ya está contabilizado: no se puede editar. Anúlalo (genera reverso formal) o crea un asiento de ajuste nuevo.',
      );
      return;
    }
    if (!glosa.trim()) {
      toast.error('Glosa obligatoria');
      return;
    }
    const cuentas = (cuentasQ.data ?? []) as CuentaContable[];
    for (const l of lineas.filter((x) => x.cuentaId && (Number(x.debe) || Number(x.haber)))) {
      const cta = cuentas.find((c) => c.id === l.cuentaId);
      if (cta?.requiereArea && !l.areaNegocioId) {
        toast.error(`La cuenta ${cta.codigo} exige área de negocio`);
        return;
      }
      if (cta?.requiereElemento && !l.elementoCostoId) {
        toast.error(`La cuenta ${cta.codigo} exige elemento de costo`);
        return;
      }
      if (cta?.requiereCc && !l.centroCostoId) {
        toast.error(`La cuenta ${cta.codigo} exige centro de costo`);
        return;
      }
    }
    if (!cuadrado) {
      toast.error(`Asiento descuadrado: debe=${totDebe} haber=${totHaber}`);
      return;
    }
    const lineasConMoneda = lineas.filter((l) => l.cuentaId && l.moneda !== 'CLP');
    const lineasSinTc = lineasConMoneda.filter((l) => !l.tipoCambio && tcDelDia(fecha, l.moneda) == null);
    if (lineasSinTc.length > 0) {
      toast.warning(
        `Falta tipo de cambio del día para ${[...new Set(lineasSinTc.map((l) => l.moneda))].join(', ')}. Se guardará sin TC; complétalo luego en Indicadores Banco Central.`,
      );
    }
    const payloadLineas = lineas
      .filter((l) => l.cuentaId && (Number(l.debe) || Number(l.haber)))
      .map((l) => ({
        cuentaId: l.cuentaId,
        debe: Number(l.debe) || 0,
        haber: Number(l.haber) || 0,
        glosa: l.glosa || undefined,
        centroCostoId: l.centroCostoId || undefined,
        areaNegocioId: l.areaNegocioId || undefined,
        elementoCostoId: l.elementoCostoId || undefined,
        moneda: l.moneda !== 'CLP' ? l.moneda : undefined,
        tipoCambio: l.moneda !== 'CLP'
          ? Number(l.tipoCambio) || tcDelDia(fecha, l.moneda) || undefined
          : undefined,
      }));
    if (payloadLineas.length < 2) {
      toast.error('Se requieren al menos 2 líneas con cuenta');
      return;
    }
    if (editingId && estado === 'ANULADO' && !forceAnular) {
      setConfirmAnular(true);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        numero: numero.trim() || undefined,
        periodo: periodo.trim() || undefined,
        fecha,
        tipo,
        estado,
        glosa: glosa.trim(),
        origen: 'Manual',
        lineas: payloadLineas,
      };
      if (editingId) await api.updateAsiento(editingId, payload);
      else await api.createAsiento(payload);
      toast.success(
        estado === 'ANULADO'
          ? 'Comprobante anulado'
          : editingId
            ? 'Comprobante actualizado'
            : 'Comprobante guardado',
      );
      setConfirmAnular(false);
      setOpen(false);
      resetForm();
      await qc.invalidateQueries({ queryKey: qKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const analizarBulk = () => {
    const byCodigo = new Map(
      ((cuentasQ.data ?? []) as CuentaContable[]).map((c) => [c.codigo, c.id]),
    );
    const lines = bulkText.trim().split(/\r?\n/).filter(Boolean);
    const dataLines = lines[0]?.toLowerCase().includes('glosa') ? lines.slice(1) : lines;
    const preview = dataLines.map((line) => {
      const p = line.split(/[;,\t]/).map((x) => x.trim());
      const cuentaDebe = byCodigo.get(p[5] || '');
      const cuentaHaber = byCodigo.get(p[7] || '');
      const debe = Number(p[6] || 0);
      const haber = Number(p[8] || 0);
      if (!cuentaDebe || !cuentaHaber) {
        return { ok: false, message: `Cuentas no encontradas: ${p[5]} / ${p[7]}` };
      }
      if (Math.round(debe * 100) !== Math.round(haber * 100) || debe <= 0) {
        return { ok: false, message: `Descuadrado ${p[4] || '(sin glosa)'}: ${debe}/${haber}` };
      }
      return {
        ok: true,
        message: `${p[4] || 'Asiento'} · ${debe}`,
        payload: {
          numero: p[0] || undefined,
          periodo: p[1] || defaultPeriodo,
          fecha: p[2] || new Date().toISOString().slice(0, 10),
          tipo: p[3] || 'MANUAL',
          glosa: p[4] || 'Carga masiva',
          estado: 'BORRADOR' as const,
          origen: 'Carga masiva',
          lineas: [
            { cuentaId: cuentaDebe, debe, haber: 0 },
            { cuentaId: cuentaHaber, debe: 0, haber },
          ],
        },
      };
    });
    setBulkPreview(preview);
    toast.message(`Analizados ${preview.length}: ${preview.filter((x) => x.ok).length} OK`);
  };

  const confirmBulk = async () => {
    const items = bulkPreview.filter((x) => x.ok && x.payload).map((x) => x.payload!);
    if (!items.length) {
      toast.error('Nada válido para importar — ejecuta Analizar primero');
      return;
    }
    setSaving(true);
    try {
      const res = await api.bulkAsientos({ items });
      toast.success(`Creados ${res.created}${res.errors.length ? ` · errores ${res.errors.length}` : ''}`);
      setBulkOpen(false);
      await qc.invalidateQueries({ queryKey: qKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const rows = periodoVista.filter((asientosQ.data ?? []) as Asiento[], (r) => r.periodo || r.fecha);
  const catalogosError = cuentasQ.error || centrosQ.error || areasQ.error || elementosQ.error;

  return (
    <div>
      <PageHeader
        title="Asientos / comprobantes"
        breadcrumbs={['Contabilidad', 'Operaciones']}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={Boolean(catalogosError)}
              leftIcon={<Upload size={16} />}
              onClick={() => {
                setBulkPreview([]);
                setBulkOpen(true);
              }}
            >
              Carga masiva
            </Button>
            <Button
              leftIcon={<Plus size={16} />}
              disabled={Boolean(catalogosError)}
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
            >
              Nuevo comprobante
            </Button>
          </div>
        }
      />
      <QueryErrorAlert
        error={asientosQ.error || catalogosError}
        isLoading={asientosQ.isLoading || cuentasQ.isLoading || centrosQ.isLoading || areasQ.isLoading || elementosQ.isLoading}
        resource="los asientos, cuentas y dimensiones contables"
        onRetry={() => {
          void asientosQ.refetch();
          void cuentasQ.refetch();
          void centrosQ.refetch();
          void areasQ.refetch();
          void elementosQ.refetch();
        }}
        className="mb-4"
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap gap-4 text-sm text-[var(--color-muted)]">
          <span>Periodo UI: <strong className="text-[var(--color-text)]">{defaultPeriodo}</strong></span>
          <span>Cuentas imputables: <strong className="text-[var(--color-text)]">{cuentaOptions.length}</strong></span>
          <span>Asientos: <strong className="text-[var(--color-text)]">{rows.length}</strong></span>
        </CardBody>
      </Card>

      {!asientosQ.error && <DataTable
        tableKey="contabilidad.asientos"
        enableExport
        exportFilename="asientos"
        pagination={{ storageKey: 'erp-asientos', defaultSize: 15 }}
        empty={asientosQ.isLoading ? 'Cargando…' : periodoVista.empty('asientos')}
        toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        rows={rows}
        columns={[
          { key: 'numero', header: 'N°', cell: (r) => <span className="font-mono text-xs">{r.numero}</span> },
          { key: 'periodo', header: 'Periodo', cell: (r) => r.periodo ?? '—' },
          { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
          { key: 'tipo', header: 'Tipo', cell: (r) => r.tipo ?? 'MANUAL' },
          { key: 'glosa', header: 'Glosa', cell: (r) => r.glosa },
          { key: 'debe', header: 'Debe', cell: (r) => fmtCLP(r.debe), align: 'right' },
          { key: 'haber', header: 'Haber', cell: (r) => fmtCLP(r.haber), align: 'right' },
          { key: 'estado', header: 'Estado', cell: (r) => <EstadoAsientoBadge estado={r.estado} /> },
          {
            key: '_act',
            header: '',
            sortable: false,
            filterable: false,
            hideable: false,
            cell: (r) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" onClick={() => setDetalle(r)}>Ver</Button>
                <Button size="sm" variant="ghost" disabled={r.estado === 'ANULADO'} onClick={() => openEdit(r)}>
                  Editar
                </Button>
              </span>
            ),
          },
        ]}
        onRowClick={(r) => setDetalle(r)}
      />}

      <Modal
        open={detalle != null}
        onClose={() => setDetalle(null)}
        title={detalle ? `Asiento ${detalle.numero}` : 'Detalle'}
        size="xl"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button>
            {detalle && detalle.estado !== 'ANULADO' && (
              <Button size="sm" onClick={() => { openEdit(detalle); setDetalle(null); }}>Editar</Button>
            )}
          </div>
        )}
      >
        {detalle && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-[var(--color-muted)]">Periodo</dt><dd>{detalle.periodo ?? '—'}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Fecha</dt><dd>{fmtDate(detalle.fecha)}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Tipo</dt><dd>{detalle.tipo ?? 'MANUAL'}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Estado</dt><dd><EstadoAsientoBadge estado={detalle.estado} /></dd></div>
              <div className="col-span-2"><dt className="text-[var(--color-muted)]">Glosa</dt><dd>{detalle.glosa}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Debe</dt><dd className="font-mono font-semibold">{fmtCLP(detalle.debe)}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Haber</dt><dd className="font-mono font-semibold">{fmtCLP(detalle.haber)}</dd></div>
            </dl>
            {detalle.lineas && detalle.lineas.length > 0 && (
              <div className="overflow-x-auto rounded border border-[var(--color-border)]">
                <div className={detalle.lineas.length > 5 ? 'max-h-[16.5rem] overflow-y-auto' : undefined}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
                      <tr>
                        <th className="p-2">Cuenta</th>
                        <th className="p-2">Glosa</th>
                        <th className="p-2 text-right">Debe</th>
                        <th className="p-2 text-right">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.lineas.map((l, i) => {
                        const cta = (cuentasQ.data ?? []).find((c) => c.id === l.cuentaId);
                        return (
                          <tr key={`${detalle.id}-l-${i}`} className="border-t border-[var(--color-border)]">
                            <td className="p-2 font-mono text-xs">{cta ? `${cta.codigo} · ${cta.nombre}` : ((l as { cuentaNombre?: string }).cuentaNombre ?? l.cuentaId ?? '—')}</td>
                            <td className="p-2">{l.glosa ?? '—'}</td>
                            <td className="p-2 text-right font-mono">{fmtCLP(l.debe)}</td>
                            <td className="p-2 text-right font-mono">{fmtCLP(l.haber)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Editar comprobante' : 'Nuevo comprobante'}
        size="full"
        footerClassName="flex-wrap justify-between gap-3 sm:flex-nowrap"
        footer={
          <>
            <div
              className={`mx-auto flex min-w-[16rem] flex-1 flex-col items-center rounded-lg border px-4 py-2 text-center sm:mx-0 sm:max-w-md ${
                cuadrado
                  ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Cuadre del asiento</span>
              <span className="text-base font-bold tabular-nums sm:text-lg">
                Debe {fmtCLP(totDebe)} · Haber {fmtCLP(totHaber)}
              </span>
              <span className="text-xs font-semibold uppercase">
                {cuadrado ? 'Cuadrado' : 'Descuadrado'}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button disabled={saving || !cuadrado || Boolean(catalogosError)} onClick={() => void save()}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </>
        }
      >
        {bloqueadoPorContabilizado && (
          <p className="mb-3 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
            Este comprobante ya está contabilizado: los montos y cuentas no se pueden editar.
            Solo puedes anularlo (se genera automáticamente el asiento de reverso formal) o crear un asiento de ajuste nuevo.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Número">
            <Input className="font-mono" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Auto" disabled={bloqueadoPorContabilizado} />
          </Field>
          <Field label="Periodo">
            <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-07" disabled={bloqueadoPorContabilizado} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={bloqueadoPorContabilizado} />
          </Field>
          <Field label="Tipo">
            <select
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm disabled:opacity-60"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={bloqueadoPorContabilizado}
            >
              {['MANUAL', 'DIARIO', 'AJUSTE', 'APERTURA', 'CIERRE'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoAsiento)}
            >
              {bloqueadoPorContabilizado ? (
                <>
                  <option value="CONTABILIZADO">Contabilizado</option>
                  <option value="ANULADO">Anulado (genera reverso formal)</option>
                </>
              ) : (
                <>
                  <option value="BORRADOR">Pendiente</option>
                  <option value="CONTABILIZADO">Contabilizado</option>
                  <option value="ANULADO">Anulado</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Glosa">
            <Input value={glosa} onChange={(e) => setGlosa(e.target.value)} placeholder="Descripción del asiento" disabled={bloqueadoPorContabilizado} />
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Líneas</h4>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus size={14} />}
              disabled={bloqueadoPorContabilizado}
              onClick={() => setLineas((p) => [...p, emptyLine()])}
            >
              Agregar línea
            </Button>
          </div>
          <div className={`space-y-2 ${lineas.length > 5 ? 'max-h-[22rem] overflow-y-auto pr-1' : ''}`}>
            {lineas.map((l, idx) => {
              const tcAuto = l.moneda !== 'CLP' ? tcDelDia(fecha, l.moneda) : undefined;
              const cta = ((cuentasQ.data ?? []) as CuentaContable[]).find((c) => c.id === l.cuentaId);
              return (
                <div key={l.key} className="space-y-1.5 rounded-lg border border-[var(--color-border)] p-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_1fr_auto]">
                    <SearchableSelect
                      value={l.cuentaId}
                      onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, cuentaId: v } : x)))}
                      options={cuentaOptions.length ? cuentaOptions : [{ value: '', label: cuentasQ.isLoading ? 'Cargando…' : 'Sin cuentas imputables' }]}
                      placeholder="Buscar cuenta…"
                      disabled={bloqueadoPorContabilizado}
                    />
                    <MontoInput
                      kind="monto"
                      placeholder="Debe"
                      value={l.debe === '' ? null : Number(l.debe)}
                      onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, debe: v == null ? '' : String(v) } : x)))}
                      disabled={bloqueadoPorContabilizado}
                    />
                    <MontoInput
                      kind="monto"
                      placeholder="Haber"
                      value={l.haber === '' ? null : Number(l.haber)}
                      onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, haber: v == null ? '' : String(v) } : x)))}
                      disabled={bloqueadoPorContabilizado}
                    />
                    <Input
                      placeholder="Glosa línea"
                      value={l.glosa}
                      onChange={(e) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, glosa: e.target.value } : x)))}
                      disabled={bloqueadoPorContabilizado}
                    />
                    <button
                      type="button"
                      className="rounded p-2 text-[var(--color-danger)] hover:bg-[var(--color-brand-soft)] disabled:opacity-40"
                      disabled={lineas.length <= 2 || bloqueadoPorContabilizado}
                      onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                      title="Quitar línea"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_90px_120px]">
                    <SearchableSelect
                      value={l.centroCostoId}
                      onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, centroCostoId: v } : x)))}
                      options={(() => {
                        const cta = ((cuentasQ.data ?? []) as CuentaContable[]).find((c) => c.id === l.cuentaId);
                        const allowed = cta?.centroCostoIds ?? [];
                        if (cta?.requiereCc && allowed.length) {
                          return centroCostoOptions.filter((o) => allowed.includes(o.value));
                        }
                        return centroCostoOptions;
                      })()}
                      placeholder={cta?.requiereCc ? 'Centro de costo (obligatorio)' : 'Centro de costo (opcional)'}
                      disabled={bloqueadoPorContabilizado}
                    />
                    {cta?.requiereArea ? (
                      <SearchableSelect
                        value={l.areaNegocioId}
                        onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, areaNegocioId: v } : x)))}
                        options={(() => {
                          const allowed = cta.areaNegocioIds ?? [];
                          if (allowed.length) return areaOptions.filter((o) => allowed.includes(o.value));
                          return areaOptions;
                        })()}
                        placeholder="Área de negocio (obligatorio)"
                        disabled={bloqueadoPorContabilizado}
                      />
                    ) : null}
                    {cta?.requiereElemento ? (
                      <SearchableSelect
                        value={l.elementoCostoId}
                        onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, elementoCostoId: v } : x)))}
                        options={(() => {
                          const allowed = cta.elementoCostoIds ?? [];
                          if (allowed.length) return elementoOptions.filter((o) => allowed.includes(o.value));
                          return elementoOptions;
                        })()}
                        placeholder="Elemento de costo (obligatorio)"
                        disabled={bloqueadoPorContabilizado}
                      />
                    ) : null}
                    <select
                      className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs disabled:opacity-60"
                      value={l.moneda}
                      onChange={(e) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, moneda: e.target.value } : x)))}
                      title="Moneda de la línea"
                      disabled={bloqueadoPorContabilizado}
                    >
                      {MONEDAS_ASIENTO.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    {l.moneda !== 'CLP' && (
                      <MontoInput
                        kind="tc"
                        placeholder={tcAuto ? `TC día: ${tcAuto}` : 'TC del día'}
                        value={l.tipoCambio === '' ? null : Number(l.tipoCambio)}
                        onChange={(v) => setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, tipoCambio: v == null ? '' : String(v) } : x)))}
                        disabled={bloqueadoPorContabilizado}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Carga masiva de asientos"
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={analizarBulk}>Analizar</Button>
            <Button disabled={saving || !bulkPreview.some((x) => x.ok)} onClick={() => void confirmBulk()}>
              {saving ? 'Importando…' : `Confirmar (${bulkPreview.filter((x) => x.ok).length})`}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          CSV: numero;periodo;fecha;tipo;glosa;cuentaDebe;debe;cuentaHaber;haber (códigos UI del plan).
        </p>
        <textarea
          className="mb-3 h-36 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-xs"
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        {bulkPreview.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {bulkPreview.map((r, i) => (
              <li key={i} className={r.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
                #{i + 1}: {r.message}
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <Modal
        open={confirmAnular}
        onClose={() => setConfirmAnular(false)}
        title="Anular comprobante"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmAnular(false)}>Cancelar</Button>
            <Button
              disabled={saving}
              onClick={() => {
                setConfirmAnular(false);
                void save(true);
              }}
            >
              Sí, anular
            </Button>
          </>
        )}
      >
        <p className="text-sm">
          Vas a marcar el asiento <strong className="font-mono">{numero || editingId}</strong> como ANULADO.
          Esta acción debe usarse solo para corrección contable.
        </p>
      </Modal>
    </div>
  );
}
