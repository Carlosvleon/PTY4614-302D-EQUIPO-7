import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Empresa } from '@/types/domain';
import * as api from '@/services/api';
import { empresas as seedEmpresas } from '@/services/mock/fixtures';
import { resetDemoStore } from '@/services/mock/api';
import {
  DEMO_EMPRESA_ID,
  DEMO_PERIODO_CODIGO,
  readDemoMode,
  writeDemoMode,
  readSelectedEmpresaId,
  writeSelectedEmpresaId,
  readPeriodoContable,
  writePeriodoContable,
  readPeriodoPrompted,
  writePeriodoPrompted,
  settingsFromPeriodoCodigo,
  type PeriodoContableSettings,
} from '@/lib/appSettings';
import { resolveCatalogEmpresaId } from '@/lib/empresaId';
import { useAuth } from './auth-context';
import { AppSettingsContext } from './app-settings-context';
import { PeriodoSetupModal } from '@/components/common/PeriodoSetupModal';

function resolveDefaultEmpresa(empresas: Empresa[], userEmpresaId?: string): Empresa | null {
  if (!empresas.length) return null;
  const catalogIds = empresas.map((e) => e.id);
  const resolvedId = resolveCatalogEmpresaId(
    readSelectedEmpresaId(),
    catalogIds,
    userEmpresaId,
  );
  const resolved = empresas.find((e) => e.id === resolvedId);
  if (resolved?.activa) return resolved;
  const fromUser = empresas.find((e) => e.id === userEmpresaId);
  if (fromUser?.activa) return fromUser;
  return empresas.find((e) => e.activa) ?? empresas[0];
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { user, setActiveEmpresa } = useAuth();
  const queryClient = useQueryClient();
  const [demoMode, setDemoModeState] = useState(readDemoMode);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [periodoContable, setPeriodoContableState] = useState<PeriodoContableSettings>(readPeriodoContable);
  const [periodoModalOpen, setPeriodoModalOpen] = useState(false);

  const refreshEmpresas = useCallback(async () => {
    try {
      const list = await api.getEmpresas();
      const raw = list.length ? list : (readDemoMode() ? seedEmpresas : []);
      const allowed = user?.empresaIds?.length
        ? raw.filter((e) => user.empresaIds!.includes(e.id) || user.rolId === 'ROL-1' || user.permisos?.includes('*'))
        : raw;
      // Super admin ve todas; resto solo las asignadas (si vienen en sesión)
      const isAdmin = user?.rolId === 'ROL-1' || (user?.permisos?.includes('*') ?? false);
      setEmpresas(isAdmin || !user?.empresaIds?.length ? raw : allowed.length ? allowed : raw.filter((e) => e.id === user?.empresaId));
    } catch {
      setEmpresas(readDemoMode() ? seedEmpresas : []);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSelectedEmpresa(null);
      return;
    }
    void refreshEmpresas();
  }, [user?.id, demoMode, refreshEmpresas]);

  useEffect(() => {
    if (!user || !empresas.length) {
      setSelectedEmpresa(null);
      return;
    }
    const empresa = resolveDefaultEmpresa(empresas, user.empresaId);
    if (!empresa) return;
    setSelectedEmpresa(empresa);
    writeSelectedEmpresaId(empresa.id);
    if (user.empresaId !== empresa.id || user.empresa !== empresa.razonSocial) {
      setActiveEmpresa(empresa.id, empresa.razonSocial);
    }
  }, [user, empresas, setActiveEmpresa]);

  /** Tras login / empresa lista: pedir temporada + mes si aún no se confirmó en esta sesión persistida. */
  useEffect(() => {
    if (!user || !selectedEmpresa) return;
    if (!readPeriodoPrompted()) {
      setPeriodoModalOpen(true);
    }
  }, [user?.id, selectedEmpresa?.id]);

  const setDemoMode = (demo: boolean) => {
    setDemoModeState(demo);
    writeDemoMode(demo);
    if (demo) {
      resetDemoStore();
      const emp = seedEmpresas.find((e) => e.id === DEMO_EMPRESA_ID) ?? seedEmpresas[0];
      if (emp) {
        writeSelectedEmpresaId(emp.id);
        setSelectedEmpresa(emp);
        setActiveEmpresa(emp.id, emp.razonSocial);
      }
      const periodoDemo = settingsFromPeriodoCodigo(DEMO_PERIODO_CODIGO);
      setPeriodoContableState(periodoDemo);
      writePeriodoContable(periodoDemo);
    }
    void queryClient.invalidateQueries({ refetchType: 'active' });
    void refreshEmpresas();
    if (demo) {
      toast.success('Modo demo activado — datos de prueba (agosto 2026)');
    } else {
      toast.info('Modo real activado — datos desde el servidor');
    }
  };

  const setSelectedEmpresaId = (id: string) => {
    const empresa = empresas.find((e) => e.id === id);
    if (!empresa) return;
    if (!empresa.activa) {
      toast.error('Esta empresa está inactiva');
      return;
    }
    const isAdmin = user?.rolId === 'ROL-1' || (user?.permisos?.includes('*') ?? false);
    if (!isAdmin && user?.empresaIds?.length && !user.empresaIds.includes(id)) {
      toast.error('No tienes acceso a esta empresa');
      return;
    }
    setSelectedEmpresa(empresa);
    writeSelectedEmpresaId(id);
    setActiveEmpresa(id, empresa.razonSocial);
    queryClient.invalidateQueries();
    toast.success(`Empresa activa: ${empresa.razonSocial}`);
    setPeriodoModalOpen(true);
  };

  const setPeriodoContable = (periodo: PeriodoContableSettings) => {
    setPeriodoContableState(periodo);
    writePeriodoContable(periodo);
    writePeriodoPrompted(true);
    const codigo = periodo.codigo || `${periodo.temporada.includes('/') ? periodo.temporada.split('/')[0] : periodo.temporada}-${periodo.mesContable}`;
    // Misma política que cambio de empresa: refrescar pantallas activas
    // (libros, traspaso, borradores, asientos, etc.).
    void queryClient.invalidateQueries({ refetchType: 'active' });
    toast.success(`Periodo contable: ${codigo}`);
  };

  const openPeriodoModal = () => setPeriodoModalOpen(true);
  const closePeriodoModal = () => {
    writePeriodoPrompted(true);
    setPeriodoModalOpen(false);
  };

  return (
    <AppSettingsContext.Provider
      value={{
        demoMode,
        setDemoMode,
        empresas,
        selectedEmpresa,
        setSelectedEmpresaId,
        refreshEmpresas,
        periodoContable,
        setPeriodoContable,
        periodoModalOpen,
        openPeriodoModal,
        closePeriodoModal,
      }}
    >
      {children}
      <PeriodoSetupModal />
    </AppSettingsContext.Provider>
  );
}
