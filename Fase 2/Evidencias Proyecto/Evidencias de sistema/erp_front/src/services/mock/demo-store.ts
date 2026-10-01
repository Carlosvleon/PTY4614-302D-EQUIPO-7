/**
 * Estado mutable en memoria para modo demo (se reinicia al activar demo).
 */
import type {
  Actividad,
  AnticipoProductor,
  AprobacionOc,
  AreaNegocio,
  Asiento,
  Bodega,
  CartolaBancaria,
  CentroCosto,
  CierreTraspasoContratista,
  Cliente,
  CodigoFinanciero,
  ConceptoFlujo,
  Conciliacion,
  MovimientoConciliacion,
  MovimientoCartola,
  DocumentoAging,
  Contratista,
  CentralizacionResult,
  ConfigContableSii,
  CuentaContable,
  DocumentoComercial,
  ElementoCosto,
  Empresa,
  FactorHonorario,
  IndicadorBc,
  IngresoLaborDiario,
  Insumo,
  Labor,
  LibroDiarioLinea,
  LibroDiarioResult,
  MayorResult,
  Moneda,
  MovimientoBodega,
  MovimientoCaja,
  OrdenCompra,
  Pago,
  PagoTcEvento,
  PeriodoContable,
  Presupuesto,
  ProformaContratista,
  Prospecto,
  RecepcionOc,
  RegistroCompra,
  GoSocketAceptacionEstado,
  Rol,
  TarifaContratista,
  TipoContratoContratista,
  AuditoriaContratista,
  TipoDocumento,
  UnidadMedida,
  Usuario,
  WorkflowConfig,
} from '@/types/domain';
import { mergeConCatalogo } from '@/lib/pantallas-permisos';
import * as seed from './fixtures';
import { DEMO_EMPRESA_ID } from '@/lib/appSettings';

function filterByEmpresa<T extends { empresaId?: string }>(rows: T[], empresaId?: string): T[] {
  if (!empresaId) return [...rows];
  const exact = rows.filter((r) => r.empresaId === empresaId);
  if (exact.length) return exact;
  const fallback = rows.filter((r) => r.empresaId === DEMO_EMPRESA_ID);
  return fallback.length ? fallback : exact;
}

const ACT_LABOR: Record<string, string> = {
  'ACT-1': 'LAB-1',
  'ACT-2': 'LAB-2',
  'ACT-3': 'LAB-3',
  'ACT-4': 'LAB-4',
  'ACT-5': 'LAB-1',
  'ACT-6': 'LAB-3',
};

type Store = {
  empresas: Empresa[];
  usuarios: Usuario[];
  roles: Rol[];
  monedas: Moneda[];
  unidades: UnidadMedida[];
  centrosCosto: CentroCosto[];
  areasNegocio: AreaNegocio[];
  conceptosFlujo: ConceptoFlujo[];
  codigosFinancieros: CodigoFinanciero[];
  tiposDocumento: TipoDocumento[];
  cuentas: CuentaContable[];
  asientos: Asiento[];
  periodosContables: PeriodoContable[];
  periodoEventos: Array<{
    id: string;
    periodoId: string;
    accion: string;
    estadoAntes?: string;
    estadoDespues: string;
    motivo?: string;
    usuarioNombre?: string;
    createdAt: string;
  }>;
  configsContableSii: ConfigContableSii[];
  movimientosCaja: MovimientoCaja[];
  pagos: Pago[];
  pagoTcEventos: PagoTcEvento[];
  conciliaciones: Conciliacion[];
  movimientosConciliacion: MovimientoConciliacion[];
  presupuestos: Presupuesto[];
  contratistas: Contratista[];
  labores: Labor[];
  actividades: Actividad[];
  tarifasContratista: TarifaContratista[];
  tiposContratoContratista: TipoContratoContratista[];
  auditoriaContratistas: AuditoriaContratista[];
  proformasContratista: ProformaContratista[];
  ordenesCompra: OrdenCompra[];
  aprobacionesOc: AprobacionOc[];
  recepcionesOc: RecepcionOc[];
  registrosCompra: RegistroCompra[];
  insumos: Insumo[];
  bodegas: Bodega[];
  movimientosBodega: MovimientoBodega[];
  elementosCosto: ElementoCosto[];
  factoresHonorario: FactorHonorario[];
  indicadoresBc: IndicadorBc[];
  clientes: Cliente[];
  prospectos: Prospecto[];
  documentos: DocumentoComercial[];
  workflows: WorkflowConfig[];
  reportesContables: typeof seed.reportesContables;
  ingresosLaborDiario: IngresoLaborDiario[];
  cartolasBancarias: CartolaBancaria[];
  movimientosCartola: MovimientoCartola[];
  documentosAging: DocumentoAging[];
  anticiposProductores: AnticipoProductor[];
  syncBcMeta: typeof seed.syncBcMeta;
  cierresTraspaso: Record<string, boolean>;
  cierresTraspasoDetalle: Record<string, CierreTraspasoContratista>;
};

function cloneStore(): Store {
  return {
    empresas: structuredClone(seed.empresas),
    usuarios: structuredClone(seed.usuarios),
    roles: structuredClone(seed.roles),
    monedas: structuredClone(seed.monedas),
    unidades: structuredClone(seed.unidades),
    centrosCosto: structuredClone(seed.centrosCosto),
    areasNegocio: structuredClone(seed.areasNegocio),
    conceptosFlujo: structuredClone(seed.conceptosFlujo),
    codigosFinancieros: structuredClone(seed.codigosFinancieros),
    tiposDocumento: structuredClone(seed.tiposDocumento),
    cuentas: structuredClone(seed.cuentas),
    asientos: structuredClone(seed.asientos),
    periodosContables: structuredClone(seed.periodosContables),
    periodoEventos: [],
    configsContableSii: structuredClone(seed.configsContableSii),
    movimientosCaja: structuredClone(seed.movimientosCaja),
    pagos: structuredClone(seed.pagos),
    pagoTcEventos: [],
    conciliaciones: structuredClone(seed.conciliaciones),
    movimientosConciliacion: structuredClone(seed.movimientosConciliacion),
    presupuestos: structuredClone(seed.presupuestos),
    contratistas: structuredClone(seed.contratistas),
    labores: structuredClone(seed.labores),
    actividades: structuredClone(seed.actividades),
    tarifasContratista: structuredClone(seed.tarifasContratista),
    tiposContratoContratista: structuredClone(seed.tiposContratoContratista),
    auditoriaContratistas: structuredClone(seed.auditoriaContratistas),
    proformasContratista: structuredClone(seed.proformasContratista),
    ordenesCompra: structuredClone(seed.ordenesCompra),
    aprobacionesOc: structuredClone(seed.aprobacionesOc),
    recepcionesOc: structuredClone(seed.recepcionesOc),
    registrosCompra: structuredClone(seed.registrosCompra),
    insumos: structuredClone(seed.insumos),
    bodegas: structuredClone(seed.bodegas),
    movimientosBodega: structuredClone(seed.movimientosBodega),
    elementosCosto: structuredClone(seed.elementosCosto),
    factoresHonorario: structuredClone(seed.factoresHonorario),
    indicadoresBc: structuredClone(seed.indicadoresBc),
    clientes: structuredClone(seed.clientes),
    prospectos: structuredClone(seed.prospectos),
    documentos: structuredClone(seed.documentos),
    workflows: structuredClone(seed.workflows),
    reportesContables: structuredClone(seed.reportesContables),
    ingresosLaborDiario: structuredClone(seed.ingresosLaborDiario),
    cartolasBancarias: structuredClone(seed.cartolasBancarias),
    movimientosCartola: structuredClone(seed.movimientosCartola),
    documentosAging: structuredClone(seed.documentosAging),
    anticiposProductores: structuredClone(seed.anticiposProductores),
    syncBcMeta: structuredClone(seed.syncBcMeta),
    cierresTraspaso: Object.fromEntries(
      seed.cierresTraspasoDetalle.filter((c) => c.cerrado).map((c) => [c.id, true]),
    ),
    cierresTraspasoDetalle: Object.fromEntries(
      seed.cierresTraspasoDetalle.map((c) => [c.id, structuredClone(c)]),
    ),
  };
}

let store = cloneStore();

export function resetDemoStore() {
  store = cloneStore();
}

/** XML de ejemplo (formato EnvioDTE/SII) para el modal "Ver XML" en modo demo. No es un DTE timbrado real. */
function buildRegistroCompraXmlDemo(row: RegistroCompra): string {
  const gid = row.gosocket?.globalDocumentId ?? 'DEMO-0000-0000-0000-000000000000';
  const fecha = row.gosocket?.sincronizadoAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const monto = Math.round(Number(row.monto) || 0);
  const neto = Math.round(monto / 1.19);
  const iva = monto - neto;
  const folioNum = row.factura.replace(/\D/g, '') || '1';
  const lineasFuente = row.lineas && row.lineas.length > 0
    ? row.lineas
    : [{ descripcion: row.factura, cantidad: 1, precioUnitario: neto, total: neto }];
  const detalleXml = lineasFuente.map((l, i) => `      <Detalle>
        <NroLinDet>${i + 1}</NroLinDet>
        <NmbItem>${l.descripcion}</NmbItem>
        <QtyItem>${l.cantidad}</QtyItem>
        <PrcItem>${Math.round(l.precioUnitario)}</PrcItem>
        <MontoItem>${Math.round(l.total)}</MontoItem>
      </Detalle>`).join('\n');
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <SetDTE ID="SETDTE-${row.factura}">
    <Caratula version="1.0">
      <RutEmisor>76.543.210-K</RutEmisor>
      <RutReceptor>77.032.638-9</RutReceptor>
      <TmstFirmaEnv>${fecha}T09:00:00</TmstFirmaEnv>
    </Caratula>
    <DTE version="1.0">
      <Documento ID="FT33">
        <Encabezado>
          <IdDoc>
            <TipoDTE>33</TipoDTE>
            <Folio>${folioNum}</Folio>
            <FchEmis>${fecha}</FchEmis>
          </IdDoc>
          <Emisor>
            <RznSoc>${row.proveedorFactura}</RznSoc>
          </Emisor>
          <Receptor>
            <RznSocRecep>Almahue Export SpA</RznSocRecep>
          </Receptor>
          <Totales>
            <MntNeto>${neto}</MntNeto>
            <TasaIVA>19</TasaIVA>
            <IVA>${iva}</IVA>
            <MntTotal>${monto}</MntTotal>
          </Totales>
        </Encabezado>
${detalleXml}
      </Documento>
    </DTE>
  </SetDTE>
</EnvioDTE>
<!-- GlobalDocumentId: ${gid} · XML de ejemplo generado en modo demo (no es un DTE timbrado por el SII) -->`;
}

function nextId(prefix: string, rows: { id: string }[]): string {
  const nums = rows
    .map((r) => r.id.match(new RegExp(`^${prefix}-(\\d+)$`)))
    .filter(Boolean)
    .map((m) => Number(m![1]));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${n}`;
}

function cuentaById() {
  return new Map(store.cuentas.map((c) => [c.id, c]));
}

function lineasLibroDeAsiento(a: Asiento): LibroDiarioLinea[] {
  const byId = cuentaById();
  if (a.lineas?.length) {
    return a.lineas.map((l) => {
      const c = l.cuentaId ? byId.get(l.cuentaId) : undefined;
      return {
        asientoNumero: a.numero,
        fecha: a.fecha,
        glosa: a.glosa,
        cuentaId: l.cuentaId,
        cuentaCodigo: c?.codigo,
        cuentaNombre: c?.nombre,
        debe: l.debe,
        haber: l.haber,
        lineaGlosa: l.glosa,
        origen: a.origen,
      };
    });
  }
  return [
    {
      asientoNumero: a.numero,
      fecha: a.fecha,
      glosa: a.glosa,
      debe: a.debe,
      haber: 0,
      origen: a.origen,
    },
    {
      asientoNumero: a.numero,
      fecha: a.fecha,
      glosa: a.glosa,
      debe: 0,
      haber: a.haber,
      origen: a.origen,
    },
  ];
}

