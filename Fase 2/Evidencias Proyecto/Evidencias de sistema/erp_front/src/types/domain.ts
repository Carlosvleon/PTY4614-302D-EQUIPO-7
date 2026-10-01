export type EstadoGenerico = 'ACTIVO' | 'INACTIVO' | 'PENDIENTE' | 'BORRADOR';
export type EstadoDocumento = 'BORRADOR' | 'PENDIENTE_APROBACION' | 'AUTORIZADA' | 'EMITIDO' | 'APROBADO' | 'CONFIRMADA' | 'FACTURADO' | 'ANULADO' | 'VENCIDO' | 'RECHAZADO' | 'CONTABILIZADA' | 'RECEPCIONADA';
export type EstadoAsiento = 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO';
export type TipoDocumentoComercial = 'COTIZACION' | 'NP' | 'OC' | 'FACTURA' | 'NC' | 'ND' | 'GUIA' | 'ORDEN_VENTA';

/** Tipos de salida del wizard `/comercial/emitir` (no Cotización/NP/OC). */
export const TIPOS_EMISION = ['FACTURA', 'NC', 'ND', 'GUIA'] as const;
export type TipoEmision = (typeof TIPOS_EMISION)[number];
export function esTipoEmision(tipo: string): tipo is TipoEmision {
  return (TIPOS_EMISION as readonly string[]).includes(tipo);
}
export type EstadoProforma = 'BORRADOR' | 'PENDIENTE_APROBACION' | 'DEFINITIVA' | 'FACTURADA' | 'RECHAZADA';

/** Lógica de un paso de cadena (config y snapshot runtime). */
export type LogicaAprobacionPaso = 'SIMPLE' | 'AND' | 'OR';
export type EstadoAprobadorCadena = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'OMITIDA';

/** Integrante persistido en `OrdenCompra.aprobacionCadena`. */
export interface AprobadorCadenaSnapshot {
  id: string;
  nombre: string;
  estado: EstadoAprobadorCadena;
}

/** Paso persistido al enviar la OC (AND/OR + estado por persona). */
export interface PasoAprobacionCadena {
  logica: LogicaAprobacionPaso;
  aprobadores: AprobadorCadenaSnapshot[];
}

/** Paso del simulador / preview wizard (sin estado runtime). */
export interface CadenaPasoPreview {
  id: string;
  nombre: string;
  logica?: LogicaAprobacionPaso;
  aprobadores?: Array<{ id: string; nombre: string }>;
  /** Tope de ese paso. null = sin tope. */
  montoMax?: number | null;
}

export type TipoMovimientoBodega =
  | 'ENTRADA_PROVEEDOR'
  | 'TRASLADO'
  | 'DEVOLUCION_NC'
  | 'SALIDA_PROVEEDOR'
  | 'DEVOLUCION'
  | 'SALIDA_VENTA'
  | 'ENTRADA_VENTA_ANULACION';

export type EstadoMovimientoBodega = 'BORRADOR' | 'CONFIRMADO' | 'ANULADO';

export interface SessionUser {
  /** D3: el usuario ya registró clave personal de reversa. */
  tieneClaveReversa?: boolean;
  /** True si es Admin master o está en pool de Workflow (habilita PIN en perfil). */
  aprobarConPin?: boolean;
  /** Usuario ya registró su PIN de 4 dígitos. */
  tienePinAprobacion?: boolean;
  id: string;
  nombre: string;
  email: string;
  rol: string;
  rolId: string;
  empresa: string;
  empresaId: string;
  /** Empresas permitidas (multi-empresa Reu 3). Si falta, solo empresaId. */
  empresaIds?: string[];
  permisos: string[];
  /** Matriz R/W por pantalla; el menú filtra por lectura cuando hay alguna marcada. */
  permisosPantalla?: PermisoPantalla[];
  /**
   * Módulos donde el usuario es AdminConcepto activo.
   * Permite acceso a /admin/aprobaciones aunque el rol no tenga admin:read.
   */
  adminConceptoModulos?: string[];
  /** Módulos con bandeja de aprobación accesible (permiso o designación en reglas). */
  bandejaModulos?: string[];
  token?: string;
  refreshToken?: string;
}

export interface PlantillaDocColumns {
  folio?: boolean;
  contraparte?: boolean;
  fecha?: boolean;
  neto?: boolean;
  estado?: boolean;
  /** Extra: solicitante/depto (OC) u otros. */
  extra?: boolean;
}

/** Opciones de impresión/PDF para documentos (factura, OC, OV). */
export type PlantillaFontFamily = 'serif' | 'sans';
export type PlantillaLogoPosicion = 'izquierda' | 'centro' | 'derecha';
export type PlantillaLogoTamano = 'S' | 'M' | 'L';
export type PlantillaFontSize = 'S' | 'M' | 'L';
export type PlantillaEstiloTabla = 'clasico' | 'moderno';

