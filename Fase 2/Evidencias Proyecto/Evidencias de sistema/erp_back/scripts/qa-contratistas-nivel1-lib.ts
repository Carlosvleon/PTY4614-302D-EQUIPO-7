import 'dotenv/config';

export const BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
export const EMP1 = 'EMP-1';
export const EMP2 = 'EMP-2';
export const PERIODO_QA = process.env.QA_CONTRATISTAS_PERIODO ?? '2026-09';
/** Override opcional del período usado solo en traspaso/cierre (debe existir en contabilidad y ≠ PERIODO_QA). */
export const PERIODO_CIERRE_ENV = process.env.QA_PERIODO_CIERRE?.trim() || '';
export const PIN = process.env.QA_PIN_APROBACION ?? '4821';

export type QaRow = { caseId: string; ok: boolean; detail: string; tool: 'api' };
export type Refs = {
  contratistaId?: string;
  laborId?: string;
  actividadId?: string;
  tipoContratoId?: string;
  centroCostoId?: string;
  labId?: string;
  actId?: string;
};

export function createReporter(results: QaRow[]) {
  return {
    pass(caseId: string, detail: string) {
      results.push({ caseId, ok: true, detail, tool: 'api' });
      console.log(`  ✅ ${caseId}: ${detail}`);
    },
    fail(caseId: string, detail: string) {
      results.push({ caseId, ok: false, detail, tool: 'api' });
      console.log(`  ❌ ${caseId}: ${detail}`);
    },
    skip(caseId: string, detail: string) {
      results.push({ caseId, ok: false, detail: `SKIP: ${detail}`, tool: 'api' });
      console.log(`  ⚠ ${caseId}: ${detail}`);
    },
  };
}

export function stamp() {
  return Date.now().toString(36).toUpperCase();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()) as { token: string };
}

export async function api(
  token: string,
  method: string,
  apiPath: string,
  body?: unknown,
  empresaId = EMP1,
) {
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Empresa-Id': empresaId,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

export function flattenCuentas(data: unknown): { id: string; activa?: boolean; noImputable?: boolean }[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as { id: string; activa?: boolean; noImputable?: boolean }[];
  if (typeof data === 'object' && data !== null && 'items' in data) {
    return flattenCuentas((data as { items: unknown }).items);
  }
  return [];
}
