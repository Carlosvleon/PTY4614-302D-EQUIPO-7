import { isDemoMode } from '@/lib/appSettings';

import * as mock from './mock/api';

import * as real from './real/api';



function pickApi<K extends keyof typeof mock>(key: K): typeof mock[K] {

  const mockFn = mock[key];

  const realFn = real[key as keyof typeof real] as typeof mock[K] | undefined;

  return ((...args: unknown[]) => {

    if (isDemoMode()) {

      return (mockFn as (...a: unknown[]) => unknown)(...args);

    }

    if (realFn) {

      return (realFn as (...a: unknown[]) => unknown)(...args);

    }

    return Promise.reject(new Error('Operación no disponible'));

  }) as typeof mock[K];

}



/** Auth siempre contra erp_back (JWT + BD). */

export const login = real.login;

export const loginWithMicrosoft = real.loginWithMicrosoft;

export const getMicrosoftAuthConfig = real.getMicrosoftAuthConfig;

export const logout = real.logout;

export const getMe = real.getMe;

export const updateProfile = real.updateProfile;

export const changePassword = real.changePassword;

/**
 * Usuarios afectan login real: listado/alta/edición (incl. password) siempre contra API.
 * El mock demo ignora `password` y dejaría claves que no sirven para entrar.
 */
export const getUsuarios = real.getUsuarios;

export const createUsuario = real.createUsuario;

export const updateUsuario = real.updateUsuario;



/** Lecturas: demo → fixtures; real → backend o vacío. */

export const getDashboardKPIs = pickApi('getDashboardKPIs');
export const getNotificacionesPendientes = pickApi('getNotificacionesPendientes');
export const setNotificacionLeida = pickApi('setNotificacionLeida');
export const marcarTodasNotificacionesLeidas = pickApi('marcarTodasNotificacionesLeidas');
export const getTendenciaMensual = pickApi('getTendenciaMensual');

export const getEmpresas = pickApi('getEmpresas');

export const getRoles = pickApi('getRoles');

export const getMonedas = pickApi('getMonedas');

export const getUnidades = pickApi('getUnidades');

export const getCentrosCosto = pickApi('getCentrosCosto');
export const getAreasNegocio = pickApi('getAreasNegocio');
export const createAreaNegocio = pickApi('createAreaNegocio');
export const updateAreaNegocio = pickApi('updateAreaNegocio');
export const getConceptosFlujo = pickApi('getConceptosFlujo');
export const createConceptoFlujo = pickApi('createConceptoFlujo');
export const updateConceptoFlujo = pickApi('updateConceptoFlujo');
export const getCodigosFinancieros = pickApi('getCodigosFinancieros');
export const createCodigoFinanciero = pickApi('createCodigoFinanciero');
export const updateCodigoFinanciero = pickApi('updateCodigoFinanciero');
export const getCuentaImpacto = pickApi('getCuentaImpacto');

export const getTiposDocumento = pickApi('getTiposDocumento');

export const getCuentas = pickApi('getCuentas');

export const getAsientos = pickApi('getAsientos');
export const getPeriodosContables = pickApi('getPeriodosContables');
export const createPeriodoContable = pickApi('createPeriodoContable');
export const updatePeriodoContable = pickApi('updatePeriodoContable');
export const abrirPeriodoContable = pickApi('abrirPeriodoContable');
export const cerrarPeriodoContable = pickApi('cerrarPeriodoContable');
export const getPeriodoContableEventos = pickApi('getPeriodoContableEventos');
export const getConfigContableSii = pickApi('getConfigContableSii');
export const putConfigContableSii = pickApi('putConfigContableSii');
export const previewCentralizacion = pickApi('previewCentralizacion');
export const ejecutarCentralizacion = pickApi('ejecutarCentralizacion');
export const getLibroDiario = pickApi('getLibroDiario');
export const getMayor = pickApi('getMayor');
export const getBalance8Columnas = pickApi('getBalance8Columnas');
export const getProveedores = pickApi('getProveedores');
export const buscarContrapartePorRut = pickApi('buscarContrapartePorRut');
export const getProveedor = pickApi('getProveedor');
export const createProveedor = pickApi('createProveedor');
export const updateProveedor = pickApi('updateProveedor');

