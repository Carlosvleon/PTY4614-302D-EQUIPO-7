import type { SessionUser, UiTablePreference, CuentaContable } from '@/types/domain';
import type {
  CatalogExcelPreview,
  CatalogExcelPreviewItem,
  ImportResult,
} from '@/components/common/CatalogExcelImport';
import { readSelectedEmpresaId } from '@/lib/appSettings';
import { withBasePath } from '@/lib/basePath';
import { demoStore, resetDemoStore as resetDemoStoreInner } from './demo-store';
import { filasCatalogoDesdeHoja, type DemoCatalogFila } from './demo-catalog-excel';
import * as fx from './fixtures';
import * as aprobFx from './fixtures-aprobaciones-demo';
import { buildFlujoCaja, rollupFlujoDesdeDetalle, saldosPorBancoMoneda } from '@/features/tesoreria/flujo-caja';
import { debeSugerirTcBc, normalizeMonedaTc, tcDeFecha } from '@/features/tesoreria/tipo-cambio';
import type { CartolaPreview } from '@/features/tesoreria/cartola-periodo';

function cloneProveedores() {
  return structuredClone(fx.proveedores);
}

function cloneCcStore() {
  return structuredClone(fx.cuentaCorrienteMovimientos);
}

let mockProveedores = cloneProveedores();
let ccStore = cloneCcStore();
let mockDelegaciones = structuredClone(aprobFx.delegacionesAprobacionDemo);
let mockGrupos = structuredClone(aprobFx.gruposAprobacionDemo);
let mockEscalas = structuredClone(aprobFx.escalasAprobacionDemo);
let mockAdminConceptos = structuredClone(aprobFx.adminConceptosDemo);

function resetMockVolatileState() {
  mockProveedores = cloneProveedores();
  ccStore = cloneCcStore();
  mockDelegaciones = structuredClone(aprobFx.delegacionesAprobacionDemo);
  mockGrupos = structuredClone(aprobFx.gruposAprobacionDemo);
  mockEscalas = structuredClone(aprobFx.escalasAprobacionDemo);
  mockAdminConceptos = structuredClone(aprobFx.adminConceptosDemo);
}

export function resetDemoStore() {
  resetDemoStoreInner();
  resetMockVolatileState();
}

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

const TABLE_PREFS_PREFIX = 'erp.ui.tablePrefs.';

function tablePrefsStorageKey(tableKey: string): string {
  let userId = 'anon';
  try {
    const raw = localStorage.getItem('erp.session');
    const session = raw ? JSON.parse(raw) as { id?: string } : null;
    if (session?.id) userId = session.id;
  } catch { /* noop */ }
  return `${TABLE_PREFS_PREFIX}${userId}.${tableKey}`;
}
export async function login(email: string, password: string): Promise<SessionUser> {
  await delay(350);
  const u = fx.usuarios.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!u || !u.activo) {
    throw Object.assign(new Error('Credenciales inválidas'), { response: { status: 401 } });
  }
  if (password !== 'Admin123!' && password !== 'demo123') {
    throw Object.assign(new Error('Credenciales inválidas'), { response: { status: 401 } });
  }
  const r = fx.roles.find((x) => x.id === u.rolId)!;
  const emp = fx.empresas.find((x) => x.id === u.empresaId)!;
  const pinStored = Boolean(localStorage.getItem(`erp.pinAprobacion.${u.id}`));
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: r.nombre,
    rolId: u.rolId,
    empresa: emp.razonSocial,
    empresaId: u.empresaId,
    empresaIds: u.empresaIds ?? [u.empresaId],
    permisos: r.permisos,
    aprobarConPin: Boolean(r.aprobarConPin),
    tienePinAprobacion: Boolean(r.aprobarConPin) && pinStored,
    token: 'mock-erp-token',
  };
}

export async function getMe(): Promise<SessionUser> {
  await delay(150);
  let sessionId = fx.usuarios[0]?.id;
  try {
    const raw = localStorage.getItem('erp.session');
    const session = raw ? JSON.parse(raw) as { id?: string } : null;
    if (session?.id) sessionId = session.id;
  } catch { /* noop */ }
  const u = fx.usuarios.find((x) => x.id === sessionId) ?? fx.usuarios[0];
  const r = fx.roles.find((x) => x.id === u.rolId)!;
  const emp = fx.empresas.find((x) => x.id === u.empresaId)!;
  const pinStored = Boolean(localStorage.getItem(`erp.pinAprobacion.${u.id}`));
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: r.nombre,
    rolId: u.rolId,
    empresa: emp.razonSocial,
    empresaId: u.empresaId,
    empresaIds: u.empresaIds ?? [u.empresaId],
    permisos: r.permisos,
    aprobarConPin: Boolean(r.aprobarConPin),
    tienePinAprobacion: Boolean(r.aprobarConPin) && pinStored,
    token: 'mock-erp-token',
  };
}

export async function logout(): Promise<void> {
  await delay(100);
}

export async function updateProfile(data: { nombre: string }): Promise<void> {
  await delay(300);
  if (!data.nombre.trim()) {
    throw Object.assign(new Error('Nombre inválido'), { response: { status: 400 } });
  }
}

export async function changePassword(_password: string): Promise<void> {
  await delay(400);
}

// ---------------- Lecturas ----------------

export const getDashboardKPIs = async () => { await delay(); return demoStore.dashboardKpis; };
type DemoNotif = {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  monto?: number | null;
  href: string;
  fecha: string | null;
  leida: boolean;
  refKey: string;
};

const demoNotifState = new Map<string, boolean>();

function buildDemoNotificaciones(): DemoNotif[] {
  const ocs = demoStore.getAprobacionesOc().filter((a) => a.estado === 'PENDIENTE').slice(0, 10);
  return [
    ...ocs.map((o) => {
      const id = `oc:${o.id}`;
      return {
        id,
        tipo: 'OC_PENDIENTE',
        titulo: `OC ${o.ocNumero} pendiente`,
        detalle: `${o.proveedor} · ${o.solicitante}`,
        monto: o.monto,
        href: `/compras/aprobaciones?open=${encodeURIComponent(o.id)}`,
        fecha: o.fecha,
        leida: demoNotifState.get(id) ?? false,
        refKey: `oc-pend:${o.id}`,
      };
    }),
  ];
}

export const getNotificacionesPendientes = async () => {
  await delay();
  const items = buildDemoNotificaciones();
  return { total: items.filter((i) => !i.leida).length, totalItems: items.length, items };
};

export const setNotificacionLeida = async (id: string, leida: boolean) => {
  await delay();
  demoNotifState.set(id, leida);
  return { id, leida };
};

export const marcarTodasNotificacionesLeidas = async () => {
  await delay();
  for (const n of buildDemoNotificaciones()) demoNotifState.set(n.id, true);
  return { ok: true };
};
export const getTendenciaMensual = async () => { await delay(); return demoStore.tendenciaMensual; };
export const getEmpresas = async () => { await delay(); return demoStore.getEmpresas(); };
export const getUsuarios = async () => { await delay(); return demoStore.getUsuarios(); };
export const getRoles = async () => { await delay(); return demoStore.getRoles(); };
export const getMonedas = async () => { await delay(); return demoStore.getMonedas(); };
export const getUnidades = async () => { await delay(); return demoStore.getUnidades(); };
export const getCentrosCosto = async () => {
  await delay();
  const empresaId = readSelectedEmpresaId() ?? undefined;
  return demoStore.getCentrosCosto(empresaId);
};
export const getTiposDocumento = async () => { await delay(); return demoStore.getTiposDocumento(); };
export const getCuentas = async () => { await delay(); return demoStore.getCuentas(); };
export const getAreasNegocio = async () => {
  await delay();
  const empresaId = readSelectedEmpresaId() ?? undefined;
  return demoStore.getAreasNegocio(empresaId);
};
export async function createAreaNegocio(input: { codigo: string; nombre: string; activa?: boolean }) {
  await delay(200);
  return demoStore.createAreaNegocio(input);
}
export async function updateAreaNegocio(id: string, input: { codigo: string; nombre: string; activa?: boolean }) {
  await delay(200);
  return demoStore.updateAreaNegocio(id, input);
}
export async function getConceptosFlujo() {
  await delay();
  const empresaId = readSelectedEmpresaId() ?? undefined;
  return demoStore.getConceptosFlujo(empresaId);
}
export async function createConceptoFlujo(input: { codigo: string; nombre: string; orden?: number; activo?: boolean }) {
  await delay(200);
  return demoStore.createConceptoFlujo(input);
}
export async function updateConceptoFlujo(id: string, input: { codigo: string; nombre: string; orden?: number; activo?: boolean }) {
  await delay(200);
  return demoStore.updateConceptoFlujo(id, input);
}
export async function getCodigosFinancieros() {
  await delay();
  const empresaId = readSelectedEmpresaId() ?? undefined;
  return demoStore.getCodigosFinancieros(empresaId);
}
export async function createCodigoFinanciero(input: { codigo: string; nombre: string; activa?: boolean; conceptoId?: string }) {
  await delay(200);
  return demoStore.createCodigoFinanciero(input);
}
export async function updateCodigoFinanciero(id: string, input: { codigo: string; nombre: string; activa?: boolean; conceptoId?: string }) {
  await delay(200);
  return demoStore.updateCodigoFinanciero(id, input);
}
export async function getCuentaImpacto(_id?: string) {
  await delay();
  return {
    asientos: 0,
    asientosBorrador: 0,
    asientosContabilizados: 0,
    asientoEjemplos: [] as { numero: string; estado: string }[],
    hijos: 0,
    configsSii: 0,
    ordenesCompra: 0,
    documentos: 0,
    insumos: 0,
    vinculos: 0,
  };
}
export const getAsientos = async () => { await delay(); return demoStore.getAsientos(); };
export const getPeriodosContables = async () => { await delay(); return demoStore.getPeriodosContables(); };
export async function createPeriodoContable(input: Parameters<typeof demoStore.createPeriodoContable>[0]) {
  await delay(300);
  return demoStore.createPeriodoContable(input);
}
export async function updatePeriodoContable(id: string, input: Parameters<typeof demoStore.updatePeriodoContable>[1]) {
  await delay(300);
  return demoStore.updatePeriodoContable(id, input);
}
export async function abrirPeriodoContable(id: string, input?: { motivo?: string }) {
  await delay(200);
  return demoStore.abrirPeriodoContable(id, input);
}
export async function cerrarPeriodoContable(id: string) {
  await delay(200);
  return demoStore.cerrarPeriodoContable(id);
}
export async function getPeriodoContableEventos(id: string) {
  await delay();
  return demoStore.getPeriodoContableEventos(id);
}
export const getConfigContableSii = async () => { await delay(); return demoStore.getConfigContableSii(); };
export async function putConfigContableSii(input: Parameters<typeof demoStore.putConfigContableSii>[0]) {
  await delay(300);
  return demoStore.putConfigContableSii(input);
}
export async function previewCentralizacion(input: Parameters<typeof demoStore.previewCentralizacion>[0]) {
  await delay(400);
  return demoStore.previewCentralizacion(input);
}
export async function ejecutarCentralizacion(input: Parameters<typeof demoStore.ejecutarCentralizacion>[0]) {
  await delay(500);
  return demoStore.ejecutarCentralizacion(input);
}

export async function getLibroDiario(periodo: string) {
  await delay();
  return demoStore.getLibroDiario(periodo);
}

export async function getMayor(periodo: string, cuentaId?: string) {
  await delay();
  return demoStore.getMayor(periodo, cuentaId);
}

