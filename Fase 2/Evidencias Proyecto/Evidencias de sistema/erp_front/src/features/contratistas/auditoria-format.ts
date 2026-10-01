import type { AuditoriaContratista } from '@/types/domain';

const ACCION_LABELS: Record<string, string> = {
  CERRAR: 'Cierre período',
  REABRIR: 'Reapertura',
  CREAR: 'Alta',
  ACTUALIZAR: 'Actualización',
  REVERSAR: 'Reversa',
  FACTURAR: 'Factura',
  FINALIZAR: 'Definitiva',
  OVERRIDE: 'Override tarifa',
};

export function labelAccion(accion: string): string {
  return ACCION_LABELS[accion] ?? accion.replace(/_/g, ' ');
}

export function accionTone(accion: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' {
  const a = accion.toUpperCase();
  if (a.includes('CERRAR')) return 'success';
  if (a.includes('REABRIR') || a.includes('REVERS')) return 'warning';
  if (a.includes('ELIMIN') || a.includes('FAIL')) return 'danger';
  if (a.includes('FACTUR') || a.includes('FINALIZ')) return 'info';
  return 'muted';
}

export function labelEntidad(entidad: string): string {
  const map: Record<string, string> = {
    TARIFA: 'Tarifa',
    TIPO_CONTRATO: 'Tipo contrato',
    PROFORMA: 'Proforma',
    PERIODO: 'Período',
    INGRESO: 'Ingreso',
    LABOR: 'Labor',
    ACTIVIDAD: 'Actividad',
  };
  return map[entidad] ?? entidad;
}

export function resumenMetadata(row: AuditoriaContratista): string {
  const m = row.metadata;
  if (m == null) return '—';
  if (typeof m === 'string') return m.slice(0, 120);
  if (typeof m !== 'object') return String(m);
  const o = m as Record<string, unknown>;
  const parts: string[] = [];
  if (o.periodo) parts.push(`Período ${String(o.periodo)}`);
  if (o.asientoNumero) parts.push(`Asiento ${String(o.asientoNumero)}`);
  if (o.motivo) parts.push(String(o.motivo));
  if (o.numero) parts.push(`Nº ${String(o.numero)}`);
  if (parts.length) return parts.join(' · ');
  const keys = Object.keys(o).slice(0, 3);
  if (!keys.length) return '—';
  return keys.map((k) => `${k}: ${String(o[k]).slice(0, 40)}`).join(' · ');
}

export function metadataPretty(row: AuditoriaContratista): string {
  try {
    const payload = {
      metadata: row.metadata,
      antes: row.antes,
      despues: row.despues,
    };
    return JSON.stringify(payload, null, 2);
  } catch {
    return '—';
  }
}