export const getMovimientosCaja = pickApi('getMovimientosCaja');
export const getFlujoCaja = pickApi('getFlujoCaja');
export const getSaldosBancos = pickApi('getSaldosBancos');
export const createMovimientoCaja = pickApi('createMovimientoCaja');
export const corregirApertura = pickApi('corregirApertura');
export const updateMovimientoCaja = pickApi('updateMovimientoCaja');
export const deleteMovimientoCaja = pickApi('deleteMovimientoCaja');

export const getPagos = pickApi('getPagos');

export const getConciliaciones = pickApi('getConciliaciones');
export const createConciliacion = pickApi('createConciliacion');
export const getMovimientosConciliacion = pickApi('getMovimientosConciliacion');
export const desconciliarMovimiento = pickApi('desconciliarMovimiento');

export const getPresupuestos = pickApi('getPresupuestos');
export const createPresupuesto = pickApi('createPresupuesto');
export const updatePresupuesto = pickApi('updatePresupuesto');
export const deletePresupuesto = pickApi('deletePresupuesto');

export const getContratistas = pickApi('getContratistas');

export const getLabores = pickApi('getLabores');
export const createLabor = pickApi('createLabor');
export const updateLabor = pickApi('updateLabor');

export const getActividades = pickApi('getActividades');
export const createActividad = pickApi('createActividad');
export const updateActividad = pickApi('updateActividad');
export const linkLaborActividad = pickApi('linkLaborActividad');
export const unlinkLaborActividad = pickApi('unlinkLaborActividad');
export const getTiposContratoContratista = pickApi('getTiposContratoContratista');
export const createTipoContratoContratista = pickApi('createTipoContratoContratista');
export const updateTipoContratoContratista = pickApi('updateTipoContratoContratista');

export const getTarifasContratista = pickApi('getTarifasContratista');

export const getProformasContratista = pickApi('getProformasContratista');

export const getOrdenesCompra = pickApi('getOrdenesCompra');
export const previewCadenaOc = pickApi('previewCadenaOc');

export const getAprobacionesOc = pickApi('getAprobacionesOc');

export const getRecepcionesOc = pickApi('getRecepcionesOc');
export const createRecepcionOc = pickApi('createRecepcionOc');

export const getRegistrosCompra = pickApi('getRegistrosCompra');

export const getInsumos = pickApi('getInsumos');
export const getInsumoStockBodegas = pickApi('getInsumoStockBodegas');
export const getStockPorBodega = pickApi('getStockPorBodega');
export const liberarReservaStock = pickApi('liberarReservaStock');

export const getBodegas = pickApi('getBodegas');

export const getMovimientosBodega = pickApi('getMovimientosBodega');

export const getElementosCosto = pickApi('getElementosCosto');

export const getFactoresHonorario = pickApi('getFactoresHonorario');

export const getIndicadoresBc = pickApi('getIndicadoresBc');

export const getBcSeries = pickApi('getBcSeries');

export const getClientes = pickApi('getClientes');
export const getCliente = pickApi('getCliente');

export const getProspectos = pickApi('getProspectos');

export const getDocumentos = pickApi('getDocumentos');
export const getDocumentosBorradores = pickApi('getDocumentosBorradores');
export const getDocumento = pickApi('getDocumento');
export const fetchDocumentoDteBlob = pickApi('fetchDocumentoDteBlob');
export const downloadDocumentoDte = pickApi('downloadDocumentoDte');
export const syncDocumentoDte = pickApi('syncDocumentoDte');
export const updateDocumento = pickApi('updateDocumento');
export const updateDocumentoImputacion = pickApi('updateDocumentoImputacion');
export const anularDocumento = pickApi('anularDocumento');
export const eliminarDocumentoBorrador = pickApi('eliminarDocumentoBorrador');
export const convertirDocumento = pickApi('convertirDocumento');
export const confirmarOrdenVenta = pickApi('confirmarOrdenVenta');
export const lookupRut = pickApi('lookupRut');

