import { useState, useEffect } from 'react';
import { User, Shield, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { INPUT_LIMITS, isValidPassword } from '@/lib/inputValidation';
import { esUsuarioMantenedor } from '@/lib/permissions';
import { setPinAprobacion as savePinAprobacion } from '@/services/api';

export default function PerfilPage() {
  const { user, updateProfile, changePassword, refreshSession } = useAuth();
  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const showPinSection = Boolean(user?.aprobarConPin);
  const puedeCambiarClave = esUsuarioMantenedor(user);

  useEffect(() => {
    setNombre(user?.nombre ?? '');
  }, [user?.nombre]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nombre.trim();
    if (!trimmed) {
      toast.error('El nombre no puede estar vacío');
      return;
    }
    if (trimmed.length > INPUT_LIMITS.nombre) {
      toast.error(`El nombre no puede superar ${INPUT_LIMITS.nombre} caracteres`);
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({ nombre: trimmed });
      toast.success('Datos actualizados correctamente');
    } catch {
      toast.error('No se pudieron actualizar los datos');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.message('Sin cambios', { description: 'Deje el campo en blanco si no desea cambiar la contraseña.' });
      return;
    }
    if (!isValidPassword(password)) {
      toast.error(`La contraseña debe tener entre ${INPUT_LIMITS.passwordMin} y ${INPUT_LIMITS.password} caracteres`);
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(password);
      setPassword('');
      toast.success('Contraseña actualizada correctamente');
    } catch {
      toast.error('No se pudo cambiar la contraseña');
    } finally {
      setSavingPassword(false);
    }
  };

  const handlePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      toast.error('El PIN debe ser exactamente 4 dígitos numéricos');
      return;
    }
    if (pin !== pinConfirm) {
      toast.error('Los PIN no coinciden');
      return;
    }
    if (!pinPassword.trim()) {
      toast.error('Ingresa la contraseña de tu cuenta para confirmar');
      return;
    }
    setSavingPin(true);
    try {
      await savePinAprobacion(pin, pinPassword);
      setPin('');
      setPinConfirm('');
      setPinPassword('');
      await refreshSession();
      toast.success(user?.tienePinAprobacion ? 'PIN actualizado' : 'PIN registrado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el PIN');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <User size={24} className="text-[var(--color-accent)]" />
            Mi Perfil
          </span>
        }
        subtitle="Administra tu configuración personal, contraseña y preferencias de cuenta."
        breadcrumbs={['Cuenta']}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)]/40">
          <CardBody className="p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-accent-2)]">
              Información general
            </h2>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <Field label="Nombre completo">
                <Input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Su nombre"
                  maxLength={INPUT_LIMITS.nombre}
                />
              </Field>
              <Field label="Correo electrónico (solo lectura)">
                <Input value={user?.email ?? ''} readOnly className="cursor-not-allowed opacity-75" />
              </Field>
              <Field label="Rol">
                <Input value={user?.rol ?? ''} readOnly className="cursor-not-allowed opacity-75" />
              </Field>
              <Field label="Empresa">
                <Input value={user?.empresa ?? ''} readOnly className="cursor-not-allowed opacity-75" />
              </Field>
              <Button type="submit" className="mt-2 w-full" disabled={savingProfile}>
                {savingProfile ? 'Guardando…' : 'Actualizar datos'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-6">
            <h2 className="mb-4 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)]">
              <Shield size={16} className="text-[var(--color-muted)]" />
              Seguridad
            </h2>
            {puedeCambiarClave ? (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <Field label="Contraseña de inicio de sesión">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Dejar en blanco para no cambiar"
                    autoComplete="new-password"
                    maxLength={INPUT_LIMITS.password}
                  />
                </Field>
                <p className="text-xs text-[var(--color-muted)]">
                  Mínimo {INPUT_LIMITS.passwordMin} caracteres. Solo para entrar al sistema.
                </p>
                <Button type="submit" variant="outline" className="w-full" disabled={savingPassword}>
                  {savingPassword ? 'Guardando…' : 'Cambiar contraseña'}
                </Button>
              </form>
            ) : null}

            {showPinSection ? (
              <form
                onSubmit={handlePin}
                className={
                  puedeCambiarClave
                    ? 'mt-6 space-y-4 border-t border-[var(--color-border)] pt-4'
                    : 'space-y-4'
                }
              >
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                  <KeyRound size={16} className="text-[var(--color-accent)]" />
                  PIN de aprobación
                </h3>
                <p className="text-xs text-[var(--color-muted)]">
                  Disponible porque estás designado como aprobador (Admin › Aprobaciones) o eres Administrador.
                  Un solo PIN de 4 dígitos para aprobar, rechazar o reversar.
                  {user?.tienePinAprobacion
                    ? ' Estado: registrado.'
                    : ' Estado: aún no registrado — créalo antes de aprobar.'}
                </p>
                <Field label="Nuevo PIN (4 dígitos)">
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder={user?.tienePinAprobacion ? '••••' : 'Ej. 4821'}
                    autoComplete="off"
                    className="font-mono tracking-widest"
                  />
                </Field>
                <Field label="Confirmar PIN">
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Repetir PIN"
                    autoComplete="off"
                    className="font-mono tracking-widest"
                  />
                </Field>
                <Field label="Contraseña de tu cuenta">
                  <Input
                    type="password"
                    value={pinPassword}
                    onChange={(e) => setPinPassword(e.target.value)}
                    placeholder="Confirma con tu clave de login"
                    autoComplete="current-password"
                  />
                </Field>
                <Button type="submit" variant="outline" className="w-full" disabled={savingPin}>
                  {savingPin ? 'Guardando…' : user?.tienePinAprobacion ? 'Cambiar PIN' : 'Registrar PIN'}
                </Button>
              </form>
            ) : (
              <div
                className={`rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted)] ${puedeCambiarClave ? 'mt-6' : ''}`}
              >
                PIN de aprobación no aplica a tu rol actual. Aparecerá aquí si te asignan un rol con
                «Aprobar con PIN».
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