export async function getBalance8Columnas(periodo: string) {
  await delay();
  const filas = [
    {
      cuentaId: 'CT-2',
      codigo: '1-1-01-01',
      nombre: 'Caja General',
      sumasDebe: 15000000,
      sumasHaber: 3000000,
      saldoDeudor: 12000000,
      saldoAcreedor: 0,
      inventarioDeudor: 12000000,
      inventarioAcreedor: 0,
      resultadoDeudor: 0,
      resultadoAcreedor: 0,
    },
    {
      cuentaId: 'CT-10',
      codigo: '5-1-01-01',
      nombre: 'Ventas fruta',
      sumasDebe: 0,
      sumasHaber: 8500000,
      saldoDeudor: 0,
      saldoAcreedor: 8500000,
      inventarioDeudor: 0,
      inventarioAcreedor: 0,
      resultadoDeudor: 0,
      resultadoAcreedor: 8500000,
    },
  ];
  return {
    periodo,
    filas,
    totales: {
      sumasDebe: filas.reduce((s, f) => s + f.sumasDebe, 0),
      sumasHaber: filas.reduce((s, f) => s + f.sumasHaber, 0),
      saldoDeudor: filas.reduce((s, f) => s + f.saldoDeudor, 0),
      saldoAcreedor: filas.reduce((s, f) => s + f.saldoAcreedor, 0),
      inventarioDeudor: filas.reduce((s, f) => s + f.inventarioDeudor, 0),
      inventarioAcreedor: filas.reduce((s, f) => s + f.inventarioAcreedor, 0),
      resultadoDeudor: filas.reduce((s, f) => s + f.resultadoDeudor, 0),
      resultadoAcreedor: filas.reduce((s, f) => s + f.resultadoAcreedor, 0),
    },
  };
}

export async function getProveedores() {
  await delay();
  return [...mockProveedores];
}

export async function buscarContrapartePorRut(_rut: string): Promise<{
  rut: string;
  proveedor: { id: string; rut: string; razonSocial: string } | null;
  contratista: { id: string; rut: string; razonSocial: string } | null;
}> {
  await delay();
  return { rut: _rut, proveedor: null, contratista: null };
}

export async function getProveedor(id: string) {
  await delay();
  return mockProveedores.find((p) => p.id === id) ?? mockProveedores[0];
}

export async function createProveedor(input: Record<string, unknown>) {
  await delay(200);
  const dias = Number(input.condicionPagoDias);
  const ivaDia = Number(input.condicionIvaDia);
  const row = {
    id: `PROV-${Date.now()}`,
    rut: String(input.rut || ''),
    razonSocial: String(input.razonSocial || ''),
    giro: input.giro ? String(input.giro) : undefined,
    contacto: input.contacto ? String(input.contacto) : undefined,
    email: input.email ? String(input.email) : undefined,
    telefono: input.telefono ? String(input.telefono) : undefined,
    activo: input.activo !== false,
    condicionPagoDias: Number.isInteger(dias) && dias >= 1 ? dias : undefined,
    condicionIvaDia: Number.isInteger(ivaDia) && ivaDia >= 1 ? ivaDia : 10,
    monedaPago: String(input.monedaPago || 'CLP').trim().toUpperCase() || 'CLP',
  };
  mockProveedores.push(row);
  return row;
}

export async function updateProveedor(id: string, input: Record<string, unknown>) {
  await delay(200);
  const i = mockProveedores.findIndex((p) => p.id === id);
  if (i < 0) throw new Error('Proveedor no encontrado');
  const dias = Number(input.condicionPagoDias);
  const ivaDia = Number(input.condicionIvaDia);
  mockProveedores[i] = {
    ...mockProveedores[i],
    rut: String(input.rut ?? mockProveedores[i].rut),
    razonSocial: String(input.razonSocial ?? mockProveedores[i].razonSocial),
    giro: input.giro != null ? String(input.giro) : mockProveedores[i].giro,
    activo: input.activo !== false,
    ...(input.condicionPagoDias !== undefined
      ? { condicionPagoDias: Number.isInteger(dias) && dias >= 1 ? dias : undefined }
      : {}),
    ...(input.condicionIvaDia !== undefined
      ? { condicionIvaDia: Number.isInteger(ivaDia) && ivaDia >= 1 ? ivaDia : 10 }
      : {}),
    ...(input.monedaPago !== undefined
      ? { monedaPago: String(input.monedaPago || 'CLP').trim().toUpperCase() || 'CLP' }
      : {}),
  };
  return mockProveedores[i];
}
export const getMovimientosCaja = async () => { await delay(); return demoStore.getMovimientosCaja(); };
export async function getFlujoCaja(params?: { moneda?: string; periodo?: string }) {
  await delay();
  const aperturas = demoStore.getMovimientosCaja().filter((m) => m.esApertura);
  const cartolas = demoStore.getCartolasBancarias();
  const movimientos = cartolas.flatMap((c) => demoStore.getMovimientosCartola(c.id));
  const codigos = demoStore.getCodigosFinancieros();
  const conceptos = demoStore.getConceptosFlujo();
  return rollupFlujoDesdeDetalle({
    aperturas,
    cartolas,
    movimientos,
    codigos,
    conceptos,
    periodo: params?.periodo,
    moneda: params?.moneda,
  });
}
export async function getSaldosBancos() {
  await delay();
  const aperturas = demoStore.getMovimientosCaja().filter((m) => m.esApertura);
  const cartolas = demoStore.getCartolasBancarias();
  const movimientos = cartolas.flatMap((c) => demoStore.getMovimientosCartola(c.id));
  const filas = buildFlujoCaja({ aperturas, cartolas, movimientos });
  return { saldos: saldosPorBancoMoneda(filas) };
}
export async function createMovimientoCaja(input: Parameters<typeof demoStore.createMovimientoCaja>[0]) {
  await delay(300);
  return demoStore.createMovimientoCaja(input);
}
export async function corregirApertura(id: string, input: Parameters<typeof demoStore.corregirApertura>[1]) {
  await delay(300);
  return demoStore.corregirApertura(id, input);
}
export async function updateMovimientoCaja(id: string, input: Parameters<typeof demoStore.updateMovimientoCaja>[1]) {
  await delay(300);
  return demoStore.updateMovimientoCaja(id, input);
}
export async function deleteMovimientoCaja(id: string) {
  await delay(200);
  demoStore.deleteMovimientoCaja(id);
}
export const getPagos = async () => { await delay(); return demoStore.getPagos(); };
export const getConciliaciones = async () => { await delay(); return demoStore.getConciliaciones(); };
export async function createConciliacion(input: Parameters<typeof demoStore.createConciliacion>[0]) {
  await delay(300);
  return demoStore.createConciliacion(input);
}
export async function getMovimientosConciliacion(conciliacionId: string) {
  await delay();
  return demoStore.getMovimientosConciliacion(conciliacionId);
}
export async function desconciliarMovimiento(movimientoId: string) {
  await delay();
  return demoStore.desconciliarMovimiento(movimientoId);
}
export const getPresupuestos = async () => { await delay(); return demoStore.getPresupuestos(); };
export async function createPresupuesto(input: Parameters<typeof demoStore.createPresupuesto>[0]) {
  await delay(300);
  return demoStore.createPresupuesto(input);
}
export async function updatePresupuesto(id: string, input: Parameters<typeof demoStore.updatePresupuesto>[1]) {
  await delay(300);
  return demoStore.updatePresupuesto(id, input);
}
export async function deletePresupuesto(id: string) {
  await delay(200);
  demoStore.deletePresupuesto(id);
}
export const getContratistas = async () => { await delay(); return demoStore.getContratistas(); };
export async function getContratistaVigenciaHistorial(_contratistaId: string) {
  await delay();
  return [] as {
    id: string;
    activo: boolean;
    vigenciaHasta: string | null;
    registradoAt: string;
    usuarioNombre: string;
  }[];
}
export const getLabores = async (_options?: { incluirInactivas?: boolean }) => {
  await delay();
  return demoStore.getLabores();
};
export const getActividades = async (
  laborId?: string,
  _options?: { incluirInactivas?: boolean },
) => {
  await delay();
  return demoStore.getActividades(laborId);
};
export const getTiposContratoContratista = async () => {
  await delay();
  return demoStore.getTiposContratoContratista();
};
export const getTarifasContratista = async (contratistaId?: string) => {
  await delay();
  return demoStore.getTarifasContratista(contratistaId);
};
export const getProformasContratista = async (opts?: { periodo?: string; estado?: string }) => {
  await delay();
  let list = demoStore.getProformasContratista(opts?.periodo);
  const est = opts?.estado?.toUpperCase();
  if (est === 'FACTURADAS') list = list.filter((p) => p.estado === 'FACTURADA');
  if (est === 'PENDIENTES') list = list.filter((p) => p.estado !== 'FACTURADA');
  return list;
};
export async function getSiguienteNumeroProforma() {
  await delay(100);
  const list = demoStore.getProformasContratista();
  let max = 0;
  for (const p of list) {
    const m = /^PF-(\d+)$/i.exec(p.numero);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return { numero: `PF-${String(max + 1).padStart(5, '0')}` };
}
export const getOrdenesCompra = async () => { await delay(); return demoStore.getOrdenesCompra(); };
export const getAprobacionesOc = async () => { await delay(); return demoStore.getAprobacionesOc(); };
export const getRecepcionesOc = async () => { await delay(); return demoStore.getRecepcionesOc(); };
export async function createRecepcionOc(input: Parameters<typeof demoStore.createRecepcionOc>[0]) {
  await delay(300);
  return demoStore.createRecepcionOc(input);
}
export async function updateRecepcionOc(id: string, input: Parameters<typeof demoStore.updateRecepcionOc>[1]) {
  await delay(300);
  return demoStore.updateRecepcionOc(id, input);
}
export const getRegistrosCompra = async () => { await delay(); return demoStore.getRegistrosCompra(); };
export const getInsumos = async () => { await delay(); return demoStore.getInsumos(); };
export const getInsumoStockBodegas = async (id: string) => {
  await delay();
  const ins = demoStore.getInsumos().find((i: { id: string }) => i.id === id);
  const bodegas = demoStore.getBodegas();
  const stockMap = fx.insumoStockBodega[id] ?? {};
  return {
    insumoId: id,
    codigo: ins?.codigo ?? '',
    nombre: ins?.nombre ?? '',
    costoPromedio: Number(ins?.costoPromedio ?? 0),
    stockTotal: Number(ins?.stock ?? 0),
    bodegas: bodegas.map((b: { id: string; codigo: string; nombre: string }) => {
      const cantidad = Number(stockMap[b.id] ?? 0);
      return {
        bodegaId: b.id,
        codigo: b.codigo,
        nombre: b.nombre,
        cantidad,
        reservado: 0,
        disponible: cantidad,
      };
    }),
  };
};

export const getStockPorBodega = async (bodegaId: string) => {
  await delay();
  const bodega = demoStore.getBodegas().find((b: { id: string }) => b.id === bodegaId);
  const insumos = demoStore.getInsumos();
  const productos = insumos
    .map((ins: { id: string; codigo: string; nombre: string; unidad: string; inventariable?: boolean }) => {
      const cantidad = Number(fx.insumoStockBodega[ins.id]?.[bodegaId] ?? 0);
      if (cantidad <= 0) return null;
      return {
        insumoId: ins.id,
        codigo: ins.codigo,
        nombre: ins.nombre,
        unidad: ins.unidad,
        inventariable: ins.inventariable !== false,
        cantidad,
        reservado: 0,
        disponible: cantidad,
      };
    })
    .filter(Boolean);
  return {
    bodegaId,
    codigo: bodega?.codigo ?? '',
    nombre: bodega?.nombre ?? '',
    productos,
  };
};

export const liberarReservaStock = async (_id: string) => {
  await delay();
  return { ok: true };
};

export const getBodegas = async () => { await delay(); return demoStore.getBodegas(); };
export const getMovimientosBodega = async () => { await delay(); return demoStore.getMovimientosBodega(); };
export const getElementosCosto = async () => { await delay(); return demoStore.getElementosCosto(); };
export const getFactoresHonorario = async () => { await delay(); return demoStore.getFactoresHonorario(); };
export const getIndicadoresBc = async (params?: { desde?: string; hasta?: string }) => {
  await delay();
  let rows = demoStore.getIndicadoresBc();
  if (params?.desde) rows = rows.filter((r) => r.fecha >= params.desde!);
  if (params?.hasta) rows = rows.filter((r) => r.fecha <= params.hasta!);
  return rows;
};
export async function getBcSeries() {
  await delay();
  return [
    { codigo: 'dolar', nombre: 'Dólar observado', unidad: 'Pesos', valorActual: 970, mapeoErp: 'USD' as const, seleccionable: true },
    { codigo: 'euro', nombre: 'Euro', unidad: 'Pesos', valorActual: 1050, mapeoErp: 'EUR' as const, seleccionable: true },
    { codigo: 'yuan', nombre: 'Yuan (CNY)', unidad: 'Pesos', valorActual: 134, mapeoErp: 'CNY' as const, seleccionable: true },
  ];
}
export const getClientes = async () => { await delay(); return demoStore.getClientes(); };
export async function getCliente(id: string) {
  await delay();
  return demoStore.getClientes().find((c) => c.id === id) ?? demoStore.getClientes()[0];
}
export const getProspectos = async () => { await delay(); return demoStore.getProspectos(); };
export const getDocumentos = async (params?: {
  mias?: boolean;
  tipo?: string;
  estado?: string;
}) => {
  await delay();
  let rows = demoStore.getDocumentos();
  if (params?.tipo) {
    const t = params.tipo.toUpperCase();
    rows = rows.filter((d) => d.tipo === t);
  }
  if (params?.estado) {
    const estados = params.estado.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (estados.length) rows = rows.filter((d) => estados.includes(d.estado));
  }
  // Demo: sin sesión real; mias no filtra por usuario (queda tipado para el API real).
  return rows;
};
export const getWorkflows = async () => { await delay(); return demoStore.getWorkflows(); };
export async function getLibroComercial(ambito: 'ventas' | 'compras' | 'despachos' = 'ventas') {
  await delay();
  if (ambito === 'compras') {
    return demoStore.getRegistrosCompra().map((r) => ({
      id: r.id,
      ambito: 'compras' as const,
      folio: r.factura,
      tipo: 'COMPRA',
      contraparte: r.proveedorFactura,
      fecha: new Date().toISOString().slice(0, 10),
      neto: r.monto,
      estado: r.estado,
      origenRef: r.ocNumero,
    }));
  }
  if (ambito === 'despachos') {
    return demoStore.getDocumentos()
      .filter((d) => d.tipo === 'GUIA')
      .map((r) => ({
        id: r.id,
        ambito: 'despachos' as const,
        folio: r.folio,
        tipo: 'GUIA',
        contraparte: r.cliente,
        fecha: r.fecha,
        neto: r.neto,
        estado: r.estado,
        origenRef: r.folioOrigen,
      }));
  }
  return demoStore.getDocumentos().map((r) => ({
    id: r.id,
    ambito: 'ventas' as const,
    folio: r.folio,
    tipo: r.tipo,
    contraparte: r.cliente,
    fecha: r.fecha,
    neto: r.neto,
    estado: r.estado,
    origenRef: r.folioOrigen,
  }));
}
export async function getGuiasDespacho() {
  return getLibroComercial('despachos');
}
export async function createGuiaDespacho(input: {
  folio: string;
  cliente: string;
  fecha: string;
  monto?: number;
  estado?: string;
}) {
  await delay();
  return {
    id: `gd-${Date.now()}`,
    ambito: 'despachos' as const,
    folio: input.folio,
    tipo: 'GD',
    contraparte: input.cliente,
    fecha: input.fecha,
    neto: input.monto ?? 0,
    estado: input.estado ?? 'BORRADOR',
  };
}
function normRut(rut: string): string {
  return (rut || '').replace(/[.\s-]/g, '').toUpperCase();
}

function formatRutDemo(rut: string): string {
  const n = normRut(rut);
  if (n.length < 2) return rut;
  return `${n.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${n.slice(-1)}`;
}

function splitCalceDemo(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[,;|/]+|\s+/).map((s) => s.trim()).filter(Boolean);
}

