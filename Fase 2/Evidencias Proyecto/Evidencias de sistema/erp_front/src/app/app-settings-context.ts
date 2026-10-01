import { createContext, useContext } from 'react';
import type { Empresa } from '@/types/domain';
import type { PeriodoContableSettings } from '@/lib/appSettings';

export interface AppSettingsContextValue {
  demoMode: boolean;
  setDemoMode: (demo: boolean) => void;
  empresas: Empresa[];
  selectedEmpresa: Empresa | null;
  setSelectedEmpresaId: (id: string) => void;
  refreshEmpresas: () => Promise<void>;
  periodoContable: PeriodoContableSettings;
  setPeriodoContable: (periodo: PeriodoContableSettings) => void;
  periodoModalOpen: boolean;
  openPeriodoModal: () => void;
  closePeriodoModal: () => void;
}

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
