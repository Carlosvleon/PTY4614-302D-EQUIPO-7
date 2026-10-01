import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@/types/domain';
import * as api from '@/services/api';
import { AuthContext } from './auth-context';
import { readDemoMode } from '@/lib/appSettings';

const KEY = 'erp.session';

function readStoredSession(): SessionUser | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function persistSession(user: SessionUser | null) {
  if (user) localStorage.setItem(KEY, JSON.stringify(user));
  else localStorage.removeItem(KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = readStoredSession();
      if (!stored?.token) {
        if (!cancelled) setLoading(false);
        return;
      }

      setUser(stored);
      try {
        const profile = await api.getMe();
        if (cancelled) return;
        const next: SessionUser = {
          ...profile,
          token: stored.token,
          refreshToken: stored.refreshToken,
        };
        setUser(next);
        persistSession(next);
      } catch {
        if (cancelled) return;
        // Dev/demo: si el API/BD no responde, conservar la sesión local para recorrer UI.
        if (!(readDemoMode() && stored)) {
          persistSession(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  const setActiveEmpresa = useCallback((empresaId: string, empresa: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      if (prev.empresaId === empresaId && prev.empresa === empresa) return prev;
      const next = { ...prev, empresaId, empresa };
      persistSession(next);
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        async login(email, password) {
          const u = await api.login(email, password);
          setUser(u);
          persistSession(u);
        },
        async loginWithMicrosoft(idToken) {
          const u = await api.loginWithMicrosoft(idToken);
          setUser(u);
          persistSession(u);
        },
        async logout() {
          try { await api.logout(); } catch { /* ignore */ }
          persistSession(null);
          setUser(null);
          queryClient.clear();
        },
        async updateProfile(data) {
          const profile = await api.updateProfile(data);
          setUser((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...profile, token: prev.token, refreshToken: prev.refreshToken };
            persistSession(next);
            return next;
          });
        },
        async changePassword(password) {
          await api.changePassword(password);
        },
        async refreshSession() {
          const profile = await api.getMe();
          setUser((prev) => {
            if (!prev) return prev;
            const next = {
              ...prev,
              ...profile,
              token: prev.token,
              refreshToken: prev.refreshToken,
            };
            persistSession(next);
            return next;
          });
        },
        setActiveEmpresa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
