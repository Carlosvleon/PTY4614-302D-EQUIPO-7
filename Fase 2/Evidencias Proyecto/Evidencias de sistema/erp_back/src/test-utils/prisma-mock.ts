import type { PrismaService } from '../prisma/prisma.service';

type JestFn = jest.Mock;

function modelMock(methods: string[]): Record<string, JestFn> {
  return Object.fromEntries(methods.map((m) => [m, jest.fn()]));
}

export type PrismaMock = {
  empresa: Record<string, JestFn>;
  usuario: Record<string, JestFn>;
  rol: Record<string, JestFn>;
  centroCosto: Record<string, JestFn>;
  contratista: Record<string, JestFn>;
  labor: Record<string, JestFn>;
  actividad: Record<string, JestFn>;
  laborActividad: Record<string, JestFn>;
  tarifaContratista: Record<string, JestFn>;
  proformaContratista: Record<string, JestFn>;
  facturaContratista: Record<string, JestFn>;
  moneda: Record<string, JestFn>;
  unidadMedida: Record<string, JestFn>;
  tipoDocumento: Record<string, JestFn>;
  indicadorBc: Record<string, JestFn>;
  syncBcMeta: Record<string, JestFn>;
  ingresoLaborDiario: Record<string, JestFn>;
  periodoCierreContratista: Record<string, JestFn>;
  periodoCierreContratistaEvento: Record<string, JestFn>;
  auditoriaContratista: Record<string, JestFn>;
  tipoContratoContratista: Record<string, JestFn>;
  ordenCompra: Record<string, JestFn>;
  aprobacionOc: Record<string, JestFn>;
  aprobacionOv: Record<string, JestFn>;
  recepcionOc: Record<string, JestFn>;
  registroCompra: Record<string, JestFn>;
  proveedor: Record<string, JestFn>;
  proveedorCuentaBancaria: Record<string, JestFn>;
  proveedorContacto: Record<string, JestFn>;
  proveedorDireccion: Record<string, JestFn>;
  proveedorCambio: Record<string, JestFn>;
  empresaPlantillaDoc: Record<string, JestFn>;
  insumo: Record<string, JestFn>;
  bodega: Record<string, JestFn>;
  stockInsumoBodega: Record<string, JestFn>;
  reservaStock: Record<string, JestFn>;
  movimientoBodega: Record<string, JestFn>;
  cuentaContable: Record<string, JestFn>;
  areaNegocio: Record<string, JestFn>;
  cuentaCentroCosto: Record<string, JestFn>;
  cuentaElementoCosto: Record<string, JestFn>;
  cuentaAreaNegocio: Record<string, JestFn>;
  periodoContable: Record<string, JestFn>;
  periodoContableEvento: Record<string, JestFn>;
  configContableSii: Record<string, JestFn>;
  elementoCosto: Record<string, JestFn>;
  factorHonorario: Record<string, JestFn>;
  asiento: Record<string, JestFn>;
  movimientoCaja: Record<string, JestFn>;
  pago: Record<string, JestFn>;
  pagoTcEvento: Record<string, JestFn>;
  cartolaBancaria: Record<string, JestFn>;
  movimientoCartola: Record<string, JestFn>;
  conciliacion: Record<string, JestFn>;
  movimientoConciliacion: Record<string, JestFn>;
  anticipoProductor: Record<string, JestFn>;
  documentoAging: Record<string, JestFn>;
  cliente: Record<string, JestFn>;
  clienteCuentaBancaria: Record<string, JestFn>;
  clienteContacto: Record<string, JestFn>;
  clienteDireccion: Record<string, JestFn>;
  clienteCambio: Record<string, JestFn>;
  prospecto: Record<string, JestFn>;
  documentoComercial: Record<string, JestFn>;
  cuentaCorrienteMovimiento: Record<string, JestFn>;
  guiaDespacho: Record<string, JestFn>;
  workflowConfig: Record<string, JestFn>;
  delegacionAprobacion: Record<string, JestFn>;
  grupoAprobacion: Record<string, JestFn>;
  usuarioGrupoAprobacion: Record<string, JestFn>;
  nodoEscalaAprobacion: Record<string, JestFn>;
  presupuesto: Record<string, JestFn>;
  notificacion: Record<string, JestFn>;
  catalogoImportacion: Record<string, JestFn>;
  codigoFinanciero: Record<string, JestFn>;
  conceptoFlujo: Record<string, JestFn>;
  $transaction: JestFn;
  $queryRaw: JestFn;
};

/**
 * Deep-ish mock of PrismaService for unit tests.
 * Add model methods as needed by new specs.
 */