export interface PlantillaDocumento {
  showLogo?: boolean;
  showAddress?: boolean;
  showFooter?: boolean;
  footerText?: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  /** Checks viejos de un listado. La hoja nueva no los usa. */
  columns?: PlantillaDocColumns;
  /** Color de marca (hex) del recuadro de folio. */
  colorPrimario?: string;
  /** Reservado. La hoja Acepta no pinta un segundo color. */
  colorSecundario?: string;
  fontFamily?: PlantillaFontFamily;
  fontSize?: PlantillaFontSize;
  logoPosicion?: PlantillaLogoPosicion;
  logoTamano?: PlantillaLogoTamano;
  estiloTabla?: PlantillaEstiloTabla;
  /** Columnas opcionales del detalle. Descripción, cantidad, precio y total van siempre. */
  colCodigo?: boolean;
  colUnidad?: boolean;
  colDescuento?: boolean;
  showMontoLetras?: boolean;
  /** Muestra el bloque de términos de pago / condiciones y datos bancarios. */
  showTerminos?: boolean;
  terminosPago?: string;
  datosBancarios?: string;
}

export interface Empresa {
  id: string;
  razonSocial: string;
  rut: string;
  giro: string;
  activa: boolean;
  direccion?: string | null;
  comuna?: string;
  ciudad?: string;
  telefono?: string;
  emailContacto?: string | null;
  representanteLegalNombre?: string | null;
  representanteLegalRut?: string | null;
  representanteLegalEmail?: string | null;
  representanteLegalTelefono?: string | null;
  logoUrl?: string;
  selloUrl?: string;
  plantillaDoc?: PlantillaDocumento | null;
  /** Días sin reclamo para aceptación comercial automática (default 8). No aprueba la OC. */
  aceptacionCompraPlazoDias?: number;
  /** UUID BillerID GoSocket de esta sociedad. */
  gosocketBillerId?: string | null;
  /** N° resolución SII/QA (CAE GUF). */
  gosocketNroResolucion?: string | null;
  /** Fecha resolución SII/QA YYYY-MM-DD. */
  gosocketFechaResolucion?: string | null;
  /** Acteco SII (6 dígitos). */
  gosocketActeco?: string | null;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rolId: string;
  rolNombre: string;
  empresaId: string;
  /** Empresas a las que puede acceder (1 o más). */
  empresaIds?: string[];
  activo: boolean;
  /** Rol temporal: vigencia del rol asignado. */
  rolVigenciaDesde?: string;
  rolVigenciaHasta?: string;
  /** Jefe directo (organigrama aprobaciones). */
  jefeId?: string;
  jefeNombre?: string;
  /** Tope individual de aprobación (CLP). */
  montoMaxAprobacion?: number;
}

/** Permiso R/W por pantalla (R2-R02) */
export interface PermisoPantalla {
  pantalla: string;
  lectura: boolean;
  escritura: boolean;
}

export interface Rol {
  id: string;
  nombre: string;
  permisos: string[];
  usuarios: number;
  /** Checks lectura/escritura por pantalla (UI roles Reu 2) */
  permisosPantalla?: PermisoPantalla[];
  /** Aprobar/rechazar exige PIN de 4 dígitos del usuario. */
  aprobarConPin?: boolean;
  /** Rol master (Administrador): visible, permisología no editable. */
  esMaster?: boolean;
}

export interface Moneda {
  id: string;
  codigo: string;
  nombre: string;
  simbolo: string;
  activa: boolean;
  focoReporteria?: boolean;
}

export interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
}

export interface CentroCosto {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  empresaId: string;
  /** Razón social desde BD (join Empresa) */
  empresaNombre?: string;
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  /** R2-K02 / PEND-06 */
  contactoEncargado?: string;
  createdAt?: string;
}

export interface TipoDocumento {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  activo: boolean;
}

export interface CuentaContable {
  id: string;
  codigo: string;
  codigoExcel?: string;
  nombre: string;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  nivel?: number;
  padreId?: string;
  activa: boolean;
  requiereCc?: boolean;
  requiereArea?: boolean;
  requiereEspecie?: boolean;
  requiereElemento?: boolean;
  noImputable?: boolean;
  esImputable?: boolean;
  centroCostoIds?: string[];
  elementoCostoIds?: string[];
  areaNegocioIds?: string[];
  children?: CuentaContable[];
}

export interface AreaNegocio {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  empresaId: string;
}

export interface ConceptoFlujo {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
  empresaId: string;
}

export interface CodigoFinanciero {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  empresaId: string;
  conceptoId?: string;
  conceptoCodigo?: string;
  conceptoNombre?: string;
  createdAt?: string;
}

export interface Asiento {
  id: string;
  numero: string;
  periodo?: string;
  fecha: string;
  tipo?: string;
  glosa: string;
  debe: number;
  haber: number;
  estado: EstadoAsiento;
  origen?: string;
  lineas?: {
    debe: number;
    haber: number;
    cuentaId?: string;
    glosa?: string;
    centroCostoId?: string;
    areaNegocioId?: string;
    elementoCostoId?: string;
    moneda?: string;
    tipoCambio?: number;
  }[];
}

export type EstadoPeriodoContable = 'ABIERTO' | 'CERRADO';

export interface PeriodoContable {
  id: string;
  codigo: string;
  anio: number;
  mes: number;
  fechaDesde: string;
  fechaHasta: string;
  estado: EstadoPeriodoContable;
  activo: boolean;
  empresaId: string;
}

export interface ConfigContableSii {
  id: string;
  tipoDocumentoSii: string;
  codigoSii?: string;
  nombre: string;
  cuentaContableId: string;
  cuentaCodigo?: string;
  cuentaNombre?: string;
  cuentaRequiereCc?: boolean;
  cuentaRequiereArea?: boolean;
  cuentaRequiereElemento?: boolean;
  centroCostoId?: string;
  areaNegocioId?: string;
  elementoCostoId?: string;
  lado: string;
  activa: boolean;
  empresaId: string;
}

