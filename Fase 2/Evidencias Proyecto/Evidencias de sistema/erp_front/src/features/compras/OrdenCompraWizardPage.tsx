import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, ChevronRight, FileText, Globe, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { CollapsibleRightPanel } from '@/components/common/CollapsibleRightPanel';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn, fmtCLP } from '@/lib/utils';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import type { DistribucionCentroCosto, OrdenCompra, Proveedor } from '@/types/domain';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { EMPTY_ARRAY } from '@/lib/empty';
import * as api from '@/services/api';
import { cuentasParaImputar } from '@/lib/cuentasImputacion';
import { ApprovalChainFlow } from '@/components/aprobaciones/ApprovalChainVisual';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import {
  buildItemLineas,
  distribucionFromItems,
  emptyItem,
  emptyOcForm,
  formFromOc,
  cuentaPrincipalDesdeItems,
  itemsSinCentroCosto,
  itemsSinCuentaContable,
  ocCadenaPreviewCopy,
  ocCadenaBloqueaEmision,
  ocPuedeEditar,
  ocDepartamentoDesdeGrupo,
  ocSolicitanteDesdeSesion,
  OC_ESTADO_EN_CADENA,
  type ItemLine,
  ocTipoCambioSugerido,
  ocEquivalenteClp,
  fmtMontoMoneda,
} from '@/features/compras/compras-oc-helpers';

const EMPTY_OC = EMPTY_ARRAY as OrdenCompra[];

