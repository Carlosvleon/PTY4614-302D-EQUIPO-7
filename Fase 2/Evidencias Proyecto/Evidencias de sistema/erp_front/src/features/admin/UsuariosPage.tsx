import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { Checkbox } from '@/components/ui/checkbox';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import type { GrupoAprobacion, Usuario } from '@/types/domain';
import * as api from '@/services/api';
import { useAuth } from '@/app/auth-context';
import { useAppSettings } from '@/app/app-settings-context';
import { isAdminRolId } from '@/lib/adminRol';
import { esUsuarioMantenedor } from '@/lib/permissions';
import { mensajeGruposCadenaFaltantes, WORKFLOW_MODULOS_UI } from '@/lib/workflowAprobacion';

function idsEmpresaUsuario(u: Usuario): string[] {
  return u.empresaIds?.length ? u.empresaIds : [u.empresaId];
}

function usuarioAccedeEmpresa(u: Usuario, empresaId: string): boolean {
  if (!empresaId || empresaId === 'none') return true;
  return idsEmpresaUsuario(u).includes(empresaId);
}

function idsMiembrosGrupo(g: GrupoAprobacion): string[] {
  if (g.miembroIds?.length) return g.miembroIds;
  return (g.miembros ?? []).map((m) => m.id);
}