export interface CentralizacionItem {
  origen: string;
  ref: string;
  glosa: string;
  monto: number;
  accion: 'CREAR' | 'OMITIR';
  motivo?: string;
}

export interface CentralizacionResult {
  dryRun: boolean;
  periodo: string;
  tipoCambio?: number;
  monedaTc?: string;
  origenes: string[];
  resumen: {
    pendientes: number;
    omitidos: number;
    asientosCreados: number;
    montoTotal: number;
  };
  porOrigen?: Record<string, { pendientes: number; omitidos: number; monto: number }>;
  items: CentralizacionItem[];
  asientosCreados: Array<{ numero: string; origen: string; monto: number }>;
  avisos: string[];
}

export interface Proveedor {
  id: string;
  rut: string;
  razonSocial: string;
  giro?: string;
  contacto?: string;
  email?: string;
  telefono?: string;
  activo: boolean;
  empresaId?: string;
  cuentasBancarias?: FichaCuentaBancaria[];
  contactos?: FichaContacto[];
  direcciones?: FichaDireccion[];
  historial?: FichaCambio[];
  solicitadoPor?: string;
  solicitadoNota?: string;
  esProductor?: boolean;
  /** Condición del NETO en el maestro: entero positivo de días. */
  condicionPagoDias?: number;
  /** Días para pagar el IVA. Presets de 10 en 10 o entero manual. Default 10. */
  condicionIvaDia?: number;
  /** Moneda de pago del proveedor (CLP, USD, CNY…). Default CLP. */
  monedaPago?: string;
  /** Mismo RUT existe en Contratistas. */
  esContratista?: boolean;
}

export interface LibroDiarioLinea {
  asientoNumero: string;
  fecha: string;
  glosa: string;
  cuentaId?: string;
  cuentaCodigo?: string;
  cuentaNombre?: string;
  debe: number;
  haber: number;
  lineaGlosa?: string;
  origen?: string;
}

export interface LibroDiarioResult {
  periodo: string;
  lineas: LibroDiarioLinea[];
  totales: { debe: number; haber: number; cuadrado: boolean; asientos: number };
}

export interface MayorCuenta {
  cuentaId?: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  /** Movimiento del mes (no acumulado). */
  debe: number;
  haber: number;
  /** P1-11: saldo acumulado de periodos anteriores (arrastre). */
  saldoInicial: number;
  /** debe - haber del mes (sin arrastre); ver `saldo` para el acumulado. */
  saldoPeriodo: number;
  /** saldoInicial + saldoPeriodo: saldo acumulado a la fecha. */
  saldo: number;
  movimientos: LibroDiarioLinea[];
}

export interface MayorResult {
  periodo: string;
  cuentas: MayorCuenta[];
  totales: { debe: number; haber: number; saldoInicial: number };
}

export interface MovimientoCaja {
  id: string;
  fecha: string;
  concepto: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  banco?: string;
  moneda?: string;
  esApertura?: boolean;
}

/** Read-model Tesorería › Flujo de caja (T3). Unión apertura + cartola CONTABILIZADO. */
export interface FlujoCajaFila {
  id: string;
  origen: 'APERTURA' | 'CARTOLA';
  fecha: string;
  concepto: string;
  referencia?: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  banco?: string;
  moneda: string;
  esApertura: boolean;
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
  movimientoCartolaId?: string;
  cartolaId?: string;
  movimientoCajaId?: string;
}

export interface FlujoCajaResponse {
  filas: FlujoCajaFila[];
}

export type TipoPagoTesoreria = 'PAGO_TOTAL' | 'ANTICIPO' | 'ANTICIPO_PRODUCTOR';

export interface Pago {
  id: string;
  fecha: string;
  beneficiario: string;
  monto: number;
  medio: string;
  estado: EstadoGenerico;
  tcManual?: number;
  /** R2-T06 */
  monedaPago?: string;
  monedaFactura?: string;
  diferenciaTc?: number;
  documentosCalce?: string;
  movimientoCartolaId?: string;
  proveedorId?: string;
  clienteId?: string;
  tipo?: TipoPagoTesoreria;
}

export interface PagoTcEvento {
  id: string;
  pagoId: string;
  empresaId?: string;
  tcAnterior: number | null;
  tcNuevo: number;
  motivo?: string;
  usuarioId: string;
  usuarioNombre?: string;
  usuarioEmail?: string;
  createdAt: string;
}

export interface Conciliacion {
  id: string;
  banco: string;
  periodo: string;
  movimientos: number;
  conciliados: number;
  diferencia: number;
  estado: EstadoGenerico;
  /** R2-T03 */
  asientoId?: string;
  asientoNumero?: string;
  cartolaId?: string;
}

/** R2-T04 — movimiento individual dentro de una conciliación (reversa selectiva). */
export interface MovimientoConciliacion {
  id: string;
  conciliacionId: string;
  fecha: string;
  referencia: string;
  glosa: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  origen: 'MANUAL' | 'AUTOMATICO';
  estado: 'CONCILIADO' | 'PENDIENTE';
}

export interface Presupuesto {
  id: string;
  anio: number;
  centroCosto: string;
  montoPresupuestado: number;
  montoEjecutado: number;
  estado: EstadoGenerico;
}

