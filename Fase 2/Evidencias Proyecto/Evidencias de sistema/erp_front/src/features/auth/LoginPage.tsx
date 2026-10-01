import { INPUT_LIMITS } from '@/lib/inputValidation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/app/auth-context';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import * as api from '@/services/api';
import {
  acquireMicrosoftIdToken,
  type MicrosoftAuthPublicConfig,
} from '@/lib/microsoftAuth';

const schema = z.object({
  email: z.string().max(INPUT_LIMITS.email).email('Email inválido'),
  password: z
    .string()
    .min(INPUT_LIMITS.passwordMin, `Mínimo ${INPUT_LIMITS.passwordMin} caracteres`)
    .max(INPUT_LIMITS.password),
});

type FormData = z.infer<typeof schema>;

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, loginWithMicrosoft, user, loading } = useAuth();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [msSubmitting, setMsSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [msConfig, setMsConfig] = useState<MicrosoftAuthPublicConfig | null>(null);
  const [msDialogOpen, setMsDialogOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) nav('/', { replace: true });
  }, [loading, user, nav]);

  useEffect(() => {
    let cancelled = false;
    void api.getMicrosoftAuthConfig()
      .then((cfg) => {
        if (!cancelled) setMsConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setMsConfig({ enabled: false, tenantId: '', clientId: '', authority: '' });
      });
    return () => { cancelled = true; };
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      await login(data.email, data.password);
      toast.success('Bienvenido a Almahue ERP');
      nav('/', { replace: true });
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message
          : 'Credenciales inválidas';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onMicrosoft = async () => {
    if (!msConfig?.enabled) {
      setMsDialogOpen(true);
      return;
    }
    setMsSubmitting(true);
    try {
      const idToken = await acquireMicrosoftIdToken(msConfig);
      await loginWithMicrosoft(idToken);
      toast.success('Sesión iniciada con Microsoft');
      nav('/', { replace: true });
    } catch (e) {
      const msg = e instanceof Error && e.message.trim()
        ? e.message
        : 'No se pudo iniciar con Microsoft';
      toast.error(msg);
    } finally {
      setMsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-muted)]">
        Cargando…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <div className="relative hidden flex-1 lg:flex flex-col justify-between p-12 text-white"
        style={{ background: 'linear-gradient(135deg, #1a5c2e 0%, #0f3d1e 50%, #7a0e1e 100%)' }}>
        <div className="inline-flex w-fit rounded-xl bg-white px-4 py-3 shadow-sm">
          <Logo size="lg" />
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight">ERP Enterprise Almahue</h2>
          <p className="mt-3 text-white/80 text-sm leading-relaxed">
            Plataforma integrada para gestión financiera, comercial, contratistas e insumos.
          </p>
        </div>
        <p className="text-xs text-white/50">Almahue / Devint · Jul 2026</p>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-6">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Ingresa con tu email y contraseña del ERP.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <Field label="Email">
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <Input
                  className="pl-10"
                  type="email"
                  maxLength={INPUT_LIMITS.email}
                  autoComplete="email"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.email.message}</p>}
            </Field>
            <Field label="Contraseña">
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <Input
                  className="pl-10 pr-10"
                  type={showPw ? 'text' : 'password'}
                  maxLength={INPUT_LIMITS.password}
                  autoComplete="current-password"
                  {...register('password')}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.password.message}</p>}
            </Field>
            <Button type="submit" className="w-full" disabled={submitting || msSubmitting}>
              {submitting ? 'Ingresando…' : 'Entrar con clave'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">o</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              title="Iniciar sesión Microsoft"
              aria-label="Iniciar sesión Microsoft"
              disabled={submitting || msSubmitting}
              onClick={() => void onMicrosoft()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {msSubmitting ? (
                <span className="text-xs text-[var(--color-muted)]">…</span>
              ) : (
                <MicrosoftIcon className="h-5 w-5" />
              )}
            </button>
          </div>

          <Modal
            open={msDialogOpen}
            onClose={() => setMsDialogOpen(false)}
            title="Inicio de sesión Microsoft"
            size="sm"
            footer={(
              <Button type="button" onClick={() => setMsDialogOpen(false)}>
                Entendido
              </Button>
            )}
          >
            <p className="text-sm text-[var(--color-text)]">
              El inicio de sesión con Microsoft estará habilitado próximamente.
              Mientras tanto, usa tu email y contraseña del ERP.
            </p>
          </Modal>
        </div>
      </div>
    </div>
  );
}
