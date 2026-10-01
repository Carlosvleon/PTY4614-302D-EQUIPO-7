import type {
  Empresa, Usuario, Rol, Moneda, UnidadMedida, CentroCosto, TipoDocumento,
  CuentaContable, Asiento, MovimientoCaja, Pago, Conciliacion, MovimientoConciliacion, Presupuesto,
  Contratista, TarifaContratista, ProformaContratista, OrdenCompra, AprobacionOc,
  RecepcionOc, RegistroCompra, Insumo, Bodega, MovimientoBodega, ElementoCosto,
  FactorHonorario, IndicadorBc, Cliente, Prospecto, DocumentoComercial, WorkflowConfig,
  DashboardKPIs, TendenciaMensual, Labor, Actividad,
  IngresoLaborDiario, CartolaBancaria, AnticipoProductor, PermisoPantalla,
  MovimientoCartola, DocumentoAging, AreaNegocio, CierreTraspasoContratista,
  CodigoFinanciero,
  ConceptoFlujo,
  TipoContratoContratista,
  AuditoriaContratista,
} from '@/types/domain';
import {
  cartolaFlujoExcel,
  codigosFlujoExcel,
  conceptosFlujoExcel,
  movimientosFlujoExcel,
} from './flujo-excel-demo';
import {
  catalogoPantallasVacias,
  codesFromMatrix,
  mergeConCatalogo,
} from '@/lib/pantallas-permisos';
import {
  EMPRESA_DEMO_NOMBRE,
  anticiposProductoresMj,
  aprobacionesOcMj,
  bodegasMj,
  clientesMj,
  cuentaCorrienteMovimientosMj,
  dashboardKpisMj,
  documentosAgingMj,
  documentosMj,
  insumoStockBodegaMj,
  insumosMj,
  movimientosBodegaMj,
  ordenesCompraMj,
  proveedoresMj,
} from './fixtures-almahue-demo';

const pantallasCatalogo = catalogoPantallasVacias();

function rolPantallas(
  decide: (pantalla: string) => { lectura: boolean; escritura: boolean },
): PermisoPantalla[] {
  return pantallasCatalogo.map((p) => {
    const d = decide(p.pantalla);
    return {
      pantalla: p.pantalla,
      lectura: d.lectura,
      escritura: d.lectura && d.escritura,
    };
  });
}

export const empresas: Empresa[] = [
  {
    id: 'EMP-1',
    razonSocial: EMPRESA_DEMO_NOMBRE,
    rut: '77.032.638-9',
    giro: 'Exportacion de fruta fresca y servicios de packing',
    activa: true,
    direccion: 'Camino Almahue s/n',
    comuna: 'Santa Cruz',
    ciudad: 'Santa Cruz',
    telefono: '+56 72 200 0000',
    emailContacto: 'contacto@almahue.cl',
    logoUrl: undefined,
    plantillaDoc: {
      showLogo: true,
      showAddress: true,
      showFooter: true,
      footerText: `${EMPRESA_DEMO_NOMBRE} · Documento generado desde ERP · uso interno`,
      watermarkText: '',
      watermarkOpacity: 0.1,
      columns: { folio: true, contraparte: true, fecha: true, neto: true, estado: true, extra: true },
    },
    gosocketBillerId: 'd159916d-4977-499f-a52e-70550fc379ee',
    gosocketNroResolucion: '0',
    gosocketFechaResolucion: '2024-10-11',
    gosocketActeco: '461001',
  },
  {
    id: 'EMP-2',
    razonSocial: 'ALM SERVICES SPA',
    rut: '77.032.639-7',
    giro: 'Servicios logisticos, transporte y soporte operacional',
    activa: true,
    gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
    gosocketNroResolucion: '0',
    gosocketFechaResolucion: '2020-02-14',
  },
];

/** DEC-13 / R2-R01: Digitador contratistas / Analista / Administrador */
export const roles: Rol[] = [
  {
    id: 'ROL-1',
    nombre: 'Administrador',
    permisos: ['*'],
    usuarios: 2,
    permisosPantalla: rolPantallas(() => ({ lectura: true, escritura: true })),
  },
  {
    id: 'ROL-2',
    nombre: 'Analista',
    permisos: [],
    usuarios: 3,
    aprobarConPin: false,
    permisosPantalla: rolPantallas((pantalla) => {
      const admin = pantalla.startsWith('Administración');
      const bloqueadoEscritura = admin
        || pantalla.includes('Traspaso')
        || pantalla.includes('Plan de cuentas')
        || pantalla.includes('Roles y permisos')
        || pantalla.includes('Aprobaciones')
        || pantalla.includes('Workflow');
      return {
        lectura: !pantalla.includes('Roles y permisos'),
        escritura: !bloqueadoEscritura,
      };
    }),
  },
  {
    id: 'ROL-3',
    nombre: 'Digitador contratistas',
    permisos: [
      'contratistas:read',
      'contratistas:capture',
      'contratistas:catalogs',
      'contratistas:rates',
      'contratistas:rate-override',
    ],
    usuarios: 6,
    permisosPantalla: rolPantallas((pantalla) => {
      const isCtr = pantalla.startsWith('Contratistas');
      const cierre = pantalla.includes('Traspaso');
      const operativo = pantalla.includes('Ingreso')
        || pantalla.includes('Tarifas')
        || pantalla.includes('Proformas')
        || pantalla.includes('Asociación')
        || pantalla.includes('Listado');
      return {
        lectura: isCtr && !cierre,
        escritura: isCtr && operativo && !cierre,
      };
    }),
  },
  {
    id: 'ROL-4',
    nombre: 'Contador',
    permisos: [],
    usuarios: 2,
    permisosPantalla: rolPantallas((pantalla) => {
      const contab = pantalla.startsWith('Contabilidad');
      const tes = pantalla.startsWith('Tesorería');
      const cierre = pantalla.includes('Traspaso');
      return {
        lectura: contab || tes || cierre || pantalla.startsWith('Panel'),
        escritura: pantalla.includes('Asientos')
          || pantalla.includes('Indicadores')
          || pantalla.includes('Cartolas')
          || pantalla.includes('Conciliación')
          || cierre,
      };
    }),
  },
  {
    id: 'ROL-5',
    nombre: 'Operador contratistas',
    permisos: [
      'contratistas:read',
      'contratistas:capture',
      'contratistas:catalogs',
      'contratistas:rates',
      'contratistas:rate-override',
      'contratistas:finalize',
      'contratistas:invoice',
      'contratistas:reverse',
      'contratistas:transfer',
      'contratistas:close',
      'contratistas:reopen',
      'contratistas:audit',
    ],
    usuarios: 0,
    aprobarConPin: false,
    permisosPantalla: rolPantallas((pantalla) => {
      const isCtr = pantalla.startsWith('Contratistas');
      return {
        lectura: isCtr || pantalla.startsWith('Panel'),
        escritura: pantalla.includes('Proformas'),
      };
    }),
  },
].map((r) => ({
  ...r,
  aprobarConPin: Boolean((r as { aprobarConPin?: boolean }).aprobarConPin),
  permisos: r.permisos.length ? r.permisos : codesFromMatrix(mergeConCatalogo(r.permisosPantalla)),
  permisosPantalla: mergeConCatalogo(r.permisosPantalla),
}));

export const usuarios: Usuario[] = [
  { id: 'U-1', nombre: 'Admin Almahue', email: 'admin@almahue.local', rolId: 'ROL-1', rolNombre: 'Administrador', empresaId: 'EMP-1', empresaIds: ['EMP-1', 'EMP-2'], activo: true },
  { id: 'U-2', nombre: 'Carolina Pérez', email: 'cperez@almahue.cl', rolId: 'ROL-2', rolNombre: 'Analista', empresaId: 'EMP-1', empresaIds: ['EMP-1', 'EMP-2'], activo: true },
  { id: 'U-3', nombre: 'Jorge Sánchez', email: 'jsanchez@almahue.cl', rolId: 'ROL-3', rolNombre: 'Digitador contratistas', empresaId: 'EMP-1', empresaIds: ['EMP-1'], activo: true },
  { id: 'U-4', nombre: 'Ana Torres', email: 'atorres@almahue.cl', rolId: 'ROL-4', rolNombre: 'Contador', empresaId: 'EMP-1', empresaIds: ['EMP-1'], activo: true },
  { id: 'U-5', nombre: 'Pedro Rojas', email: 'projas@almahue.cl', rolId: 'ROL-3', rolNombre: 'Digitador contratistas', empresaId: 'EMP-2', empresaIds: ['EMP-2'], activo: true },
  { id: 'U-6', nombre: 'María González', email: 'mgonzalez@almahue.cl', rolId: 'ROL-2', rolNombre: 'Analista', empresaId: 'EMP-1', empresaIds: ['EMP-1'], activo: true },
  { id: 'U-7', nombre: 'Claudia Vargas', email: 'cvargas@almahue.cl', rolId: 'ROL-2', rolNombre: 'Analista', empresaId: 'EMP-1', empresaIds: ['EMP-1'], activo: true },
  { id: 'U-8', nombre: 'Ricardo Muñoz', email: 'rmunoz@almahue.cl', rolId: 'ROL-2', rolNombre: 'Analista', empresaId: 'EMP-1', empresaIds: ['EMP-1'], activo: true },
  { id: 'U-15', nombre: 'Luis Herrera', email: 'lherrera@almahue.cl', rolId: 'ROL-3', rolNombre: 'Digitador contratistas', empresaId: 'EMP-1', empresaIds: ['EMP-1'], activo: true },
];

/** DEC-05: foco CLP/USD/CNY/EUR — UF fuera de foco */
export const monedas: Moneda[] = [
  { id: 'MON-1', codigo: 'CLP', nombre: 'Peso chileno', simbolo: '$', activa: true, focoReporteria: true },
  { id: 'MON-2', codigo: 'USD', nombre: 'Dólar USA', simbolo: 'US$', activa: true, focoReporteria: true },
  { id: 'MON-3', codigo: 'CNY', nombre: 'Yuan chino', simbolo: '¥', activa: true, focoReporteria: true },
  { id: 'MON-4', codigo: 'EUR', nombre: 'Euro', simbolo: '€', activa: true, focoReporteria: true },
  { id: 'MON-5', codigo: 'UF', nombre: 'Unidad de fomento', simbolo: 'UF', activa: false, focoReporteria: false },
];

export const unidades: UnidadMedida[] = [
  { id: 'UM-1', codigo: 'UN', nombre: 'Unidad', activa: true },
  { id: 'UM-2', codigo: 'KG', nombre: 'Kilogramo', activa: true },
  { id: 'UM-3', codigo: 'CAJ', nombre: 'Caja', activa: true },
  { id: 'UM-4', codigo: 'HR', nombre: 'Hora labor', activa: true },
  { id: 'UM-5', codigo: 'HA', nombre: 'Hectárea', activa: true },
  { id: 'UM-6', codigo: 'LT', nombre: 'Litro', activa: true },
];

