import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useQueryScope,
  useEmpresaScopeId,
  usePeriodoScopeCodigo,
  listQueryKey,
  periodListQueryKey,
} from '@/hooks/useQueryScope';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Modal } from '@/components/ui/modal';
import { EstadoGenericoBadge, EstadoDocumentoBadge } from '@/components/common/Badges';
import { InfoHint } from '@/components/common/InfoHint';
import { Input, Field, Textarea } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { fmtCLP, fmtDate, fmtIso, fmtNumber, localIsoDate } from '@/lib/utils';
import { isoMonedaComex } from '@/features/comercial/comex-aduana';
import { toast } from 'sonner';
import { SII_DTE_LIMITS } from '@/lib/siiDteLimits';
import {
  esTipoEmision,
  type Cliente,
  type Prospecto,
  type CuentaContable,
  type DocumentoComercial,
  type DocumentoLinea,
} from '@/types/domain';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { EMPTY_ARRAY } from '@/lib/empty';

const EMPTY_DOCS = EMPTY_ARRAY as DocumentoComercial[];
import * as api from '@/services/api';
import { RowActionIcons, RowActions } from '@/components/common/RowActions';
import { LibroResumenPanel } from '@/components/common/LibroResumenPanel';
import { mensajeErrorEmisionDte, TOAST_EMIT_DTE_OPTS } from '@/features/comercial/dte-emit-error';
import { DtePdfPreviewModal } from '@/features/comercial/DtePdfPreviewModal';
import { DteTrackerModal } from '@/features/comercial/DteTrackerModal';
import { SMTP_DOCUMENTOS_HABILITADO, SMTP_DOCUMENTOS_HINT } from '@/features/comercial/correo-documentos';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import {
  LIBRO_VENTAS_MAX_BYTES,
  parseLibroVentasCsv,
  clavesFolioLibro,
} from '@/lib/libroVentasCsv';
import {
  CODREF_ANULACION_LIBRO,
  esDtePorContabilizar,
  esFilaLibroVentas,
  folioSiiOInterno,
  mapTipoDteErp,
  lineasNcDesdeFactura,
  seedLineasNcRebaja,
  lineasNcDesdeEdicion,
  ncIgualaOSuperaFactura,
  totalLineaNcRebaja,
  type LineaNcRebajaEdicion,
  lineasSinCuentaContable,
  ovTieneItemsSinCuenta,
  pathLibroVentas,
  resolverFolioSiiParaLibro,
  puedeAnularFacturaLibro,
  puedeCerrarComexLibro,
  referenciaSiiDesdeOrigen,
  textoCorreccionNc,
  saldoNcSobreFactura,
  noPuedeAnularCienPorSaldo,
  historialDocumentosAsociados,
  etiquetaHistorialAsociacion,
  labelCodRefCorto,
  ncAnulacionDeFactura,
  esNcAnulacionTotal,
  esOrigenFacturaExportacion,
  payloadCierreComexDesdeFactura,
  comexCamposDesdeFactura,
  comexFormDesdeDocumento,
  huecosComexFactura110,
  mensajeHuecosComexManual,
  montoClpDesdeUsd,
  tipoCambioNcEfectivo,
} from '@/features/comercial/emitir-ov-helpers';
import { esCodigoTipoDteListado, filterOptionsTipoDteLibro, labelTipoDteSii } from '@/features/comercial/dte-tipo-sii';
import { flattenCuentasTree, labelCuentaImputacion } from '@/lib/cuentasImputacion';

