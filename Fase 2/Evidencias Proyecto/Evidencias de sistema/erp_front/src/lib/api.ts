import http, { apiUrl } from '@/services/http';

export const api = http;

export type HealthResponse = {
  status: string;
  service: string;
  version: string;
  apiPrefix: string;
  db: string;
  timestamp: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

// ==========================================
// Tipos e Interfaces: Parametrización
// ==========================================

export interface Moneda {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  simbolo: string;
  codigoSerieBCCH?: string | null;
  esMonedaNacional?: boolean;
  activa: boolean;
  sincronizarBCCH?: boolean;
  focoReporteria?: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tiposCambio: number;
  };
}

export interface ItemCatalogoBCCH {
  codigo: string;
  nombre: string;
  simbolo: string;
  codigoSerieBCCH: string;
  descripcion: string;
  frecuencia: 'DIARIA' | 'MENSUAL';
}

export interface CreateMonedaPayload {
  codigo: string;
  nombre: string;
  simbolo: string;
  codigoSerieBCCH?: string;
  esMonedaNacional?: boolean;
  activa?: boolean;
  sincronizarBCCH?: boolean;
}

export interface UpdateMonedaPayload extends Partial<CreateMonedaPayload> {}

export interface TipoCambio {
  id: string;
  empresaId: string;
  monedaId: string;
  fecha: string;
  valor: number;
  fuente: string;
  origen: string;
  esFeriado: boolean;
  consultadoAt: string;
  createdAt: string;
  updatedAt: string;
  moneda?: {
    id: string;
    codigo: string;
    nombre: string;
    simbolo: string;
    codigoSerieBCCH?: string | null;
  };
}

export interface ConfiguracionSyncBC {
  id: string;
  empresaId: string;
  syncAutomatica: boolean;
  tipoProgramacion: string;
  horas: string[];
  intervaloMinutos?: number;
  soloDiasHabiles: boolean;
  ultimaSyncAt?: string | null;
  ultimoEstado?: string | null;
  ultimoError?: string | null;
}

export interface SyncResponse {
  ok: boolean;
  mensaje: string;
  desde: string;
  hasta: string;
  totalSincronizados: number;
  detalle: Array<{
    codigo: string;
    serie?: string;
    registrosGuardados?: number;
    error?: string;
  }>;
}

// ==========================================
// API Monedas
// ==========================================

export async function fetchCatalogoBCCH(): Promise<ItemCatalogoBCCH[]> {
  const { data } = await api.get<ItemCatalogoBCCH[]>('/parametrizacion/monedas/catalogo-bcch');
  return data;
}

export async function fetchMonedas(): Promise<Moneda[]> {
  const { data } = await api.get<Moneda[]>('/parametrizacion/monedas');
  return data;
}

export async function createMoneda(payload: CreateMonedaPayload): Promise<Moneda> {
  const { data } = await api.post<Moneda>('/parametrizacion/monedas', payload);
  return data;
}

export async function updateMoneda(id: string, payload: UpdateMonedaPayload): Promise<Moneda> {
  const { data } = await api.patch<Moneda>(`/parametrizacion/monedas/${id}`, payload);
  return data;
}

export async function toggleActivaMoneda(id: string): Promise<Moneda> {
  const { data } = await api.patch<Moneda>(`/parametrizacion/monedas/${id}/toggle-activa`);
  return data;
}

export async function toggleFocoMoneda(id: string): Promise<Moneda> {
  const { data } = await api.patch<Moneda>(`/parametrizacion/monedas/${id}/toggle-foco`);
  return data;
}

export async function deleteMoneda(id: string): Promise<any> {
  const { data } = await api.delete(`/parametrizacion/monedas/${id}`);
  return data;
}

// ==========================================
// API Indicadores BC
// ==========================================

export async function fetchIndicadores(params?: {
  desde?: string;
  hasta?: string;
  monedaCodigo?: string;
}): Promise<TipoCambio[]> {
  const { data } = await api.get<TipoCambio[]>('/parametrizacion/indicadores-bc', {
    params: { ...params, formato: 'detalle' },
  });
  return data;
}

export async function sincronizarIndicadores(params?: {
  desde?: string;
  hasta?: string;
}): Promise<SyncResponse> {
  const { data } = await api.post<SyncResponse>('/parametrizacion/indicadores-bc/sincronizar', params || {});
  return data;
}

export async function fetchConfigSync(): Promise<ConfiguracionSyncBC> {
  const { data } = await api.get<ConfiguracionSyncBC>('/parametrizacion/indicadores-bc/config-sync');
  return data;
}

export async function updateConfigSync(payload: Partial<ConfiguracionSyncBC>): Promise<ConfiguracionSyncBC> {
  const { data } = await api.put<ConfiguracionSyncBC>('/parametrizacion/indicadores-bc/config-sync', payload);
  return data;
}

export async function importarIndicadoresCsv(file: File): Promise<{ ok: boolean; mensaje: string; totalImportados: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/parametrizacion/indicadores-bc/importar-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export function getUrlPlantillaCsv(): string {
  return apiUrl('/parametrizacion/indicadores-bc/plantilla-csv');
}

