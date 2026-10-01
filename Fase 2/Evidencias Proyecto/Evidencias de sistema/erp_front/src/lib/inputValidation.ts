/**
 * Límites y validadores ligeros para inputs del ERP.
 * Alineados con auth/admin del back (email, MinLength 6 password) y techos defensivos.
 */

export const INPUT_LIMITS = {
  email: 254,
  password: 128,
  passwordMin: 6,
  rut: 16,
  codigo: 40,
  nombre: 120,
  texto: 255,
  glosa: 2000,
  search: 200,
  folio: 40,
  /** Tope numérico absoluto (evitar Infinity / overflow UI). */
  montoAbsMax: 1e15,
} as const;

export type InputKind =
  | 'email'
  | 'password'
  | 'rut'
  | 'codigo'
  | 'nombre'
  | 'texto'
  | 'glosa'
  | 'folio'
  | 'search';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Limpia RUT chileno (quita puntos/guión, mayúsculas). */
export function cleanRut(rut: string): string {
  return rut.replace(/\./g, '').replace(/-/g, '').replace(/\s/g, '').toUpperCase();
}

/** Formato visual 12.345.678-9 (o EX-* sin cambios). */
export function formatRutDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isForeignFiscalId(trimmed)) return trimmed.toUpperCase();
  const cleaned = cleanRut(trimmed);
  if (cleaned.length <= 1) return cleaned;
  if (!/^\d+[0-9K]?$/i.test(cleaned)) return trimmed;
  const dv = cleaned.slice(-1);
  const body = cleaned.slice(0, -1);
  if (!body) return cleaned;
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

/** Filtra caracteres al escribir un RUT chileno o EX-*. */
export function sanitizeRutInput(raw: string): string {
  const trimmed = raw.trimStart().toUpperCase();
  if (trimmed.startsWith('EX-')) {
    return trimmed.replace(/[^A-Z0-9._-]/g, '').slice(0, 40);
  }
  return raw.replace(/[^\d.\s-Kk]/g, '').toUpperCase();
}

/** Formato RUT: 7–8 dígitos + DV (0-9/K). Suficiente para límites/inyección en forms. */
export function isValidRutFormat(rut: string): boolean {
  return /^\d{7,8}[0-9K]$/.test(cleanRut(rut));
}

/** Valida dígito verificador de RUT chileno (opcional; fixtures demo pueden no cumplirlo). */
export function isValidRutChecksum(rut: string): boolean {
  const cleaned = cleanRut(rut);
  if (!isValidRutFormat(cleaned)) return false;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expected;
}

export function isForeignFiscalId(value: string): boolean {
  return /^EX-[A-Z0-9][A-Z0-9._-]{1,37}$/i.test(value.trim());
}

export type FiscalIdValidation = {
  valid: boolean;
  warning?: string;
  error?: string;
  kind: 'rut' | 'foreign' | 'demo-fixture' | 'invalid';
};

/**
 * Política de identificador fiscal:
 * - modo real: RUT chileno con checksum;
 * - exportación: admite identificadores EX-*;
 * - demo: mantiene fixtures con formato RUT y los identifica con aviso visible.
 */
export function validateFiscalId(
  value: string,
  opts: { demoMode: boolean; allowForeign?: boolean },
): FiscalIdValidation {
  const trimmed = value.trim();
  if (isForeignFiscalId(trimmed)) {
    return opts.allowForeign
      ? { valid: true, kind: 'foreign' }
      : {
          valid: false,
          kind: 'invalid',
          error: 'El identificador EX-* solo se permite para un receptor de exportación.',
        };
  }
  if (isValidRutChecksum(trimmed)) return { valid: true, kind: 'rut' };
  if (opts.demoMode && isValidRutFormat(trimmed)) {
    return {
      valid: true,
      kind: 'demo-fixture',
      warning: 'Modo demo: se permite este RUT de fixture aunque su dígito verificador no sea válido.',
    };
  }
  return {
    valid: false,
    kind: 'invalid',
    error: 'RUT inválido: revise el número y su dígito verificador.',
  };
}

/** Validación sintáctica base; la política demo/real se aplica con `validateFiscalId`. */
export function isValidRut(rut: string): boolean {
  return isValidRutFormat(rut) || isForeignFiscalId(rut);
}

export function isValidEmail(email: string): boolean {
  const t = email.trim();
  if (!t || t.length > INPUT_LIMITS.email) return false;
  return EMAIL_RE.test(t);
}

export function isValidPassword(password: string): boolean {
  return password.length >= INPUT_LIMITS.passwordMin && password.length <= INPUT_LIMITS.password;
}