export interface Contratista {
  id: string;
  rut: string;
  razonSocial: string;
  /** Legacy; ya no se edita en el maestro de contratistas. */
  especialidad?: string;
  activo: boolean;
  vigenciaHasta?: string;
  /** Mismo RUT existe en Proveedores. */
  esProveedor?: boolean;
}

export interface Labor {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  empresaId: string;
}

export interface Actividad {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  empresaId: string;
}

export interface TipoContratoContratista {
  id: string;
  codigo: string;
  nombre: string;
  cuentaDebeId: string;
  cuentaHaberId: string;
  cuentaAdministracionId: string;
  activa: boolean;
  empresaId?: string;
  cuentaDebe?: Pick<CuentaContable, 'codigo' | 'nombre'>;
  cuentaHaber?: Pick<CuentaContable, 'codigo' | 'nombre'>;
  cuentaAdministracion?: Pick<CuentaContable, 'codigo' | 'nombre'>;
}

export interface TarifaContratista {
  id: string;
  contratistaId: string;
  contratista: string;
  laborId: string;
  labor: string;
  actividadId: string;
  actividad: string;
  tipoContratoId?: string;
  tipoContrato?: string;
  tipoContratoCodigo?: string;
  tarifa: number;
  unidad: string;
  centroCostoId: string;
  centroCosto: string;
  empresaId: string;
  vigenciaDesde: string;
  vigenciaHasta?: string;
}