function isCalceLibreDemo(raw?: string | null): boolean {
  const s = raw?.trim();
  if (!s) return true;
  return /^cartola\b/i.test(s);
}

function identitiesByRutDemo() {
  const map = new Map<string, {
    rutNorm: string;
    nombre: string;
    clienteId?: string;
    clienteNombre?: string;
    proveedorId?: string;
    proveedorNombre?: string;
    esProductor?: boolean;
  }>();
  const idToRut = new Map<string, string>();
  for (const c of fx.clientes) {
    const rutNorm = normRut(c.rut);
    const cur = map.get(rutNorm) ?? { rutNorm, nombre: c.razonSocial };
    cur.clienteId = c.id;
    cur.clienteNombre = c.razonSocial;
    cur.nombre = c.razonSocial;
    cur.esProductor = cur.esProductor || Boolean(c.esProductor);
    map.set(rutNorm, cur);
    idToRut.set(`CLIENTE:${c.id}`, rutNorm);
  }
  for (const p of mockProveedores) {
    const rutNorm = normRut(p.rut);
    const cur = map.get(rutNorm) ?? { rutNorm, nombre: p.razonSocial };
    cur.proveedorId = p.id;
    cur.proveedorNombre = p.razonSocial;
    cur.nombre = cur.clienteNombre && cur.clienteNombre !== p.razonSocial
      ? `${cur.clienteNombre} / ${p.razonSocial}`
      : cur.nombre || p.razonSocial;
    cur.esProductor = cur.esProductor || Boolean(p.esProductor);
    map.set(rutNorm, cur);
    idToRut.set(`PROVEEDOR:${p.id}`, rutNorm);
    idToRut.set(`PRODUCTOR:${p.id}`, rutNorm);
  }
  return { map, idToRut };
}

function rutKeyDemo(tipo: string, id: string, idToRut: Map<string, string>): string {
  return idToRut.get(`${tipo}:${id}`)
    || idToRut.get(`CLIENTE:${id}`)
    || idToRut.get(`PROVEEDOR:${id}`)
    || idToRut.get(`PRODUCTOR:${id}`)
    || (normRut(id).length >= 8 ? normRut(id) : `__orphan:${tipo}:${id}`);
}

function linkTargetDemo(r: {
  documentoRef?: string;
  documentoTipo?: string;
  origen?: string;
  pagoId?: string;
  documentoComercialId?: string;
  registroCompraId?: string;
  movimientoCartolaId?: string;
}) {
  const ref = r.documentoRef?.trim();
  if (!ref || r.documentoTipo === 'AJUSTE' || r.origen === 'AJUSTE') return null;
  const q = encodeURIComponent(ref);
  const origen = (r.origen ?? '').toUpperCase();
  if (r.documentoComercialId || origen === 'VENTA') {
    return { tipo: 'LIBRO_VENTAS', to: `/comercial/libro?q=${q}&todos=1`, label: ref };
  }
  if (r.registroCompraId || origen === 'COMPRA') {
    return { tipo: 'LIBRO_COMPRAS', to: `/compras/libro?q=${q}`, label: ref };
  }
  if (r.pagoId || origen === 'PAGO' || origen === 'TESORERIA' || origen === 'ANTICIPO') {
    return { tipo: 'PAGO', to: `/tesoreria/pagos?q=${encodeURIComponent(r.pagoId || ref)}`, label: ref };
  }
  return { tipo: 'LIBRO_VENTAS', to: `/comercial/libro?q=${q}&todos=1`, label: ref };
}

export async function getCuentasCorrientes(opts?: {
  terceroTipo?: string;
  q?: string;
  soloConSaldo?: boolean;
  periodo?: string;
}) {
  await delay();
  const { map: identities, idToRut } = identitiesByRutDemo();
  const agg = new Map<string, {
    _key: string;
    rut: string;
    rutDisplay: string;
    nombre: string;
    clienteId?: string;
    clienteNombre?: string;
    proveedorId?: string;
    proveedorNombre?: string;
    roles: string[];
    terceroTipo: string;
    terceroId: string;
    terceroNombre: string;
    debe: number;
    haber: number;
    saldo: number;
    saldoCliente: number;
    saldoProveedor: number;
    movimientos: number;
    ultimaFecha: string;
  }>();
  const roles = new Map<string, Set<string>>();
  for (const r of ccStore) {
    if (opts?.periodo && r.fecha.slice(0, 7) > opts.periodo) continue;
    const key = rutKeyDemo(r.terceroTipo, r.terceroId, idToRut);
    const ident = identities.get(key);
    const set = roles.get(key) ?? new Set<string>();
    if (ident?.clienteId) set.add('CLIENTE');
    if (ident?.proveedorId) set.add('PROVEEDOR');
    if (ident?.esProductor) set.add('PRODUCTOR');
    set.add(r.terceroTipo);
    roles.set(key, set);
    const cur = agg.get(key) ?? {
      _key: key,
      rut: ident?.rutNorm ?? (key.startsWith('__orphan:') ? '' : key),
      rutDisplay: ident ? formatRutDemo(ident.rutNorm) : r.terceroId,
      nombre: ident?.nombre ?? r.terceroNombre,
      clienteId: ident?.clienteId,
      clienteNombre: ident?.clienteNombre,
      proveedorId: ident?.proveedorId,
      proveedorNombre: ident?.proveedorNombre,
      roles: [],
      terceroTipo: r.terceroTipo,
      terceroId: ident?.clienteId || ident?.proveedorId || r.terceroId,
      terceroNombre: ident?.nombre ?? r.terceroNombre,
      debe: 0,
      haber: 0,
      saldo: 0,
      saldoCliente: 0,
      saldoProveedor: 0,
      movimientos: 0,
      ultimaFecha: r.fecha,
    };
    cur.debe += r.debe;
    cur.haber += r.haber;
    cur.saldo += r.debe - r.haber;
    if (r.terceroTipo === 'CLIENTE') cur.saldoCliente += r.debe - r.haber;
    else cur.saldoProveedor += r.debe - r.haber;
    cur.movimientos += 1;
    cur.ultimaFecha = r.fecha;
    agg.set(key, cur);
  }
  let items = [...agg.values()].map((i) => {
    const { _key, ...rest } = i as typeof i & { _key: string };
    return { ...rest, roles: [...(roles.get(_key) ?? new Set([rest.terceroTipo]))] };
  });
  if (opts?.terceroTipo) items = items.filter((i) => i.roles.includes(opts.terceroTipo!));
  if (opts?.q) {
    const qLow = opts.q.toLowerCase();
    const qNorm = normRut(opts.q).toLowerCase();
    items = items.filter((i) =>
      `${i.nombre} ${i.clienteNombre ?? ''} ${i.proveedorNombre ?? ''} ${i.rut} ${i.rutDisplay}`.toLowerCase().includes(qLow)
      || (qNorm.length >= 3 && i.rut.toLowerCase().includes(qNorm)),
    );
  }
  if (opts?.soloConSaldo) {
    items = items.filter((i) => Math.abs(i.saldo) > 0.0001 || Math.abs(i.saldoCliente) > 0.0001 || Math.abs(i.saldoProveedor) > 0.0001);
  }
  return items;
}

