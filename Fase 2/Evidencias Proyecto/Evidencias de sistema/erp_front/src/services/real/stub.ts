/**
 * Stub API para modo real — se reemplazará al conectar erp_back.
 */
const MSG = 'No se pudo conectar con el servidor. Intente más tarde.';

function notReady<T>(): Promise<T> {
  return Promise.reject(new Error(MSG));
}

export async function login(_email: string, _password: string) {
  return notReady();
}

export async function getMe() {
  return notReady();
}

export async function logout() {
  return Promise.resolve();
}

export async function updateProfile(_data: { nombre: string }) {
  return notReady();
}

export async function changePassword(_password: string) {
  return notReady();
}

export async function getDashboardKPIs() {
  return { ocPorAprobar: 0, proformasSinFactura: 0, facturasPorRecibir: 0, tcUsdHoy: 0, tcCnyHoy: 0, tcEurHoy: 0, tcUsdHoyFecha: null };
}

export async function getNotificacionesPendientes() {
  return {
    total: 0,
    totalItems: 0,
    items: [] as Array<{
      id: string;
      tipo: string;
      titulo: string;
      detalle: string | null;
      monto?: number | null;
      href: string;
      fecha: string | null;
      leida: boolean;
      refKey?: string;
    }>,
  };
}

export async function setNotificacionLeida(id: string, leida: boolean) {
  return { id, leida };
}

export async function marcarTodasNotificacionesLeidas() {
  return { ok: true };
}

export async function getTendenciaMensual() {
  return [];
}

export async function getEmpresas() {
  return [];
}

export async function getUsuarios() {
  return [];
}

export async function getRoles() {
  return [];
}

export async function getMonedas() {
  return [];
}

export async function getUnidades() {
  return [];
}

export async function getTiposDocumento() {
  return [];
}

export async function getCuentas() {
  return [];
}

export async function getAreasNegocio() {
  return [];
}

export async function createAreaNegocio() {
  return notReady();
}

export async function updateAreaNegocio() {
  return notReady();
}

export async function getCodigosFinancieros() {
  return [];
}

export async function createCodigoFinanciero() {
  return notReady();
}

export async function updateCodigoFinanciero() {
  return notReady();
}

