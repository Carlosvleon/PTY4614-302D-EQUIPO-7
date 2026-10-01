import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from './auth-context';
import { SidebarProvider } from './SidebarProvider';
import { AppSettingsProvider } from './AppSettingsProvider';
import { useAppSettings } from './app-settings-context';
import { DocumentoPreviewHost } from '@/components/common/DocumentoPreviewHost';

function MainContent() {
  const { demoMode } = useAppSettings();
  const location = useLocation();
  const modeKey = demoMode ? 'demo' : 'real';

  return (
    <main className="flex-1 overflow-y-auto p-6 almahue-leaf-bg">
      <Outlet key={`${modeKey}-${location.pathname}`} />
    </main>
  );
}

export function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-muted)]">
        Cargando sesión…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppSettingsProvider>
      <SidebarProvider>
        <div className="flex h-screen bg-[var(--color-bg)]">
          <Sidebar />
          <div className="relative flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <MainContent />
            <DocumentoPreviewHost />
          </div>
        </div>
      </SidebarProvider>
    </AppSettingsProvider>
  );
}