export async function getEstadoCuentaPorRut(
  rut: string,
  opts?: { filtro?: 'PENDIENTE' | 'HISTORICO' | 'TODOS'; periodo?: string },
) {
  await delay();
  const rutNorm = normRut(rut);
  const { map: identities, idToRut } = identitiesByRutDemo();
  const ident = identities.get(rutNorm);
  if (!ident) {
    throw new Error('RUT no encontrado en la empresa (ni cliente ni proveedor)');
  }
  const rows = ccStore
    .filter((r) => rutKeyDemo(r.terceroTipo, r.terceroId, idToRut) === rutNorm)
    .filter((r) => !opts?.periodo || r.fecha.slice(0, 7) <= opts.periodo)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pagos = fx.pagos;
  const aging = fx.documentosAging;
  let running = 0;
  const movimientos = rows.map((r) => {
    running += r.debe - r.haber;
    const folio = r.documentoRef ?? '';
    const calces: Array<{ tipo: 'PAGO' | 'ANTICIPO'; id: string; ref: string; label: string; to: string }> = [];
    const origen = (r.origen ?? '').toUpperCase();
    const esDeuda = origen === 'VENTA' || origen === 'COMPRA' || r.documentoTipo === 'FACTURA';
    const esPago = origen === 'PAGO' || origen === 'TESORERIA' || origen === 'ANTICIPO' || r.documentoTipo === 'PAGO';
    for (const p of pagos) {
      if (isCalceLibreDemo(p.documentosCalce)) continue;
      const refs = splitCalceDemo(p.documentosCalce);
      const hitId = r.pagoId && p.id === r.pagoId;
      const hitFolio = folio && refs.some((x) => x.toUpperCase() === folio.toUpperCase());
      if (hitId || hitFolio) {
        const tipoPago = (p.tipo ?? '').toUpperCase();
        const esAnt = tipoPago.includes('ANTICIPO');
        calces.push({
          tipo: esAnt ? 'ANTICIPO' : 'PAGO',
          id: p.id,
          ref: refs[0] ?? p.id,
          label: esAnt ? `Anticipo ${p.documentosCalce}` : `Pago ${p.documentosCalce}`,
          to: `/tesoreria/pagos?q=${encodeURIComponent(p.id)}`,
        });
      }
    }
    const age = aging.find((a) => a.documento.toUpperCase() === folio.toUpperCase());
    let estadoLiquidacion: 'PENDIENTE' | 'CALZADO' = 'PENDIENTE';
    if (esDeuda && age && Number(age.saldo) <= 0.0001 && Number(age.montoPagado ?? 0) > 0) {
      estadoLiquidacion = 'CALZADO';
    } else if (esPago && r.pagoId) {
      const p = pagos.find((x) => x.id === r.pagoId);
      if (p && !isCalceLibreDemo(p.documentosCalce)) estadoLiquidacion = 'CALZADO';
    }
    return {
      ...r,
      folio,
      saldo: running,
      estadoLiquidacion,
      estadoCalce: estadoLiquidacion,
      calces,
      linkTarget: linkTargetDemo(r),
    };
  });
  const filtro = opts?.filtro ?? 'TODOS';
  const filtered = filtro === 'TODOS'
    ? movimientos
    : movimientos.filter((m) => (filtro === 'HISTORICO' ? m.estadoLiquidacion === 'CALZADO' : m.estadoLiquidacion !== 'CALZADO'));
  const saldoCliente = movimientos.filter((m) => m.terceroTipo === 'CLIENTE').reduce((a, m) => a + m.debe - m.haber, 0);
  const saldoProveedor = movimientos.filter((m) => m.terceroTipo !== 'CLIENTE').reduce((a, m) => a + m.debe - m.haber, 0);
  const roles = [
    ident.clienteId ? 'CLIENTE' as const : null,
    ident.proveedorId ? 'PROVEEDOR' as const : null,
    ident.esProductor ? 'PRODUCTOR' as const : null,
  ].filter(Boolean) as Array<'CLIENTE' | 'PROVEEDOR' | 'PRODUCTOR'>;
  return {
    rut: rutNorm,
    rutDisplay: formatRutDemo(rutNorm),
    nombre: ident.nombre,
    cliente: ident.clienteId ? { id: ident.clienteId, razonSocial: ident.clienteNombre ?? ident.nombre } : null,
    proveedor: ident.proveedorId ? { id: ident.proveedorId, razonSocial: ident.proveedorNombre ?? ident.nombre } : null,
    roles,
    dual: Boolean(ident.clienteId && ident.proveedorId),
    saldoCliente,
    saldoProveedor,
    saldoNeto: saldoCliente + saldoProveedor,
    movimientos: filtered,
  };
}
export async function getCuentaCorrienteMovimientos(terceroId: string, opts?: { terceroTipo?: string }) {
  await delay();
  return ccStore.filter(
    (r) => r.terceroId === terceroId && (!opts?.terceroTipo || r.terceroTipo === opts.terceroTipo),
  );
}
export async function createCuentaCorrienteAjuste(input: {
  terceroTipo: string;
  terceroId: string;
  terceroNombre: string;
  fecha: string;
  debe?: number;
  haber?: number;
  glosa?: string;
}) {
  await delay();
  const prev = [...ccStore]
    .reverse()
    .find((r) => r.terceroId === input.terceroId && r.terceroTipo === input.terceroTipo);
  const debe = input.debe ?? 0;
  const haber = input.haber ?? 0;
  const saldo = (prev?.saldo ?? 0) + debe - haber;
  const row = {
    id: `cc-${Date.now()}`,
    terceroTipo: input.terceroTipo,
    terceroId: input.terceroId,
    terceroNombre: input.terceroNombre,
    fecha: input.fecha,
    documentoRef: 'AJUSTE',
    documentoTipo: 'AJUSTE',
    debe,
    haber,
    saldo,
    glosa: input.glosa,
    origen: 'AJUSTE',
  };
  ccStore.push(row);
  return row;
}
export const getReportesContables = async () => { await delay(); return demoStore.getReportesContables(); };

// ---------------- Escrituras (admin) ----------------

export async function createEmpresa(input: Parameters<typeof demoStore.createEmpresa>[0]) {
  await delay(300);
  return demoStore.createEmpresa(input);
}

export async function updateEmpresa(id: string, input: Parameters<typeof demoStore.updateEmpresa>[1]) {
  await delay(300);
  return demoStore.updateEmpresa(id, input);
}

export async function createMoneda(input: Parameters<typeof demoStore.createMoneda>[0]) {
  await delay(300);
  return demoStore.createMoneda(input);
}

export async function updateMoneda(id: string, input: Parameters<typeof demoStore.updateMoneda>[1]) {
  await delay(300);
  return demoStore.updateMoneda(id, input);
}

export async function createUnidad(input: Parameters<typeof demoStore.createUnidad>[0]) {
  await delay(300);
  return demoStore.createUnidad(input);
}

export async function updateUnidad(id: string, input: Parameters<typeof demoStore.updateUnidad>[1]) {
  await delay(300);
  return demoStore.updateUnidad(id, input);
}

export async function createTipoDocumento(input: Parameters<typeof demoStore.createTipoDocumento>[0]) {
  await delay(300);
  return demoStore.createTipoDocumento(input);
}

export async function updateTipoDocumento(id: string, input: Parameters<typeof demoStore.updateTipoDocumento>[1]) {
  await delay(300);
  return demoStore.updateTipoDocumento(id, input);
}

export async function createCentroCosto(input: Parameters<typeof demoStore.createCentroCosto>[0]) {
  await delay(300);
  return demoStore.createCentroCosto(input);
}

export async function updateCentroCosto(id: string, input: Parameters<typeof demoStore.updateCentroCosto>[1]) {
  await delay(300);
  return demoStore.updateCentroCosto(id, input);
}

export async function createUsuario(input: Parameters<typeof demoStore.createUsuario>[0]) {
  await delay(300);
  return demoStore.createUsuario(input);
}

export async function updateUsuario(id: string, input: Parameters<typeof demoStore.updateUsuario>[1]) {
  await delay(300);
  return demoStore.updateUsuario(id, input);
}

export async function createRol(input: Parameters<typeof demoStore.createRol>[0]) {
  await delay(300);
  return demoStore.createRol(input);
}

export async function updateRol(id: string, input: Parameters<typeof demoStore.updateRol>[1]) {
  await delay(300);
  return demoStore.updateRol(id, input);
}

export async function deleteRol(
  id: string,
  reasignaciones: { usuarioId: string; nuevoRolId: string }[] = [],
) {
  await delay(300);
  return demoStore.deleteRol(id, reasignaciones);
}

// ---------------- Escrituras (contratistas) ----------------

export async function createContratista(input: Parameters<typeof demoStore.createContratista>[0]) {
  await delay(300);
  return demoStore.createContratista(input);
}

export async function updateContratista(id: string, input: Parameters<typeof demoStore.updateContratista>[1]) {
  await delay(300);
  return demoStore.updateContratista(id, input);
}

export async function createLabor(input: Parameters<typeof demoStore.createLabor>[0]) {
  await delay(300);
  return demoStore.createLabor(input);
}

export async function updateLabor(id: string, input: Parameters<typeof demoStore.updateLabor>[1]) {
  await delay(300);
  return demoStore.updateLabor(id, input);
}

export async function createActividad(input: Parameters<typeof demoStore.createActividad>[0]) {
  await delay(300);
  return demoStore.createActividad(input);
}

export async function updateActividad(id: string, input: Parameters<typeof demoStore.updateActividad>[1]) {
  await delay(300);
  return demoStore.updateActividad(id, input);
}

export async function linkLaborActividad(laborId: string, actividadId: string) {
  await delay(200);
  demoStore.linkLaborActividad(laborId, actividadId);
}

export async function unlinkLaborActividad(laborId: string, actividadId: string) {
  await delay(200);
  demoStore.unlinkLaborActividad(laborId, actividadId);
}

export async function createTipoContratoContratista(
  input: Parameters<typeof demoStore.createTipoContratoContratista>[0],
) {
  await delay(300);
  return demoStore.createTipoContratoContratista(input);
}

export async function updateTipoContratoContratista(
  id: string,
  input: Parameters<typeof demoStore.updateTipoContratoContratista>[1],
) {
  await delay(300);
  return demoStore.updateTipoContratoContratista(id, input);
}

export async function createTarifaContratista(input: Parameters<typeof demoStore.createTarifaContratista>[0]) {
  await delay(300);
  return demoStore.createTarifaContratista(input);
}

export async function updateTarifaContratista(id: string, input: Parameters<typeof demoStore.updateTarifaContratista>[1]) {
  await delay(300);
  return demoStore.updateTarifaContratista(id, input);
}

export async function patchTarifaContratistaInline(id: string, input: { tarifa: number; vigenciaDesde?: string }) {
  await delay(300);
  const row = demoStore.getTarifasContratista().find((t) => t.id === id);
  if (!row) throw new Error('Tarifa no encontrada');
  return demoStore.updateTarifaContratista(id, {
    contratistaId: row.contratistaId,
    laborId: row.laborId,
    actividadId: row.actividadId,
    tarifa: input.tarifa,
    unidad: row.unidad,
    centroCostoId: row.centroCostoId,
    tipoContratoId: row.tipoContratoId,
    vigenciaDesde: input.vigenciaDesde ?? row.vigenciaDesde,
    vigenciaHasta: row.vigenciaHasta,
  });
}