export async function getCuentaImpacto(_id?: string) {
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

export async function getAsientos() {
  return [];
}

export async function getPeriodosContables() {
  return [];
}

export async function createPeriodoContable() {
  return notReady();
}

export async function updatePeriodoContable() {
  return notReady();
}

export async function abrirPeriodoContable() {
  return notReady();
}

export async function cerrarPeriodoContable() {
  return notReady();
}

export async function getPeriodoContableEventos() {
  return [];
}

export async function getConfigContableSii() {
  return [];
}

export async function putConfigContableSii() {
  return notReady();
}

export async function previewCentralizacion() {
  return notReady();
}

export async function ejecutarCentralizacion() {
  return notReady();
}

export async function getMovimientosCaja() {
  return [];
}

export async function getFlujoCaja() {
  return { filas: [] };
}

export async function getPagos() {
  return [];
}

export async function getConciliaciones() {
  return [];
}

export async function getMovimientosConciliacion() {
  return [];
}

export async function desconciliarMovimiento() {
  return Promise.reject(new Error('Reversa selectiva de conciliación no disponible en API real aún'));
}

export async function getPresupuestos() {
  return [];
}

export async function createPresupuesto() {
  return notReady();
}

export async function updatePresupuesto() {
  return notReady();
}

export async function deletePresupuesto() {
  return notReady();
}

export async function createMovimientoCaja() {
  return notReady();
}

export async function corregirApertura() {
  return notReady();
}

export async function updateMovimientoCaja() {
  return notReady();
}

export async function deleteMovimientoCaja() {
  return notReady();
}

export async function syncDocumentosAging() {
  return notReady();
}

export async function updateDocumentoAging() {
  return notReady();
}

export async function updateRegistroCompra() {
  return notReady();
}

export async function anularRegistroCompra() {
  return notReady();
}

export async function getProformasContratista() {
  return [];
}

export async function getOrdenesCompra() {
  return [];
}

export async function getAprobacionesOc() {
  return [];
}

export async function getRecepcionesOc() {
  return [];
}

export async function getRegistrosCompra() {
  return [];
}

export async function getInsumos() {
  return [];
}

export async function getBodegas() {
  return [];
}

export async function getMovimientosBodega() {
  return [];
}

export async function getElementosCosto() {
  return [];
}

export async function getFactoresHonorario() {
  return [];
}

export async function getIndicadoresBc() {
  return [];
}

export async function getClientes() {
  return [];
}

export async function getCliente(_id?: string) {
  return { id: '', rut: '', razonSocial: '', credito: 0, vendedor: '', activo: true };
}

export async function getProveedor(_id?: string) {
  return { id: '', rut: '', razonSocial: '', activo: true };
}

export async function getProspectos() {
  return [];
}

export async function getDocumentos(_params?: {
  mias?: boolean;
  tipo?: string;
  estado?: string;
}) {
  return [];
}

export async function getDocumentosBorradores(_usuarioId?: string) {
  return [];
}

export async function getDocumento() {
  return notReady();
}

export async function getWorkflows() {
  return [];
}

export async function getReportesContables() {
  return [];
}

export async function getIngresosLaborDiario() {
  return [];
}

export async function createIngresoLaborDiario() {
  return notReady();
}

export async function updateIngresoLaborDiario() {
  return notReady();
}

export async function deleteIngresoLaborDiario() {
  return notReady();
}

export async function asociarIngresosAProforma() {
  return notReady();
}

export async function getCartolasBancarias() {
  return [];
}

export async function createCartolaBancaria() {
  return notReady();
}

export async function deleteCartolaBancaria() {
  return notReady();
}

export async function getMovimientosCartola() {
  return [];
}

export async function contabilizarMovimientoCartola() {
  return notReady();
}

export async function lookupDocumentoCartola() {
  return { found: false, mensaje: 'No se encontró el documento. Si no existe, elige Anticipo.' };
}

export async function getDocumentosAging() {
  return [];
}

export async function createOrdenCompra() {
  return notReady();
}

export async function updateOrdenCompra() {
  return notReady();
}

export async function createRegistroCompra() {
  return notReady();
}

export async function getAnticiposProductores() {
  return [];
}

export async function createAnticipoProductor() {
  return notReady();
}

export async function updateAnticipoProductor() {
  return notReady();
}

export async function getSyncBcMeta() {
  return {
    modo: 'manual' as const,
    horaProgramada: '09:00',
    horarios: ['09:00'],
    frecuenciaMinutos: null as number | null,
    ventanaInicio: '09:00',
    ventanaFin: '18:00',
    diasHabiles: true,
    ultimaSync: '',
  };
}

export async function updateSyncBcMeta() {
  return notReady();
}

export async function syncIndicadoresBc() {
  return notReady();
}

export async function createPago() {
  return notReady();
}

export async function updatePago() {
  return notReady();
}

export async function reversarDocumento() {
  return notReady();
}

export async function emitirDocumentoFiscal() {
  return notReady();
}

export async function grabarDocumentoContabilizar() {
  return notReady();
}

export async function reversarProforma() {
  return notReady();
}

export async function setClaveReversa() {
  return notReady();
}

export async function setPinAprobacion() {
  return notReady();
}

export async function cerrarCartolaBancaria() {
  return notReady();
}

export async function cargaMasivaDocumentos() {
  return notReady();
}

export async function cargaMasivaRegistrosCompra() {
  return notReady();
}

export async function updateRecepcionOc() {
  return notReady();
}

export async function updateAsiento() {
  return notReady();
}

export async function bulkAsientos() {
  return notReady();
}