export const getWorkflows = pickApi('getWorkflows');
export const getWorkflowsAdmin = pickApi('getWorkflowsAdmin');
export const createWorkflowAdmin = pickApi('createWorkflowAdmin');
export const updateWorkflowAdmin = pickApi('updateWorkflowAdmin');
export const deleteWorkflowAdmin = pickApi('deleteWorkflowAdmin');

export const getDelegacionesAprobacion = pickApi('getDelegacionesAprobacion');
export const createDelegacionAprobacion = pickApi('createDelegacionAprobacion');
export const updateDelegacionAprobacion = pickApi('updateDelegacionAprobacion');
export const deleteDelegacionAprobacion = pickApi('deleteDelegacionAprobacion');

export const getGruposAprobacion = pickApi('getGruposAprobacion');
export const createGrupoAprobacion = pickApi('createGrupoAprobacion');
export const updateGrupoAprobacion = pickApi('updateGrupoAprobacion');
export const deleteGrupoAprobacion = pickApi('deleteGrupoAprobacion');

export const getEscalasAprobacion = pickApi('getEscalasAprobacion');
export const createNodoEscalaAprobacion = pickApi('createNodoEscalaAprobacion');
export const updateNodoEscalaAprobacion = pickApi('updateNodoEscalaAprobacion');
export const deleteNodoEscalaAprobacion = pickApi('deleteNodoEscalaAprobacion');
export const previewPendientesNodoEscala = pickApi('previewPendientesNodoEscala');
export const previewPendientesAprobador = pickApi('previewPendientesAprobador');

export const simularAprobacion = pickApi('simularAprobacion');

export const getAdministradoresConcepto = pickApi('getAdministradoresConcepto');
export const createAdminConcepto = pickApi('createAdminConcepto');
export const updateAdminConcepto = pickApi('updateAdminConcepto');
export const deleteAdminConcepto = pickApi('deleteAdminConcepto');

export const exportAprobacionesConfig = pickApi('exportAprobacionesConfig');
export const previewAprobacionesConfig = pickApi('previewAprobacionesConfig');
export const importAprobacionesConfig = pickApi('importAprobacionesConfig');

export const getLibroComercial = pickApi('getLibroComercial');
export const getGuiasDespacho = pickApi('getGuiasDespacho');
export const createGuiaDespacho = pickApi('createGuiaDespacho');
export const getCuentasCorrientes = pickApi('getCuentasCorrientes');
export const getCuentaCorrienteMovimientos = pickApi('getCuentaCorrienteMovimientos');
export const getEstadoCuentaPorRut = pickApi('getEstadoCuentaPorRut');
export const createCuentaCorrienteAjuste = pickApi('createCuentaCorrienteAjuste');

export const getReportesContables = pickApi('getReportesContables');



/** Escrituras: demo → store en memoria; real → backend. */

export const createEmpresa = pickApi('createEmpresa');

export const updateEmpresa = pickApi('updateEmpresa');

export const createMoneda = pickApi('createMoneda');
export const updateMoneda = pickApi('updateMoneda');
export const createUnidad = pickApi('createUnidad');
export const updateUnidad = pickApi('updateUnidad');
export const createTipoDocumento = pickApi('createTipoDocumento');
export const updateTipoDocumento = pickApi('updateTipoDocumento');
export const createCentroCosto = pickApi('createCentroCosto');
export const updateCentroCosto = pickApi('updateCentroCosto');

export const createRol = pickApi('createRol');

export const updateRol = pickApi('updateRol');

export const deleteRol = pickApi('deleteRol');

export const createContratista = pickApi('createContratista');