/** Módulo de aprobación para filtro/asignación (?sinGrupo=Compras). */
function normalizeModuloSinGrupo(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v || v === '0' || v.toLowerCase() === 'false') return null;
  if (v === '1' || v.toLowerCase() === 'true') return 'Compras';
  return v;
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const puedeMantenerUsuarios = esUsuarioMantenedor(user);
  const { empresas, selectedEmpresa } = useAppSettings();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const filtroRolId = params.get('rolId') ?? '';
  const filtroSinGrupoModulo = normalizeModuloSinGrupo(params.get('sinGrupo'));
  const [verTodasEmpresas, setVerTodasEmpresas] = useState(false);
  const puedeVerHolding = empresas.length > 1;

  useEffect(() => {
    setVerTodasEmpresas(false);
  }, [empresaId]);

  const rolesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'roles'),
    queryFn: api.getRoles,
  });

  const usuariosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'usuarios'),
    queryFn: api.getUsuarios,
  });

  const gruposQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'grupos-aprobacion'),
    queryFn: api.getGruposAprobacion,
  });

  const rolOptions = useMemo(
    () => (rolesQ.data ?? []).map((r) => ({ value: r.id, label: r.nombre })),
    [rolesQ.data],
  );

  const empresaOptions = useMemo(
    () => empresas.map((e) => ({ value: e.id, label: `${e.razonSocial} (${e.rut})` })),
    [empresas],
  );

  const jefeOptions = useMemo(
    () => [
      { value: '', label: 'Sin jefe' },
      ...(usuariosQ.data ?? [])
        .filter((u) => u.activo)
        .filter((u) => verTodasEmpresas || usuarioAccedeEmpresa(u, empresaId))
        .map((u) => ({ value: u.id, label: u.nombre })),
    ],
    [usuariosQ.data, verTodasEmpresas, empresaId],
  );

  const gruposActivos = useMemo(
    () => ((gruposQ.data ?? []) as GrupoAprobacion[]).filter((g) => g.activo),
    [gruposQ.data],
  );

  const gruposFormOptions = useMemo(
    () =>
      gruposActivos.map((g) => ({
        value: g.id,
        label: `${g.nombre} (${WORKFLOW_MODULOS_UI.find((m) => m.value === g.modulo)?.label ?? g.modulo})`,
      })),
    [gruposActivos],
  );

  const gruposPorUsuario = useMemo(() => {
    const map = new Map<string, GrupoAprobacion[]>();
    for (const g of gruposActivos) {
      for (const mid of idsMiembrosGrupo(g)) {
        const list = map.get(mid) ?? [];
        list.push(g);
        map.set(mid, list);
      }
    }
    return map;
  }, [gruposActivos]);

  const idsSinGrupoModulo = useMemo(() => {
    if (!filtroSinGrupoModulo) return null;
    const asignados = new Set<string>();
    for (const g of gruposActivos.filter((x) => x.modulo === filtroSinGrupoModulo)) {
      for (const id of idsMiembrosGrupo(g)) asignados.add(id);
    }
    return asignados;
  }, [filtroSinGrupoModulo, gruposActivos]);

  const rolNombre = (rolId: string) =>
    rolOptions.find((o) => o.value === rolId)?.label
    ?? rolesQ.data?.find((r) => r.id === rolId)?.nombre
    ?? rolId;

  const formFields: MockFormField[] = [
    { name: 'nombre', label: 'Nombre', required: true, kind: 'nombre' },
    { name: 'email', label: 'Email', type: 'email', placeholder: 'usuario@almahue.cl', required: true },
    {
      name: 'rolId',
      label: 'Rol',
      type: 'select',
      required: true,
      options: rolOptions.length
        ? rolOptions
        : [{ value: '', label: rolesQ.isLoading ? 'Cargando roles…' : 'Sin roles disponibles' }],
    },
    {
      name: 'empresaIds',
      label: 'Empresas (acceso)',
      type: 'multicheck',
      required: true,
      options: empresaOptions,
      defaultValue: empresaId !== 'none' ? empresaId : (user?.empresaId ?? ''),
    },
    {
      name: 'password',
      label: 'Contraseña',
      placeholder: 'Obligatoria al crear',
      type: 'password',
      minLength: 6,
      required: true,
    },
    {
      name: 'rolVigenciaDesde',
      label: 'Rol vigente desde (opcional)',
      type: 'date',
    },
    {
      name: 'rolVigenciaHasta',
      label: 'Rol vigente hasta (opcional)',
      type: 'date',
    },
    {
      name: 'jefeId',
      label: 'Jefe directo',
      type: 'select',
      options: [{ value: '', label: 'Sin jefe' }],
    },
    // Tope por usuario oculto en UI (demo): la cadena usa escalas/grupos.
    // Pendiente: quitar montoMaxAprobacion del API/DTO de usuarios en back.
    {
      name: 'grupoAprobacionIds',
      label: 'Grupos de aprobación',
      type: 'multicheck',
      options: gruposFormOptions,
      hint: gruposQ.isLoading
        ? 'Cargando grupos…'
        : gruposFormOptions.length
          ? 'Obligatorio un grupo de Compras si el rol escribe OC. El Administrador master no va en grupos. También se edita en Reglas de aprobación → Grupos.'
          : 'Sin grupos activos en esta empresa. Créelos en Reglas de aprobación.',
      defaultValue: '',
    },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
  ];

  const subtitleParts: string[] = [];
  if (!verTodasEmpresas && selectedEmpresa) {
    subtitleParts.push(`${selectedEmpresa.razonSocial} · ${selectedEmpresa.rut}`);
  } else if (verTodasEmpresas) {
    subtitleParts.push('Todas las empresas');
  }
  if (filtroRolId) subtitleParts.push(`Filtrado por rol ${rolNombre(filtroRolId)}`);
  if (filtroSinGrupoModulo) {
    subtitleParts.push(`Usuarios sin grupo de aprobación (${filtroSinGrupoModulo})`);
  }

  return (
    <MockListPage<Usuario>
      title="Usuarios"
      breadcrumbs={['Administración']}
      subtitle={subtitleParts.length ? subtitleParts.join(' · ') : undefined}
      queryKey="usuarios"
      tableKey="admin.usuarios"
      queryFn={api.getUsuarios}
      filterRows={(rows) => {
        let out = rows;
        if (!verTodasEmpresas) {
          out = out.filter((r) => usuarioAccedeEmpresa(r, empresaId));
        }
        if (filtroRolId) out = out.filter((r) => r.rolId === filtroRolId);
        if (idsSinGrupoModulo) {
          out = out.filter((r) => r.activo && !idsSinGrupoModulo.has(r.id));
        }
        return out;
      }}
      createLabel="Nuevo usuario"
      entityLabel="Usuario"
      formFields={puedeMantenerUsuarios ? formFields : undefined}
      resolveFormFields={puedeMantenerUsuarios ? (({ editingId, rows }) => {
        const editing = editingId != null
          ? rows.find((r) => String(r.id) === String(editingId))
          : undefined;
        const masterUser = Boolean(editing && isAdminRolId(editing.rolId));
        return formFields.map((f) => {
          if (f.name === 'password') {
            if (editingId != null) {
              return {
                ...f,
                label: 'Restablecer contraseña de este usuario',
                placeholder: 'Vacío = no cambiar',
                hint: 'Vacío = no cambiar',
                required: false,
              };
            }
            return {
              ...f,
              label: 'Contraseña',
              placeholder: 'Obligatoria al crear',
              required: true,
            };
          }
          if (f.name === 'jefeId') {
            const opts = editingId != null
              ? jefeOptions.filter((o) => o.value === '' || o.value !== String(editingId))
              : jefeOptions;
            return { ...f, options: opts };
          }
          if (f.name === 'grupoAprobacionIds') {
            return { ...f, options: gruposFormOptions };
          }
          if (!masterUser) return f;
          if (f.name === 'rolId') {
            return {
              ...f,
              disabled: true,
              hint: 'Usuario master: el rol Administrador no se puede cambiar',
            };
          }
          if (f.name === 'activo') {
            return {
              ...f,
              disabled: true,
              hint: 'Usuario master: no se puede desactivar',
            };
          }
          return f;
        });
      }) : undefined}
      formSize="lg"
      createDefaults={empresaId !== 'none' ? { empresaIds: empresaId } : undefined}
      buildMockRow={puedeMantenerUsuarios ? ((v, id) => {
        const ids = String(v.empresaIds ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        const primary = ids[0] || user?.empresaId || 'EMP-1';
        return {
          id: mockEntityId(id, 'U'),
          nombre: String(v.nombre),
          email: String(v.email),
          rolId: String(v.rolId),
          rolNombre: rolNombre(String(v.rolId)),
          empresaId: primary,
          empresaIds: ids.length ? ids : [primary],
          activo: Boolean(v.activo),
          rolVigenciaDesde: v.rolVigenciaDesde ? String(v.rolVigenciaDesde) : undefined,
          rolVigenciaHasta: v.rolVigenciaHasta ? String(v.rolVigenciaHasta) : undefined,
        };
      }) : undefined}
      rowToFormValues={puedeMantenerUsuarios ? ((r) => {
        const gruposUser = (gruposPorUsuario.get(r.id) ?? []).map((g) => g.id);
        return {
          nombre: r.nombre,
          email: r.email,
          rolId: r.rolId,
          empresaIds: (r.empresaIds?.length ? r.empresaIds : [r.empresaId]).join(','),
          activo: r.activo,
          password: '',
          rolVigenciaDesde: r.rolVigenciaDesde ?? '',
          rolVigenciaHasta: r.rolVigenciaHasta ?? '',
          jefeId: r.jefeId ?? '',
          grupoAprobacionIds: gruposUser.join(','),
        };
      }) : undefined}
      onSave={puedeMantenerUsuarios ? (async (values, id) => {
        const rolId = String(values.rolId || '');
        if (!rolId) throw new Error('Selecciona un rol');
        const empresaIds = String(values.empresaIds ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (!empresaIds.length) throw new Error('Selecciona al menos una empresa');
        const password = String(values.password ?? '').trim();
        if (id == null && password.length < 6) {
          throw new Error('La contraseña es obligatoria al crear (mín. 6 caracteres)');
        }
        if (password && password.length < 6) {
          throw new Error('La contraseña debe tener al menos 6 caracteres');
        }
        const selectedGrupoIds = new Set(
          String(values.grupoAprobacionIds ?? '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        );
        const rol = (rolesQ.data ?? []).find((r) => r.id === rolId);
        if (!isAdminRolId(rolId)) {
          const falta = mensajeGruposCadenaFaltantes(
            rol?.permisos,
            selectedGrupoIds,
            gruposActivos,
          );
          if (falta) throw new Error(falta);
        }
        const payload = {
          nombre: String(values.nombre),
          email: String(values.email),
          rolId,
          empresaId: empresaIds[0],
          empresaIds,
          activo: Boolean(values.activo),
          rolVigenciaDesde: String(values.rolVigenciaDesde ?? '').trim() || undefined,
          rolVigenciaHasta: String(values.rolVigenciaHasta ?? '').trim() || undefined,
          jefeId: String(values.jefeId ?? '').trim() || null,
          ...(password ? { password } : {}),
        };
        let usuarioId = id != null ? String(id) : '';
        if (id != null) await api.updateUsuario(usuarioId, payload);
        else {
          const created = await api.createUsuario(payload);
          usuarioId = String(created.id);
        }

        const gruposModulo = isAdminRolId(rolId) ? [] : gruposActivos;
        if (usuarioId && gruposModulo.length) {
          for (const g of gruposModulo) {
            const members = new Set(g.miembroIds ?? []);
            const shouldBe = selectedGrupoIds.has(g.id);
            const isMember = members.has(usuarioId);
            if (shouldBe === isMember) continue;
            if (shouldBe) members.add(usuarioId);
            else {
              // No quitar al aprobador inicial: seguiría siendo entrada del grupo.
              if (g.aprobadorInicialId === usuarioId) continue;
              members.delete(usuarioId);
            }
            await api.updateGrupoAprobacion(g.id, {
              nombre: g.nombre,
              modulo: g.modulo,
              aprobadorInicialId: g.aprobadorInicialId,
              miembroIds: [...members],
              activo: g.activo,
            });
          }
          await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'grupos-aprobacion') });
        }
      }) : undefined}
      columns={[
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        { key: 'email', header: 'Email', cell: (r) => r.email },
        {
          key: 'rol',
          header: 'Rol',
          sortValue: (r) => r.rolNombre,
          filterValue: (r) => r.rolNombre,
          cell: (r) => (
            <span className="inline-flex flex-wrap items-center gap-2">
              {r.rolNombre}
              {isAdminRolId(r.rolId) && (
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Master
                </span>
              )}
            </span>
          ),
        },
        {
          key: 'gruposAprobacion',
          header: 'Grupos aprobación',
          sortValue: (r) => (gruposPorUsuario.get(r.id) ?? []).map((g) => g.nombre).join(', '),
          filterValue: (r) => (gruposPorUsuario.get(r.id) ?? []).map((g) => g.nombre).join(' '),
          cell: (r) => {
            const gs = gruposPorUsuario.get(r.id) ?? [];
            if (!gs.length) {
              if (isAdminRolId(r.rolId)) {
                return <span className="text-[var(--color-muted)]">No aplica (Administrador)</span>;
              }
              return (
                <span className="text-amber-700 dark:text-amber-300">Sin grupo en esta empresa</span>
              );
            }
            return gs.map((g) => `${g.nombre} (${g.modulo})`).join(', ');
          },
        },
        {
          key: 'vigencia',
          header: 'Vigencia rol',
          sortValue: (r) => r.rolVigenciaHasta ?? r.rolVigenciaDesde ?? '',
          cell: (r) => {
            if (!r.rolVigenciaDesde && !r.rolVigenciaHasta) return '—';
            return `${r.rolVigenciaDesde ?? '…'} → ${r.rolVigenciaHasta ?? '…'}`;
          },
        },
        {
          key: 'empresas',
          header: 'Empresas',
          sortValue: (r) => (r.empresaIds ?? [r.empresaId]).join(','),
          cell: (r) => {
            const ids = r.empresaIds?.length ? r.empresaIds : [r.empresaId];
            const labels = ids.map((eid) => empresas.find((e) => e.id === eid)?.razonSocial ?? eid);
            return labels.join(', ');
          },
        },
        {
          key: 'jefe',
          header: 'Jefe',
          sortValue: (r) => r.jefeNombre ?? '',
          cell: (r) => r.jefeNombre ?? '—',
        },
        {
          key: 'activo',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activo,
          cell: (r) => <EstadoGenericoBadge estado={r.activo ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
      filters={
        puedeVerHolding || filtroSinGrupoModulo ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {puedeVerHolding ? (
            <Checkbox
              checked={verTodasEmpresas}
              onChange={(e) => setVerTodasEmpresas(e.target.checked)}
              label="Mostrar todas las empresas"
            />
          ) : null}
          {filtroSinGrupoModulo ? (
          <p className="text-sm text-[var(--color-muted)]">
            Filtro activo: sin grupo ({filtroSinGrupoModulo}).{' '}
            <Link to="/admin/usuarios" className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300">
              Quitar filtro
            </Link>
            {' · '}
            <Link
              to="/admin/aprobaciones"
              className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Ir a Reglas de aprobación
            </Link>
          </p>
          ) : null}
        </div>
        ) : undefined
      }
    />
  );
}
