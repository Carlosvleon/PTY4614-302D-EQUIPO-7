import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { toast } from 'sonner';
import * as api from '@/services/api';
import { WORKFLOW_MODULOS_UI } from '@/lib/workflowAprobacion';
import type { AdminConcepto, Usuario } from '@/types/domain';

type FormState = { usuarioId: string; modulo: string; activo: boolean };
const emptyForm: FormState = { usuarioId: '', modulo: 'Compras', activo: true };

const MODULOS = WORKFLOW_MODULOS_UI;

/**
 * Panel de administradores por concepto.
 * Un admin de concepto puede ver todos los pendientes de su módulo
 * y editar grupos/escalas dentro de él — NO participa en la cadena de aprobación.
 */
export function AdminConceptoPanel({ usuarios }: { usuarios: Usuario[] }) {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();

  const { data: admins = [], isLoading } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'admin-concepto'),
    queryFn: api.getAdministradoresConcepto,
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<AdminConcepto | null>(null);

  const usuariosActivos = (usuarios ?? []).filter((u) => u.activo !== false);

  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const save = async () => {
    if (!form.usuarioId) { toast.error('Selecciona un usuario'); return; }
    if (!form.modulo) { toast.error('Selecciona un módulo'); return; }
    setSaving(true);
    try {
      await api.createAdminConcepto({ usuarioId: form.usuarioId, modulo: form.modulo, activo: form.activo });
      toast.success('Administrador agregado');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'admin-concepto') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteAdminConcepto(confirmDelete.id);
      toast.success('Administrador eliminado');
      setConfirmDelete(null);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'admin-concepto') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const byModulo = MODULOS.map((m) => ({
    modulo: m,
    rows: admins.filter((a) => a.modulo === m.value),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">
            Los administradores de concepto tienen <strong>visibilidad total</strong> de aprobaciones
            pendientes en su módulo y pueden <strong>editar grupos, escalas y montos</strong> dentro
            de él. No participan en la cadena de aprobación.
          </p>
        </div>
        <Button size="sm" leftIcon={<Plus size={14} />} onClick={openCreate} className="shrink-0">
          Agregar
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      )}

      {!isLoading && byModulo.map(({ modulo: m, rows }) => (
        <div key={m.value} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5">
            <ShieldCheck size={14} className="text-violet-500" aria-hidden />
            <span className="text-sm font-semibold">{m.label}</span>
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--color-muted)]">
              Sin administradores asignados.{' '}
              <button
                type="button"
                className="underline hover:text-[var(--color-text)]"
                onClick={() => { setForm({ ...emptyForm, modulo: m.value }); setOpen(true); }}
              >
                Agregar uno
              </button>
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {rows.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.usuarioNombre ?? a.usuarioId}</p>
                    {a.usuarioEmail && (
                      <p className="text-xs text-[var(--color-muted)]">{a.usuarioEmail}</p>
                    )}
                    {!a.activo && (
                      <span className="text-xs text-[var(--color-muted)]">Inactivo</span>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Eliminar administrador"
                    onClick={() => setConfirmDelete(a)}
                    className="rounded p-1 text-[var(--color-muted)] hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* Create modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar administrador de concepto"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : 'Agregar'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-3">
          <Field label="Usuario">
            <Select
              value={form.usuarioId}
              onChange={(e) => setForm((s) => ({ ...s, usuarioId: e.target.value }))}
            >
              <option value="">— Seleccionar —</option>
              {usuariosActivos.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Módulo / Concepto">
            <Select
              value={form.modulo}
              onChange={(e) => setForm((s) => ({ ...s, modulo: e.target.value }))}
            >
              {MODULOS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Activo">
            <Select
              value={form.activo ? '1' : '0'}
              onChange={(e) => setForm((s) => ({ ...s, activo: e.target.value === '1' }))}
            >
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
            Este usuario podrá ver todas las aprobaciones pendientes del módulo seleccionado y editar
            su configuración de grupos y escalas. No recibirá solicitudes de aprobación automáticamente.
          </p>
        </div>
      </Modal>

      {/* Confirm delete */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar administrador de concepto"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void doDelete()}>Eliminar</Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">
          ¿Quitar a <strong>{confirmDelete?.usuarioNombre}</strong> como administrador de{' '}
          <strong>{confirmDelete?.modulo}</strong>?
        </p>
      </Modal>
    </div>
  );
}