export async function deleteTarifaContratista(id: string) {
  await delay(200);
  demoStore.deleteTarifaContratista(id);
}

export async function createProformaContratista(input: Parameters<typeof demoStore.createProformaContratista>[0]) {
  await delay(300);
  return demoStore.createProformaContratista(input);
}

export async function previewProformaContratista(
  input: Parameters<typeof demoStore.previewProformaContratista>[0],
) {
  await delay(200);
  return demoStore.previewProformaContratista(input);
}

export async function updateProformaContratista(id: string, input: Parameters<typeof demoStore.updateProformaContratista>[1]) {
  await delay(300);
  return demoStore.updateProformaContratista(id, input);
}

export async function deleteProformaContratista(id: string) {
  await delay(200);
  demoStore.deleteProformaContratista(id);
}

export async function marcarProformaDefinitiva(
  id: string,
  _input?: { aprobadorId: string },
) {
  await delay(300);
  return demoStore.marcarProformaDefinitiva(id);
}

export async function aprobarProformaDefinitiva(id: string) {
  await delay(300);
  return demoStore.marcarProformaDefinitiva(id);
}

export async function asociarFacturaProforma(
  id: string,
  input: {
    numero?: string;
    fecha?: string;
    montoNeto?: number;
    proformaIds?: string[];
    registroCompraId?: string;
  },
) {
  await delay(300);
  if (input.registroCompraId) {
    return demoStore.asociarFacturaProforma(id, {
      numero: input.numero,
      fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
      proformaIds: input.proformaIds,
    });
  }
  return demoStore.asociarFacturaProforma(id, {
    numero: input.numero,
    fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
    montoNeto: input.montoNeto,
    proformaIds: input.proformaIds,
  });
}

export async function reversarProforma(id: string, claveReversa: string) {
  await delay(300);
  return demoStore.reversarProformaContratista(id, claveReversa);
}

export async function reemitirProforma(
  id: string,
  input: Parameters<typeof demoStore.reemitirProforma>[1],
) {
  await delay(300);
  return demoStore.reemitirProforma(id, input);
}

export async function setPinAprobacion(pin: string, password: string) {
  await delay(200);
  if (!password?.trim()) {
    throw new Error('Debes ingresar la contraseña de tu cuenta');
  }
  if (!/^\d{4}$/.test(pin.trim())) {
    throw new Error('El PIN debe ser exactamente 4 dígitos numéricos');
  }
  let sessionId = 'U-1';
  try {
    const raw = localStorage.getItem('erp.session');
    const session = raw ? JSON.parse(raw) as { id?: string } : null;
    if (session?.id) sessionId = session.id;
  } catch { /* noop */ }
  localStorage.setItem(`erp.pinAprobacion.${sessionId}`, pin.trim());
  return {
    message: 'PIN de aprobación actualizado',
    tienePinAprobacion: true,
    aprobarConPin: true,
  };
}

export const getIngresosLaborDiario = async () => { await delay(); return demoStore.getIngresosLaborDiario(); };
export async function createIngresoLaborDiario(input: Parameters<typeof demoStore.createIngresoLaborDiario>[0]) {
  await delay(300);
  return demoStore.createIngresoLaborDiario(input);
}
export async function updateIngresoLaborDiario(id: string, input: Parameters<typeof demoStore.updateIngresoLaborDiario>[1]) {
  await delay(300);
  return demoStore.updateIngresoLaborDiario(id, input);
}
export async function deleteIngresoLaborDiario(id: string) {
  await delay(200);
  demoStore.deleteIngresoLaborDiario(id);
}

export async function aprobarIngresoLaborDiario(id: string) {
  await delay(200);
  const row = demoStore.getIngresosLaborDiario().find((r) => r.id === id);
  if (!row) throw new Error('Ingreso no encontrado');
  return demoStore.updateIngresoLaborDiario(id, {
    fecha: row.fecha,
    contratistaId: row.contratistaId,
    centroCostoId: row.centroCostoId,
    laborId: row.laborId,
    actividadId: row.actividadId,
    tipoJornada: row.tipoJornada,
    cantidad: row.cantidad,
  });
}
export async function asociarIngresosAProforma(ingresoIds: string[], proformaId: string) {
  await delay(300);
  return demoStore.asociarIngresosAProforma(ingresoIds, proformaId);
}

export const getCartolasBancarias = async () => { await delay(); return demoStore.getCartolasBancarias(); };
export async function createCartolaBancaria(input: Parameters<typeof demoStore.createCartolaBancaria>[0]) {
  await delay(300);
  return demoStore.createCartolaBancaria(input);
}
export async function deleteCartolaBancaria(id: string) {
  await delay(200);
  demoStore.deleteCartolaBancaria(id);
}
export async function getMovimientosCartola(cartolaId: string) {
  await delay();
  return demoStore.getMovimientosCartola(cartolaId);
}
export async function contabilizarMovimientoCartola(
  movimientoId: string,
  input: {
    cuentaContraId: string;
    destinoTipo: string;
    codigoFinancieroId: string;
    tipoDocumento?: string;
    folioDocumento?: string;
    proveedorId?: string;
    clienteId?: string;
    centroCostoId?: string;
    areaNegocioId?: string;
    elementoCostoId?: string;
    tcManual?: number;
    nominaSemana?: string;
  },
) {
  await delay(300);
  return demoStore.contabilizarMovimientoCartola(movimientoId, input);
}
export async function asociarNominaCartola(input: { ids: string[]; nominaSemana: string }) {
  await delay(200);
  return demoStore.asociarNominaCartola(input);
}
export async function lookupDocumentoCartola(opts: {
  folio: string;
  tipoDocumento?: string;
  sentido?: string;
}) {
  await delay(150);
  return demoStore.lookupDocumentoCartola(opts);
}
export async function calcularDiferenciaTc(opts: {
  monto: number;
  documentosCalce?: string;
  tcPago?: number;
  tcDocumento?: number;
  fecha?: string;
  monedaPago?: string;
  monedaFactura?: string;
  sentido?: string;
}) {
  await delay(100);
  return demoStore.calcularDiferenciaTc(opts);
}
export async function cerrarCartolaBancaria(id: string) {
  await delay(300);
  return demoStore.cerrarCartolaBancaria(id);
}