export const updateContratista = pickApi('updateContratista');
export const getContratistaVigenciaHistorial = pickApi('getContratistaVigenciaHistorial');

export const createTarifaContratista = pickApi('createTarifaContratista');

export const updateTarifaContratista = pickApi('updateTarifaContratista');

export const deleteTarifaContratista = pickApi('deleteTarifaContratista');
export const patchTarifaContratistaInline = pickApi('patchTarifaContratistaInline');

export const createProformaContratista = pickApi('createProformaContratista');
export const previewProformaContratista = pickApi('previewProformaContratista');
export const getSiguienteNumeroProforma = pickApi('getSiguienteNumeroProforma');

export const updateProformaContratista = pickApi('updateProformaContratista');

export const deleteProformaContratista = pickApi('deleteProformaContratista');

export const marcarProformaDefinitiva = pickApi('marcarProformaDefinitiva');
export const aprobarProformaDefinitiva = pickApi('aprobarProformaDefinitiva');

export const asociarFacturaProforma = pickApi('asociarFacturaProforma');

export const reversarProforma = pickApi('reversarProforma');
export const reemitirProforma = pickApi('reemitirProforma');

export const setPinAprobacion = pickApi('setPinAprobacion');

export const getIngresosLaborDiario = pickApi('getIngresosLaborDiario');
export const createIngresoLaborDiario = pickApi('createIngresoLaborDiario');
export const updateIngresoLaborDiario = pickApi('updateIngresoLaborDiario');
export const deleteIngresoLaborDiario = pickApi('deleteIngresoLaborDiario');
export const aprobarIngresoLaborDiario = pickApi('aprobarIngresoLaborDiario');
export const asociarIngresosAProforma = pickApi('asociarIngresosAProforma');

export const getCartolasBancarias = pickApi('getCartolasBancarias');
export const createCartolaBancaria = pickApi('createCartolaBancaria');
export const deleteCartolaBancaria = pickApi('deleteCartolaBancaria');
export const getMovimientosCartola = pickApi('getMovimientosCartola');
export const contabilizarMovimientoCartola = pickApi('contabilizarMovimientoCartola');
export const asociarNominaCartola = pickApi('asociarNominaCartola');
export const lookupDocumentoCartola = pickApi('lookupDocumentoCartola');
export const calcularDiferenciaTc = pickApi('calcularDiferenciaTc');
export const cerrarCartolaBancaria = pickApi('cerrarCartolaBancaria');
export const previewCartolaArchivo = pickApi('previewCartolaArchivo');
export const importCartolaArchivo = pickApi('importCartolaArchivo');
export const getDocumentosAging = pickApi('getDocumentosAging');
export const syncDocumentosAging = pickApi('syncDocumentosAging');
export const updateDocumentoAging = pickApi('updateDocumentoAging');
export const aplazarDocumentosAging = pickApi('aplazarDocumentosAging');
export const createOrdenCompra = pickApi('createOrdenCompra');
export const updateOrdenCompra = pickApi('updateOrdenCompra');
export const getCierresTraspaso = pickApi('getCierresTraspaso');
export const getCierreTraspaso = pickApi('getCierreTraspaso');
export const traspasoCierre = pickApi('traspasoCierre');
export const reabrirCierreContratista = pickApi('reabrirCierreContratista');
export const getAuditoriaContratistas = pickApi('getAuditoriaContratistas');
export const createRegistroCompra = pickApi('createRegistroCompra');
export const updateRegistroCompra = pickApi('updateRegistroCompra');
export const anularRegistroCompra = pickApi('anularRegistroCompra');
/** GoSocket (Libro de compras): XML/PDF/aceptar/rechazar/sync. Demo → store; real → ERP_Almahue-Back. */
export const getRegistroCompraXml = pickApi('getRegistroCompraXml');
export const fetchRegistroCompraPdf = pickApi('fetchRegistroCompraPdf');
export const aceptarRegistroCompraGoSocket = pickApi('aceptarRegistroCompraGoSocket');
export const rechazarRegistroCompraGoSocket = pickApi('rechazarRegistroCompraGoSocket');
export const syncRegistrosCompraGoSocket = pickApi('syncRegistrosCompraGoSocket');

