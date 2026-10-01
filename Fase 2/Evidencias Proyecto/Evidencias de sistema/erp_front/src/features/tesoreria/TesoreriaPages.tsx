import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { useAppSettings } from '@/app/app-settings-context';
import { labelMes } from '@/lib/appSettings';
import { toast } from 'sonner';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Modal } from '@/components/ui/modal';
import { fmtCLP, fmtDate } from '@/lib/utils';
import type { Cliente, DocumentoComercial, Pago, PagoTcEvento, Conciliacion, MovimientoConciliacion, IndicadorBc, Proveedor } from '@/types/domain';
import * as api from '@/services/api';
import { debeSugerirTcBc, monedaParaSugerirTc, necesitaCampoTc, sugerirTcFormulario, tcDeFecha, calcularDiferenciaTcClient } from './tipo-cambio';

function isCalceLibre(docs?: string) {
  const s = docs?.trim();
  if (!s) return true;
  return /^cartola\b/i.test(s);
}

function PagoProductorExtra({
  editingId,
  values,
  row,
  onCalzar,
}: {
  editingId: string | number | null;
  values: Record<string, string | number | boolean>;
  row?: Pago;
  onCalzar: () => void;
}) {
  const tipo = String(values.tipo || row?.tipo || 'PAGO_TOTAL');
  const esProd = tipo === 'ANTICIPO_PRODUCTOR';
  const tc = Number(values.tcManual || 0);
  const monto = Number(values.monto || 0);
  const equivUsd = esProd && tc > 0 && monto > 0 ? monto / tc : null;
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const eventosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'pago-tc-eventos', String(editingId ?? '')),
    queryFn: () => api.getPagoTcEventos(String(editingId)),
    enabled: Boolean(editingId) && esProd,
  });
  if (!esProd) return null;
  const eventos = (eventosQ.data ?? []) as PagoTcEvento[];
  return (
    <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-3 sm:col-span-2">
      <p className="text-sm">
        Equivalente USD (solo lectura)
        {': '}
        <span className="font-mono">
          {equivUsd != null ? `≈ ${equivUsd.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
        </span>
      </p>
      {editingId != null && isCalceLibre(row?.documentosCalce) && (
        <Button type="button" size="sm" variant="secondary" onClick={onCalzar}>
          Calzar factura
        </Button>
      )}
      {editingId != null && (
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--color-muted)]">Historial de tipo de cambio</p>
          {eventosQ.isLoading ? (
            <p className="text-xs text-[var(--color-muted)]">Cargando…</p>
          ) : eventos.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">Sin cambios registrados</p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-auto text-xs">
              {eventos.map((e) => (
                <li key={e.id} className="rounded border border-[var(--color-border)] px-2 py-1">
                  <span className="font-mono">
                    {e.tcAnterior == null ? '—' : e.tcAnterior}
                    {' → '}
                    {e.tcNuevo}
                  </span>
                  {' · '}
                  {e.usuarioNombre || e.usuarioEmail || e.usuarioId}
                  {' · '}
                  {fmtDate(e.createdAt.slice(0, 10))}
                  {e.motivo ? ` · ${e.motivo}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PagoDiferenciaTcExtra({
  values,
  indicadores,
  fromFactura,
  facturaOrigen,
}: {
  values: Record<string, string | number | boolean>;
  indicadores: IndicadorBc[];
  fromFactura?: {
    folio: string;
    contraparte: string;
    monto: string;
    rut: string;
    clienteId: string;
    proveedorId: string;
    esPagoCompra: boolean;
    monedaFactura?: string;
    tcFactura?: string;
    montoOtraMoneda?: string;
  } | null;
  facturaOrigen?: DocumentoComercial;
}) {
  const tipoPago = String(values.tipo || 'PAGO_TOTAL');
  const monedaPago = String(values.monedaPago || 'CLP');
  const monedaFactura = String(values.monedaFactura || fromFactura?.monedaFactura || facturaOrigen?.monedaCodigo || 'CLP');

  if (tipoPago === 'ANTICIPO_PRODUCTOR' || !necesitaCampoTc({ tipoPago, monedaPago, monedaFactura })) {
    return null;
  }

  const tcPago = Number(values.tcManual) || 0;
  const tcDoc = Number(fromFactura?.tcFactura || facturaOrigen?.tipoCambio || 0)
    || (facturaOrigen?.fecha ? tcDeFecha(indicadores, String(facturaOrigen.fecha).slice(0, 10), monedaFactura as never) : null)
    || tcPago;

  const monto = Number(values.monto) || 0;
  const montoMe = Number(fromFactura?.montoOtraMoneda || facturaOrigen?.montoOtraMoneda || 0);

  const esCobro = Boolean(values.clienteId || (fromFactura && !fromFactura.esPagoCompra));
  const res = calcularDiferenciaTcClient({
    monto,
    monedaDocumento: monedaFactura,
    monedaPago,
    tcDocumento: tcDoc || 1,
    tcPago: tcPago || 1,
    sentido: esCobro ? 'COBRO' : 'PAGO',
    montoMonedaExtranjera: montoMe > 0 ? montoMe : undefined,
  });

  const equivMe = tcPago > 0 ? monto / tcPago : (tcDoc > 0 ? monto / tcDoc : null);

  return (
    <div className="mt-4 space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[var(--color-text)]">
          Cálculo Multimoneda & Diferencia de Cambio ({monedaFactura})
        </span>
        {equivMe != null && (
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            Base: ≈ {monedaFactura} {equivMe.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-muted)] sm:grid-cols-3">
        <div>
          <span className="block font-medium text-[var(--color-text)]">TC Factura:</span>
          <span>{tcDoc > 0 ? `$${tcDoc.toFixed(2)} CLP` : '—'}</span>
        </div>
        <div>
          <span className="block font-medium text-[var(--color-text)]">TC Pago/Cobro:</span>
          <span>{tcPago > 0 ? `$${tcPago.toFixed(2)} CLP` : '—'}</span>
        </div>
        <div>
          <span className="block font-medium text-[var(--color-text)]">Valor en Libros:</span>
          <span>{res.montoOrigenClp > 0 ? fmtCLP(res.montoOrigenClp) : '—'}</span>
        </div>
      </div>

      {res.aplica && res.diferenciaTc !== 0 ? (
        <div
          className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs font-medium ${
            res.tipoResultado === 'GANANCIA'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          <span>
            {res.tipoResultado === 'GANANCIA' ? '✨' : '⚠️'} {res.glosa}
          </span>
        </div>
      ) : (
        <div className="text-xs text-[var(--color-text-muted)]">
          {tcPago > 0 && tcDoc > 0 && tcPago === tcDoc
            ? 'Los tipos de cambio de emisión y pago coinciden: sin diferencia de cambio.'
            : 'Indica el TC aplicado para estimar automáticamente la ganancia o pérdida contable.'}
        </div>
      )}
    </div>
  );
}

export function PagosPage() {
  const [params, setParams] = useSearchParams();
  const periodoVista = usePeriodoVista();
  const [calzarPago, setCalzarPago] = useState<Pago | null>(null);
  const [calzarFolio, setCalzarFolio] = useState('');
  const [calzarTc, setCalzarTc] = useState('');
  const [calzarMotivo, setCalzarMotivo] = useState('');
  const [calzarBusy, setCalzarBusy] = useState(false);
  const initialSearch = params.get('q')?.trim() || '';
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const monedasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'monedas'),
    queryFn: api.getMonedas,
  });
  const proveedoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedores'),
    queryFn: api.getProveedores,
  });
  const clientesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'clientes'),
    queryFn: api.getClientes,
  });
  const docsQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'documentos'),
    queryFn: () => api.getDocumentos(),
    enabled: Boolean(params.get('folio')),
  });
  const indicadoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'indicadores-bc'),
    queryFn: () => api.getIndicadoresBc({
      desde: '2026-01-01',
      hasta: new Date().toISOString().slice(0, 10),
    }),
  });
  const indicadores = (indicadoresQ.data ?? []) as IndicadorBc[];
  const proveedoresActivos = (proveedoresQ.data ?? []).filter((p) => p.activo !== false);
  const clientesActivos = ((clientesQ.data ?? []) as Cliente[]).filter((c) => c.activo !== false);
  const partyLabel = (p: Pick<Proveedor, 'razonSocial' | 'rut' | 'esProductor'>) =>
    `${p.razonSocial}${p.rut ? ` · ${p.rut}` : ''}${p.esProductor ? ' · productor' : ''}`;
  const proveedorOptions = proveedoresActivos.map((p) => ({ value: p.id, label: partyLabel(p) }));
  const clienteOptions = clientesActivos.map((c) => ({ value: c.id, label: partyLabel(c) }));
  const monedaOptions = (monedasQ.data ?? []).filter((m) => m.activa).map((m) => ({
    value: m.codigo,
    label: `${m.codigo} · ${m.nombre}`,
  }));
  const fallbackMonedas = [
    { value: 'CLP', label: 'CLP' },
    { value: 'USD', label: 'USD' },
  ];
  const fromCartola = useMemo(() => {
    const ref = params.get('ref');
    const movId = params.get('movId');
    if (!ref && !movId) return null;
    return {
      movId: movId ?? '',
      ref: ref ?? '',
      monto: params.get('monto') ?? '',
      glosa: params.get('glosa') ?? '',
      tipo: params.get('tipo') ?? '',
    };
  }, [params]);

  const fromFactura = useMemo(() => {
    const folio = params.get('folio')?.trim();
    if (!folio) return null;
    const proveedorId = params.get('proveedorId')?.trim() ?? '';
    return {
      folio,
      contraparte: params.get('contraparte')?.trim() ?? '',
      monto: params.get('monto') ?? '',
      rut: params.get('rut')?.trim() ?? '',
      clienteId: params.get('clienteId')?.trim() ?? '',
      proveedorId,
      esPagoCompra: Boolean(proveedorId),
      monedaFactura: params.get('monedaFactura')?.trim() || undefined,
      tcFactura: params.get('tcFactura')?.trim() || undefined,
      montoOtraMoneda: params.get('montoOtraMoneda')?.trim() || undefined,
    };
  }, [params]);

  const facturaOrigen = useMemo(() => {
    if (!fromFactura) return undefined;
    const docs = (docsQ.data ?? []) as DocumentoComercial[];
    return docs.find((d) => d.folio === fromFactura.folio);
  }, [fromFactura, docsQ.data]);

  const montoDesdeFactura = fromFactura?.monto
    || (facturaOrigen != null ? String(facturaOrigen.total ?? facturaOrigen.neto) : '');

  const normKey = (s: string) =>
    s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const clienteDesdeFactura = useMemo(() => {
    if (!fromFactura) return '';
    if (fromFactura.clienteId) return fromFactura.clienteId;
    if (facturaOrigen?.clienteId) return facturaOrigen.clienteId;
    const list = (clientesQ.data ?? []) as Cliente[];
    const rutKey = (fromFactura.rut || facturaOrigen?.receptorRut || '').replace(/[.\s-]/g, '').toUpperCase();
    if (rutKey) {
      const byRut = list.find((c) => (c.rut ?? '').replace(/[.\s-]/g, '').toUpperCase() === rutKey);
      if (byRut) return byRut.id;
    }
    const nameKey = normKey(fromFactura.contraparte || facturaOrigen?.cliente || '');
    if (!nameKey) return '';
    const byName = list.find((c) => normKey(c.razonSocial) === nameKey)
      ?? list.find((c) => normKey(c.razonSocial).includes(nameKey) || nameKey.includes(normKey(c.razonSocial)));
    return byName?.id ?? '';
  }, [fromFactura, facturaOrigen, clientesQ.data]);

  const proveedorDesdeFactura = useMemo(() => {
    if (!fromFactura) return '';
    if (fromFactura.proveedorId) return fromFactura.proveedorId;
    const list = proveedoresQ.data ?? [];
    const rutKey = fromFactura.rut.replace(/[.\s-]/g, '').toUpperCase();
    if (rutKey) {
      const byRut = list.find((p) => (p.rut ?? '').replace(/[.\s-]/g, '').toUpperCase() === rutKey);
      if (byRut) return byRut.id;
    }
    const nameKey = normKey(fromFactura.contraparte);
    if (!nameKey) return '';
    const byName = list.find((p) => normKey(p.razonSocial) === nameKey)
      ?? list.find((p) => normKey(p.razonSocial).includes(nameKey) || nameKey.includes(normKey(p.razonSocial)));
    return byName?.id ?? '';
  }, [fromFactura, proveedoresQ.data]);

  const matchClienteId = (beneficiario: string) => {
    const nameKey = normKey(beneficiario);
    if (!nameKey) return '';
    const list = (clientesQ.data ?? []) as Cliente[];
    const byName = list.find((c) => normKey(c.razonSocial) === nameKey)
      ?? list.find((c) => normKey(c.razonSocial).includes(nameKey) || nameKey.includes(normKey(c.razonSocial)));
    return byName?.id ?? '';
  };

  const clienteField: MockFormField = {
    name: 'clienteId',
    label: 'Cliente',
    type: 'select',
    required: true,
    defaultValue: clienteDesdeFactura,
    options: clienteOptions.length
      ? clienteOptions
      : [{ value: '', label: clientesQ.isLoading ? 'Cargando…' : 'Sin clientes' }],
    hint: 'Cobro de factura de venta. El pago queda calzado al folio indicado abajo.',
  };
  const proveedorField: MockFormField = {
    name: 'proveedorId',
    label: 'Proveedor',
    type: 'select',
    required: true,
    defaultValue: proveedorDesdeFactura,
    options: proveedorOptions.length
      ? proveedorOptions
      : [{ value: '', label: proveedoresQ.isLoading ? 'Cargando…' : 'Sin proveedores' }],
    hint: 'Busca y selecciona el maestro. El nombre se guarda desde esa ficha.',
  };

  const formFields: MockFormField[] = [
    { name: 'fecha', label: 'Fecha', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
    {
      name: 'tipo',
      label: 'Tipo',
      type: 'select',
      required: true,
      defaultValue: params.get('tipo') || (fromCartola?.tipo === 'INGRESO' ? 'PAGO_TOTAL' : 'PAGO_TOTAL'),
      options: [
        { value: 'PAGO_TOTAL', label: 'Pago / cobro total' },
        { value: 'ANTICIPO', label: 'Anticipo' },
        { value: 'ANTICIPO_PRODUCTOR', label: 'Anticipo productor (TC)' },
      ],
    },
    (fromFactura && !fromFactura.esPagoCompra) || fromCartola?.tipo === 'INGRESO' ? clienteField : proveedorField,
    { name: 'monto', label: 'Monto', type: 'number', montoKind: 'monto', required: true, defaultValue: fromCartola?.monto || montoDesdeFactura || '' },
    {
      name: 'medio', label: 'Medio de pago', type: 'select', required: true, defaultValue: 'Transferencia',
      options: [
        { value: 'Transferencia', label: 'Transferencia' },
        { value: 'Cheque', label: 'Cheque' },
        { value: 'Efectivo', label: 'Efectivo' },
      ],
    },
    {
      name: 'monedaPago', label: 'Moneda pago', type: 'select', defaultValue: 'CLP',
      options: monedaOptions.length ? monedaOptions : fallbackMonedas,
    },
    {
      name: 'monedaFactura', label: 'Moneda factura', type: 'select', defaultValue: 'CLP',
      options: monedaOptions.length ? monedaOptions : fallbackMonedas,
    },
    { name: 'tcManual', label: 'TC aplicado', type: 'number', montoKind: 'tc', placeholder: 'Según BC de la fecha' },
    { name: 'diferenciaTc', label: 'Diferencia TC (+/-)', type: 'number', montoKind: 'monto', placeholder: '0' },
    {
      name: 'documentosCalce',
      label: 'Documentos a calzar (obligatorio)',
      required: true,
      placeholder: 'FAC-8801',
      defaultValue: fromFactura?.folio
        || (fromCartola ? `Cartola ${fromCartola.ref || fromCartola.movId}` : ''),
    },
    {
      name: 'estado', label: 'Estado', type: 'select', defaultValue: fromCartola ? 'ACTIVO' : 'PENDIENTE',
      options: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'ACTIVO', label: 'Pagado' },
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {fromCartola && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          <span>
            Desde cartola · <span className="font-mono text-xs">{fromCartola.ref || fromCartola.movId}</span>
            {fromCartola.monto ? ` · ${fmtCLP(Number(fromCartola.monto))}` : ''}
            {fromCartola.glosa ? ` · ${fromCartola.glosa}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Link className="text-[var(--color-accent-2)] underline" to="/tesoreria/cartolas">Volver a cartolas</Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                params.delete('movId');
                params.delete('ref');
                params.delete('monto');
                params.delete('glosa');
                params.delete('tipo');
                setParams(params, { replace: true });
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      )}
      {fromFactura && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          <span>
            {fromFactura.esPagoCompra ? 'Registrar pago de compra' : 'Registrar cobro de factura'}
            {' · '}
            <span className="font-mono text-xs">{fromFactura.folio}</span>
            {fromFactura.contraparte ? ` · ${fromFactura.contraparte}` : ''}
            {montoDesdeFactura ? ` · ${fmtCLP(Number(montoDesdeFactura))}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Link className="text-[var(--color-accent-2)] underline" to={fromFactura.esPagoCompra ? '/compras/registro' : '/comercial/libro'}>
              Volver al libro
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                params.delete('folio');
                params.delete('contraparte');
                params.delete('monto');
                params.delete('rut');
                params.delete('clienteId');
                setParams(params, { replace: true });
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      )}
      <MockListPage<Pago>
      title="Pagos"
      subtitle="Incluye diferencia de tipo de cambio al calzar monedas distintas."
      breadcrumbs={['Tesorería']}
      queryKey="pagos"
      invalidateKeys={['pago-tc-eventos']}
      queryFn={api.getPagos}
      toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
      filterRows={(rows) => periodoVista.filter(rows, (r) => r.fecha)}
      createLabel="Nuevo pago"
      entityLabel="Pago"
      initialSearch={initialSearch}
      searchPlaceholder="Buscar pago, beneficiario, documento…"
      formFields={formFields}
      resolveFormFields={({ editingId, rows, values }) => {
        const row = editingId != null
          ? rows.find((r) => String(r.id) === String(editingId))
          : undefined;
        const esCobro = Boolean(
          (fromFactura && !fromFactura.esPagoCompra)
          || fromCartola?.tipo === 'INGRESO'
          || String(values.clienteId || '').trim()
          || row?.clienteId
          || (row && !row.proveedorId && matchClienteId(row.beneficiario)),
        );
        const party = esCobro ? clienteField : proveedorField;
        const tipo = String(values.tipo || row?.tipo || 'PAGO_TOTAL');
        const esProd = tipo === 'ANTICIPO_PRODUCTOR';
        const editing = editingId != null;
        const monedaPago = String(values.monedaPago || row?.monedaPago || 'CLP');
        const monedaFactura = String(values.monedaFactura || row?.monedaFactura || 'CLP');
        const mostrarTc = necesitaCampoTc({ tipoPago: tipo, monedaPago, monedaFactura });
        const mapped = formFields.flatMap((f): MockFormField[] => {
          if ((f.name === 'tcManual' || f.name === 'diferenciaTc') && !mostrarTc) return [];
          if (f.name === 'proveedorId' || f.name === 'clienteId') {
            const source = esCobro ? clientesActivos : proveedoresActivos;
            const list = esProd ? source.filter((p) => p.esProductor) : source;
            const loading = esCobro ? clientesQ.isLoading : proveedoresQ.isLoading;
            const opts = list.length
              ? list.map((p) => ({ value: p.id, label: partyLabel(p) }))
              : [{
                  value: '',
                  label: loading
                    ? 'Cargando…'
                    : esProd
                      ? 'No hay fichas marcadas Productor'
                      : (esCobro ? 'Sin clientes' : 'Sin proveedores'),
                }];
            return [{
              ...party,
              disabled: editing,
              options: opts,
              hint: esProd
                ? 'Solo fichas con casilla Productor. Si no aparece, actívala en Parametrización › Proveedores (o Clientes).'
                : party.hint,
            }];
          }
          if (f.name === 'tipo') return [{ ...f, disabled: editing }];
          if (f.name === 'monto') {
            return [{
              ...f,
              disabled: editing,
              hint: editing ? 'El monto de banco/cartola no se edita. Se corrige el TC.' : f.hint,
            }];
          }
          if (f.name === 'tcManual') {
            return [{
              ...f,
              required: esProd,
              label: esProd ? 'TC aplicado (obligatorio)' : f.label,
              hint: esProd
                ? 'Contrato USD; a veces pagan CLP. Se manipula el TC, no el monto de banco/cartola.'
                : 'Sugerido: Banco Central de la fecha del pago (último hábil si es feriado). Puedes corregirlo.',
            }];
          }
          if (f.name === 'documentosCalce') {
            return [{
              ...f,
              required: tipo === 'PAGO_TOTAL',
              disabled: editing,
              label: tipo === 'PAGO_TOTAL' ? f.label : 'Documentos a calzar (opcional al crear)',
              hint: esProd && !editing
                ? 'El folio se puede cargar después con Calzar factura.'
                : editing
                  ? 'El folio no se edita por aquí. Si falta, usa Calzar factura.'
                  : f.hint,
            }];
          }
          return [f];
        });
        if (editing && esProd) {
          mapped.push({
            name: 'motivo',
            label: 'Motivo cambio de TC',
            placeholder: 'Opcional (queda en auditoría)',
          });
        }
        return mapped;
      }}
      formExtra={({ editingId, values, rows }) => {
        const row = editingId != null
          ? rows.find((r) => String(r.id) === String(editingId))
          : undefined;
        return (
          <>
            <PagoProductorExtra
              editingId={editingId}
              values={values}
              row={row}
              onCalzar={() => {
                if (!row) return;
                setCalzarPago(row);
                setCalzarFolio('');
                setCalzarTc(row.tcManual != null ? String(row.tcManual) : '');
                setCalzarMotivo('');
              }}
            />
            <PagoDiferenciaTcExtra
              values={values}
              indicadores={indicadores}
              fromFactura={fromFactura}
              facturaOrigen={facturaOrigen}
            />
          </>
        );
      }}
      formSize="lg"
      onFieldChange={(name, _value, values) => {
        let next = values;
        if (name === 'tipo' && String(values.tipo) === 'ANTICIPO_PRODUCTOR') {
          const prov = proveedoresActivos.find((p) => p.id === values.proveedorId);
          const cli = clientesActivos.find((c) => c.id === values.clienteId);
          if ((prov && !prov.esProductor) || (cli && !cli.esProductor)) {
            next = {
              ...values,
              ...(prov && !prov.esProductor ? { proveedorId: '' } : {}),
              ...(cli && !cli.esProductor ? { clienteId: '' } : {}),
            };
          }
        }
        if (name !== 'fecha' && name !== 'monedaPago' && name !== 'monedaFactura' && name !== 'tipo' && name !== 'tcManual' && name !== 'monto') {
          return next === values ? undefined : next;
        }
        const tipoPago = String(next.tipo || 'PAGO_TOTAL');
        const monedaPago = String(next.monedaPago || 'CLP');
        const monedaFactura = String(next.monedaFactura || 'CLP');
        if (!necesitaCampoTc({ tipoPago, monedaPago, monedaFactura })) {
          if (next.tcManual !== '' || next.diferenciaTc !== '') {
            return { ...next, tcManual: '', diferenciaTc: '' };
          }
          return next === values ? undefined : next;
        }
        if (tipoPago === 'ANTICIPO_PRODUCTOR') {
          return next === values ? undefined : next;
        }
        let suggested = next.tcManual;
        if (name === 'fecha' || name === 'monedaPago' || name === 'monedaFactura' || name === 'tipo') {
          const autoSuggested = sugerirTcFormulario({
            tipo: tipoPago,
            monedaPago,
            monedaFactura,
            fecha: String(next.fecha || ''),
            tcActual: '',
            indicadores,
          });
          if (autoSuggested && (!next.tcManual || name === 'monedaFactura' || name === 'monedaPago')) {
            suggested = autoSuggested;
          }
        }
        let nextWithTc = suggested !== next.tcManual ? { ...next, tcManual: suggested } : next;

        // Auto cálculo de diferencia de cambio si las monedas difieren
        const tcPago = Number(nextWithTc.tcManual) || 0;
        const tcDoc = Number(fromFactura?.tcFactura || facturaOrigen?.tipoCambio || 0)
          || (facturaOrigen?.fecha ? tcDeFecha(indicadores, String(facturaOrigen.fecha).slice(0, 10), monedaFactura as never) : null)
          || tcPago;
        const monto = Number(nextWithTc.monto) || 0;
        const montoMe = Number(fromFactura?.montoOtraMoneda || facturaOrigen?.montoOtraMoneda || 0);
        const esCobro = Boolean(nextWithTc.clienteId || (fromFactura && !fromFactura.esPagoCompra));

        if (tcPago > 0 && tcDoc > 0 && monto > 0 && monedaFactura !== monedaPago) {
          const res = calcularDiferenciaTcClient({
            monto,
            monedaDocumento: monedaFactura,
            monedaPago,
            tcDocumento: tcDoc,
            tcPago,
            sentido: esCobro ? 'COBRO' : 'PAGO',
            montoMonedaExtranjera: montoMe > 0 ? montoMe : undefined,
          });
          if (res.aplica && String(res.diferenciaTc) !== String(nextWithTc.diferenciaTc)) {
            nextWithTc = { ...nextWithTc, diferenciaTc: String(res.diferenciaTc) };
          }
        }

        return nextWithTc === values ? undefined : nextWithTc;
      }}
      createDefaults={{
        fecha: new Date().toISOString().slice(0, 10),
        tipo: params.get('tipo') || 'PAGO_TOTAL',
        proveedorId: fromFactura?.esPagoCompra
          ? (fromFactura.proveedorId || proveedorDesdeFactura)
          : (fromFactura ? '' : proveedorDesdeFactura),
        clienteId: fromFactura && !fromFactura.esPagoCompra ? clienteDesdeFactura : '',
        monto: fromCartola?.monto || montoDesdeFactura || '',
        medio: 'Transferencia',
        estado: (fromCartola || fromFactura) ? 'ACTIVO' : 'PENDIENTE',
        documentosCalce: fromFactura?.folio
          || (fromCartola ? `Cartola ${fromCartola.ref || fromCartola.movId}` : ''),
        monedaPago: 'CLP',
        monedaFactura: fromFactura?.monedaFactura || facturaOrigen?.monedaCodigo || 'CLP',
        tcManual: sugerirTcFormulario({
          tipo: params.get('tipo') || 'PAGO_TOTAL',
          monedaPago: 'CLP',
          monedaFactura: fromFactura?.monedaFactura || facturaOrigen?.monedaCodigo || 'CLP',
          fecha: new Date().toISOString().slice(0, 10),
          tcActual: '',
          indicadores,
        }),
      }}
      autoOpenCreate={Boolean(fromCartola || (fromFactura && !docsQ.isLoading && !clientesQ.isLoading))}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'PAG'),
        fecha: String(v.fecha),
        beneficiario: clienteOptions.find((o) => o.value === String(v.clienteId))?.label
          ?? proveedorOptions.find((o) => o.value === String(v.proveedorId))?.label
          ?? String(v.clienteId || v.proveedorId),
        proveedorId: String(v.proveedorId || ''),
        monto: Number(v.monto),
        medio: String(v.medio),
        estado: v.estado as Pago['estado'],
        monedaPago: String(v.monedaPago || 'CLP'),
        monedaFactura: String(v.monedaFactura || 'CLP'),
        tcManual: v.tcManual != null && v.tcManual !== '' ? Number(v.tcManual) : undefined,
        diferenciaTc: v.diferenciaTc != null && v.diferenciaTc !== '' ? Number(v.diferenciaTc) : undefined,
        documentosCalce: String(v.documentosCalce || ''),
        movimientoCartolaId: fromCartola?.movId || undefined,
        tipo: (String(v.tipo || 'PAGO_TOTAL') as Pago['tipo']),
      })}
      rowToFormValues={(r) => ({
        fecha: r.fecha,
        tipo: r.tipo ?? 'PAGO_TOTAL',
        proveedorId: r.proveedorId ?? '',
        clienteId: r.clienteId ?? matchClienteId(r.beneficiario),
        monto: r.monto,
        medio: r.medio,
        estado: r.estado,
        monedaPago: r.monedaPago ?? 'CLP',
        monedaFactura: r.monedaFactura ?? 'CLP',
        tcManual: r.tcManual ?? '',
        diferenciaTc: r.diferenciaTc ?? '',
        documentosCalce: r.documentosCalce ?? '',
      })}
      onSave={async (values, id) => {
        const clienteId = String(values.clienteId || '').trim();
        const proveedorId = String(values.proveedorId || '').trim();
        if (!clienteId && !proveedorId) {
          throw new Error('Selecciona un proveedor o un cliente del maestro');
        }
        if (String(values.tipo || 'PAGO_TOTAL') === 'PAGO_TOTAL' && !String(values.documentosCalce || '').trim()) {
          throw new Error('Debes seleccionar/indicar documentos a calzar');
        }
        const cli = ((clientesQ.data ?? []) as Cliente[]).find((c) => c.id === clienteId);
        const prov = (proveedoresQ.data ?? []).find((p) => p.id === proveedorId);
        const payload: Omit<Pago, 'id'> = {
          fecha: String(values.fecha),
          beneficiario: cli?.razonSocial ?? prov?.razonSocial ?? '',
          monto: Number(values.monto),
          medio: String(values.medio),
          estado: values.estado as Pago['estado'],
          monedaPago: String(values.monedaPago || 'CLP'),
          monedaFactura: String(values.monedaFactura || 'CLP'),
          documentosCalce: String(values.documentosCalce),
          tipo: (String(values.tipo || 'PAGO_TOTAL') as Pago['tipo']),
        };
        if (payload.tipo === 'ANTICIPO_PRODUCTOR') {
          if (!cli?.esProductor && !prov?.esProductor) {
            throw new Error(
              'Elige una ficha marcada como Productor. Un proveedor de insumos no sirve: actívalo en Parametrización › Proveedores (o Clientes).',
            );
          }
          if (values.tcManual === '' || values.tcManual == null) {
            throw new Error('Anticipo productor requiere tipo de cambio');
          }
        }
        if (values.tcManual !== '' && values.tcManual != null) payload.tcManual = Number(values.tcManual);
        else if (id == null && debeSugerirTcBc({
          tipoPago: payload.tipo,
          monedaPago: payload.monedaPago,
          monedaFactura: payload.monedaFactura,
          tcManual: null,
        })) {
          const moneda = monedaParaSugerirTc(payload.monedaPago, payload.monedaFactura);
          if (moneda) {
            const tc = tcDeFecha(indicadores, payload.fecha, moneda);
            if (tc != null) payload.tcManual = tc;
          }
        }
        if (values.diferenciaTc !== '' && values.diferenciaTc != null) payload.diferenciaTc = Number(values.diferenciaTc);
        const motivo = String(values.motivo || '').trim();
        if (motivo) (payload as Pago & { motivo?: string }).motivo = motivo;
        if (id == null && fromCartola?.movId) payload.movimientoCartolaId = fromCartola.movId;
        if (clienteId) payload.clienteId = clienteId;
        else if (proveedorId) payload.proveedorId = proveedorId;
        if (id != null) await api.updatePago(String(id), payload);
        else {
          await api.createPago(payload);
          if (payload.movimientoCartolaId) {
            await Promise.all([
              qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cartolas-bancarias') }),
              qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'movimientos-cartola') }),
            ]);
          }
          if (fromCartola) {
            params.delete('movId');
            params.delete('ref');
            params.delete('monto');
            params.delete('glosa');
            params.delete('tipo');
            setParams(params, { replace: true });
          }
          if (fromFactura) {
            params.delete('folio');
            params.delete('contraparte');
            params.delete('monto');
            params.delete('rut');
            params.delete('clienteId');
            setParams(params, { replace: true });
          }
        }
      }}
      columns={[
        { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
        { key: 'beneficiario', header: 'Beneficiario', cell: (r) => r.beneficiario },
        { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
        { key: 'mp', header: 'Pago', cell: (r) => r.monedaPago ?? '—' },
        { key: 'mf', header: 'Fac.', cell: (r) => r.monedaFactura ?? '—' },
        {
          key: 'dtc',
          header: 'Dif. TC',
          cell: (r) => {
            if (r.diferenciaTc == null || r.diferenciaTc === 0) return '—';
            const isGain = r.diferenciaTc > 0;
            return (
              <span className={`font-mono text-xs font-semibold ${isGain ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isGain ? '+' : ''}{fmtCLP(r.diferenciaTc)}
              </span>
            );
          },
          align: 'right',
        },
        { key: 'tipo', header: 'Tipo', cell: (r) => r.tipo ?? 'PAGO_TOTAL' },
        { key: 'tc', header: 'TC', cell: (r) => (r.tcManual != null ? String(r.tcManual) : '—') },
        {
          key: 'docs',
          header: 'Docs',
          cell: (r) => (
            <span className="inline-flex items-center gap-2">
              <span>{r.documentosCalce ?? '—'}</span>
              {r.tipo === 'ANTICIPO_PRODUCTOR' && isCalceLibre(r.documentosCalce) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalzarPago(r);
                    setCalzarFolio('');
                    setCalzarTc(r.tcManual != null ? String(r.tcManual) : '');
                    setCalzarMotivo('');
                  }}
                >
                  Calzar
                </Button>
              )}
            </span>
          ),
        },
        { key: 'estado', header: 'Estado', cell: (r) => <EstadoGenericoBadge estado={r.estado} /> },
      ]}
    />
      <Modal
        open={calzarPago != null}
        onClose={() => setCalzarPago(null)}
        title="Calzar anticipo productor"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCalzarPago(null)}>Cancelar</Button>
            <Button
              disabled={calzarBusy}
              onClick={async () => {
                if (!calzarPago) return;
                const folio = calzarFolio.trim();
                const tc = Number(calzarTc);
                if (!folio) {
                  toast.error('Indica el folio de la factura');
                  return;
                }
                if (!(tc > 0)) {
                  toast.error('El tipo de cambio es obligatorio');
                  return;
                }
                setCalzarBusy(true);
                try {
                  await api.calzarPagoProductor(String(calzarPago.id), {
                    documentosCalce: folio,
                    tcManual: tc,
                    motivo: calzarMotivo.trim() || undefined,
                  });
                  toast.success('Anticipo calzado');
                  setCalzarPago(null);
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'pagos') }),
                    qc.invalidateQueries({
                      queryKey: listQueryKey(scope, empresaId, 'pago-tc-eventos', String(calzarPago.id)),
                    }),
                  ]);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'No se pudo calzar');
                } finally {
                  setCalzarBusy(false);
                }
              }}
            >
              {calzarBusy ? 'Calzando…' : 'Calzar'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            {calzarPago?.beneficiario}
            {calzarPago?.monto != null ? ` · ${fmtCLP(calzarPago.monto)}` : ''}
            . El monto de cartola no cambia; solo se registra folio y TC.
          </p>
          <Field label="Folio factura">
            <Input value={calzarFolio} onChange={(e) => setCalzarFolio(e.target.value)} placeholder="FAC-8801" />
          </Field>
          <Field label="Tipo de cambio">
            <MontoInput
              kind="tc"
              value={calzarTc === '' ? null : Number(calzarTc)}
              onChange={(v) => setCalzarTc(v == null ? '' : String(v))}
              placeholder="965,50"
            />
          </Field>
          <Field label="Motivo (opcional)">
            <Input value={calzarMotivo} onChange={(e) => setCalzarMotivo(e.target.value)} placeholder="Corrección TC al calzar" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export function ConciliacionPage() {
  const qc = useQueryClient();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const { periodoContable } = useAppSettings();
  const [detalle, setDetalle] = useState<Conciliacion | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [vista, setVista] = useState<'TODOS' | 'PENDIENTES'>('PENDIENTES');

  const concQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'conciliacion'),
    queryFn: api.getConciliaciones,
  });

  const movQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'movimientos-conciliacion', detalle?.id ?? ''),
    queryFn: () => api.getMovimientosConciliacion(detalle!.id),
    enabled: detalle != null,
  });

  const allMovsQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'movimientos-conciliacion-all'),
    queryFn: async () => {
      const rows = await Promise.all(
        (concQ.data ?? []).map((c) => api.getMovimientosConciliacion(c.id)),
      );
      return rows.flat();
    },
    enabled: (concQ.data?.length ?? 0) > 0,
  });

  const kpi = useMemo(() => {
    const movs = allMovsQ.data;
    if (movs && movs.length > 0) {
      const conciliados = movs.filter((m) => m.estado === 'CONCILIADO');
      const pendientes = movs.filter((m) => m.estado === 'PENDIENTE');
      return {
        cantConciliados: conciliados.length,
        montoConciliados: conciliados.reduce((a, m) => a + m.monto, 0),
        cantPendientes: pendientes.length,
        montoPendientes: pendientes.reduce((a, m) => a + m.monto, 0),
      };
    }
    // Fallback cabecera si aún no hay detalle de movimientos
    const rows = concQ.data ?? [];
    return {
      cantConciliados: rows.reduce((a, r) => a + r.conciliados, 0),
      montoConciliados: 0,
      cantPendientes: rows.reduce((a, r) => a + Math.max(0, r.movimientos - r.conciliados), 0),
      montoPendientes: rows
        .filter((r) => r.estado === 'PENDIENTE')
        .reduce((a, r) => a + Math.abs(r.diferencia), 0),
    };
  }, [allMovsQ.data, concQ.data]);

  const defaultPeriodoLabel = useMemo(() => {
    const year = periodoContable.temporada.includes('/')
      ? periodoContable.temporada.split('/')[0]
      : periodoContable.temporada;
    const mes = labelMes(periodoContable.mesContable).slice(0, 3);
    return `${mes} ${year}`;
  }, [periodoContable.temporada, periodoContable.mesContable]);

  const formFields: MockFormField[] = useMemo(() => [
    {
      name: 'banco', label: 'Banco', type: 'select', required: true,
      options: [
        { value: 'Banco Estado', label: 'Banco Estado' },
        { value: 'Banco Chile', label: 'Banco Chile' },
        { value: 'Santander', label: 'Santander' },
      ],
    },
    {
      name: 'periodo',
      label: 'Periodo',
      placeholder: 'Ej. Jul 2026',
      defaultValue: defaultPeriodoLabel,
      required: true,
    },
    { name: 'movimientos', label: 'Movimientos', type: 'number', required: true, defaultValue: 0 },
    { name: 'asientoNumero', label: 'Asiento (si hay diferencia)', placeholder: 'Opcional, ej. 20260001' },
  ], [defaultPeriodoLabel]);

  const desconciliar = async (mov: MovimientoConciliacion) => {
    setBusyId(mov.id);
    try {
      await api.desconciliarMovimiento(mov.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'conciliacion') }),
        qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'movimientos-conciliacion', mov.conciliacionId) }),
        qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'movimientos-conciliacion-all') }),
      ]);
      toast.success(`Desconciliado ${mov.referencia} (sin revertir el mes completo)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconciliar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        Resumen del mes. El trabajo diario se hace en{' '}
        <Link className="text-[var(--color-accent-2)] underline" to="/tesoreria/cartolas">Cartolas</Link>
        {' '}(contabilizar y calzar desde el movimiento).
      </p>
      <MockListPage<Conciliacion>
        title="Conciliación bancaria"
        breadcrumbs={['Tesorería']}
        queryKey="conciliacion"
        queryFn={api.getConciliaciones}
        entityLabel="Conciliación"
        toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        formFields={formFields}
        filters={(
          <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5">
            <Button
              size="sm"
              variant={vista === 'TODOS' ? 'primary' : 'ghost'}
              onClick={() => setVista('TODOS')}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant={vista === 'PENDIENTES' ? 'primary' : 'ghost'}
              onClick={() => setVista('PENDIENTES')}
            >
              Pendientes
            </Button>
          </div>
        )}
        filterRows={(rows) => {
          const byEstado = vista === 'PENDIENTES' ? rows.filter((r) => r.estado === 'PENDIENTE') : rows;
          return periodoVista.filter(byEstado, (r) => r.periodo);
        }}
        kpis={(
          <>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <div className="text-[10px] uppercase text-[var(--color-muted)]">Conciliados</div>
              <div className="text-xl font-semibold">{kpi.cantConciliados}</div>
              <div className="text-xs text-[var(--color-muted)]">{fmtCLP(kpi.montoConciliados)}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <div className="text-[10px] uppercase text-[var(--color-muted)]">Pendientes</div>
              <div className="text-xl font-semibold text-[var(--color-warning)]">{kpi.cantPendientes}</div>
              <div className="text-xs text-[var(--color-muted)]">{fmtCLP(kpi.montoPendientes)}</div>
            </div>
          </>
        )}
        invalidateKeys={['movimientos-conciliacion', 'movimientos-conciliacion-all']}
        columns={[
          { key: 'banco', header: 'Banco', cell: (r) => r.banco },
          { key: 'periodo', header: 'Periodo', cell: (r) => r.periodo },
          { key: 'mov', header: 'Mov.', cell: (r) => `${r.conciliados}/${r.movimientos}` },
          {
            key: 'dif',
            header: 'Diferencia',
            cell: (r) => (r.diferencia ? fmtCLP(r.diferencia) : '—'),
            align: 'right',
          },
          {
            key: 'asiento',
            header: 'Asiento',
            cell: (r) => (
              r.asientoNumero
                ? <Link className="text-[var(--color-accent-2)] underline" to="/contabilidad/asientos">{r.asientoNumero}</Link>
                : '—'
            ),
          },
          { key: 'cartola', header: 'Cartola', cell: (r) => r.cartolaId ?? '—' },
          { key: 'estado', header: 'Estado', cell: (r) => <EstadoGenericoBadge estado={r.estado} /> },
          {
            key: 'acc',
            header: '',
            cell: (r) => (
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetalle(r);
                }}
              >
                Movimientos
              </Button>
            ),
          },
        ]}
        onRowClick={(r) => setDetalle(r)}
      />

      <Modal
        open={detalle != null}
        onClose={() => setDetalle(null)}
        title={detalle ? `Movimientos · ${detalle.banco} · ${detalle.periodo}` : 'Movimientos'}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Puedes desconciliar un movimiento sin revertir todo el mes.
        </p>
        {movQ.isLoading && <p className="text-sm text-[var(--color-muted)]">Cargando…</p>}
        {!movQ.isLoading && (movQ.data?.length ?? 0) === 0 && (
          <p className="text-sm text-[var(--color-muted)]">Sin movimientos de muestra para esta conciliación.</p>
        )}
        <div className="max-h-80 space-y-2 overflow-auto">
          {(movQ.data ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {fmtDate(m.fecha)} · <span className="font-mono text-xs">{m.referencia}</span>
                  {' · '}
                  <Badge tone={m.estado === 'CONCILIADO' ? 'success' : 'warning'}>{m.estado}</Badge>
                  {' '}
                  <Badge tone="muted">{m.origen}</Badge>
                </div>
                <div className="text-[var(--color-muted)]">{m.glosa}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={m.tipo === 'EGRESO' ? 'text-red-600' : 'text-emerald-700'}>
                  {m.tipo === 'EGRESO' ? '−' : '+'}{fmtCLP(m.monto)}
                </span>
                {m.estado === 'CONCILIADO' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === m.id}
                    onClick={() => void desconciliar(m)}
                  >
                    Desconciliar
                  </Button>
                ) : (
                  <span className="text-xs text-[var(--color-muted)]">Pendiente</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
