import type {
  Actividad,
  CentroCosto,
  Contratista,
  Empresa,
  FlujoCajaResponse,
  Labor,
  PermisoPantalla,
  ProformaContratista,
  ProformaContratistaPreview,
  RegistroCompra,
  Rol,
  SessionUser,
  TarifaContratista,
  TipoContratoContratista,
  AuditoriaContratista,
  IngresoLaborDiario,
  UiTablePreference,
  Usuario,
  PagoTcEvento,
} from '@/types/domain';
import http from '@/services/http';
import axios from 'axios';

/** Proyecta permisos string del backend a matriz R/W si BD no trae permisosPantalla. */
const PANTALLAS_UI: { pantalla: string; mod: string; allowWrite: boolean }[] = [
  { pantalla: 'Contratistas · Listado', mod: 'contratistas', allowWrite: true },
  { pantalla: 'Contratistas · Ingreso diario', mod: 'contratistas', allowWrite: true },
  { pantalla: 'Parametrización · Contratista', mod: 'contratistas', allowWrite: true },
  { pantalla: 'Contratistas · Tarifas', mod: 'contratistas', allowWrite: true },
  { pantalla: 'Contratistas · Proformas y facturas', mod: 'contratistas', allowWrite: true },
  { pantalla: 'Contratistas · Traspaso y cierre', mod: 'contratistas', allowWrite: false },
  { pantalla: 'Contratistas · Auditoría', mod: 'contratistas', allowWrite: false },
  { pantalla: 'Compras · Órdenes', mod: 'compras', allowWrite: true },
  { pantalla: 'Tesorería · Pagos', mod: 'tesoreria', allowWrite: true },
  { pantalla: 'Tesorería · Conciliación', mod: 'tesoreria', allowWrite: false },
  { pantalla: 'Contabilidad · Asientos', mod: 'contabilidad', allowWrite: true },
  { pantalla: 'Parametrización · Monedas', mod: 'catalogos', allowWrite: false },
  { pantalla: 'Ventas · Libro de ventas', mod: 'comercial', allowWrite: true },
];

function canRead(permisos: string[], mod: string): boolean {
  if (permisos.includes('*') || permisos.includes(`${mod}:*`)) return true;
  return permisos.includes(`${mod}:read`) || permisos.includes(`${mod}:write`);
}

function canWrite(permisos: string[], mod: string): boolean {
  if (permisos.includes('*') || permisos.includes(`${mod}:*`)) return true;
  return permisos.includes(`${mod}:write`);
}

function projectPermisosPantalla(permisos: string[]): PermisoPantalla[] {
  const isAdmin = permisos.includes('*');
  return PANTALLAS_UI.map((p) => {
    const lectura = isAdmin || canRead(permisos, p.mod);
    const escritura = lectura && (isAdmin ? p.allowWrite : p.allowWrite && canWrite(permisos, p.mod));
    return { pantalla: p.pantalla, lectura, escritura };
  });
}

function mapRol(row: Rol & { permisos?: string[] }): Rol {
  const permisos = row.permisos ?? [];
  return {
    ...row,
    permisos,
    permisosPantalla: row.permisosPantalla?.length
      ? row.permisosPantalla
      : projectPermisosPantalla(permisos),
  };
}

function apiErrorMessage(err: unknown): Error & { responseData?: unknown; status?: number } {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] | Record<string, unknown>; mensaje?: string; code?: string }
      | undefined;
    const raw = data?.message;
    let msg: string;
    if (Array.isArray(raw)) msg = raw.join(', ');
    else if (raw && typeof raw === 'object' && typeof raw.message === 'string') msg = raw.message;
    else if (typeof raw === 'string') msg = raw;
    else if (typeof data?.mensaje === 'string') msg = data.mensaje;
    else msg = err.message;
    const error = new Error(msg) as Error & { responseData?: unknown; status?: number };
    error.responseData = data;
    error.status = err.response?.status;
    return error;
  }
  return err instanceof Error ? err : new Error('Error de red');
}

// ---------------- AUTH ----------------