export async function previewCartolaArchivo(file: File): Promise<CartolaPreview> {
  await delay(300);
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const data = lines.slice(lines[0]?.toLowerCase().includes('fecha') ? 1 : 0);
  const lineas = data.map((line, i) => {
    const p = line.split(/[;,\t]/).map((x) => x.trim());
    const monto = Number(p[2] || 0);
    return {
      fecha: p[0] || new Date().toISOString().slice(0, 10),
      referencia: p[3] || `MOV-${i + 1}`,
      glosa: p[1] || `Movimiento ${i + 1}`,
      monto: Math.abs(monto),
      tipo: (monto < 0 ? 'EGRESO' : 'INGRESO') as 'INGRESO' | 'EGRESO',
    };
  }).filter((l) => l.monto > 0);
  const fechas = lineas.map((l) => l.fecha);
  const yms = fechas.map((f) => f.slice(0, 7)).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort();
  const ym = yms[0];
  return {
    archivoNombre: file.name,
    formatoDetectado: 'csv-demo',
    movimientos: lineas.length,
    montoTotal: lineas.reduce((a, l) => a + l.monto, 0),
    lineas,
    avisos: lineas.length ? [] : ['Sin filas parseables'],
    suggestedPeriodo: ym
      ? `${ym}-01/${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
      : undefined,
    suggestedMesContable: ym ? ym.replace('-', '/') : undefined,
    formatoEsperado: 'fecha;glosa;monto[;referencia]',
  };
}

export async function importCartolaArchivo(
  file: File,
  meta: { banco: string; periodo: string; mesContable?: string; bancoCodigo?: string; hojas?: string[]; moneda?: string },
) {
  const preview = await previewCartolaArchivo(file);
  return demoStore.createCartolaBancaria({
    banco: meta.banco,
    bancoCodigo: meta.bancoCodigo,
    periodo: meta.periodo,
    mesContable: meta.mesContable,
    moneda: meta.moneda ?? 'CLP',
    archivoNombre: file.name,
    formato: 'EXCEL',
    movimientos: preview.movimientos,
    montoTotal: preview.montoTotal,
    pendientesContabilizar: preview.movimientos,
    lineas: preview.lineas,
  });
}

export const getDocumentosAging = async () => { await delay(); return demoStore.getDocumentosAging(); };
export async function syncDocumentosAging() {
  await delay(400);
  return demoStore.syncDocumentosAging();
}
export async function updateDocumentoAging(id: string, input: { fechaVencimiento?: string; semanaCompromiso?: string }) {
  await delay();
  return demoStore.updateDocumentoAging(id, input);
}
export async function aplazarDocumentosAging(input: {
  ids: string[];
  semanaCompromiso?: string;
  revertir?: boolean;
}) {
  await delay();
  return demoStore.aplazarDocumentosAging(input);
}

export const getAnticiposProductores = async () => { await delay(); return demoStore.getAnticiposProductores(); };
export async function createAnticipoProductor(input: Parameters<typeof demoStore.createAnticipoProductor>[0]) {
  await delay(300);
  return demoStore.createAnticipoProductor(input);
}
export async function updateAnticipoProductor(id: string, input: Parameters<typeof demoStore.updateAnticipoProductor>[1]) {
  await delay(300);
  return demoStore.updateAnticipoProductor(id, input);
}

export const getSyncBcMeta = async () => { await delay(); return demoStore.getSyncBcMeta(); };
export async function updateSyncBcMeta(input: Parameters<typeof demoStore.updateSyncBcMeta>[0]) {
  await delay(200);
  return demoStore.updateSyncBcMeta(input);
}
export async function syncIndicadoresBc(_input?: { fecha?: string; desde?: string; hasta?: string }) {
  await delay(400);
  const item = demoStore.syncIndicadoresBc();
  return { count: 1, items: [item] };
}

export async function previewIndicadoresBcExcel(file: File) {
  await delay(200);
  if (!/\.csv$/i.test(file.name)) {
    throw new Error('En modo demo importá la plantilla CSV (Excel en API real).');
  }
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('El archivo no tiene filas');
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const iFecha = header.findIndex((h) => h.includes('fecha') || h === 'date');
  const iUsd = header.findIndex((h) => h === 'usd' || h.includes('dolar'));
  const iCny = header.findIndex((h) => h === 'cny' || h.includes('yuan'));
  const iEur = header.findIndex((h) => h === 'eur' || h.includes('euro'));
  if (iFecha < 0) throw new Error('Falta columna fecha');
  const existing = new Map(demoStore.getIndicadoresBc().map((r) => [r.fecha, r]));
  const items = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const fecha = (cols[iFecha] ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const num = (idx: number) => {
      if (idx < 0 || !cols[idx]) return undefined;
      const n = Number(cols[idx].replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const usd = num(iUsd);
    const cny = num(iCny);
    const eur = num(iEur);
    const prev = existing.get(fecha);
    const accion = !prev ? 'NUEVO' as const : (
      (usd != null && usd !== prev.usd)
      || (cny != null && cny !== prev.cny)
      || (eur != null && eur !== prev.eur)
        ? 'ACTUALIZA' as const
        : 'SIN_CAMBIOS' as const
    );
    // `nombre` no aplica a un indicador diario, pero el preview genérico lo exige.
    items.push({ codigo: fecha, nombre: fecha, fecha, usd, cny, eur, accion, cambios: [] as string[] });
  }
  return {
    ok: true,
    total: items.length,
    duplicados: items.filter((i) => i.accion === 'ACTUALIZA').length,
    existingCount: existing.size,
    nuevos: items.filter((i) => i.accion === 'NUEVO').length,
    sinCambios: items.filter((i) => i.accion === 'SIN_CAMBIOS').length,
    items,
    duplicateCodigos: [] as string[],
    ignoredHeaders: [] as string[],
    skippedInFile: [] as string[],
  };
}

export async function importIndicadoresBcExcel(
  items: Array<{ fecha: string; usd?: number; cny?: number; eur?: number }>,
  _meta?: { archivoNombre?: string },
) {
  await delay(300);
  return demoStore.importIndicadoresBc(items);
}

export async function createPago(input: Parameters<typeof demoStore.createPago>[0]) {
  await delay(300);
  const next = { ...input };
  if (debeSugerirTcBc({
    tipoPago: next.tipo,
    monedaPago: next.monedaPago,
    tcManual: next.tcManual,
  })) {
    const moneda = normalizeMonedaTc(next.monedaPago);
    if (moneda === 'USD' || moneda === 'CNY' || moneda === 'EUR') {
      const tc = tcDeFecha(demoStore.getIndicadoresBc(), String(next.fecha), moneda);
      if (tc != null) next.tcManual = tc;
    }
  }
  return demoStore.createPago(next);
}
export async function updatePago(id: string, input: Parameters<typeof demoStore.updatePago>[1]) {
  await delay(300);
  return demoStore.updatePago(id, input);
}
export async function calzarPagoProductor(
  id: string,
  input: { documentosCalce: string; tcManual: number; motivo?: string },
) {
  await delay(300);
  return demoStore.calzarPagoProductor(id, input);
}
export async function getPagoTcEventos(id: string) {
  await delay();
  return demoStore.getPagoTcEventos(id);
}

export async function reversarDocumento(id: string) {
  await delay(300);
  return demoStore.reversarDocumento(id);
}
export async function emitirDocumentoFiscal(id: string) {
  await delay(300);
  return demoStore.emitirDocumentoFiscal(id);
}
export async function grabarDocumentoContabilizar(
  id: string,
  opts?: {
    cuentaContableId?: string;
    centroCostoId?: string;
    glosa?: string;
    cliente?: string;
    lineas?: Array<{ cuentaContableId?: string; centroCostoId?: string }>;
  },
) {
  await delay(300);
  return demoStore.grabarDocumentoContabilizar(id, opts);
}

export async function cargaMasivaDocumentos(input: Parameters<typeof demoStore.cargaMasivaDocumentos>[0]) {
  await delay(300);
  return demoStore.cargaMasivaDocumentos(input);
}

export async function cargaMasivaRegistrosCompra(input: Parameters<typeof demoStore.cargaMasivaRegistrosCompra>[0]) {
  await delay(300);
  return demoStore.cargaMasivaRegistrosCompra(input);
}

export async function createOrdenCompra(input: Parameters<typeof demoStore.createOrdenCompra>[0]) {
  await delay(300);
  return demoStore.createOrdenCompra(input);
}
export async function updateOrdenCompra(id: string, input: Parameters<typeof demoStore.updateOrdenCompra>[1]) {
  await delay(300);
  return demoStore.updateOrdenCompra(id, input);
}
export async function getCierresTraspaso(periodo?: string) {
  await delay(150);
  return demoStore.getCierresTraspaso(periodo);
}
export async function getCierreTraspaso(periodo: string) {
  await delay(150);
  return demoStore.getCierreTraspaso(periodo);
}
export async function traspasoCierre(input: {
  periodo: string;
  glosa?: string;
  tipoCambio?: number;
  monedaTc?: string;
}) {
  await delay(300);
  return demoStore.traspasoCierre(input);
}

export async function reabrirCierreContratista(periodo: string, motivo: string) {
  await delay(300);
  return demoStore.reabrirCierreContratista(periodo, motivo);
}

export async function getAuditoriaContratistas(filters?: { entidad?: string; entidadId?: string }) {
  await delay();
  return demoStore.getAuditoriaContratistas(filters);
}
export async function createRegistroCompra(input: Parameters<typeof demoStore.createRegistroCompra>[0]) {
  await delay(300);
  return demoStore.createRegistroCompra(input);
}
export async function updateRegistroCompra(id: string, input: Parameters<typeof demoStore.updateRegistroCompra>[1]) {
  await delay(300);
  return demoStore.updateRegistroCompra(id, input);
}
export async function anularRegistroCompra(id: string) {
  await delay(300);
  return demoStore.anularRegistroCompra(id);
}
export async function getRegistroCompraXml(id: string) {
  await delay(250);
  return demoStore.getRegistroCompraXml(id);
}

/** PDF de demo (muestra estática de GoSocket QA, folio 81). */
export async function fetchRegistroCompraPdf(id: string): Promise<{ blob: Blob; filename: string }> {
  await delay(250);
  const res = await fetch(withBasePath('/demo/registro-compra-ejemplo.pdf'));
  if (!res.ok) throw new Error('No se pudo cargar el PDF de ejemplo');
  return { blob: await res.blob(), filename: `${id}.pdf` };
}
export async function aceptarRegistroCompraGoSocket(
  id: string,
  input?: Parameters<typeof demoStore.aceptarRegistroCompraGoSocket>[1],
) {
  await delay(500);
  return demoStore.aceptarRegistroCompraGoSocket(id, input);
}
export async function rechazarRegistroCompraGoSocket(
  id: string,
  input?: Parameters<typeof demoStore.rechazarRegistroCompraGoSocket>[1],
) {
  await delay(500);
  return demoStore.rechazarRegistroCompraGoSocket(id, input);
}
export async function syncRegistrosCompraGoSocket(
  input: Parameters<typeof demoStore.syncRegistrosCompraGoSocket>[0],
) {
  await delay(700);
  return demoStore.syncRegistrosCompraGoSocket(input);
}

export async function createCliente(input: Parameters<typeof demoStore.createCliente>[0]) {
  await delay(300);
  return demoStore.createCliente(input);
}
export async function updateCliente(id: string, input: Parameters<typeof demoStore.updateCliente>[1]) {
  await delay(300);
  return demoStore.updateCliente(id, input);
}
export async function createProspecto(input: Parameters<typeof demoStore.createProspecto>[0]) {
  await delay(300);
  return demoStore.createProspecto(input);
}
export async function updateProspecto(id: string, input: Parameters<typeof demoStore.updateProspecto>[1]) {
  await delay(300);
  return demoStore.updateProspecto(id, input);
}
export async function createDocumento(input: Parameters<typeof demoStore.createDocumento>[0]) {
  await delay(300);
  return demoStore.createDocumento(input);
}
export async function updateDocumento(id: string, input: Partial<import('@/types/domain').DocumentoComercial>) {
  await delay(300);
  return demoStore.updateDocumento(id, input);
}

export async function updateDocumentoImputacion(
  id: string,
  input: { cuentaContableId: string; centroCostoId?: string },
) {
  await delay(200);
  return demoStore.updateDocumento(id, {
    cuentaContableId: input.cuentaContableId,
    centroCostoId: input.centroCostoId || undefined,
  });
}
export async function getDocumento(id: string) {
  await delay(100);
  const row = demoStore.getDocumentos().find((d) => d.id === id);
  if (!row) throw new Error('Documento no encontrado');
  return { ...row };
}
export async function fetchDocumentoDteBlob(
  _id: string,
  _kind: 'pdf' | 'xml',
): Promise<{ blob: Blob; filename: string; dummy: boolean }> {
  throw new Error('PDF/XML del facturador no está disponible en modo demo');
}
export async function downloadDocumentoDte(
  id: string,
  kind: 'pdf' | 'xml',
): Promise<{ dummy: boolean }> {
  await fetchDocumentoDteBlob(id, kind);
  return { dummy: true };
}
export async function syncDocumentoDte(id: string) {
  await delay(100);
  return getDocumento(id);
}
export async function getDocumentosBorradores(_usuarioId?: string) {
  await delay(150);
  return demoStore.getDocumentos().filter((d) => d.estado === 'BORRADOR');
}
export async function anularDocumento(id: string) {
  await delay(300);
  return demoStore.updateDocumento(id, { estado: 'ANULADO' });
}
export async function eliminarDocumentoBorrador(id: string) {
  await delay(200);
  return demoStore.eliminarDocumentoBorrador(id);
}
export async function convertirDocumento(id: string, input: { tipoDestino: string; folioNuevo?: string }) {
  await delay(300);
  const origen = demoStore.getDocumentos().find((d) => d.id === id);
  if (!origen) throw new Error('Documento no encontrado');
  const convertido = demoStore.createDocumento({
    folio: input.folioNuevo || `${input.tipoDestino}-${origen.folio}`,
    tipo: input.tipoDestino as 'NP' | 'OC' | 'FACTURA',
    cliente: origen.cliente,
    clienteId: origen.clienteId,
    fecha: new Date().toISOString().slice(0, 10),
    neto: origen.neto,
    estado: input.tipoDestino === 'FACTURA' ? 'EMITIDO' : 'BORRADOR',
    folioOrigen: origen.folio,
  });
  const origUpd = demoStore.updateDocumento(id, { estado: 'FACTURADO' });
  return { origen: origUpd, convertido };
}
export async function confirmarOrdenVenta(id: string) {
  await delay(200);
  return demoStore.updateDocumento(id, { estado: 'CONFIRMADA' });
}
export async function lookupRut(rut: string) {
  await delay();
  const n = rut.replace(/[.\s-]/g, '').toUpperCase();
  const clientes = demoStore.getClientes().filter((c) => c.rut.replace(/[.\s-]/g, '').toUpperCase().includes(n));
  const proveedores = mockProveedores.filter((p) => p.rut.replace(/[.\s-]/g, '').toUpperCase().includes(n));
  return { rut: n, sociedad: null, clientes, proveedores };
}
export async function getWorkflowsAdmin() {
  await delay();
  return demoStore.getWorkflows().map((w) => ({ ...w, aprobadorIds: w.aprobadorIds ?? [] }));
}
export async function createWorkflowAdmin(input: {
  nombre: string;
  modulo: string;
  montoMin: number;
  montoMax: number;
  aprobadores?: number;
  aprobadorIds?: string[];
  activo?: boolean;
}) {
  await delay(300);
  return demoStore.createWorkflow({
    nombre: input.nombre,
    modulo: input.modulo,
    montoMin: input.montoMin,
    montoMax: input.montoMax,
    aprobadores: 1,
    aprobadorIds: input.aprobadorIds ?? [],
    activo: input.activo ?? true,
  });
}
export async function updateWorkflowAdmin(id: string, input: Record<string, unknown>) {
  await delay(300);
  return demoStore.updateWorkflow(id, {
    ...(input as Partial<import('@/types/domain').WorkflowConfig>),
    aprobadores: 1,
  });
}
export async function deleteWorkflowAdmin(id: string) {
  await delay(300);
  return demoStore.deleteWorkflow(id);
}

export async function getDelegacionesAprobacion() {
  await delay();
  return [...mockDelegaciones];
}

export async function createDelegacionAprobacion(input: Record<string, unknown>) {
  await delay(300);
  const row: import('@/types/domain').DelegacionAprobacion = {
    id: `DEL-${Date.now()}`,
    titularId: String(input.titularId),
    titularNombre: String(input.titularNombre ?? input.titularId),
    suplenteId: String(input.suplenteId),
    suplenteNombre: String(input.suplenteNombre ?? input.suplenteId),
    modulo: (input.modulo as string | null) ?? null,
    vigenciaDesde: String(input.vigenciaDesde),
    vigenciaHasta: (input.vigenciaHasta as string | null) ?? null,
    motivo: (input.motivo as string | null) ?? null,
    activo: input.activo !== false,
  };
  mockDelegaciones.push(row);
  return row;
}

export async function updateDelegacionAprobacion(id: string, input: Record<string, unknown>) {
  await delay(300);
  const idx = mockDelegaciones.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error('Delegación no encontrada');
  mockDelegaciones[idx] = { ...mockDelegaciones[idx], ...input } as import('@/types/domain').DelegacionAprobacion;
  return mockDelegaciones[idx];
}

export async function deleteDelegacionAprobacion(id: string) {
  await delay(300);
  const idx = mockDelegaciones.findIndex((d) => d.id === id);
  if (idx >= 0) mockDelegaciones.splice(idx, 1);
  return { ok: true, id };
}

export async function getGruposAprobacion() {
  await delay();
  return [...mockGrupos];
}

export async function createGrupoAprobacion(input: Record<string, unknown>) {
  await delay(300);
  const row: import('@/types/domain').GrupoAprobacion = {
    id: `GRP-${Date.now()}`,
    nombre: String(input.nombre),
    modulo: String(input.modulo),
    aprobadorInicialId: String(input.aprobadorInicialId),
    aprobadorInicialNombre: fx.usuarios.find((u) => u.id === input.aprobadorInicialId)?.nombre,
    miembroIds: (input.miembroIds as string[]) ?? [],
    miembros: ((input.miembroIds as string[]) ?? []).map((id) => ({
      id,
      nombre: fx.usuarios.find((u) => u.id === id)?.nombre ?? id,
    })),
    activo: input.activo !== false,
  };
  mockGrupos.push(row);
  return row;
}

export async function updateGrupoAprobacion(id: string, input: Record<string, unknown>) {
  await delay(300);
  const idx = mockGrupos.findIndex((g) => g.id === id);
  if (idx < 0) throw new Error('Grupo no encontrado');
  mockGrupos[idx] = { ...mockGrupos[idx], ...input } as import('@/types/domain').GrupoAprobacion;
  return mockGrupos[idx];
}

export async function deleteGrupoAprobacion(id: string) {
  await delay(300);
  const idx = mockGrupos.findIndex((g) => g.id === id);
  if (idx >= 0) mockGrupos.splice(idx, 1);
  return { ok: true, id };
}

export async function getEscalasAprobacion() {
  await delay();
  return [...mockEscalas];
}

export async function createNodoEscalaAprobacion(input: Record<string, unknown>) {
  await delay(300);
  const grupoId = String(input.grupoId ?? '');
  if (!grupoId) throw new Error('grupoId requerido');
  const grupo = mockGrupos.find((g) => g.id === grupoId);
  const usuarioId = String(input.usuarioId);
  const escalaAUsuarioId = (input.escalaAUsuarioId as string | null) ?? null;
  const row: import('@/types/domain').NodoEscalaAprobacion = {
    id: `NOD-${Date.now()}`,
    grupoId,
    grupoNombre: grupo?.nombre ?? null,
    modulo: String(input.modulo),
    usuarioId,
    usuarioNombre: fx.usuarios.find((u) => u.id === usuarioId)?.nombre,
    logica: (input.logica as 'SIMPLE' | 'AND' | 'OR') ?? 'SIMPLE',
    montoMax: (input.montoMax as number | null) ?? null,
    escalaAUsuarioId,
    escalaANombre: escalaAUsuarioId
      ? fx.usuarios.find((u) => u.id === escalaAUsuarioId)?.nombre ?? null
      : null,
    activo: input.activo !== false,
  };
  mockEscalas.push(row);
  return row;
}

export async function updateNodoEscalaAprobacion(id: string, input: Record<string, unknown>) {
  await delay(300);
  const idx = mockEscalas.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('Nodo no encontrado');
  mockEscalas[idx] = { ...mockEscalas[idx], ...input } as import('@/types/domain').NodoEscalaAprobacion;
  return mockEscalas[idx];
}

export async function deleteNodoEscalaAprobacion(
  id: string,
  _opts?: { confirmarReasignacion?: boolean; nuevoAprobadorId?: string | null },
) {
  await delay(300);
  const idx = mockEscalas.findIndex((n) => n.id === id);
  if (idx >= 0) mockEscalas.splice(idx, 1);
  return { ok: true, id };
}

export async function previewPendientesNodoEscala(id: string) {
  await delay(100);
  const nodo = mockEscalas.find((n) => n.id === id);
  return {
    nodoId: id,
    usuarioId: nodo?.usuarioId ?? '',
    count: 0,
    items: [],
    sugeridoAprobadorId: nodo?.escalaAUsuarioId ?? null,
  };
}

export async function previewPendientesAprobador(usuarioId: string) {
  await delay(100);
  return {
    usuarioId,
    count: 0,
    items: [],
    sugeridoAprobadorId: null,
  };
}

export async function previewCadenaOc(input: { monto: number; moneda?: string }): Promise<import('@/types/domain').SimulacionAprobacionResult> {
  let usuarioId = '';
  try {
    const raw = localStorage.getItem('erp.session');
    const parsed = raw ? JSON.parse(raw) as { user?: { id?: string }; id?: string } : null;
    usuarioId = parsed?.user?.id ?? parsed?.id ?? '';
  } catch {
    usuarioId = '';
  }
  return simularAprobacion({ modulo: 'Compras', monto: input.monto, usuarioId });
}

export async function simularAprobacion(input: Record<string, unknown>): Promise<import('@/types/domain').SimulacionAprobacionResult> {
  await delay(300);
  const modulo = String(input.modulo ?? '');
  const monto = Number(input.monto) || 0;
  const grupoId = input.grupoId ? String(input.grupoId) : '';
  const usuarioId = input.usuarioId ? String(input.usuarioId) : '';
  const hoy = '2026-08-16';

  const grupo = grupoId
    ? mockGrupos.find((g) => g.id === grupoId)
    : mockGrupos.find((g) => g.modulo === modulo && g.activo && g.miembroIds.includes(usuarioId));

  if (!grupo) {
    return {
      status: usuarioId ? 'sin_grupo' : 'sin_cadena',
      modulo,
      monto,
      cadena: [],
      motivos: [usuarioId ? 'El usuario no pertenece a un grupo de este módulo' : 'Seleccione un grupo'],
    };
  }

  const nodos = mockEscalas.filter((n) => n.grupoId === grupo.id && n.activo);
  const nombreDe = (id: string, fallback?: string) =>
    fallback
    || nodos.find((n) => n.usuarioId === id)?.usuarioNombre
    || fx.usuarios.find((u) => u.id === id)?.nombre
    || id;

  const suplenteDe = (titularId: string) => {
    const del = mockDelegaciones.find((d) =>
      d.activo
      && d.titularId === titularId
      && (!d.modulo || d.modulo === modulo)
      && d.vigenciaDesde <= hoy
      && (!d.vigenciaHasta || d.vigenciaHasta >= hoy),
    );
    return del ?? null;
  };

  const cadena: import('@/types/domain').CadenaPasoPreview[] = [];
  const motivos: string[] = [];
  const seen = new Set<string>();
  let current: string | null = grupo.aprobadorInicialId;

  while (current && !seen.has(current)) {
    seen.add(current);
    const nodo = nodos.find((n) => n.usuarioId === current);
    const supl = suplenteDe(current);
    const displayId = supl ? supl.suplenteId : current;
    const displayNombre = supl
      ? `${supl.suplenteNombre} (suplencia ${nombreDe(current, nodo?.usuarioNombre)})`
      : nombreDe(current, nodo?.usuarioNombre);
    const logica = nodo?.logica;
    const extras = nodo?.aprobadores ?? [];
    const aprobadores = (logica === 'AND' || logica === 'OR') && extras.length > 1
      ? extras.map((a) => ({
        id: a.usuarioId,
        nombre: nombreDe(a.usuarioId, a.usuarioNombre),
      }))
      : undefined;
    if (!cadena.some((c) => c.id === displayId)) {
      cadena.push({
        id: displayId,
        nombre: displayNombre,
        ...(logica && logica !== 'SIMPLE' ? { logica } : {}),
        ...(aprobadores ? { aprobadores } : {}),
      });
    }
    if (supl) motivos.push(`Suplencia: ${nombreDe(current)} → ${supl.suplenteNombre}`);

    const tope = nodo?.montoMax;
    if (tope == null || monto <= tope) break;
    current = nodo?.escalaAUsuarioId ?? null;
  }

  if (!cadena.length) {
    return { status: 'sin_cadena', modulo, monto, grupo: { id: grupo.id, nombre: grupo.nombre }, cadena: [], motivos: ['Grupo sin escala'] };
  }

  return {
    status: 'ok',
    modulo,
    monto,
    grupo: { id: grupo.id, nombre: grupo.nombre },
    solicitanteId: usuarioId || undefined,
    cadena,
    motivos,
  };
}

// ─── AdminConcepto (mock) ────────────────────────────────────────────────────

export async function getAdministradoresConcepto() {
  await delay(200);
  return [...mockAdminConceptos];
}

export async function createAdminConcepto(input: { usuarioId: string; modulo: string; activo?: boolean }) {
  await delay(300);
  const u = fx.usuarios.find((x) => x.id === input.usuarioId);
  const item: import('@/types/domain').AdminConcepto = {
    id: `ac-${Date.now()}`,
    empresaId: 'EMP-1',
    usuarioId: input.usuarioId,
    usuarioNombre: u?.nombre ?? 'Usuario Demo',
    usuarioEmail: u?.email,
    modulo: input.modulo,
    activo: input.activo ?? true,
  };
  mockAdminConceptos.push(item);
  return item;
}

export async function updateAdminConcepto(id: string, input: { modulo?: string; activo?: boolean }) {
  await delay(300);
  const idx = mockAdminConceptos.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error('No encontrado');
  mockAdminConceptos[idx] = { ...mockAdminConceptos[idx]!, ...input };
  return mockAdminConceptos[idx]!;
}

export async function deleteAdminConcepto(id: string) {
  await delay(200);
  const idx = mockAdminConceptos.findIndex((x) => x.id === id);
  if (idx !== -1) mockAdminConceptos.splice(idx, 1);
}

// ─── Export / Import (mock) ──────────────────────────────────────────────────

export async function exportAprobacionesConfig(modulo?: string) {
  await delay(300);
  const mod = modulo?.trim();
  const grupos = mod ? mockGrupos.filter((g) => g.modulo === mod) : mockGrupos;
  const ids = new Set(grupos.map((g) => g.id));
  const nodos = mockEscalas.filter((n) => ids.has(n.grupoId));
  return {
    version: 2,
    modulo: mod ?? 'empresa',
    empresaId: 'EMP-1',
    empresaNombre: fx.empresas[0]?.razonSocial ?? 'Demo',
    exportadoEn: new Date().toISOString(),
    usuarios: fx.usuarios.map((u) => ({ id: u.id, email: u.email, nombre: u.nombre })),
    grupos,
    nodos,
    delegaciones: mockDelegaciones,
    adminConcepto: mockAdminConceptos,
  };
}

export async function previewAprobacionesConfig(_config: Record<string, unknown>): Promise<import('@/types/domain').AprobacionesBackupPreview> {
  await delay(300);
  return {
    ok: true,
    version: 2,
    empresaDestinoId: 'demo',
    resumen: { grupos: 0, nodos: 0, delegaciones: 0, adminConcepto: 0, usuariosCatalogo: 0 },
    pendientes: {},
    autoMatched: [],
    eslabonesFaltantes: [],
    usuariosDestino: [],
  };
}

export async function importAprobacionesConfig(_config: Record<string, unknown>) {
  await delay(400);
  return { ok: true, mensaje: 'Importación simulada (modo demo)' };
}

export async function createInsumo(input: Parameters<typeof demoStore.createInsumo>[0]) {
  await delay(300);
  return demoStore.createInsumo(input);
}
export async function updateInsumo(id: string, input: Parameters<typeof demoStore.updateInsumo>[1]) {
  await delay(300);
  return demoStore.updateInsumo(id, input);
}
export async function createBodega(input: Parameters<typeof demoStore.createBodega>[0]) {
  await delay(300);
  return demoStore.createBodega(input);
}
export async function updateBodega(id: string, input: Parameters<typeof demoStore.createBodega>[0]) {
  await delay(300);
  return demoStore.updateBodega(id, input);
}
export async function createMovimientoBodega(input: Parameters<typeof demoStore.createMovimientoBodega>[0]) {
  await delay(300);
  return demoStore.createMovimientoBodega(input);
}
export async function updateMovimientoBodega(id: string, input: Record<string, unknown>) {
  await delay(300);
  return demoStore.updateMovimientoBodega(id, input);
}
export async function createCuenta(input: Parameters<typeof demoStore.createCuenta>[0]) {
  await delay(300);
  return demoStore.createCuenta(input);
}
export async function updateCuenta(id: string, input: Partial<import('@/types/domain').CuentaContable>) {
  await delay(300);
  return demoStore.updateCuenta(id, input);
}
export async function deleteCuenta(id: string) {
  await delay(300);
  return demoStore.deleteCuenta(id);
}
export async function deletePlanCuentas() {
  await delay(300);
  return demoStore.deletePlanCuentas();
}
export async function bulkCuentas(input: {
  items: Array<Partial<CuentaContable> & Pick<CuentaContable, 'codigo' | 'nombre' | 'tipo'>>;
  replace?: boolean;
  actualizarAnidacion?: boolean;
  aplicarFlags?: boolean;
  vinculos?: 'conservar' | 'quitar_si_flag_off' | 'arrastrar_padre' | 'desde_excel';
  archivoNombre?: string;
}) {
  await delay(300);
  return demoStore.bulkCuentas(
    input.items.map((i) => ({
      activa: true,
      ...i,
    })) as Omit<CuentaContable, 'id'>[],
    input.replace,
  );
}
export async function createCategoriaCuenta(input: {
  digito: number;
  nombre: string;
  tipo?: import('@/types/domain').CuentaContable['tipo'];
}) {
  await delay(300);
  return demoStore.createCategoria(input);
}

/**
 * El tipo declarado aquí es el contrato público (`pickApi` deriva de este
 * módulo), así que debe cubrir todo lo que devuelve la API real y consume
 * `PlanCuentasPage`, aunque en demo la función solo lance.
 */
export async function previewPlanCuentasExcel(_file: File, _aplicarArrastre = false): Promise<
  CatalogExcelPreview & {
    ok: boolean;
    hasDimensionCodes?: boolean;
    centrosCount?: number;
    elementosCount?: number;
    areasCount?: number;
    avisoMaestros?: string;
  }
> {
  await delay(200);
  throw new Error(
    'Importar Excel requiere modo API (desactive Demo Mode). En demo use la pestaña CSV.',
  );
}

export async function importPlanCuentasExcel(
  _file: File,
  _replace = false,
): Promise<{ ok: boolean; created: number; updated: number; total: number }> {
  await delay(200);
  throw new Error(
    'Importar Excel requiere modo API (desactive Demo Mode). En demo use la pestaña CSV.',
  );
}

async function hojaDemo(file: File): Promise<string[][]> {
  const { leerPrimeraHojaXlsx } = await import('./xlsx-sheet');
  return leerPrimeraHojaXlsx(new Uint8Array(await file.arrayBuffer()));
}

function resumenDemo(
  parsed: { items: DemoCatalogFila[]; skippedInFile: string[]; ignoredHeaders: string[] },
  existingCount: number,
): CatalogExcelPreview {
  if (!parsed.items.length) {
    throw new Error(parsed.skippedInFile[0] ?? 'El archivo no tiene filas para importar');
  }
  const { items } = parsed;
  const nuevos = items.filter((it) => it.accion === 'NUEVO');
  const iguales = items.filter((it) => it.accion === 'SIN_CAMBIOS');
  return {
    total: items.length,
    duplicados: 0,
    existingCount,
    nuevos: nuevos.length,
    sinCambios: iguales.length,
    items,
    duplicateCodigos: iguales.map((it) => it.codigo),
    ignoredHeaders: parsed.ignoredHeaders,
    skippedInFile: parsed.skippedInFile,
  };
}

export async function previewCentrosCostoExcel(file: File): Promise<CatalogExcelPreview> {
  await delay(200);
  const empresaId = readSelectedEmpresaId() ?? 'EMP-1';
  const existentes = demoStore.getCentrosCosto(empresaId);
  const parsed = filasCatalogoDesdeHoja(await hojaDemo(file), 'centro', existentes.map((c) => c.codigo));
  return resumenDemo(parsed, existentes.length);
}
export async function importCentrosCostoExcel(
  items: CatalogExcelPreviewItem[],
  _meta?: { archivoNombre?: string },
): Promise<ImportResult> {
  await delay(200);
  const empresaId = readSelectedEmpresaId() ?? 'EMP-1';
  const existentes = new Set(demoStore.getCentrosCosto(empresaId).map((c) => c.codigo));
  let created = 0;
  let unchanged = 0;
  for (const raw of items) {
    const codigo = String(raw.codigo ?? '').trim();
    if (existentes.has(codigo)) {
      unchanged += 1;
      continue;
    }
    demoStore.createCentroCosto({
      codigo,
      nombre: String(raw.nombre ?? ''),
      activa: raw.activa !== false,
      empresaId,
      contactoEncargado: raw.contactoEncargado ? String(raw.contactoEncargado) : undefined,
    });
    existentes.add(codigo);
    created += 1;
  }
  return { created, updated: 0, unchanged, total: items.length };
}
export async function previewElementosCostoExcel(file: File): Promise<CatalogExcelPreview> {
  await delay(200);
  const existentes = demoStore.getElementosCosto();
  const parsed = filasCatalogoDesdeHoja(await hojaDemo(file), 'elemento', existentes.map((c) => c.codigo));
  return resumenDemo(parsed, existentes.length);
}
export async function previewCodigosFinancierosExcel(file: File): Promise<CatalogExcelPreview> {
  await delay(200);
  const empresaId = readSelectedEmpresaId() ?? 'EMP-1';
  const existentes = demoStore.getCodigosFinancieros(empresaId);
  const parsed = filasCatalogoDesdeHoja(await hojaDemo(file), 'codigo', existentes.map((c) => c.codigo));
  return resumenDemo(parsed, existentes.length);
}
export async function importCodigosFinancierosExcel(
  items: CatalogExcelPreviewItem[],
  _meta?: { archivoNombre?: string },
): Promise<ImportResult> {
  await delay(200);
  const empresaId = readSelectedEmpresaId() ?? 'EMP-1';
  const existentes = new Set(demoStore.getCodigosFinancieros(empresaId).map((c) => c.codigo));
  let created = 0;
  let unchanged = 0;
  for (const raw of items) {
    const codigo = String(raw.codigo ?? '').trim();
    if (existentes.has(codigo)) {
      unchanged += 1;
      continue;
    }
    demoStore.createCodigoFinanciero({
      codigo,
      nombre: String(raw.nombre ?? ''),
      activa: raw.activa !== false,
      empresaId,
    });
    existentes.add(codigo);
    created += 1;
  }
  return { created, updated: 0, unchanged, total: items.length };
}
export async function importElementosCostoExcel(
  items: CatalogExcelPreviewItem[],
  _meta?: { archivoNombre?: string },
): Promise<ImportResult> {
  await delay(200);
  const existentes = new Set(demoStore.getElementosCosto().map((c) => c.codigo));
  let created = 0;
  let unchanged = 0;
  for (const raw of items) {
    const codigo = String(raw.codigo ?? '').trim();
    if (existentes.has(codigo)) {
      unchanged += 1;
      continue;
    }
    const departamento = String(raw.departamento ?? '').trim();
    if (!departamento) throw new Error(`El código ${codigo} no trae departamento`);
    demoStore.createElementoCosto({
      codigo,
      nombre: String(raw.nombre ?? ''),
      departamento,
      vigencia: 'VIGENTE',
    });
    existentes.add(codigo);
    created += 1;
  }
  return { created, updated: 0, unchanged, total: items.length };
}
export async function getCatalogoImportaciones(_tipo?: string) {
  await delay(50);
  return [];
}

export async function createAsiento(input: Parameters<typeof demoStore.createAsiento>[0]) {
  await delay(300);
  return demoStore.createAsiento(input);
}
export async function updateAsiento(id: string, input: Parameters<typeof demoStore.updateAsiento>[1]) {
  await delay(300);
  return demoStore.updateAsiento(id, input);
}
export async function bulkAsientos(input: Parameters<typeof demoStore.bulkAsientos>[0]) {
  await delay(400);
  return demoStore.bulkAsientos(input);
}
export async function createElementoCosto(input: Parameters<typeof demoStore.createElementoCosto>[0]) {
  await delay(300);
  return demoStore.createElementoCosto(input);
}
export async function updateElementoCosto(
  id: string,
  input: Parameters<typeof demoStore.updateElementoCosto>[1],
) {
  await delay(300);
  return demoStore.updateElementoCosto(id, input);
}
export async function createFactorHonorario(input: Parameters<typeof demoStore.createFactorHonorario>[0]) {
  await delay(300);
  return demoStore.createFactorHonorario(input);
}
export async function updateFactorHonorario(
  id: string,
  input: Parameters<typeof demoStore.updateFactorHonorario>[1],
) {
  await delay(300);
  return demoStore.updateFactorHonorario(id, input);
}

// ---------------- UI TABLE PREFERENCES ----------------

export async function getTablePreference(tableKey: string): Promise<{
  tableKey: string;
  visibleColumns: string[] | null;
  columnOrder: string[] | null;
}> {
  await delay(50);
  try {
    const raw = localStorage.getItem(tablePrefsStorageKey(tableKey));
    if (!raw) return { tableKey, visibleColumns: null, columnOrder: null };
    const parsed = JSON.parse(raw) as UiTablePreference;
    return {
      tableKey,
      visibleColumns: parsed.visibleColumns ?? null,
      columnOrder: parsed.columnOrder ?? null,
    };
  } catch {
    return { tableKey, visibleColumns: null, columnOrder: null };
  }
}

export async function putTablePreference(
  tableKey: string,
  input: { visibleColumns: string[]; columnOrder: string[] },
): Promise<UiTablePreference> {
  await delay(50);
  const row: UiTablePreference = {
    tableKey,
    visibleColumns: input.visibleColumns,
    columnOrder: input.columnOrder,
  };
  localStorage.setItem(tablePrefsStorageKey(tableKey), JSON.stringify(row));
  return row;
}