function ProveedorPanel({
  proveedor,
  cargando,
}: {
  proveedor?: { razonSocial: string; rut: string };
  cargando: boolean;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Datos del proveedor</h3>
      {!proveedor ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {cargando ? 'Cargando…' : 'Selecciona un proveedor en el paso 1.'}
        </p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">Razón social</dt>
            <dd>{proveedor.razonSocial}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">RUT</dt>
            <dd className="font-mono">{proveedor.rut || '—'}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const STEPS = [
  { id: 1, label: '1. Datos generales y proveedor' },
  { id: 2, label: '2. Ítems' },
  { id: 3, label: '3. Referencia' },
] as const;

export function OrdenCompraWizardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'compras:write');
  const hydrated = useRef(false);

  useEffect(() => {
    if (!user || canWrite) return;
    toast.error('Sin permiso para crear o editar OC');
    navigate('/compras/ordenes');
  }, [user, canWrite, navigate]);

  const { data = EMPTY_OC, isLoading } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-compra'),
    queryFn: api.getOrdenesCompra,
  });
  const ccQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const monedasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'monedas'),
    queryFn: api.getMonedas,
  });
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const proveedoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedores'),
    queryFn: api.getProveedores,
  });
  const kpisQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'dashboard-kpis'),
    queryFn: api.getDashboardKPIs,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => emptyOcForm());
  const [items, setItems] = useState<ItemLine[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const proveedorFichaQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedor-ficha', form.proveedorId),
    queryFn: () => api.getProveedor(form.proveedorId) as Promise<Proveedor>,
    enabled: !!form.proveedorId,
  });

  const editing = id ? data.find((o) => o.id === id) ?? null : null;
  const centros = ccQ.data ?? [];
  const cuentasImputar = useMemo(
    () => cuentasParaImputar(cuentasQ.data, form.cuentaContableId),
    [cuentasQ.data, form.cuentaContableId],
  );
  const proveedorOptions = useMemo(
    () => (proveedoresQ.data ?? []).filter((p) => p.activo).map((p) => ({
      value: p.id,
      label: `${p.rut} · ${p.razonSocial}`,
    })),
    [proveedoresQ.data],
  );

  const itemLineas = useMemo(
    () => buildItemLineas(items, centros, cuentasImputar),
    [items, centros, cuentasImputar],
  );
  const sumaItems = itemLineas.reduce((a, l) => a + l.total, 0);
  const tieneItems = itemLineas.length > 0;
  const distFromItems = useMemo(() => distribucionFromItems(itemLineas), [itemLineas]);

  useEffect(() => {
    const neto = tieneItems ? Math.round(sumaItems * 100) / 100 : 0;
    setForm((s) => (Number(s.neto) === neto ? s : { ...s, neto }));
  }, [sumaItems, tieneItems]);

  /** Cabecera contable = línea de mayor monto. La distribución se arma al guardar. */
  useEffect(() => {
    if (!tieneItems || itemsSinCentroCosto(items)) return;
    const principal = [...distFromItems].sort((a, b) => b.monto - a.monto)[0];
    const cuentaId = cuentaPrincipalDesdeItems(items);
    setForm((s) => {
      const centroCostoId = principal?.centroCostoId || s.centroCostoId;
      const cuentaContableId = cuentaId || s.cuentaContableId;
      if (centroCostoId === s.centroCostoId && cuentaContableId === s.cuentaContableId) return s;
      return { ...s, centroCostoId, cuentaContableId };
    });
  }, [distFromItems, tieneItems, items]);

  useEffect(() => {
    if (id || hydrated.current || !centros.length) return;
    hydrated.current = true;
    const cc0 = centros[0]?.id ?? '';
    setForm(emptyOcForm(cc0, ocSolicitanteDesdeSesion(user)));
    setItems([emptyItem(cc0)]);
  }, [id, centros, user]);

  useEffect(() => {
    if (!id || isLoading || hydrated.current) return;
    if (!editing) return;
    hydrated.current = true;
    const fromOc = formFromOc(editing);
    setForm({
      ...fromOc,
      solicitante: ocSolicitanteDesdeSesion(user, fromOc.solicitante),
    });
    setItems(
      editing.lineas?.length
        ? editing.lineas.map((l) => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          centroCostoId: l.centroCostoId ?? editing.centroCostoId ?? '',
          cuentaContableId: l.cuentaContableId ?? editing.cuentaContableId ?? '',
        }))
        : [emptyItem(editing.centroCostoId ?? '')],
    );
  }, [id, isLoading, editing, user]);

  useEffect(() => {
    if (!id || isLoading || !editing) return;
    if (ocPuedeEditar(editing)) return;
    toast.error('Esta OC ya tiene una firma en la cadena. No se puede editar.');
    navigate('/compras/ordenes');
  }, [id, isLoading, editing, navigate]);

  const netoPreview = Number(form.neto) || 0;
  const isExtranjera = form.moneda !== 'CLP' && form.moneda !== '';
  const tcSugerido = useMemo(
    () => ocTipoCambioSugerido(form.moneda, kpisQ.data),
    [form.moneda, kpisQ.data],
  );
  const netoClpEstimado = useMemo(
    () => ocEquivalenteClp(netoPreview, form.moneda, kpisQ.data),
    [netoPreview, form.moneda, kpisQ.data],
  );
  const montoParaCadena = isExtranjera && netoClpEstimado > 0 ? netoClpEstimado : netoPreview;
  const cadenaQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'oc-preview-cadena', user?.id ?? '', montoParaCadena, form.moneda),
    queryFn: () => api.previewCadenaOc({ monto: montoParaCadena, moneda: form.moneda }),
    enabled: !!user?.id,
    retry: false,
  });
  const grupoPreview = cadenaQ.data?.grupo ?? null;
  const departamentoNombre = ocDepartamentoDesdeGrupo(grupoPreview);
  const solicitanteNombre = ocSolicitanteDesdeSesion(user, form.solicitante);
  const deptoCopySinGrupo = ocCadenaPreviewCopy('sin_grupo');

  useEffect(() => {
    const nombre = ocSolicitanteDesdeSesion(user);
    if (!nombre) return;
    setForm((s) => (s.solicitante === nombre ? s : { ...s, solicitante: nombre }));
  }, [user]);

  useEffect(() => {
    if (!cadenaQ.isFetched) return;
    setForm((s) => (s.departamento === departamentoNombre ? s : { ...s, departamento: departamentoNombre }));
  }, [cadenaQ.isFetched, departamentoNombre]);
  const cadenaPreview = cadenaQ.data?.status === 'ok' ? cadenaQ.data : null;
  const cadenaKind = netoPreview <= 0
    ? 'neto' as const
    : cadenaQ.isLoading || cadenaQ.isFetching
      ? null
      : cadenaQ.data?.status === 'sin_grupo'
        ? 'sin_grupo' as const
        : cadenaQ.data?.status === 'sin_cadena'
          ? 'sin_cadena' as const
          : cadenaQ.data?.status === 'no_pool'
            ? 'no_pool' as const
            : cadenaPreview
              ? null
              : 'no_pool' as const;
  const cadenaCopy = cadenaKind ? ocCadenaPreviewCopy(cadenaKind) : null;
  const reglaNombre = cadenaPreview?.workflowNombre;

  const iva = form.afacto === 'EXENTO' ? 0 : Math.round(Number(form.neto || 0) * 0.19);
  const total = Number(form.neto || 0) + iva;

  const validateStep = (s: number) => {
    if (s === 1) {
      if (!form.proveedorId) {
        toast.error('Selecciona un proveedor del maestro');
        return false;
      }
    }
    if (s === 2) {
      if (!tieneItems) {
        toast.error('Agrega al menos un ítem con descripción');
        return false;
      }
      if (itemsSinCentroCosto(items) || itemsSinCuentaContable(items)) {
        toast.error('Cada ítem debe tener centro de costo y cuenta contable');
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((n) => Math.min(3, n + 1));
  };
  const goPrev = () => setStep((n) => Math.max(1, n - 1));

  const buildDistribucion = (): DistribucionCentroCosto[] => {
    const neto = Number(form.neto) || 0;
    return distFromItems
      .filter((l) => l.centroCostoId)
      .map((l) => {
        const cc = centros.find((c) => c.id === l.centroCostoId);
        return {
          centroCostoId: l.centroCostoId,
          centroCosto: cc ? `${cc.codigo} · ${cc.nombre}` : l.centroCostoId,
          monto: Number(l.monto) || 0,
          porcentaje: neto > 0 ? Math.round(((Number(l.monto) || 0) / neto) * 1000) / 10 : 0,
        };
      });
  };

  const puedeBorrador = !editing || editing.estado === 'BORRADOR' || editing.estado === 'RECHAZADO';
  const proveedoresError = proveedoresQ.isError;
  const provSel = (proveedoresQ.data ?? []).find((p) => p.id === form.proveedorId);
  const fichaProv = proveedorFichaQ.data;
  const dirProv = fichaProv?.direcciones?.find((d) => d.principal && d.linea.trim())
    ?? fichaProv?.direcciones?.find((d) => d.linea.trim());

  const save = async (modo: 'borrador' | 'enviar') => {
    if (proveedoresError) {
      toast.error('No se puede guardar la OC porque falló la carga de proveedores.');
      setStep(1);
      return;
    }
    if (!form.proveedorId) {
      toast.error('Selecciona un proveedor del maestro');
      setStep(1);
      return;
    }
    if (modo === 'enviar') {
      if (cuentasQ.isError) {
        toast.error('No se pudieron cargar las cuentas contables.');
        setStep(2);
        return;
      }
      if (itemsSinCentroCosto(items) || itemsSinCuentaContable(items) || !tieneItems) {
        toast.error('Cada ítem debe tener centro de costo y cuenta contable antes de enviar a aprobación');
        setStep(2);
        return;
      }
      if (ocCadenaBloqueaEmision(cadenaKind)) {
        toast.error(cadenaCopy?.text ?? 'No hay cadena de aprobación Compras para emitir esta OC.');
        setStep(1);
        return;
      }
      if (!cadenaPreview) {
        toast.error('Espere a que se calcule la cadena Compras o complete el neto.');
        setStep(1);
        return;
      }
    }
    setSaving(true);
    try {
      const prov = (proveedoresQ.data ?? []).find((p) => p.id === form.proveedorId);
      const lineasPayload = itemLineas.length ? itemLineas : undefined;
      const payload: Omit<OrdenCompra, 'id'> = {
        ...form,
        solicitante: solicitanteNombre,
        departamento: departamentoNombre,
        proveedor: prov?.razonSocial ?? form.proveedor,
        proveedorId: form.proveedorId,
        neto: Number(form.neto),
        estado: modo === 'borrador' ? 'BORRADOR' : OC_ESTADO_EN_CADENA,
        cuentaContableId: cuentaPrincipalDesdeItems(items) || form.cuentaContableId || undefined,
        centroCostoId: [...distFromItems].sort((a, b) => b.monto - a.monto)[0]?.centroCostoId
          || form.centroCostoId
          || undefined,
        elementoCostoId: form.elementoCostoId || undefined,
        referenciaTipo: form.referenciaFolio.trim()
          ? (form.referenciaTipo.trim() || 'COTIZACION')
          : undefined,
        referenciaFolio: form.referenciaFolio.trim() || undefined,
        referenciaFecha: form.referenciaFecha.trim() || undefined,
        distribucionCc: buildDistribucion(),
        lineas: lineasPayload,
      };
      const saved = editing
        ? await api.updateOrdenCompra(editing.id, payload)
        : await api.createOrdenCompra(payload);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ordenes-compra') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'aprobaciones-oc') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'dashboard-kpis') });
      if (modo === 'borrador') {
        toast.success('Borrador guardado. No se envió a aprobación.');
        const savedId = saved && typeof saved === 'object' && 'id' in saved
          ? String((saved as { id: string }).id)
          : editing?.id;
        if (savedId && !id) navigate(`/compras/ordenes/${savedId}/editar`, { replace: true });
      } else {
        toast.success('OC enviada a aprobación');
        navigate('/compras/ordenes');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (id && !isLoading && !editing) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--color-muted)]">No se encontró la OC.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/compras/ordenes')}>
          Volver al listado
        </Button>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <PageHeader
          title={editing ? (
            <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span>Editar orden de compra</span>
              {form.numero ? <span className="font-mono text-xl">{form.numero}</span> : null}
            </span>
          ) : 'Nueva orden de compra'}
          breadcrumbs={['Compras']}
          subtitle="El documento de inicio es la OC. La cotización recibida (folio y fecha) se anota en el paso 3, sin adjunto."
        />
        <QueryErrorAlert
          error={proveedoresQ.error}
          isLoading={proveedoresQ.isLoading}
          resource="los proveedores"
          onRetry={() => { void proveedoresQ.refetch(); }}
          className="mb-4"
        />

        <div className="mb-4 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { if (s.id < step || validateStep(step)) setStep(s.id); }}
              className={cn(
                'rounded-full px-4 py-2 text-xs font-medium transition-colors',
                step === s.id
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : step > s.id
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardBody className="space-y-6 p-6">
              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="Proveedor" className="sm:col-span-6">
                  <SearchableSelect
                    value={form.proveedorId}
                    options={proveedorOptions}
                    placeholder="Buscar proveedor…"
                    emptyLabel="Sin proveedores"
                    disabled={proveedoresQ.isError}
                    onChange={(pid) => {
                      const p = (proveedoresQ.data ?? []).find((x) => x.id === pid);
                      const dias = p?.condicionPagoDias === 60 || p?.condicionPagoDias === 90
                        ? p.condicionPagoDias
                        : 30;
                      setForm((s) => ({
                        ...s,
                        proveedorId: pid,
                        proveedor: p?.razonSocial ?? '',
                        condicionPagoDias: dias,
                      }));
                    }}
                  />
                </Field>
                <Field label="Giro" className="sm:col-span-3">
                  <Input
                    value={form.proveedorId ? (fichaProv?.giro ?? '') : ''}
                    readOnly
                    placeholder={proveedorFichaQ.isFetching ? 'Cargando…' : '—'}
                  />
                </Field>
                <Field label="Dirección" className="sm:col-span-3">
                  <Input
                    value={dirProv?.linea ?? ''}
                    readOnly
                    placeholder={proveedorFichaQ.isFetching ? 'Cargando…' : '—'}
                  />
                </Field>
                <Field label="Comuna" className="sm:col-span-3">
                  <Input
                    value={dirProv?.comuna ?? ''}
                    readOnly
                    placeholder="—"
                  />
                </Field>
                <Field label="Ciudad" className="sm:col-span-3">
                  <Input
                    value={dirProv?.ciudad ?? ''}
                    readOnly
                    placeholder="—"
                  />
                </Field>
                <Field label="Condición de pago" className="sm:col-span-2">
                  <Select
                    value={String(form.condicionPagoDias)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n !== 30 && n !== 60 && n !== 90) return;
                      setForm((s) => ({ ...s, condicionPagoDias: n }));
                    }}
                  >
                    <option value="30">30 días</option>
                    <option value="60">60 días</option>
                    <option value="90">90 días</option>
                  </Select>
                </Field>
                <Field label="Fecha" className="sm:col-span-3">
                  <Input type="date" value={form.fecha} onChange={(e) => setForm((s) => ({ ...s, fecha: e.target.value }))} />
                </Field>
                <Field label="Moneda" className="sm:col-span-3">
                  <Select value={form.moneda} onChange={(e) => setForm((s) => ({ ...s, moneda: e.target.value }))}>
                    {(monedasQ.data ?? []).filter((m) => m.activa).map((m) => (
                      <option key={m.id} value={m.codigo}>{m.codigo} · {m.nombre}</option>
                    ))}
                    {!(monedasQ.data ?? []).length && (
                      <>
                        <option value="CLP">CLP</option>
                        <option value="USD">USD</option>
                        <option value="CNY">CNY</option>
                        <option value="EUR">EUR</option>
                      </>
                    )}
                  </Select>
                </Field>
                <Field label="Afecto / Exento" className="sm:col-span-3">
                  <Select value={form.afacto} onChange={(e) => setForm((s) => ({ ...s, afacto: e.target.value as OrdenCompra['afacto'] }))}>
                    <option value="AFECTO">Afecto</option>
                    <option value="EXENTO">Exento</option>
                    <option value="MIXTO">Mixto</option>
                  </Select>
                </Field>
                <Field label="Departamento" className="sm:col-span-3">
                  {departamentoNombre ? (
                    <Input value={departamentoNombre} readOnly />
                  ) : cadenaQ.isSuccess && !departamentoNombre ? (
                    <p className={deptoCopySinGrupo.tone === 'warn'
                      ? 'text-sm text-amber-600 dark:text-amber-400'
                      : 'text-sm text-[var(--color-muted)]'}
                    >
                      {deptoCopySinGrupo.text}
                    </p>
                  ) : (
                    <Input value="" readOnly placeholder="Resolviendo grupo Compras…" />
                  )}
                </Field>
              </div>
              {isExtranjera && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Globe size={15} className="text-[var(--color-accent)]" />
                      <span className="font-semibold text-[var(--color-text)]">
                        Compra internacional en {form.moneda}
                      </span>
                      {tcSugerido ? (
                        <span className="rounded bg-[var(--color-accent-soft)] px-2 py-0.5 font-medium text-[var(--color-accent-2)]">
                          TC Banco Central: ${tcSugerido.valor.toFixed(2)} CLP ({tcSugerido.fecha ? tcSugerido.fecha.split('-').reverse().join('/') : 'al día'})
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">Sin TC oficial del día</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                      <ArrowRightLeft size={13} className="text-[var(--color-muted)]" />
                      <span>Neto equiv.: <strong>{fmtCLP(netoClpEstimado)}</strong></span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
                    La cadena de aprobación Compras se evalúa sobre el monto equivalente en CLP ({fmtCLP(netoClpEstimado)}) según los umbrales de la empresa.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardBody className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Ítems de compra</h3>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Cada ítem lleva su centro de costo y su cuenta contable. Pueden diferir entre líneas.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus size={14} />}
                  onClick={() => setItems((s) => [...s, emptyItem(form.centroCostoId)])}
                >
                  Ítem
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded border border-[var(--color-border)] p-3">
                    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_4.75rem_6.75rem_2rem] items-end gap-2">
                      <Field label="Descripción" className="min-w-0">
                        <Input
                          value={it.descripcion}
                          onChange={(e) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, descripcion: e.target.value } : r)))}
                        />
                      </Field>
                      <Field label="Centro de costo *" className="min-w-0">
                        <Select
                          value={it.centroCostoId}
                          onChange={(e) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, centroCostoId: e.target.value } : r)))}
                        >
                          <option value="">Seleccionar…</option>
                          {centros.filter((c) => c.activa).map((c) => (
                            <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Cuenta contable *" className="min-w-0">
                        <Select
                          value={it.cuentaContableId}
                          onChange={(e) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, cuentaContableId: e.target.value } : r)))}
                        >
                          <option value="">Seleccionar…</option>
                          {cuentasImputar.map((c) => (
                            <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Cantidad" className="min-w-0">
                        <Input
                          type="number"
                          value={it.cantidad}
                          onChange={(e) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, cantidad: Number(e.target.value) } : r)))}
                        />
                      </Field>
                      <Field label={`Precio unit. (${form.moneda})`} className="min-w-0">
                        <MontoInput
                          kind="precio"
                          value={it.precioUnitario}
                          onChange={(v) => setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, precioUnitario: v ?? 0 } : r)))}
                        />
                      </Field>
                      <button
                        type="button"
                        className="mb-1 rounded p-2 text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                        disabled={items.length <= 1}
                        onClick={() => setItems((rows) => rows.filter((_, i) => i !== idx))}
                        title="Quitar ítem"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {tieneItems && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-muted)]">
                  <div>
                    Neto desde ítems: <strong className="text-[var(--color-text)]">{fmtMontoMoneda(sumaItems, form.moneda)}</strong>
                    {isExtranjera && netoClpEstimado > 0 && (
                      <span className="ml-2 font-normal text-[var(--color-muted)]">
                        (Equivalente estimado: <strong className="text-[var(--color-text)]">{fmtCLP(netoClpEstimado)}</strong>{tcSugerido?.valor ? ` a TC $${tcSugerido.valor.toFixed(2)}` : ''})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardBody className="space-y-6 p-6">
              <div>
                <h3 className="text-sm font-semibold">Referencia (opcional)</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Cotización recibida por correo o PDF. No se adjunta archivo.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Tipo referencia">
                  <Select
                    value={form.referenciaTipo}
                    onChange={(e) => setForm((s) => ({ ...s, referenciaTipo: e.target.value }))}
                  >
                    <option value="">vacío</option>
                    <option value="COTIZACION">COTIZACION</option>
                    <option value="OTRO">OTRO</option>
                  </Select>
                </Field>
                <Field label="Folio referencia">
                  <Input
                    value={form.referenciaFolio}
                    onChange={(e) => setForm((s) => ({ ...s, referenciaFolio: e.target.value }))}
                    placeholder="Ej. COT-2026-12"
                  />
                </Field>
                <Field label="Fecha referencia">
                  <Input
                    type="date"
                    value={form.referenciaFecha}
                    onChange={(e) => setForm((s) => ({ ...s, referenciaFecha: e.target.value }))}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>
        )}

        </div>
        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <Button type="button" variant="ghost" disabled={step === 1} onClick={goPrev}>
              Anterior
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {puedeBorrador && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || proveedoresError}
                  onClick={() => void save('borrador')}
                >
                  {saving ? 'Guardando…' : 'Guardar borrador'}
                </Button>
              )}
              {step < 3 ? (
                <Button type="button" rightIcon={<ChevronRight size={16} />} onClick={goNext}>
                  Siguiente
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => navigate('/compras/ordenes')}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          <div className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Cadena de aprobación</h3>
            {cadenaPreview ? (
              <>
                <ApprovalChainFlow
                  solicitante={{
                    nombre: solicitanteNombre || 'Usted',
                  }}
                  cadena={cadenaPreview.cadena}
                  monto={montoParaCadena}
                  stretch
                />
                {reglaNombre ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Regla «{reglaNombre}»
                  </p>
                ) : null}
              </>
            ) : cadenaQ.isFetching && netoPreview > 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Calculando cadena Compras…</p>
            ) : cadenaCopy ? (
              <p className={cadenaCopy.tone === 'warn'
                ? 'text-sm text-amber-600 dark:text-amber-400'
                : 'text-sm text-[var(--color-muted)]'}
              >
                {cadenaCopy.text}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Calculando cadena Compras…</p>
            )}
          </div>
        </div>
      </div>

      <CollapsibleRightPanel title="Totales" collapsedSummary={fmtMontoMoneda(total, form.moneda)}>
        <div className="space-y-4">
          <ProveedorPanel
            proveedor={provSel
              ? { razonSocial: provSel.razonSocial, rut: provSel.rut }
              : form.proveedor
                ? { razonSocial: form.proveedor, rut: '' }
                : undefined}
            cargando={proveedoresQ.isLoading && !!form.proveedorId}
          />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Cálculo de totales</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-muted)]">Neto ({form.moneda})</dt>
                <dd className="tabular-nums font-medium">{fmtMontoMoneda(Number(form.neto) || 0, form.moneda)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-muted)]">{form.afacto === 'EXENTO' ? 'IVA' : 'IVA (19%)'}</dt>
                <dd className="tabular-nums">{fmtMontoMoneda(iva, form.moneda)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-base font-bold">
                <dt>Total ({form.moneda})</dt>
                <dd className="tabular-nums text-[var(--color-accent)]">{fmtMontoMoneda(total, form.moneda)}</dd>
              </div>
              {isExtranjera && (
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 text-xs text-[var(--color-muted)]">
                  <div className="flex items-center justify-between">
                    <span>TC Banco Central:</span>
                    <strong className="text-[var(--color-text)]">
                      {tcSugerido?.valor ? `$${tcSugerido.valor.toFixed(2)} CLP` : '—'}
                    </strong>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-[var(--color-border)]/60 pt-1.5">
                    <span>Total equiv. CLP:</span>
                    <strong className="text-[var(--color-accent-2)]">
                      {fmtCLP(Math.round(total * (tcSugerido?.valor || 1)))}
                    </strong>
                  </div>
                </div>
              )}
            </dl>
          </div>
          {puedeBorrador && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={saving || proveedoresError}
              onClick={() => void save('borrador')}
            >
              Guardar borrador
            </Button>
          )}
          <Button
            type="button"
            className="w-full"
            leftIcon={<FileText size={16} />}
            onClick={() => void save('enviar')}
            disabled={saving || ocCadenaBloqueaEmision(cadenaKind)}
          >
            {saving ? 'Enviando…' : 'Enviar a aprobación'}
          </Button>
          <p className="text-xs text-[var(--color-muted)]">
            El borrador no llega a jefatura. Solo «Enviar a aprobación» pide firma, con la OC completa.
          </p>
        </div>
      </CollapsibleRightPanel>
    </div>
  );
}

export default OrdenCompraWizardPage;