export async function login(email: string, password: string): Promise<SessionUser> {
  try {
    const { data } = await http.post<{
      token: string;
      refreshToken: string;
      user: SessionUser;
    }>('auth/login', { email, password });
    return { ...data.user, token: data.token, refreshToken: data.refreshToken };
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function getMicrosoftAuthConfig(): Promise<{
  enabled: boolean;
  tenantId: string;
  clientId: string;
  authority: string;
}> {
  const { data } = await http.get<{
    enabled: boolean;
    tenantId: string;
    clientId: string;
    authority: string;
  }>('auth/microsoft/config');
  return data;
}

export async function loginWithMicrosoft(idToken: string): Promise<SessionUser> {
  try {
    const { data } = await http.post<{
      token: string;
      refreshToken: string;
      user: SessionUser;
    }>('auth/microsoft', { idToken });
    return { ...data.user, token: data.token, refreshToken: data.refreshToken };
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function getMe(): Promise<SessionUser> {
  const { data } = await http.get<SessionUser>('auth/me');
  return data;
}

export async function logout(): Promise<void> {
  await http.post('auth/logout');
}

export async function refreshSession(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  const { data } = await http.post<{ token: string; refreshToken: string }>('auth/refresh', { refreshToken });
  return data;
}

export async function updateProfile(data: { nombre: string }): Promise<SessionUser> {
  const { data: user } = await http.patch<SessionUser>('auth/me', data);
  return user;
}

export async function changePassword(password: string): Promise<void> {
  await http.post('auth/change-password', { password });
}

// ---------------- ADMIN ----------------

type EmpresaRow = Omit<Empresa, 'giro' | 'plantillaDoc'> & {
  giro?: string | null;
  plantillaDoc?: Empresa['plantillaDoc'];
};

function mapEmpresa(row: EmpresaRow): Empresa {
  return {
    ...row,
    giro: row.giro ?? '',
    direccion: row.direccion ?? undefined,
    comuna: row.comuna ?? undefined,
    ciudad: row.ciudad ?? undefined,
    telefono: row.telefono ?? undefined,
    emailContacto: row.emailContacto ?? undefined,
    representanteLegalNombre: row.representanteLegalNombre ?? undefined,
    representanteLegalRut: row.representanteLegalRut ?? undefined,
    representanteLegalEmail: row.representanteLegalEmail ?? undefined,
    representanteLegalTelefono: row.representanteLegalTelefono ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
    selloUrl: row.selloUrl ?? undefined,
    plantillaDoc: row.plantillaDoc ?? null,
    aceptacionCompraPlazoDias: row.aceptacionCompraPlazoDias ?? 8,
    gosocketBillerId: row.gosocketBillerId ?? null,
    gosocketNroResolucion: row.gosocketNroResolucion ?? null,
    gosocketFechaResolucion: row.gosocketFechaResolucion ?? null,
    gosocketActeco: row.gosocketActeco ?? null,
  };
}

export async function getEmpresas(): Promise<Empresa[]> {
  const { data } = await http.get<EmpresaRow[]>('empresas');
  return data.map(mapEmpresa);
}

export async function createEmpresa(input: Omit<Empresa, 'id'>): Promise<Empresa> {
  try {
    const { data } = await http.post<EmpresaRow>('empresas', input);
    return mapEmpresa(data);
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function updateEmpresa(id: string, input: Omit<Empresa, 'id'>): Promise<Empresa> {
  try {
    const { data } = await http.put<EmpresaRow>(`empresas/${id}`, input);
    return mapEmpresa(data);
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { data } = await http.get<Usuario[]>('usuarios');
  return data;
}

export async function createUsuario(input: {
  nombre: string;
  email: string;
  rolId: string;
  empresaId: string;
  empresaIds?: string[];
  activo?: boolean;
  password?: string;
  rolVigenciaDesde?: string;
  rolVigenciaHasta?: string;
}): Promise<Usuario> {
  try {
    const { data } = await http.post<Usuario>('usuarios', input);
    return { ...data, rolNombre: data.rolNombre ?? '' };
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function updateUsuario(
  id: string,
  input: {
    nombre: string;
    email: string;
    rolId: string;
    empresaId: string;
    empresaIds?: string[];
    activo?: boolean;
    password?: string;
    rolVigenciaDesde?: string;
    rolVigenciaHasta?: string;
  },
): Promise<Usuario> {
  try {
    const { data } = await http.put<Usuario>(`usuarios/${id}`, input);
    return { ...data, rolNombre: data.rolNombre ?? '' };
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function getRoles(): Promise<Rol[]> {
  const { data } = await http.get<Rol[]>('roles');
  return data.map(mapRol);
}

export async function createRol(input: {
  nombre: string;
  permisos: string[];
  permisosPantalla?: PermisoPantalla[];
  aprobarConPin?: boolean;
}): Promise<Rol> {
  try {
    const { data } = await http.post<Rol>('roles', input);
    return mapRol(data);
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function updateRol(
  id: string,
  input: {
    nombre: string;
    permisos: string[];
    permisosPantalla?: PermisoPantalla[];
    aprobarConPin?: boolean;
  },
): Promise<Rol> {
  try {
    const { data } = await http.put<Rol>(`roles/${id}`, input);
    return mapRol(data);
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

export async function deleteRol(
  id: string,
  reasignaciones: { usuarioId: string; nuevoRolId: string }[] = [],
): Promise<{ ok: boolean; id: string; reasignados: number }> {
  try {
    const { data } = await http.delete<{ ok: boolean; id: string; reasignados: number }>(`roles/${id}`, {
      data: { reasignaciones },
    });
    return data;
  } catch (err) {
    throw apiErrorMessage(err);
  }
}

// ---------------- CONTRATISTAS / TARIFAS / CC (siempre backend) ----------------

type ContratistaRow = Contratista & { vigenciaHasta?: string | null };

function mapContratista(row: ContratistaRow): Contratista {
  return {
    id: row.id,
    rut: row.rut,
    razonSocial: row.razonSocial,
    especialidad: row.especialidad,
    activo: row.activo,
    vigenciaHasta: row.vigenciaHasta ?? undefined,
    esProveedor: row.esProveedor,
  };
}

export async function getCentrosCosto(): Promise<CentroCosto[]> {
  const { data } = await http.get<
    Array<
      CentroCosto & {
        vigenciaDesde?: string | Date | null;
        vigenciaHasta?: string | Date | null;
        empresaNombre?: string;
      }
    >
  >('centros-costo');
  return data.map((r) => ({
    ...r,
    empresaNombre: r.empresaNombre,
    vigenciaDesde: r.vigenciaDesde ? String(r.vigenciaDesde).slice(0, 10) : undefined,
    vigenciaHasta: r.vigenciaHasta ? String(r.vigenciaHasta).slice(0, 10) : undefined,
  }));
}

export async function createCentroCosto(input: {
  codigo: string;
  nombre: string;
  activa?: boolean;
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  contactoEncargado?: string;
  empresaId?: string;
}): Promise<CentroCosto> {
  try {
    const { data } = await http.post<CentroCosto>('centros-costo', input);
    return {
      ...data,
      vigenciaDesde: data.vigenciaDesde ? String(data.vigenciaDesde).slice(0, 10) : undefined,
      vigenciaHasta: data.vigenciaHasta ? String(data.vigenciaHasta).slice(0, 10) : undefined,
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateCentroCosto(
  id: string,
  input: {
    codigo: string;
    nombre: string;
    activa?: boolean;
    vigenciaDesde?: string;
    vigenciaHasta?: string;
    contactoEncargado?: string;
  },
): Promise<CentroCosto> {
  try {
    const { data } = await http.put<CentroCosto>(`centros-costo/${id}`, input);
    return {
      ...data,
      vigenciaDesde: data.vigenciaDesde ? String(data.vigenciaDesde).slice(0, 10) : undefined,
      vigenciaHasta: data.vigenciaHasta ? String(data.vigenciaHasta).slice(0, 10) : undefined,
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getContratistas(): Promise<Contratista[]> {
  const { data } = await http.get<ContratistaRow[]>('contratistas');
  return data.map(mapContratista);
}

export async function getContratistaVigenciaHistorial(contratistaId: string) {
  const { data } = await http.get<
    { id: string; activo: boolean; vigenciaHasta: string | null; registradoAt: string; usuarioNombre: string }[]
  >(`contratistas/${contratistaId}/vigencia-historial`);
  return data;
}

export async function createContratista(input: {
  rut: string;
  razonSocial: string;
  especialidad?: string;
  activo?: boolean;
  vigenciaHasta?: string;
}): Promise<Contratista> {
  try {
    const { data } = await http.post<ContratistaRow>('contratistas', input);
    return mapContratista(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateContratista(
  id: string,
  input: {
    rut: string;
    razonSocial: string;
    especialidad?: string;
    activo?: boolean;
    vigenciaHasta?: string;
  },
): Promise<Contratista> {
  try {
    const { data } = await http.put<ContratistaRow>(`contratistas/${id}`, input);
    return mapContratista(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getLabores(options?: { incluirInactivas?: boolean }): Promise<Labor[]> {
  const { data } = await http.get<Labor[]>('labores', {
    params: options?.incluirInactivas ? { todas: '1' } : undefined,
  });
  return data;
}

export async function createLabor(input: Omit<Labor, 'id' | 'empresaId'>): Promise<Labor> {
  try {
    const { data } = await http.post<Labor>('labores', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateLabor(
  id: string,
  input: Omit<Labor, 'id' | 'empresaId'>,
): Promise<Labor> {
  try {
    const { data } = await http.put<Labor>(`labores/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getActividades(
  laborId?: string,
  options?: { incluirInactivas?: boolean },
): Promise<Actividad[]> {
  const params: Record<string, string> = {};
  if (laborId) params.laborId = laborId;
  if (options?.incluirInactivas) params.todas = '1';
  const { data } = await http.get<Actividad[]>('actividades', {
    params: Object.keys(params).length ? params : undefined,
  });
  return data;
}

export async function createActividad(input: Omit<Actividad, 'id' | 'empresaId'>): Promise<Actividad> {
  try {
    const { data } = await http.post<Actividad>('actividades', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateActividad(
  id: string,
  input: Omit<Actividad, 'id' | 'empresaId'>,
): Promise<Actividad> {
  try {
    const { data } = await http.put<Actividad>(`actividades/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function linkLaborActividad(laborId: string, actividadId: string): Promise<void> {
  try {
    await http.post('labor-actividad', { laborId, actividadId });
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function unlinkLaborActividad(laborId: string, actividadId: string): Promise<void> {
  try {
    await http.delete('labor-actividad', { data: { laborId, actividadId } });
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getTiposContratoContratista(): Promise<TipoContratoContratista[]> {
  const { data } = await http.get<TipoContratoContratista[]>('tipos-contrato-contratista');
  return data;
}

export async function createTipoContratoContratista(
  input: Omit<TipoContratoContratista, 'id' | 'empresaId' | 'cuentaDebe' | 'cuentaHaber' | 'cuentaAdministracion'>,
): Promise<TipoContratoContratista> {
  try {
    const { data } = await http.post<TipoContratoContratista>('tipos-contrato-contratista', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateTipoContratoContratista(
  id: string,
  input: Omit<TipoContratoContratista, 'id' | 'empresaId' | 'cuentaDebe' | 'cuentaHaber' | 'cuentaAdministracion'>,
): Promise<TipoContratoContratista> {
  try {
    const { data } = await http.put<TipoContratoContratista>(`tipos-contrato-contratista/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getTarifasContratista(contratistaId?: string): Promise<TarifaContratista[]> {
  const { data } = await http.get<TarifaContratista[]>('tarifas-contratista', {
    params: contratistaId ? { contratistaId } : undefined,
  });
  return data;
}

export async function createTarifaContratista(input: {
  contratistaId: string;
  laborId: string;
  actividadId: string;
  tarifa: number;
  unidad: string;
  centroCostoId: string;
  tipoContratoId?: string;
  vigenciaDesde: string;
  vigenciaHasta?: string;
}): Promise<TarifaContratista> {
  try {
    const { data } = await http.post<TarifaContratista>('tarifas-contratista', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateTarifaContratista(
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
): Promise<TarifaContratista> {
  try {
    const { data } = await http.put<TarifaContratista>(`tarifas-contratista/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteTarifaContratista(id: string): Promise<void> {
  try {
    await http.delete(`tarifas-contratista/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function patchTarifaContratistaInline(
  id: string,
  input: { tarifa: number; vigenciaDesde?: string },
): Promise<TarifaContratista> {
  try {
    const { data } = await http.patch<TarifaContratista>(`tarifas-contratista/${id}/inline`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- PROFORMAS CONTRATISTA (C-06) ----------------

type ProformaRow = ProformaContratista & {
  montoNeto?: number;
  facturaFecha?: string;
};

function mapProforma(row: ProformaRow): ProformaContratista {
  return {
    id: row.id,
    numero: row.numero,
    contratistaId: row.contratistaId,
    contratista: row.contratista,
    tipoContratoId: row.tipoContratoId,
    tipoContrato: row.tipoContrato,
    tipoContratoCodigo: row.tipoContratoCodigo,
    periodo: row.periodo,
    monto: row.monto ?? row.montoNeto ?? 0,
    moneda: row.moneda,
    estado: row.estado,
    facturaAsociada: row.facturaAsociada,
    ordenCompraId: row.ordenCompraId,
    ordenCompraNumero: row.ordenCompraNumero,
    registroCompraId: row.registroCompraId,
    proformasGrupoIds: row.proformasGrupoIds,
    aprobadorId: row.aprobadorId,
    aprobadorNombre: row.aprobadorNombre,
    aprobadoPorId: row.aprobadoPorId,
    aprobadoPorNombre: row.aprobadoPorNombre,
    aprobadaAt: row.aprobadaAt,
    creadoPorId: row.creadoPorId,
    creadoPorNombre: row.creadoPorNombre,
    solicitante: row.solicitante ?? row.creadoPorNombre,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProformasContratista(opts?: {
  periodo?: string;
  estado?: 'PENDIENTES' | 'FACTURADAS' | string;
}): Promise<ProformaContratista[]> {
  const { data } = await http.get<ProformaRow[]>('proformas-contratista', {
    params: {
      ...(opts?.periodo ? { periodo: opts.periodo } : {}),
      ...(opts?.estado ? { estado: opts.estado } : {}),
    },
  });
  return data.map(mapProforma);
}

export async function getSiguienteNumeroProforma(): Promise<{ numero: string }> {
  const { data } = await http.get<{ numero: string }>('proformas-contratista/siguiente-numero');
  return data;
}

export async function createProformaContratista(input: {
  numero?: string;
  contratistaId: string;
  tipoContratoId?: string;
  periodo: string;
  montoNeto?: number;
  ingresoIds?: string[];
  moneda?: string;
}): Promise<ProformaContratista> {
  try {
    const { data } = await http.post<ProformaRow>('proformas-contratista', input);
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateProformaContratista(
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
): Promise<ProformaContratista> {
  try {
    const { data } = await http.put<ProformaRow>(`proformas-contratista/${id}`, input);
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewProformaContratista(input: {
  numero?: string;
  contratistaId: string;
  tipoContratoId: string;
  periodo: string;
  moneda?: string;
  ingresoIds: string[];
  montoNeto?: number;
}): Promise<ProformaContratistaPreview> {
  try {
    const { data } = await http.post<ProformaContratistaPreview>('proformas-contratista/preview', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteProformaContratista(id: string): Promise<void> {
  try {
    await http.delete(`proformas-contratista/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function marcarProformaDefinitiva(
  id: string,
  input: { aprobadorId: string },
): Promise<ProformaContratista> {
  try {
    const { data } = await http.post<ProformaRow>(
      `proformas-contratista/${id}/definitiva`,
      input,
    );
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function aprobarProformaDefinitiva(id: string): Promise<ProformaContratista> {
  try {
    const { data } = await http.post<ProformaRow>(`proformas-contratista/${id}/aprobar`, {});
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
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
): Promise<ProformaContratista> {
  try {
    const { data } = await http.post<ProformaRow>(`proformas-contratista/${id}/factura`, input);
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function reversarProforma(id: string, claveReversa: string): Promise<ProformaContratista> {
  try {
    const { data } = await http.post<ProformaRow>(`proformas-contratista/${id}/reversar`, {
      claveReversa,
    });
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function reemitirProforma(
  id: string,
  input: { numeroNuevo: string; motivo: string },
): Promise<ProformaContratista> {
  try {
    const { data } = await http.post<ProformaRow>(`proformas-contratista/${id}/reemitir`, input);
    return mapProforma(data);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function setClaveReversa(clave: string): Promise<{ message: string; tieneClaveReversa: boolean }> {
  try {
    const { data } = await http.post<{ message: string; tieneClaveReversa: boolean }>('auth/clave-reversa', { clave });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function setPinAprobacion(pin: string, password: string): Promise<{
  message: string;
  tienePinAprobacion: boolean;
  aprobarConPin: boolean;
}> {
  try {
    const { data } = await http.post<{
      message: string;
      tienePinAprobacion: boolean;
      aprobarConPin: boolean;
    }>('auth/pin-aprobacion', { pin, password });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- UI TABLE PREFERENCES ----------------

export async function getTablePreference(tableKey: string): Promise<{
  tableKey: string;
  visibleColumns: string[] | null;
  columnOrder: string[] | null;
}> {
  const { data } = await http.get<{
    tableKey: string;
    visibleColumns: string[] | null;
    columnOrder: string[] | null;
  }>(`ui/table-preferences/${encodeURIComponent(tableKey)}`);
  return data;
}

export async function putTablePreference(
  tableKey: string,
  input: { visibleColumns: string[]; columnOrder: string[] },
): Promise<UiTablePreference> {
  try {
    const { data } = await http.put<UiTablePreference>(
      `ui/table-preferences/${encodeURIComponent(tableKey)}`,
      input,
    );
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- CATÁLOGOS / DASHBOARD ----------------

export async function getMonedas() {
  const { data } = await http.get('monedas');
  return data;
}

export async function createMoneda(input: {
  codigo: string;
  nombre: string;
  simbolo: string;
  activa?: boolean;
  focoReporteria?: boolean;
}) {
  try {
    const { data } = await http.post('monedas', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateMoneda(
  id: string,
  input: {
    codigo: string;
    nombre: string;
    simbolo: string;
    activa?: boolean;
    focoReporteria?: boolean;
  },
) {
  try {
    const { data } = await http.put(`monedas/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getUnidades() {
  const { data } = await http.get('unidades');
  return data;
}

export async function createUnidad(input: { codigo: string; nombre: string; activa?: boolean }) {
  try {
    const { data } = await http.post('unidades', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateUnidad(
  id: string,
  input: { codigo: string; nombre: string; activa?: boolean },
) {
  try {
    const { data } = await http.put(`unidades/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getTiposDocumento() {
  const { data } = await http.get('tipos-documento');
  return data;
}

export async function createTipoDocumento(input: {
  codigo: string;
  nombre: string;
  modulo: string;
  activo?: boolean;
}) {
  try {
    const { data } = await http.post('tipos-documento', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateTipoDocumento(
  id: string,
  input: { codigo: string; nombre: string; modulo: string; activo?: boolean },
) {
  try {
    const { data } = await http.put(`tipos-documento/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export type SyncBcMeta = {
  modo: 'auto' | 'manual';
  horaProgramada: string;
  horarios: string[];
  frecuenciaMinutos: number | null;
  ventanaInicio: string;
  ventanaFin: string;
  diasHabiles: boolean;
  ultimaSync: string;
  lastStatus?: string;
  lastError?: string;
  failStreak?: number;
};

export async function getSyncBcMeta() {
  try {
    const { data } = await http.get<SyncBcMeta>('sync-bc-meta');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateSyncBcMeta(input: {
  modo?: 'auto' | 'manual';
  horaProgramada?: string;
  horarios?: string[];
  frecuenciaMinutos?: number | null;
  ventanaInicio?: string;
  ventanaFin?: string;
  diasHabiles?: boolean;
}) {
  try {
    const { data } = await http.put<SyncBcMeta>('sync-bc-meta', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function syncIndicadoresBc(input?: {
  fecha?: string;
  desde?: string;
  hasta?: string;
}) {
  try {
    const { data } = await http.post<{ count: number; items: unknown[] }>('sync-indicadores-bc', input ?? {});
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getBcSeries() {
  try {
    const { data } = await http.get<
      Array<{
        codigo: string;
        nombre: string;
        unidad: string;
        valorActual: number | null;
        mapeoErp: 'USD' | 'EUR' | 'CNY' | null;
        seleccionable: boolean;
      }>
    >('bc/series');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getIndicadoresBc(params?: { desde?: string; hasta?: string }) {
  try {
    const { data } = await http.get('indicadores-bc', { params });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewIndicadoresBcExcel(file: File) {
  return postCatalogExcel<{
    ok: boolean;
    total: number;
    duplicados: number;
    existingCount: number;
    nuevos: number;
    sinCambios: number;
    items: Array<{
      codigo: string;
      fecha: string;
      usd?: number;
      cny?: number;
      eur?: number;
      accion: 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';
      cambios: string[];
    }>;
    duplicateCodigos: string[];
    ignoredHeaders: string[];
    skippedInFile: string[];
  }>('indicadores-bc/import-excel/preview', file);
}

export async function importIndicadoresBcExcel(
  items: Array<{ fecha: string; usd?: number; cny?: number; eur?: number }>,
  meta?: { archivoNombre?: string },
) {
  try {
    const { data } = await http.post<{
      created: number;
      updated: number;
      unchanged: number;
      total: number;
    }>('indicadores-bc/import-excel', {
      items,
      archivoNombre: meta?.archivoNombre,
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getDashboardKPIs() {
  const { data } = await http.get('dashboard/kpis');
  return data;
}

export type NotificacionInboxItem = {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  monto?: number | null;
  href: string;
  fecha: string | null;
  leida: boolean;
  refKey?: string;
  createdAt?: string;
};

export async function getNotificacionesPendientes() {
  const { data } = await http.get<{
    total: number;
    totalItems?: number;
    items: NotificacionInboxItem[];
  }>('dashboard/notificaciones');
  return data;
}

export async function setNotificacionLeida(id: string, leida: boolean) {
  const { data } = await http.patch<{ id: string; leida: boolean }>(
    `dashboard/notificaciones/${encodeURIComponent(id)}`,
    { leida },
  );
  return data;
}

export async function marcarTodasNotificacionesLeidas() {
  const { data } = await http.post<{ ok: boolean }>('dashboard/notificaciones/marcar-todas-leidas');
  return data;
}

export async function getTendenciaMensual() {
  const { data } = await http.get('dashboard/tendencia');
  return data;
}

// ---------------- CONTRATISTAS · INGRESO DIARIO ----------------

export async function getIngresosLaborDiario(): Promise<IngresoLaborDiario[]> {
  const { data } = await http.get<IngresoLaborDiario[]>('ingresos-labor-diario');
  return data;
}

export async function createIngresoLaborDiario(input: {
  fecha: string;
  contratistaId: string;
  centroCostoId: string;
  laborId: string;
  actividadId: string;
  tipoJornada: 'JORNADA' | 'TRATO';
  cantidad: number;
  precioUnitario?: number;
  motivoOverride?: string;
  tipoContratoId?: string;
  aprobadorId?: string;
}): Promise<IngresoLaborDiario> {
  try {
    const { data } = await http.post('ingresos-labor-diario', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateIngresoLaborDiario(
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
    tipoContratoId?: string;
    aprobadorId?: string;
  },
): Promise<IngresoLaborDiario> {
  try {
    const { data } = await http.put(`ingresos-labor-diario/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function aprobarIngresoLaborDiario(id: string): Promise<IngresoLaborDiario> {
  try {
    const { data } = await http.post(`ingresos-labor-diario/${id}/aprobar`, {});
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteIngresoLaborDiario(id: string) {
  try {
    await http.delete(`ingresos-labor-diario/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function asociarIngresosAProforma(ingresoIds: string[], proformaId: string) {
  try {
    const { data } = await http.post('ingresos-labor-diario/asociar', { ingresoIds, proformaId });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- COMPRAS ----------------

export async function getOrdenesCompra() {
  const { data } = await http.get('ordenes-compra');
  return data;
}

export async function previewCadenaOc(input: { monto: number; moneda?: string }) {
  try {
    const { data } = await http.post('ordenes-compra/preview-cadena', {
      monto: input.monto,
      ...(input.moneda ? { moneda: input.moneda } : {}),
    });
    return data as import('@/types/domain').SimulacionAprobacionResult;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function createOrdenCompra(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('ordenes-compra', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateOrdenCompra(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`ordenes-compra/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCierresTraspaso(periodo?: string) {
  try {
    const { data } = await http.get('contratistas/traspaso-cierre', {
      params: periodo ? { periodo } : undefined,
    });
    return data as import('@/types/domain').CierreTraspasoContratista[];
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCierreTraspaso(periodo: string) {
  try {
    const { data } = await http.get(
      `contratistas/traspaso-cierre/${encodeURIComponent(periodo.trim())}`,
    );
    return data as import('@/types/domain').CierreTraspasoContratista | null;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function traspasoCierre(input: {
  periodo: string;
  glosa?: string;
  tipoCambio?: number;
  monedaTc?: string;
}) {
  try {
    const { data } = await http.post('contratistas/traspaso-cierre', input);
    return data as import('@/types/domain').CierreTraspasoContratista;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function reabrirCierreContratista(periodo: string, motivo: string) {
  try {
    const { data } = await http.post<import('@/types/domain').CierreTraspasoContratista>(
      `contratistas/traspaso-cierre/${encodeURIComponent(periodo.trim())}/reabrir`,
      { motivo },
    );
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getAuditoriaContratistas(filters?: {
  entidad?: string;
  entidadId?: string;
}): Promise<AuditoriaContratista[]> {
  const { data } = await http.get<AuditoriaContratista[]>('contratistas/auditoria', {
    params: filters,
  });
  return data;
}

export async function getAprobacionesOc() {
  const { data } = await http.get('aprobaciones-oc');
  return data;
}

export async function getRecepcionesOc() {
  const { data } = await http.get('recepciones-oc');
  return data;
}

export async function createRecepcionOc(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('recepciones-oc', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateRecepcionOc(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.patch(`recepciones-oc/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getRegistrosCompra(): Promise<RegistroCompra[]> {
  const { data } = await http.get<RegistroCompra[]>('registros-compra');
  return data.map(mapRegistroCompra);
}

function mapRegistroCompra(row: RegistroCompra): RegistroCompra {
  return {
    ...row,
    ocEstado: row.ocEstado,
    ocNoAprobada: Boolean(row.ocNoAprobada),
    aceptacionEstado: row.aceptacionEstado ?? 'PENDIENTE',
    aceptadaAt: row.aceptadaAt ?? undefined,
    aceptacionOrigen: row.aceptacionOrigen ?? undefined,
  };
}

export async function createRegistroCompra(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('registros-compra', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateRegistroCompra(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`registros-compra/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function anularRegistroCompra(id: string) {
  try {
    const { data } = await http.post(`registros-compra/${id}/anular`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

/**
 * GoSocket (Libro de compras) — Fase 2: backend real vía billing-gateway.
 * El endpoint devuelve el XML como texto plano; se envuelve en `{xml, filename}`
 * para mantener el mismo contrato que `mock/demo-store.ts` (usado por el modal).
 */
export async function getRegistroCompraXml(id: string): Promise<{ xml: string; filename: string }> {
  try {
    const { data } = await http.get<string>(`registros-compra/${id}/dte/xml`, {
      transformResponse: (res) => res,
    });
    return { xml: typeof data === 'string' ? data : String(data ?? ''), filename: `${id}.xml` };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

/** PDF real de un documento recibido (GoSocket vía billing-gateway). */
export async function fetchRegistroCompraPdf(id: string): Promise<{ blob: Blob; filename: string }> {
  try {
    const res = await http.get(`registros-compra/${id}/dte/pdf`, { responseType: 'blob' });
    const cd = String(res.headers['content-disposition'] ?? '');
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(cd);
    const filename = match?.[1]
      ? decodeURIComponent(match[1])
      : `${id}.pdf`;
    return { blob: res.data as Blob, filename };
  } catch (e) {
    if (axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 409)) {
      const fromBody = await blobErrorMessage(e);
      throw new Error(fromBody || 'PDF aún no disponible en GoSocket; reintente');
    }
    throw apiErrorMessage(e);
  }
}

/** Acuse de Recibo + Aceptación (GoSocket 30→33). Puede tardar varios minutos (sin cortar el request). */
export async function aceptarRegistroCompraGoSocket(
  id: string,
  input?: { comentario?: string },
) {
  try {
    const { data } = await http.post(
      `registros-compra/${id}/aceptar`,
      { comentario: input?.comentario },
      { timeout: 0 },
    );
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

/** Acuse de Recibo + Reclamo (GoSocket 30→31). Puede tardar varios minutos (sin cortar el request). */
export async function rechazarRegistroCompraGoSocket(
  id: string,
  input?: { comentario?: string },
) {
  try {
    const { data } = await http.post(
      `registros-compra/${id}/rechazar`,
      { comentario: input?.comentario },
      { timeout: 0 },
    );
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

/**
 * Sincroniza el inbox de GoSocket (GetDocument por ReceiverCode) para un periodo.
 * `estado` (tab activo del front) es solo un filtro de UI en modo demo; el backend
 * real no filtra por estado (GoSocket no soporta ese filtro en GetDocument).
 */
export async function syncRegistrosCompraGoSocket(
  input: { desde: string; hasta: string; estado?: string },
) {
  try {
    const { data } = await http.post<{
      creados: number;
      actualizados: number;
      sinCambios: number;
      rows: Array<{ gosocket?: { estado?: 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO' } }>;
    }>('registros-compra/sync', { desde: input.desde, hasta: input.hasta });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const countByEstado = (estado: 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO') =>
      rows.filter((r) => r.gosocket?.estado === estado).length;
    return {
      ...data,
      resumen: {
        total: rows.length,
        aceptados: countByEstado('ACEPTADO'),
        pendientes: countByEstado('PENDIENTE'),
        rechazados: countByEstado('RECHAZADO'),
      },
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- INSUMOS ----------------

export async function getInsumos() {
  const { data } = await http.get('insumos');
  return data;
}

export async function getInsumoStockBodegas(id: string) {
  try {
    const { data } = await http.get(`insumos/${id}/stock-bodegas`);
    return data as {
      insumoId: string;
      codigo: string;
      nombre: string;
      costoPromedio: number;
      stockTotal: number;
      bodegas: {
        bodegaId: string;
        codigo: string;
        nombre: string;
        cantidad: number;
        reservado?: number;
        disponible?: number;
      }[];
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getStockPorBodega(bodegaId: string) {
  try {
    const { data } = await http.get(`bodegas/${bodegaId}/stock`);
    return data as {
      bodegaId: string;
      codigo: string;
      nombre: string;
      productos: {
        insumoId: string;
        codigo: string;
        nombre: string;
        unidad: string;
        inventariable: boolean;
        cantidad: number;
        reservado: number;
        disponible: number;
      }[];
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function liberarReservaStock(id: string) {
  try {
    const { data } = await http.post(`reservas-stock/${id}/liberar`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function createInsumo(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('insumos', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateInsumo(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`insumos/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getBodegas() {
  const { data } = await http.get('bodegas');
  return data;
}

export async function updateBodega(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`bodegas/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateMovimientoBodega(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`movimientos-bodega/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function createBodega(input: {
  codigo: string;
  nombre: string;
  activa?: boolean;
  empresaId?: string;
}) {
  try {
    const { data } = await http.post('bodegas', {
      codigo: input.codigo,
      nombre: input.nombre,
      activa: input.activa,
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getMovimientosBodega() {
  const { data } = await http.get('movimientos-bodega');
  return data;
}

export async function createMovimientoBodega(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('movimientos-bodega', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- CONTABILIDAD ----------------

export async function getCuentas() {
  const { data } = await http.get('cuentas');
  return data;
}

export async function createCuenta(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('cuentas', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateCuenta(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.patch(`cuentas/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteCuenta(id: string) {
  try {
    const { data } = await http.delete(`cuentas/${id}`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deletePlanCuentas() {
  try {
    const { data } = await http.delete('cuentas');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCuentaImpacto(id: string) {
  const { data } = await http.get<{
    asientos: number;
    asientosBorrador: number;
    asientosContabilizados: number;
    asientoEjemplos: { numero: string; estado: string }[];
    hijos: number;
    configsSii: number;
    ordenesCompra: number;
    documentos: number;
    insumos: number;
    vinculos: number;
  }>(`cuentas/${id}/impacto`);
  return data;
}

export async function getAreasNegocio() {
  const { data } = await http.get('areas-negocio');
  return data;
}

export async function createAreaNegocio(input: { codigo: string; nombre: string; activa?: boolean }) {
  try {
    const { data } = await http.post('areas-negocio', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateAreaNegocio(id: string, input: { codigo: string; nombre: string; activa?: boolean }) {
  try {
    const { data } = await http.patch(`areas-negocio/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getConceptosFlujo() {
  const { data } = await http.get('conceptos-flujo');
  return data;
}

export async function createConceptoFlujo(input: {
  codigo: string;
  nombre: string;
  orden?: number;
  activo?: boolean;
}) {
  try {
    const { data } = await http.post('conceptos-flujo', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateConceptoFlujo(
  id: string,
  input: { codigo: string; nombre: string; orden?: number; activo?: boolean },
) {
  try {
    const { data } = await http.put(`conceptos-flujo/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCodigosFinancieros() {
  const { data } = await http.get('codigos-financieros');
  return data;
}

export async function createCodigoFinanciero(input: {
  codigo: string;
  nombre: string;
  activa?: boolean;
  conceptoId?: string | null;
}) {
  try {
    const { data } = await http.post('codigos-financieros', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateCodigoFinanciero(id: string, input: {
  codigo: string;
  nombre: string;
  activa?: boolean;
  conceptoId?: string | null;
}) {
  try {
    const { data } = await http.put(`codigos-financieros/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function bulkCuentas(input: {
  items: Record<string, unknown>[];
  replace?: boolean;
  actualizarAnidacion?: boolean;
  aplicarFlags?: boolean;
  vinculos?: 'conservar' | 'quitar_si_flag_off' | 'arrastrar_padre' | 'desde_excel';
  archivoNombre?: string;
}) {
  try {
    const { data } = await http.post('cuentas/bulk', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function createCategoriaCuenta(input: {
  digito: number;
  nombre: string;
  tipo?: string;
}) {
  try {
    const { data } = await http.post('cuentas/categoria', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getAsientos() {
  const { data } = await http.get('asientos');
  return data;
}

export async function getPeriodosContables() {
  const { data } = await http.get('periodos-contables');
  return data;
}

export async function createPeriodoContable(input: {
  codigo: string;
  activo?: boolean;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  try {
    const { data } = await http.post('periodos-contables', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updatePeriodoContable(
  id: string,
  input: { estado?: string; activo?: boolean; fechaDesde?: string; fechaHasta?: string },
) {
  try {
    const { data } = await http.patch(`periodos-contables/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function abrirPeriodoContable(id: string, input?: { motivo?: string }) {
  try {
    const { data } = await http.post(`periodos-contables/${id}/abrir`, input ?? {});
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function cerrarPeriodoContable(id: string) {
  try {
    const { data } = await http.post(`periodos-contables/${id}/cerrar`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getPeriodoContableEventos(id: string) {
  try {
    const { data } = await http.get(`periodos-contables/${id}/eventos`);
    return data as Array<{
      id: string;
      periodoId: string;
      accion: string;
      estadoAntes?: string;
      estadoDespues: string;
      motivo?: string;
      usuarioId?: string;
      usuarioNombre?: string;
      createdAt: string;
    }>;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getConfigContableSii() {
  const { data } = await http.get('config-contable-sii');
  return data;
}

export async function putConfigContableSii(input: {
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
  try {
    const { data } = await http.put('config-contable-sii', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewCentralizacion(input: {
  periodo: string;
  origenes?: string[];
  tipoCambio?: number;
  monedaTc?: string;
}) {
  try {
    const { data } = await http.post('centralizacion/preview', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function ejecutarCentralizacion(input: {
  periodo: string;
  origenes?: string[];
  tipoCambio?: number;
  monedaTc?: string;
}) {
  try {
    const { data } = await http.post('centralizacion/ejecutar', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getLibroDiario(periodo: string) {
  try {
    const { data } = await http.get('libro-diario', { params: { periodo } });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getBalance8Columnas(periodo: string) {
  try {
    const { data } = await http.get('balance-8-columnas', { params: { periodo } });
    return data as {
      periodo: string;
      filas: Array<{
        cuentaId?: string;
        codigo: string;
        nombre: string;
        sumasDebe: number;
        sumasHaber: number;
        saldoDeudor: number;
        saldoAcreedor: number;
        inventarioDeudor: number;
        inventarioAcreedor: number;
        resultadoDeudor: number;
        resultadoAcreedor: number;
      }>;
      totales: {
        sumasDebe: number;
        sumasHaber: number;
        saldoDeudor: number;
        saldoAcreedor: number;
        inventarioDeudor: number;
        inventarioAcreedor: number;
        resultadoDeudor: number;
        resultadoAcreedor: number;
      };
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getMayor(periodo: string, cuentaId?: string) {
  try {
    const { data } = await http.get('mayor', {
      params: { periodo, ...(cuentaId ? { cuentaId } : {}) },
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getProveedores() {
  const { data } = await http.get('proveedores');
  return data;
}

export type ContrapartePorRut = {
  rut: string;
  proveedor: {
    id: string;
    rut: string;
    razonSocial: string;
    giro?: string | null;
    email?: string | null;
    telefono?: string | null;
    activo: boolean;
    direccion?: string | null;
    comuna?: string | null;
    ciudad?: string | null;
  } | null;
  contratista: {
    id: string;
    rut: string;
    razonSocial: string;
    email?: string | null;
    telefono?: string | null;
    direccion?: string | null;
    comuna?: string | null;
    ciudad?: string | null;
    activo: boolean;
    proveedorId?: string | null;
  } | null;
};

export async function buscarContrapartePorRut(rut: string) {
  try {
    const { data } = await http.get('contraparte-por-rut', { params: { rut } });
    return data as ContrapartePorRut;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getProveedor(id: string) {
  const { data } = await http.get(`proveedores/${id}`);
  return data;
}

export async function createProveedor(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('proveedores', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateProveedor(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`proveedores/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

type AsientoLineaInput = {
  debe: number;
  haber: number;
  cuentaId?: string;
  glosa?: string;
  centroCostoId?: string;
  moneda?: string;
  tipoCambio?: number;
};

export async function createAsiento(input: {
  glosa: string;
  fecha?: string;
  periodo?: string;
  tipo?: string;
  estado?: string;
  numero?: string;
  debe?: number;
  haber?: number;
  origen?: string;
  lineas?: AsientoLineaInput[];
}) {
  try {
    const lineas = input.lineas ?? [
      { debe: Number(input.debe ?? 0), haber: 0 },
      { debe: 0, haber: Number(input.haber ?? 0) },
    ];
    const { data } = await http.post('asientos', {
      glosa: input.glosa,
      fecha: input.fecha,
      periodo: input.periodo,
      tipo: input.tipo,
      estado: input.estado,
      numero: input.numero,
      origen: input.origen ?? 'Manual',
      lineas,
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateAsiento(
  id: string,
  input: {
    glosa: string;
    fecha?: string;
    periodo?: string;
    tipo?: string;
    estado?: string;
    numero?: string;
    origen?: string;
    lineas: AsientoLineaInput[];
  },
) {
  try {
    const { data } = await http.patch(`asientos/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function bulkAsientos(input: {
  items: {
    glosa: string;
    fecha?: string;
    periodo?: string;
    tipo?: string;
    estado?: string;
    numero?: string;
    origen?: string;
    lineas: AsientoLineaInput[];
  }[];
}) {
  try {
    const { data } = await http.post('asientos/bulk', input);
    return data as {
      created: number;
      errors: { index: number; message: string }[];
      items: { id: string; numero: string }[];
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewPlanCuentasExcel(file: File, aplicarArrastre = false) {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const q = aplicarArrastre ? '?aplicarArrastre=true' : '';
    const { data } = await http.post(`cuentas/import-excel/preview${q}`, fd);
    return data as {
      ok: boolean;
      total: number;
      duplicados: number;
      existingCount: number;
      nuevos?: number;
      sinCambios?: number;
      items: Record<string, unknown>[];
      duplicateCodigos: string[];
      ignoredHeaders?: string[];
      hasDimensionCodes?: boolean;
      centrosCount?: number;
      elementosCount?: number;
      areasCount?: number;
      avisoMaestros?: string | null;
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function importPlanCuentasExcel(file: File, replace = false) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('replace', replace ? 'true' : 'false');
  try {
    const { data } = await http.post('cuentas/import-excel', fd);
    return data as { ok: boolean; created: number; updated: number; total: number };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

async function postCatalogExcel<T>(path: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await http.post(path, fd);
    return data as T;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewCentrosCostoExcel(file: File) {
  return postCatalogExcel<{
    ok: boolean;
    total: number;
    duplicados: number;
    existingCount: number;
    nuevos: number;
    sinCambios: number;
    items: Array<{
      codigo: string;
      nombre: string;
      contactoEncargado?: string | null;
      activa?: boolean;
      vigenciaDesde?: string | null;
      accion: 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';
      cambios: string[];
    }>;
    duplicateCodigos: string[];
    ignoredHeaders: string[];
    skippedInFile: string[];
  }>('centros-costo/import-excel/preview', file);
}

export async function importCentrosCostoExcel(
  items: Array<{
    codigo: string;
    nombre: string;
    contactoEncargado?: string | null;
    activa?: boolean;
    vigenciaDesde?: string | null;
  }>,
  meta?: { archivoNombre?: string },
) {
  try {
    const { data } = await http.post('centros-costo/import-excel', {
      items,
      archivoNombre: meta?.archivoNombre,
    });
    return data as { ok: boolean; created: number; updated: number; unchanged?: number; total: number };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewElementosCostoExcel(file: File) {
  return postCatalogExcel<{
    ok: boolean;
    total: number;
    duplicados: number;
    existingCount: number;
    nuevos: number;
    sinCambios: number;
    items: Array<{
      codigo: string;
      nombre: string;
      departamento?: string;
      vigencia?: string;
      accion: 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';
      cambios: string[];
    }>;
    duplicateCodigos: string[];
    ignoredHeaders: string[];
    skippedInFile: string[];
  }>('elementos-costo/import-excel/preview', file);
}

export async function importElementosCostoExcel(
  items: Array<{ codigo: string; nombre: string; departamento?: string; vigencia?: string }>,
  meta?: { archivoNombre?: string },
) {
  try {
    const { data } = await http.post('elementos-costo/import-excel', {
      items,
      archivoNombre: meta?.archivoNombre,
    });
    return data as { ok: boolean; created: number; updated: number; unchanged?: number; total: number };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewCodigosFinancierosExcel(file: File) {
  return postCatalogExcel<{
    ok: boolean;
    total: number;
    duplicados: number;
    existingCount: number;
    nuevos: number;
    sinCambios: number;
    items: Array<{
      codigo: string;
      nombre: string;
      activa?: boolean;
      accion: 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';
      cambios: string[];
    }>;
    duplicateCodigos: string[];
    ignoredHeaders: string[];
    skippedInFile: string[];
  }>('codigos-financieros/import-excel/preview', file);
}

export async function importCodigosFinancierosExcel(
  items: Array<{ codigo: string; nombre: string; activa?: boolean }>,
  meta?: { archivoNombre?: string },
) {
  try {
    const { data } = await http.post('codigos-financieros/import-excel', {
      items,
      archivoNombre: meta?.archivoNombre,
    });
    return data as { ok: boolean; created: number; updated: number; unchanged?: number; total: number };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCatalogoImportaciones(tipo?: string) {
  try {
    const { data } = await http.get('catalogo-importaciones', { params: tipo ? { tipo } : {} });
    return data as Array<{
      id: string;
      tipo: string;
      archivoNombre?: string | null;
      created: number;
      updated: number;
      unchanged: number;
      politicas?: unknown;
      resumen?: Array<{ codigo: string; cambios: string[] }>;
      usuarioEmail?: string | null;
      usuarioNombre?: string | null;
      createdAt: string;
    }>;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getElementosCosto() {
  const { data } = await http.get('elementos-costo');
  return data;
}

export async function createElementoCosto(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('elementos-costo', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateElementoCosto(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`elementos-costo/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getFactoresHonorario() {
  const { data } = await http.get('factores-honorario');
  return data;
}

export async function createFactorHonorario(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('factores-honorario', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateFactorHonorario(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`factores-honorario/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getReportesContables() {
  const { data } = await http.get('reportes-contables');
  return data;
}

export async function getPresupuestos() {
  const { data } = await http.get('presupuestos');
  return data;
}

export async function createPresupuesto(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('presupuestos', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updatePresupuesto(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`presupuestos/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deletePresupuesto(id: string) {
  try {
    await http.delete(`presupuestos/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- TESORERÍA ----------------

export async function getMovimientosCaja() {
  try {
    const { data } = await http.get('movimientos-caja');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getFlujoCaja(params?: { moneda?: string; periodo?: string }) {
  try {
    const { data } = await http.get<FlujoCajaResponse>('flujo-caja', { params });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getSaldosBancos() {
  try {
    const { data } = await http.get<{
      saldos: Array<{ banco: string; moneda: string; ingreso: number; egreso: number; saldo: number }>;
    }>('saldos-bancos');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function createMovimientoCaja(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('movimientos-caja', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function corregirApertura(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.post(`movimientos-caja/${id}/corregir-apertura`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateMovimientoCaja(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`movimientos-caja/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteMovimientoCaja(id: string) {
  try {
    await http.delete(`movimientos-caja/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getPagos() {
  const { data } = await http.get('pagos');
  return data;
}

export async function createPago(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('pagos', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updatePago(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`pagos/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function calzarPagoProductor(
  id: string,
  input: { documentosCalce: string; tcManual: number; motivo?: string },
) {
  try {
    const { data } = await http.post(`pagos/${id}/calzar-productor`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getPagoTcEventos(id: string) {
  try {
    const { data } = await http.get(`pagos/${id}/tc-eventos`);
    return data as PagoTcEvento[];
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getConciliaciones() {
  const { data } = await http.get('conciliaciones');
  return data;
}

export async function createConciliacion(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('conciliaciones', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getMovimientosConciliacion(conciliacionId: string) {
  const { data } = await http.get(`conciliaciones/${conciliacionId}/movimientos`);
  return data;
}

export async function desconciliarMovimiento(movimientoId: string) {
  try {
    const { data } = await http.post(`movimientos-conciliacion/${movimientoId}/desconciliar`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCartolasBancarias() {
  const { data } = await http.get('cartolas-bancarias');
  return data;
}

export async function createCartolaBancaria(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('cartolas-bancarias', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteCartolaBancaria(id: string) {
  try {
    await http.delete(`cartolas-bancarias/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function cerrarCartolaBancaria(id: string) {
  try {
    const { data } = await http.post(`cartolas-bancarias/${id}/cerrar`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getMovimientosCartola(cartolaId: string) {
  const { data } = await http.get(`cartolas-bancarias/${cartolaId}/movimientos`);
  return data;
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
  try {
    const { data } = await http.post(`movimientos-cartola/${movimientoId}/contabilizar`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function asociarNominaCartola(input: { ids: string[]; nominaSemana: string }) {
  try {
    const { data } = await http.post('movimientos-cartola/asociar-nomina', input);
    return data as {
      ok: boolean;
      nominaSemana: string;
      asociados: number;
      sumaMovimientos: number;
      sumaNomina?: number;
      warning?: string;
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function lookupDocumentoCartola(opts: {
  folio: string;
  tipoDocumento?: string;
  sentido?: string;
}) {
  try {
    const { data } = await http.get('movimientos-cartola/lookup-documento', { params: opts });
    return data as {
      found: boolean;
      mensaje: string;
      origen?: 'COMPRA' | 'VENTA';
      id?: string;
      folio?: string;
      monto?: number;
      contraparte?: string;
      proveedorId?: string;
      clienteId?: string;
      estado?: string;
      moneda?: string;
      tipoCambio?: number | null;
      montoOtraMoneda?: number | null;
      fecha?: string;
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function calcularDiferenciaTc(body: {
  monto: number;
  documentosCalce?: string;
  tcPago?: number;
  tcDocumento?: number;
  fecha?: string;
  monedaPago?: string;
  monedaFactura?: string;
  sentido?: string;
}) {
  try {
    const { data } = await http.post('pagos/calcular-diferencia-tc', body);
    return data as {
      aplica: boolean;
      diferenciaTc: number;
      tipoResultado: 'GANANCIA' | 'PERDIDA' | 'NEUTRO';
      montoOrigenClp: number;
      montoLiquidadoClp: number;
      moneda: string;
      tcPago: number;
      tcDocumento: number;
      glosa: string;
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewCartolaArchivo(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await http.post('cartolas-bancarias/preview-archivo', fd);
    return data as {
      archivoNombre: string;
      formatoDetectado: string;
      bancoDetectado?: string;
      movimientos: number;
      montoTotal: number;
      lineas: Array<{
        fecha: string;
        referencia: string;
        glosa: string;
        monto: number;
        tipo: 'INGRESO' | 'EGRESO';
        hoja?: string;
      }>;
      avisos: string[];
      hojas?: Array<{ nombre: string; movimientos: number }>;
      suggestedPeriodo?: string;
      suggestedMesContable?: string;
      formatoEsperado: string;
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function importCartolaArchivo(
  file: File,
  meta: {
    banco: string;
    periodo: string;
    mesContable?: string;
    bancoCodigo?: string;
    hojas?: string[];
    moneda?: string;
  },
) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('banco', meta.banco);
  fd.append('periodo', meta.periodo);
  if (meta.mesContable) fd.append('mesContable', meta.mesContable);
  if (meta.bancoCodigo) fd.append('bancoCodigo', meta.bancoCodigo);
  if (meta.hojas?.length) fd.append('hojas', meta.hojas.join(','));
  if (meta.moneda) fd.append('moneda', meta.moneda);
  try {
    const { data } = await http.post('cartolas-bancarias/import-archivo', fd, { timeout: 120_000 });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getDocumentosAging() {
  try {
    const { data } = await http.get('documentos-aging');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function syncDocumentosAging() {
  try {
    const { data } = await http.post('documentos-aging/sync');
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateDocumentoAging(id: string, input: { fechaVencimiento?: string; semanaCompromiso?: string }) {
  try {
    const { data } = await http.patch(`documentos-aging/${encodeURIComponent(id)}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function aplazarDocumentosAging(input: {
  ids: string[];
  semanaCompromiso?: string;
  revertir?: boolean;
}) {
  try {
    const { data } = await http.post('documentos-aging/aplazar-lote', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getAnticiposProductores() {
  const { data } = await http.get('anticipos-productores');
  return data;
}

export async function createAnticipoProductor(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('anticipos-productores', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateAnticipoProductor(
  id: string,
  input: Record<string, unknown>,
) {
  try {
    const { data } = await http.put(`anticipos-productores/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ---------------- COMERCIAL ----------------

export async function getClientes() {
  const { data } = await http.get('clientes');
  return data;
}

export async function getCliente(id: string) {
  const { data } = await http.get(`clientes/${id}`);
  return data;
}

export async function createCliente(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('clientes', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateCliente(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`clientes/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getProspectos() {
  const { data } = await http.get('prospectos');
  return data;
}

export async function createProspecto(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('prospectos', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateProspecto(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`prospectos/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getDocumentos(params?: {
  mias?: boolean;
  tipo?: string;
  estado?: string;
}) {
  const { data } = await http.get('documentos', {
    params: {
      ...(params?.mias ? { mias: '1' } : {}),
      ...(params?.tipo ? { tipo: params.tipo } : {}),
      ...(params?.estado ? { estado: params.estado } : {}),
    },
  });
  return data;
}

export async function getDocumentosBorradores(usuarioId?: string) {
  const { data } = await http.get('documentos-borradores', {
    params: usuarioId ? { usuarioId } : undefined,
  });
  return data;
}

export async function getDocumento(id: string) {
  try {
    const { data } = await http.get(`documentos/${id}`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

async function blobErrorMessage(err: unknown): Promise<string | undefined> {
  if (!axios.isAxiosError(err)) return undefined;
  const data = err.response?.data;
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      const json = JSON.parse(text) as { message?: string | string[] };
      if (typeof json.message === 'string') return json.message;
      if (Array.isArray(json.message)) return json.message.join(', ');
    } catch {
      return text.slice(0, 200) || undefined;
    }
  }
  return undefined;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * PDF/XML del facturador (GoSocket vía billing-gateway) sin disparar la
 * descarga: el visor necesita el blob en memoria para previsualizarlo.
 */
export async function fetchDocumentoDteBlob(id: string, kind: 'pdf' | 'xml') {
  try {
    const res = await http.get(`documentos/${id}/dte/${kind}`, { responseType: 'blob' });
    const dummy = String(res.headers['x-billing-artifact-dummy'] ?? '').toLowerCase() === 'true';
    const cd = String(res.headers['content-disposition'] ?? '');
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(cd);
    const filename = match?.[1]
      ? decodeURIComponent(match[1])
      : `dte-${id}.${kind}`;
    return { blob: res.data as Blob, filename, dummy };
  } catch (e) {
    if (axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 409)) {
      const fromBody = await blobErrorMessage(e);
      const error = new Error(
        fromBody || `${kind.toUpperCase()} aún no disponible en el facturador; reintente`,
      ) as Error & { status?: number; code?: string };
      error.status = e.response?.status;
      error.code = 'DTE_ARTIFACT_NOT_READY';
      throw error;
    }
    throw apiErrorMessage(e);
  }
}

/** PDF/XML del facturador (GoSocket vía billing-gateway). No es el print HTML local. */
export async function downloadDocumentoDte(id: string, kind: 'pdf' | 'xml') {
  const { blob, filename, dummy } = await fetchDocumentoDteBlob(id, kind);
  triggerBlobDownload(blob, filename);
  return { dummy };
}

export async function syncDocumentoDte(id: string) {
  try {
    const { data } = await http.post(`documentos/${id}/dte/sync`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function createDocumento(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('documentos', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateDocumento(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`documentos/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateDocumentoImputacion(
  id: string,
  input: { cuentaContableId: string; centroCostoId?: string },
) {
  try {
    const { data } = await http.patch(`documentos/${id}/imputacion`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function anularDocumento(id: string) {
  try {
    const { data } = await http.post(`documentos/${id}/anular`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function eliminarDocumentoBorrador(id: string) {
  try {
    const { data } = await http.delete(`documentos/${id}/borrador`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function confirmarOrdenVenta(id: string) {
  try {
    const { data } = await http.post(`documentos/${id}/confirmar`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function lookupRut(rut: string) {
  try {
    const { data } = await http.get('lookup-rut', { params: { rut } });
    return data as {
      rut: string;
      sociedad: { tipo: string; id: string; rut: string; razonSocial: string; giro?: string | null } | null;
      clientes: {
        tipo: string;
        id: string;
        rut: string;
        razonSocial: string;
        giro?: string | null;
        direccion?: string | null;
        comuna?: string | null;
        ciudad?: string | null;
      }[];
      proveedores: { tipo: string; id: string; rut: string; razonSocial: string; giro?: string | null }[];
    };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function convertirDocumento(
  id: string,
  input: { tipoDestino: string; folioNuevo?: string },
) {
  try {
    const { data } = await http.post(`documentos/${id}/convertir`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getWorkflows() {
  const { data } = await http.get('workflows');
  return data;
}

export async function getWorkflowsAdmin() {
  const { data } = await http.get('workflows-admin');
  return data;
}

export async function createWorkflowAdmin(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('workflows-admin', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateWorkflowAdmin(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`workflows-admin/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteWorkflowAdmin(id: string) {
  try {
    const { data } = await http.delete(`workflows-admin/${id}`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getDelegacionesAprobacion() {
  const { data } = await http.get('delegaciones-aprobacion');
  return data;
}

export async function createDelegacionAprobacion(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('delegaciones-aprobacion', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateDelegacionAprobacion(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`delegaciones-aprobacion/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteDelegacionAprobacion(id: string) {
  try {
    const { data } = await http.delete(`delegaciones-aprobacion/${id}`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getGruposAprobacion() {
  const { data } = await http.get('grupos-aprobacion');
  return data;
}

export async function createGrupoAprobacion(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('grupos-aprobacion', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateGrupoAprobacion(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`grupos-aprobacion/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteGrupoAprobacion(id: string) {
  try {
    const { data } = await http.delete(`grupos-aprobacion/${id}`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getEscalasAprobacion() {
  const { data } = await http.get('escalas-aprobacion');
  return data;
}

export async function createNodoEscalaAprobacion(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('escalas-aprobacion', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateNodoEscalaAprobacion(id: string, input: Record<string, unknown>) {
  try {
    const { data } = await http.put(`escalas-aprobacion/${id}`, input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteNodoEscalaAprobacion(
  id: string,
  opts?: { confirmarReasignacion?: boolean; nuevoAprobadorId?: string | null },
) {
  try {
    const { data } = await http.delete(`escalas-aprobacion/${id}`, {
      data: opts ?? {},
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export type PendienteImpactoItem = {
  id: string;
  tipo: 'OC' | 'PROFORMA';
  documentoId: string;
  identificador: string;
  solicitante: string;
  monto: number;
  detalle?: string | null;
};

export type PendientesImpactoPreview = {
  nodoId?: string;
  usuarioId: string;
  count: number;
  items: PendienteImpactoItem[];
  sugeridoAprobadorId: string | null;
};

export async function previewPendientesNodoEscala(id: string) {
  try {
    const { data } = await http.get(`escalas-aprobacion/${id}/pendientes-impacto`);
    return data as PendientesImpactoPreview;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function previewPendientesAprobador(usuarioId: string) {
  try {
    const { data } = await http.get('aprobaciones/pendientes-aprobador', {
      params: { usuarioId },
    });
    return data as PendientesImpactoPreview;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function simularAprobacion(input: Record<string, unknown>) {
  try {
    const { data } = await http.post('aprobaciones/simular', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function validarBandejaAprobadores(input: {
  modulo: string;
  usuarioIds: string[];
  mode?: 'read' | 'write';
}) {
  try {
    const { data } = await http.post('aprobaciones/validar-bandeja', input);
    return data as { ok: boolean; invalidos: import('@/lib/bandejaAprobacion').AprobadorSinBandejaItem[] };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ─── AdminConcepto ───────────────────────────────────────────────────────────

export async function getAdministradoresConcepto() {
  const { data } = await http.get('administradores-concepto');
  return data as import('@/types/domain').AdminConcepto[];
}

export async function createAdminConcepto(input: { usuarioId: string; modulo: string; activo?: boolean }) {
  try {
    const { data } = await http.post('administradores-concepto', input);
    return data as import('@/types/domain').AdminConcepto;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function updateAdminConcepto(id: string, input: { modulo?: string; activo?: boolean }) {
  try {
    const { data } = await http.put(`administradores-concepto/${id}`, input);
    return data as import('@/types/domain').AdminConcepto;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function deleteAdminConcepto(id: string) {
  try {
    await http.delete(`administradores-concepto/${id}`);
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

// ─── Export / Import de configuración de aprobaciones ───────────────────────

export async function exportAprobacionesConfig(modulo?: string) {
  const { data } = await http.get('aprobaciones-config/export', {
    params: { modulo: modulo || 'empresa' },
  });
  return data as Record<string, unknown>;
}

export async function previewAprobacionesConfig(config: Record<string, unknown>) {
  try {
    const { data } = await http.post('aprobaciones-config/preview', config);
    return data as import('@/types/domain').AprobacionesBackupPreview;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function importAprobacionesConfig(config: Record<string, unknown>) {
  try {
    const { data } = await http.post('aprobaciones-config/import', config);
    return data as { ok: boolean; mensaje: string };
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getLibroComercial(ambito: 'ventas' | 'compras' | 'despachos' = 'ventas') {
  const { data } = await http.get('libro-comercial', { params: { ambito } });
  return data;
}

export async function getGuiasDespacho() {
  const { data } = await http.get('guias-despacho');
  return data;
}

export async function createGuiaDespacho(input: {
  folio: string;
  cliente: string;
  fecha: string;
  monto?: number;
  estado?: string;
  documentoComercialId?: string;
  glosa?: string;
}) {
  try {
    const { data } = await http.post('guias-despacho', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCuentasCorrientes(opts?: {
  terceroTipo?: string;
  q?: string;
  soloConSaldo?: boolean;
  periodo?: string;
}) {
  try {
    const { data } = await http.get('cuentas-corrientes', {
      params: {
        terceroTipo: opts?.terceroTipo,
        q: opts?.q,
        soloConSaldo: opts?.soloConSaldo ? '1' : undefined,
        periodo: opts?.periodo,
      },
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getEstadoCuentaPorRut(
  rut: string,
  opts?: { filtro?: 'PENDIENTE' | 'HISTORICO' | 'TODOS'; periodo?: string },
) {
  try {
    const { data } = await http.get('cuentas-corrientes/por-rut', {
      params: { rut, filtro: opts?.filtro ?? 'TODOS', periodo: opts?.periodo },
    });
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function getCuentaCorrienteMovimientos(
  terceroId: string,
  opts?: { terceroTipo?: string },
) {
  const { data } = await http.get(`cuentas-corrientes/${encodeURIComponent(terceroId)}/movimientos`, {
    params: { terceroTipo: opts?.terceroTipo },
  });
  return data;
}

export async function createCuentaCorrienteAjuste(input: {
  terceroTipo: string;
  terceroId: string;
  terceroNombre: string;
  fecha: string;
  debe?: number;
  haber?: number;
  glosa?: string;
  documentoRef?: string;
}) {
  try {
    const { data } = await http.post('cuentas-corrientes/ajuste', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function reversarDocumento(id: string) {
  try {
    const { data } = await http.post(`documentos/${id}/reversar`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function emitirDocumentoFiscal(id: string) {
  try {
    const { data } = await http.post(`documentos/${id}/dte/emit`);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function grabarDocumentoContabilizar(
  id: string,
  opts?: {
    cuentaContableId?: string;
    centroCostoId?: string;
    glosa?: string;
    cliente?: string;
    lineas?: Array<{
      descripcion?: string;
      cantidad?: number;
      precioUnitario?: number;
      descuentoPct?: number;
      total?: number;
      cuentaContableId?: string;
      centroCostoId?: string;
      tipoLinea?: string;
      insumoId?: string;
      bodegaId?: string;
      codigoProducto?: string;
      unidadMedida?: string;
    }>;
  },
) {
  try {
    const { data } = await http.post(`documentos/${id}/contabilizar`, opts ?? {});
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function cargaMasivaDocumentos(input: {
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
  try {
    const { data } = await http.post<{
      created: number;
      skipped: { folio: string; reason: string }[];
      rows: unknown[];
    }>('documentos/carga-masiva', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}

export async function cargaMasivaRegistrosCompra(input: {
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
  try {
    const { data } = await http.post<{
      created: number;
      skipped: { factura: string; reason: string }[];
      rows: unknown[];
    }>('registros-compra/carga-masiva', input);
    return data;
  } catch (e) {
    throw apiErrorMessage(e);
  }
}