export function createPrismaMock(): { mock: PrismaService; prisma: PrismaMock } {
  const prisma: PrismaMock = {
    empresa: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete', 'count']),
    usuario: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete', 'count', 'updateMany']),
    rol: modelMock(['findMany', 'findUnique', 'create', 'update', 'delete', 'count', 'deleteMany']),
    centroCosto: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    contratista: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    labor: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    actividad: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    laborActividad: modelMock(['findUnique', 'upsert', 'deleteMany']),
    tarifaContratista: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete', 'deleteMany', 'count']),
    proformaContratista: modelMock([
      'findMany',
      'findUnique',
      'findUniqueOrThrow',
      'create',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
      'count',
    ]),
    facturaContratista: modelMock(['create', 'deleteMany']),
    moneda: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    unidadMedida: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    tipoDocumento: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    indicadorBc: modelMock(['findMany', 'findFirst', 'findUnique', 'create', 'update', 'upsert', 'count']),
    syncBcMeta: modelMock(['findFirst', 'findUnique', 'create', 'update', 'upsert']),
    ingresoLaborDiario: modelMock(['findMany', 'findUnique', 'create', 'update', 'updateMany', 'delete', 'count']),
    periodoCierreContratista: modelMock(['upsert', 'findUnique', 'findMany', 'update']),
    periodoCierreContratistaEvento: modelMock(['findMany', 'create']),
    auditoriaContratista: modelMock(['findMany', 'create']),
    tipoContratoContratista: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    ordenCompra: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    aprobacionOc: modelMock(['findMany', 'findFirst', 'create', 'update', 'updateMany', 'deleteMany', 'count']),
    aprobacionOv: modelMock(['findMany', 'findFirst', 'create', 'update', 'updateMany', 'count']),
    recepcionOc: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count', 'aggregate']),
    registroCompra: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'updateMany', 'count', 'aggregate']),
    proveedor: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    proveedorCuentaBancaria: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    proveedorContacto: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    proveedorDireccion: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    proveedorCambio: modelMock(['findMany', 'create', 'count']),
    empresaPlantillaDoc: modelMock(['findUnique', 'upsert', 'create', 'update']),
    insumo: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'updateMany', 'count']),
    bodega: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    stockInsumoBodega: modelMock(['findMany', 'findUnique', 'upsert', 'aggregate', 'create', 'update']),
    reservaStock: modelMock(['findMany', 'findFirst', 'findUnique', 'create', 'createMany', 'update', 'updateMany', 'aggregate', 'count']),
    movimientoBodega: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    cuentaContable: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete', 'deleteMany', 'count']),
    areaNegocio: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    cuentaCentroCosto: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    cuentaElementoCosto: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    cuentaAreaNegocio: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    periodoContable: modelMock(['findMany', 'findUnique', 'create', 'update', 'updateMany', 'count']),
    periodoContableEvento: modelMock(['findMany', 'create']),
    configContableSii: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'upsert', 'deleteMany', 'count']),
    elementoCosto: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    factorHonorario: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    asiento: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count', 'aggregate']),
    movimientoCaja: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    pago: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    pagoTcEvento: modelMock(['findMany', 'findUnique', 'create', 'count']),
    cartolaBancaria: modelMock(['findMany', 'findUnique', 'create', 'update', 'delete', 'count']),
    movimientoCartola: modelMock(['findMany', 'findUnique', 'create', 'createMany', 'update', 'updateMany', 'count']),
    conciliacion: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    movimientoConciliacion: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    anticipoProductor: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    documentoAging: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    cliente: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    clienteCuentaBancaria: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    clienteContacto: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    clienteDireccion: modelMock(['findMany', 'createMany', 'deleteMany', 'count']),
    clienteCambio: modelMock(['findMany', 'create', 'count']),
    prospecto: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    documentoComercial: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    cuentaCorrienteMovimiento: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'count']),
    guiaDespacho: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'upsert', 'deleteMany', 'count']),
    workflowConfig: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    delegacionAprobacion: modelMock(['findMany', 'findUnique', 'create', 'update', 'delete', 'count']),
    grupoAprobacion: modelMock(['findMany', 'findUnique', 'findUniqueOrThrow', 'findFirst', 'create', 'update', 'delete', 'count']),
    usuarioGrupoAprobacion: modelMock(['findMany', 'deleteMany', 'createMany']),
    nodoEscalaAprobacion: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete', 'count']),
    presupuesto: modelMock(['findMany', 'findUnique', 'create', 'update', 'count']),
    notificacion: modelMock(['findMany', 'findFirst', 'findUnique', 'create', 'update', 'updateMany', 'upsert', 'count']),
    catalogoImportacion: modelMock(['findMany', 'findUnique', 'create', 'count']),
    codigoFinanciero: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    conceptoFlujo: modelMock(['findMany', 'findUnique', 'findFirst', 'create', 'update', 'count']),
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));

  return { mock: prisma as unknown as PrismaService, prisma };
}

export function superAdminUser(overrides: Partial<{
  sub: string;
  email: string;
  empresaId: string;
  rolId: string;
  permisos: string[];
}> = {}) {
  return {
    sub: 'U-1',
    email: 'admin@almahue.local',
    empresaId: 'EMP-1',
    rolId: 'ROL-1',
    permisos: ['*'],
    ...overrides,
  };
}

export function tenantUser(overrides: Partial<{
  sub: string;
  email: string;
  empresaId: string;
  rolId: string;
  permisos: string[];
}> = {}) {
  return {
    sub: 'U-2',
    email: 'user@almahue.local',
    empresaId: 'EMP-1',
    rolId: 'ROL-2',
    permisos: ['admin:read', 'contratistas:read', 'contratistas:write', 'catalogos:read'],
    ...overrides,
  };
}
