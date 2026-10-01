import type { BankParser, CartolaParseResult } from './types';

function parseSimpleLines(text: string, formato: string): CartolaParseResult | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const data = lines.filter((l) => /^\d{4}-\d{2}-\d{2}[;|]/.test(l));
  if (!data.length) return null;
  const lineas = data.map((l, i) => {
    const parts = l.split(/[|;]/);
    const fecha = parts[0]?.trim() || '2026-01-01';
    const referencia = parts[1]?.trim() || `REF-${i + 1}`;
    const glosa = parts[2]?.trim() || referencia;
    const monto = Math.abs(Number(parts[3]) || 0);
    const tipoRaw = (parts[4] || 'EGRESO').toUpperCase();
    const tipo =
      tipoRaw.includes('ABONO')
      || tipoRaw.includes('INGRESO')
      || tipoRaw.includes('HABER')
        ? 'INGRESO' as const
        : 'EGRESO' as const;
    return { fecha, referencia, glosa, monto, tipo };
  });
  return {
    lineas,
    avisos: [`Parser ${formato} (fixture)`],
    formatoDetectado: formato,
  };
}

/** Heurística Banco de Chile — fixture: `YYYY-MM-DD;ref;glosa;monto;EGRESO|INGRESO`. */
export const bancoChileParser: BankParser = {
  id: 'banco-chile',
  label: 'Banco de Chile',
  detect: ({ filename, textHint }) => {
    const h = `${filename} ${textHint ?? ''}`.toLowerCase();
    return /banco\s*de\s*chile|bchile|edwards/.test(h);
  },
  parse: async ({ textHint }) => parseSimpleLines(textHint ?? '', 'banco-chile'),
};

export function mapBancoChileRows(_rows: unknown[]): CartolaParseResult {
  return { lineas: [], avisos: ['Parser Banco Chile pendiente de muestra'], formatoDetectado: 'banco-chile' };
}
