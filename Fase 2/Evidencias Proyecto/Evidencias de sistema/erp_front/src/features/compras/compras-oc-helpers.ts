import type { OrdenCompra } from '@/types/domain';
import { fmtCLP, fmtIso } from '@/lib/utils';

export type CcLine = { centroCostoId: string; monto: number };
export type ItemLine = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  centroCostoId: string;
  cuentaContableId: string;
};

export const emptyItem = (centroCostoId = '', cuentaContableId = ''): ItemLine => ({
  descripcion: '',
  cantidad: 0,
  precioUnitario: 0,
  centroCostoId,
  cuentaContableId,
});

/** Resuelve etiqueta/porcentaje de distribución CC aunque el JSON solo traiga id+monto. */
export function labelDistribucionCc(
  d: { centroCostoId: string; centroCosto?: string; monto: number; porcentaje?: number },
  centros: Array<{ id: string; codigo: string; nombre: string }>,
  neto: number,
) {
  const fromCatalog = centros.find((c) => c.id === d.centroCostoId);
  const label = (d.centroCosto && d.centroCosto.trim())
    || (fromCatalog ? `${fromCatalog.codigo} · ${fromCatalog.nombre}` : d.centroCostoId || '—');
  const pct = d.porcentaje != null && Number.isFinite(Number(d.porcentaje))
    ? Number(d.porcentaje)
    : (neto > 0 ? Math.round((Number(d.monto) / neto) * 1000) / 10 : 0);
  return { label, pct };
}

export type OcCadenaPreviewKind = 'neto' | 'sin_grupo' | 'sin_cadena' | 'no_pool' | 'ok';

export function ocCadenaPreviewCopy(kind: Exclude<OcCadenaPreviewKind, 'ok'>): {
  tone: 'muted' | 'warn';
  text: string;
} {
  if (kind === 'neto') {
    return {
      tone: 'muted',
      text: 'Complete ítems o un monto neto mayor a 0 para ver la cadena de aprobación Compras.',
    };
  }
  if (kind === 'sin_grupo') {
    return {
      tone: 'warn',
      text: 'Usted no pertenece a un grupo de aprobación Compras. Pida que lo asignen en Admin › Reglas de aprobación › Grupos Compras.',
    };
  }
  if (kind === 'sin_cadena') {
    return {
      tone: 'warn',
      text: 'No se pudo armar la cadena Compras. Revise la escala o el aprobador inicial del grupo en Admin › Reglas de aprobación › Grupos Compras.',
    };
  }
  return { tone: 'muted', text: 'Sin regla Compras para este monto' };
}

/** Estado operativo al grabar/emitir OC que entra a cadena (no «EMITIDO listo»). */
export const OC_ESTADO_EN_CADENA = 'PENDIENTE_APROBACION' as const;

export function ocCadenaBloqueaEmision(kind: OcCadenaPreviewKind | null): boolean {
  return kind === 'sin_grupo' || kind === 'sin_cadena' || kind === 'no_pool';
}

export function buildItemLineas(
  items: ItemLine[],
  centros: Array<{ id: string; codigo: string; nombre: string }> = [],
  cuentas: Array<{ id: string; codigo: string; nombre: string }> = [],
) {
  return items
    .filter((it) => it.descripcion.trim())
    .map((it) => {
      const cantidad = Number(it.cantidad) || 0;
      const precioUnitario = Number(it.precioUnitario) || 0;
      const centroCostoId = it.centroCostoId?.trim() || undefined;
      const cc = centroCostoId ? centros.find((c) => c.id === centroCostoId) : undefined;
      const cuentaContableId = it.cuentaContableId?.trim() || undefined;
      const cuenta = cuentaContableId ? cuentas.find((c) => c.id === cuentaContableId) : undefined;
      return {
        descripcion: it.descripcion.trim(),
        cantidad,
        precioUnitario,
        total: cantidad * precioUnitario,
        ...(centroCostoId ? {
          centroCostoId,
          centroCosto: cc ? `${cc.codigo} · ${cc.nombre}` : centroCostoId,
        } : {}),
        ...(cuentaContableId ? {
          cuentaContableId,
          cuentaContable: cuenta ? `${cuenta.codigo} · ${cuenta.nombre}` : cuentaContableId,
        } : {}),
      };
    });
}

