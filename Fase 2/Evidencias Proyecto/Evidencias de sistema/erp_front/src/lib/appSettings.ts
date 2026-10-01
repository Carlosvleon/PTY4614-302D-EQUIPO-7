const DEMO_KEY = 'almahue-erp-demo-mode';
const EMPRESA_KEY = 'almahue-erp-selected-empresa';
const PERIODO_KEY = 'almahue-erp-periodo-contable';
const PERIODO_PROMPTED_KEY = 'almahue-erp-periodo-prompted';

/** Contexto contable activo (Reu1 ~00:40). */
export type PeriodoContableSettings = {
  temporada: string;
  mesContable: string;
  mesRemuneracion: string;
  /** Id del periodo API (si existe). */
  periodoId?: string;
  /** Código aaaa-mm del periodo API. */
  codigo?: string;
};

/** Tenant y mes de los fixtures demo (skill almahue-demo-mode). */
export const DEMO_EMPRESA_ID = 'EMP-1';
export const DEMO_PERIODO_CODIGO = '2026-08';

const DEFAULT_PERIODO: PeriodoContableSettings = {
  temporada: String(new Date().getFullYear()),
  mesContable: String(new Date().getMonth() + 1).padStart(2, '0'),
  mesRemuneracion: String(new Date().getMonth() + 1).padStart(2, '0'),
  codigo: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
};

/** Construye settings desde código aaaa-mm (API PeriodoContable). */
export function settingsFromPeriodoCodigo(
  codigo: string,
  periodoId?: string,
  mesRemuneracion?: string,
): PeriodoContableSettings {
  const m = /^(\d{4})-(\d{2})$/.exec(codigo.trim());
  if (!m) {
    return { ...DEFAULT_PERIODO, periodoId, codigo: codigo.trim() || DEFAULT_PERIODO.codigo };
  }
  return {
    temporada: m[1],
    mesContable: m[2],
    mesRemuneracion: mesRemuneracion || m[2],
    periodoId,
    codigo: `${m[1]}-${m[2]}`,
  };
}

export function codigoFromSettings(p: PeriodoContableSettings): string {
  if (p.codigo && /^\d{4}-\d{2}$/.test(p.codigo)) return p.codigo;
  const year = p.temporada.includes('/') ? p.temporada.split('/')[0] : p.temporada;
  return `${year}-${p.mesContable}`;
}

export function readDemoMode(): boolean {
  const raw = localStorage.getItem(DEMO_KEY);
  // Sin preferencia: en build de producción → modo real (API Nest);
  // en dev → demo para maquetas locales.
  if (raw === null) return !import.meta.env.PROD;
  return raw !== 'false';
}

export function writeDemoMode(demo: boolean) {
  localStorage.setItem(DEMO_KEY, String(demo));
}

export function readSelectedEmpresaId(): string | null {
  return localStorage.getItem(EMPRESA_KEY);
}

export function writeSelectedEmpresaId(id: string) {
  localStorage.setItem(EMPRESA_KEY, id);
}

export function readPeriodoContable(): PeriodoContableSettings {
  try {
    const raw = localStorage.getItem(PERIODO_KEY);
    if (!raw) return { ...DEFAULT_PERIODO };
    const parsed = JSON.parse(raw) as Partial<PeriodoContableSettings>;
    const base = {
      temporada: parsed.temporada || DEFAULT_PERIODO.temporada,
      mesContable: parsed.mesContable || DEFAULT_PERIODO.mesContable,
      mesRemuneracion: parsed.mesRemuneracion || parsed.mesContable || DEFAULT_PERIODO.mesRemuneracion,
      periodoId: parsed.periodoId,
      codigo: parsed.codigo,
    };
    if (!base.codigo) base.codigo = codigoFromSettings(base);
    return base;
  } catch {
    return { ...DEFAULT_PERIODO };
  }
}

export function writePeriodoContable(periodo: PeriodoContableSettings) {
  localStorage.setItem(PERIODO_KEY, JSON.stringify(periodo));
}

export function readPeriodoPrompted(): boolean {
  return localStorage.getItem(PERIODO_PROMPTED_KEY) === '1';
}

export function writePeriodoPrompted(done: boolean) {
  localStorage.setItem(PERIODO_PROMPTED_KEY, done ? '1' : '0');
}

export function isDemoMode(): boolean {
  return readDemoMode();
}

export const MESES_CONTABLES = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
] as const;

export function labelMes(mes: string): string {
  return MESES_CONTABLES.find((m) => m.value === mes)?.label ?? mes;
}
