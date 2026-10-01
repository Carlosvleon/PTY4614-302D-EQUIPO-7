import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, ChevronDown, ChevronRight, Minus, Pencil, Plus, Square, Trash2, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Field, Textarea, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { INPUT_LIMITS } from '@/lib/inputValidation';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import {
  MODULOS_PERMISOS,
  codesFromMatrix,
  mergeConCatalogo,
  pantallaKey,
  triState,
  type TriState,
} from '@/lib/pantallas-permisos';
import { isRolMaster } from '@/lib/adminRol';
import type { PermisoPantalla, Rol, Usuario } from '@/types/domain';
import * as api from '@/services/api';

function TriCheck({
  state,
  onToggle,
  disabled,
  title,
}: {
  state: TriState;
  onToggle: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded border transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
        state === 'all' && 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white',
        state === 'partial' && 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]',
        state === 'none' && 'border-[var(--color-border)] bg-[var(--color-surface)] text-transparent',
      )}
    >
      {state === 'all' && <Check size={12} strokeWidth={3} />}
      {state === 'partial' && <Minus size={12} strokeWidth={3} />}
      {state === 'none' && <Square size={10} className="opacity-0" />}
    </button>
  );
}

function moduleKeys(modLabel: string, pantallas: string[]): string[] {
  return pantallas.map((p) => pantallaKey(modLabel, p));
}