export function clampString(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** maxLength HTML por tipo de input nativo cuando no se especifica otro. */
export function defaultMaxLengthForHtmlType(type: string | undefined): number | undefined {
  switch (type) {
    case 'email':
      return INPUT_LIMITS.email;
    case 'password':
      return INPUT_LIMITS.password;
    case 'number':
    case 'date':
    case 'datetime-local':
    case 'time':
    case 'month':
    case 'checkbox':
    case 'radio':
    case 'file':
    case 'hidden':
    case 'range':
    case 'color':
      return undefined;
    default:
      return INPUT_LIMITS.texto;
  }
}

export function maxLengthForKind(kind: InputKind): number {
  switch (kind) {
    case 'email':
      return INPUT_LIMITS.email;
    case 'password':
      return INPUT_LIMITS.password;
    case 'rut':
      return INPUT_LIMITS.rut;
    case 'codigo':
    case 'folio':
      return INPUT_LIMITS.codigo;
    case 'nombre':
      return INPUT_LIMITS.nombre;
    case 'glosa':
      return INPUT_LIMITS.glosa;
    case 'search':
      return INPUT_LIMITS.search;
    default:
      return INPUT_LIMITS.texto;
  }
}

/**
 * Infiere kind desde nombre/tipo de campo MockListPage (heurística segura).
 * Preferir `kind` explícito en el form cuando el nombre sea ambiguo.
 */
export function inferInputKind(
  name: string,
  type?: string,
  kind?: InputKind,
): InputKind {
  if (kind) return kind;
  if (type === 'email') return 'email';
  if (type === 'password') return 'password';
  if (type === 'textarea') return 'glosa';
  const n = name.toLowerCase();
  if (n === 'email' || n.endsWith('Email') || n.includes('correo')) return 'email';
  if (n.includes('password') || n.includes('contrasena') || n.includes('contraseña')) return 'password';
  if (n === 'rut') return 'rut';
  if (n === 'folio' || n.includes('folio')) return 'folio';
  if (
    n === 'codigo'
    || n.endsWith('Codigo')
    || n.includes('codigo')
    || n === 'simbolo'
    || n === 'nrodocto'
    || n === 'nrocomprobante'
  ) return 'codigo';
  if (
    n.includes('glosa')
    || n.includes('observ')
    || n.includes('nota')
    || n.includes('comentario')
    || n.includes('descripcion')
  ) return 'glosa';
  if (
    n.includes('nombre')
    || n.includes('razon')
    || n === 'giro'
    || n.includes('productor')
    || n.includes('cliente')
    || n.includes('vendedor')
    || n.includes('proveedor')
    || n.includes('solicitante')
    || n === 'contacto'
  ) return 'nombre';
  return 'texto';
}

export type FieldValidationError = { message: string };

/** Valida un valor de formulario según kind; `required` ya se chequea aparte. */
export function validateFieldValue(
  kind: InputKind,
  raw: string,
  opts?: { required?: boolean; minLength?: number; maxLength?: number },
): FieldValidationError | null {
  const value = raw.trim();
  if (!value) {
    if (opts?.required) return { message: 'Campo requerido' };
    return null;
  }
  const max = opts?.maxLength ?? maxLengthForKind(kind);
  if (raw.length > max) {
    return { message: `Máximo ${max} caracteres` };
  }
  const min = opts?.minLength;
  if (min != null && value.length < min) {
    return { message: `Mínimo ${min} caracteres` };
  }
  switch (kind) {
    case 'email':
      if (!isValidEmail(value)) return { message: 'Email inválido' };
      break;
    case 'password':
      if (!isValidPassword(raw)) {
        return { message: `La contraseña debe tener entre ${INPUT_LIMITS.passwordMin} y ${INPUT_LIMITS.password} caracteres` };
      }
      break;
    case 'rut':
      if (!isValidRut(value)) return { message: 'RUT inválido' };
      break;
    default:
      break;
  }
  return null;
}

export function isFiniteAmount(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= INPUT_LIMITS.montoAbsMax;
}

/** Operadores de filtro avanzado permitidos (whitelist). */
export const ALLOWED_TEXT_OPS = new Set(['contains', 'startsWith', 'equals']);
export const ALLOWED_NUMBER_OPS = new Set(['eq', 'gt', 'lt', 'between']);
export const ALLOWED_DATE_OPS = new Set(['eq', 'between']);

export function sanitizeFilterOp(dataType: string, op: string): string {
  if (dataType === 'number') return ALLOWED_NUMBER_OPS.has(op) ? op : 'eq';
  if (dataType === 'date') return ALLOWED_DATE_OPS.has(op) ? op : 'between';
  if (dataType === 'boolean' || dataType === 'select') return 'eq';
  return ALLOWED_TEXT_OPS.has(op) ? op : 'contains';
}