export const demoStore = {
  get dashboardKpis() {
    return seed.dashboardKpis;
  },
  get tendenciaMensual() {
    return seed.tendenciaMensual;
  },

  getEmpresas: () => [...store.empresas],
  createEmpresa(input: Omit<Empresa, 'id'>) {
    const row: Empresa = { id: nextId('EMP', store.empresas), ...input };
    store.empresas.unshift(row);
    return row;
  },
  updateEmpresa(id: string, input: Omit<Empresa, 'id'>) {
    const i = store.empresas.findIndex((e) => e.id === id);
    if (i < 0) throw new Error('Empresa no encontrada');
    store.empresas[i] = { id, ...input };
    return store.empresas[i];
  },

  getUsuarios: () => [...store.usuarios],
  createUsuario(input: Omit<Usuario, 'id' | 'rolNombre'> & { password?: string }) {
    const rol = store.roles.find((r) => r.id === input.rolId);
    const empresaIds = input.empresaIds?.length ? input.empresaIds : [input.empresaId];
    const row: Usuario = {
      id: nextId('U', store.usuarios),
      nombre: input.nombre,
      email: input.email,
      rolId: input.rolId,
      rolNombre: rol?.nombre ?? '',
      empresaId: empresaIds[0] ?? input.empresaId,
      empresaIds,
      activo: input.activo ?? true,
      rolVigenciaDesde: input.rolVigenciaDesde,
      rolVigenciaHasta: input.rolVigenciaHasta,
    };
    store.usuarios.unshift(row);
    return row;
  },
  updateUsuario(id: string, input: Omit<Usuario, 'id' | 'rolNombre'> & { password?: string }) {
    const i = store.usuarios.findIndex((u) => u.id === id);
    if (i < 0) throw new Error('Usuario no encontrado');
    const rol = store.roles.find((r) => r.id === input.rolId);
    const empresaIds = input.empresaIds?.length ? input.empresaIds : [input.empresaId];
    store.usuarios[i] = {
      id,
      nombre: input.nombre,
      email: input.email,
      rolId: input.rolId,
      rolNombre: rol?.nombre ?? '',
      empresaId: empresaIds[0] ?? input.empresaId,
      empresaIds,
      activo: input.activo ?? true,
      rolVigenciaDesde: input.rolVigenciaDesde,
      rolVigenciaHasta: input.rolVigenciaHasta,
    };
    return store.usuarios[i];
  },

  getRoles: () => store.roles.map((r) => ({
    ...r,
    permisosPantalla: mergeConCatalogo(r.permisosPantalla),
  })),
  createRol(input: Omit<Rol, 'id' | 'usuarios'>) {
    const row: Rol = {
      id: nextId('ROL', store.roles),
      usuarios: 0,
      ...input,
      permisosPantalla: mergeConCatalogo(input.permisosPantalla),
    };
    store.roles.unshift(row);
    return row;
  },
  updateRol(id: string, input: Omit<Rol, 'id' | 'usuarios'>) {
    const i = store.roles.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Rol no encontrado');
    store.roles[i] = {
      ...store.roles[i],
      ...input,
      permisosPantalla: mergeConCatalogo(input.permisosPantalla ?? store.roles[i].permisosPantalla),
    };
    return store.roles[i];
  },
  deleteRol(id: string, reasignaciones: { usuarioId: string; nuevoRolId: string }[]) {
    if (id === 'ROL-1') throw new Error('No se puede eliminar el rol Administrador');
    const i = store.roles.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Rol no encontrado');
    const afectados = store.usuarios.filter((u) => u.rolId === id);
    if (afectados.length > 0) {
      if (reasignaciones.length !== afectados.length) {
        throw new Error('Debes indicar un rol de destino para cada usuario');
      }
      for (const r of reasignaciones) {
        if (r.nuevoRolId === id) throw new Error('El rol de destino debe ser distinto');
        const destino = store.roles.find((x) => x.id === r.nuevoRolId);
        if (!destino) throw new Error(`Rol de destino no encontrado: ${r.nuevoRolId}`);
        const u = store.usuarios.find((x) => x.id === r.usuarioId && x.rolId === id);
        if (!u) throw new Error(`Usuario ${r.usuarioId} no pertenece a este rol`);
        u.rolId = r.nuevoRolId;
        u.rolNombre = destino.nombre;
      }
    }
    const removed = store.roles[i];
    store.roles.splice(i, 1);
    for (const rol of store.roles) {
      rol.usuarios = store.usuarios.filter((u) => u.rolId === rol.id).length;
    }
    return { ok: true as const, id: removed.id, reasignados: reasignaciones.length };
  },

  getMonedas: () => [...store.monedas],
  createMoneda(input: Omit<Moneda, 'id'>) {
    const row: Moneda = { id: nextId('MON', store.monedas), ...input };
    store.monedas.unshift(row);
    return row;
  },
  updateMoneda(id: string, input: Omit<Moneda, 'id'>) {
    const i = store.monedas.findIndex((m) => m.id === id);
    if (i < 0) throw new Error('Moneda no encontrada');
    store.monedas[i] = { id, ...input };
    return store.monedas[i];
  },
  getUnidades: () => [...store.unidades],
  createUnidad(input: Omit<UnidadMedida, 'id'>) {
    const row: UnidadMedida = { id: nextId('UM', store.unidades), ...input };
    store.unidades.unshift(row);
    return row;
  },
  updateUnidad(id: string, input: Omit<UnidadMedida, 'id'>) {
    const i = store.unidades.findIndex((u) => u.id === id);
    if (i < 0) throw new Error('Unidad no encontrada');
    store.unidades[i] = { id, ...input };
    return store.unidades[i];
  },
  getCentrosCosto: (empresaId?: string) => filterByEmpresa(store.centrosCosto, empresaId),
  createCentroCosto(input: {
    codigo: string;
    nombre: string;
    activa: boolean;
    empresaId?: string;
    empresaNombre?: string;
    vigenciaDesde?: string;
    vigenciaHasta?: string;
    contactoEncargado?: string;
  }) {
    const codigo = String(input.codigo ?? '').trim();
    if (!/^\d+$/.test(codigo)) throw new Error('El código solo admite dígitos (0-9)');
    const empresaId = input.empresaId || 'EMP-1';
    if (store.centrosCosto.some((c) => c.codigo === codigo && c.empresaId === empresaId)) {
      throw new Error(`Ya existe el código ${codigo}. No se puede repetir ni reemplazar, aunque el nombre sea distinto`);
    }
    const hoy = new Date().toISOString().slice(0, 10);
    const row: CentroCosto = {
      id: nextId('CC', store.centrosCosto),
      empresaId,
      empresaNombre: input.empresaNombre,
      codigo,
      nombre: String(input.nombre ?? '').trim().toUpperCase(),
      activa: input.activa,
      vigenciaDesde: hoy,
      vigenciaHasta: input.vigenciaHasta,
      contactoEncargado: input.contactoEncargado,
      createdAt: `${hoy}T00:00:00.000Z`,
    };
    store.centrosCosto.unshift(row);
    return row;
  },
  updateCentroCosto(id: string, input: {
    codigo: string;
    nombre: string;
    activa: boolean;
    empresaId?: string;
    vigenciaDesde?: string;
    vigenciaHasta?: string;
    contactoEncargado?: string;
  }) {
    const i = store.centrosCosto.findIndex((c) => c.id === id);
    if (i < 0) throw new Error('Centro de costo no encontrado');
    const prev = store.centrosCosto[i];
    if (String(input.codigo ?? '').trim().toUpperCase() !== prev.codigo.toUpperCase()) {
      throw new Error('El código no se puede modificar');
    }
    store.centrosCosto[i] = {
      ...prev,
      nombre: String(input.nombre ?? '').trim().toUpperCase(),
      activa: input.activa,
      vigenciaHasta: input.vigenciaHasta,
      contactoEncargado: input.contactoEncargado,
      id,
      empresaId: input.empresaId ?? prev.empresaId,
      // vigenciaDesde inmutable
    };
    return store.centrosCosto[i];
  },
  getAreasNegocio: (empresaId?: string) => filterByEmpresa(store.areasNegocio, empresaId),
  createAreaNegocio(input: { codigo: string; nombre: string; activa?: boolean; empresaId?: string }) {
    const codigo = input.codigo.trim().toUpperCase();
    if (store.areasNegocio.some((a) => a.codigo === codigo && a.empresaId === (input.empresaId || 'EMP-1'))) {
      throw new Error(`Ya existe el área ${codigo}`);
    }
    const row: AreaNegocio = {
      id: nextId('AN', store.areasNegocio),
      codigo,
      nombre: input.nombre.trim(),
      activa: input.activa ?? true,
      empresaId: input.empresaId || 'EMP-1',
    };
    store.areasNegocio.unshift(row);
    return row;
  },
  updateAreaNegocio(id: string, input: { codigo: string; nombre: string; activa?: boolean }) {
    const i = store.areasNegocio.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Área de negocio no encontrada');
    store.areasNegocio[i] = {
      ...store.areasNegocio[i],
      codigo: input.codigo.trim().toUpperCase(),
      nombre: input.nombre.trim(),
      activa: input.activa ?? store.areasNegocio[i].activa,
    };
    return store.areasNegocio[i];
  },
  getConceptosFlujo: (empresaId?: string) => filterByEmpresa(store.conceptosFlujo, empresaId),
  createConceptoFlujo(input: { codigo: string; nombre: string; orden?: number; activo?: boolean; empresaId?: string }) {
    const codigo = input.codigo.trim().toUpperCase();
    const empresaId = input.empresaId || 'EMP-1';
    if (store.conceptosFlujo.some((a) => a.codigo === codigo && a.empresaId === empresaId)) {
      throw new Error(`Ya existe el concepto ${codigo}`);
    }
    const row: ConceptoFlujo = {
      id: nextId('CX', store.conceptosFlujo),
      codigo,
      nombre: input.nombre.trim(),
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
      empresaId,
    };
    store.conceptosFlujo.unshift(row);
    return row;
  },
  updateConceptoFlujo(id: string, input: { codigo: string; nombre: string; orden?: number; activo?: boolean }) {
    const i = store.conceptosFlujo.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Concepto no encontrado');
    store.conceptosFlujo[i] = {
      ...store.conceptosFlujo[i],
      codigo: input.codigo.trim().toUpperCase(),
      nombre: input.nombre.trim(),
      orden: input.orden ?? store.conceptosFlujo[i].orden,
      activo: input.activo ?? store.conceptosFlujo[i].activo,
    };
    return store.conceptosFlujo[i];
  },
  getCodigosFinancieros: (empresaId?: string) => filterByEmpresa(store.codigosFinancieros, empresaId),
  createCodigoFinanciero(input: { codigo: string; nombre: string; activa?: boolean; empresaId?: string; conceptoId?: string }) {
    const codigo = input.codigo.trim();
    if (!/^\d+$/.test(codigo)) throw new Error('El código solo admite dígitos (0-9)');
    const empresaId = input.empresaId || 'EMP-1';
    if (store.codigosFinancieros.some((a) => a.codigo === codigo && a.empresaId === empresaId)) {
      throw new Error(`Ya existe el código ${codigo}. No se puede repetir ni reemplazar, aunque el nombre sea distinto`);
    }
    const concepto = input.conceptoId
      ? store.conceptosFlujo.find((c) => c.id === input.conceptoId)
      : undefined;
    const hoy = new Date().toISOString().slice(0, 10);
    const row: CodigoFinanciero = {
      id: nextId('CF', store.codigosFinancieros),
      codigo,
      nombre: input.nombre.trim().toUpperCase(),
      activa: input.activa ?? true,
      empresaId,
      conceptoId: concepto?.id,
      conceptoCodigo: concepto?.codigo,
      conceptoNombre: concepto?.nombre,
      createdAt: `${hoy}T00:00:00.000Z`,
    };
    store.codigosFinancieros.unshift(row);
    return row;
  },
  updateCodigoFinanciero(id: string, input: { codigo: string; nombre: string; activa?: boolean; conceptoId?: string }) {
    const i = store.codigosFinancieros.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Código financiero no encontrado');
    const prev = store.codigosFinancieros[i];
    if (input.codigo.trim().toUpperCase() !== prev.codigo.toUpperCase()) {
      throw new Error('El código no se puede modificar');
    }
    const concepto = input.conceptoId
      ? store.conceptosFlujo.find((c) => c.id === input.conceptoId)
      : undefined;
    store.codigosFinancieros[i] = {
      ...prev,
      nombre: input.nombre.trim().toUpperCase(),
      activa: input.activa ?? prev.activa,
      conceptoId: concepto?.id ?? prev.conceptoId,
      conceptoCodigo: concepto?.codigo ?? prev.conceptoCodigo,
      conceptoNombre: concepto?.nombre ?? prev.conceptoNombre,
    };
    return store.codigosFinancieros[i];
  },
  getTiposDocumento: () => [...store.tiposDocumento],
  createTipoDocumento(input: Omit<TipoDocumento, 'id'>) {
    const row: TipoDocumento = { id: nextId('TD', store.tiposDocumento), ...input };
    store.tiposDocumento.unshift(row);
    return row;
  },
  updateTipoDocumento(id: string, input: Omit<TipoDocumento, 'id'>) {
    const i = store.tiposDocumento.findIndex((t) => t.id === id);
    if (i < 0) throw new Error('Tipo de documento no encontrado');
    store.tiposDocumento[i] = { id, ...input };
    return store.tiposDocumento[i];
  },
  getCuentas: () => [...store.cuentas],
  createCuenta(input: Omit<CuentaContable, 'id'>) {
    const row: CuentaContable = { id: nextId('CT', store.cuentas), ...input };
    store.cuentas.unshift(row);
    return row;
  },
  updateCuenta(id: string, input: Partial<CuentaContable>) {
    const idx = store.cuentas.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error('Cuenta no encontrada');
    store.cuentas[idx] = { ...store.cuentas[idx], ...input, id };
    return store.cuentas[idx];
  },
  deleteCuenta(id: string) {
    const hasKids = store.cuentas.some((c) => c.padreId === id);
    if (hasKids) throw new Error('No se puede eliminar: la cuenta tiene hijos');
    store.cuentas = store.cuentas.filter((c) => c.id !== id);
    return { ok: true, id };
  },
  deletePlanCuentas() {
    const n = store.cuentas.length;
    store.cuentas = [];
    return { ok: true, deleted: n };
  },
  bulkCuentas(
    items: Array<Omit<CuentaContable, 'id'> & { padreCodigo?: string | null }>,
    replace?: boolean,
  ) {
    if (replace) store.cuentas = [];
    let created = 0;
    let updated = 0;
    const sorted = [...items].sort(
      (a, b) => (a.nivel ?? 1) - (b.nivel ?? 1) || a.codigo.localeCompare(b.codigo),
    );
    const inferPadreCodigo = (codigo: string): string | null => {
      const parts = codigo.split('-');
      if (parts.length >= 5) return parts.slice(0, 4).join('-');
      if (parts.length !== 4) return null;
      const [a, b, c, d] = parts;
      if (b === '0' && c === '00' && d === '00') return null;
      if (c === '00' && d === '00') return `${a}-0-00-00`;
      if (d === '00') return `${a}-${b}-00-00`;
      return `${a}-${b}-${c}-00`;
    };
    for (const item of sorted) {
      const padreCodigo = item.padreCodigo || inferPadreCodigo(item.codigo);
      const padreId =
        item.padreId
        || (padreCodigo ? store.cuentas.find((c) => c.codigo === padreCodigo)?.id : undefined);
      const row = { ...item, padreId };
      delete (row as { padreCodigo?: string | null }).padreCodigo;
      const existing = store.cuentas.find((c) => c.codigo === item.codigo);
      if (existing) {
        Object.assign(existing, row);
        updated += 1;
      } else {
        store.cuentas.push({ id: nextId('CT', store.cuentas), ...row });
        created += 1;
      }
    }
    return { ok: true, created, updated, total: items.length };
  },
  createCategoria(input: { digito: number; nombre: string; tipo?: CuentaContable['tipo'] }) {
    const digito = input.digito;
    const tipo =
      input.tipo ??
      (digito === 1
        ? 'ACTIVO'
        : digito === 2
          ? 'PASIVO'
          : digito === 3 || digito === 4
            ? 'PATRIMONIO'
            : digito === 5
              ? 'INGRESO'
              : 'GASTO');
    return this.createCuenta({
      codigo: `${digito}-0-00-00`,
      nombre: input.nombre,
      tipo,
      nivel: 1,
      activa: true,
      noImputable: true,
    });
  },
  getPeriodosContables: () => [...store.periodosContables].sort((a, b) => b.codigo.localeCompare(a.codigo)),
  createPeriodoContable(input: { codigo: string; activo?: boolean; fechaDesde?: string; fechaHasta?: string }) {
    const m = /^(\d{4})-(\d{2})$/.exec(input.codigo.trim());
    if (!m) throw new Error('codigo debe ser aaaa-mm');
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    if (store.periodosContables.some((p) => p.codigo === input.codigo.trim())) {
      throw new Error(`Ya existe el periodo ${input.codigo}`);
    }
    const lastDay = new Date(anio, mes, 0).getDate();
    if (input.activo) {
      store.periodosContables.forEach((p) => { p.activo = false; });
    }
    const row: PeriodoContable = {
      id: nextId('PER', store.periodosContables),
      codigo: input.codigo.trim(),
      anio,
      mes,
      fechaDesde: input.fechaDesde || `${m[1]}-${m[2]}-01`,
      fechaHasta: input.fechaHasta || `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`,
      estado: 'ABIERTO',
      activo: Boolean(input.activo),
      empresaId: 'EMP-1',
    };
    store.periodosContables.unshift(row);
    return row;
  },
  updatePeriodoContable(id: string, input: { estado?: string; activo?: boolean; fechaDesde?: string; fechaHasta?: string }) {
    const i = store.periodosContables.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Periodo no encontrado');
    if (input.activo) {
      store.periodosContables.forEach((p) => { p.activo = false; });
    }
    store.periodosContables[i] = {
      ...store.periodosContables[i],
      ...(input.estado ? { estado: input.estado.toUpperCase() as PeriodoContable['estado'] } : {}),
      ...(input.activo !== undefined ? { activo: input.activo } : {}),
      ...(input.fechaDesde ? { fechaDesde: input.fechaDesde } : {}),
      ...(input.fechaHasta ? { fechaHasta: input.fechaHasta } : {}),
    };
    return store.periodosContables[i];
  },
  abrirPeriodoContable(id: string, input?: { motivo?: string }) {
    const row = this.updatePeriodoContable(id, { estado: 'ABIERTO' });
    store.periodoEventos.unshift({
      id: `PEV-${Date.now()}`,
      periodoId: id,
      accion: 'REABRIR',
      estadoAntes: 'CERRADO',
      estadoDespues: 'ABIERTO',
      motivo: input?.motivo,
      usuarioNombre: 'Demo',
      createdAt: new Date().toISOString(),
    });
    return row;
  },
  cerrarPeriodoContable(id: string) {
    const row = this.updatePeriodoContable(id, { estado: 'CERRADO', activo: false });
    store.periodoEventos.unshift({
      id: `PEV-${Date.now()}`,
      periodoId: id,
      accion: 'CERRAR',
      estadoAntes: 'ABIERTO',
      estadoDespues: 'CERRADO',
      createdAt: new Date().toISOString(),
    });
    return row;
  },
  getPeriodoContableEventos(id: string) {
    return store.periodoEventos.filter((e) => e.periodoId === id);
  },
  getConfigContableSii: () => [...store.configsContableSii],
  putConfigContableSii(input: {
    items: Array<{
      tipoDocumentoSii: string;
      codigoSii?: string;
      nombre: string;
      cuentaContableId: string;
      centroCostoId?: string | null;
      areaNegocioId?: string | null;
      elementoCostoId?: string | null;
      lado?: string;
      activa?: boolean;
    }>;
  }) {
    const results: ConfigContableSii[] = [];
    for (const item of input.items) {
      const tipo = item.tipoDocumentoSii.trim().toUpperCase();
      const cuenta = store.cuentas.find((c) => c.id === item.cuentaContableId);
      const existing = store.configsContableSii.find((c) => c.tipoDocumentoSii === tipo);
      const row: ConfigContableSii = {
        id: existing?.id || nextId('SII', store.configsContableSii),
        tipoDocumentoSii: tipo,
        codigoSii: item.codigoSii || tipo,
        nombre: item.nombre,
        cuentaContableId: item.cuentaContableId,
        cuentaCodigo: cuenta?.codigo,
        cuentaNombre: cuenta?.nombre,
        cuentaRequiereCc: cuenta?.requiereCc ?? false,
        cuentaRequiereArea: cuenta?.requiereArea ?? false,
        cuentaRequiereElemento: cuenta?.requiereElemento ?? false,
        centroCostoId: item.centroCostoId || undefined,
        areaNegocioId: item.areaNegocioId || undefined,
        elementoCostoId: item.elementoCostoId || undefined,
        lado: (item.lado || 'DEBE').toUpperCase(),
        activa: item.activa ?? true,
        empresaId: 'EMP-1',
      };
      if (existing) {
        Object.assign(existing, row);
        results.push(existing);
      } else {
        store.configsContableSii.push(row);
        results.push(row);
      }
    }
    return results;
  },
  runCentralizacion(input: {
    periodo: string;
    origenes?: string[];
    tipoCambio?: number;
    monedaTc?: string;
  }, dryRun: boolean): CentralizacionResult {
    const periodo = input.periodo.trim();
    const origenes = (input.origenes?.length ? input.origenes : ['ventas', 'compras', 'contratistas', 'bodega'])
      .map((o) => o.toLowerCase());
    const closed = store.periodosContables.find((p) => p.codigo === periodo && p.estado === 'CERRADO');
    if (closed) throw new Error(`El periodo ${periodo} está cerrado`);

    const items: CentralizacionResult['items'] = [];
    const asientosCreados: CentralizacionResult['asientosCreados'] = [];
    const avisos: string[] = [];
    const cfg = (tipo: string) => store.configsContableSii.find((c) => c.tipoDocumentoSii === tipo && c.activa);

    if (origenes.includes('ventas')) {
      const docs = store.documentos.filter(
        (d) => d.fecha.startsWith(periodo) && d.estado !== 'ANULADO' && !d.asientoOriginal && !d.fromReversa,
      );
      for (const d of docs) {
        items.push({
          origen: 'ventas',
          ref: d.folio,
          glosa: `Centraliza venta ${d.folio} · ${d.cliente}`,
          monto: d.neto,
          accion: d.neto > 0 ? 'CREAR' : 'OMITIR',
          motivo: d.neto > 0 ? undefined : 'monto 0',
        });
        if (!dryRun && d.neto > 0) {
          const a = this.createAsiento({
            glosa: `Centraliza venta ${d.folio}`,
            periodo,
            fecha: d.fecha,
            tipo: 'DIARIO',
            origen: `CENTRALIZA-VTA:${d.folio}`,
            estado: 'CONTABILIZADO',
            lineas: [
              { debe: d.neto, haber: 0, cuentaId: cfg('CLIENTES')?.cuentaContableId },
              { debe: 0, haber: d.neto, cuentaId: cfg('33')?.cuentaContableId },
            ],
          });
          d.asientoOriginal = a.numero;
          d.estado = 'CONTABILIZADA';
          asientosCreados.push({ numero: a.numero, origen: 'ventas', monto: d.neto });
        }
      }
    }

    if (origenes.includes('compras')) {
      const regs = store.registrosCompra.filter(
        (r) => !r.asientoId && r.estado !== 'ANULADO' && r.estado !== 'CONTABILIZADA',
      );
      for (const r of regs) {
        items.push({
          origen: 'compras',
          ref: r.factura,
          glosa: `Centraliza compra ${r.factura}`,
          monto: r.monto,
          accion: r.monto > 0 ? 'CREAR' : 'OMITIR',
        });
        if (!dryRun && r.monto > 0) {
          const a = this.createAsiento({
            glosa: `Centraliza compra ${r.factura}`,
            periodo,
            tipo: 'DIARIO',
            origen: `CENTRALIZA-CMP:${r.factura}`,
            estado: 'CONTABILIZADO',
            lineas: [
              { debe: r.monto, haber: 0, cuentaId: cfg('46')?.cuentaContableId || cfg('CONTRATISTAS')?.cuentaContableId },
              { debe: 0, haber: r.monto, cuentaId: cfg('PROVEEDORES')?.cuentaContableId },
            ],
          });
          r.asientoId = a.id;
          r.asientoNumero = a.numero;
          r.estado = 'CONTABILIZADA';
          asientosCreados.push({ numero: a.numero, origen: 'compras', monto: r.monto });
        }
      }
    }

    if (origenes.includes('contratistas')) {
      const existing = store.asientos.find((a) => a.origen === `TRASPASO-CTR:${periodo}`);
      const proformas = store.proformasContratista.filter(
        (p) => p.periodo.includes(periodo) && (p.estado === 'DEFINITIVA' || p.estado === 'FACTURADA'),
      );
      const montoTotal = proformas.reduce((a, p) => a + p.monto, 0);
      if (existing) {
        items.push({
          origen: 'contratistas', ref: periodo, glosa: `Traspaso ${periodo}`, monto: montoTotal,
          accion: 'OMITIR', motivo: `Ya existe ${existing.numero}`,
        });
      } else if (!proformas.length) {
        items.push({
          origen: 'contratistas', ref: periodo, glosa: `Traspaso ${periodo}`, monto: 0,
          accion: 'OMITIR', motivo: 'Sin proformas DEFINITIVA/FACTURADA',
        });
      } else {
        items.push({
          origen: 'contratistas', ref: periodo,
          glosa: `Traspaso contratistas ${periodo}`, monto: montoTotal, accion: 'CREAR',
        });
        if (!dryRun && montoTotal > 0) {
          const a = this.createAsiento({
            glosa: `Traspaso/cierre contratistas ${periodo}`,
            periodo,
            tipo: 'DIARIO',
            origen: `TRASPASO-CTR:${periodo}`,
            estado: 'CONTABILIZADO',
            lineas: [
              { debe: montoTotal, haber: 0, cuentaId: cfg('CONTRATISTAS')?.cuentaContableId },
              { debe: 0, haber: montoTotal, cuentaId: cfg('PROVEEDORES')?.cuentaContableId },
            ],
          });
          asientosCreados.push({ numero: a.numero, origen: 'contratistas', monto: montoTotal });
        }
      }
    }

    if (origenes.includes('bodega')) {
      const ya = new Set(
        store.asientos.filter((a) => a.origen?.startsWith('CENTRALIZA-BOD:')).map((a) => a.origen),
      );
      for (const m of store.movimientosBodega.filter((x) => x.fecha.startsWith(periodo))) {
        const origenKey = `CENTRALIZA-BOD:${m.id}`;
        const monto = m.cantidad * m.precioUnitario;
        if (ya.has(origenKey)) {
          items.push({
            origen: 'bodega', ref: m.id, glosa: `Mov. ${m.tipo}`, monto,
            accion: 'OMITIR', motivo: 'Ya centralizado',
          });
          continue;
        }
        items.push({
          origen: 'bodega', ref: m.id, glosa: `Centraliza bodega ${m.tipo} · ${m.articulo}`,
          monto, accion: monto > 0 ? 'CREAR' : 'OMITIR',
        });
        if (!dryRun && monto > 0) {
          const a = this.createAsiento({
            glosa: `Centraliza bodega ${m.tipo} · ${m.articulo}`,
            periodo,
            fecha: m.fecha,
            tipo: 'DIARIO',
            origen: origenKey,
            estado: 'CONTABILIZADO',
            lineas: [
              { debe: monto, haber: 0, cuentaId: cfg('BODEGA')?.cuentaContableId },
              { debe: 0, haber: monto, cuentaId: cfg('PROVEEDORES')?.cuentaContableId },
            ],
          });
          asientosCreados.push({ numero: a.numero, origen: 'bodega', monto });
        }
      }
    }

    const crear = items.filter((i) => i.accion === 'CREAR');
    if (!crear.length) avisos.push('No hay documentos pendientes de centralizar para los orígenes seleccionados.');

    return {
      dryRun,
      periodo,
      tipoCambio: input.tipoCambio,
      monedaTc: input.monedaTc,
      origenes,
      resumen: {
        pendientes: crear.length,
        omitidos: items.length - crear.length,
        asientosCreados: asientosCreados.length,
        montoTotal: crear.reduce((a, i) => a + i.monto, 0),
      },
      items,
      asientosCreados,
      avisos,
    };
  },
  previewCentralizacion(input: {
    periodo: string;
    origenes?: string[];
    tipoCambio?: number;
    monedaTc?: string;
  }) {
    return this.runCentralizacion(input, true);
  },
  ejecutarCentralizacion(input: {
    periodo: string;
    origenes?: string[];
    tipoCambio?: number;
    monedaTc?: string;
  }) {
    return this.runCentralizacion(input, false);
  },
  getAsientos: () => [...store.asientos],
  createAsiento(input: {
    glosa: string;
    fecha?: string;
    periodo?: string;
    tipo?: string;
    debe?: number;
    haber?: number;
    origen?: string;
    estado?: Asiento['estado'];
    numero?: string;
    lineas?: { debe: number; haber: number; cuentaId?: string; glosa?: string; centroCostoId?: string; moneda?: string; tipoCambio?: number }[];
  }) {
    const debe = input.lineas
      ? input.lineas.reduce((a, l) => a + (l.debe || 0), 0)
      : Number(input.debe ?? 0);
    const haber = input.lineas
      ? input.lineas.reduce((a, l) => a + (l.haber || 0), 0)
      : Number(input.haber ?? 0);
    const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
    const year = fecha.slice(0, 4);
    const row: Asiento = {
      id: nextId('ASI', store.asientos),
      numero: input.numero ?? `${year}${String(store.asientos.length + 1).padStart(4, '0')}`,
      periodo: input.periodo ?? fecha.slice(0, 7),
      fecha,
      tipo: input.tipo ?? 'MANUAL',
      glosa: input.glosa,
      debe,
      haber,
      estado: input.estado ?? 'BORRADOR',
      origen: input.origen ?? 'Manual',
      lineas: input.lineas,
    };
    store.asientos.unshift(row);
    return row;
  },
  updateAsiento(
    id: string,
    input: {
      glosa: string;
      fecha?: string;
      periodo?: string;
      tipo?: string;
      estado?: Asiento['estado'];
      numero?: string;
      origen?: string;
      lineas: { debe: number; haber: number; cuentaId?: string; glosa?: string; centroCostoId?: string; moneda?: string; tipoCambio?: number }[];
    },
  ) {
    const i = store.asientos.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Asiento no encontrado');
    if (store.asientos[i].estado === 'ANULADO') throw new Error('No se puede editar un asiento anulado');
    const debe = input.lineas.reduce((a, l) => a + (l.debe || 0), 0);
    const haber = input.lineas.reduce((a, l) => a + (l.haber || 0), 0);
    if (Math.round(debe * 100) !== Math.round(haber * 100) || debe <= 0) {
      throw new Error(`Asiento descuadrado: debe=${debe} haber=${haber}`);
    }
    store.asientos[i] = {
      ...store.asientos[i],
      glosa: input.glosa,
      fecha: input.fecha ?? store.asientos[i].fecha,
      periodo: input.periodo ?? store.asientos[i].periodo,
      tipo: input.tipo ?? store.asientos[i].tipo,
      estado: input.estado ?? store.asientos[i].estado,
      numero: input.numero ?? store.asientos[i].numero,
      origen: input.origen ?? store.asientos[i].origen,
      debe,
      haber,
      lineas: input.lineas,
    };
    return store.asientos[i];
  },
  bulkAsientos(input: {
    items: {
      glosa: string;
      fecha?: string;
      periodo?: string;
      tipo?: string;
      debe?: number;
      haber?: number;
      origen?: string;
      estado?: Asiento['estado'];
      numero?: string;
      lineas?: { debe: number; haber: number; cuentaId?: string; glosa?: string; centroCostoId?: string; moneda?: string; tipoCambio?: number }[];
    }[];
  }) {
    const created: { id: string; numero: string }[] = [];
    const errors: { index: number; message: string }[] = [];
    input.items.forEach((item, index) => {
      try {
        const row = this.createAsiento(item);
        created.push({ id: row.id, numero: row.numero });
      } catch (e) {
        errors.push({ index, message: e instanceof Error ? e.message : 'Error' });
      }
    });
    return { created: created.length, errors, items: created };
  },
  getLibroDiario(periodo: string): LibroDiarioResult {
    const p = periodo.trim();
    const asientos = store.asientos.filter(
      (a) => (a.periodo ?? a.fecha.slice(0, 7)) === p && a.estado === 'CONTABILIZADO',
    );
    const lineas = asientos.flatMap((a) => lineasLibroDeAsiento(a));
    const debe = lineas.reduce((s, l) => s + l.debe, 0);
    const haber = lineas.reduce((s, l) => s + l.haber, 0);
    return {
      periodo: p,
      lineas,
      totales: {
        debe,
        haber,
        cuadrado: Math.round(debe * 100) === Math.round(haber * 100),
        asientos: asientos.length,
      },
    };
  },
  getMayor(periodo: string, cuentaId?: string): MayorResult {
    const p = periodo.trim();
    const byId = cuentaById();
    const allContab = store.asientos.filter((a) => a.estado === 'CONTABILIZADO');
    const delPeriodo = allContab.filter((a) => (a.periodo ?? a.fecha.slice(0, 7)) === p);
    const anteriores = allContab.filter((a) => (a.periodo ?? a.fecha.slice(0, 7)) < p);

    const acc = new Map<string, {
      cuentaId?: string;
      cuentaCodigo: string;
      cuentaNombre: string;
      debe: number;
      haber: number;
      saldoInicial: number;
      movimientos: LibroDiarioLinea[];
    }>();

    const keyOf = (cuentaIdLinea?: string) => cuentaIdLinea || '_sin_cuenta';
    const ensure = (cuentaIdLinea?: string) => {
      const k = keyOf(cuentaIdLinea);
      let row = acc.get(k);
      if (!row) {
        const c = cuentaIdLinea ? byId.get(cuentaIdLinea) : undefined;
        row = {
          cuentaId: cuentaIdLinea,
          cuentaCodigo: c?.codigo ?? '—',
          cuentaNombre: c?.nombre ?? 'Sin cuenta',
          debe: 0,
          haber: 0,
          saldoInicial: 0,
          movimientos: [],
        };
        acc.set(k, row);
      }
      return row;
    };

    for (const a of anteriores) {
      for (const l of lineasLibroDeAsiento(a)) {
        const row = ensure(l.cuentaId);
        row.saldoInicial += l.debe - l.haber;
      }
    }
    for (const a of delPeriodo) {
      for (const l of lineasLibroDeAsiento(a)) {
        const row = ensure(l.cuentaId);
        row.debe += l.debe;
        row.haber += l.haber;
        row.movimientos.push(l);
      }
    }

    let cuentas = [...acc.values()].map((c) => {
      const saldoPeriodo = c.debe - c.haber;
      return {
        ...c,
        saldoPeriodo,
        saldo: c.saldoInicial + saldoPeriodo,
      };
    });
    if (cuentaId) cuentas = cuentas.filter((c) => c.cuentaId === cuentaId);
    cuentas.sort((a, b) => a.cuentaCodigo.localeCompare(b.cuentaCodigo));
    return {
      periodo: p,
      cuentas,
      totales: {
        debe: cuentas.reduce((s, c) => s + c.debe, 0),
        haber: cuentas.reduce((s, c) => s + c.haber, 0),
        saldoInicial: cuentas.reduce((s, c) => s + c.saldoInicial, 0),
      },
    };
  },
  getMovimientosCaja: () => [...store.movimientosCaja],
  createMovimientoCaja(input: Omit<MovimientoCaja, 'id' | 'saldo'> & { saldo?: number }) {
    const last = store.movimientosCaja[0];
    const saldoPrev = last?.saldo ?? 0;
    const ingreso = Number(input.ingreso) || 0;
    const egreso = Number(input.egreso) || 0;
    const row: MovimientoCaja = {
      id: nextId('MC', store.movimientosCaja),
      fecha: input.fecha,
      concepto: input.concepto,
      ingreso,
      egreso,
      saldo: input.saldo ?? saldoPrev + ingreso - egreso,
      banco: input.banco,
      moneda: input.moneda ?? 'CLP',
      esApertura: Boolean(input.esApertura),
    };
    store.movimientosCaja.unshift(row);
    return row;
  },
  recalcMovimientosCajaSaldos() {
    const rows = [...store.movimientosCaja];
    const asc = [...rows].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id)),
    );
    let saldo = 0;
    const saldoMap = new Map<string, number>();
    for (const m of asc) {
      saldo += (Number(m.ingreso) || 0) - (Number(m.egreso) || 0);
      saldoMap.set(m.id, saldo);
    }
    store.movimientosCaja = rows.map((m) => ({ ...m, saldo: saldoMap.get(m.id) ?? m.saldo }));
  },
  corregirApertura(id: string, input: {
    fecha: string;
    banco: string;
    moneda: string;
    ingreso: number;
    motivo: string;
  }) {
    const i = store.movimientosCaja.findIndex((m) => m.id === id);
    if (i < 0) throw new Error('Movimiento no encontrado');
    const actual = store.movimientosCaja[i];
    if (!actual.esApertura) throw new Error('Solo se corrige un saldo de apertura');
    const banco = input.banco.trim();
    const moneda = input.moneda;
    const otro = store.movimientosCaja.find((m) => (
      m.id !== id && m.esApertura && m.banco === banco && (m.moneda ?? 'CLP') === moneda
    ));
    if (otro) throw new Error('Ya existe saldo de apertura para este banco y moneda');
    if (input.motivo.trim().length < 3) throw new Error('Indica el motivo de la corrección');
    store.movimientosCaja[i] = {
      ...actual,
      fecha: input.fecha,
      banco,
      moneda,
      ingreso: input.ingreso,
      egreso: 0,
      saldo: input.ingreso,
      concepto: `Saldo de apertura ${moneda}`,
    };
    return store.movimientosCaja[i];
  },
  updateMovimientoCaja(id: string, input: Partial<Omit<MovimientoCaja, 'id' | 'saldo'>>) {
    const i = store.movimientosCaja.findIndex((m) => m.id === id);
    if (i < 0) throw new Error('Movimiento no encontrado');
    store.movimientosCaja[i] = { ...store.movimientosCaja[i], ...input, id };
    this.recalcMovimientosCajaSaldos();
    return store.movimientosCaja[i];
  },
  deleteMovimientoCaja(id: string) {
    store.movimientosCaja = store.movimientosCaja.filter((m) => m.id !== id);
    this.recalcMovimientosCajaSaldos();
  },
  getPagos: () => [...store.pagos],
  getConciliaciones: () => [...store.conciliaciones],
  createConciliacion(input: Omit<Conciliacion, 'id' | 'conciliados' | 'diferencia' | 'estado'> & {
    conciliados?: number;
    diferencia?: number;
    estado?: Conciliacion['estado'];
  }) {
    const row: Conciliacion = {
      id: nextId('CON', store.conciliaciones),
      banco: input.banco,
      periodo: input.periodo,
      movimientos: Number(input.movimientos) || 0,
      conciliados: input.conciliados ?? 0,
      diferencia: input.diferencia ?? 0,
      estado: input.estado ?? 'PENDIENTE',
      asientoNumero: input.asientoNumero,
      cartolaId: input.cartolaId,
    };
    store.conciliaciones.unshift(row);
    return row;
  },
  getMovimientosConciliacion(conciliacionId: string) {
    return store.movimientosConciliacion.filter((m) => m.conciliacionId === conciliacionId);
  },
  desconciliarMovimiento(movimientoId: string) {
    const idx = store.movimientosConciliacion.findIndex((m) => m.id === movimientoId);
    if (idx < 0) throw new Error('Movimiento no encontrado');
    const prev = store.movimientosConciliacion[idx];
    if (prev.estado !== 'CONCILIADO') throw new Error('El movimiento ya está pendiente');
    const mov: MovimientoConciliacion = { ...prev, estado: 'PENDIENTE' };
    store.movimientosConciliacion = store.movimientosConciliacion.map((m) =>
      (m.id === movimientoId ? mov : m),
    );
    const concIdx = store.conciliaciones.findIndex((c) => c.id === mov.conciliacionId);
    if (concIdx >= 0) {
      const conc = store.conciliaciones[concIdx];
      if (conc.conciliados > 0) {
        store.conciliaciones[concIdx] = {
          ...conc,
          conciliados: conc.conciliados - 1,
          diferencia: (conc.diferencia || 0) + mov.monto,
          estado: conc.estado === 'ACTIVO' ? 'PENDIENTE' : conc.estado,
        };
      }
    }
    return { ...mov };
  },
  getPresupuestos: () => [...store.presupuestos],
  createPresupuesto(input: Omit<Presupuesto, 'id'>) {
    const row: Presupuesto = { id: nextId('PRE', store.presupuestos), ...input };
    store.presupuestos.unshift(row);
    return row;
  },
  updatePresupuesto(id: string, input: Partial<Omit<Presupuesto, 'id'>>) {
    const i = store.presupuestos.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Presupuesto no encontrado');
    store.presupuestos[i] = { ...store.presupuestos[i], ...input, id };
    return store.presupuestos[i];
  },
  deletePresupuesto(id: string) {
    store.presupuestos = store.presupuestos.filter((p) => p.id !== id);
  },
  getOrdenesCompra: () => [...store.ordenesCompra],
  getAprobacionesOc: () => [...store.aprobacionesOc],
  getRecepcionesOc: () => [...store.recepcionesOc],
  createRecepcionOc(input: Omit<RecepcionOc, 'id'>) {
    const row: RecepcionOc = { id: nextId('REC', store.recepcionesOc), ...input };
    store.recepcionesOc.unshift(row);
    const oc = store.ordenesCompra.find((o) => o.numero === input.ocNumero);
    if (oc && (input.estado === 'CONFIRMADA' || oc.estado === 'APROBADO')) {
      oc.estado = 'RECEPCIONADA';
    }
    return row;
  },
  updateRecepcionOc(id: string, input: Partial<Omit<RecepcionOc, 'id' | 'ocNumero'>>) {
    const i = store.recepcionesOc.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Recepción no encontrada');
    store.recepcionesOc[i] = { ...store.recepcionesOc[i], ...input };
    return store.recepcionesOc[i];
  },
  getRegistrosCompra: () => [...store.registrosCompra],
  getInsumos: () => [...store.insumos],
  createInsumo(input: Omit<Insumo, 'id'> | (Omit<Insumo, 'id' | 'stock' | 'costoPromedio'> & { stock?: number; costoPromedio?: number })) {
    const row: Insumo = {
      id: nextId('INS', store.insumos),
      stock: 0,
      costoPromedio: 0,
      ...input,
    };
    store.insumos.unshift(row);
    return row;
  },
  updateInsumo(id: string, input: Partial<Omit<Insumo, 'id'>>) {
    const i = store.insumos.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Insumo no encontrado');
    store.insumos[i] = {
      ...store.insumos[i],
      ...input,
      // Stock/CPP no se editan desde maestro
      stock: store.insumos[i].stock,
      costoPromedio: store.insumos[i].costoPromedio,
    };
    return store.insumos[i];
  },
  getBodegas: () => [...store.bodegas],
  createBodega(input: Omit<Bodega, 'id'>) {
    const row: Bodega = { id: nextId('BOD', store.bodegas), ...input };
    store.bodegas.unshift(row);
    return row;
  },
  getMovimientosBodega: () => [...store.movimientosBodega],
  createMovimientoBodega(input: Omit<MovimientoBodega, 'id'> & { generarPar?: boolean }) {
    const row: MovimientoBodega = {
      id: nextId('MB', store.movimientosBodega),
      estado: input.estado ?? 'CONFIRMADO',
      ...input,
    };
    store.movimientosBodega.unshift(row);
    if (input.tipo === 'SALIDA_PROVEEDOR' && input.generarPar !== false) {
      const par: MovimientoBodega = {
        id: nextId('MB', store.movimientosBodega),
        fecha: row.fecha,
        tipo: 'DEVOLUCION',
        estado: row.estado,
        bodega: row.bodegaDestino || 'PROVEEDOR',
        bodegaDestino: row.bodega,
        articulo: row.articulo,
        cantidad: row.cantidad,
        precioUnitario: row.precioUnitario,
        facturaRef: row.facturaRef,
        nota: `Par de ${row.id}`,
        parId: row.id,
      };
      store.movimientosBodega.unshift(par);
      row.parId = par.id;
    }
    return row;
  },
  getElementosCosto: () => [...store.elementosCosto],
  createElementoCosto(input: Omit<ElementoCosto, 'id'>) {
    const codigo = String(input.codigo ?? '').trim();
    if (!/^\d+$/.test(codigo)) throw new Error('El código solo admite dígitos (0-9)');
    if (store.elementosCosto.some((r) => r.codigo === codigo)) {
      throw new Error(`Ya existe el código ${codigo}. No se puede repetir ni reemplazar, aunque el nombre sea distinto`);
    }
    const hoy = new Date().toISOString().slice(0, 10);
    const row: ElementoCosto = {
      id: nextId('EL', store.elementosCosto),
      codigo,
      nombre: String(input.nombre ?? '').trim().toUpperCase(),
      departamento: input.departamento,
      vigencia: 'VIGENTE',
      createdAt: `${hoy}T00:00:00.000Z`,
    };
    store.elementosCosto.unshift(row);
    return row;
  },
  updateElementoCosto(id: string, input: Omit<ElementoCosto, 'id'>) {
    const i = store.elementosCosto.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Elemento de costo no encontrado');
    const prev = store.elementosCosto[i];
    if (String(input.codigo ?? '').trim().toUpperCase() !== prev.codigo.toUpperCase()) {
      throw new Error('El código no se puede modificar');
    }
    store.elementosCosto[i] = {
      id,
      codigo: prev.codigo,
      nombre: String(input.nombre ?? '').trim().toUpperCase(),
      departamento: input.departamento,
      vigencia: input.vigencia,
      createdAt: prev.createdAt,
    };
    return store.elementosCosto[i];
  },
  getFactoresHonorario: () => [...store.factoresHonorario],
  createFactorHonorario(input: Omit<FactorHonorario, 'id'>) {
    const row: FactorHonorario = { id: nextId('FH', store.factoresHonorario), ...input };
    store.factoresHonorario.unshift(row);
    return row;
  },
  updateFactorHonorario(id: string, input: Omit<FactorHonorario, 'id'>) {
    const i = store.factoresHonorario.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Factor de honorario no encontrado');
    store.factoresHonorario[i] = { id, ...input };
    return store.factoresHonorario[i];
  },
  getIndicadoresBc: () => [...store.indicadoresBc],
  getClientes: () => [...store.clientes],
  createCliente(input: Omit<Cliente, 'id'>) {
    const row: Cliente = { id: nextId('CLI', store.clientes), ...input };
    store.clientes.unshift(row);
    return row;
  },
  updateCliente(id: string, input: Omit<Cliente, 'id'>) {
    const i = store.clientes.findIndex((c) => c.id === id);
    if (i < 0) throw new Error('Cliente no encontrado');
    store.clientes[i] = { id, ...input };
    return store.clientes[i];
  },
  getProspectos: () => [...store.prospectos],
  createProspecto(input: Omit<Prospecto, 'id'>) {
    const row: Prospecto = { id: nextId('PRO', store.prospectos), ...input };
    store.prospectos.unshift(row);
    return row;
  },
  updateProspecto(id: string, input: Omit<Prospecto, 'id'>) {
    const i = store.prospectos.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Prospecto no encontrado');
    store.prospectos[i] = { id, ...input };
    return store.prospectos[i];
  },
  getDocumentos: () => [...store.documentos],
  createDocumento(input: Omit<DocumentoComercial, 'id'>) {
    const row: DocumentoComercial = { id: nextId('DOC', store.documentos), ...input };
    store.documentos.unshift(row);
    return row;
  },
  updateDocumento(id: string, input: Partial<DocumentoComercial>) {
    const i = store.documentos.findIndex((d) => d.id === id);
    if (i < 0) throw new Error('Documento no encontrado');
    store.documentos[i] = { ...store.documentos[i], ...input, id };
    return store.documentos[i];
  },
  eliminarDocumentoBorrador(id: string) {
    const i = store.documentos.findIndex((d) => d.id === id);
    if (i < 0) throw new Error('Documento no encontrado');
    if (store.documentos[i].estado !== 'BORRADOR') {
      throw new Error('Solo se pueden eliminar documentos en estado Borrador');
    }
    store.documentos.splice(i, 1);
    return { ok: true, id };
  },
  getWorkflows: () => [...store.workflows],
  createWorkflow(input: Omit<WorkflowConfig, 'id'>) {
    const row: WorkflowConfig = { id: nextId('WF', store.workflows), ...input };
    store.workflows.unshift(row);
    return row;
  },
  updateWorkflow(id: string, input: Partial<WorkflowConfig>) {
    const i = store.workflows.findIndex((w) => w.id === id);
    if (i < 0) throw new Error('Regla no encontrada');
    store.workflows[i] = { ...store.workflows[i], ...input, id };
    return store.workflows[i];
  },
  deleteWorkflow(id: string) {
    store.workflows = store.workflows.filter((w) => w.id !== id);
    return { ok: true as const, id };
  },
  updateBodega(id: string, input: Partial<(typeof store.bodegas)[0]>) {
    const i = store.bodegas.findIndex((b) => b.id === id);
    if (i < 0) throw new Error('Bodega no encontrada');
    store.bodegas[i] = { ...store.bodegas[i], ...input, id };
    return store.bodegas[i];
  },
  updateMovimientoBodega(id: string, input: Partial<(typeof store.movimientosBodega)[0]>) {
    const i = store.movimientosBodega.findIndex((m) => m.id === id);
    if (i < 0) throw new Error('Movimiento no encontrado');
    store.movimientosBodega[i] = { ...store.movimientosBodega[i], ...input, id };
    return store.movimientosBodega[i];
  },
  getReportesContables: () => [...store.reportesContables],

  getContratistas: () => [...store.contratistas],
  createContratista(input: Omit<Contratista, 'id'>) {
    const row: Contratista = { id: nextId('CTR', store.contratistas), ...input };
    store.contratistas.unshift(row);
    return row;
  },
  updateContratista(id: string, input: Omit<Contratista, 'id'>) {
    const i = store.contratistas.findIndex((c) => c.id === id);
    if (i < 0) throw new Error('Contratista no encontrado');
    store.contratistas[i] = { id, ...input };
    return store.contratistas[i];
  },

  getLabores: () => [...store.labores],
  createLabor(input: Omit<Labor, 'id' | 'empresaId'>) {
    const row: Labor = { id: nextId('LAB', store.labores), empresaId: 'EMP-1', ...input };
    store.labores.unshift(row);
    return row;
  },
  updateLabor(id: string, input: Omit<Labor, 'id' | 'empresaId'>) {
    const i = store.labores.findIndex((row) => row.id === id);
    if (i < 0) throw new Error('Labor no encontrada');
    store.labores[i] = { ...store.labores[i], ...input };
    return store.labores[i];
  },
  getActividades(laborId?: string) {
    let list = [...store.actividades];
    if (laborId) list = list.filter((a) => ACT_LABOR[a.id] === laborId);
    return list;
  },
  createActividad(input: Omit<Actividad, 'id' | 'empresaId'>) {
    const row: Actividad = { id: nextId('ACT', store.actividades), empresaId: 'EMP-1', ...input };
    store.actividades.unshift(row);
    return row;
  },
  updateActividad(id: string, input: Omit<Actividad, 'id' | 'empresaId'>) {
    const i = store.actividades.findIndex((row) => row.id === id);
    if (i < 0) throw new Error('Actividad no encontrada');
    store.actividades[i] = { ...store.actividades[i], ...input };
    return store.actividades[i];
  },
  linkLaborActividad(laborId: string, actividadId: string) {
    ACT_LABOR[actividadId] = laborId;
    return { laborId, actividadId };
  },
  unlinkLaborActividad(laborId: string, actividadId: string) {
    if (ACT_LABOR[actividadId] === laborId) delete ACT_LABOR[actividadId];
    return { ok: true };
  },

  getTiposContratoContratista: () => [...store.tiposContratoContratista],
  createTipoContratoContratista(
    input: Omit<TipoContratoContratista, 'id' | 'empresaId' | 'cuentaDebe' | 'cuentaHaber' | 'cuentaAdministracion'>,
  ) {
    const row: TipoContratoContratista = {
      id: nextId('TCC', store.tiposContratoContratista),
      empresaId: 'EMP-1',
      ...input,
    };
    store.tiposContratoContratista.unshift(row);
    return row;
  },
  updateTipoContratoContratista(
    id: string,
    input: Omit<TipoContratoContratista, 'id' | 'empresaId' | 'cuentaDebe' | 'cuentaHaber' | 'cuentaAdministracion'>,
  ) {
    const i = store.tiposContratoContratista.findIndex((row) => row.id === id);
    if (i < 0) throw new Error('Tipo de contrato no encontrado');
    store.tiposContratoContratista[i] = { ...store.tiposContratoContratista[i], ...input };
    return store.tiposContratoContratista[i];
  },

  getTarifasContratista(contratistaId?: string) {
    let list = [...store.tarifasContratista];
    if (contratistaId) list = list.filter((t) => t.contratistaId === contratistaId);
    return list;
  },
  createTarifaContratista(input: {
    contratistaId: string;
    laborId: string;
    actividadId: string;
    tarifa: number;
    unidad: string;
    centroCostoId: string;
    tipoContratoId?: string;
    vigenciaDesde: string;
    vigenciaHasta?: string;
  }) {
    const ctr = store.contratistas.find((c) => c.id === input.contratistaId);
    const lab = store.labores.find((l) => l.id === input.laborId);
    const act = store.actividades.find((a) => a.id === input.actividadId);
    const cc = store.centrosCosto.find((c) => c.id === input.centroCostoId);
    const tipo = store.tiposContratoContratista.find((t) => t.id === input.tipoContratoId);
    const row: TarifaContratista = {
      id: nextId('TAR', store.tarifasContratista),
      contratistaId: input.contratistaId,
      contratista: ctr?.razonSocial ?? '',
      laborId: input.laborId,
      labor: lab?.nombre ?? '',
      actividadId: input.actividadId,
      actividad: act?.nombre ?? '',
      tipoContratoId: input.tipoContratoId,
      tipoContrato: tipo?.nombre,
      tarifa: input.tarifa,
      unidad: input.unidad,
      centroCostoId: input.centroCostoId,
      centroCosto: cc?.nombre ?? '',
      empresaId: cc?.empresaId ?? 'EMP-1',
      vigenciaDesde: input.vigenciaDesde,
      vigenciaHasta: input.vigenciaHasta,
    };
    store.tarifasContratista.unshift(row);
    return row;
  },
  updateTarifaContratista(
    id: string,
    input: {
      contratistaId: string;
      laborId: string;
      actividadId: string;
      tarifa: number;
      unidad: string;
      centroCostoId: string;
      tipoContratoId?: string;
      vigenciaDesde: string;
      vigenciaHasta?: string;
    },
  ) {
    const i = store.tarifasContratista.findIndex((t) => t.id === id);
    if (i < 0) throw new Error('Tarifa no encontrada');
    const ctr = store.contratistas.find((c) => c.id === input.contratistaId);
    const lab = store.labores.find((l) => l.id === input.laborId);
    const act = store.actividades.find((a) => a.id === input.actividadId);
    const cc = store.centrosCosto.find((c) => c.id === input.centroCostoId);
    const tipo = store.tiposContratoContratista.find((t) => t.id === input.tipoContratoId);
    store.tarifasContratista[i] = {
      id,
      contratistaId: input.contratistaId,
      contratista: ctr?.razonSocial ?? '',
      laborId: input.laborId,
      labor: lab?.nombre ?? '',
      actividadId: input.actividadId,
      actividad: act?.nombre ?? '',
      tipoContratoId: input.tipoContratoId,
      tipoContrato: tipo?.nombre,
      tarifa: input.tarifa,
      unidad: input.unidad,
      centroCostoId: input.centroCostoId,
      centroCosto: cc?.nombre ?? '',
      empresaId: cc?.empresaId ?? store.tarifasContratista[i].empresaId,
      vigenciaDesde: input.vigenciaDesde,
      vigenciaHasta: input.vigenciaHasta,
    };
    return store.tarifasContratista[i];
  },
  deleteTarifaContratista(id: string) {
    store.tarifasContratista = store.tarifasContratista.filter((t) => t.id !== id);
  },

  getProformasContratista(periodo?: string) {
    let list = [...store.proformasContratista];
    if (periodo) list = list.filter((p) => p.periodo.includes(periodo));
    return list;
  },
  createProformaContratista(input: {
    numero?: string;
    contratistaId: string;
    periodo: string;
    tipoContratoId?: string;
    montoNeto?: number;
    ingresoIds?: string[];
    moneda?: string;
  }) {
    const ctr = store.contratistas.find((c) => c.id === input.contratistaId);
    const tipo = store.tiposContratoContratista.find((t) => t.id === input.tipoContratoId);
    const ingresos = store.ingresosLaborDiario.filter((r) => input.ingresoIds?.includes(r.id));
    const monto = input.montoNeto ?? ingresos.reduce((sum, r) => sum + r.monto, 0);
    let max = 0;
    for (const p of store.proformasContratista) {
      const m = /^PF-(\d+)$/i.exec(p.numero);
      if (m) max = Math.max(max, Number.parseInt(m[1], 10));
    }
    const numero = input.numero?.trim() || `PF-${String(max + 1).padStart(5, '0')}`;
    const row: ProformaContratista = {
      id: nextId('PRF', store.proformasContratista),
      numero,
      contratistaId: input.contratistaId,
      contratista: ctr?.razonSocial ?? '',
      tipoContratoId: input.tipoContratoId,
      tipoContrato: tipo?.nombre,
      periodo: input.periodo,
      monto,
      moneda: input.moneda ?? 'CLP',
      estado: 'BORRADOR',
    };
    store.proformasContratista.unshift(row);
    for (const ingreso of ingresos) {
      ingreso.estado = 'ASOCIADO';
      ingreso.proformaId = row.id;
    }
    return row;
  },
  updateProformaContratista(
    id: string,
    input: {
      numero: string;
      contratistaId: string;
      tipoContratoId?: string;
      periodo: string;
      montoNeto?: number;
      ingresoIds?: string[];
      moneda?: string;
    },
  ) {
    const i = store.proformasContratista.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Proforma no encontrada');
    if (store.proformasContratista[i].estado !== 'BORRADOR') {
      throw new Error('Solo se puede editar una proforma en estado Borrador');
    }
    const ctr = store.contratistas.find((c) => c.id === input.contratistaId);
    store.proformasContratista[i] = {
      ...store.proformasContratista[i],
      numero: input.numero,
      contratistaId: input.contratistaId,
      contratista: ctr?.razonSocial ?? '',
      tipoContratoId: input.tipoContratoId,
      periodo: input.periodo,
      monto: input.montoNeto ?? store.proformasContratista[i].monto,
      moneda: input.moneda ?? 'CLP',
    };
    return store.proformasContratista[i];
  },
  previewProformaContratista(input: {
    contratistaId: string;
    tipoContratoId: string;
    periodo: string;
    ingresoIds: string[];
  }) {
    const ingresos = store.ingresosLaborDiario.filter((r) => input.ingresoIds.includes(r.id));
    if (!ingresos.length) throw new Error('Seleccione al menos un ingreso pendiente');
    if (ingresos.some((r) => r.estado !== 'PENDIENTE')) throw new Error('Uno o más ingresos ya no están pendientes');
    if (ingresos.some((r) => r.contratistaId !== input.contratistaId)) {
      throw new Error('Los ingresos deben ser del contratista seleccionado');
    }
    if (ingresos.some((r) => r.fecha.slice(0, 7) !== input.periodo)) {
      throw new Error('Los ingresos deben ser del período seleccionado');
    }
    if (ingresos.some((r) => r.tipoContratoId !== input.tipoContratoId)) {
      throw new Error('Los ingresos deben tener el tipo de contrato seleccionado');
    }
    const contratista = store.contratistas.find((c) => c.id === input.contratistaId);
    if (!contratista) throw new Error('Contratista no encontrado');
    return {
      empresaId: 'EMP-1', contratista, periodo: input.periodo,
      ingresoIds: input.ingresoIds, ingresos,
      montoNeto: ingresos.reduce((sum, r) => sum + r.monto, 0),
    };
  },
  reemitirProforma(id: string, input: { numeroNuevo: string; motivo: string }) {
    const original = store.proformasContratista.find((p) => p.id === id);
    if (!original || original.estado !== 'DEFINITIVA') throw new Error('Solo una Proforma Definitiva puede reemitirse');
    original.estado = 'RECHAZADA';
    const row: ProformaContratista = {
      ...original, id: nextId('PRF', store.proformasContratista),
      numero: input.numeroNuevo, estado: 'BORRADOR', facturaAsociada: undefined,
      registroCompraId: undefined,
    };
    store.proformasContratista.unshift(row);
    for (const ingreso of store.ingresosLaborDiario.filter((r) => r.proformaId === id)) {
      ingreso.proformaId = row.id;
    }
    return row;
  },
  deleteProformaContratista(id: string) {
    const p = store.proformasContratista.find((x) => x.id === id);
    if (!p) throw new Error('Proforma no encontrada');
    if (p.estado !== 'BORRADOR') {
      throw new Error('Solo se puede eliminar una proforma en Borrador');
    }
    for (const ingreso of store.ingresosLaborDiario.filter((row) => row.proformaId === id)) {
      ingreso.estado = 'PENDIENTE';
      ingreso.proformaId = undefined;
    }
    store.proformasContratista = store.proformasContratista.filter((x) => x.id !== id);
  },
  reversarProformaContratista(id: string, pinAprobacion: string) {
    const p = store.proformasContratista.find((x) => x.id === id);
    if (!p) throw new Error('Proforma no encontrada');
    if (p.estado !== 'DEFINITIVA') {
      throw new Error('Solo se puede reversar una proforma en estado Definitiva');
    }
    if (!/^\d{4}$/.test(pinAprobacion.trim())) {
      throw new Error('El PIN debe ser exactamente 4 dígitos numéricos');
    }
    let sessionId = 'U-1';
    try {
      const raw = localStorage.getItem('erp.session');
      const session = raw ? JSON.parse(raw) as { id?: string } : null;
      if (session?.id) sessionId = session.id;
    } catch { /* noop */ }
    const stored = localStorage.getItem(`erp.pinAprobacion.${sessionId}`);
    const expected = stored ?? '4821';
    if (pinAprobacion.trim() !== expected) throw new Error('PIN incorrecto');
    p.estado = 'BORRADOR';
    p.aprobadoPorId = undefined;
    p.aprobadoPorNombre = undefined;
    p.aprobadaAt = undefined;
    return { ...p };
  },
  marcarProformaDefinitiva(id: string) {
    const p = store.proformasContratista.find((x) => x.id === id);
    if (!p) throw new Error('Proforma no encontrada');
    if (p.estado !== 'BORRADOR') {
      throw new Error('Solo borrador puede pasar a definitiva');
    }
    let sessionId = 'U-1';
    try {
      const raw = localStorage.getItem('erp.session');
      const session = raw ? JSON.parse(raw) as { id?: string } : null;
      if (session?.id) sessionId = session.id;
    } catch { /* noop */ }
    p.estado = 'DEFINITIVA';
    const aprobador = store.usuarios.find((u) => u.id === sessionId);
    p.aprobadorNombre = aprobador?.nombre ?? 'Supervisor demo';
    p.aprobadorId = sessionId;
    p.aprobadoPorId = sessionId;
    p.aprobadoPorNombre = aprobador?.nombre ?? 'Supervisor demo';
    p.aprobadaAt = new Date().toISOString();
    return { ...p };
  },
  asociarFacturaProforma(
    id: string,
    input: { numero?: string; fecha: string; montoNeto?: number; proformaIds?: string[] },
  ) {
    const ids = input.proformaIds?.length ? input.proformaIds : [id];
    const rows = store.proformasContratista.filter((x) => ids.includes(x.id));
    if (!rows.length) throw new Error('Proforma no encontrada');
    for (const p of rows) {
      if (p.estado !== 'DEFINITIVA' && p.estado !== 'FACTURADA') {
        throw new Error(`La proforma ${p.numero} debe estar Definitiva`);
      }
    }
    const monto = rows.reduce((sum, row) => sum + row.monto, 0);
    const ocId = nextId('OC', store.ordenesCompra);
    const ocNumero = `OC-DEMO-${ocId.replace(/^OC-?/, '')}`;
    const oc: OrdenCompra = {
      id: ocId,
      numero: ocNumero,
      fecha: input.fecha,
      proveedor: rows[0].contratista,
      solicitante: 'Demo',
      moneda: rows[0].moneda ?? 'CLP',
      neto: monto,
      afacto: 'AFECTO',
      estado: 'PENDIENTE_APROBACION',
      departamento: 'Contratistas',
      referenciaTipo: 'PROFORMA_CONTRATISTA',
      referenciaFolio: input.numero?.trim() || rows.map((r) => r.numero).join(', '),
      lineas: rows.map((row) => ({
        descripcion: `Proforma ${row.numero}`,
        cantidad: 1,
        precioUnitario: row.monto,
        total: row.monto,
      })),
    };
    store.ordenesCompra.unshift(oc);
    for (const p of rows) {
      p.estado = 'FACTURADA';
      p.facturaAsociada = ocNumero;
      p.ordenCompraId = oc.id;
      p.ordenCompraNumero = ocNumero;
      p.registroCompraId = undefined;
      p.proformasGrupoIds = ids;
    }
    for (const ingreso of store.ingresosLaborDiario.filter((row) => row.proformaId && ids.includes(row.proformaId))) {
      ingreso.estado = 'FACTURADO';
      ingreso.facturaNumero = ocNumero;
    }
    return { ...rows[0] };
  },

  getIngresosLaborDiario: () => [...store.ingresosLaborDiario],
  createIngresoLaborDiario(input: {
    fecha: string;
    contratistaId: string;
    centroCostoId: string;
    laborId: string;
    actividadId: string;
    tipoJornada: 'JORNADA' | 'TRATO';
    cantidad: number;
    precioUnitario?: number;
    motivoOverride?: string;
  }) {
    const ctr = store.contratistas.find((c) => c.id === input.contratistaId);
    const cc = store.centrosCosto.find((c) => c.id === input.centroCostoId);
    const lab = store.labores.find((l) => l.id === input.laborId);
    const act = store.actividades.find((a) => a.id === input.actividadId);
    const tarifa = store.tarifasContratista.find((t) =>
      t.contratistaId === input.contratistaId
      && t.centroCostoId === input.centroCostoId
      && t.laborId === input.laborId
      && t.actividadId === input.actividadId
      && t.vigenciaDesde <= input.fecha
      && (!t.vigenciaHasta || t.vigenciaHasta >= input.fecha));
    if (!tarifa) throw new Error('No existe una tarifa vigente para esta combinación y fecha');
    const precioUnitario = input.precioUnitario ?? tarifa.tarifa;
    const precioOverride = Math.abs(precioUnitario - tarifa.tarifa) > 0.01;
    if (precioOverride && (input.motivoOverride?.trim().length ?? 0) < 5) {
      throw new Error('Indique el motivo del override de tarifa');
    }
    const row: IngresoLaborDiario = {
      id: nextId('ILD', store.ingresosLaborDiario),
      fecha: input.fecha,
      contratistaId: input.contratistaId,
      contratista: ctr?.razonSocial ?? '',
      centroCostoId: input.centroCostoId,
      centroCosto: cc?.nombre ?? '',
      laborId: input.laborId,
      labor: lab?.nombre ?? '',
      actividadId: input.actividadId,
      actividad: act?.nombre ?? '',
      tipoJornada: input.tipoJornada,
      cantidad: input.cantidad,
      precioUnitario,
      tarifaId: tarifa.id,
      tarifaAplicada: tarifa.tarifa,
      unidad: tarifa.unidad,
      precioOverride,
      motivoOverride: precioOverride ? input.motivoOverride : undefined,
      tipoContratoId: tarifa.tipoContratoId,
      monto: Math.round(input.cantidad * precioUnitario),
      estado: 'PENDIENTE',
    };
    store.ingresosLaborDiario.unshift(row);
    return row;
  },
  updateIngresoLaborDiario(
    id: string,
    input: {
      fecha: string;
      contratistaId: string;
      centroCostoId: string;
      laborId: string;
      actividadId: string;
      tipoJornada: 'JORNADA' | 'TRATO';
      cantidad: number;
      precioUnitario?: number;
      motivoOverride?: string;
    },
  ) {
    const i = store.ingresosLaborDiario.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Ingreso no encontrado');
    const prev = store.ingresosLaborDiario[i];
    const ctr = store.contratistas.find((c) => c.id === input.contratistaId);
    const cc = store.centrosCosto.find((c) => c.id === input.centroCostoId);
    const lab = store.labores.find((l) => l.id === input.laborId);
    const act = store.actividades.find((a) => a.id === input.actividadId);
    store.ingresosLaborDiario[i] = {
      id,
      fecha: input.fecha,
      contratistaId: input.contratistaId,
      contratista: ctr?.razonSocial ?? '',
      centroCostoId: input.centroCostoId,
      centroCosto: cc?.nombre ?? '',
      laborId: input.laborId,
      labor: lab?.nombre ?? '',
      actividadId: input.actividadId,
      actividad: act?.nombre ?? '',
      tipoJornada: input.tipoJornada,
      cantidad: input.cantidad,
      precioUnitario: input.precioUnitario ?? prev.tarifaAplicada ?? prev.precioUnitario,
      tarifaAplicada: prev.tarifaAplicada,
      tarifaId: prev.tarifaId,
      unidad: prev.unidad,
      precioOverride: input.precioUnitario != null
        && Math.abs(input.precioUnitario - (prev.tarifaAplicada ?? prev.precioUnitario)) > 0.01,
      motivoOverride: input.motivoOverride,
      tipoContratoId: prev.tipoContratoId,
      monto: Math.round(input.cantidad * (input.precioUnitario ?? prev.tarifaAplicada ?? prev.precioUnitario)),
      estado: prev.estado,
      proformaId: prev.proformaId,
      facturaNumero: prev.facturaNumero,
    };
    return store.ingresosLaborDiario[i];
  },
  deleteIngresoLaborDiario(id: string) {
    store.ingresosLaborDiario = store.ingresosLaborDiario.filter((r) => r.id !== id);
  },
  asociarIngresosAProforma(ingresoIds: string[], proformaId: string) {
    const prf = store.proformasContratista.find((p) => p.id === proformaId);
    if (!prf) throw new Error('Proforma no encontrada');
    const sum = store.ingresosLaborDiario
      .filter((r) => ingresoIds.includes(r.id))
      .reduce((a, r) => a + r.monto, 0);
    for (const r of store.ingresosLaborDiario) {
      if (!ingresoIds.includes(r.id)) continue;
      r.estado = prf.estado === 'FACTURADA' ? 'FACTURADO' : 'ASOCIADO';
      r.proformaId = proformaId;
      r.facturaNumero = prf.facturaAsociada;
    }
    return { asociados: ingresoIds.length, monto: sum, proformaId };
  },

  getCartolasBancarias: () => [...store.cartolasBancarias],
  createCartolaBancaria(input: Omit<CartolaBancaria, 'id' | 'fechaCarga' | 'estado'> & {
    estado?: CartolaBancaria['estado'];
    lineas?: Array<{
      fecha: string;
      referencia: string;
      glosa: string;
      monto: number;
      tipo: 'INGRESO' | 'EGRESO';
    }>;
  }) {
    const { lineas, ...rest } = input;
    const row: CartolaBancaria = {
      ...rest,
      id: nextId('CAR', store.cartolasBancarias),
      fechaCarga: new Date().toISOString().slice(0, 10),
      estado: input.estado ?? 'CARGADA',
      pendientesContabilizar: input.pendientesContabilizar ?? lineas?.length ?? 0,
      movimientos: input.movimientos ?? lineas?.length ?? 0,
    };
    store.cartolasBancarias.unshift(row);
    if (lineas?.length) {
      for (const l of lineas) {
        store.movimientosCartola.push({
          id: nextId('MCAR', store.movimientosCartola),
          cartolaId: row.id,
          fecha: l.fecha,
          referencia: l.referencia,
          glosa: l.glosa,
          monto: l.monto,
          tipo: l.tipo,
          estadoContable: 'PENDIENTE',
        });
      }
    }
    return row;
  },
  deleteCartolaBancaria(id: string) {
    store.cartolasBancarias = store.cartolasBancarias.filter((c) => c.id !== id);
    store.movimientosCartola = store.movimientosCartola.filter((m) => m.cartolaId !== id);
  },
  getMovimientosCartola(cartolaId: string) {
    return store.movimientosCartola.filter((m) => m.cartolaId === cartolaId);
  },
  contabilizarMovimientoCartola(
    movimientoId: string,
    input?: {
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
    const idx = store.movimientosCartola.findIndex((x) => x.id === movimientoId);
    if (idx < 0) throw new Error('Movimiento de cartola no encontrado');
    const prev = store.movimientosCartola[idx];
    if (prev.estadoContable === 'CONTABILIZADO') throw new Error('Ya está contabilizado');
    if (!input?.cuentaContraId || !input.destinoTipo || !input.codigoFinancieroId) {
      throw new Error('Indica contracuenta, destino y código financiero');
    }
    const cf = store.codigosFinancieros.find((c) => c.id === input.codigoFinancieroId);
    if (!cf?.activa) throw new Error('Código financiero no encontrado o inactivo');
    if (input.destinoTipo === 'FACTURA') {
      const look = this.lookupDocumentoCartola({
        folio: input.folioDocumento ?? '',
        tipoDocumento: input.tipoDocumento,
        sentido: prev.tipo,
      });
      if (!look.found) throw new Error(look.mensaje);
    }
    const n = 20260050 + store.movimientosCartola.filter((x) => x.estadoContable === 'CONTABILIZADO').length;
    const m: MovimientoCartola = {
      ...prev,
      estadoContable: 'CONTABILIZADO',
      asientoNumero: String(n),
      cuentaContraId: input.cuentaContraId,
      destinoTipo: input.destinoTipo,
      codigoFinancieroId: input.codigoFinancieroId,
      codigoFinanciero: `${cf.codigo} · ${cf.nombre}`,
      tipoDocumento: input.tipoDocumento,
      folioDocumento: input.folioDocumento,
      proveedorId: input.proveedorId,
      clienteId: input.clienteId,
      nominaSemana: prev.tipo === 'EGRESO' ? (input.nominaSemana || prev.nominaSemana) : undefined,
      pagoId: input.destinoTipo === 'FACTURA' || input.destinoTipo === 'ANTICIPO' ? nextId('PAG', store.pagos) : prev.pagoId,
    };
    store.movimientosCartola = store.movimientosCartola.map((x) => (x.id === movimientoId ? m : x));
    const cartolaIdx = store.cartolasBancarias.findIndex((c) => c.id === m.cartolaId);
    if (cartolaIdx >= 0) {
      const cartola = store.cartolasBancarias[cartolaIdx];
      const pend = store.movimientosCartola.filter(
        (x) => x.cartolaId === cartola.id && x.estadoContable === 'PENDIENTE',
      ).length;
      store.cartolasBancarias[cartolaIdx] = {
        ...cartola,
        pendientesContabilizar: pend,
        estado: cartola.estado === 'CARGADA' ? 'EN_CONCILIACION' : cartola.estado,
      };
    }
    return { ...m };
  },
  asociarNominaCartola(input: { ids: string[]; nominaSemana: string }) {
    const semana = input.nominaSemana.trim().toUpperCase();
    const ids = [...new Set(input.ids)];
    const rows = store.movimientosCartola.filter((m) => ids.includes(m.id));
    if (rows.length !== ids.length) throw new Error('Uno o más movimientos no existen');
    if (rows.some((r) => r.tipo !== 'EGRESO')) throw new Error('La nómina solo se asocia a egresos');
    store.movimientosCartola = store.movimientosCartola.map((m) =>
      ids.includes(m.id) ? { ...m, nominaSemana: semana } : m,
    );
    const sumaMovs = rows.reduce((a, r) => a + Math.abs(Number(r.monto)), 0);
    const aging = store.documentosAging.filter((d) => d.tipo === 'POR_PAGAR' && d.semanaCompromiso === semana);
    const sumaNomina = aging.reduce((a, r) => a + Number(r.saldo ?? r.monto), 0);
    const warning =
      sumaNomina > 0 && Math.abs(sumaMovs - sumaNomina) > 0.5
        ? `La suma de egresos (${sumaMovs}) no coincide con el total de la nómina ${semana} (${sumaNomina}). Se asoció igual.`
        : undefined;
    return { ok: true, nominaSemana: semana, asociados: ids.length, sumaMovimientos: sumaMovs, sumaNomina: sumaNomina || undefined, warning };
  },
  lookupDocumentoCartola(opts: { folio: string; tipoDocumento?: string; sentido?: string }) {
    const folio = opts.folio.trim();
    const miss = {
      found: false as const,
      mensaje: 'No se encontró el documento. Si no existe, elige Anticipo.',
    };
    if (!folio) return miss;
    const compra = store.registrosCompra.find(
      (r) => r.factura.toLowerCase() === folio.toLowerCase() && r.estado !== 'ANULADO',
    );
    const venta = store.documentos.find(
      (d) => d.folio.toLowerCase() === folio.toLowerCase(),
    );
    const sentido = (opts.sentido ?? '').toUpperCase();
    const pickCompra = () =>
      compra
        ? {
            found: true as const,
            origen: 'COMPRA' as const,
            id: compra.id,
            folio: compra.factura,
            monto: compra.monto,
            contraparte: compra.proveedorFactura,
            proveedorId: compra.proveedorId,
            moneda: (compra as { monedaCodigo?: string }).monedaCodigo || 'CLP',
            tipoCambio: (compra as { tipoCambio?: number }).tipoCambio != null ? Number((compra as { tipoCambio?: number }).tipoCambio) : null,
            montoOtraMoneda: (compra as { montoOtraMoneda?: number }).montoOtraMoneda != null ? Number((compra as { montoOtraMoneda?: number }).montoOtraMoneda) : null,
            fecha: typeof (compra as { fecha?: string }).fecha === 'string' ? (compra as { fecha?: string }).fecha?.slice(0, 10) : undefined,
            mensaje: `Factura de compra ${compra.factura} · ${compra.proveedorFactura}`,
          }
        : null;
    const pickVenta = () =>
      venta
        ? {
            found: true as const,
            origen: 'VENTA' as const,
            id: venta.id,
            folio: venta.folio,
            monto: venta.neto + (venta.iva ?? 0),
            contraparte: venta.cliente,
            clienteId: venta.clienteId,
            estado: venta.estado,
            tipoDocumento: venta.tipo,
            moneda: (venta as { monedaCodigo?: string }).monedaCodigo || 'CLP',
            tipoCambio: (venta as { tipoCambio?: number }).tipoCambio != null ? Number((venta as { tipoCambio?: number }).tipoCambio) : null,
            montoOtraMoneda: (venta as { montoOtraMoneda?: number }).montoOtraMoneda != null ? Number((venta as { montoOtraMoneda?: number }).montoOtraMoneda) : null,
            fecha: typeof venta.fecha === 'string' ? venta.fecha.slice(0, 10) : new Date(venta.fecha).toISOString().slice(0, 10),
            mensaje: `${venta.tipo} ${venta.folio} · ${venta.cliente}`,
          }
        : null;
    if (sentido === 'INGRESO') return pickVenta() ?? pickCompra() ?? miss;
    if (sentido === 'EGRESO') return pickCompra() ?? pickVenta() ?? miss;
    return pickCompra() ?? pickVenta() ?? miss;
  },

  calcularDiferenciaTc(opts: {
    monto: number;
    documentosCalce?: string;
    tcPago?: number;
    tcDocumento?: number;
    fecha?: string;
    monedaPago?: string;
    monedaFactura?: string;
    sentido?: string;
  }) {
    const tcDoc = opts.tcDocumento || 1;
    const tcPago = opts.tcPago || 1;
    const moneda = opts.monedaFactura || 'USD';
    const esVenta = (opts.sentido || '').toUpperCase() === 'COBRO' || (opts.sentido || '').toUpperCase() === 'INGRESO';
    const montoOrigenClp = Math.round(opts.monto * tcDoc);
    const montoLiquidadoClp = Math.round(opts.monto * tcPago);
    const diferenciaTc = esVenta ? montoLiquidadoClp - montoOrigenClp : montoOrigenClp - montoLiquidadoClp;
    const tipoResultado = diferenciaTc > 0 ? 'GANANCIA' as const : diferenciaTc < 0 ? 'PERDIDA' as const : 'NEUTRO' as const;
    return {
      aplica: tcDoc !== tcPago && moneda !== 'CLP',
      diferenciaTc,
      tipoResultado,
      montoOrigenClp,
      montoLiquidadoClp,
      moneda,
      tcPago,
      tcDocumento: tcDoc,
      glosa: `${tipoResultado} por Diferencia de Cambio ${moneda}`,
    };
  },

  getDocumentosAging: () => store.documentosAging.map((d) => ({ ...d })),
  syncDocumentosAging() {
    store.documentosAging = structuredClone(seed.documentosAging);
    return store.documentosAging.map((d) => ({ ...d }));
  },
  updateDocumentoAging(id: string, input: { fechaVencimiento?: string; semanaCompromiso?: string }) {
    const idx = store.documentosAging.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error('Documento aging no encontrado');
    const row = store.documentosAging[idx];
    if (input.semanaCompromiso && !input.fechaVencimiento) {
      if ((row.saldo ?? 0) <= 0) throw new Error(`No se puede aplazar un documento pagado (${row.documento})`);
      store.documentosAging[idx] = { ...row, semanaCompromiso: input.semanaCompromiso };
      return { ...store.documentosAging[idx] };
    }
    if (!input.fechaVencimiento) throw new Error('Indica fechaVencimiento o semanaCompromiso');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const venc = new Date(input.fechaVencimiento);
    venc.setHours(0, 0, 0, 0);
    const dias = Math.max(0, Math.floor((hoy.getTime() - venc.getTime()) / 86_400_000));
    store.documentosAging[idx] = {
      ...row,
      fechaVencimiento: input.fechaVencimiento,
      diasAtraso: dias,
      estado: dias > 90 ? 'CRITICO' : dias > 0 ? 'ATRASADO' : 'AL_DIA',
    };
    return { ...store.documentosAging[idx] };
  },
  aplazarDocumentosAging(input: { ids: string[]; semanaCompromiso?: string; revertir?: boolean }) {
    const ids = [...new Set(input.ids)];
    const out = [];
    for (const id of ids) {
      const idx = store.documentosAging.findIndex((d) => d.id === id);
      if (idx < 0) throw new Error('Documento aging no encontrado');
      const row = store.documentosAging[idx];
      if ((row.saldo ?? 0) <= 0) throw new Error(`No se puede aplazar un documento pagado (${row.documento})`);
      let semana = row.semanaCompromiso;
      if (input.revertir) {
        const [y, m, d] = row.fechaVencimiento.split('-').map(Number);
        const day = d ?? 1;
        const w = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : day <= 28 ? 4 : 5;
        semana = `${y}-${String(m).padStart(2, '0')}-S${w}`;
      } else if (input.semanaCompromiso) {
        semana = input.semanaCompromiso;
      }
      store.documentosAging[idx] = { ...row, semanaCompromiso: semana };
      out.push({ ...store.documentosAging[idx] });
    }
    return out;
  },

  getAnticiposProductores: () => [...store.anticiposProductores],
  createAnticipoProductor(input: Omit<AnticipoProductor, 'id' | 'saldo' | 'estado'> & { estado?: AnticipoProductor['estado'] }) {
    const calzado = input.montoCalzado ?? 0;
    const row: AnticipoProductor = {
      ...input,
      id: nextId('ANT', store.anticiposProductores),
      tipoDocto: input.tipoDocto ?? 'ANT',
      montoCalzado: calzado,
      saldo: input.monto - calzado,
      saldoUsd: input.saldoUsd ?? (input.moneda === 'USD' ? input.monto - calzado : input.montoUsd),
      estado: input.estado ?? (calzado <= 0 ? 'ABIERTO' : calzado >= input.monto ? 'CERRADO' : 'PARCIAL'),
    };
    store.anticiposProductores.unshift(row);
    return row;
  },
  updateAnticipoProductor(id: string, input: Partial<Omit<AnticipoProductor, 'id' | 'saldo'>>) {
    const row = store.anticiposProductores.find((a) => a.id === id);
    if (!row) throw new Error('Anticipo no encontrado');
    if (input.fecha !== undefined) row.fecha = input.fecha;
    if (input.productor !== undefined) row.productor = input.productor;
    if (input.rut !== undefined) row.rut = input.rut;
    if (input.banco !== undefined) row.banco = input.banco;
    if (input.formaPago !== undefined) row.formaPago = input.formaPago;
    if (input.codigoFinanciero !== undefined) row.codigoFinanciero = input.codigoFinanciero;
    if (input.tipoDocto !== undefined) row.tipoDocto = input.tipoDocto;
    if (input.nroDocto !== undefined) row.nroDocto = input.nroDocto;
    if (input.nroComprobante !== undefined) row.nroComprobante = input.nroComprobante;
    if (input.fechaVencimiento !== undefined) row.fechaVencimiento = input.fechaVencimiento;
    if (input.monto !== undefined) row.monto = input.monto;
    if (input.moneda !== undefined) row.moneda = input.moneda;
    if (input.montoUsd !== undefined) row.montoUsd = input.montoUsd;
    if (input.tc !== undefined) row.tc = input.tc;
    if (input.glosa !== undefined) row.glosa = input.glosa;
    if (input.montoCalzado !== undefined) row.montoCalzado = input.montoCalzado;
    if (input.documentosCalce !== undefined) row.documentosCalce = input.documentosCalce;
    row.saldo = row.monto - row.montoCalzado;
    row.estado = input.estado
      ?? (row.saldo <= 0 ? 'CERRADO' : row.montoCalzado > 0 ? 'PARCIAL' : 'ABIERTO');
    return { ...row };
  },

  getSyncBcMeta: () => ({ ...store.syncBcMeta }),
  updateSyncBcMeta(input: Partial<typeof store.syncBcMeta>) {
    store.syncBcMeta = { ...store.syncBcMeta, ...input };
    return { ...store.syncBcMeta };
  },
  syncIndicadoresBc() {
    const last = store.indicadoresBc[0];
    const usd = (last?.usd ?? 970) + (Math.random() * 4 - 2);
    const row: IndicadorBc = {
      id: nextId('BC', store.indicadoresBc),
      fecha: new Date().toISOString().slice(0, 10),
      usd: Math.round(usd * 10) / 10,
      eur: Math.round(((last?.eur ?? 1048) + (Math.random() * 3 - 1.5)) * 10) / 10,
      cny: Math.round(((last?.cny ?? 134) + (Math.random() * 0.6 - 0.3)) * 10) / 10,
      fuente: 'Banco Central',
      completadoFeriado: false,
      origenSync: 'manual',
      consultadoEn: new Date().toISOString(),
    };
    store.indicadoresBc.unshift(row);
    store.syncBcMeta.ultimaSync = new Date().toISOString();
    return row;
  },
  importIndicadoresBc(items: Array<{ fecha: string; usd?: number; cny?: number; eur?: number }>) {
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const it of items) {
      const fecha = String(it.fecha ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      const i = store.indicadoresBc.findIndex((r) => r.fecha === fecha);
      if (i < 0) {
        store.indicadoresBc.unshift({
          id: nextId('BC', store.indicadoresBc),
          fecha,
          usd: it.usd ?? 0,
          cny: it.cny ?? 0,
          eur: it.eur ?? 0,
          fuente: 'Excel (histórico)',
          completadoFeriado: false,
          origenSync: 'import',
          consultadoEn: new Date().toISOString(),
        });
        created += 1;
      } else {
        const prev = store.indicadoresBc[i];
        const usd = it.usd != null && it.usd > 0 ? it.usd : prev.usd;
        const cny = it.cny != null && it.cny > 0 ? it.cny : prev.cny;
        const eur = it.eur != null && it.eur > 0 ? it.eur : prev.eur;
        if (usd === prev.usd && cny === prev.cny && eur === prev.eur) {
          unchanged += 1;
          continue;
        }
        store.indicadoresBc[i] = {
          ...prev,
          usd,
          cny,
          eur,
          fuente: 'Excel (histórico)',
          origenSync: 'import',
        };
        updated += 1;
      }
    }
    return { created, updated, unchanged, total: created + updated + unchanged };
  },

  createPago(input: Omit<Pago, 'id'> & { movimientoCartolaId?: string; proveedorId?: string }) {
    const movId = input.movimientoCartolaId?.trim();
    if (movId) {
      const mov = store.movimientosCartola.find((m) => m.id === movId);
      if (!mov) throw new Error('Movimiento de cartola no encontrado');
      if (mov.pagoId) throw new Error('Este movimiento de cartola ya está calzado con un pago');
      if (store.pagos.some((p) => p.movimientoCartolaId === movId)) {
        throw new Error('Este movimiento de cartola ya está calzado con un pago');
      }
    }
    const row: Pago = {
      id: nextId('PAG', store.pagos),
      ...input,
      estado: input.estado || (movId ? 'ACTIVO' : 'PENDIENTE'),
      documentosCalce: input.documentosCalce
        || (movId ? `Cartola ${store.movimientosCartola.find((m) => m.id === movId)?.referencia ?? movId}` : undefined),
      movimientoCartolaId: movId,
    };
    store.pagos.unshift(row);
    if (row.tipo === 'ANTICIPO_PRODUCTOR' && row.tcManual != null) {
      store.pagoTcEventos.push({
        id: nextId('TCE', store.pagoTcEventos),
        pagoId: row.id,
        tcAnterior: null,
        tcNuevo: row.tcManual,
        usuarioId: 'demo',
        usuarioNombre: 'Demo',
        usuarioEmail: 'demo@almahue.local',
        createdAt: new Date().toISOString(),
      });
    }
    if (movId) {
      store.movimientosCartola = store.movimientosCartola.map((m) =>
        (m.id === movId ? { ...m, pagoId: row.id } : m),
      );
    }
    return { ...row };
  },
  updatePago(id: string, input: Omit<Pago, 'id'> & { motivo?: string }) {
    const i = store.pagos.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Pago no encontrado');
    const prev = store.pagos[i];
    if (
      Number(input.monto) !== Number(prev.monto)
      || (input.documentosCalce || '') !== (prev.documentosCalce || '')
      || (input.proveedorId || '') !== (prev.proveedorId || '')
      || (input.clienteId || '') !== (prev.clienteId || '')
    ) {
      throw new Error('No se puede editar el calce, el monto ni la contraparte. Anula y crea otro pago.');
    }
    const nextTc = input.tcManual ?? undefined;
    if (nextTc != null && nextTc !== prev.tcManual) {
      store.pagoTcEventos.push({
        id: nextId('TCE', store.pagoTcEventos),
        pagoId: id,
        tcAnterior: prev.tcManual ?? null,
        tcNuevo: nextTc,
        motivo: input.motivo,
        usuarioId: 'demo',
        usuarioNombre: 'Demo',
        usuarioEmail: 'demo@almahue.local',
        createdAt: new Date().toISOString(),
      });
    }
    store.pagos[i] = { ...prev, ...input, id, monto: prev.monto, documentosCalce: prev.documentosCalce };
    return store.pagos[i];
  },
  calzarPagoProductor(id: string, input: { documentosCalce: string; tcManual: number; motivo?: string }) {
    const i = store.pagos.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Pago no encontrado');
    const prev = store.pagos[i];
    if (prev.tipo !== 'ANTICIPO_PRODUCTOR') throw new Error('Solo se puede calzar un anticipo productor');
    const folio = input.documentosCalce.trim();
    if (!folio) throw new Error('Folio de factura requerido');
    const libre = !prev.documentosCalce?.trim() || /^cartola\b/i.test(prev.documentosCalce.trim());
    if (!libre) throw new Error('Este anticipo ya tiene calce. Anula y crea otro pago.');
    if (input.tcManual !== prev.tcManual) {
      store.pagoTcEventos.push({
        id: nextId('TCE', store.pagoTcEventos),
        pagoId: id,
        tcAnterior: prev.tcManual ?? null,
        tcNuevo: input.tcManual,
        motivo: input.motivo,
        usuarioId: 'demo',
        usuarioNombre: 'Demo',
        usuarioEmail: 'demo@almahue.local',
        createdAt: new Date().toISOString(),
      });
    }
    store.pagos[i] = { ...prev, documentosCalce: folio, tcManual: input.tcManual };
    return { ...store.pagos[i] };
  },
  getPagoTcEventos(id: string) {
    return store.pagoTcEventos.filter((e) => e.pagoId === id);
  },

  reversarDocumento(id: string) {
    const orig = store.documentos.find((d) => d.id === id);
    if (!orig) throw new Error('Documento no encontrado');
    if (orig.estado === 'ANULADO') throw new Error('Documento ya anulado');

    const asientoOrig = orig.asientoOriginal
      ?? String(470 + store.documentos.filter((d) => d.asientoOriginal).length + 1);
    const asientoRev = String(Number(asientoOrig) + 1);
    const asientoNuevo = String(Number(asientoOrig) + 2);
    const folioRev = `NC-${orig.folio.replace(/^[A-Z]+-/, '')}-REV`;

    orig.estado = 'ANULADO';
    orig.asientoOriginal = asientoOrig;
    orig.asientoReversador = asientoRev;
    orig.folioReversador = folioRev;

    const reversador: DocumentoComercial = {
      id: nextId('DOC', store.documentos),
      folio: folioRev,
      tipo: 'NC',
      cliente: orig.cliente,
      clienteId: orig.clienteId,
      fecha: new Date().toISOString().slice(0, 10),
      neto: orig.neto,
      estado: 'CONTABILIZADA',
      fromReversa: true,
      folioOrigen: orig.folio,
      asientoOriginal: asientoOrig,
      asientoReversador: asientoRev,
      asientoNuevo,
    };

    const nuevo: DocumentoComercial = {
      id: nextId('DOC', store.documentos),
      folio: `${orig.folio}-R`,
      tipo: orig.tipo,
      cliente: orig.cliente,
      clienteId: orig.clienteId,
      fecha: new Date().toISOString().slice(0, 10),
      neto: orig.neto,
      estado: 'BORRADOR',
      fromReversa: true,
      folioOrigen: orig.folio,
      asientoOriginal: asientoOrig,
      asientoReversador: asientoRev,
      asientoNuevo,
      folioReversador: folioRev,
    };

    store.documentos.unshift(nuevo, reversador);
    return { nuevo, reversador, cadena: { asientoOrig, asientoRev, asientoNuevo } };
  },
  emitirDocumentoFiscal(id: string) {
    const d = store.documentos.find((x) => x.id === id);
    if (!d) throw new Error('Documento no encontrado');
    d.estado = 'EMITIDO';
    return { ...d };
  },
  grabarDocumentoContabilizar(
    id: string,
    opts?: {
      cuentaContableId?: string;
      centroCostoId?: string;
      glosa?: string;
      cliente?: string;
      lineas?: Array<{ cuentaContableId?: string; centroCostoId?: string }>;
    },
  ) {
    const d = store.documentos.find((x) => x.id === id);
    if (!d) throw new Error('Documento no encontrado');
    d.estado = 'CONTABILIZADA';
    if (opts?.cliente) d.cliente = opts.cliente;
    if (opts?.lineas?.length && d.lineas?.length) {
      d.lineas = d.lineas.map((l, i) => ({
        ...l,
        cuentaContableId: opts.lineas?.[i]?.cuentaContableId ?? l.cuentaContableId,
        centroCostoId: opts.lineas?.[i]?.centroCostoId ?? l.centroCostoId,
      }));
    }
    if (d.fromReversa && d.asientoNuevo) {
      // asiento nuevo ya asignado en la cadena de reversa
    } else if (!d.asientoOriginal) {
      d.asientoOriginal = String(480 + store.documentos.filter((x) => x.estado === 'CONTABILIZADA').length);
    }
    return { ...d, _contab: opts };
  },

  cargaMasivaDocumentos(input: {
    items: Array<{
      folio: string;
      tipo: string;
      cliente: string;
      fecha: string;
      neto: number;
      estado?: string;
      exclude?: boolean;
    }>;
  }) {
    const folios = new Set(store.documentos.map((d) => d.folio.toLowerCase()));
    const created: typeof store.documentos = [];
    const skipped: { folio: string; reason: string }[] = [];
    for (const item of input.items) {
      if (item.exclude) {
        skipped.push({ folio: item.folio, reason: 'excluido' });
        continue;
      }
      if (folios.has(item.folio.toLowerCase())) {
        skipped.push({ folio: item.folio, reason: 'duplicado' });
        continue;
      }
      const row = {
        id: nextId('DOC', store.documentos),
        folio: item.folio,
        tipo: item.tipo as never,
        cliente: item.cliente,
        fecha: item.fecha,
        neto: item.neto,
        estado: (item.estado ?? 'BORRADOR') as never,
      };
      store.documentos.unshift(row);
      folios.add(item.folio.toLowerCase());
      created.push(row);
    }
    return { created: created.length, skipped, rows: created };
  },

  cargaMasivaRegistrosCompra(input: {
    items: Array<{
      ocNumero: string;
      factura: string;
      proveedorOc: string;
      proveedorFactura: string;
      monto: number;
      afactoOc?: string;
      afactoFactura?: string;
      exclude?: boolean;
    }>;
  }) {
    const keys = new Set(store.registrosCompra.map((r) => `${r.factura}|${r.proveedorFactura}`.toLowerCase()));
    const created: typeof store.registrosCompra = [];
    const skipped: { factura: string; reason: string }[] = [];
    for (const item of input.items) {
      if (item.exclude) {
        skipped.push({ factura: item.factura, reason: 'excluido' });
        continue;
      }
      const key = `${item.factura}|${item.proveedorFactura}`.toLowerCase();
      if (keys.has(key)) {
        skipped.push({ factura: item.factura, reason: 'duplicado' });
        continue;
      }
      const row = {
        id: nextId('RC', store.registrosCompra),
        ocNumero: item.ocNumero,
        factura: item.factura,
        proveedorOc: item.proveedorOc,
        proveedorFactura: item.proveedorFactura,
        monto: item.monto,
        afactoOc: (item.afactoOc as never) ?? 'AFECTO',
        afactoFactura: (item.afactoFactura as never) ?? 'AFECTO',
        afactoOk: true,
        estado: 'EMITIDO' as const,
      };
      store.registrosCompra.unshift(row);
      keys.add(key);
      created.push(row);
    }
    return { created: created.length, skipped, rows: created };
  },

  createOrdenCompra(input: Omit<OrdenCompra, 'id'>) {
    const estado =
      input.estado === 'EMITIDO' ? 'PENDIENTE_APROBACION' : input.estado;
    const row: OrdenCompra = { id: nextId('OC', store.ordenesCompra), ...input, estado };
    store.ordenesCompra.unshift(row);
    if (estado === 'PENDIENTE_APROBACION') {
      store.aprobacionesOc.unshift({
        id: nextId('AP', store.aprobacionesOc),
        ocId: row.id,
        ocNumero: row.numero,
        proveedor: row.proveedor,
        monto: row.neto,
        solicitante: row.solicitante,
        aprobadorId: row.aprobadorId,
        aprobadorNombre: row.aprobadorNombre,
        estado: 'PENDIENTE',
        fecha: row.fecha,
      });
    }
    return row;
  },
  updateOrdenCompra(id: string, input: Omit<OrdenCompra, 'id'>) {
    const i = store.ordenesCompra.findIndex((o) => o.id === id);
    if (i < 0) throw new Error('OC no encontrada');
    const next: OrdenCompra = { id, ...input };
    if (input.estado === 'PENDIENTE_APROBACION' || input.estado === 'BORRADOR') {
      next.motivoRechazo = undefined;
    }
    store.ordenesCompra[i] = next;
    for (const ap of store.aprobacionesOc) {
      if (ap.ocId !== id && ap.ocNumero !== input.numero) continue;
      if (ap.estado === 'PENDIENTE') {
        ap.aprobadorId = input.aprobadorId;
        ap.aprobadorNombre = input.aprobadorNombre;
        ap.monto = input.neto;
        ap.proveedor = input.proveedor;
        ap.solicitante = input.solicitante;
      }
      if (input.estado === 'APROBADO' || input.estado === 'RECHAZADO') {
        if (ap.estado === 'PENDIENTE') {
          ap.estado = input.estado === 'APROBADO' ? 'APROBADA' : 'RECHAZADA';
          if (input.estado === 'RECHAZADO' && input.motivoRechazo) {
            ap.motivoRechazo = input.motivoRechazo;
          }
        }
      }
      if (input.estado === 'PENDIENTE_APROBACION') {
        ap.motivoRechazo = undefined;
      }
    }
    return store.ordenesCompra[i];
  },
  getCierresTraspaso(periodo?: string) {
    const all = Object.values(store.cierresTraspasoDetalle);
    const p = periodo?.trim();
    return (p ? all.filter((c) => c.periodo === p) : all).sort((a, b) =>
      b.periodo.localeCompare(a.periodo),
    );
  },
  getCierreTraspaso(periodo: string) {
    const p = periodo.trim();
    return store.cierresTraspasoDetalle[`CIERRE-${p}`] ?? null;
  },
  traspasoCierre(input: {
    periodo: string;
    glosa?: string;
    tipoCambio?: number;
    monedaTc?: string;
  }) {
    const periodo = input.periodo.trim();
    if (!periodo) throw new Error('periodo es requerido');
    const key = `CIERRE-${periodo}`;
    if (store.cierresTraspaso[key] || store.cierresTraspasoDetalle[key]?.cerrado) {
      throw new Error(`El periodo ${periodo} ya fue traspasado/cerrado`);
    }
    const proformas = store.proformasContratista.filter(
      (p) => p.periodo.includes(periodo) && (p.estado === 'DEFINITIVA' || p.estado === 'FACTURADA'),
    );
    const montoTotal = proformas.reduce((a, p) => a + p.monto, 0);
    const monedaTc = input.monedaTc ?? 'USD';
    const tcSuffix = input.tipoCambio != null ? ` · TC ${input.tipoCambio} ${monedaTc}/CLP` : '';
    const glosa = (input.glosa?.trim() || `Traspaso/cierre contratistas ${periodo}`) + tcSuffix;
    let asientoId: string | undefined;
    let asientoNumero: string | undefined;
    if (montoTotal > 0) {
      const asiento = this.createAsiento({
        glosa,
        fecha: `${periodo}-28`,
        periodo,
        tipo: 'DIARIO',
        origen: `TRASPASO-CTR:${periodo}`,
        estado: 'CONTABILIZADO',
        lineas: [
          { debe: montoTotal, haber: 0, cuentaId: 'CT-6', glosa: 'Costo MO contratada' },
          { debe: 0, haber: montoTotal, cuentaId: 'CT-4', glosa: 'Facturas por recibir contratistas' },
        ],
      });
      asientoId = asiento.id;
      asientoNumero = asiento.numero;
    }
    const detalle = proformas.map((p) => ({
      id: p.id,
      numero: p.numero,
      contratista: p.contratista,
      periodo: p.periodo,
      monto: p.monto,
      moneda: p.moneda,
      estado: p.estado,
    }));
    const result: import('@/types/domain').CierreTraspasoContratista = {
      id: key,
      periodo,
      cerrado: true,
      montoTotal,
      tipoCambio: input.tipoCambio,
      monedaTc,
      asientoId,
      asientoNumero,
      proformas: proformas.length,
      proformaIds: proformas.map((p) => p.id),
      glosa,
      detalle,
      createdAt: new Date().toISOString(),
      cerradoAt: new Date().toISOString(),
      cerradoPorId: 'U-1',
      cerradoPorNombre: 'Admin Almahue',
      tiposCambio: { CLP: 1, ...(input.tipoCambio ? { [monedaTc]: input.tipoCambio } : {}) },
    };
    store.cierresTraspaso[key] = true;
    store.cierresTraspasoDetalle[key] = result;
    return result;
  },
  reabrirCierreContratista(periodo: string, motivo: string) {
    if (motivo.trim().length < 5) throw new Error('El motivo debe tener al menos 5 caracteres');
    const key = `CIERRE-${periodo}`;
    const cierre = store.cierresTraspasoDetalle[key];
    if (!cierre?.cerrado) throw new Error(`El período ${periodo} no está cerrado`);
    cierre.cerrado = false;
    cierre.asientoId = undefined;
    cierre.asientoNumero = undefined;
    cierre.proformaIds = [];
    cierre.cerradoAt = undefined;
    cierre.cerradoPorId = undefined;
    cierre.cerradoPorNombre = undefined;
    store.cierresTraspaso[key] = false;
    return { ...cierre };
  },
  getAuditoriaContratistas(filters?: { entidad?: string; entidadId?: string }) {
    return store.auditoriaContratistas.filter((row) =>
      (!filters?.entidad || row.entidad === filters.entidad.toUpperCase())
      && (!filters?.entidadId || row.entidadId === filters.entidadId));
  },
  cerrarCartolaBancaria(id: string) {
    const c = store.cartolasBancarias.find((x) => x.id === id);
    if (!c) throw new Error('Cartola no encontrada');
    if (c.estado === 'CERRADA') throw new Error('La cartola ya está cerrada');
    const movs = store.movimientosCartola.filter((m) => m.cartolaId === id);
    const pend = movs.filter((m) => m.estadoContable === 'PENDIENTE').length;
    if (pend > 0) throw new Error(`No se puede cerrar: quedan ${pend} movimiento(s) por contabilizar`);
    const sinCalce = movs.filter((m) => m.tipo === 'EGRESO' && !m.pagoId).length;
    if (sinCalce > 0) throw new Error(`No se puede cerrar: quedan ${sinCalce} egreso(s) sin calzar`);
    c.estado = 'CERRADA';
    c.pendientesContabilizar = 0;
    return { ...c };
  },
  createRegistroCompra(input: Omit<RegistroCompra, 'id'>) {
    const row: RegistroCompra = { id: nextId('RC', store.registrosCompra), ...input };
    store.registrosCompra.unshift(row);
    return row;
  },
  updateRegistroCompra(id: string, input: Partial<Omit<RegistroCompra, 'id'>>) {
    const i = store.registrosCompra.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Registro no encontrado');
    store.registrosCompra[i] = { ...store.registrosCompra[i], ...input, id };
    return store.registrosCompra[i];
  },
  anularRegistroCompra(id: string) {
    const i = store.registrosCompra.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Registro no encontrado');
    store.registrosCompra[i] = { ...store.registrosCompra[i], estado: 'ANULADO' };
    return store.registrosCompra[i];
  },
  getRegistroCompraXml(id: string) {
    const row = store.registrosCompra.find((r) => r.id === id);
    if (!row) throw new Error('Registro no encontrado');
    return { xml: buildRegistroCompraXmlDemo(row), filename: `${row.factura || row.id}.xml` };
  },
  aceptarRegistroCompraGoSocket(id: string, input?: { comentario?: string; usuarioNombre?: string }) {
    const i = store.registrosCompra.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Registro no encontrado');
    const row = store.registrosCompra[i];
    if (!row.gosocket) throw new Error('Este registro no proviene de GoSocket');
    if (row.gosocket.estado !== 'PENDIENTE') {
      throw new Error('Este documento ya no está pendiente de aceptación/rechazo');
    }
    const now = new Date().toISOString();
    const next: RegistroCompra = {
      ...row,
      gosocket: { ...row.gosocket, estado: 'ACEPTADO' },
      aceptacionEstado: 'ACEPTADA_PLAZO',
      aceptacionOrigen: 'GOSOCKET',
      aceptadaAt: now,
      aceptadaPorNombre: input?.usuarioNombre?.trim() || 'Usuario Almahue',
    };
    store.registrosCompra[i] = next;
    return next;
  },
  rechazarRegistroCompraGoSocket(id: string, input?: { comentario?: string; usuarioNombre?: string }) {
    const i = store.registrosCompra.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Registro no encontrado');
    const row = store.registrosCompra[i];
    if (!row.gosocket) throw new Error('Este registro no proviene de GoSocket');
    if (row.gosocket.estado !== 'PENDIENTE') {
      throw new Error('Este documento ya no está pendiente de aceptación/rechazo');
    }
    const now = new Date().toISOString();
    const next: RegistroCompra = {
      ...row,
      gosocket: {
        ...row.gosocket,
        estado: 'RECHAZADO',
        rechazoOrigen: 'COMERCIAL',
        rechazoMotivo: input?.comentario?.trim() || 'Reclamo registrado por el receptor',
      },
      aceptacionEstado: 'RECLAMADA',
      aceptacionOrigen: 'GOSOCKET',
      aceptadaAt: now,
      aceptadaPorNombre: input?.usuarioNombre?.trim() || 'Usuario Almahue',
    };
    store.registrosCompra[i] = next;
    return next;
  },
  syncRegistrosCompraGoSocket(input: { desde: string; hasta: string; estado?: GoSocketAceptacionEstado | 'TODOS' }) {
    const proveedoresDemo = [
      'ENVAPACK SPA', 'OMEGA EXPORT SPA', 'EMBALAJES TROYA SPA', 'PACKING BOX SPA',
      'AGROQUIMICOS DEL MAULE', 'TRANSPORTES VALLE', 'FRUTAS ZARANGO LTDA',
    ];
    const n = 2 + Math.floor(Math.random() * 2); // 2 o 3 filas nuevas
    const creados: RegistroCompra[] = [];
    let aceptados = 0;
    let pendientes = 0;
    let rechazados = 0;
    for (let k = 0; k < n; k++) {
      const prov = proveedoresDemo[Math.floor(Math.random() * proveedoresDemo.length)];
      const monto = Math.round((150000 + Math.random() * 2500000) / 100) * 100;
      const folio = String(1000 + Math.floor(Math.random() * 8999));
      let estado: GoSocketAceptacionEstado;
      if (input.estado && input.estado !== 'TODOS') {
        estado = input.estado;
      } else {
        const roll = Math.random();
        estado = roll < 0.5 ? 'PENDIENTE' : roll < 0.85 ? 'ACEPTADO' : 'RECHAZADO';
      }
      if (estado === 'ACEPTADO') aceptados++;
      else if (estado === 'RECHAZADO') rechazados++;
      else pendientes++;
      const now = new Date().toISOString();
      const row: RegistroCompra = {
        id: nextId('RC', store.registrosCompra),
        ocNumero: '—',
        factura: `SYNC-${folio}`,
        proveedorOc: prov,
        proveedorFactura: prov,
        monto,
        afactoOc: 'AFECTO',
        afactoFactura: 'AFECTO',
        afactoOk: true,
        estado: 'EMITIDO',
        aceptacionEstado: estado === 'ACEPTADO' ? 'ACEPTADA_PLAZO' : estado === 'RECHAZADO' ? 'RECLAMADA' : 'PENDIENTE',
        aceptacionOrigen: estado === 'PENDIENTE' ? undefined : 'GOSOCKET',
        aceptadaAt: estado === 'PENDIENTE' ? undefined : now,
        aceptadaPorNombre: estado === 'ACEPTADO' ? 'Sincronización GoSocket' : undefined,
        gosocket: {
          globalDocumentId: `sync-${Date.now()}-${k}-${folio}`,
          estado,
          authorityStatus: '02',
          rechazoOrigen: estado === 'RECHAZADO' ? 'COMERCIAL' : undefined,
          rechazoMotivo: estado === 'RECHAZADO' ? 'Reclamo registrado por el receptor' : undefined,
          pdfDisponible: true,
          sincronizadoAt: now,
        },
      };
      store.registrosCompra.unshift(row);
      creados.push(row);
    }
    return {
      creados,
      resumen: { total: creados.length, aceptados, pendientes, rechazados },
    };
  },
};