export const createCliente = pickApi('createCliente');
export const updateCliente = pickApi('updateCliente');
export const createProspecto = pickApi('createProspecto');
export const updateProspecto = pickApi('updateProspecto');
export const createDocumento = pickApi('createDocumento');
// updateDocumento / anular / convertir exportados arriba con getDocumentos
export const createInsumo = pickApi('createInsumo');
export const updateInsumo = pickApi('updateInsumo');
export const createBodega = pickApi('createBodega');
export const updateBodega = pickApi('updateBodega');
export const createMovimientoBodega = pickApi('createMovimientoBodega');
export const updateMovimientoBodega = pickApi('updateMovimientoBodega');
export const createCuenta = pickApi('createCuenta');
export const updateCuenta = pickApi('updateCuenta');
export const deleteCuenta = pickApi('deleteCuenta');
export const deletePlanCuentas = pickApi('deletePlanCuentas');
export const bulkCuentas = pickApi('bulkCuentas');
export const createCategoriaCuenta = pickApi('createCategoriaCuenta');
export const createAsiento = pickApi('createAsiento');
export const updateAsiento = pickApi('updateAsiento');
export const bulkAsientos = pickApi('bulkAsientos');
export const previewPlanCuentasExcel = pickApi('previewPlanCuentasExcel');
export const importPlanCuentasExcel = pickApi('importPlanCuentasExcel');
export const previewCentrosCostoExcel = pickApi('previewCentrosCostoExcel');
export const importCentrosCostoExcel = pickApi('importCentrosCostoExcel');
export const previewElementosCostoExcel = pickApi('previewElementosCostoExcel');
export const importElementosCostoExcel = pickApi('importElementosCostoExcel');
export const previewCodigosFinancierosExcel = pickApi('previewCodigosFinancierosExcel');
export const importCodigosFinancierosExcel = pickApi('importCodigosFinancierosExcel');
export const getCatalogoImportaciones = pickApi('getCatalogoImportaciones');
export const createElementoCosto = pickApi('createElementoCosto');
export const updateElementoCosto = pickApi('updateElementoCosto');
export const createFactorHonorario = pickApi('createFactorHonorario');
export const updateFactorHonorario = pickApi('updateFactorHonorario');
export const updateRecepcionOc = pickApi('updateRecepcionOc');

export const getAnticiposProductores = pickApi('getAnticiposProductores');
export const createAnticipoProductor = pickApi('createAnticipoProductor');
export const updateAnticipoProductor = pickApi('updateAnticipoProductor');

export const getSyncBcMeta = pickApi('getSyncBcMeta');
export const updateSyncBcMeta = pickApi('updateSyncBcMeta');
export const syncIndicadoresBc = pickApi('syncIndicadoresBc');
export const previewIndicadoresBcExcel = pickApi('previewIndicadoresBcExcel');
export const importIndicadoresBcExcel = pickApi('importIndicadoresBcExcel');

export const createPago = pickApi('createPago');
export const updatePago = pickApi('updatePago');
export const calzarPagoProductor = pickApi('calzarPagoProductor');
export const getPagoTcEventos = pickApi('getPagoTcEventos');

export const reversarDocumento = pickApi('reversarDocumento');
export const emitirDocumentoFiscal = pickApi('emitirDocumentoFiscal');
export const grabarDocumentoContabilizar = pickApi('grabarDocumentoContabilizar');
export const cargaMasivaDocumentos = pickApi('cargaMasivaDocumentos');
export const cargaMasivaRegistrosCompra = pickApi('cargaMasivaRegistrosCompra');

/** Preferencias de columnas de tablas (por usuario + tableKey). */
export const getTablePreference = pickApi('getTablePreference');
export const putTablePreference = pickApi('putTablePreference');