export default function RolesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qk = listQueryKey(scope, empresaId, 'roles');
  const uqk = listQueryKey(scope, empresaId, 'usuarios');
  const { data: roles = [], isLoading } = useQuery({ queryKey: qk, queryFn: api.getRoles });
  const { data: usuarios = [] } = useQuery({ queryKey: uqk, queryFn: api.getUsuarios });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [matrix, setMatrix] = useState<PermisoPantalla[]>(() => mergeConCatalogo());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [permSearch, setPermSearch] = useState('');
  const [rolSearch, setRolSearch] = useState('');
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacy, setLegacy] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRol, setDeletingRol] = useState<Rol | null>(null);
  const [rolDestinoGlobal, setRolDestinoGlobal] = useState('');
  const [destinoPorUsuario, setDestinoPorUsuario] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  const byKey = useMemo(() => new Map(matrix.map((p) => [p.pantalla, p])), [matrix]);

  const rolesAlternativos = useMemo(
    () => roles.filter((r) => r.id !== deletingRol?.id),
    [roles, deletingRol],
  );

  const rolesFiltrados = useMemo(() => {
    const q = rolSearch.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) =>
      r.nombre.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
    );
  }, [roles, rolSearch]);

  const usuariosAfectados = useMemo(
    () => (deletingRol ? usuarios.filter((u) => u.rolId === deletingRol.id) : []),
    [usuarios, deletingRol],
  );

  const usuariosDelRolEdit = useMemo(
    () => (editingId ? usuarios.filter((u) => u.rolId === editingId) : []),
    [usuarios, editingId],
  );

  const permQuery = permSearch.trim().toLowerCase();
  const modulosFiltrados = useMemo(() => {
    if (!permQuery) {
      return MODULOS_PERMISOS.map((mod) => ({ ...mod, pantallasVisibles: mod.pantallas }));
    }
    return MODULOS_PERMISOS
      .map((mod) => {
        const modMatch = mod.label.toLowerCase().includes(permQuery);
        const pantallasVisibles = modMatch
          ? mod.pantallas
          : mod.pantallas.filter((p) => p.toLowerCase().includes(permQuery));
        return { ...mod, pantallasVisibles };
      })
      .filter((mod) => mod.pantallasVisibles.length > 0);
  }, [permQuery]);

  const keysVisibles = useMemo(
    () => modulosFiltrados.flatMap((mod) => moduleKeys(mod.label, mod.pantallasVisibles)),
    [modulosFiltrados],
  );

  const openDelete = (rol: Rol) => {
    if (rol.id === 'ROL-1') {
      toast.error('No se puede eliminar el rol Administrador');
      return;
    }
    const afectados = usuarios.filter((u) => u.rolId === rol.id);
    const defaultDestino = roles.find((r) => r.id !== rol.id)?.id ?? '';
    const map: Record<string, string> = {};
    for (const u of afectados) map[u.id] = defaultDestino;
    setDeletingRol(rol);
    setRolDestinoGlobal(defaultDestino);
    setDestinoPorUsuario(map);
    setDeleteOpen(true);
  };

  const aplicarRolGlobal = (nuevoRolId: string) => {
    setRolDestinoGlobal(nuevoRolId);
    setDestinoPorUsuario((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = nuevoRolId;
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!deletingRol) return;
    if (usuariosAfectados.length > 0) {
      if (!rolDestinoGlobal) {
        toast.error('Selecciona un rol de destino');
        return;
      }
      const incompletos = usuariosAfectados.filter((u) => !destinoPorUsuario[u.id]);
      if (incompletos.length) {
        toast.error('Asigna un rol a cada usuario');
        return;
      }
    }
    setDeleting(true);
    try {
      const reasignaciones = usuariosAfectados.map((u) => ({
        usuarioId: u.id,
        nuevoRolId: destinoPorUsuario[u.id],
      }));
      await api.deleteRol(deletingRol.id, reasignaciones);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk }),
        qc.invalidateQueries({ queryKey: uqk }),
      ]);
      toast.success(
        usuariosAfectados.length
          ? `Rol eliminado · ${usuariosAfectados.length} usuario(s) reasignado(s)`
          : 'Rol eliminado',
      );
      setDeleteOpen(false);
      setDeletingRol(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el rol');
    } finally {
      setDeleting(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setNombre('');
    setMatrix(mergeConCatalogo());
    setCollapsed({});
    setPermSearch('');
    setLegacy('');
    setShowLegacy(false);
    setOpen(true);
  };

  const openEdit = (rol: Rol) => {
    setEditingId(rol.id);
    setNombre(rol.nombre);
    setMatrix(mergeConCatalogo(rol.permisosPantalla));
    setCollapsed({});
    setPermSearch('');
    setLegacy(rol.permisos.join(', '));
    setShowLegacy(false);
    setOpen(true);
  };

  const patchKeys = (keys: string[], patch: Partial<Pick<PermisoPantalla, 'lectura' | 'escritura'>>) => {
    setMatrix((prev) => prev.map((p) => {
      if (!keys.includes(p.pantalla)) return p;
      const next = { ...p, ...patch };
      if (!next.lectura) next.escritura = false;
      return next;
    }));
  };

  const toggleModuloCompleto = (modLabel: string, pantallas: string[]) => {
    const keys = moduleKeys(modLabel, pantallas);
    const rows = keys.map((k) => byKey.get(k)!).filter(Boolean);
    const allOn = rows.every((r) => r.lectura && r.escritura);
    patchKeys(keys, allOn ? { lectura: false, escritura: false } : { lectura: true, escritura: true });
  };

  const toggleModuloColumna = (modLabel: string, pantallas: string[], col: 'lectura' | 'escritura') => {
    const keys = moduleKeys(modLabel, pantallas);
    const rows = keys.map((k) => byKey.get(k)!).filter(Boolean);
    if (col === 'lectura') {
      const all = rows.every((r) => r.lectura);
      patchKeys(keys, all ? { lectura: false, escritura: false } : { lectura: true });
      return;
    }
    const allWrite = rows.every((r) => r.escritura);
    if (allWrite) {
      patchKeys(keys, { escritura: false });
    } else {
      patchKeys(keys, { lectura: true, escritura: true });
    }
  };

  const setPantalla = (key: string, col: 'lectura' | 'escritura', value: boolean) => {
    setMatrix((prev) => prev.map((p) => {
      if (p.pantalla !== key) return p;
      if (col === 'lectura') {
        return { ...p, lectura: value, escritura: value ? p.escritura : false };
      }
      return { ...p, lectura: value ? true : p.lectura, escritura: value };
    }));
  };

  const save = async () => {
    if (editingId && isRolMaster({ id: editingId, esMaster: roles.find((r) => r.id === editingId)?.esMaster })) {
      toast.message('Rol master', {
        description: 'El Administrador se puede ver pero no editar.',
      });
      return;
    }
    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      toast.error('Completa el nombre del rol');
      return;
    }
    if (nombreTrim.length > INPUT_LIMITS.nombre) {
      toast.error(`El nombre no puede superar ${INPUT_LIMITS.nombre} caracteres`);
      return;
    }
    setSaving(true);
    try {
      const permisos = showLegacy && legacy.trim()
        ? legacy.split(',').map((p) => p.trim()).filter(Boolean)
        : codesFromMatrix(matrix);
      const payload = {
        nombre: nombreTrim,
        permisos,
        permisosPantalla: matrix,
      };
      if (editingId) await api.updateRol(editingId, payload as Parameters<typeof api.updateRol>[1]);
      else await api.createRol({ ...payload, aprobarConPin: false } as Parameters<typeof api.createRol>[0]);
      await qc.invalidateQueries({ queryKey: qk });
      toast.success(editingId ? 'Rol actualizado' : 'Rol creado');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const totalPantallas = matrix.length;
  const conEscritura = matrix.filter((p) => p.escritura).length;
  const conLectura = matrix.filter((p) => p.lectura).length;
  const editingMaster = Boolean(
    editingId && isRolMaster(roles.find((r) => r.id === editingId) ?? { id: editingId }),
  );

  const marcarVisibles = () => {
    if (!keysVisibles.length) return;
    const rows = keysVisibles.map((k) => byKey.get(k)!).filter(Boolean);
    const allOn = rows.every((r) => r.lectura && r.escritura);
    patchKeys(keysVisibles, allOn ? { lectura: false, escritura: false } : { lectura: true, escritura: true });
  };

  return (
    <div>
      <PageHeader
        title="Roles y permisos"
        breadcrumbs={['Administración']}
        subtitle="Permisos por pantalla, agrupados por módulo"
        action={(
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo rol
          </Button>
        )}
      />

      <div className="mb-3 max-w-sm">
        <Input
          value={rolSearch}
          onChange={(e) => setRolSearch(e.target.value)}
          placeholder="Buscar rol por nombre…"
          aria-label="Buscar rol"
        />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">
          Cargando…
        </div>
      ) : (
        <DataTable
          tableKey="admin.roles"
          searchPlaceholder="Buscar en la grilla…"
          columns={[
            {
              key: 'nombre',
              header: 'Rol',
              filterValue: (r) => r.nombre,
              cell: (r) => (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {r.nombre}
                  {isRolMaster(r) && (
                    <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Master
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: 'pin',
              header: 'PIN',
              sortable: false,
              cell: (r) => (isRolMaster(r) ? 'Master' : 'Por workflow'),
            },
            {
              key: 'matriz',
              header: 'Pantallas R/W',
              sortValue: (r) => (isRolMaster(r) ? 9999 : mergeConCatalogo(r.permisosPantalla).filter((p) => p.escritura).length),
              cell: (r) => {
                if (isRolMaster(r)) {
                  return (
                    <button
                      type="button"
                      className="text-xs text-[var(--color-accent-2)] underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                    >
                      Acceso total (*)
                    </button>
                  );
                }
                const list = mergeConCatalogo(r.permisosPantalla);
                const n = list.filter((p) => p.escritura).length;
                const t = list.length;
                return (
                  <button
                    type="button"
                    className="text-xs text-[var(--color-accent-2)] underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(r);
                    }}
                  >
                    {n}/{t} con escritura
                  </button>
                );
              },
            },
            {
              key: 'usuarios',
              header: 'Usuarios',
              sortValue: (r) => usuarios.filter((u) => u.rolId === r.id).length,
              cell: (r) => {
                const n = usuarios.filter((u) => u.rolId === r.id).length;
                return (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-[var(--color-accent-2)] underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(r);
                    }}
                    title="Ver usuarios asignados"
                  >
                    <Users size={12} />
                    {n}
                  </button>
                );
              },
              align: 'right',
            },
            {
              key: '_actions',
              header: '',
              align: 'right',
              sortable: false,
              hideable: false,
              cell: (r) => (
                <span className="inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    title={isRolMaster(r) ? 'Ver (solo lectura)' : 'Editar'}
                    className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(r);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title={isRolMaster(r) ? 'No se puede eliminar Administrador' : 'Eliminar'}
                    disabled={isRolMaster(r)}
                    className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDelete(r);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              ),
            },
          ]}
          rows={rolesFiltrados}
          empty={rolSearch.trim() ? 'Ningún rol coincide con la búsqueda' : 'Sin roles'}
          pagination={{ storageKey: 'erp-roles' }}
          onRowClick={openEdit}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingMaster ? 'Rol Administrador (solo lectura)' : editingId ? 'Editar rol' : 'Nuevo rol'}
        size="xl"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {editingMaster ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!editingMaster && (
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear'}
              </Button>
            )}
          </>
        )}
      >
        <div className="flex min-h-0 flex-col gap-4">
          {editingMaster && (
            <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
              Rol master del sistema: acceso total (*) permanente. Se muestra para consulta; no se puede
              editar permisos, PIN ni nombre.
            </p>
          )}
          <Field label="Nombre del rol">
            <Input
              value={nombre}
              placeholder="Digitador contratistas"
              maxLength={INPUT_LIMITS.nombre}
              disabled={editingMaster}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Field>

          <div className="min-h-0">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Permisos por pantalla</p>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                {editingMaster
                  ? 'Acceso global (*)'
                  : `Lectura ${conLectura}/${totalPantallas} · Escritura ${conEscritura}/${totalPantallas}`}
              </p>
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Input
                value={permSearch}
                placeholder="Buscar módulo o pantalla…"
                className="max-w-sm"
                onChange={(e) => setPermSearch(e.target.value)}
              />
              {permQuery && !editingMaster && (
                <Button type="button" size="sm" variant="outline" onClick={marcarVisibles} disabled={!keysVisibles.length}>
                  Marcar visibles
                </Button>
              )}
            </div>

            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
              <div className="sticky top-0 z-10 grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-muted)]">
                <span>Módulo / pantalla</span>
                <span className="text-center">Lectura</span>
                <span className="text-center">Escritura</span>
              </div>

              {modulosFiltrados.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                  Sin coincidencias para «{permSearch.trim()}»
                </p>
              ) : modulosFiltrados.map((mod) => {
                const keys = moduleKeys(mod.label, mod.pantallasVisibles);
                const rows = keys.map((k) => byKey.get(k)).filter(Boolean) as PermisoPantalla[];
                const readState = editingMaster ? 'all' as TriState : triState(rows.map((r) => r.lectura));
                const writeState = editingMaster ? 'all' as TriState : triState(rows.map((r) => r.escritura));
                const isCollapsed = Boolean(collapsed[mod.id]) && !permQuery;

                return (
                  <div key={mod.id} className="border-b border-[var(--color-border)]/70 last:border-b-0">
                    <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          className="rounded p-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                          title={isCollapsed ? 'Expandir' : 'Minimizar'}
                          onClick={() => setCollapsed((s) => ({ ...s, [mod.id]: !s[mod.id] }))}
                        >
                          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'truncate text-left text-sm font-semibold text-[var(--color-text)]',
                            !editingMaster && 'hover:underline',
                          )}
                          title={editingMaster ? undefined : 'Marcar / desmarcar pantallas visibles del módulo'}
                          disabled={editingMaster}
                          onClick={() => {
                            if (editingMaster) return;
                            toggleModuloCompleto(mod.label, mod.pantallasVisibles);
                          }}
                        >
                          {mod.label}
                        </button>
                        <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                          {editingMaster ? '*/' : `${rows.filter((r) => r.lectura).length}/`}{rows.length}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        <TriCheck
                          state={readState}
                          title="Lectura del módulo"
                          disabled={editingMaster}
                          onToggle={() => toggleModuloColumna(mod.label, mod.pantallasVisibles, 'lectura')}
                        />
                      </div>
                      <div className="flex justify-center">
                        <TriCheck
                          state={writeState}
                          title="Escritura del módulo"
                          disabled={editingMaster}
                          onToggle={() => toggleModuloColumna(mod.label, mod.pantallasVisibles, 'escritura')}
                        />
                      </div>
                    </div>

                    {!isCollapsed && mod.pantallasVisibles.map((pantalla) => {
                      const key = pantallaKey(mod.label, pantalla);
                      const row = byKey.get(key);
                      if (!row && !editingMaster) return null;
                      const lectura = editingMaster ? true : Boolean(row?.lectura);
                      const escritura = editingMaster ? true : Boolean(row?.escritura);
                      return (
                        <div
                          key={key}
                          className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 px-3 py-1.5 pl-9 hover:bg-[var(--color-surface-2)]/50"
                        >
                          <span className="truncate text-sm text-[var(--color-text)]">{pantalla}</span>
                          <div className="flex justify-center">
                            <TriCheck
                              state={lectura ? 'all' : 'none'}
                              title="Lectura"
                              disabled={editingMaster}
                              onToggle={() => setPantalla(key, 'lectura', !lectura)}
                            />
                          </div>
                          <div className="flex justify-center">
                            <TriCheck
                              state={escritura ? 'all' : 'none'}
                              title="Escritura"
                              disabled={editingMaster || !lectura}
                              onToggle={() => setPantalla(key, 'escritura', !escritura)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {editingId && (
            <div className="shrink-0 rounded-lg border border-[var(--color-border)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Usuarios con este rol ({usuariosDelRolEdit.length})
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    nav(`/admin/usuarios?rolId=${encodeURIComponent(editingId)}`);
                  }}
                >
                  Ir a Usuarios
                </Button>
              </div>
              {usuariosDelRolEdit.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Nadie tiene este rol asignado.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {usuariosDelRolEdit.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-[var(--color-surface-2)]">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{u.nombre}</span>
                        <span className="ml-2 text-xs text-[var(--color-muted)]">{u.email}</span>
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-[var(--color-accent-2)] underline"
                        onClick={() => {
                          setOpen(false);
                          nav(`/admin/usuarios?rolId=${encodeURIComponent(editingId)}&usuarioId=${encodeURIComponent(u.id)}`);
                        }}
                      >
                        Cambiar rol
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-[var(--color-border)] pt-3">
            <button
              type="button"
              className="text-xs text-[var(--color-muted)] underline"
              onClick={() => setShowLegacy((v) => !v)}
            >
              {showLegacy ? 'Ocultar códigos técnicos' : 'Mostrar códigos técnicos (avanzado)'}
            </button>
            {showLegacy && (
              <Field label="Códigos de permiso (opcional, coma)" className="mt-2">
                <Textarea
                  value={legacy}
                  placeholder="contratistas:read, contratistas:capture, contratistas:rates"
                  maxLength={INPUT_LIMITS.glosa}
                  onChange={(e) => setLegacy(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Solo para compatibilidad con el API. Si lo dejas vacío al guardar, se derivan de la matriz.
                </p>
              </Field>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteOpen(false);
          setDeletingRol(null);
        }}
        title={deletingRol ? `Eliminar rol «${deletingRol.nombre}»` : 'Eliminar rol'}
        size="lg"
        footer={(
          <>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => {
                setDeleteOpen(false);
                setDeletingRol(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? 'Eliminando…' : 'Eliminar y reasignar'}
            </Button>
          </>
        )}
      >
        {usuariosAfectados.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Este rol no tiene usuarios asignados. Se eliminará de forma definitiva.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-muted)]">
              Hay <strong>{usuariosAfectados.length}</strong> usuario(s) con este rol.
              Elige el rol de destino para todos y, si hace falta, ajústalo por usuario.
            </p>

            <Field label="Rol de destino para todos">
              <Select
                value={rolDestinoGlobal}
                onChange={(e) => aplicarRolGlobal(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {rolesAlternativos.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </Select>
            </Field>

            <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-[var(--color-border)] p-2">
              {usuariosAfectados.map((u: Usuario) => (
                <div
                  key={u.id}
                  className="grid grid-cols-1 items-center gap-2 rounded px-2 py-1.5 sm:grid-cols-[1fr_14rem]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--color-text)]">
                      {u.nombre}
                    </div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{u.email}</div>
                  </div>
                  <Select
                    value={destinoPorUsuario[u.id] ?? ''}
                    onChange={(e) => {
                      setDestinoPorUsuario((prev) => ({ ...prev, [u.id]: e.target.value }));
                    }}
                  >
                    <option value="">Seleccionar…</option>
                    {rolesAlternativos.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