/** Agrupa montos de ítems por CC (fuente de verdad para el paso 3). */
export function distribucionFromItems(
  itemLineas: Array<{ centroCostoId?: string; total: number }>,
): CcLine[] {
  const map = new Map<string, number>();
  for (const l of itemLineas) {
    const id = l.centroCostoId?.trim();
    if (!id) continue;
    map.set(id, Math.round(((map.get(id) ?? 0) + l.total) * 100) / 100);
  }
  const rows = [...map.entries()].map(([centroCostoId, monto]) => ({ centroCostoId, monto }));
  return rows.length > 0 ? rows : [{ centroCostoId: '', monto: 0 }];
}

export function itemsSinCentroCosto(items: ItemLine[]): boolean {
  return items
    .filter((it) => it.descripcion.trim())
    .some((it) => !it.centroCostoId?.trim());
}

export function itemsSinCuentaContable(items: ItemLine[]): boolean {
  return items
    .filter((it) => it.descripcion.trim())
    .some((it) => !it.cuentaContableId?.trim());
}

/** Cuenta de la línea con mayor monto. La cabecera la usa como etiqueta. */
export function cuentaPrincipalDesdeItems(items: ItemLine[]): string {
  let bestId = '';
  let best = -1;
  for (const it of items) {
    if (!it.descripcion.trim() || !it.cuentaContableId?.trim()) continue;
    const total = (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0);
    if (total > best) {
      best = total;
      bestId = it.cuentaContableId.trim();
    }
  }
  return bestId;
}

export const OC_ESTADOS_OPERAR = new Set([
  'APROBADO',
  'RECEPCIONADA',
  'CONTABILIZADA',
  'FACTURADO',
]);

/** Nadie de la cadena firmó todavía (el paso sigue en 1 y no hay APROBADA ni OMITIDA). */
export function ocTieneFirmaEnCadena(oc: {
  aprobacionPasoActual?: number;
  aprobacionCadena?: Array<{ aprobadores?: Array<{ estado?: string }> }>;
}): boolean {
  if ((oc.aprobacionPasoActual ?? 1) > 1) return true;
  return (oc.aprobacionCadena ?? []).some((paso) =>
    (paso.aprobadores ?? []).some((a) => a.estado === 'APROBADA' || a.estado === 'OMITIDA'),
  );
}

/** Borrador, rechazada, o pendiente sin ninguna firma de la cadena. */
export function ocPuedeEditar(oc: {
  estado: string;
  aprobacionPasoActual?: number;
  aprobacionCadena?: Array<{ aprobadores?: Array<{ estado?: string }> }>;
}): boolean {
  if (oc.estado === 'BORRADOR' || oc.estado === 'RECHAZADO') return true;
  if (oc.estado !== 'PENDIENTE_APROBACION' && oc.estado !== 'EMITIDO') return false;
  return !ocTieneFirmaEnCadena(oc);
}

export function ocPermiteContabilizarOPagar(estado?: string | null): boolean {
  return Boolean(estado && OC_ESTADOS_OPERAR.has(estado));
}

export function ocNoAprobada(estado?: string | null): boolean {
  return Boolean(estado) && !OC_ESTADOS_OPERAR.has(estado as string);
}

export function labelLineaCc(
  l: { centroCostoId?: string; centroCosto?: string },
  centros: Array<{ id: string; codigo: string; nombre: string }>,
) {
  if (l.centroCosto?.trim()) return l.centroCosto.trim();
  const cc = l.centroCostoId ? centros.find((c) => c.id === l.centroCostoId) : undefined;
  return cc ? `${cc.codigo} · ${cc.nombre}` : (l.centroCostoId || '—');
}