export const centrosCosto: CentroCosto[] = [
  { id: 'CC-1', codigo: '1001', nombre: 'ADMINISTRACIÓN', activa: true, empresaId: 'EMP-1', vigenciaDesde: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z', contactoEncargado: 'Mario González' },
  { id: 'CC-2', codigo: '1002', nombre: 'PACKING', activa: true, empresaId: 'EMP-1', vigenciaDesde: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z', contactoEncargado: 'Carolina Pérez' },
  { id: 'CC-3', codigo: '1003', nombre: 'CAMPO / CUARTELES', activa: true, empresaId: 'EMP-1', vigenciaDesde: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z', contactoEncargado: 'Mario González' },
  { id: 'CC-4', codigo: '1004', nombre: 'LOGÍSTICA', activa: true, empresaId: 'EMP-2', vigenciaDesde: '2025-06-01', createdAt: '2025-06-01T00:00:00.000Z', contactoEncargado: 'Pedro Rojas' },
  { id: 'CC-5', codigo: '1005', nombre: 'FINANZAS', activa: false, empresaId: 'EMP-1', vigenciaDesde: '2024-01-01', createdAt: '2024-01-01T00:00:00.000Z', vigenciaHasta: '2025-12-31' },
];

/** Dimensión área (Reu6 D9) — alineado al seed EMP-1 + packing/frig. */
export const areasNegocio: AreaNegocio[] = [
  { id: 'AN-1', codigo: 'PACK', nombre: 'Packing', activa: true, empresaId: 'EMP-1' },
  { id: 'AN-2', codigo: 'CAMPO', nombre: 'Campo', activa: true, empresaId: 'EMP-1' },
  { id: 'AN-3', codigo: 'ADM', nombre: 'Administración', activa: true, empresaId: 'EMP-1' },
  { id: 'AN-4', codigo: 'FRIG', nombre: 'Frigorífico', activa: true, empresaId: 'EMP-1' },
  { id: 'AN-5', codigo: 'EXP', nombre: 'Exportación', activa: false, empresaId: 'EMP-1' },
];

/** Agrupadores del flujo. OPE/FIN son el demo chico; CX-EX-* es el Excel, solo agosto 2026. */
export const conceptosFlujo: ConceptoFlujo[] = [
  { id: 'CX-1', codigo: 'OPE', nombre: 'OPERACIONES COMERCIALES', orden: 10, activo: true, empresaId: 'EMP-1' },
  { id: 'CX-2', codigo: 'FIN', nombre: 'FINANCIEROS', orden: 80, activo: true, empresaId: 'EMP-1' },
  ...conceptosFlujoExcel,
];

/** Demo: el maestro real arranca vacío; aquí hay códigos para ejercitar cartola. */
export const codigosFinancieros: CodigoFinanciero[] = [
  { id: 'CF-1', codigo: '10100', nombre: 'PAGO A PROVEEDORES', activa: true, empresaId: 'EMP-1', conceptoId: 'CX-1', conceptoCodigo: 'OPE', conceptoNombre: 'OPERACIONES COMERCIALES', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'CF-2', codigo: '10200', nombre: 'COBRO A CLIENTES', activa: true, empresaId: 'EMP-1', conceptoId: 'CX-1', conceptoCodigo: 'OPE', conceptoNombre: 'OPERACIONES COMERCIALES', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'CF-3', codigo: '10300', nombre: 'REMUNERACIONES', activa: true, empresaId: 'EMP-1', conceptoId: 'CX-2', conceptoCodigo: 'FIN', conceptoNombre: 'FINANCIEROS', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'CF-4', codigo: '10400', nombre: 'TRASPASO ENTRE CUENTAS', activa: true, empresaId: 'EMP-1', conceptoId: 'CX-EX-VENC', conceptoCodigo: 'VENC', conceptoNombre: 'Vencimientos', createdAt: '2026-08-01T00:00:00.000Z' },
  ...codigosFlujoExcel.filter((c) => c.id !== 'CF-4'),
];

export const tiposDocumento: TipoDocumento[] = [
  { id: 'TD-1', codigo: 'OC', nombre: 'Orden de compra', modulo: 'Compras', activo: true },
  { id: 'TD-2', codigo: 'FAC', nombre: 'Factura compra', modulo: 'Compras', activo: true },
  { id: 'TD-3', codigo: 'NC', nombre: 'Nota de crédito', modulo: 'Insumos', activo: true },
  // Comercial (ventas)
  { id: 'TD-4', codigo: 'FAE', nombre: 'Factura electrónica venta', modulo: 'Comercial', activo: true },
  { id: 'TD-5', codigo: 'BOL', nombre: 'Boleta de ventas', modulo: 'Comercial', activo: true },
  { id: 'TD-6', codigo: 'BEX', nombre: 'Boleta exenta electrónica', modulo: 'Comercial', activo: true },
  { id: 'TD-7', codigo: 'FEX', nombre: 'Factura exenta electrónica', modulo: 'Comercial', activo: true },
  { id: 'TD-8', codigo: 'NC', nombre: 'Nota de crédito venta', modulo: 'Comercial', activo: true },
  { id: 'TD-9', codigo: 'ND', nombre: 'Nota de débito venta', modulo: 'Comercial', activo: true },
  { id: 'TD-11', codigo: 'GD', nombre: 'Guía de despacho electrónica', modulo: 'Comercial', activo: true },
  { id: 'TD-12', codigo: '101', nombre: 'Factura de exportación', modulo: 'Comercial', activo: true },
  { id: 'TD-13', codigo: '110', nombre: 'Factura exportación electrónica', modulo: 'Comercial', activo: true },
  // Compras
  { id: 'TD-14', codigo: 'FCE', nombre: 'Factura compra electrónica', modulo: 'Compras', activo: true },
  { id: 'TD-15', codigo: 'NC', nombre: 'Nota de crédito compra', modulo: 'Compras', activo: true },
  { id: 'TD-16', codigo: 'ND', nombre: 'Nota de débito compra', modulo: 'Compras', activo: true },
  { id: 'TD-17', codigo: 'OS', nombre: 'Orden de servicio', modulo: 'Compras', activo: true },
  // Contratistas
  { id: 'TD-18', codigo: 'PRF', nombre: 'Proforma contratista', modulo: 'Contratistas', activo: true },
  { id: 'TD-19', codigo: 'FCT', nombre: 'Factura contratista', modulo: 'Contratistas', activo: true },
  { id: 'TD-20', codigo: '1000', nombre: 'Boleta de honorarios con retención', modulo: 'Contratistas', activo: true },
  { id: 'TD-21', codigo: '1001', nombre: 'Boleta honorario electrónica con retención', modulo: 'Contratistas', activo: true },
  { id: 'TD-22', codigo: '1002', nombre: 'Boleta honorario electrónica sin retención', modulo: 'Contratistas', activo: true },
  { id: 'TD-23', codigo: '1003', nombre: 'Boleta de honorarios sin retención', modulo: 'Contratistas', activo: true },
  { id: 'TD-24', codigo: '1005', nombre: 'Boleta de honorarios de terceros', modulo: 'Contratistas', activo: true },
  // Insumos / bodega
  { id: 'TD-25', codigo: 'REC', nombre: 'Recepción de bodega', modulo: 'Insumos', activo: true },
  { id: 'TD-26', codigo: 'TRA', nombre: 'Traspaso de bodega', modulo: 'Insumos', activo: true },
  { id: 'TD-27', codigo: 'ND', nombre: 'Nota de descuento', modulo: 'Insumos', activo: true },
  // Contabilidad
  { id: 'TD-28', codigo: 'ASI', nombre: 'Asiento contable', modulo: 'Contabilidad', activo: true },
  { id: 'TD-29', codigo: 'APE', nombre: 'Asiento de apertura', modulo: 'Contabilidad', activo: true },
  { id: 'TD-30', codigo: 'CIE', nombre: 'Asiento de cierre', modulo: 'Contabilidad', activo: true },
  { id: 'TD-31', codigo: 'PROV', nombre: 'Provisión contable', modulo: 'Contabilidad', activo: true },
  { id: 'TD-32', codigo: 'AJU', nombre: 'Ajuste contable', modulo: 'Contabilidad', activo: true },
  { id: 'TD-33', codigo: '914', nombre: 'Declaración de ingreso', modulo: 'Contabilidad', activo: true },
  // Tesorería
  { id: 'TD-34', codigo: 'DEP', nombre: 'Depósito', modulo: 'Tesorería', activo: true },
  { id: 'TD-35', codigo: 'CHQ', nombre: 'Cheque', modulo: 'Tesorería', activo: true },
  { id: 'TD-36', codigo: 'CHQM', nombre: 'Cheque manual', modulo: 'Tesorería', activo: true },
  { id: 'TD-37', codigo: 'TRANS', nombre: 'Transferencia', modulo: 'Tesorería', activo: true },
  { id: 'TD-38', codigo: 'ABO', nombre: 'Abono', modulo: 'Tesorería', activo: true },
  { id: 'TD-39', codigo: 'ANT', nombre: 'Anticipo', modulo: 'Tesorería', activo: true },
  { id: 'TD-40', codigo: 'EGR', nombre: 'Egreso de caja', modulo: 'Tesorería', activo: true },
  { id: 'TD-41', codigo: 'ING', nombre: 'Ingreso de caja', modulo: 'Tesorería', activo: true },
  { id: 'TD-42', codigo: 'PAE', nombre: 'Préstamo', modulo: 'Tesorería', activo: true },
  { id: 'TD-43', codigo: 'PAG', nombre: 'Pagaré', modulo: 'Tesorería', activo: true },
  { id: 'TD-44', codigo: 'LET', nombre: 'Letra de cambio', modulo: 'Tesorería', activo: true },
  { id: 'TD-45', codigo: 'VAL', nombre: 'Vales de rendición', modulo: 'Tesorería', activo: true },
  { id: 'TD-46', codigo: 'VB', nombre: 'Vales y boletas', modulo: 'Tesorería', activo: true },
  { id: 'TD-47', codigo: 'CAR', nombre: 'Cargo', modulo: 'Tesorería', activo: true },
  { id: 'TD-48', codigo: 'COB', nombre: 'Cobro EERR', modulo: 'Tesorería', activo: true },
  { id: 'TD-49', codigo: 'FFMM', nombre: 'Fondos mutuos', modulo: 'Tesorería', activo: true },
  { id: 'TD-50', codigo: '70', nombre: 'Caja chica', modulo: 'Tesorería', activo: true },
  { id: 'TD-51', codigo: '75', nombre: 'Tarjeta de crédito', modulo: 'Tesorería', activo: true },
  { id: 'TD-52', codigo: '76', nombre: 'Otro documento', modulo: 'Tesorería', activo: true },
  { id: 'TD-53', codigo: 'BL', nombre: 'BL (conocimiento de embarque)', modulo: 'Comercial', activo: true },
  { id: 'TD-54', codigo: 'PRF', nombre: 'Proforma contratista', modulo: 'Contratistas', activo: true },
  { id: 'TD-55', codigo: 'ASI', nombre: 'Asiento contable', modulo: 'Contabilidad', activo: true },
  ...([
    ['1000', 'Boleta de honorarios con retención'],
    ['1001', 'Boleta de honorarios electrónica con retención'],
    ['1002', 'Boleta de honorarios electrónica sin retención'],
    ['1003', 'Boleta de honorarios sin retención'],
    ['1004', 'Boleta honorario + 3%'],
    ['1005', 'BHE de terceros'],
    ['101', 'Factura de exportación'],
    ['104', 'Nota de débito exportación'],
    ['106', 'Nota de crédito exportación'],
    ['110', 'Factura exportación electrónica'],
    ['111', 'Nota de débito exportación'],
    ['112', 'Nota de crédito exportación'],
    ['30', 'Factura'],
    ['31', 'Facturas null'],
    ['32', 'Factura exenta'],
    ['33', 'Factura electrónica'],
    ['34', 'Factura exenta electrónica'],
    ['35', 'Boleta de ventas'],
    ['43', 'Liquidación factura'],
    ['45', 'Factura de compra'],
    ['46', 'Factura compra electrónica'],
    ['55', 'Nota de débito'],
    ['56', 'Nota de débito electrónica'],
    ['60', 'Nota de crédito'],
    ['61', 'Nota de crédito electrónica'],
    ['62', 'Nota de crédito null'],
    ['70', 'Caja chica'],
    ['71', 'Nota de cobro'],
    ['75', 'Tarjeta de crédito'],
    ['76', 'Otro documento'],
    ['77', 'BL'],
    ['78', 'Nota de descuento'],
    ['914', 'Declaración de ingreso'],
    ['ABO', 'Abono'],
    ['ANT', 'Anticipo'],
    ['APE', 'Apertura'],
    ['BOL', 'Boleta rendición'],
    ['BVE', 'Venta con boleta'],
    ['CAR', 'Cargo'],
    ['CHQ', 'Cheque'],
    ['CHQM', 'Cheque manual'],
    ['COB', 'Cobro EERR'],
    ['DEP', 'Depósito'],
    ['EGR', 'Egreso'],
    ['FEX', 'Factura exenta'],
    ['FFMM', 'Fondos mutuos'],
    ['ING', 'Ingreso'],
    ['LET', 'Letra de cambio'],
    ['OC', 'Orden de compra'],
    ['PAE', 'Préstamo'],
    ['PAG', 'Pagaré'],
    ['PROV', 'Provisión'],
    ['REC', 'Recepción de bodega'],
    ['TRA', 'Traspaso'],
    ['TRANS', 'Transferencias'],
    ['VAL', 'Vales rendición'],
    ['VB', 'Vales y boletas'],
  ] as const).map(([codigo, nombre]) => ({
    id: `TD-REF-${codigo}`,
    codigo,
    nombre,
    modulo: 'Referencia',
    activo: true,
  })),
];

export const cuentas: CuentaContable[] = [
  { id: 'CT-1', codigo: '1-0-00-00', nombre: 'ACTIVO', tipo: 'ACTIVO', nivel: 1, activa: true, noImputable: true },
  { id: 'CT-1a', codigo: '1-1-00-00', nombre: 'ACTIVO CORRIENTE', tipo: 'ACTIVO', nivel: 2, padreId: 'CT-1', activa: true, noImputable: true },
  { id: 'CT-1b', codigo: '1-1-01-00', nombre: 'EFECTIVO Y EQUIVALENTES', tipo: 'ACTIVO', nivel: 3, padreId: 'CT-1a', activa: true, noImputable: true },
  { id: 'CT-2', codigo: '1-1-01-01', nombre: 'Caja General', tipo: 'ACTIVO', nivel: 4, padreId: 'CT-1b', activa: true, noImputable: false },
  { id: 'CT-13', codigo: '1-1-01-02', nombre: 'Banco Estado', tipo: 'ACTIVO', nivel: 4, padreId: 'CT-1b', activa: true, noImputable: false },
  { id: 'CT-3', codigo: '2-0-00-00', nombre: 'PASIVO', tipo: 'PASIVO', nivel: 1, activa: true, noImputable: true },
  { id: 'CT-3a', codigo: '2-1-00-00', nombre: 'PASIVO CORRIENTE', tipo: 'PASIVO', nivel: 2, padreId: 'CT-3', activa: true, noImputable: true },
  { id: 'CT-3b', codigo: '2-1-01-00', nombre: 'CUENTAS POR PAGAR', tipo: 'PASIVO', nivel: 3, padreId: 'CT-3a', activa: true, noImputable: true },
  { id: 'CT-4', codigo: '2-1-01-01', nombre: 'Proveedores', tipo: 'PASIVO', nivel: 4, padreId: 'CT-3b', activa: true, requiereCc: true, noImputable: false },
  { id: 'CT-5', codigo: '6-0-00-00', nombre: 'COSTOS Y GASTOS', tipo: 'GASTO', nivel: 1, activa: true, noImputable: true },
  { id: 'CT-5a', codigo: '6-1-00-00', nombre: 'COSTOS DE PRODUCCIÓN', tipo: 'GASTO', nivel: 2, padreId: 'CT-5', activa: true, noImputable: true },
  { id: 'CT-5b', codigo: '6-1-01-00', nombre: 'LABORES', tipo: 'GASTO', nivel: 3, padreId: 'CT-5a', activa: true, noImputable: true },
  { id: 'CT-6', codigo: '6-1-01-01', nombre: 'Labores contratistas', tipo: 'GASTO', nivel: 4, padreId: 'CT-5b', activa: true, requiereCc: true, requiereElemento: true, requiereEspecie: true, noImputable: false },
  { id: 'CT-7', codigo: '1-1-02-00', nombre: 'DEUDORES', tipo: 'ACTIVO', nivel: 3, padreId: 'CT-1a', activa: true, noImputable: true },
  { id: 'CT-8', codigo: '1-1-02-01', nombre: 'Clientes nacionales', tipo: 'ACTIVO', nivel: 4, padreId: 'CT-7', activa: true, noImputable: false },
  { id: 'CT-9', codigo: '5-0-00-00', nombre: 'INGRESOS', tipo: 'INGRESO', nivel: 1, activa: true, noImputable: true },
  { id: 'CT-10', codigo: '5-1-01-01', nombre: 'Ventas fruta', tipo: 'INGRESO', nivel: 4, padreId: 'CT-9', activa: true, noImputable: false },
  { id: 'CT-11', codigo: '2-1-02-01', nombre: 'IVA débito fiscal', tipo: 'PASIVO', nivel: 4, padreId: 'CT-3a', activa: true, noImputable: false },
  { id: 'CT-12', codigo: '1-1-03-01', nombre: 'IVA crédito fiscal', tipo: 'ACTIVO', nivel: 4, padreId: 'CT-1a', activa: true, noImputable: false },
];

export const periodosContables: import('@/types/domain').PeriodoContable[] = [
  {
    id: 'PER-1',
    codigo: '2026-06',
    anio: 2026,
    mes: 6,
    fechaDesde: '2026-06-01',
    fechaHasta: '2026-06-30',
    estado: 'CERRADO',
    activo: false,
    empresaId: 'EMP-1',
  },
  {
    id: 'PER-2',
    codigo: '2026-07',
    anio: 2026,
    mes: 7,
    fechaDesde: '2026-07-01',
    fechaHasta: '2026-07-31',
    estado: 'CERRADO',
    activo: false,
    empresaId: 'EMP-1',
  },
  {
    id: 'PER-3',
    codigo: '2026-08',
    anio: 2026,
    mes: 8,
    fechaDesde: '2026-08-01',
    fechaHasta: '2026-08-31',
    estado: 'ABIERTO',
    activo: true,
    empresaId: 'EMP-1',
  },
];

export const configsContableSii: import('@/types/domain').ConfigContableSii[] = [
  { id: 'SII-1', tipoDocumentoSii: '33', codigoSii: '33', nombre: 'Factura electrónica venta', cuentaContableId: 'CT-10', cuentaCodigo: '5-1-01-01', cuentaNombre: 'Ventas fruta', lado: 'HABER', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-2', tipoDocumentoSii: '46', codigoSii: '46', nombre: 'Factura compra', cuentaContableId: 'CT-6', cuentaCodigo: '6-1-01-01', cuentaNombre: 'Labores contratistas', lado: 'DEBE', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-3', tipoDocumentoSii: 'CLIENTES', nombre: 'Clientes por cobrar', cuentaContableId: 'CT-8', cuentaCodigo: '1-1-02-01', cuentaNombre: 'Clientes nacionales', lado: 'DEBE', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-4', tipoDocumentoSii: 'PROVEEDORES', nombre: 'Proveedores', cuentaContableId: 'CT-4', cuentaCodigo: '2-1-01-01', cuentaNombre: 'Proveedores', lado: 'HABER', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-5', tipoDocumentoSii: 'IVA_DEBITO', nombre: 'IVA débito fiscal', cuentaContableId: 'CT-11', cuentaCodigo: '2-1-02-01', cuentaNombre: 'IVA débito fiscal', lado: 'HABER', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-6', tipoDocumentoSii: 'IVA_CREDITO', nombre: 'IVA crédito fiscal', cuentaContableId: 'CT-12', cuentaCodigo: '1-1-03-01', cuentaNombre: 'IVA crédito fiscal', lado: 'DEBE', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-7', tipoDocumentoSii: 'CONTRATISTAS', nombre: 'Gasto MO contratistas', cuentaContableId: 'CT-6', cuentaCodigo: '6-1-01-01', cuentaNombre: 'Labores contratistas', lado: 'DEBE', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-8', tipoDocumentoSii: 'BODEGA', nombre: 'Inventario / bodega', cuentaContableId: 'CT-2', cuentaCodigo: '1-1-01-01', cuentaNombre: 'Caja General', lado: 'DEBE', activa: true, empresaId: 'EMP-1' },
  { id: 'SII-9', tipoDocumentoSii: 'BANCO', nombre: 'Banco / cartola', cuentaContableId: 'CT-13', cuentaCodigo: '1-1-01-02', cuentaNombre: 'Banco Estado', lado: 'DEBE', activa: true, empresaId: 'EMP-1' },
];

function asientoLineas(
  base: Omit<Asiento, 'debe' | 'haber' | 'lineas'> & {
    lineas: NonNullable<Asiento['lineas']>;
  },
): Asiento {
  const debe = base.lineas.reduce((a, l) => a + (l.debe || 0), 0);
  const haber = base.lineas.reduce((a, l) => a + (l.haber || 0), 0);
  return { ...base, debe, haber };
}

export const asientos: Asiento[] = [
  asientoLineas({
    id: 'ASI-10',
    numero: '20260601',
    periodo: '2026-06',
    fecha: '2026-06-30',
    tipo: 'DIARIO',
    glosa: 'Traspaso/cierre contratistas 2026-06',
    estado: 'CONTABILIZADO',
    origen: 'TRASPASO-CTR:2026-06',
    lineas: [
      { debe: 3100000, haber: 0, cuentaId: 'CT-6', glosa: 'Costo MO contratada', centroCostoId: 'CC-2' },
      { debe: 0, haber: 3100000, cuentaId: 'CT-4', glosa: 'Facturas por recibir contratistas' },
    ],
  }),
  asientoLineas({
    id: 'ASI-1',
    numero: '20260001',
    periodo: '2026-07',
    fecha: '2026-07-03',
    tipo: 'DIARIO',
    glosa: 'Recepción OC embalaje packing',
    estado: 'CONTABILIZADO',
    origen: 'Compras',
    lineas: [
      { debe: 1280000, haber: 0, cuentaId: 'CT-6', glosa: 'Costo packing', centroCostoId: 'CC-2' },
      { debe: 243200, haber: 0, cuentaId: 'CT-12', glosa: 'IVA crédito' },
      { debe: 0, haber: 1523200, cuentaId: 'CT-4', glosa: 'Envapack SpA' },
    ],
  }),
  asientoLineas({
    id: 'ASI-2',
    numero: '20260002',
    periodo: '2026-07',
    fecha: '2026-07-10',
    tipo: 'DIARIO',
    glosa: 'Entrada bodega materiales packing',
    estado: 'CONTABILIZADO',
    origen: 'Bodega',
    lineas: [
      { debe: 890000, haber: 0, cuentaId: 'CT-2', glosa: 'Inventario / caja (demo)' },
      { debe: 0, haber: 890000, cuentaId: 'CT-4', glosa: 'Proveedores embalaje' },
    ],
  }),
  asientoLineas({
    id: 'ASI-3',
    numero: '20260003',
    periodo: '2026-07',
    fecha: '2026-07-18',
    tipo: 'DIARIO',
    glosa: 'Venta fruta nacional Frutam',
    estado: 'CONTABILIZADO',
    origen: 'Comercial',
    lineas: [
      { debe: 1785000, haber: 0, cuentaId: 'CT-8', glosa: 'Clientes nacionales' },
      { debe: 0, haber: 1500000, cuentaId: 'CT-10', glosa: 'Ventas fruta' },
      { debe: 0, haber: 285000, cuentaId: 'CT-11', glosa: 'IVA débito' },
    ],
  }),
  asientoLineas({
    id: 'ASI-4',
    numero: '20260004',
    periodo: '2026-07',
    fecha: '2026-07-25',
    tipo: 'AJUSTE',
    glosa: 'NC devolución packing',
    estado: 'CONTABILIZADO',
    origen: 'Compras',
    lineas: [
      { debe: 150000, haber: 0, cuentaId: 'CT-4', glosa: 'Reverso proveedores' },
      { debe: 0, haber: 150000, cuentaId: 'CT-6', glosa: 'Reverso costo packing', centroCostoId: 'CC-2' },
    ],
  }),
  asientoLineas({
    id: 'ASI-2026-08-FEX-1973',
    numero: '20260801',
    periodo: '2026-08',
    fecha: '2026-08-10',
    tipo: 'DIARIO',
    glosa: 'Factura exportación FEX-1973 Sarango',
    estado: 'CONTABILIZADO',
    origen: 'VENTA:FEX-1973',
    lineas: [
      { debe: 43_114_800, haber: 0, cuentaId: 'CT-8', glosa: 'Clientes exportación' },
      { debe: 0, haber: 43_114_800, cuentaId: 'CT-10', glosa: 'Ventas fruta exenta (FOB)' },
    ],
  }),
  asientoLineas({
    id: 'ASI-6',
    numero: '20260802',
    periodo: '2026-08',
    fecha: '2026-08-05',
    tipo: 'DIARIO',
    glosa: 'Recepción OC cajas master Almahue',
    estado: 'CONTABILIZADO',
    origen: 'Compras',
    lineas: [
      { debe: 2100000, haber: 0, cuentaId: 'CT-6', glosa: 'Embalaje packing', centroCostoId: 'CC-2' },
      { debe: 399000, haber: 0, cuentaId: 'CT-12', glosa: 'IVA crédito' },
      { debe: 0, haber: 2499000, cuentaId: 'CT-4', glosa: 'Embalajes Troya' },
    ],
  }),
  asientoLineas({
    id: 'ASI-2026-08-FAC-45821',
    numero: '20260803',
    periodo: '2026-08',
    fecha: '2026-08-12',
    tipo: 'DIARIO',
    glosa: 'Factura venta nacional FAC-45821 Frutam',
    estado: 'CONTABILIZADO',
    origen: 'VENTA:FAC-45821',
    lineas: [
      { debe: 5_771_500, haber: 0, cuentaId: 'CT-8', glosa: 'Clientes nacionales' },
      { debe: 0, haber: 4_850_000, cuentaId: 'CT-10', glosa: 'Ventas fruta' },
      { debe: 0, haber: 921_500, cuentaId: 'CT-11', glosa: 'IVA débito' },
    ],
  }),
  asientoLineas({
    id: 'ASI-CART-AUG-2',
    numero: '20260805',
    periodo: '2026-08',
    fecha: '2026-08-05',
    tipo: 'DIARIO',
    glosa: 'Cartola TRF-8831: Pago ENVAPACK SPA · FAC-C-8810',
    estado: 'CONTABILIZADO',
    origen: 'CARTOLA:MCAR-AUG-2',
    lineas: [
      { debe: 0, haber: 1_280_000, cuentaId: 'CT-13', glosa: 'Banco' },
      { debe: 1_280_000, haber: 0, cuentaId: 'CT-4', glosa: 'Contrapartida' },
    ],
  }),
  asientoLineas({
    id: 'ASI-CART-AUG-1',
    numero: '20260810',
    periodo: '2026-08',
    fecha: '2026-08-14',
    tipo: 'DIARIO',
    glosa: 'Cartola TRF-8842: Abono IMPORTADORA DE FRUTAS SARANGO · FEX-1973',
    estado: 'CONTABILIZADO',
    origen: 'CARTOLA:MCAR-AUG-1',
    lineas: [
      { debe: 15_000_000, haber: 0, cuentaId: 'CT-13', glosa: 'Banco' },
      { debe: 0, haber: 15_000_000, cuentaId: 'CT-8', glosa: 'Contrapartida' },
    ],
  }),
  asientoLineas({
    id: 'ASI-CART-1',
    numero: '20260041',
    periodo: '2026-07',
    fecha: '2026-07-18',
    tipo: 'DIARIO',
    glosa: 'Cartola TRF-2041: Pago proveedor Santa Pilar',
    estado: 'CONTABILIZADO',
    origen: 'CARTOLA:MCAR-1',
    lineas: [
      { debe: 0, haber: 2_450_000, cuentaId: 'CT-13', glosa: 'Banco' },
      { debe: 2_450_000, haber: 0, cuentaId: 'CT-4', glosa: 'Contrapartida' },
    ],
  }),
  asientoLineas({
    id: 'ASI-CART-3',
    numero: '20260042',
    periodo: '2026-07',
    fecha: '2026-07-20',
    tipo: 'DIARIO',
    glosa: 'Cartola DEP-881: Depósito cliente export',
    estado: 'CONTABILIZADO',
    origen: 'CARTOLA:MCAR-3',
    lineas: [
      { debe: 5_120_000, haber: 0, cuentaId: 'CT-13', glosa: 'Banco' },
      { debe: 0, haber: 5_120_000, cuentaId: 'CT-8', glosa: 'Contrapartida' },
    ],
  }),
  asientoLineas({
    id: 'ASI-CART-6',
    numero: '20260031',
    periodo: '2026-07',
    fecha: '2026-07-12',
    tipo: 'DIARIO',
    glosa: 'Cartola TRF-991: Anticipo Frutícola El Monte',
    estado: 'CONTABILIZADO',
    origen: 'CARTOLA:MCAR-6',
    lineas: [
      { debe: 0, haber: 1_500_000, cuentaId: 'CT-13', glosa: 'Banco' },
      { debe: 1_500_000, haber: 0, cuentaId: 'CT-4', glosa: 'Contrapartida' },
    ],
  }),
  asientoLineas({
    id: 'ASI-8',
    numero: '20260804',
    periodo: '2026-08',
    fecha: '2026-08-12',
    tipo: 'MANUAL',
    glosa: 'Ajuste apertura packing (borrador)',
    estado: 'BORRADOR',
    origen: 'Manual',
    lineas: [
      { debe: 250000, haber: 0, cuentaId: 'CT-6', glosa: 'Ajuste MO', centroCostoId: 'CC-3' },
      { debe: 0, haber: 250000, cuentaId: 'CT-4', glosa: 'Contrapartida' },
    ],
  }),
];

export const movimientosCaja: MovimientoCaja[] = [
  {
    id: 'MC-1', fecha: '2026-08-01', concepto: 'Saldo apertura mes',
    ingreso: 45000000, egreso: 0, saldo: 45000000,
    banco: 'Banco Estado', moneda: 'CLP', esApertura: true,
  },
  {
    id: 'MC-2', fecha: '2026-08-05', concepto: 'Pago Envapack FAC-C-8810 · TRF-8831',
    ingreso: 0, egreso: 1280000, saldo: 43720000,
    banco: 'Banco Estado', moneda: 'CLP',
  },
  {
    id: 'MC-3', fecha: '2026-08-11', concepto: 'Depósito por identificar · DEP-910',
    ingreso: 2500000, egreso: 0, saldo: 46220000,
    banco: 'Banco Estado', moneda: 'CLP',
  },
  {
    id: 'MC-4', fecha: '2026-08-13', concepto: 'Comisión bancaria · COM-20',
    ingreso: 0, egreso: 18500, saldo: 46201500,
    banco: 'Banco Estado', moneda: 'CLP',
  },
  {
    id: 'MC-5', fecha: '2026-08-14', concepto: 'Cobro FEX-1973 · TRF-8842',
    ingreso: 15000000, egreso: 0, saldo: 61201500,
    banco: 'Banco Estado', moneda: 'CLP',
  },
  {
    id: 'MC-USD-1', fecha: '2026-08-01', concepto: 'Saldo apertura USD',
    ingreso: 80000, egreso: 0, saldo: 80000,
    banco: 'Banco Chile USD', moneda: 'USD', esApertura: true,
  },
  {
    id: 'MC-CNY-1', fecha: '2026-08-01', concepto: 'Saldo apertura yuan',
    ingreso: 250000, egreso: 0, saldo: 250000,
    banco: 'Banco China CNY', moneda: 'CNY', esApertura: true,
  },
];

export const pagos: Pago[] = [
  {
    id: 'PAG-21', fecha: '2026-08-14', beneficiario: 'IMPORTADORA DE FRUTAS SARANGO',
    monto: 15000000, medio: 'Transferencia', estado: 'ACTIVO',
    monedaPago: 'CLP', monedaFactura: 'USD', tcManual: 945.5,
    documentosCalce: 'FEX-1973 TRF-8842', movimientoCartolaId: 'MCAR-AUG-1',
    clienteId: 'CLI-MJ-1', tipo: 'PAGO_TOTAL',
  },
  {
    id: 'PAG-22', fecha: '2026-08-05', beneficiario: 'ENVAPACK SPA',
    monto: 1280000, medio: 'Transferencia', estado: 'ACTIVO',
    monedaPago: 'CLP', monedaFactura: 'CLP',
    documentosCalce: 'FAC-C-8810 TRF-8831', movimientoCartolaId: 'MCAR-AUG-2',
    proveedorId: 'PROV-ENVAPACK', tipo: 'PAGO_TOTAL',
  },
  {
    id: 'PAG-23', fecha: '2026-08-03', beneficiario: 'AGRICOLA LOS MOSTOS',
    monto: 8000000, medio: 'Transferencia', estado: 'ACTIVO',
    monedaPago: 'CLP', monedaFactura: 'CLP', tcManual: 936.39,
    documentosCalce: 'ANT-2401', proveedorId: 'PROV-LOS-MOSTOS', tipo: 'ANTICIPO_PRODUCTOR',
  },
  {
    id: 'PAG-24', fecha: '2026-08-16', beneficiario: 'PACKING BOX SPA',
    monto: 1850000, medio: 'Transferencia', estado: 'PENDIENTE',
    monedaPago: 'CLP', monedaFactura: 'CLP',
    documentosCalce: 'FAC-C-8801', proveedorId: 'PROV-PACKING-BOX', tipo: 'PAGO_TOTAL',
  },
];

export const conciliaciones: Conciliacion[] = [
  {
    id: 'CON-1', banco: 'Banco Estado', periodo: 'Jul 2026', movimientos: 4, conciliados: 3,
    diferencia: 12500, estado: 'PENDIENTE', cartolaId: 'CAR-1',
  },
  {
    id: 'CON-2', banco: 'Banco Chile', periodo: 'Jul 2026', movimientos: 2, conciliados: 2,
    diferencia: 0, estado: 'ACTIVO', cartolaId: 'CAR-2',
  },
  {
    id: 'CON-3', banco: 'Banco Estado', periodo: 'Ago 2026', movimientos: 4, conciliados: 2,
    diferencia: 2518500, estado: 'PENDIENTE', cartolaId: 'CAR-5',
  },
];

export const movimientosConciliacion: MovimientoConciliacion[] = [
  {
    id: 'MCON-1', conciliacionId: 'CON-1', fecha: '2026-07-18', referencia: 'TRF-2041',
    glosa: 'Pago proveedor Santa Pilar', monto: 2450000, tipo: 'EGRESO', origen: 'MANUAL', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-2', conciliacionId: 'CON-1', fecha: '2026-07-19', referencia: 'TRF-2048',
    glosa: 'Transferencia Los Palos (error destino)', monto: 890000, tipo: 'EGRESO', origen: 'MANUAL', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-3', conciliacionId: 'CON-1', fecha: '2026-07-20', referencia: 'DEP-881',
    glosa: 'Depósito cliente export', monto: 5120000, tipo: 'INGRESO', origen: 'AUTOMATICO', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-4', conciliacionId: 'CON-1', fecha: '2026-07-21', referencia: 'COM-12',
    glosa: 'Comisión bancaria', monto: 12500, tipo: 'EGRESO', origen: 'AUTOMATICO', estado: 'PENDIENTE',
  },
  {
    id: 'MCON-5', conciliacionId: 'CON-2', fecha: '2026-07-10', referencia: 'TRF-990',
    glosa: 'Pago productor Olivos', monto: 3000000, tipo: 'EGRESO', origen: 'MANUAL', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-6', conciliacionId: 'CON-2', fecha: '2026-07-12', referencia: 'TRF-991',
    glosa: 'Anticipo Frutícola El Monte', monto: 1500000, tipo: 'EGRESO', origen: 'MANUAL', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-7', conciliacionId: 'CON-3', fecha: '2026-08-05', referencia: 'TRF-8831',
    glosa: 'Pago Envapack FAC-C-8810', monto: 1280000, tipo: 'EGRESO', origen: 'MANUAL', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-8', conciliacionId: 'CON-3', fecha: '2026-08-14', referencia: 'TRF-8842',
    glosa: 'Cobro FEX-1973 Sarango', monto: 15000000, tipo: 'INGRESO', origen: 'AUTOMATICO', estado: 'CONCILIADO',
  },
  {
    id: 'MCON-9', conciliacionId: 'CON-3', fecha: '2026-08-11', referencia: 'DEP-910',
    glosa: 'Depósito por identificar', monto: 2500000, tipo: 'INGRESO', origen: 'MANUAL', estado: 'PENDIENTE',
  },
  {
    id: 'MCON-10', conciliacionId: 'CON-3', fecha: '2026-08-13', referencia: 'COM-20',
    glosa: 'Comisión bancaria', monto: 18500, tipo: 'EGRESO', origen: 'AUTOMATICO', estado: 'PENDIENTE',
  },
];

export const presupuestos: Presupuesto[] = [
  { id: 'PRE-1', anio: 2026, centroCosto: 'CAMPO / CUARTELES', montoPresupuestado: 185000000, montoEjecutado: 112000000, estado: 'ACTIVO' },
  { id: 'PRE-2', anio: 2026, centroCosto: 'PACKING', montoPresupuestado: 92000000, montoEjecutado: 58000000, estado: 'ACTIVO' },
  { id: 'PRE-3', anio: 2026, centroCosto: 'ADMINISTRACIÓN', montoPresupuestado: 45000000, montoEjecutado: 41000000, estado: 'ACTIVO' },
];

export const labores: Labor[] = [
  { id: 'LAB-1', codigo: 'COSE', nombre: 'Cosecha manual', activa: true, empresaId: 'EMP-1' },
  { id: 'LAB-2', codigo: 'PACK', nombre: 'Selección packing', activa: true, empresaId: 'EMP-1' },
  { id: 'LAB-3', codigo: 'PODA', nombre: 'Poda', activa: true, empresaId: 'EMP-1' },
  { id: 'LAB-4', codigo: 'EMB', nombre: 'Armado cajas', activa: true, empresaId: 'EMP-1' },
];

export const actividades: Actividad[] = [
  { id: 'ACT-1', codigo: 'COSE-UV', nombre: 'Cosecha uva', activa: true, empresaId: 'EMP-1' },
  { id: 'ACT-2', codigo: 'PACK-SEL', nombre: 'Packing', activa: true, empresaId: 'EMP-1' },
  { id: 'ACT-3', codigo: 'PODA-INV', nombre: 'Poda invierno', activa: true, empresaId: 'EMP-1' },
  { id: 'ACT-4', codigo: 'EMB-CAJ', nombre: 'Embalaje', activa: true, empresaId: 'EMP-1' },
  { id: 'ACT-5', codigo: 'COSE-CIR', nombre: 'Cosecha ciruela', activa: true, empresaId: 'EMP-1' },
  { id: 'ACT-6', codigo: 'PODA-VER', nombre: 'Poda verano', activa: true, empresaId: 'EMP-1' },
];

export const contratistas: Contratista[] = [
  { id: 'CTR-1', rut: '76.111.222-3', razonSocial: 'Servicios Agrícolas del Valle', especialidad: 'Cosecha', activo: true },
  { id: 'CTR-2', rut: '77.222.333-4', razonSocial: 'Labores de Campo Sur', especialidad: 'Poda / raleo', activo: true },
  { id: 'CTR-3', rut: '78.333.444-5', razonSocial: 'Packaging Express', especialidad: 'Embalaje', activo: true },
  { id: 'CTR-4', rut: '79.444.555-6', razonSocial: 'Fumigaciones Centro', especialidad: 'Sanidad', activo: false, vigenciaHasta: '2025-12-31' },
];

export const tiposContratoContratista: TipoContratoContratista[] = [
  {
    id: 'TCC-1', codigo: 'FAENA', nombre: 'Contrato por faena',
    cuentaDebeId: 'CT-6', cuentaHaberId: 'CT-4', cuentaAdministracionId: 'CT-6',
    activa: true, empresaId: 'EMP-1',
  },
  {
    id: 'TCC-2', codigo: 'SERV', nombre: 'Servicios agrícolas',
    cuentaDebeId: 'CT-6', cuentaHaberId: 'CT-4', cuentaAdministracionId: 'CT-6',
    activa: true, empresaId: 'EMP-1',
  },
];

export const tarifasContratista: TarifaContratista[] = [
  { id: 'TAR-1', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle', laborId: 'LAB-1', labor: 'Cosecha manual', actividadId: 'ACT-1', actividad: 'Cosecha uva', tipoContratoId: 'TCC-1', tipoContrato: 'Contrato por faena', tarifa: 18500, unidad: 'HR', centroCostoId: 'CC-1', centroCosto: 'CAMPO / CUARTELES', empresaId: 'EMP-1', vigenciaDesde: '2026-01-01' },
  { id: 'TAR-2', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle', laborId: 'LAB-2', labor: 'Selección packing', actividadId: 'ACT-2', actividad: 'Packing', tipoContratoId: 'TCC-1', tipoContrato: 'Contrato por faena', tarifa: 14200, unidad: 'HR', centroCostoId: 'CC-2', centroCosto: 'PACKING', empresaId: 'EMP-1', vigenciaDesde: '2026-01-01' },
  { id: 'TAR-3', contratistaId: 'CTR-2', contratista: 'Labores de Campo Sur', laborId: 'LAB-3', labor: 'Poda', actividadId: 'ACT-3', actividad: 'Poda invierno', tipoContratoId: 'TCC-2', tipoContrato: 'Servicios agrícolas', tarifa: 22000, unidad: 'HR', centroCostoId: 'CC-1', centroCosto: 'CAMPO / CUARTELES', empresaId: 'EMP-1', vigenciaDesde: '2026-03-01' },
  { id: 'TAR-4', contratistaId: 'CTR-3', contratista: 'Packaging Express', laborId: 'LAB-4', labor: 'Armado cajas', actividadId: 'ACT-4', actividad: 'Embalaje', tipoContratoId: 'TCC-1', tipoContrato: 'Contrato por faena', tarifa: 980, unidad: 'CAJ', centroCostoId: 'CC-2', centroCosto: 'PACKING', empresaId: 'EMP-1', vigenciaDesde: '2026-02-01' },
];

export const proformasContratista: ProformaContratista[] = [
  { id: 'PRF-1', numero: 'PRF-2026-014', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle', tipoContratoId: 'TCC-1', tipoContrato: 'Contrato por faena', periodo: '2026-07', monto: 12500000, moneda: 'CLP', estado: 'DEFINITIVA', creadoPorId: 'U-3', creadoPorNombre: 'Jorge Sánchez', solicitante: 'Jorge Sánchez' },
  { id: 'PRF-2', numero: 'PRF-2026-015', contratistaId: 'CTR-2', contratista: 'Labores de Campo Sur', periodo: '2026-07', monto: 4200000, moneda: 'CLP', estado: 'BORRADOR', creadoPorId: 'U-3', creadoPorNombre: 'Jorge Sánchez', solicitante: 'Jorge Sánchez' },
  { id: 'PRF-3', numero: 'PRF-2026-012', contratistaId: 'CTR-3', contratista: 'Packaging Express', periodo: '2026-06', monto: 3100000, moneda: 'CLP', estado: 'FACTURADA', facturaAsociada: 'FAC-8891', creadoPorId: 'U-3', creadoPorNombre: 'Jorge Sánchez', solicitante: 'Jorge Sánchez', aprobadoPorId: 'U-8', aprobadoPorNombre: 'Ricardo Muñoz', aprobadaAt: '2026-06-28T15:00:00.000Z' },
  { id: 'PRF-4', numero: 'PRF-2026-016', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle', tipoContratoId: 'TCC-1', tipoContrato: 'Contrato por faena', periodo: '2026-07', monto: 2800000, moneda: 'CLP', estado: 'DEFINITIVA', creadoPorId: 'U-15', creadoPorNombre: 'Luis Herrera', solicitante: 'Luis Herrera' },
  {
    id: 'PRF-5', numero: 'PRF-2026-020', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle',
    periodo: '2026-08', monto: 4800000, moneda: 'CLP', estado: 'DEFINITIVA',
    creadoPorId: 'U-3', creadoPorNombre: 'Jorge Sánchez', solicitante: 'Jorge Sánchez',
    aprobadorId: 'U-8', aprobadorNombre: 'Ricardo Muñoz',
    aprobadoPorId: 'U-8', aprobadoPorNombre: 'Ricardo Muñoz', aprobadaAt: '2026-08-10T11:00:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
  },
  {
    id: 'PRF-6', numero: 'PRF-2026-021', contratistaId: 'CTR-2', contratista: 'Labores de Campo Sur',
    periodo: '2026-08', monto: 2200000, moneda: 'CLP', estado: 'BORRADOR',
    creadoPorId: 'U-3', creadoPorNombre: 'Jorge Sánchez', solicitante: 'Jorge Sánchez',
    createdAt: '2026-08-12T10:30:00.000Z',
  },
  {
    id: 'PRF-7', numero: 'PRF-2026-022', contratistaId: 'CTR-3', contratista: 'Packaging Express',
    periodo: '2026-08', monto: 890000, moneda: 'CLP', estado: 'BORRADOR',
    creadoPorId: 'U-15', creadoPorNombre: 'Luis Herrera', solicitante: 'Luis Herrera',
    createdAt: '2026-08-14T16:00:00.000Z',
  },
  {
    id: 'PRF-8', numero: 'PRF-2026-019', contratistaId: 'CTR-3', contratista: 'Packaging Express',
    periodo: '2026-08', monto: 1500000, moneda: 'CLP', estado: 'FACTURADA', facturaAsociada: 'FAC-9021',
    creadoPorId: 'U-3', creadoPorNombre: 'Jorge Sánchez', solicitante: 'Jorge Sánchez',
    aprobadoPorId: 'U-8', aprobadoPorNombre: 'Ricardo Muñoz', aprobadaAt: '2026-08-05T12:00:00.000Z',
  },
];

export const ingresosLaborDiario: IngresoLaborDiario[] = [
  {
    id: 'ILD-1', fecha: '2026-07-21', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle',
    centroCostoId: 'CC-3', centroCosto: 'CAMPO / CUARTELES', laborId: 'LAB-1', labor: 'Cosecha manual',
    actividadId: 'ACT-1', actividad: 'Cosecha uva', tipoJornada: 'JORNADA', cantidad: 8, precioUnitario: 19000,
    tarifaAplicada: 18500, unidad: 'HR', precioOverride: true, motivoOverride: 'Ajuste autorizado demo', tipoContratoId: 'TCC-1',
    monto: 152000, estado: 'PENDIENTE',
  },
  {
    id: 'ILD-2', fecha: '2026-07-21', contratistaId: 'CTR-1', contratista: 'Servicios Agrícolas del Valle',
    centroCostoId: 'CC-3', centroCosto: 'CAMPO / CUARTELES', laborId: 'LAB-1', labor: 'Cosecha manual',
    actividadId: 'ACT-5', actividad: 'Cosecha ciruela', tipoJornada: 'TRATO', cantidad: 120, precioUnitario: 450,
    monto: 54000, estado: 'PENDIENTE',
  },
  {
    id: 'ILD-3', fecha: '2026-07-20', contratistaId: 'CTR-2', contratista: 'Labores de Campo Sur',
    centroCostoId: 'CC-3', centroCosto: 'CAMPO / CUARTELES', laborId: 'LAB-3', labor: 'Poda',
    actividadId: 'ACT-3', actividad: 'Poda invierno', tipoJornada: 'JORNADA', cantidad: 8, precioUnitario: 22000,
    tarifaAplicada: 22000, unidad: 'HR', precioOverride: false, tipoContratoId: 'TCC-2',
    monto: 176000, estado: 'ASOCIADO', proformaId: 'PRF-2',
  },
  {
    id: 'ILD-4', fecha: '2026-07-18', contratistaId: 'CTR-3', contratista: 'Packaging Express',
    centroCostoId: 'CC-2', centroCosto: 'PACKING', laborId: 'LAB-4', labor: 'Armado cajas',
    actividadId: 'ACT-4', actividad: 'Embalaje', tipoJornada: 'TRATO', cantidad: 800, precioUnitario: 980,
    monto: 784000, estado: 'FACTURADO', proformaId: 'PRF-3', facturaNumero: 'FAC-8891',
  },
];

export const auditoriaContratistas: AuditoriaContratista[] = [
  {
    id: 'AUD-1', empresaId: 'EMP-1', entidad: 'TARIFA', entidadId: 'TAR-1',
    accion: 'CREAR', usuarioId: 'U-1', usuarioNombre: 'Admin Almahue',
    createdAt: '2026-07-01T10:00:00.000Z',
  },
];

export const cartolasBancarias: CartolaBancaria[] = [
  {
    id: 'CAR-1', banco: 'Banco Estado', bancoCodigo: '110102001', fechaCarga: '2026-07-22',
    periodo: '2026-07-15/2026-07-21', mesContable: '2026/07',
    archivoNombre: 'cartola_estado_jul21.xlsx', formato: 'EXCEL', movimientos: 4, montoTotal: 8472500,
    estado: 'EN_CONCILIACION', pendientesContabilizar: 2, usuarioCarga: 'javillela',
  },
  {
    id: 'CAR-2', banco: 'Banco Chile', bancoCodigo: '110102008', fechaCarga: '2026-07-20',
    periodo: '2026-07-01/2026-07-15', mesContable: '2026/07',
    archivoNombre: 'cartola_chile_julio.pdf', formato: 'PDF', movimientos: 2, montoTotal: 4500000,
    estado: 'EN_CONCILIACION', pendientesContabilizar: 0, usuarioCarga: 'javillela',
  },
  {
    id: 'CAR-3', banco: 'Banco Chile', bancoCodigo: '110102008', fechaCarga: '2026-06-30',
    periodo: '2026-06-01/2026-06-30', mesContable: '2026/06',
    archivoNombre: 'cartola_chile_junio.xlsx', formato: 'EXCEL', movimientos: 0, montoTotal: 0,
    estado: 'CERRADA', pendientesContabilizar: 0, usuarioCarga: 'admin',
  },
  {
    id: 'CAR-4', banco: 'Santander', bancoCodigo: '110102015', fechaCarga: '2026-07-23',
    periodo: '2026-07-16/2026-07-22', mesContable: '2026/07',
    archivoNombre: 'cartola_santander_sem3.pdf', formato: 'PDF', movimientos: 2, montoTotal: 1312500,
    estado: 'CARGADA', pendientesContabilizar: 2, usuarioCarga: 'digitador',
  },
  {
    id: 'CAR-5', banco: 'Banco Estado', bancoCodigo: '110102001', fechaCarga: '2026-08-15',
    periodo: '2026-08-01/2026-08-14', mesContable: '2026/08',
    archivoNombre: 'cartola_estado_ago14.xlsx', formato: 'EXCEL', movimientos: 4, montoTotal: 18798500,
    estado: 'EN_CONCILIACION', pendientesContabilizar: 2, usuarioCarga: 'javillela',
  },
  {
    id: 'CAR-USD', banco: 'Banco Chile USD', bancoCodigo: '110102008-USD', fechaCarga: '2026-08-12',
    periodo: '2026-08-01/2026-08-12', mesContable: '2026/08',
    archivoNombre: 'cartola_chile_usd_ago.xlsx', formato: 'EXCEL', movimientos: 2, montoTotal: 25015,
    estado: 'EN_CONCILIACION', pendientesContabilizar: 0, usuarioCarga: 'javillela',
  },
  {
    id: 'CAR-CNY', banco: 'Banco China CNY', bancoCodigo: 'CNY-001', fechaCarga: '2026-08-10',
    periodo: '2026-08-01/2026-08-10', mesContable: '2026/08',
    archivoNombre: 'cartola_china_cny_ago.xlsx', formato: 'EXCEL', movimientos: 1, montoTotal: 48000,
    estado: 'EN_CONCILIACION', pendientesContabilizar: 0, usuarioCarga: 'javillela',
  },
  cartolaFlujoExcel(movimientosFlujoExcel()),
];

/** Movimientos de cartola (fuente oficial) — G7 */
export const movimientosCartola: MovimientoCartola[] = [
  {
    id: 'MCAR-1', cartolaId: 'CAR-1', fecha: '2026-07-18', referencia: 'TRF-2041',
    glosa: 'Pago proveedor Santa Pilar', monto: 2450000, tipo: 'EGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260041',
    codigoFinancieroId: 'CF-1', codigoFinanciero: '10100 · PAGO A PROVEEDORES',
  },
  {
    id: 'MCAR-2', cartolaId: 'CAR-1', fecha: '2026-07-19', referencia: 'TRF-2048',
    glosa: 'Transferencia Los Palos', monto: 890000, tipo: 'EGRESO',
    estadoContable: 'PENDIENTE',
  },
  {
    id: 'MCAR-3', cartolaId: 'CAR-1', fecha: '2026-07-20', referencia: 'DEP-881',
    glosa: 'Depósito cliente export', monto: 5120000, tipo: 'INGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260042',
    codigoFinancieroId: 'CF-2', codigoFinanciero: '10200 · COBRO A CLIENTES',
  },
  {
    id: 'MCAR-4', cartolaId: 'CAR-1', fecha: '2026-07-21', referencia: 'COM-12',
    glosa: 'Comisión bancaria', monto: 12500, tipo: 'EGRESO',
    estadoContable: 'PENDIENTE',
  },
  {
    id: 'MCAR-5', cartolaId: 'CAR-2', fecha: '2026-07-10', referencia: 'TRF-990',
    glosa: 'Pago productor Olivos', monto: 3000000, tipo: 'EGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260030',
  },
  {
    id: 'MCAR-6', cartolaId: 'CAR-2', fecha: '2026-07-12', referencia: 'TRF-991',
    glosa: 'Anticipo Frutícola El Monte', monto: 1500000, tipo: 'EGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260031',
  },
  {
    id: 'MCAR-SAN-1', cartolaId: 'CAR-4', fecha: '2026-07-17', referencia: 'TRF-5510',
    glosa: 'Transferencia proveedor packing', monto: 890000, tipo: 'EGRESO',
    estadoContable: 'PENDIENTE',
  },
  {
    id: 'MCAR-SAN-2', cartolaId: 'CAR-4', fecha: '2026-07-19', referencia: 'DEP-440',
    glosa: 'Abono cliente nacional', monto: 422500, tipo: 'INGRESO',
    estadoContable: 'PENDIENTE',
  },
  {
    id: 'MCAR-AUG-1', cartolaId: 'CAR-5', fecha: '2026-08-14', referencia: 'TRF-8842',
    glosa: 'Abono IMPORTADORA DE FRUTAS SARANGO · FEX-1973', monto: 15000000, tipo: 'INGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260810', pagoId: 'PAG-21',
    codigoFinancieroId: 'CF-2', codigoFinanciero: '10200 · COBRO A CLIENTES',
  },
  {
    id: 'MCAR-AUG-2', cartolaId: 'CAR-5', fecha: '2026-08-05', referencia: 'TRF-8831',
    glosa: 'Pago ENVAPACK SPA · FAC-C-8810', monto: 1280000, tipo: 'EGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260805', pagoId: 'PAG-22',
    codigoFinancieroId: 'CF-1', codigoFinanciero: '10100 · PAGO A PROVEEDORES',
  },
  {
    id: 'MCAR-AUG-3', cartolaId: 'CAR-5', fecha: '2026-08-11', referencia: 'DEP-910',
    glosa: 'Depósito por identificar', monto: 2500000, tipo: 'INGRESO',
    estadoContable: 'PENDIENTE',
  },
  {
    id: 'MCAR-AUG-4', cartolaId: 'CAR-5', fecha: '2026-08-13', referencia: 'COM-20',
    glosa: 'Comisión bancaria', monto: 18500, tipo: 'EGRESO',
    estadoContable: 'PENDIENTE',
  },
  {
    id: 'MCAR-USD-1', cartolaId: 'CAR-USD', fecha: '2026-08-08', referencia: 'SWIFT-441',
    glosa: 'Cobro export Sarango USD', monto: 25000, tipo: 'INGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260820',
    codigoFinancieroId: 'CF-2', codigoFinanciero: '10200 · COBRO A CLIENTES',
  },
  {
    id: 'MCAR-USD-2', cartolaId: 'CAR-USD', fecha: '2026-08-09', referencia: 'FEE-12',
    glosa: 'Comisión SWIFT', monto: 15, tipo: 'EGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260821',
  },
  {
    id: 'MCAR-CNY-1', cartolaId: 'CAR-CNY', fecha: '2026-08-07', referencia: 'CNY-901',
    glosa: 'Abono cliente Asia (yuan)', monto: 48000, tipo: 'INGRESO',
    estadoContable: 'CONTABILIZADO', asientoNumero: '20260822',
    codigoFinancieroId: 'CF-2', codigoFinanciero: '10200 · COBRO A CLIENTES',
  },
  ...movimientosFlujoExcel(),
];

/** Nóminas / aging — clientes exportación y proveedores MJ */
export const documentosAging: DocumentoAging[] = documentosAgingMj;

export const anticiposProductores: AnticipoProductor[] = anticiposProductoresMj;

export const ordenesCompra: OrdenCompra[] = ordenesCompraMj;

export const aprobacionesOc: AprobacionOc[] = aprobacionesOcMj;

export const recepcionesOc: RecepcionOc[] = [
  { id: 'REC-MJ-1', ocNumero: 'OC-2026-MJ-003', fecha: '2026-08-02', tcAplicado: 945.5, moneda: 'CLP', monto: 1280000, estado: 'CONFIRMADA' },
  { id: 'REC-MJ-2', ocNumero: 'OC-2026-MJ-001', fecha: '2026-08-07', tcAplicado: 945.5, moneda: 'CLP', monto: 3245386, estado: 'CONFIRMADA' },
  { id: 'REC-MJ-3', ocNumero: 'OC-2026-MJ-007', fecha: '2026-07-20', tcAplicado: 938.2, moneda: 'CLP', monto: 4200000, estado: 'CONFIRMADA' },
];

export const registrosCompra: RegistroCompra[] = [
  {
    id: 'RC-MJ-1', ocNumero: 'OC-2026-MJ-003', factura: 'FAC-C-8810', proveedorOc: 'ENVAPACK SPA',
    proveedorFactura: 'ENVAPACK SPA', proveedorId: 'PROV-ENVAPACK', monto: 1280000,
    afactoOc: 'AFECTO', afactoFactura: 'AFECTO', afactoOk: true, estado: 'CONTABILIZADA',
    // GoSocket: aceptado comercialmente (ACD=A).
    aceptacionEstado: 'ACEPTADA_PLAZO', aceptacionOrigen: 'GOSOCKET',
    aceptadaAt: '2026-09-12T11:20:00Z', aceptadaPorNombre: 'Ana Torres',
    gosocket: {
      globalDocumentId: 'demo-2fd4fc79-18a6-8cbf-edd9-aceptado01',
      estado: 'ACEPTADO', authorityStatus: '02', pdfDisponible: true,
      sincronizadoAt: '2026-09-11T09:05:00Z',
    },
  },
  {
    id: 'RC-MJ-2', ocNumero: 'OC-2026-MJ-004', factura: 'FAC-C-8795', proveedorOc: 'OMEGA EXPORT SPA',
    proveedorFactura: 'OMEGA EXPORT SPA', proveedorId: 'PROV-OMEGA', monto: 3200,
    afactoOc: 'EXENTO', afactoFactura: 'EXENTO', afactoOk: true, estado: 'CONTABILIZADA',
  },
  {
    id: 'RC-MJ-3', ocNumero: 'OC-2026-MJ-002', factura: 'FAC-C-8820', proveedorOc: 'EMBALAJES TROYA SPA',
    proveedorFactura: 'EMBALAJES TROYA SPA', proveedorId: 'PROV-EMB-TROYA', monto: 4850000,
    afactoOc: 'AFECTO', afactoFactura: 'AFECTO', afactoOk: true, estado: 'EMITIDO',
    ocEstado: 'EMITIDO', ocNoAprobada: true,
    // GoSocket: pendiente de aceptación/reclamo (SII aprobó, sin ACD aún).
    gosocket: {
      globalDocumentId: 'demo-ebf58df2-f61f-56c2-34ea-pendiente1',
      estado: 'PENDIENTE', authorityStatus: '02', pdfDisponible: true,
      sincronizadoAt: '2026-09-17T15:48:00Z',
    },
  },
  {
    id: 'RC-MJ-ALM', ocNumero: 'OC-2026-MJ-001', factura: 'FAC-C-8860', proveedorOc: 'ALM SERVICES SPA',
    proveedorFactura: 'ALM SERVICES SPA', proveedorId: 'PROV-ALM-SERVICES', monto: 3245386,
    afactoOc: 'AFECTO', afactoFactura: 'AFECTO', afactoOk: true, estado: 'CONTABILIZADA',
  },
  {
    id: 'RC-MJ-MSC', ocNumero: 'OC-2026-MJ-007', factura: 'FAC-C-8750', proveedorOc: 'MSC MEDITERRANEAN SHIPPING',
    proveedorFactura: 'MSC MEDITERRANEAN SHIPPING', proveedorId: 'PROV-NAV-MSC', monto: 4200000,
    afactoOc: 'EXENTO', afactoFactura: 'EXENTO', afactoOk: true, estado: 'CONTABILIZADA',
  },
  {
    id: 'RC-MJ-BOX', ocNumero: 'OC-2026-MJ-008', factura: 'FAC-C-8801', proveedorOc: 'PACKING BOX SPA',
    proveedorFactura: 'PACKING BOX SPA', proveedorId: 'PROV-PACKING-BOX', monto: 1850000,
    afactoOc: 'AFECTO', afactoFactura: 'AFECTO', afactoOk: true, estado: 'CONTABILIZADA',
    // GoSocket: pendiente, segundo caso para poblar el tab con más de un registro.
    gosocket: {
      globalDocumentId: 'demo-0f5fe4a9-7bf9-0e31-611c-pendiente2',
      estado: 'PENDIENTE', authorityStatus: '02', pdfDisponible: true,
      sincronizadoAt: '2026-09-18T00:09:00Z',
    },
  },
  {
    id: 'RC-MJ-AGQ', ocNumero: 'OC-2026-MJ-009', factura: 'FAC-C-8790', proveedorOc: 'AGROQUIMICOS DEL MAULE',
    proveedorFactura: 'AGROQUIMICOS DEL MAULE', proveedorId: 'PROV-AGROQUIM', monto: 980000,
    afactoOc: 'AFECTO', afactoFactura: 'AFECTO', afactoOk: true, estado: 'CONTABILIZADA',
    // GoSocket: rechazado por el SII (error de esquema), nunca llegó a aceptación comercial.
    aceptacionEstado: 'RECLAMADA', aceptacionOrigen: 'GOSOCKET', aceptadaAt: '2026-09-16T14:18:06Z',
    gosocket: {
      globalDocumentId: 'demo-d2bc34fd-229f-ea71-9e4e-rechazosii1',
      estado: 'RECHAZADO', authorityStatus: '03', rechazoOrigen: 'SII',
      rechazoMotivo: 'StatusSii: 7 · Detalle SII: campo GiroRecep/CiudadRecep excede el largo máximo permitido por el esquema.',
      pdfDisponible: false, sincronizadoAt: '2026-09-16T14:18:06Z',
    },
  },
  {
    id: 'RC-MJ-VAL', ocNumero: 'OC-2026-MJ-006', factura: 'FAC-C-8830', proveedorOc: 'TRANSPORTES VALLE',
    proveedorFactura: 'TRANSPORTES VALLE', proveedorId: 'PROV-TRANS-VALLE', monto: 640000,
    afactoOc: 'AFECTO', afactoFactura: 'AFECTO', afactoOk: true, estado: 'EMITIDO',
    ocEstado: 'PENDIENTE_APROBACION', ocNoAprobada: true,
    // GoSocket: rechazado comercialmente (ACD=R, reclamo) por el receptor.
    aceptacionEstado: 'RECLAMADA', aceptacionOrigen: 'GOSOCKET',
    aceptadaAt: '2026-09-14T10:00:00Z', aceptadaPorNombre: 'Carla Muñoz',
    gosocket: {
      globalDocumentId: 'demo-7f59f63e-6a93-132a-b730-rechazocom1',
      estado: 'RECHAZADO', authorityStatus: '02', rechazoOrigen: 'COMERCIAL',
      rechazoMotivo: 'Mercadería recibida no coincide con lo facturado (diferencia de cantidad).',
      pdfDisponible: true, sincronizadoAt: '2026-09-13T09:00:00Z',
    },
  },
  {
    id: 'RC-MJ-ZAR', ocNumero: 'OC-2026-MJ-010', factura: 'FAC-C-8840', proveedorOc: 'FRUTAS ZARANGO LTDA',
    proveedorFactura: 'FRUTAS ZARANGO LTDA', proveedorId: 'PROV-ZARANGO', monto: 3100000,
    afactoOc: 'EXENTO', afactoFactura: 'EXENTO', afactoOk: true, estado: 'CONTABILIZADA',
  },
];

export const insumos: Insumo[] = insumosMj;

export const bodegas: Bodega[] = bodegasMj;

export const movimientosBodega: MovimientoBodega[] = movimientosBodegaMj;

/** Stock por bodega para modo demo (insumoId → bodegaId → cantidad). */
export const insumoStockBodega = insumoStockBodegaMj;

export const elementosCosto: ElementoCosto[] = [
  { id: 'EL-1', codigo: '1', nombre: 'MANO DE OBRA CONTRATADA', departamento: 'Campo', vigencia: 'VIGENTE', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'EL-2', codigo: '2', nombre: 'INSUMOS CAMPO', departamento: 'Campo', vigencia: 'VIGENTE', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'EL-3', codigo: '3', nombre: 'ELEMENTO PACKING (ANULADO)', departamento: 'Packing', vigencia: 'ANULADO', createdAt: '2024-01-01T00:00:00.000Z' },
];

export const factoresHonorario: FactorHonorario[] = [
  { id: 'FH-1', factorAnterior: 0.1, factorNuevo: 0.1125, vigenciaDesde: '2026-01-01', usuario: 'Ana Torres' },
  { id: 'FH-2', factorAnterior: 0.1125, factorNuevo: 0.115, vigenciaDesde: '2026-07-01', usuario: 'Admin Almahue' },
];

export const indicadoresBc: IndicadorBc[] = [
  { id: 'BC-1', fecha: '2026-07-18', usd: 965.5, eur: 1042.1, cny: 133.8, fuente: 'Banco Central', completadoFeriado: false },
  { id: 'BC-2', fecha: '2026-07-19', usd: 968.2, eur: 1045.0, cny: 134.1, fuente: 'Banco Central', completadoFeriado: false },
  { id: 'BC-3', fecha: '2026-07-20', usd: 968.2, eur: 1045.0, cny: 134.1, fuente: 'Completado domingo', completadoFeriado: true },
  { id: 'BC-4', fecha: '2026-07-21', usd: 970.0, eur: 1048.2, cny: 134.4, fuente: 'Banco Central', completadoFeriado: false },
  { id: 'BC-5', fecha: '2026-08-28', usd: 945.5, eur: 1104.0, cny: 131.2, fuente: 'Banco Central', completadoFeriado: false },
  { id: 'BC-6', fecha: '2026-08-31', usd: 948.0, eur: 1106.0, cny: 131.8, fuente: 'Banco Central', completadoFeriado: false },
  { id: 'BC-7', fecha: '2026-09-01', usd: 950.2, eur: 1108.0, cny: 132.1, fuente: 'Banco Central', completadoFeriado: false },
];

export const clientes: Cliente[] = clientesMj;

export const proveedores = proveedoresMj;

export const cuentaCorrienteMovimientos = cuentaCorrienteMovimientosMj;

export const prospectos: Prospecto[] = [
  { id: 'PRO-1', nombre: 'EuroFresh GmbH', contacto: 'klaus@eurofresh.de', origen: 'Feria Fruit Logistica', estado: 'CALIFICADO', fecha: '2026-07-05' },
  { id: 'PRO-2', nombre: 'Mercado Central Santiago', contacto: 'compras@mcs.cl', origen: 'Referido cliente', estado: 'CONTACTADO', fecha: '2026-07-10' },
  { id: 'PRO-3', nombre: 'Pacific Rim Produce', contacto: 'sales@pacificrim.com', origen: 'Web', estado: 'NUEVO', fecha: '2026-07-18' },
  { id: 'PRO-4', nombre: 'Distribuidora Bio Chile', contacto: 'info@biochile.cl', origen: 'Licitación', estado: 'CONVERTIDO', fecha: '2026-06-22' },
];

export const documentos: DocumentoComercial[] = [
  ...documentosMj,
  {
    id: 'DOC-QA-REV-1', folio: 'FAC-QA-REV-001', tipo: 'FACTURA', cliente: 'COMERCIAL FRUTAM SPA', clienteId: 'CLI-MJ-NAC',
    fecha: '2026-08-03', neto: 1500000, estado: 'CONTABILIZADA',
    asientoOriginal: 'QA-FAC-QA-REV-001',
    formaPago: 'CREDITO', indicadorVenta: 'VENTA',
    empresaId: 'EMP-1', empresaNombre: EMPRESA_DEMO_NOMBRE,
    lineas: [
      {
        descripcion: 'Venta exportación cereza (línea A)', cantidad: 1, precioUnitario: 900000, total: 900000,
        cuentaContableId: 'CT-10', centroCostoId: 'CC-3',
      },
      {
        descripcion: 'Venta packing ciruela (línea B)', cantidad: 1, precioUnitario: 600000, total: 600000,
        cuentaContableId: 'CT-10', centroCostoId: 'CC-2',
      },
    ],
  },
  {
    id: 'DOC-QA-REV-2', folio: 'FAC-QA-REV-002', tipo: 'FACTURA', cliente: 'IMPORTADORA DE FRUTAS SARANGO', clienteId: 'CLI-MJ-1',
    fecha: '2026-08-03', neto: 750000, estado: 'CONTABILIZADA',
    asientoOriginal: 'QA-FAC-QA-REV-002',
    formaPago: 'CREDITO', indicadorVenta: 'VENTA',
    empresaId: 'EMP-1', empresaNombre: EMPRESA_DEMO_NOMBRE,
    lineas: [
      {
        descripcion: 'Venta nacional uva (homogénea)', cantidad: 3, precioUnitario: 250000, total: 750000,
        cuentaContableId: 'CT-10', centroCostoId: 'CC-3',
      },
    ],
  },
  {
    id: 'DOC-DRAFT-OLD', folio: 'FAC-2026-310', tipo: 'FACTURA', cliente: 'IMPORTADORA DE FRUTAS SARANGO', clienteId: 'CLI-MJ-1',
    fecha: '2026-06-28', neto: 1500000, estado: 'BORRADOR',
    empresaId: 'EMP-1', empresaNombre: EMPRESA_DEMO_NOMBRE,
    lineas: [
      { descripcion: 'Caja exportación Bing Cherry', cantidad: 50, precioUnitario: 30000, total: 1500000, cuentaContableId: 'CT-10', centroCostoId: 'CC-1' },
    ],
  },
  {
    id: 'DOC-DRAFT-EMP2', folio: 'FAC-2026-E2-01', tipo: 'FACTURA', cliente: 'Almahue Logística',
    fecha: '2026-07-20', neto: 800000, estado: 'BORRADOR',
    empresaId: 'EMP-2', empresaNombre: 'ALM SERVICES SPA',
    lineas: [
      { descripcion: 'Servicio packing', cantidad: 1, precioUnitario: 800000, total: 800000 },
    ],
  },
];

/** Meta sync BC (R2-K01) — modo demo */
export const syncBcMeta = {
  modo: 'manual' as 'auto' | 'manual',
  horaProgramada: '09:00',
  horarios: ['09:00'],
  frecuenciaMinutos: null as number | null,
  ventanaInicio: '09:00',
  ventanaFin: '18:00',
  diasHabiles: true,
  ultimaSync: '2026-07-21T09:05:00',
  lastStatus: 'OK' as string | undefined,
  lastError: undefined as string | undefined,
  failStreak: 0,
};

export const workflows: WorkflowConfig[] = [
  {
    id: 'WF-1', nombre: 'Aprobación OC', modulo: 'Compras', montoMin: 0, montoMax: 5000000, aprobadores: 1,
    aprobadorIds: ['U-2', 'U-6'], activo: true,
    aprobadoresUsuarios: [
      { id: 'U-2', nombre: 'Carolina Pérez', activo: true },
      { id: 'U-6', nombre: 'María González', activo: true },
    ],
  },
  {
    id: 'WF-2', nombre: 'Aprobación OC alto monto', modulo: 'Compras', montoMin: 5000000, montoMax: 999999999, aprobadores: 1,
    aprobadorIds: ['U-7', 'U-1'], activo: true,
    aprobadoresUsuarios: [
      { id: 'U-7', nombre: 'Claudia Vargas', activo: true },
      { id: 'U-1', nombre: 'Admin Almahue', activo: true },
    ],
  },
];
export const dashboardKpis: DashboardKPIs = dashboardKpisMj;

export const tendenciaMensual: TendenciaMensual[] = [
  { mes: 'Mar', ventas: 22, gastos: 28 },
  { mes: 'Abr', ventas: 26, gastos: 32 },
  { mes: 'May', ventas: 24, gastos: 30 },
  { mes: 'Jun', ventas: 31, gastos: 41 },
  { mes: 'Jul', ventas: 29, gastos: 38 },
];

export const reportesContables = [
  { id: 'R-1', nombre: 'Balance general', periodo: 'Ago 2026', estado: 'DISPONIBLE' },
  { id: 'R-2', nombre: 'Estado de resultados', periodo: 'Ago 2026', estado: 'DISPONIBLE' },
  { id: 'R-3', nombre: 'Libro mayor', periodo: 'Ago 2026', estado: 'DISPONIBLE' },
];

/** Historial de traspaso: junio ya cerrado; agosto queda para ejecutar en demo. */
export const cierresTraspasoDetalle: CierreTraspasoContratista[] = [
  {
    id: 'CIERRE-2026-06',
    periodo: '2026-06',
    cerrado: true,
    montoTotal: 3100000,
    tipoCambio: 965.5,
    monedaTc: 'USD',
    asientoId: 'ASI-10',
    asientoNumero: '20260601',
    glosa: 'Traspaso/cierre contratistas 2026-06 · TC 965.5 USD/CLP',
    proformas: 1,
    proformaIds: ['PRF-3'],
    detalle: [
      {
        id: 'PRF-3',
        numero: 'PRF-2026-012',
        contratista: 'Packaging Express',
        periodo: '2026-06',
        monto: 3100000,
        moneda: 'CLP',
        estado: 'FACTURADA',
      },
    ],
    createdAt: '2026-07-02T12:00:00.000Z',
  },
];