function fechaEnPeriodo(fecha: string, codigoPeriodo: string): boolean {
  const f = (fecha || '').trim();
  // acepta YYYY-MM-DD o DD-MM-YYYY / DD/MM/YYYY
  if (/^\d{4}-\d{2}/.test(f)) return f.startsWith(codigoPeriodo);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(f);
  if (m) {
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}` === codigoPeriodo;
  }
  return false;
}

function isoMonedaCierre(doc: DocumentoComercial): string | undefined {
  if (!esOrigenFacturaExportacion(doc)) return undefined;
  return isoMonedaComex(doc.tpoMoneda || doc.monedaCodigo);
}

function fmtMontoCierre(doc: DocumentoComercial, n: number): string {
  const iso = isoMonedaCierre(doc);
  return iso ? fmtIso(n, iso) : fmtCLP(n);
}

function AnulacionDteCabecera({
  doc,
  tipoCambioEditable,
}: {
  doc: DocumentoComercial;
  tipoCambioEditable?: { value: string; onChange: (v: string) => void };
}) {
  const dir = [doc.receptorDireccion, doc.receptorComuna, doc.receptorCiudad].filter(Boolean).join(', ');
  const iso = isoMonedaCierre(doc);
  const tcFactura = Number(doc.tipoCambio);
  const tcEdit = tipoCambioNcEfectivo(doc, tipoCambioEditable?.value);
  const tcMostrar = tcEdit ?? (tcFactura > 0 ? tcFactura : undefined);
  const totalDoc = iso
    ? (doc.total ?? doc.neto)
    : (doc.total ?? (doc.neto + (doc.iva ?? 0)));
  const fila = (label: string, value: ReactNode, title?: string) => (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="w-[5.5rem] shrink-0 text-[11px] text-[var(--color-muted)]">{label}</dt>
      <dd className="min-w-0 truncate" title={title}>{value}</dd>
    </div>
  );
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        {doc.tipo} {mapTipoDteErp(doc.tipo, doc.indicadorVenta)}
        {' · Folio '}
        {folioSiiOInterno(doc)}
        {doc.indicadorVenta ? ` · ${doc.indicadorVenta}` : ''}
        {iso ? ` · ${iso}` : ''}
      </p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-stretch">
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Datos del cliente
          </h3>
          <dl className="space-y-1">
            {fila('Razón social', doc.cliente || '—', doc.cliente || undefined)}
            {fila('RUT', <span className="font-mono">{doc.receptorRut || '—'}</span>)}
            {fila('Dirección', dir || '—', dir || undefined)}
            {fila('Giro', doc.receptorGiro || '—', doc.receptorGiro || undefined)}
          </dl>
        </section>
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Montos
          </h3>
          <dl className="space-y-1">
            {fila('Fecha', fmtDate(doc.fecha))}
            {fila(iso ? `Neto (${iso})` : 'Neto', <span className="tabular-nums">{fmtMontoCierre(doc, doc.neto)}</span>)}
            {iso
              ? fila(`Total (${iso})`, <span className="tabular-nums">{fmtMontoCierre(doc, totalDoc)}</span>)
              : fila('IVA / Total', (
                <span className="tabular-nums">
                  {fmtCLP(doc.iva ?? 0)}
                  {' · '}
                  {fmtCLP(totalDoc)}
                </span>
              ))}
            <div className="flex min-w-0 items-center gap-2">
              <dt className="w-[5.5rem] shrink-0 text-[11px] text-[var(--color-muted)]">Tipo de cambio</dt>
              <dd className="min-w-0 flex-1">
                {tipoCambioEditable ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="h-7 w-[7.5rem] text-right tabular-nums"
                      value={tipoCambioEditable.value}
                      onChange={(e) => tipoCambioEditable.onChange(e.target.value)}
                      aria-label="Tipo de cambio de la nota"
                    />
                    {tcMostrar != null && tcMostrar > 0 ? (
                      <span className="tabular-nums text-[11px] text-[var(--color-muted)]">
                        CLP {fmtCLP(montoClpDesdeUsd(Number(doc.neto) || 0, tcMostrar))}
                        {tcFactura > 0 ? ` · orig. ${fmtNumber(tcFactura)}` : ''}
                      </span>
                    ) : null}
                  </div>
                ) : iso && tcFactura > 0 ? (
                  <span className="tabular-nums">
                    {fmtNumber(tcFactura)}
                    {' → '}
                    {fmtCLP(montoClpDesdeUsd(Number(doc.neto) || 0, tcFactura))}
                  </span>
                ) : (
                  <span>—</span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function BillingSiiStatus({ r }: { r: DocumentoComercial }) {
  if (r.billingStub) {
    return (
      <span
        className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
        title={r.billingDisclaimer || 'Transmisión simulada'}
      >
        Stub · no SII
      </span>
    );
  }
  const status = (r.billingStatus || '').toUpperCase();
  if (status === 'REJECTED') {
    return (
      <span
        data-testid="dte-sii-status"
        className="text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300"
        title={r.billingDisclaimer || 'El SII rechazó el DTE'}
      >
        Rechazado SII
      </span>
    );
  }
  if (status === 'ACCEPTED') {
    return (
      <span
        data-testid="dte-sii-status"
        className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
        title={r.billingDisclaimer || 'DTE aceptado por el SII'}
      >
        Aceptado SII
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span
        data-testid="dte-sii-status"
        className="text-[10px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300"
        title={r.billingDisclaimer || 'El facturador encoló el DTE; el SII aún no responde'}
      >
        En revisión SII
      </span>
    );
  }
  return null;
}

export function ClientesPage() {
  const formFields: MockFormField[] = [
    { name: 'rut', label: 'RUT', required: true, kind: 'rut' },
    { name: 'razonSocial', label: 'Razón social', required: true, kind: 'nombre', maxLength: SII_DTE_LIMITS.rznSocRecep },
    { name: 'credito', label: 'Línea de crédito', type: 'number', required: true },
    {
      name: 'email',
      label: 'Correo (envío de documentos)',
      type: 'email',
      kind: 'email',
      placeholder: 'facturacion@cliente.cl',
      hint: 'Casilla a la que se enviará la factura al emitirla. Sin servidor de correo configurado, el envío queda deshabilitado.',
    },
    { name: 'vendedor', label: 'Vendedor', placeholder: 'Jorge Sánchez', kind: 'nombre' },
    { name: 'giro', label: 'Giro', placeholder: 'Giro SII (máx. 40)', kind: 'texto', maxLength: SII_DTE_LIMITS.giroRecep, hint: 'SII GiroRecep: máx. 40. Un giro más largo provoca RCH.' },
    { name: 'direccion', label: 'Dirección fiscal', required: true, placeholder: 'Calle y número', maxLength: SII_DTE_LIMITS.dirRecep },
    { name: 'comuna', label: 'Comuna', required: true, placeholder: 'Comuna SII', maxLength: SII_DTE_LIMITS.cmnaRecep, hint: 'SII CmnaRecep: máx. 20.' },
    { name: 'ciudad', label: 'Ciudad', required: true, placeholder: 'Ciudad (no región)', maxLength: SII_DTE_LIMITS.ciudadRecep, hint: 'SII CiudadRecep: máx. 20. No usar el nombre de la región.' },
    { name: 'esProductor', label: 'Productor (fruta)', type: 'checkbox', defaultValue: false },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
  ];

  return (
    <MockListPage<Cliente>
      title="Clientes"
      breadcrumbs={['Comercial']}
      queryKey="clientes"
      queryFn={api.getClientes}
      createLabel="Nuevo cliente"
      entityLabel="Cliente"
      formFields={formFields}
      formSize="lg"
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'CLI'),
        rut: String(v.rut),
        razonSocial: String(v.razonSocial),
        credito: Number(v.credito),
        email: String(v.email || ''),
        vendedor: String(v.vendedor || 'Sin asignar'),
        giro: String(v.giro || ''),
        direccion: String(v.direccion || ''),
        comuna: String(v.comuna || ''),
        ciudad: String(v.ciudad || ''),
        activo: Boolean(v.activo),
        esProductor: Boolean(v.esProductor),
      })}
      rowToFormValues={(r) => ({
        rut: r.rut,
        razonSocial: r.razonSocial,
        credito: r.credito,
        email: r.email ?? '',
        vendedor: r.vendedor,
        giro: r.giro ?? '',
        direccion: r.direccion ?? '',
        comuna: r.comuna ?? '',
        ciudad: r.ciudad ?? '',
        activo: r.activo,
        esProductor: r.esProductor ?? false,
      })}
      onSave={async (values, id) => {
        const payload = {
          rut: String(values.rut),
          razonSocial: String(values.razonSocial),
          credito: Number(values.credito),
          email: String(values.email || '').trim(),
          vendedor: String(values.vendedor || 'Sin asignar'),
          giro: String(values.giro || '').trim(),
          direccion: String(values.direccion || '').trim(),
          comuna: String(values.comuna || '').trim(),
          ciudad: String(values.ciudad || values.comuna || '').trim(),
          activo: Boolean(values.activo),
          esProductor: Boolean(values.esProductor),
        };
        if (id != null) await api.updateCliente(String(id), payload);
        else await api.createCliente(payload);
      }}
      columns={[
        { key: 'rut', header: 'RUT', filterType: 'text', filterValue: (r) => r.rut, cell: (r) => r.rut },
        { key: 'razonSocial', header: 'Razón social', filterType: 'text', filterValue: (r) => r.razonSocial, cell: (r) => r.razonSocial },
        { key: 'credito', header: 'Línea crédito', filterType: 'number', filterValue: (r) => r.credito, cell: (r) => fmtCLP(r.credito), align: 'right' },
        {
          key: 'email',
          header: 'Correo',
          filterType: 'text',
          filterValue: (r) => r.email ?? '',
          cell: (r) => (r.email
            ? <span className="text-xs">{r.email}</span>
            : <span className="text-xs text-[var(--color-muted)]">Sin correo</span>),
        },
        { key: 'vendedor', header: 'Vendedor', filterType: 'text', filterValue: (r) => r.vendedor, cell: (r) => r.vendedor },
        {
          key: 'activo',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activo,
          filterOptions: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          cell: (r) => <EstadoGenericoBadge estado={r.activo ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}

export function ProspectosPage() {
  const formFields: MockFormField[] = [
    { name: 'nombre', label: 'Lead / Empresa', required: true, kind: 'nombre' },
    { name: 'contacto', label: 'Contacto', placeholder: 'email@empresa.cl', required: true, kind: 'email', type: 'email' },
    {
      name: 'origen', label: 'Origen', type: 'select', required: true,
      options: [
        { value: 'Web', label: 'Web' },
        { value: 'Feria', label: 'Feria' },
        { value: 'Referido', label: 'Referido' },
        { value: 'Cold call', label: 'Cold call' },
      ],
    },
    {
      name: 'estado', label: 'Estado', type: 'select', defaultValue: 'NUEVO',
      options: [
        { value: 'NUEVO', label: 'Nuevo' },
        { value: 'CONTACTADO', label: 'Contactado' },
        { value: 'CALIFICADO', label: 'Calificado' },
        { value: 'CONVERTIDO', label: 'Convertido' },
      ],
    },
    { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  ];

  return (
    <MockListPage<Prospecto>
      title="Prospectos"
      breadcrumbs={['Comercial']}
      queryKey="prospectos"
      queryFn={api.getProspectos}
      createLabel="Nuevo prospecto"
      entityLabel="Prospecto"
      formFields={formFields}
      formSize="lg"
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'PRO'),
        nombre: String(v.nombre),
        contacto: String(v.contacto),
        origen: String(v.origen),
        estado: String(v.estado) as Prospecto['estado'],
        fecha: String(v.fecha),
      })}
      rowToFormValues={(r) => ({
        nombre: r.nombre,
        contacto: r.contacto,
        origen: r.origen,
        estado: r.estado,
        fecha: r.fecha,
      })}
      onSave={async (values, id) => {
        const payload = {
          nombre: String(values.nombre),
          contacto: String(values.contacto),
          origen: String(values.origen),
          estado: String(values.estado) as Prospecto['estado'],
          fecha: String(values.fecha),
        };
        if (id != null) await api.updateProspecto(String(id), payload);
        else await api.createProspecto(payload);
      }}
      columns={[
        { key: 'nombre', header: 'Lead', cell: (r) => r.nombre },
        { key: 'contacto', header: 'Contacto', cell: (r) => r.contacto },
        { key: 'origen', header: 'Origen', cell: (r) => r.origen },
        { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
        { key: 'estado', header: 'Estado', cell: (r) => <span className="text-xs font-medium">{r.estado}</span> },
      ]}
    />
  );
}

export function LibroComercialPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const codigoPeriodo = usePeriodoScopeCodigo();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'comercial:write');
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('q')?.trim() || '';
  const initialTipo = esCodigoTipoDteListado(searchParams.get('tipo'))
    ? String(searchParams.get('tipo')).trim()
    : '';
  const forceTodos = searchParams.get('todos') === '1'
    || Boolean(initialSearch)
    || Boolean(initialTipo);
  const { data = EMPTY_DOCS, isLoading, error: documentosError, refetch: refetchDocumentos } = useQuery({
    queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos'),
    queryFn: () => api.getDocumentos(),
  });
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const ccQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const periodosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<DocumentoComercial | null>(null);
  const [trackerDoc, setTrackerDoc] = useState<DocumentoComercial | null>(null);
  const attemptedDteSync = useRef<Set<string>>(new Set());
  const [contabOpen, setContabOpen] = useState<DocumentoComercial | null>(null);
  const [contabError, setContabError] = useState<string | null>(null);
  const [contabLineas, setContabLineas] = useState<DocumentoLinea[]>([]);
  const [contabForm, setContabForm] = useState({
    glosa: '',
    cliente: '',
  });
  const [cargaOpen, setCargaOpen] = useState(false);
  const [cargaRows, setCargaRows] = useState<Array<{
    line: number;
    folio: string;
    tipo: string;
    cliente: string;
    fecha: string;
    neto: number;
    duplicate: boolean;
    exclude: boolean;
    error?: string;
  }>>([]);
  const [cargaSaving, setCargaSaving] = useState(false);
  const [confirmContabReversa, setConfirmContabReversa] = useState<DocumentoComercial | null>(null);
  const [anulacionDoc, setAnulacionDoc] = useState<DocumentoComercial | null>(null);
  const [anulacionCod, setAnulacionCod] = useState<1 | 2 | 3>(1);
  const [anulacionTipo, setAnulacionTipo] = useState<'NC' | 'ND'>('NC');
  const [cierreComex, setCierreComex] = useState(false);
  const [anulacionPaso, setAnulacionPaso] = useState<'tipo' | 'detalle' | 'confirm'>('tipo');
  const [anulacionDondeDice, setAnulacionDondeDice] = useState('');
  const [anulacionDebeDecir, setAnulacionDebeDecir] = useState('');
  const [anulacionLineasNc, setAnulacionLineasNc] = useState<LineaNcRebajaEdicion[]>([]);
  const [tipoCambioNc, setTipoCambioNc] = useState('');
  const [anulacionError, setAnulacionError] = useState<string | null>(null);
  const [historialDoc, setHistorialDoc] = useState<DocumentoComercial | null>(null);
  const periodoVista = usePeriodoVista(forceTodos);

  const invalidate = () => qc.refetchQueries({
    queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos'),
  });

  const saldoNcFactura = anulacionDoc ? saldoNcSobreFactura(anulacionDoc, data) : null;
  const bloqueaAnulacion100 = Boolean(saldoNcFactura && noPuedeAnularCienPorSaldo(saldoNcFactura));

  const closeAnulacion = () => {
    setAnulacionDoc(null);
    setAnulacionPaso('tipo');
    setAnulacionCod(1);
    setAnulacionTipo('NC');
    setCierreComex(false);
    setAnulacionDondeDice('');
    setAnulacionDebeDecir('');
    setAnulacionLineasNc([]);
    setTipoCambioNc('');
    setAnulacionError(null);
  };

  const openAnulacion = async (row: DocumentoComercial, opts?: { cierreComex?: boolean }) => {
    setAnulacionError(null);
    setAnulacionPaso('tipo');
    setCierreComex(Boolean(opts?.cierreComex));
    setAnulacionCod(opts?.cierreComex ? 3 : 1);
    setAnulacionTipo('NC');
    setAnulacionDondeDice('');
    setAnulacionDebeDecir('');
    setBusy(row.id);
    try {
      const doc = await api.getDocumento(row.id) as DocumentoComercial;
      setAnulacionDoc(doc);
      setAnulacionLineasNc(seedLineasNcRebaja(doc.lineas));
      const tc = Number(doc.tipoCambio);
      setTipoCambioNc(tc > 0 ? String(tc) : '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar la factura');
    } finally {
      setBusy(null);
    }
  };

  const emitirNcAnulacion = async () => {
    if (!anulacionDoc) return;
    const lineasFactura = lineasNcDesdeFactura(anulacionDoc.lineas);
    let lineas: DocumentoLinea[] = [];
    const notaTipo = (esOrigenFacturaExportacion(anulacionDoc) && anulacionCod === 3)
      ? anulacionTipo
      : 'NC';
    if (anulacionCod === 1) {
      lineas = lineasFactura;
      if (!lineas.length) {
        setAnulacionError('La factura no tiene líneas para anular');
        return;
      }
      if (bloqueaAnulacion100 && saldoNcFactura) {
        setAnulacionError(
          `No se puede anular el 100%: ya hay notas de crédito por monto. `
          + `Saldo disponible ${fmtCLP(Math.max(saldoNcFactura.saldo, 0))}. `
          + 'Use «Corrige montos» para el resto.',
        );
        return;
      }
    } else if (anulacionCod === 2) {
      if (!anulacionDondeDice.trim()) {
        setAnulacionError('Indique el texto a buscar (donde dice)');
        return;
      }
      if (!anulacionDebeDecir.trim()) {
        setAnulacionError('Indique el texto de reemplazo (debe decir)');
        return;
      }
      if (anulacionDondeDice.trim() === anulacionDebeDecir.trim()) {
        setAnulacionError('El reemplazo debe ser distinto al texto buscado');
        return;
      }
      lineas = [{
        descripcion: textoCorreccionNc(anulacionDondeDice, anulacionDebeDecir),
        cantidad: 1,
        precioUnitario: 0,
        descuentoPct: 0,
        total: 0,
        tipoLinea: 'SERVICIO',
      }];
    } else {
      if (!anulacionLineasNc.length) {
        setAnulacionError(`Debe quedar al menos un ítem en la ${notaTipo === 'ND' ? 'nota de débito' : 'nota de crédito'}`);
        return;
      }
      lineas = lineasNcDesdeEdicion(anulacionLineasNc);
      if (!lineas.length) {
        setAnulacionError('Indique cantidad y precio mayores a cero en al menos un ítem');
        return;
      }
      const netoNc = lineas.reduce((a, l) => a + Number(l.total || 0), 0);
      if (notaTipo === 'NC' && ncIgualaOSuperaFactura(netoNc, Number(anulacionDoc.neto) || 0)) {
        setAnulacionError('La nota de crédito no puede igualar ni superar el monto de la factura. Quite ítems o rebaje cantidad/precio, o use CodRef 1 para anular el 100%.');
        return;
      }
    }
    const neto = lineas.reduce((a, l) => a + Number(l.total || 0), 0);
    const iva = anulacionCod === 1
      ? Number(anulacionDoc.iva ?? 0)
      : anulacionCod === 2
        ? 0
        : undefined;
    const ref = referenciaSiiDesdeOrigen(anulacionDoc);
    const esExport = esOrigenFacturaExportacion(anulacionDoc);
    const tcNc = anulacionCod === 3
      ? tipoCambioNcEfectivo(anulacionDoc, tipoCambioNc)
      : tipoCambioNcEfectivo(anulacionDoc);
    const cierrePayload = anulacionCod === 3 && esExport
      ? payloadCierreComexDesdeFactura(anulacionDoc, { tipo: notaTipo, codRef: 3, tipoCambio: tipoCambioNc })
      : null;
    if (cierrePayload) {
      const cajas = Number(anulacionDoc.bultoCantidad)
        || (anulacionDoc.lineas ?? [])
          .filter((l) => l.tipoLinea !== 'SERVICIO' && l.tipoLinea !== 'FLETE')
          .reduce((a, l) => a + (Number(l.cantidad) || 0), 0);
      const huecos = huecosComexFactura110(comexFormDesdeDocumento(anulacionDoc), cajas);
      if (huecos.length) {
        setAnulacionError(mensajeHuecosComexManual(huecos));
        return;
      }
    }
    setBusy(anulacionDoc.id);
    setAnulacionError(null);
    try {
      const creado = await api.createDocumento({
        folio: '',
        tipo: notaTipo,
        cliente: anulacionDoc.cliente,
        clienteId: anulacionDoc.clienteId,
        fecha: localIsoDate(),
        ...(iva != null ? { iva } : {}),
        estado: 'BORRADOR',
        documentoOrigenId: anulacionDoc.id,
        folioOrigen: anulacionDoc.folio,
        referenciaTipo: ref.tipo,
        referenciaFolio: ref.folio,
        referenciaFecha: ref.fecha,
        referenciaCod: anulacionCod,
        indicadorVenta: anulacionDoc.indicadorVenta,
        descuentoGlobalPct: anulacionCod === 1 ? anulacionDoc.descuentoGlobalPct : undefined,
        receptorRut: anulacionDoc.receptorRut,
        receptorGiro: anulacionDoc.receptorGiro,
        receptorDireccion: anulacionDoc.receptorDireccion,
        receptorComuna: anulacionDoc.receptorComuna,
        receptorCiudad: anulacionDoc.receptorCiudad,
        observaciones: esExport && anulacionCod === 3
          ? String(cierrePayload?.observaciones ?? '')
          : `${notaTipo} CodRef ${anulacionCod} sobre ${folioSiiOInterno(anulacionDoc)}`,
        ...(esExport ? comexCamposDesdeFactura(anulacionDoc, { tipoCambio: anulacionCod === 3 ? tipoCambioNc : undefined }) : {}),
        ...(cierrePayload ?? {}),
        ...(tcNc != null ? { tipoCambio: tcNc } : {}),
        ...(esExport && tcNc != null
          ? {
            montoOtraMoneda: montoClpDesdeUsd(neto, tcNc),
            montoExentoOtraMoneda: montoClpDesdeUsd(neto, tcNc),
          }
          : {}),
      }) as DocumentoComercial;
      const emitido = await api.emitirDocumentoFiscal(creado.id) as DocumentoComercial;
      const folioSii = await resolverFolioSiiParaLibro(emitido, {
        syncDocumentoDte: api.syncDocumentoDte,
        getDocumento: api.getDocumento,
      });
      await invalidate();
      const q = folioSii || emitido.folio;
      toast.success(
        anulacionCod === 1
          ? `Nota de crédito emitida: anula el 100% de ${folioSiiOInterno(anulacionDoc)}`
          : cierreComex || (esExport && anulacionCod === 3)
            ? `${notaTipo === 'ND' ? 'Nota de débito' : 'Nota de crédito'} de cierre COMEX (CodRef 3)`
            : `${notaTipo === 'ND' ? 'Nota de débito' : 'Nota de crédito'} emitida (CodRef ${anulacionCod})`,
      );
      closeAnulacion();
      navigate(pathLibroVentas(q, mapTipoDteErp(emitido.tipo, emitido.indicadorVenta)));
    } catch (e) {
      const msg = mensajeErrorEmisionDte(e);
      setAnulacionError(msg);
      toast.error(msg, TOAST_EMIT_DTE_OPTS);
    } finally {
      setBusy(null);
    }
  };

  const cuentaOptions = useMemo(() => {
    return flattenCuentasTree((cuentasQ.data ?? []) as CuentaContable[])
      .filter((c) => !c.noImputable && c.activa !== false)
      .map((c) => ({ value: c.id, label: labelCuentaImputacion(c) }));
  }, [cuentasQ.data]);

  const ccOptions = useMemo(() => {
    return (ccQ.data ?? [])
      .filter((c) => c.activa)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [ccQ.data]);
  const ccSelectOptions = useMemo(
    () => [{ value: '', label: 'Sin centro de costo' }, ...ccOptions],
    [ccOptions],
  );

  const openContab = async (row: DocumentoComercial, force = false) => {
    if (row.fromReversa && !force) {
      setConfirmContabReversa(row);
      return;
    }
    setConfirmContabReversa(null);
    setContabError(null);
    setBusy(row.id);
    try {
      let doc = row;
      if (!row.lineas?.length) {
        doc = await api.getDocumento(row.id) as DocumentoComercial;
      }
      const lineas = doc.lineas ?? [];
      setContabLineas(lineas.map((l) => ({
        ...l,
        centroCostoId: l.centroCostoId || undefined,
      })));
      setContabForm({
        glosa: `Contabiliza ${doc.folio}${doc.asientoReversador && !doc.asientoNuevo ? ' (re-contabilizar post-reverso)' : ''}`,
        cliente: doc.cliente,
      });
      setContabOpen(doc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar el documento');
    } finally {
      setBusy(null);
    }
  };

  const grabar = async () => {
    if (!contabOpen) return;
    if (lineasSinCuentaContable(contabLineas).length) {
      toast.error('Asigne una cuenta contable a cada ítem antes de guardar');
      return;
    }
    const periodoRow = (periodosQ.data ?? []).find((p) => p.codigo === codigoPeriodo);
    if (!periodoRow) {
      toast.error(`No existe el periodo contable ${codigoPeriodo}. Créalo y déjalo ABIERTO antes de contabilizar.`);
      return;
    }
    if (periodoRow.estado === 'CERRADO') {
      toast.error(`El periodo ${codigoPeriodo} está cerrado. Ábrelo o cambia al periodo activo antes de contabilizar.`);
      return;
    }
    const primeraCuenta = contabLineas.find((l) => l.cuentaContableId)?.cuentaContableId;
    setBusy(contabOpen.id);
    setContabError(null);
    try {
      await api.grabarDocumentoContabilizar(contabOpen.id, {
        glosa: contabForm.glosa,
        cliente: contabOpen.cliente,
        cuentaContableId: primeraCuenta,
        lineas: contabLineas.map((l) => ({
          ...l,
          centroCostoId: l.centroCostoId || undefined,
        })),
      });
      await invalidate();
      toast.success('Documento contabilizado');
      setContabOpen(null);
    } catch (e) {
      const msg = mensajeErrorEmisionDte(e, { quedoBorrador: contabOpen.estado === 'BORRADOR' });
      setContabError(msg);
      toast.error(msg, TOAST_EMIT_DTE_OPTS);
    } finally {
      setBusy(null);
    }
  };

  const parseCargaFile = async (file: File) => {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error('Formato no compatible. Use CSV o TXT; Excel (.xlsx/.xls) no se puede leer en esta carga.');
      return;
    }
    if (file.size > LIBRO_VENTAS_MAX_BYTES) {
      toast.error('El archivo supera el máximo de 2 MB.');
      return;
    }
    const text = await file.text();
    const parsed = parseLibroVentasCsv(text, { sizeBytes: file.size });
    if (parsed.fatalError) {
      toast.error(parsed.fatalError);
      return;
    }
    const existing = new Set<string>();
    for (const d of data) {
      for (const k of clavesFolioLibro(d.tipo, d.folio, d.folioOficial)) existing.add(k);
    }
    const rows = parsed.rows.map((row) => {
      const dupKeys = clavesFolioLibro(row.tipo, row.folio);
      const duplicate = dupKeys.some((k) => existing.has(k));
      for (const k of dupKeys) existing.add(k);
      return {
        ...row,
        duplicate,
        exclude: duplicate || Boolean(row.error),
      };
    });
    if (!rows.length) {
      toast.error('No se encontraron filas (esperado: folio;tipo;cliente;fecha;neto)');
      return;
    }
    const invalidCount = rows.filter((row) => row.error).length;
    if (invalidCount) {
      toast.warning(`${invalidCount} fila(s) tienen errores y quedaron excluidas. Revise el detalle.`);
    }
    setCargaRows(rows);
    setCargaOpen(true);
  };

  const confirmCarga = async () => {
    setCargaSaving(true);
    try {
      const result = await api.cargaMasivaDocumentos({
        items: cargaRows.filter((r) => !r.error).map((r) => ({
          folio: r.folio,
          tipo: r.tipo,
          cliente: r.cliente,
          fecha: r.fecha,
          neto: r.neto,
          estado: 'BORRADOR',
          exclude: r.exclude,
        })),
      });
      await invalidate();
      toast.success(
        `Carga: ${result.created} creados · ${result.skipped.length} omitidos`,
      );
      setCargaOpen(false);
      setCargaRows([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en carga masiva');
    } finally {
      setCargaSaving(false);
    }
  };

  const downloadDte = async (r: DocumentoComercial, kind: 'pdf' | 'xml') => {
    if (!r.billingEmissionId || r.billingStub) return;
    setBusy(r.id);
    try {
      const result = await api.downloadDocumentoDte(r.id, kind);
      if (result.dummy) {
        toast.message('Archivo de preview (stub). No es timbre SII.');
        return;
      }
      toast.success(kind === 'pdf' ? 'PDF del facturador descargado' : 'XML del facturador descargado');
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      const notReady =
        err.code === 'DTE_ARTIFACT_NOT_READY'
        || err.status === 404
        || err.status === 409
        || /aún no disponible/i.test(err.message);
      if (notReady) {
        toast.message(err.message || 'PDF/XML aún no disponible en el facturador; reintente');
      } else {
        toast.error(err.message || 'No se pudo descargar el archivo del facturador');
      }
    } finally {
      setBusy(null);
    }
  };

  const syncDte = async (r: DocumentoComercial) => {
    if (!r.billingEmissionId || r.billingStub) return;
    setBusy(r.id);
    try {
      const row = await api.syncDocumentoDte(r.id) as DocumentoComercial;
      await invalidate();
      const st = (row.billingStatus || '').toUpperCase();
      if (st === 'REJECTED') {
        toast.error(row.billingDisclaimer || `DTE ${row.folio} rechazado por el SII`);
      } else if (st === 'ACCEPTED') {
        toast.success(
          row.folioOficial
            ? `DTE ${row.folio}: folio SII ${row.folioOficial}`
            : `DTE ${row.folio} aceptado por el SII`,
        );
      } else {
        toast.message('El facturador aún no tiene el estado SII final');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo consultar el estado SII');
    } finally {
      setBusy(null);
    }
  };

  const cols: Column<DocumentoComercial>[] = [
    {
      key: 'folioInterno',
      header: 'Folio interno',
      filterType: 'text',
      filterValue: (r) => r.folio,
      sortValue: (r) => r.folio,
      cell: (r) => (
        <span className="font-mono text-xs text-[var(--color-muted)]" title="Identificador interno ERP">
          {r.folio}
        </span>
      ),
    },
    {
      key: 'folio',
      header: 'Folio SII',
      filterType: 'text',
      filterValue: (r) => r.folioOficial || r.folio,
      sortValue: (r) => r.folioOficial || r.folio,
      cell: (r) => {
        const folioSii = r.folioOficial?.trim();
        const anulada = (r.tipo || '').toUpperCase() === 'FACTURA'
          && Boolean(ncAnulacionDeFactura(historialDocumentosAsociados(r, data)));
        const puedePdf = Boolean(r.billingEmissionId && !r.billingStub) && !anulada;
        return (
          <button
            type="button"
            className="font-mono text-xs text-[var(--color-accent)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:no-underline"
            title={puedePdf ? 'Ver PDF del facturador' : folioSii ? folioSii : 'Aún sin folio SII'}
            disabled={!puedePdf || !folioSii}
            onClick={(e) => {
              e.stopPropagation();
              if (puedePdf) setPdfDoc(r);
            }}
          >
            {folioSii || '—'}
          </button>
        );
      },
    },
    {
      key: 'tipo',
      header: 'Tipo de documento',
      filterType: 'select',
      filterValue: (r) => mapTipoDteErp(r.tipo, r.indicadorVenta),
      filterOptions: filterOptionsTipoDteLibro(),
      cell: (r) => labelTipoDteSii(mapTipoDteErp(r.tipo, r.indicadorVenta)),
    },
    {
      key: 'rut',
      header: 'RUT cliente',
      filterType: 'text',
      filterValue: (r) => r.receptorRut ?? '',
      cell: (r) => r.receptorRut || '—',
    },
    { key: 'cliente', header: 'Razón social', filterType: 'text', filterValue: (r) => r.cliente, cell: (r) => r.cliente },
    {
      key: 'fecha',
      header: 'Fecha emisión',
      filterType: 'date',
      filterValue: (r) => r.fecha,
      sortValue: (r) => r.fecha,
      cell: (r) => fmtDate(r.fecha),
    },
    {
      key: 'neto',
      header: 'Total neto',
      filterType: 'number',
      filterValue: (r) => r.neto,
      sortValue: (r) => r.neto,
      align: 'right',
      cell: (r) => fmtCLP(r.neto),
    },
    {
      key: 'rev',
      header: 'Origen / cadena',
      filterable: false,
      cell: (r) => {
        const hist = historialDocumentosAsociados(r, data);
        const etiqueta = etiquetaHistorialAsociacion(r, hist);
        const cadena = [r.asientoOriginal, r.asientoReversador, r.asientoNuevo]
          .filter(Boolean)
          .join('/');
        const pendiente = Boolean(r.asientoReversador && !r.asientoNuevo);
        const asientoTxt = pendiente
          ? 'Reverso pendiente de re-contabilizar'
          : r.fromReversa && r.folioOrigen
            ? `Post-reverso · origen ${r.folioOrigen}`
            : r.asientoOriginal
              ? 'Contabilizado'
              : null;
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            {etiqueta ? (
              <button
                type="button"
                data-testid="historial-asociacion"
                className="text-left font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHistorialDoc(r);
                }}
              >
                {etiqueta}
              </button>
            ) : (
              <span className="text-[var(--color-muted)]">—</span>
            )}
            {asientoTxt || cadena ? (
              <span className="text-[var(--color-muted)]">
                {asientoTxt}
                {cadena ? (
                  <>
                    {asientoTxt ? <br /> : null}
                    <span className="font-mono">Asi. {cadena}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'estado',
      header: 'Estado',
      filterType: 'select',
      filterValue: (r) => r.estado,
      sortValue: (r) => r.estado,
      filterOptions: [
        { value: 'EMITIDO', label: 'Por contabilizar' },
        { value: 'CONTABILIZADA', label: 'Contabilizada' },
      ],
      cell: (r) => {
        const hist = historialDocumentosAsociados(r, data);
        const anulada = (r.tipo || '').toUpperCase() === 'FACTURA'
          && Boolean(ncAnulacionDeFactura(hist));
        return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <EstadoDocumentoBadge
              estado={r.estado}
              label={
                anulada
                  ? 'Anulada'
                  : esDtePorContabilizar(r)
                    ? 'Por contabilizar'
                    : r.estado === 'CONTABILIZADA'
                      ? 'Contabilizada'
                      : undefined
              }
              toneOverride={
                anulada
                  ? 'danger'
                  : esDtePorContabilizar(r)
                    && (!canWrite || r.billingStatus === 'REJECTED')
                    ? 'muted'
                    : undefined
              }
            />
            {esDtePorContabilizar(r) && ovTieneItemsSinCuenta(r) ? (
              <InfoHint
                label="Ítems sin cuenta contable"
                iconClassName="text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
              >
                {`La ${r.tipo === 'NC' ? 'NC' : r.tipo === 'ND' ? 'ND' : 'factura'} ${r.folioOficial || r.folio} tiene ítems sin cuenta. Asócielas aquí para contabilizar.`}
              </InfoHint>
            ) : null}
          </span>
          <BillingSiiStatus r={r} />
        </div>
        );
      },
    },
    {
      key: 'acc',
      header: 'Acciones',
      sortable: false,
      filterable: false,
      hideable: false,
      cell: (r) => {
        const hist = historialDocumentosAsociados(r, data);
        const anulada = (r.tipo || '').toUpperCase() === 'FACTURA'
          && Boolean(ncAnulacionDeFactura(hist));
        const opsOff = anulada;
        return (
        <RowActions
          actions={[
            {
              key: 'ver',
              label: 'Seguimiento',
              icon: RowActionIcons.ver(),
              onClick: () => setTrackerDoc(r),
            },
            ...(!opsOff && r.estado === 'CONTABILIZADA' && r.billingStatus !== 'REJECTED' ? [{
              key: 'pago',
              label: 'Registrar pago',
              icon: RowActionIcons.pago(),
              tone: 'success' as const,
              filled: true,
              onClick: () => {
                const q = new URLSearchParams({
                  folio: r.folio,
                  contraparte: r.cliente,
                  monto: String(r.total ?? r.neto),
                });
                if (r.receptorRut) q.set('rut', r.receptorRut);
                if (r.clienteId) q.set('clienteId', r.clienteId);
                if (r.monedaCodigo && r.monedaCodigo !== 'CLP') {
                  q.set('monedaFactura', r.monedaCodigo);
                  if (r.tipoCambio) q.set('tcFactura', String(r.tipoCambio));
                  if (r.montoOtraMoneda) q.set('montoOtraMoneda', String(r.montoOtraMoneda));
                }
                navigate(`/tesoreria/pagos?${q.toString()}`);
              },
            }] : []),
            ...(r.billingEmissionId && !r.billingStub ? [
              {
                key: 'dte-pdf',
                label: opsOff ? 'Consulta deshabilitada (factura anulada)' : 'Ver PDF',
                icon: RowActionIcons.dtePdf(),
                disabled: opsOff || busy === r.id,
                tone: opsOff ? 'muted' as const : undefined,
                onClick: () => setPdfDoc(r),
              },
              {
                key: 'dte-xml',
                label: opsOff ? 'Consulta deshabilitada (factura anulada)' : 'XML',
                icon: RowActionIcons.dteXml(),
                disabled: opsOff || busy === r.id,
                tone: opsOff ? 'muted' as const : undefined,
                onClick: () => void downloadDte(r, 'xml'),
              },
              {
                key: 'dte-sync',
                label: opsOff ? 'Consulta deshabilitada (factura anulada)' : 'Actualizar estado SII',
                icon: RowActionIcons.dteSync(),
                disabled: opsOff || busy === r.id,
                tone: opsOff ? 'muted' as const : undefined,
                onClick: () => void syncDte(r),
              },
            ] : []),
            ...((r.tipo === 'FACTURA' || r.tipo === 'NC' || r.tipo === 'ND') ? [{
              key: 'contab',
              label: r.billingStatus === 'REJECTED'
                ? 'No se contabiliza un DTE rechazado'
                : r.estado === 'CONTABILIZADA'
                  ? 'Ya contabilizado'
                  : !canWrite
                    ? 'Sin permiso para contabilizar'
                    : r.fromReversa || r.asientoReversador ? 'Re-contabilizar' : 'Contabilizar',
              icon: RowActionIcons.peso(),
              tone: canWrite && r.estado === 'EMITIDO' && r.billingStatus !== 'REJECTED'
                ? 'accent' as const
                : 'muted' as const,
              disabled: !canWrite
                || r.estado !== 'EMITIDO'
                || busy === r.id
                || cuentasQ.isError
                || ccQ.isError
                || periodosQ.isError
                || r.billingStatus === 'REJECTED',
              onClick: () => { void openContab(r); },
            }] : []),
            ...(r.billingEmissionId && !r.billingStub ? [{
              key: 'correo',
              label: opsOff
                ? 'Consulta deshabilitada (factura anulada)'
                : SMTP_DOCUMENTOS_HABILITADO ? 'Reenviar correo' : SMTP_DOCUMENTOS_HINT,
              icon: RowActionIcons.correo(),
              disabled: opsOff || !SMTP_DOCUMENTOS_HABILITADO,
              tone: opsOff ? 'muted' as const : undefined,
              onClick: () => {
                if (opsOff || !SMTP_DOCUMENTOS_HABILITADO) {
                  toast.message(opsOff ? 'Factura anulada' : SMTP_DOCUMENTOS_HINT);
                }
              },
            }] : []),
            ...(canWrite && puedeCerrarComexLibro(r, { yaAnulada: anulada }) ? [{
              key: 'cierre-comex',
              label: 'Cierre COMEX',
              icon: RowActionIcons.emitir(),
              tone: 'accent' as const,
              disabled: busy === r.id,
              onClick: () => { void openAnulacion(r, { cierreComex: true }); },
            }] : []),
            ...(canWrite && puedeAnularFacturaLibro(r, { yaAnulada: anulada }) ? [{
              key: 'anulacion',
              label: 'Anulación',
              icon: RowActionIcons.anular(),
              tone: 'danger' as const,
              disabled: busy === r.id,
              onClick: () => { void openAnulacion(r); },
            }] : []),
          ]}
        />
        );
      },
    },
  ];

  const libroEmitidos = useMemo(
    () => data.filter((d) => esFilaLibroVentas(d)),
    [data],
  );

  const fueraDePeriodoCount = useMemo(
    () => libroEmitidos.filter((d) => !fechaEnPeriodo(d.fecha, codigoPeriodo)).length,
    [libroEmitidos, codigoPeriodo],
  );

  const libroVentasPeriodo = useMemo(() => {
    if (periodoVista.todo) return libroEmitidos;
    return libroEmitidos.filter((d) => fechaEnPeriodo(d.fecha, codigoPeriodo));
  }, [libroEmitidos, periodoVista.todo, codigoPeriodo]);

  const [libroVentasFiltrado, setLibroVentasFiltrado] = useState<DocumentoComercial[]>([]);
  useEffect(() => {
    setLibroVentasFiltrado(libroVentasPeriodo);
  }, [libroVentasPeriodo]);

  useEffect(() => {
    const pending = libroVentasPeriodo.filter(
      (d) => d.billingStatus === 'PENDING' && d.billingEmissionId && !d.billingStub,
    );
    const todo = pending.filter((d) => !attemptedDteSync.current.has(d.id)).slice(0, 8);
    if (!todo.length) return;
    let cancelled = false;
    void (async () => {
      for (const row of todo) {
        attemptedDteSync.current.add(row.id);
        try {
          await api.syncDocumentoDte(row.id);
        } catch {
          /* reintento manual con el icono de actualizar */
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        await qc.invalidateQueries({
          queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libroVentasPeriodo, qc, scope, empresaId, codigoPeriodo]);

  return (
    <div>
      <PageHeader
        title="Libro de ventas"
        breadcrumbs={['Ventas']}
        subtitle="Solo DTE emitidos. La orden de venta se gestiona en Ventas › Órdenes de venta y se factura en Emitir DTE."
        action={canWrite ? (
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void parseCargaFile(f);
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                type="button"
                onClick={(e) => {
                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement | null)
                    ?? (e.currentTarget.parentElement?.querySelector('input[type=file]') as HTMLInputElement | null);
                  input?.click();
                }}
              >
                Carga
              </Button>
            </label>
        ) : undefined}
      />
      <QueryErrorAlert
        error={documentosError}
        isLoading={isLoading}
        resource="el libro de ventas"
        onRetry={() => void refetchDocumentos()}
        className="mb-3"
      />
      <LibroResumenPanel
        rows={libroVentasFiltrado.filter((d) => esTipoEmision(d.tipo))}
        title="Resumen por tipo de documento"
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--color-muted)]">
          DTE emitido = Por contabilizar (asigne cuenta y centro de costo por ítem). Periodo <strong>{codigoPeriodo}</strong>.
          Compras › Libro de compras · Despachos › Insumos.
          {fueraDePeriodoCount > 0 && !periodoVista.todo ? (
            <span className="text-[var(--color-muted)]"> ({fueraDePeriodoCount} fuera de {codigoPeriodo})</span>
          ) : null}
        </p>
      </div>
      {periodoVista.todo && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Advertencia:</strong> estás viendo todos los periodos. El mes contable activo es <strong>{codigoPeriodo}</strong>; los totales RCV mensuales pueden no cuadrar.
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : !documentosError ? (
        <DataTable
          columns={cols}
          rows={libroVentasPeriodo}
          empty={periodoVista.empty('DTE emitidos')}
          tableKey="comercial.libro"
          pagination={{ storageKey: 'erp-libro', defaultSize: 15 }}
          searchPlaceholder="Buscar por folio SII, razón social…"
          initialSearch={initialSearch}
          initialColumnFilters={initialTipo ? { tipo: initialTipo } : undefined}
          quickSearchKeys={['folio', 'cliente', 'rut']}
          enableExport
          onFilteredRowsChange={setLibroVentasFiltrado}
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      ) : null}

      <Modal
        open={contabOpen != null}
        onClose={() => { setContabOpen(null); setContabError(null); }}
        title="Por contabilizar — asignar cuentas"
        size="xl"
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setContabOpen(null); setContabError(null); }}>Cancelar</Button>
            <Button
              onClick={() => void grabar()}
              disabled={busy != null || cuentasQ.isError || ccQ.isError || periodosQ.isError}
            >
              {busy ? 'Contabilizando…' : 'Guardar'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-3">
          <p className="text-sm text-[var(--color-text)]">
            Asigne cuenta de ingreso y centro de costo a cada ítem de {contabOpen?.folioOficial || contabOpen?.folio}.
            Al guardar, el documento queda <strong>Contabilizada</strong>.
          </p>
          {contabOpen ? (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] text-[var(--color-muted)]">Cliente</dt>
                <dd className="truncate" title={contabOpen.cliente}>{contabOpen.cliente || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-muted)]">RUT</dt>
                <dd className="font-mono">{contabOpen.receptorRut || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-muted)]">Giro</dt>
                <dd className="truncate" title={contabOpen.receptorGiro}>{contabOpen.receptorGiro || '—'}</dd>
              </div>
            </dl>
          ) : null}
          <QueryErrorAlert
            error={cuentasQ.error || ccQ.error || periodosQ.error}
            isLoading={cuentasQ.isLoading || ccQ.isLoading || periodosQ.isLoading}
            resource="las cuentas, centros de costo y periodos"
            onRetry={() => {
              void cuentasQ.refetch();
              void ccQ.refetch();
              void periodosQ.refetch();
            }}
          />
          {contabError ? (
            <div
              role="alert"
              data-testid="emit-error-banner"
              className="whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
            >
              {contabError}
            </div>
          ) : null}
          {contabLineas.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Este documento no tiene ítems para imputar.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="px-2 py-2 font-medium">Ítem</th>
                    <th className="px-2 py-2 font-medium text-right">Cant.</th>
                    <th className="px-2 py-2 font-medium text-right">Neto</th>
                    <th className="px-2 py-2 font-medium">Cuenta contable</th>
                    <th className="px-2 py-2 font-medium">Centro de costo</th>
                  </tr>
                </thead>
                <tbody>
                  {contabLineas.map((l, i) => (
                    <tr key={`${l.insumoId ?? l.descripcion}-${i}`} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-2">
                        <div className="font-medium text-[var(--color-text)]">{l.descripcion || '—'}</div>
                        {l.codigoProducto ? (
                          <div className="font-mono text-[10px] text-[var(--color-muted)]">{l.codigoProducto}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.cantidad}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtCLP(l.total)}</td>
                      <td className="px-2 py-2 min-w-[14rem]">
                        <SearchableSelect
                          value={l.cuentaContableId ?? ''}
                          onChange={(cuentaContableId) => {
                            setContabLineas((rows) => rows.map((x, j) => (
                              j === i ? { ...x, cuentaContableId } : x
                            )));
                          }}
                          options={cuentaOptions}
                          placeholder="Escribe para buscar cuenta…"
                          emptyLabel="Sin cuentas que coincidan"
                          buttonClassName="h-9 rounded-md"
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[14rem]">
                        <SearchableSelect
                          value={l.centroCostoId ?? ''}
                          onChange={(centroCostoId) => {
                            setContabLineas((rows) => rows.map((x, j) => (
                              j === i ? { ...x, centroCostoId: centroCostoId || undefined } : x
                            )));
                          }}
                          options={ccSelectOptions}
                          placeholder="Centro de costo…"
                          emptyLabel="Sin centros que coincidan"
                          buttonClassName="h-9 rounded-md"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Field label="Glosa">
            <Input
              value={contabForm.glosa}
              onChange={(e) => setContabForm((s) => ({ ...s, glosa: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!anulacionDoc}
        onClose={closeAnulacion}
        title={cierreComex ? 'Cierre COMEX' : 'Anulación'}
        size={anulacionPaso === 'detalle' && (anulacionCod === 2 || anulacionCod === 3)
          ? 'full'
          : 'md'}
        className={anulacionPaso === 'detalle' && anulacionCod === 3
          ? 'h-[92dvh] max-w-[min(98vw,96rem)]'
          : anulacionPaso === 'detalle' && anulacionCod === 2
            ? 'max-w-[min(90vw,72rem)]'
            : undefined}
        footer={(
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (anulacionPaso === 'confirm') setAnulacionPaso('detalle');
                else closeAnulacion();
              }}
            >
              {anulacionPaso === 'confirm' ? 'Volver' : 'Cancelar'}
            </Button>
            {anulacionPaso === 'tipo' ? (
              <Button
                disabled={anulacionCod === 1 && bloqueaAnulacion100}
                onClick={() => {
                  if (anulacionCod === 1 && bloqueaAnulacion100) return;
                  if (anulacionCod === 3 && anulacionDoc) {
                    setAnulacionLineasNc(seedLineasNcRebaja(anulacionDoc.lineas));
                  }
                  setAnulacionPaso('detalle');
                }}
              >
                Continuar
              </Button>
            ) : anulacionPaso === 'detalle' && (anulacionCod === 2 || anulacionCod === 3) ? (
              <Button
                disabled={anulacionCod === 3
                  && anulacionTipo === 'NC'
                  && ncIgualaOSuperaFactura(
                    anulacionLineasNc.reduce((a, l) => a + totalLineaNcRebaja(l), 0),
                    Number(anulacionDoc?.neto) || 0,
                  )}
                onClick={() => {
                  setAnulacionError(null);
                  if (anulacionCod === 2) {
                    if (!anulacionDondeDice.trim() || !anulacionDebeDecir.trim()) {
                      setAnulacionError('Complete Donde dice y Debe decir');
                      return;
                    }
                    if (anulacionDondeDice.trim() === anulacionDebeDecir.trim()) {
                      setAnulacionError('El reemplazo debe ser distinto al texto buscado');
                      return;
                    }
                  }
                  setAnulacionPaso('confirm');
                }}
              >
                {anulacionCod === 2
                  ? 'Guardar'
                  : `Emitir ${anulacionTipo === 'ND' && esOrigenFacturaExportacion(anulacionDoc) ? 'ND' : 'NC'}`}
              </Button>
            ) : (
              <Button
                disabled={busy === anulacionDoc?.id
                  || (anulacionCod === 1 && bloqueaAnulacion100)
                  || (anulacionCod === 3
                    && anulacionTipo === 'NC'
                    && ncIgualaOSuperaFactura(
                      anulacionLineasNc.reduce((a, l) => a + totalLineaNcRebaja(l), 0),
                      Number(anulacionDoc?.neto) || 0,
                    ))}
                onClick={() => void emitirNcAnulacion()}
              >
                {busy === anulacionDoc?.id
                  ? 'Guardando…'
                  : anulacionCod === 1
                    ? 'Confirmar y emitir NC'
                    : cierreComex
                      ? `Sí, emitir ${anulacionTipo} de cierre`
                      : `Sí, emitir ${anulacionTipo === 'ND' && esOrigenFacturaExportacion(anulacionDoc) ? 'ND' : 'nota de crédito'}`}
              </Button>
            )}
          </>
        )}
      >
        {!anulacionDoc ? null : anulacionPaso === 'confirm' ? (
          <p className="text-sm text-[var(--color-text)]">
            {cierreComex || (esOrigenFacturaExportacion(anulacionDoc) && anulacionCod === 3)
              ? `Se emitirá ${anulacionTipo === 'ND' ? 'una ND' : 'una NC'} que corrige montos (CodRef 3). La factura de exportación sigue vigente ante el SII.`
              : anulacionCod === 2
                ? 'Se realizará dicha acción. ¿Estás seguro? Se emitirá una nota de crédito por corrección de texto.'
                : 'Se realizará dicha acción. ¿Estás seguro? Se emitirá una nota de crédito por corrección de montos.'}
          </p>
        ) : anulacionPaso === 'tipo' ? (
          <div className="space-y-3">
            {cierreComex ? (
              <>
                <p className="text-sm text-[var(--color-muted)]">
                  Liquidación sobre la factura {folioSiiOInterno(anulacionDoc)} (DTE 110).
                  CodRef 3 (corrige montos): la 110 no se anula. NC rebaja; ND recarga.
                </p>
                <p className="text-sm font-medium">Documento a emitir</p>
                <div className="flex gap-3">
                  {(['NC', 'ND'] as const).map((t) => (
                    <label
                      key={t}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="tipo-cierre-comex"
                        checked={anulacionTipo === t}
                        onChange={() => setAnulacionTipo(t)}
                      />
                      <span className="text-sm">{t === 'ND' ? 'ND (111)' : 'NC (112)'}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--color-muted)]">
                  Tipo de nota de crédito para la factura {folioSiiOInterno(anulacionDoc)}.
                </p>
                <div className="space-y-2">
                  {CODREF_ANULACION_LIBRO.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3"
                    >
                      <input
                        type="radio"
                        name="codref-anulacion"
                        className="mt-1"
                        checked={anulacionCod === opt.value}
                        onChange={() => setAnulacionCod(opt.value)}
                      />
                      <span>
                        <span className="block text-sm font-medium">{opt.label}</span>
                        <span className="block text-xs text-[var(--color-muted)]">{opt.detalle}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {bloqueaAnulacion100 && saldoNcFactura ? (
                  <p className="text-sm text-[var(--color-danger)]" role="status">
                    Ya hay NC de monto sobre esta factura. No se puede anular el 100%
                    (quedaría saldo {fmtCLP(Math.max(saldoNcFactura.saldo, 0))}).
                    Use «Corrige montos» para el resto.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : anulacionCod === 1 ? (
          <p className="text-sm text-[var(--color-muted)]">
            {bloqueaAnulacion100 && saldoNcFactura
              ? `No se puede anular el 100% de ${folioSiiOInterno(anulacionDoc)}: ya hay NC de monto. Saldo ${fmtCLP(Math.max(saldoNcFactura.saldo, 0))}. Use «Corrige montos» (CodRef 3) para el resto.`
              : `¿Está seguro de anular el 100% de la factura ${folioSiiOInterno(anulacionDoc)}? Se emitirá una nota de crédito automática (CodRef 1).`}
          </p>
        ) : anulacionCod === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              Buscar y reemplazar en el documento: un número, un nombre, un ítem u otro texto.
              La nota de crédito no lleva montos.
            </p>
            <AnulacionDteCabecera doc={anulacionDoc} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Donde dice">
                <Textarea
                  value={anulacionDondeDice}
                  onChange={(e) => setAnulacionDondeDice(e.target.value)}
                  placeholder="Texto a buscar"
                  className="min-h-40"
                />
              </Field>
              <Field label="Debe decir">
                <Textarea
                  value={anulacionDebeDecir}
                  onChange={(e) => setAnulacionDebeDecir(e.target.value)}
                  placeholder="Texto de reemplazo"
                  className="min-h-40"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              {cierreComex || esOrigenFacturaExportacion(anulacionDoc)
                ? `${anulacionTipo === 'ND' ? 'ND' : 'NC'} de cierre: quite ítems o rebaje cantidad y precio en ${isoMonedaCierre(anulacionDoc) ?? 'USD'}. El tipo de cambio parte del de la factura y aplica a toda la nota.`
                : `Todos los ítems de la factura. Quite los que no aplican o rebaje cantidad y precio. La NC no puede igualar ni superar el neto de la factura (${fmtCLP(anulacionDoc.neto)}).`}
            </p>
            <AnulacionDteCabecera
              doc={anulacionDoc}
              tipoCambioEditable={
                esOrigenFacturaExportacion(anulacionDoc) || Number(anulacionDoc.tipoCambio) > 0
                  ? { value: tipoCambioNc, onChange: setTipoCambioNc }
                  : undefined
              }
            />
            <div className="max-h-[min(70vh,52rem)] overflow-auto rounded border border-[var(--color-border)]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="p-2">Ítem</th>
                    <th className="p-2 text-right">Cant. orig.</th>
                    <th className="p-2 text-right">
                      P. orig.{isoMonedaCierre(anulacionDoc) ? ` (${isoMonedaCierre(anulacionDoc)})` : ''}
                    </th>
                    <th className="p-2 text-right">Cant. {anulacionTipo}</th>
                    <th className="p-2 text-right">
                      P. unit. {anulacionTipo}{isoMonedaCierre(anulacionDoc) ? ` (${isoMonedaCierre(anulacionDoc)})` : ''}
                    </th>
                    <th className="p-2 text-right">
                      Total {anulacionTipo}{isoMonedaCierre(anulacionDoc) ? ` (${isoMonedaCierre(anulacionDoc)})` : ''}
                    </th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {anulacionLineasNc.map((l) => (
                    <tr key={l.id} className="border-t border-[var(--color-border)]">
                      <td className="p-2">{l.descripcion}</td>
                      <td className="p-2 text-right tabular-nums">{fmtNumber(l.cantidadMax)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMontoCierre(anulacionDoc, l.precioMax)}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={l.cantidadMax}
                          step="any"
                          className="w-24 text-right"
                          value={l.cantidad}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setAnulacionLineasNc((prev) => prev.map((row) => (
                              row.id === l.id
                                ? { ...row, cantidad: Number.isFinite(v) ? Math.min(Math.max(0, v), row.cantidadMax) : 0 }
                                : row
                            )));
                          }}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={l.precioMax}
                          step="any"
                          className="w-28 text-right"
                          value={l.precioUnitario}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setAnulacionLineasNc((prev) => prev.map((row) => (
                              row.id === l.id
                                ? { ...row, precioUnitario: Number.isFinite(v) ? Math.min(Math.max(0, v), row.precioMax) : 0 }
                                : row
                            )));
                          }}
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmtMontoCierre(anulacionDoc, totalLineaNcRebaja(l))}</td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--color-danger)] hover:bg-red-500/10"
                          title="Quitar ítem"
                          onClick={() => setAnulacionLineasNc((prev) => prev.filter((row) => row.id !== l.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const netoNc = anulacionLineasNc.reduce((a, l) => a + totalLineaNcRebaja(l), 0);
              const bloquea = anulacionTipo === 'NC'
                && ncIgualaOSuperaFactura(netoNc, Number(anulacionDoc.neto) || 0);
              const iso = isoMonedaCierre(anulacionDoc);
              const tc = tipoCambioNcEfectivo(anulacionDoc, tipoCambioNc);
              return (
                <p className={`text-sm tabular-nums ${bloquea ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'}`}>
                  Neto {anulacionTipo} {fmtMontoCierre(anulacionDoc, netoNc)}
                  {' · Factura '}
                  {fmtMontoCierre(anulacionDoc, Number(anulacionDoc.neto) || 0)}
                  {iso && tc != null && tc > 0
                    ? ` · TC ${fmtNumber(tc)} · CLP ${fmtCLP(montoClpDesdeUsd(netoNc, tc))}`
                    : ''}
                  {bloquea ? ' — debe ser menor al de la factura' : ''}
                </p>
              );
            })()}
          </div>
        )}
        {anulacionError ? (
          <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">{anulacionError}</p>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmContabReversa}
        onClose={() => setConfirmContabReversa(null)}
        title="Documento de reversa"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmContabReversa(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                const row = confirmContabReversa;
                if (row) void openContab(row, true);
              }}
            >
              Continuar
            </Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">
          Este documento proviene de una reversa. ¿Confirmas asignar cuentas y contabilizar?
        </p>
      </Modal>

      <Modal
        open={cargaOpen}
        onClose={() => setCargaOpen(false)}
        title="Preview carga masiva — Libro de ventas"
        size="xl"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCargaOpen(false)}>Cancelar</Button>
            <Button onClick={() => void confirmCarga()} disabled={cargaSaving || !cargaRows.some((r) => !r.exclude)}>
              {cargaSaving ? 'Importando…' : `Confirmar (${cargaRows.filter((r) => !r.exclude).length})`}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          CSV/TXT (máx. 2 MB y 1.000 filas): folio;tipo;cliente;fecha;neto.
          El folio es el del SII (o el interno si aún no hay oficial). Si ya cargó el 1–7
          y ahora sube el 1–14, las mismas facturas se marcan duplicadas (tipo + folio) y no se crean otra vez.
          Excel del RCV (.xlsx) aún no se lee aquí: exporte a CSV.
        </p>
        <div className="max-h-80 overflow-auto rounded border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">
              <tr>
                <th className="p-2">Incluir</th>
                <th className="p-2">Folio</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Cliente</th>
                <th className="p-2">Fecha</th>
                <th className="p-2 text-right">Neto</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cargaRows.map((r, i) => (
                <tr
                  key={`${r.line}-${r.folio}-${i}`}
                  className={r.error
                    ? 'bg-red-50 dark:bg-red-950/30'
                    : r.duplicate
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : undefined}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={!r.exclude}
                      disabled={Boolean(r.error)}
                      aria-label={`Incluir fila ${r.line}`}
                      onChange={(e) => setCargaRows((rows) => rows.map((x, j) => (j === i ? { ...x, exclude: !e.target.checked } : x)))}
                    />
                  </td>
                  <td className="p-2 font-mono text-xs">{r.folio}</td>
                  <td className="p-2">{r.tipo}</td>
                  <td className="p-2">{r.cliente}</td>
                  <td className="p-2">{r.fecha}</td>
                  <td className="p-2 text-right">{fmtCLP(r.neto)}</td>
                  <td className="p-2 text-xs">
                    {r.error
                      ? <span className="font-medium text-[var(--color-danger)]">{r.error}</span>
                      : r.duplicate
                        ? <span className="text-amber-700 dark:text-amber-300">Folio duplicado</span>
                        : 'Válida'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
      <Modal
        open={historialDoc != null}
        onClose={() => setHistorialDoc(null)}
        title="Historial de asociación"
        size="xl"
        footer={<Button variant="ghost" onClick={() => setHistorialDoc(null)}>Cerrar</Button>}
      >
        {historialDoc ? (() => {
          const hist = historialDocumentosAsociados(historialDoc, data);
          const facturaAnulada = Boolean(ncAnulacionDeFactura(hist));
          return (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              Documentos ligados a {historialDoc.tipo} {folioSiiOInterno(historialDoc)}
              {' '}(factura origen y todas las NC/ND).
            </p>
            <div className="max-h-[min(60vh,28rem)] overflow-auto rounded border border-[var(--color-border)]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="p-2">Rol</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Folio SII</th>
                    <th className="p-2">Folio interno</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">CodRef</th>
                    <th className="p-2 text-right">Neto</th>
                    <th className="p-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.map((d) => {
                    const origen = (d.tipo || '').toUpperCase() === 'FACTURA';
                    return (
                      <tr
                        key={d.id}
                        className={`border-t border-[var(--color-border)] ${
                          d.id === historialDoc.id ? 'bg-[var(--color-surface-2)]' : ''
                        }`}
                      >
                        <td className="p-2 text-xs">
                          {origen
                            ? 'Origen'
                            : esNcAnulacionTotal(d)
                              ? 'Anulación'
                              : 'Corrección'}
                        </td>
                        <td className="p-2">{d.tipo}</td>
                        <td className="p-2 font-mono text-xs">{d.folioOficial || '—'}</td>
                        <td className="p-2 font-mono text-xs">{d.folio}</td>
                        <td className="p-2">{fmtDate(d.fecha)}</td>
                        <td className="p-2 text-xs">{labelCodRefCorto(d.referenciaCod)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtCLP(d.neto)}</td>
                        <td className="p-2">
                          <div className="flex flex-col gap-0.5">
                            <EstadoDocumentoBadge
                              estado={d.estado}
                              label={
                                origen && facturaAnulada
                                  ? 'Anulada'
                                  : esDtePorContabilizar(d)
                                    ? 'Por contabilizar'
                                    : undefined
                              }
                              toneOverride={origen && facturaAnulada ? 'danger' : undefined}
                            />
                            <BillingSiiStatus r={d} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          );
        })() : null}
      </Modal>
      <DtePdfPreviewModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />
      <DteTrackerModal
        doc={trackerDoc}
        asociados={trackerDoc ? historialDocumentosAsociados(trackerDoc, data) : []}
        onClose={() => setTrackerDoc(null)}
      />
    </div>
  );
}