export function formFromOc(row: OrdenCompra) {
  return {
    numero: row.numero,
    fecha: row.fecha,
    proveedor: row.proveedor,
    proveedorId: row.proveedorId ?? '',
    solicitante: row.solicitante,
    aprobadorId: row.aprobadorId ?? '',
    departamento: row.departamento,
    moneda: row.moneda,
    neto: row.neto,
    afacto: row.afacto,
    cuentaContableId: row.cuentaContableId ?? '',
    centroCostoId: row.centroCostoId ?? '',
    elementoCostoId: row.elementoCostoId ?? '',
    referenciaTipo: row.referenciaTipo ?? 'COTIZACION',
    referenciaFolio: row.referenciaFolio ?? '',
    referenciaFecha: row.referenciaFecha ?? '',
    condicionPagoDias: (row.condicionPagoDias === 60 || row.condicionPagoDias === 90
      ? row.condicionPagoDias
      : 30) as 30 | 60 | 90,
  };
}

/** Nombre de sesión para el campo Solicitante (usuario logueado). */
export function ocSolicitanteDesdeSesion(
  user: { nombre?: string | null } | null | undefined,
  fallback = '',
): string {
  return user?.nombre?.trim() || fallback;
}

/** Nombre del grupo Compras para Departamento; vacío si preview no trajo grupo. */
export function ocDepartamentoDesdeGrupo(
  grupo: { id: string; nombre: string } | null | undefined,
  fallback = '',
): string {
  return grupo?.nombre?.trim() || fallback;
}

export function emptyOcForm(centroCostoId = '', solicitante = '') {
  return {
    numero: '',
    fecha: new Date().toISOString().slice(0, 10),
    proveedor: '',
    proveedorId: '',
    solicitante,
    aprobadorId: '',
    departamento: '',
    moneda: 'CLP',
    neto: 0,
    afacto: 'AFECTO' as OrdenCompra['afacto'],
    cuentaContableId: '',
    centroCostoId,
    elementoCostoId: '',
    referenciaTipo: 'COTIZACION',
    referenciaFolio: '',
    referenciaFecha: '',
    condicionPagoDias: 30 as 30 | 60 | 90,
  };
}

export type KcBcchRates = {
  tcUsdHoy?: number | null;
  tcCnyHoy?: number | null;
  tcEurHoy?: number | null;
  tcUsdHoyFecha?: string | null;
} | null | undefined;

export type OcTcSugerido = { fecha: string; valor: number };

export function ocTipoCambioSugerido(
  moneda: string,
  kpi?: KcBcchRates,
): OcTcSugerido | null {
  const m = String(moneda || 'CLP').trim().toUpperCase();
  if (m === 'CLP') return null;
  const valor = m === 'USD'
    ? Number(kpi?.tcUsdHoy)
    : m === 'EUR'
      ? Number(kpi?.tcEurHoy)
      : m === 'CNY'
        ? Number(kpi?.tcCnyHoy)
        : null;
  if (!valor || !Number.isFinite(valor) || valor <= 0) return null;
  const fecha = String(kpi?.tcUsdHoyFecha ?? '').slice(0, 10);
  return { fecha, valor };
}

export function ocEquivalenteClp(
  monto: number,
  moneda: string,
  kpi?: KcBcchRates,
): number {
  const m = String(moneda || 'CLP').trim().toUpperCase();
  const n = Number(monto) || 0;
  if (m === 'CLP') return n;
  const sug = ocTipoCambioSugerido(m, kpi);
  if (!sug || sug.valor <= 0) return n;
  return Math.round(n * sug.valor);
}

export function fmtMontoMoneda(monto: number, moneda: string): string {
  const m = String(moneda || 'CLP').trim().toUpperCase();
  if (m === 'CLP') return fmtCLP(monto);
  return fmtIso(monto, m);
}

