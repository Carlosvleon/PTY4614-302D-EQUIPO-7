/** Mensaje de operador cuando emit()/contabilizar DTE falla cerrado (CAF, red, REJECTED). */

const ERROR_CONTABLE =
  /imputable|inactiva|periodo(?: contable)?|asiento descuadrado|cuenta contable|cuentas no existen|exige (?:centro|elemento|área)/i;

export function esErrorContablePostEmision(raw: string): boolean {
  return ERROR_CONTABLE.test(raw);
}

export function mensajeErrorEmisionDte(
  e: unknown,
  opts?: { quedoBorrador?: boolean },
): string {
  const raw = e instanceof Error ? e.message : 'No se pudo emitir el DTE';
  const cola = opts?.quedoBorrador
    ? ' El documento quedó en borrador y no se contabilizó.'
    : ' No se contabilizó el documento.';
  if (/cannot\s+(get|post|put|patch|delete)\b|status code 404|\b404\b.*\/api\//i.test(raw)) {
    return opts?.quedoBorrador
      ? 'La factura se creó, pero no se pudo enviar al facturador. Ábrala en Libro de ventas o en Emitir DTE y pulse Emitir de nuevo.'
      : 'No se pudo emitir la factura. Inténtelo de nuevo; si se repite, avise a soporte.';
  }
  if (esErrorContablePostEmision(raw)) {
    return (
      `No se pudo contabilizar el documento.${cola}\n\n${raw}\n\n`
      + 'Si el facturador ya aceptó el DTE, no se reenvía: corrija la cuenta o el periodo y pulse Emitir de nuevo.'
    );
  }
  if (/saldo pendiente|saldo disponible/i.test(raw)) {
    return `No se puede emitir esa nota de crédito.${cola}\n\n${raw}`;
  }
  return `El facturador rechazó o no pudo emitir el DTE.${cola}\n\n${raw}`;
}

export const TOAST_EMIT_DTE_OPTS = { duration: 12_000, id: 'emit-dte-error' } as const;
