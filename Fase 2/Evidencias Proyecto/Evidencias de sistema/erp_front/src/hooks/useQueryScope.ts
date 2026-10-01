import { useEffect, useState } from 'react';
import { useAppSettings } from '@/app/app-settings-context';
import { codigoFromSettings } from '@/lib/appSettings';

/** Segmento de queryKey que cambia al alternar modo demo/real. */
export function useQueryScope(): 'demo' | 'real' {
  const { demoMode } = useAppSettings();
  return demoMode ? 'demo' : 'real';
}

/** Empresa activa para aislar caches por tenant (DEC-03). */
export function useEmpresaScopeId(): string {
  const { selectedEmpresa } = useAppSettings();
  return selectedEmpresa?.id ?? 'none';
}

/** Periodo contable activo del header (YYYY-MM). */
export function usePeriodoScopeCodigo(): string {
  const { periodoContable } = useAppSettings();
  return codigoFromSettings(periodoContable);
}

const PERIODO_YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Período operativo para altas: header global o mes calendario actual. */
export function usePeriodoYmOperativo(): string {
  const codigo = usePeriodoScopeCodigo();
  if (PERIODO_YM.test(codigo.trim())) return codigo.trim();
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Input local de periodo (YYYY-MM) que se resincroniza al cambiar
 * el periodo del header o la empresa activa.
 */
export function useSyncedPeriodoInput(): [string, (value: string) => void, string] {
  const globalCodigo = usePeriodoScopeCodigo();
  const empresaId = useEmpresaScopeId();
  const [periodo, setPeriodo] = useState(globalCodigo);

  useEffect(() => {
    setPeriodo(globalCodigo);
  }, [globalCodigo, empresaId]);

  return [periodo, setPeriodo, globalCodigo];
}

/**
 * Query key con modo + empresa + resto.
 * Incluir empresa evita mezclar datos al cambiar empresa y fuerza refetch correcto.
 */
export function scopedQueryKey(
  scope: 'demo' | 'real',
  ...keys: readonly unknown[]
) {
  return [scope, ...keys] as const;
}

/** Key completa lista: [mode, empresaId, ...parts] */
export function listQueryKey(
  mode: 'demo' | 'real',
  empresaId: string,
  ...parts: readonly unknown[]
) {
  return [mode, empresaId, ...parts] as const;
}

/**
 * Key con periodo del header: [mode, empresaId, periodoCodigo, ...parts].
 * Usar en pantallas cuyo listado/filtro depende del mes contable activo.
 */
export function periodListQueryKey(
  mode: 'demo' | 'real',
  empresaId: string,
  periodoCodigo: string,
  ...parts: readonly unknown[]
) {
  return [mode, empresaId, periodoCodigo, ...parts] as const;
}
