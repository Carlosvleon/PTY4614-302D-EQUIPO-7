import { createContext, useContext } from 'react';
import type { SessionUser } from '@/types/domain';

export interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Canjea id_token Microsoft → sesión ERP (misma forma que login local). */
  loginWithMicrosoft: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { nombre: string }) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  /** Recarga /auth/me (p. ej. tras guardar PIN). */
  refreshSession: () => Promise<void>;
  setActiveEmpresa: (empresaId: string, empresa: string) => void;
}

export const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
