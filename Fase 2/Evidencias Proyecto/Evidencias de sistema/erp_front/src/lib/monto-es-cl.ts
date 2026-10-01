import { INPUT_LIMITS, isFiniteAmount } from './inputValidation.ts';

export type MontoDecimals = 0 | 2 | 4 | 6;

export type FormatMontoEsClOptions = {
  decimals?: MontoDecimals;
  padDecimals?: boolean;
};

export type ParseMontoEsClOptions = {
  decimals?: MontoDecimals;
  allowNegative?: boolean;
  maxAbs?: number;
};

export type ParseMontoEsClResult = {
  value: number | null;
  display: string;
  complete: boolean;
};

function groupThousands(intPart: string): string {
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = intPart.replace(/^-/, '').replace(/\D/g, '') || '0';
  const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + withSep;
}

/** number → "1.234.567" | "1.234,50" */
export function formatMontoEsCl(
  value: number | null | undefined,
  opts?: FormatMontoEsClOptions,
): string {
  if (value == null || !Number.isFinite(value)) return '';
  const decimals = opts?.decimals ?? 0;
  const neg = value < 0;
  const abs = Math.abs(value);
  const factor = 10 ** decimals;
  const rounded = decimals > 0 ? Math.round(abs * factor) / factor : Math.round(abs);
  const [intRaw, fracRaw] = rounded.toFixed(decimals).split('.');
  const intFmt = groupThousands(intRaw);
  const body = decimals > 0 && (opts?.padDecimals !== false || (fracRaw && Number(fracRaw) !== 0))
    ? `${intFmt},${fracRaw}`
    : intFmt;
  return neg ? `-${body}` : body;
}

/**
 * Parsea es-CL: miles `.`, decimal `,`.
 * Un único `.` sin coma se trata como miles (1.250 → 1250), no como decimal USA.
 */
export function parseMontoEsCl(raw: string, opts?: ParseMontoEsClOptions): ParseMontoEsClResult {
  const allowNegative = opts?.allowNegative ?? false;
  const maxAbs = opts?.maxAbs ?? INPUT_LIMITS.montoAbsMax;
  let s = raw.trim().replace(/\s/g, '');
  if (s === '' || s === '-' || s === ',') {
    return { value: null, display: s, complete: false };
  }
  const neg = s.startsWith('-');
  if (neg) {
    if (!allowNegative) return { value: null, display: raw, complete: false };
    s = s.slice(1);
  }
  if (!/^[0-9.,]*$/.test(s)) {
    return { value: null, display: raw, complete: false };
  }
  const comma = s.indexOf(',');
  let intPart: string;
  let fracPart = '';
  if (comma >= 0) {
    if (s.indexOf(',', comma + 1) >= 0) {
      return { value: null, display: raw, complete: false };
    }
    intPart = s.slice(0, comma).replace(/\./g, '');
    fracPart = s.slice(comma + 1).replace(/\./g, '');
    if (opts?.decimals != null && fracPart.length > opts.decimals) {
      fracPart = fracPart.slice(0, opts.decimals);
    }
  } else {
    intPart = s.replace(/\./g, '');
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || (fracPart && !/^\d*$/.test(fracPart))) {
    return { value: null, display: raw, complete: false };
  }
  const n = Number(`${neg ? '-' : ''}${intPart}.${fracPart || '0'}`);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) {
    return { value: null, display: raw, complete: false };
  }
  const trailingComma = comma >= 0 && fracPart === '';
  return {
    value: isFiniteAmount(n) ? n : null,
    display: `${neg ? '-' : ''}${groupThousands(intPart)}${comma >= 0 ? `,${fracPart}` : ''}`,
    complete: !trailingComma,
  };
}

export function formatMontoClp(n: number) {
  return formatMontoEsCl(n, { decimals: 0 });
}

export function formatPrecioEsCl(n: number) {
  return formatMontoEsCl(n, { decimals: 2, padDecimals: true });
}

export function formatTcEsCl(n: number, decimals: MontoDecimals = 4) {
  return formatMontoEsCl(n, { decimals, padDecimals: true });
}

export function kindDecimals(kind: 'monto' | 'precio' | 'tc'): MontoDecimals {
  if (kind === 'precio') return 2;
  if (kind === 'tc') return 4;
  return 0;
}

/**
 * Reubica el caret tras reagrupar miles. Cuenta signo, dígitos y coma decimal
 * (ignora puntos de miles) para que al escribir 1000 el cursor no caiga en `,00`.
 */
export function caretAfterEsClReformat(oldText: string, oldCaret: number, newText: string): number {
  const prefix = oldText.slice(0, Math.max(0, oldCaret));
  let targets = 0;
  for (const ch of prefix) {
    if (ch === '-' || ch === ',' || /\d/.test(ch)) targets += 1;
  }
  if (targets === 0) return newText.startsWith('-') && oldText.startsWith('-') ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < newText.length; i++) {
    const ch = newText[i];
    if (ch === '-' || ch === ',' || /\d/.test(ch)) {
      seen += 1;
      if (seen === targets) return i + 1;
    }
  }
  return newText.length;
}
