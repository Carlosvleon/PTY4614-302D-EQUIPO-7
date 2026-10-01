import { Bell, LogOut, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from './auth-context';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { EmpresaSelector } from '@/components/common/EmpresaSelector';
import { DemoModeToggle } from '@/components/common/DemoModeToggle';
import { PeriodoContableSelector } from '@/components/common/PeriodoContableSelector';
import { useAppSettings } from './app-settings-context';
import { labelMes } from '@/lib/appSettings';
import { useEmpresaScopeId, usePeriodoScopeCodigo, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import { fmtCLP } from '@/lib/utils';
import { periodoSesionDistintoDeHoy } from '@/lib/periodo-trabajo';
import { getErrorStatus, shouldContinueQueryPolling } from '@/lib/queryError';
import * as api from '@/services/api';

function notificacionTitulo(n: { tipo: string; titulo: string }): string {
  const t = n.titulo?.trim();
  if (t) return t;
  if (n.tipo === 'OC_ENVIADA') return 'OC enviada a aprobación';
  return n.tipo;
}

export function Topbar() {
  const { user, logout } = useAuth();
  const { periodoContable } = useAppSettings();
  const codigoPeriodo = usePeriodoScopeCodigo();
  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const notifKey = listQueryKey(scope, empresaId, 'notificaciones');

  const notifQ = useQuery({
    queryKey: notifKey,
    queryFn: api.getNotificacionesPendientes,
    enabled: !!user,
    /** Polling vivo: más frecuente con el menú abierto; sin F5. */
    refetchInterval: (query) => (
      shouldContinueQueryPolling(query.state.error)
        ? (notifOpen ? 8_000 : 15_000)
        : false
    ),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => shouldContinueQueryPolling(query.state.error),
    refetchOnReconnect: (query) => shouldContinueQueryPolling(query.state.error),
    staleTime: 5_000,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const notifForbidden = getErrorStatus(notifQ.error) === 403;
  const notifTotal = notifQ.data?.total ?? 0;
  const notifItems = notifQ.data?.items ?? [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  /** Al volver a la pestaña, refrescar campana de inmediato. */
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const error = qc.getQueryState(notifKey)?.error;
        if (!shouldContinueQueryPolling(error)) return;
        void qc.invalidateQueries({ queryKey: notifKey });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [user, qc, notifKey]);

  const refreshNotifs = async () => {
    const error = qc.getQueryState(notifKey)?.error;
    if (!shouldContinueQueryPolling(error)) return;
    await qc.invalidateQueries({ queryKey: notifKey });
  };

  const toggleLeida = async (id: string, leida: boolean) => {
    setBusyId(id);
    try {
      await api.setNotificacionLeida(id, leida);
      await refreshNotifs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar la notificación');
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    try {
      await api.marcarTodasNotificacionesLeidas();
      await refreshNotifs();
      toast.success('Todas marcadas como leídas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron marcar como leídas');
    }
  };

  const openNotif = async (n: { id: string; href: string; leida: boolean }) => {
    setNotifOpen(false);
    if (!n.leida) {
      try {
        await api.setNotificacionLeida(n.id, true);
        await refreshNotifs();
      } catch {
        /* navegamos igual */
      }
    }
    const target = n.href.startsWith('/') ? n.href : `/${n.href}`;
    const [path, qs = ''] = target.split('?');
    // Si ya estamos en la misma ruta con el mismo open, forzar re-apertura del detalle.
    if (location.pathname === path && location.search === (qs ? `?${qs}` : '')) {
      nav(path, { replace: true });
      queueMicrotask(() => nav(target));
      return;
    }
    nav(target);
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    nav('/login', { replace: true });
  };

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
      <div className="min-w-0 text-sm font-medium text-[var(--color-muted)]">
        Almahue ERP
        <span className="mx-1.5 text-[var(--color-border)]">/</span>
        <span className="text-[var(--color-text)]">{user?.empresa ?? 'Almahue SpA'}</span>
        <span className="mx-1.5 hidden text-[var(--color-border)] sm:inline">·</span>
        <span className="hidden text-xs sm:inline">
          T{periodoContable.temporada} / {labelMes(periodoContable.mesContable)}
        </span>
        {periodoSesionDistintoDeHoy(codigoPeriodo) && (
          <span className="ml-2 hidden text-[11px] font-medium text-amber-700 dark:text-amber-300 sm:inline">
            La factura se emite en el periodo de la sesión
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3" ref={ref}>
        <DemoModeToggle />
        <PeriodoContableSelector />
        <EmpresaSelector />
        <ThemeToggle />
        <div className="relative">
          <button
            type="button"
            className="relative rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            title="Notificaciones"
            onClick={() => {
              setNotifOpen((v) => !v);
              setOpen(false);
              if (!notifOpen) void refreshNotifs();
            }}
          >
            <Bell size={18} />
            {notifTotal > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
                {notifTotal > 9 ? '9+' : notifTotal}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-11 z-50 w-[22rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
                <span className="text-xs font-semibold text-[var(--color-text)]">
                  Notificaciones
                  {notifTotal > 0 ? ` · ${notifTotal} sin leer` : ''}
                </span>
                {notifItems.some((n) => !n.leida) && (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-[var(--color-brand)] hover:underline"
                    onClick={() => void markAll()}
                  >
                    Marcar todas leídas
                  </button>
                )}
              </div>
              {notifForbidden ? (
                <p className="px-3 py-4 text-sm text-[var(--color-muted)]">
                  Sin permiso para consultar notificaciones.
                </p>
              ) : notifItems.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[var(--color-muted)]">Sin notificaciones</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {notifItems.map((n) => (
                    <li
                      key={n.id}
                      className={`border-b border-[var(--color-border)] last:border-0 ${
                        n.leida ? 'opacity-70' : 'bg-[var(--color-accent-soft)]/40'
                      }`}
                    >
                      <div className="flex items-start gap-1 px-2 py-1.5">
                        <button
                          type="button"
                          className="min-w-0 flex-1 rounded-lg px-1.5 py-1 text-left hover:bg-[var(--color-surface-2)]"
                          onClick={() => void openNotif(n)}
                        >
                          <span className="flex items-center gap-1.5">
                            {!n.leida && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                            )}
                            <span className={`block text-sm ${n.leida ? 'font-normal' : 'font-semibold'} text-[var(--color-text)]`}>
                              {notificacionTitulo(n)}
                            </span>
                          </span>
                          <span
                            className="mt-0.5 block whitespace-normal break-words text-xs leading-snug text-[var(--color-muted)] line-clamp-3"
                            title={n.detalle ?? undefined}
                          >
                            {n.detalle}
                            {n.monto != null ? ` · ${fmtCLP(n.monto)}` : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          title={n.leida ? 'Marcar como no leída' : 'Marcar como leída'}
                          disabled={busyId === n.id}
                          className="shrink-0 rounded px-1.5 py-1 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleLeida(n.id, !n.leida);
                          }}
                        >
                          {n.leida ? 'No leída' : 'Leída'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            setNotifOpen(false);
          }}
          className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-xs font-bold text-[var(--color-accent-2)]">
            {user?.nombre?.charAt(0) ?? 'A'}
          </span>
          <span className="hidden sm:block text-left">
            <span className="block font-medium text-[var(--color-text)]">{user?.nombre}</span>
            <span className="block text-[10px] text-[var(--color-muted)]">
              {user?.rol}
            </span>
          </span>
        </button>
        {open && (
          <div className="absolute right-5 top-14 z-50 w-48 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
            <Link
              to="/perfil"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <User size={14} /> Perfil
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