export interface ProformaContratista {
  id: string;
  numero: string;
  contratistaId?: string;
  contratista: string;
  tipoContratoId?: string;
  tipoContrato?: string;
  tipoContratoCodigo?: string;
  /** Periodo mensual estricto YYYY-MM. */
  periodo: string;
  monto: number;
  moneda?: string;
  estado: EstadoProforma;
  facturaAsociada?: string;
  /** Orden de compra generada desde proforma definitiva (flujo Compras). */
  ordenCompraId?: string;
  ordenCompraNumero?: string;
  /** Registro de compras cuando la OC ya fue facturada en Compras. */
  registroCompraId?: string;
  /** IDs de otras proformas agrupadas en la misma factura (N:1) */
  proformasGrupoIds?: string[];
  /** Supervisor a quien se solicitó la aprobación. */
  aprobadorId?: string;
  aprobadorNombre?: string;
  /** Quien efectivamente aprobó / rechazó. */
  aprobadoPorId?: string;
  aprobadoPorNombre?: string;
  aprobadaAt?: string;
  /** Usuario que creó / pidió aprobación. */
  creadoPorId?: string;
  creadoPorNombre?: string;
  solicitante?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Cierre / traspaso contable mensual de contratistas. */
export interface CierreTraspasoContratista {
  id: string;
  periodo: string;
  cerrado: boolean;
  montoTotal: number;
  tipoCambio?: number;
  monedaTc?: string;
  tiposCambio?: Record<string, number>;
  asientoId?: string;
  asientoNumero?: string;
  glosa?: string;
  proformaIds?: string[];
  /** Cantidad de proformas (compat API). */
  proformas: number;
  cerradoAt?: string;
  cerradoPorId?: string;
  cerradoPorNombre?: string;
  detalle?: Array<{
    id: string;
    numero: string;
    contratista: string;
    periodo: string;
    monto: number;
    moneda?: string;
    estado: EstadoProforma;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

/** Distribución por centro de costo en OC (R1-07). */
export interface DistribucionCentroCosto {
  centroCostoId: string;
  centroCosto: string;
  monto: number;
  porcentaje: number;
}

export interface OrdenCompra {
  id: string;
  numero: string;
  fecha: string;
  proveedor: string;
  proveedorId?: string;
  solicitante: string;
  /** Usuario sesión que creó la OC. */
  creadoPorId?: string;
  creadoPorNombre?: string;
  /** Jefe aprobador (usuario). */
  aprobadorId?: string;
  aprobadorNombre?: string;
  /** Cadena persistida al emitir (ids del primer miembro de cada paso, compat). */
  aprobacionCadenaIds?: string[];
  /** Snapshot runtime: lógica + estado por persona en cada paso. */
  aprobacionCadena?: PasoAprobacionCadena[];
  aprobacionPasoActual?: number;
  aprobacionPasosTotal?: number;
  moneda: string;
  neto: number;
  afacto: 'AFECTO' | 'EXENTO' | 'MIXTO';
  estado: EstadoDocumento;
  departamento: string;
  cuentaContableId?: string;
  centroCostoId?: string;
  elementoCostoId?: string;
  /** Líneas CC; suma de montos debe cuadrar con neto. */
  distribucionCc?: DistribucionCentroCosto[];
  /** Ítems de compra. */
  lineas?: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
    centroCostoId?: string;
    centroCosto?: string;
    cuentaContableId?: string;
    cuentaContable?: string;
  }>;
  /** Referencia informativa (cotización recibida). Opcional. */
  referenciaTipo?: string;
  referenciaFolio?: string;
  referenciaFecha?: string;
  /** Motivo al rechazar (bandeja). El back lo limpia al reenviar. */
  motivoRechazo?: string;
  /** Plazo editable. La factura asociada hereda el vencimiento. */
  condicionPagoDias?: 30 | 60 | 90;
  /** Marca de la última modificación. La bandeja la compara antes de firmar. */
  updatedAt?: string;
}

export interface AprobacionOc {
  id: string;
  /** Presente en API real; en mock se puede resolver por ocNumero. */
  ocId?: string;
  ocNumero: string;
  proveedor: string;
  monto: number;
  solicitante: string;
  aprobadorId?: string;
  aprobadorNombre?: string;
  resueltoPorNombre?: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ANULADA' | 'OMITIDA';
  /** Lógica del paso actual (AND/OR) si el API la envía en la fila. */
  logica?: LogicaAprobacionPaso;
  fecha: string;
  /** Snapshot de la OC para timeline AND/OR sin depender del listado de órdenes. */
  aprobacionCadena?: PasoAprobacionCadena[];
  ocEstado?: EstadoDocumento;
  aprobacionPasoActual?: number;
  /** Copia del motivo en la fila que rechazó (y/o en la OC). */
  motivoRechazo?: string;
}

export interface RecepcionOc {
  id: string;
  ocNumero: string;
  fecha: string;
  tcAplicado: number;
  moneda: string;
  monto: number;
  estado: 'BORRADOR' | 'CONFIRMADA';
  lineas?: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
}

export type AceptacionCompraEstado = 'PENDIENTE' | 'ACEPTADA_PLAZO' | 'RECLAMADA';
export type AceptacionCompraOrigen = 'MANUAL' | 'PLAZO_AUTO' | 'GOSOCKET';

/** Estado de aceptación/rechazo comercial del documento en GoSocket (ACD). */
export type GoSocketAceptacionEstado = 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO';
/**
 * Motivo del rechazo: distingue rechazo técnico del SII (nunca llegó a
 * aceptación comercial, ej. error de esquema) de un rechazo comercial
 * explícito (ACD=R) hecho por el receptor.
 */
export type GoSocketRechazoOrigen = 'SII' | 'COMERCIAL';

/** Metadata del documento recibido vía GoSocket (Document/GetDocument). */
export interface RegistroCompraGoSocket {
  globalDocumentId: string;
  /** CountryDocumentId / Track ID del SII, cuando el documento fue aprobado. */
  countryDocumentId?: string;
  estado: GoSocketAceptacionEstado;
  /** AuthorityStatus tag: 00 Por enviar, 01 Enviado, 02 Aprobado, 03 Rechazado SII, 04 Anulado. */
  authorityStatus?: string;
  /** Solo cuando estado='RECHAZADO'. */
  rechazoOrigen?: GoSocketRechazoOrigen;
  rechazoMotivo?: string;
  /** RUT del emisor cuando el XML lo trae y la razón social aún es el placeholder. */
  rutEmisor?: string;
  /** Si el documento tiene PDF descargable vía File/DownloadDocumentPdf. */
  pdfDisponible?: boolean;
  sincronizadoAt?: string;
}

export interface RegistroCompra {
  id: string;
  /** Fecha del DTE o, si aún no vino, la de alta del registro. */
  fecha?: string;
  ocNumero: string;
  /** Folios OC (TpoDocRef 801) extraídos del XML GoSocket, si aplica. */
  ocReferencias?: string[];
  factura: string;
  proveedorOc: string;
  proveedorFactura: string;
  proveedorId?: string;
  monto: number;
  /** Afecto/exento de la OC asociada */
  afactoOc?: 'AFECTO' | 'EXENTO' | 'MIXTO';
  /** Afecto/exento declarado en la factura */
  afactoFactura?: 'AFECTO' | 'EXENTO' | 'MIXTO';
  afactoOk: boolean;
  /** P1-10: matching de 3 vías (OC-recepción-factura); informativo. */
  matchOk?: boolean;
  /** monto factura - recepcionado confirmado de la OC. */
  matchDiff?: number;
  estado: EstadoDocumento;
  /** Estado de la OC ligada (si hay). */
  ocEstado?: EstadoDocumento;
  /** Hay OC y aún no está APROBADO ni posterior. */
  ocNoAprobada?: boolean;
  aceptacionEstado?: AceptacionCompraEstado;
  aceptadaAt?: string;
  aceptacionOrigen?: AceptacionCompraOrigen;
  /** Nombre de quién aceptó comercialmente (usuario o "Aceptación tácita por plazo"). */
  aceptadaPorNombre?: string;
  /** Presente solo si el documento llegó/fue sincronizado desde GoSocket. */
  gosocket?: RegistroCompraGoSocket;
  asientoId?: string;
  asientoNumero?: string;
  lineas?: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
}

export interface Insumo {
  id: string;
  codigo: string;
  familia: string;
  subfamilia: string;
  nombre: string;
  /** Detalle DTE (DscItem). Ausente = no se envía al facturador. */
  detalle?: string;
  unidad: string;
  stock: number;
  costoPromedio: number;
  /** D16: piso de venta del maestro. 0 = sin cargar, se usa costoPromedio. */
  precioCompra?: number;
  /** Cuenta contable de centralización (D11). */
  cuentaContableId?: string;
  /** false = servicio / no mueve bodega en OV. */
  inventariable?: boolean;
}

export interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
  empresaId: string;
  activa: boolean;
}

export interface MovimientoBodega {
  id: string;
  fecha: string;
  tipo: TipoMovimientoBodega;
  estado?: EstadoMovimientoBodega;
  bodega: string;
  bodegaId?: string;
  bodegaDestino?: string;
  bodegaDestinoId?: string;
  articulo: string;
  insumoId?: string;
  cantidad: number;
  precioUnitario: number;
  facturaRef?: string;
  nota: string;
  parId?: string;
}

export interface ElementoCosto {
  id: string;
  codigo: string;
  nombre: string;
  departamento: string;
  vigencia: 'VIGENTE' | 'ANULADO';
  createdAt?: string;
}

export interface FactorHonorario {
  id: string;
  factorAnterior: number;
  factorNuevo: number;
  vigenciaDesde: string;
  vigenciaHasta?: string;
  /** Calculado en API: factor aplicable hoy. */
  vigente?: boolean;
  usuario: string;
}

export interface IndicadorBc {
  id: string;
  fecha: string;
  usd: number;
  eur: number;
  cny: number;
  fuente: string;
  completadoFeriado: boolean;
  origenSync?: 'manual' | 'auto' | string | null;
  consultadoEn?: string | null;
}

export interface FichaCuentaBancaria {
  id?: string;
  banco: string;
  tipoCuenta: string;
  numero: string;
  monedaCodigo?: string;
  titular?: string;
  rutTitular?: string;
  principal?: boolean;
}

export interface FichaContacto {
  id?: string;
  nombre: string;
  cargo?: string;
  email?: string;
  telefono?: string;
  principal?: boolean;
}

export interface FichaDireccion {
  id?: string;
  tipo?: string;
  linea: string;
  comuna?: string;
  ciudad?: string;
  principal?: boolean;
}

export interface FichaCambio {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  resumen: string;
  createdAt: string;
}

export interface Cliente {
  id: string;
  rut: string;
  razonSocial: string;
  credito: number;
  vendedor: string;
  activo: boolean;
  /** NACIONAL | EXPORTACION */
  tipoCliente?: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  telefono?: string;
  email?: string;
  creadoPorId?: string;
  creadoPorNombre?: string;
  cuentasBancarias?: FichaCuentaBancaria[];
  contactos?: FichaContacto[];
  direcciones?: FichaDireccion[];
  historial?: FichaCambio[];
  solicitadoPor?: string;
  solicitadoNota?: string;
  esProductor?: boolean;
}

export interface Prospecto {
  id: string;
  nombre: string;
  contacto: string;
  origen: string;
  estado: 'NUEVO' | 'CONTACTADO' | 'CALIFICADO' | 'CONVERTIDO';
  fecha: string;
}

/** Ítem de costo en factura / OV / OC. */
export interface DocumentoLinea {
  descripcion: string;
  /** Detalle DTE (DscItem). Ausente = no se envía al facturador. */
  detalle?: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct?: number;
  total: number;
  codigoProducto?: string;
  unidadMedida?: string;
  /** Imputación contable por línea (Reu4 V4). */
  cuentaContableId?: string;
  centroCostoId?: string;
  tipoLinea?: 'PRODUCTO' | 'SERVICIO' | 'FLETE';
  insumoId?: string;
  bodegaId?: string;
  splits?: { bodegaId: string; cantidad: number }[];
}

/** Fila unificada de libro comercial / guías (API `libro-comercial` y `guias-despacho`). */
export interface LibroComercialRow {
  id: string;
  ambito?: 'ventas' | 'compras' | 'despachos';
  folio: string;
  tipo: string;
  contraparte: string;
  fecha: string;
  neto: number;
  estado: string;
  origenRef?: string;
  glosa?: string;
}

export interface DocumentoComercial {
  id: string;
  folio: string;
  tipo: TipoDocumentoComercial;
  cliente: string;
  clienteId?: string;
  proveedorId?: string;
  fecha: string;
  neto: number;
  /** P1-7: IVA real persistido (antes solo se mostraba calculado en el front). */
  iva?: number;
  /** neto + iva, calculado por el backend. */
  total?: number;
  /** Detalle de costos; si hay líneas, el neto debería cuadrar con la suma. */
  lineas?: DocumentoLinea[];
  estado: EstadoDocumento;
  /** R2-V01: proviene de reversa */
  fromReversa?: boolean;
  folioOrigen?: string;
  documentoOrigenId?: string;
  /** Cadena contable Reu2 ~05:35: original + reversador + nuevo */
  asientoOriginal?: string;
  asientoReversador?: string;
  asientoNuevo?: string;
  /** Folio del documento reversador (NC/anulación) generado al reversar */
  folioReversador?: string;
  /** Referencia wizard emisión (801 OC, 802 NP, HES…); en NC/ND es TpoDocRef SII. */
  referenciaTipo?: string;
  referenciaFolio?: string;
  /** CodRef SII: 1 anula, 2 texto, 3 montos. */
  referenciaCod?: 1 | 2 | 3;
  observaciones?: string;
  formaPago?: string;
  fechaVencimiento?: string;
  indicadorVenta?: string;
  descuentoGlobalPct?: number;
  cuentaContableId?: string;
  centroCostoId?: string;
  receptorRut?: string;
  receptorGiro?: string;
  receptorDireccion?: string;
  receptorComuna?: string;
  receptorCiudad?: string;
  /** COMEX / DTE export (manual MJ). */
  monedaCodigo?: string;
  tpoMoneda?: string;
  tipoCambio?: number;
  paisRecepCodigo?: string;
  paisDestino?: string;
  puertoEmbarque?: string;
  puertoDesembarque?: string;
  clausulaVenta?: string;
  viaTransporte?: string;
  modalidadVenta?: string;
  indTraslado?: string;
  bultoTipoCodigo?: string;
  bultoCantidad?: number;
  bultoMarca?: string;
  montoOtraMoneda?: number;
  montoExentoOtraMoneda?: number;
  referenciaFecha?: string;
  /** Emisión billing-gateway (stub/sandbox/live). */
  billingEmissionId?: string;
  billingPartner?: string;
  billingConnectionMode?: string;
  billingStatus?: string;
  folioOficial?: string;
  billingGlobalDocumentId?: string;
  billingDisclaimer?: string;
  billingStub?: boolean;
  billingEmittedAt?: string;
  creadoPorId?: string;
  creadoPorNombre?: string;
  createdAt?: string;
  aprobadorId?: string;
  aprobadorNombre?: string;
  aprobacionCadenaIds?: string[];
  aprobacionPasoActual?: number;
  aprobacionPasosTotal?: number;
  aprobadoPorId?: string;
  aprobadoPorNombre?: string;
  aprobadaAt?: string;
  empresaId?: string;
  empresaNombre?: string;
}

/** R2-C01 Ingreso diario labores (estilo AgroSmart) */
export interface IngresoLaborDiario {
  id: string;
  fecha: string;
  contratistaId: string;
  contratista: string;
  centroCostoId: string;
  centroCosto: string;
  laborId: string;
  labor: string;
  actividadId: string;
  actividad: string;
  tipoJornada: 'JORNADA' | 'TRATO';
  cantidad: number;
  /** Precio resuelto por backend; en captura puede omitirse. */
  precioUnitario: number;
  tarifaId?: string;
  tarifaAplicada?: number;
  unidad?: string;
  precioOverride?: boolean;
  motivoOverride?: string;
  tipoContratoId?: string;
  monto: number;
  estado: 'PENDIENTE' | 'PENDIENTE_APROBACION' | 'ASOCIADO' | 'FACTURADO';
  proformaId?: string;
  facturaNumero?: string;
}

export interface ProformaContratistaPreview {
  empresaId: string;
  contratista: Contratista;
  periodo: string;
  ingresoIds: string[];
  ingresos: IngresoLaborDiario[];
  montoNeto: number;
}

export interface AuditoriaContratista {
  id: string;
  empresaId?: string;
  entidad: string;
  entidadId: string;
  accion: string;
  usuarioId?: string;
  usuarioNombre?: string;
  antes?: unknown;
  despues?: unknown;
  metadata?: unknown;
  createdAt: string;
}

/** R2-T01 Carga cartola bancaria */
export interface CartolaBancaria {
  id: string;
  banco: string;
  /** Código/cuenta banco (legado: lookup Banco). */
  bancoCodigo?: string;
  fechaCarga: string;
  /** Rango o etiqueta de periodo de la cartola (desde/hasta). */
  periodo: string;
  /** Mes contable aaaa/mm (filtro legado Conciliaciones). */
  mesContable?: string;
  /** CLP | USD | CNY */
  moneda?: string;
  archivoNombre: string;
  formato: 'EXCEL' | 'PDF';
  movimientos: number;
  montoTotal: number;
  estado: 'CARGADA' | 'EN_CONCILIACION' | 'CERRADA';
  pendientesContabilizar?: number;
  usuarioCarga?: string;
}

/** Movimiento de cartola (fuente oficial) → contabilizar (G7 / Reu2 ~07:23). */
export interface MovimientoCartola {
  id: string;
  cartolaId: string;
  fecha: string;
  referencia: string;
  glosa: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  estadoContable: 'PENDIENTE' | 'CONTABILIZADO';
  asientoNumero?: string;
  pagoId?: string;
  cuentaContraId?: string;
  destinoTipo?: string;
  codigoFinancieroId?: string;
  codigoFinanciero?: string;
  tipoDocumento?: string;
  folioDocumento?: string;
  proveedorId?: string;
  clienteId?: string;
  nominaSemana?: string;
}

/** Nómina / aging tesorería (G3 / Reu2 ~09:11). */
export interface DocumentoAging {
  id: string;
  tipo: 'POR_COBRAR' | 'POR_PAGAR';
  documento: string;
  contraparte: string;
  fechaEmision: string;
  fechaVencimiento: string;
  monto: number;
  saldo: number;
  montoPagado?: number;
  diasAtraso: number;
  estado: 'AL_DIA' | 'ATRASADO' | 'CRITICO';
  documentoComercialId?: string;
  registroCompraId?: string;
  semanaCompromiso?: string;
  semanaNatural?: string;
  aplazada?: boolean;
  nominaEstado?: 'PENDIENTE' | 'PAGADA';
  rut?: string;
  ocNumero?: string;
  ocEstado?: string;
  ocNoOperable?: boolean;
  vencimientoHistorial?: Array<{
    at?: string;
    userId?: string;
    userNombre?: string;
    desde?: string;
    hasta?: string;
  }>;
  ultimaEdicionVencimiento?: string;
}

/** Fila de flujo de caja (rollup Excel: concepto + código + mes). */
export interface FlujoCajaFila {
  id: string;
  periodo: string;
  conceptoId?: string;
  conceptoCodigo?: string;
  conceptoNombre: string;
  conceptoOrden: number;
  codigoFinancieroId?: string;
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  moneda: string;
  esApertura?: boolean;
  banco?: string;
  movimientoCajaId?: string;
  fecha?: string;
}

export interface FlujoCajaResponse {
  filas: FlujoCajaFila[];
  totalesMoneda?: Array<{ moneda: string; ingreso: number; egreso: number; saldo: number }>;
}

/** R2-T05 Anticipos productores (en legado: Tipo Docto ANT dentro de Pago a Proveedores). */
export interface AnticipoProductor {
  id: string;
  fecha: string;
  productor: string;
  rut?: string;
  clienteId?: string;
  proveedorId?: string;
  banco?: string;
  formaPago?: string;
  codigoFinanciero?: string;
  /** En legado suele ser ANT (anticipo) o TRA (traspaso parcial). */
  tipoDocto?: string;
  nroDocto?: string;
  nroComprobante?: string;
  fechaVencimiento?: string;
  monto: number;
  moneda: string;
  montoUsd?: number;
  montoCalzado: number;
  saldo: number;
  saldoUsd?: number;
  tc?: number;
  glosa?: string;
  estado: 'ABIERTO' | 'PARCIAL' | 'CERRADO';
  documentosCalce?: string;
}

export interface WorkflowConfig {
  id: string;
  nombre: string;
  modulo: string;
  montoMin: number;
  montoMax: number;
  aprobadores: number;
  /** Usuarios autorizados a aprobar (config Admin). */
  aprobadorIds?: string[];
  /** Detalle de jefes (viene en GET /workflows; evita depender de admin:read). */
  aprobadoresUsuarios?: Array<{
    id: string;
    nombre: string;
    activo?: boolean;
  }>;
  activo: boolean;
  empresaId?: string;
}

export interface DelegacionAprobacion {
  id: string;
  titularId: string;
  titularNombre: string;
  suplenteId: string;
  suplenteNombre: string;
  modulo?: string | null;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
  motivo?: string | null;
  activo: boolean;
  empresaId?: string;
}

export interface GrupoAprobacion {
  id: string;
  nombre: string;
  modulo: string;
  aprobadorInicialId: string;
  aprobadorInicialNombre?: string;
  miembroIds: string[];
  miembros?: Array<{ id: string; nombre: string }>;
  activo: boolean;
  empresaId?: string;
}

export interface NodoEscalaAprobacion {
  id: string;
  grupoId: string;
  grupoNombre?: string | null;
  modulo: string;
  usuarioId: string;
  usuarioNombre?: string;
  /** Lógica multi-aprobador: SIMPLE (default), AND (todos aprueban), OR (cualquiera aprueba). */
  logica?: 'SIMPLE' | 'AND' | 'OR';
  /** Lista de aprobadores para nodos AND/OR. Para SIMPLE contiene solo usuarioId. */
  aprobadores?: Array<{ usuarioId: string; usuarioNombre?: string; orden?: number }>;
  montoMax: number | null;
  escalaAUsuarioId?: string | null;
  escalaANombre?: string | null;
  /** ID del siguiente nodo en la cadena (reemplaza escalaAUsuarioId progresivamente). */
  escalaAId?: string | null;
  activo: boolean;
  empresaId?: string;
}

/** Administrador de concepto: acceso de solo-config a un módulo de aprobaciones. */
export interface AdminConcepto {
  id: string;
  empresaId?: string;
  usuarioId: string;
  usuarioNombre?: string;
  usuarioEmail?: string;
  modulo: string;
  activo: boolean;
}

export interface SimulacionAprobacionResult {
  status: 'ok' | 'no_pool' | 'sin_grupo' | 'sin_cadena';
  modulo: string;
  monto: number;
  grupo?: { id: string; nombre: string } | null;
  solicitanteId?: string;
  cadena: CadenaPasoPreview[];
  motivos: string[];
  workflowNombre?: string | null;
}

export interface AprobacionesBackupPreview {
  ok: boolean;
  version: number;
  empresaOrigenId?: string | null;
  empresaOrigenNombre?: string | null;
  empresaDestinoId: string;
  empresaDestinoNombre?: string | null;
  resumen: {
    grupos: number;
    nodos: number;
    delegaciones: number;
    adminConcepto: number;
    usuariosCatalogo: number;
  };
  pendientes: Record<string, number>;
  autoMatched: Array<{
    origenId: string;
    origenEmail?: string | null;
    origenNombre: string;
    destinoId: string | null;
    destinoNombre?: string;
    matchedBy: string;
  }>;
  eslabonesFaltantes: Array<{
    usuarioId: string;
    email?: string | null;
    nombre?: string | null;
    usos: Array<{ tipo: string; modulo: string; grupoNombre?: string; detalle: string }>;
  }>;
  usuariosDestino: Array<{ id: string; nombre: string; email: string }>;
}

export type ResolucionBackupUsuario = {
  accion: 'reemplazar' | 'eliminar';
  nuevoUsuarioId?: string | null;
};

/** KPIs del panel operativo. */
export interface DashboardKPIs {
  ocPorAprobar: number;
  proformasSinFactura: number;
  facturasPorRecibir: number;
  tcUsdHoy: number;
  /** @deprecated legacy mock */
  ventasMes?: number;
  flujoCaja?: number;
  presupuestoEjecucion?: number;
}

export interface TendenciaMensual {
  mes: string;
  ventas: number;
  gastos: number;
}

/** Preferencias de columnas de una lista (persistidas por usuario + tableKey). */
export interface UiTablePreference {
  tableKey: string;
  visibleColumns: string[];
  columnOrder: string[];
}
