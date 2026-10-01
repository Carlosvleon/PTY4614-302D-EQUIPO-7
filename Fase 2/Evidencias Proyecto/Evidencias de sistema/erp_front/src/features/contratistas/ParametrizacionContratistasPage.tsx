import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { DataTable } from '@/components/common/DataTable';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { PageHeader } from '@/components/common/PageHeader';
import { PageTabs } from '@/components/ui/page-tabs';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useEmpresaScopeId, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import { hasPermission } from '@/lib/permissions';
import type { Actividad, Labor, TipoContratoContratista, UnidadMedida } from '@/types/domain';
import * as api from '@/services/api';

const TAB_IDS = ['labores', 'actividades', 'asociaciones', 'unidades', 'tipos'] as const;
type TabId = (typeof TAB_IDS)[number];

function parseTab(raw: string | null): TabId {
  if (raw && TAB_IDS.includes(raw as TabId)) return raw as TabId;
  return 'labores';
}

const catalogFields: MockFormField[] = [
  { name: 'codigo', label: 'Código', required: true },
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
];

export default function ParametrizacionContratistasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const setTab = (id: string) => {
    setSearchParams(id === 'labores' ? {} : { tab: id }, { replace: true });
  };
  const { user } = useAuth();
  const canCatalogs = hasPermission(user, 'contratistas:catalogs');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const labores = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'labores', 'todas'),
    queryFn: () => api.getLabores({ incluirInactivas: true }),
  });
  const actividades = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'actividades'),
    queryFn: () => api.getActividades(),
  });
  const cuentas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const [laborId, setLaborId] = useState('');
  const asociaciones = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'actividades-labor', laborId, 'todas'),
    queryFn: () => api.getActividades(laborId, { incluirInactivas: true }),
    enabled: Boolean(laborId),
  });
  const [actividadId, setActividadId] = useState('');
  const [linking, setLinking] = useState(false);

  const refreshAssociations = async () => {
    await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'actividades-labor', laborId) });
    await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'actividades') });
    await asociaciones.refetch();
  };

  const link = async () => {
    if (!laborId || !actividadId) return;
    setLinking(true);
    try {
      await api.linkLaborActividad(laborId, actividadId);
      await refreshAssociations();
      setActividadId('');
      toast.success('Asociación creada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo asociar');
    } finally {
      setLinking(false);
    }
  };

  const unlink = async (id: string) => {
    setLinking(true);
    try {
      await api.unlinkLaborActividad(laborId, id);
      await refreshAssociations();
      toast.success('Asociación eliminada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la asociación');
    } finally {
      setLinking(false);
    }
  };

  const cuentaOptions = (cuentas.data ?? [])
    .filter((cuenta) => cuenta.activa && !cuenta.noImputable && cuenta.esImputable !== false)
    .map((cuenta) => ({ value: cuenta.id, label: `${cuenta.codigo} — ${cuenta.nombre}` }));
  const tabItems = useMemo(() => [
    { id: 'labores', label: 'Labores', badge: labores.data?.length },
    { id: 'actividades', label: 'Actividades', badge: actividades.data?.length },
    { id: 'asociaciones', label: 'Asociaciones' },
    { id: 'unidades', label: 'Unidades de control' },
    { id: 'tipos', label: 'Tipos de contrato' },
  ], [labores.data?.length, actividades.data?.length]);

  const tipoFields: MockFormField[] = [
    { name: 'codigo', label: 'Código', required: true },
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'cuentaDebeId', label: 'Cuenta Debe', type: 'select', required: true, options: cuentaOptions },
    { name: 'cuentaHaberId', label: 'Cuenta Haber', type: 'select', required: true, options: cuentaOptions },
    { name: 'cuentaAdministracionId', label: 'Cuenta Administración', type: 'select', required: true, options: cuentaOptions },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contratista"
        breadcrumbs={['Parametrización', 'Contratista']}
        subtitle="Catálogos del módulo: labores, actividades, vínculos, unidades y tipos de contrato."
      />

      <PageTabs tabs={tabItems} active={tab} onChange={setTab} />

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        {tab === 'labores' && (
        <MockListPage<Labor>
          title="Labores"
          createLabel="Nueva labor"
          entityLabel="labor"
          queryKey="labores"
          searchPlaceholder="Buscar código o nombre de labor…"
          queryFn={() => api.getLabores({ incluirInactivas: true })}
          formFields={canCatalogs ? catalogFields : undefined}
          buildMockRow={(values, id) => ({
            id: mockEntityId(id, 'LAB'), empresaId: '',
            codigo: String(values.codigo), nombre: String(values.nombre), activa: Boolean(values.activa),
          })}
          rowToFormValues={(row) => ({ codigo: row.codigo, nombre: row.nombre, activa: row.activa })}
          onSave={async (values, id) => {
            const payload = { codigo: String(values.codigo), nombre: String(values.nombre), activa: Boolean(values.activa) };
            if (id) await api.updateLabor(String(id), payload);
            else await api.createLabor(payload);
          }}
          columns={[
            { key: 'codigo', header: 'Código', cell: (row) => row.codigo },
            { key: 'nombre', header: 'Nombre', cell: (row) => row.nombre },
            {
              key: 'activa',
              header: 'Estado',
              filterType: 'boolean',
              filterValue: (row) => row.activa,
              cell: (row) => <Badge tone={row.activa ? 'success' : 'muted'}>{row.activa ? 'ACTIVA' : 'INACTIVA'}</Badge>,
            },
          ]}
        />
        )}

        {tab === 'actividades' && (
        <MockListPage<Actividad>
          title="Actividades"
          createLabel="Nueva actividad"
          entityLabel="actividad"
          queryKey="actividades"
          searchPlaceholder="Buscar código o nombre de actividad…"
          queryFn={() => api.getActividades()}
          formFields={canCatalogs ? catalogFields : undefined}
          buildMockRow={(values, id) => ({
            id: mockEntityId(id, 'ACT'), empresaId: '',
            codigo: String(values.codigo), nombre: String(values.nombre), activa: Boolean(values.activa),
          })}
          rowToFormValues={(row) => ({ codigo: row.codigo, nombre: row.nombre, activa: row.activa })}
          onSave={async (values, id) => {
            const payload = { codigo: String(values.codigo), nombre: String(values.nombre), activa: Boolean(values.activa) };
            if (id) await api.updateActividad(String(id), payload);
            else await api.createActividad(payload);
          }}
          columns={[
            { key: 'codigo', header: 'Código', cell: (row) => row.codigo },
            { key: 'nombre', header: 'Nombre', cell: (row) => row.nombre },
            {
              key: 'activa',
              header: 'Estado',
              filterType: 'boolean',
              filterValue: (row) => row.activa,
              cell: (row) => <Badge tone={row.activa ? 'success' : 'muted'}>{row.activa ? 'ACTIVA' : 'INACTIVA'}</Badge>,
            },
          ]}
        />
        )}

        {tab === 'asociaciones' && (
        <>
        <h2 className="mb-1 font-semibold">Asociaciones labor ↔ actividad</h2>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Alta con los selectores; el listado inferior escala con búsqueda y paginación (típico: decenas por labor, no miles).
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Labor" required>
            <Select value={laborId} onChange={(event) => { setLaborId(event.target.value); setActividadId(''); }} required>
              <option value="">Seleccionar…</option>
              {(labores.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.codigo} — {row.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Actividad" required>
            <Select value={actividadId} onChange={(event) => setActividadId(event.target.value)} disabled={!canCatalogs || !laborId} required>
              <option value="">Seleccionar…</option>
              {(actividades.data ?? [])
                .filter((row) => !(asociaciones.data ?? []).some((linked) => linked.id === row.id))
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.codigo} — {row.nombre}
                    {!row.activa ? ' (inactiva)' : ''}
                  </option>
                ))}
            </Select>
          </Field>
          {canCatalogs && <Button disabled={!laborId || !actividadId || linking} onClick={() => void link()}>Asociar</Button>}
        </div>
        <div className="mt-4">
          {!laborId ? (
            <p className="text-sm text-[var(--color-muted)]">Selecciona una labor para ver y editar sus actividades asociadas.</p>
          ) : asociaciones.isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Cargando asociaciones…</p>
          ) : (
            <>
              <DataTable<Actividad>
                columns={[
                  { key: 'codigo', header: 'Código', cell: (row) => row.codigo },
                  { key: 'nombre', header: 'Nombre', cell: (row) => row.nombre },
                  {
                    key: 'activa',
                    header: 'Estado',
                    filterType: 'boolean',
                    filterValue: (row) => row.activa,
                    cell: (row) => (
                      <Badge tone={row.activa ? 'success' : 'muted'}>{row.activa ? 'ACTIVA' : 'INACTIVA'}</Badge>
                    ),
                  },
                  {
                    key: '_unlink',
                    header: '',
                    sortable: false,
                    filterable: false,
                    hideable: false,
                    align: 'right',
                    cell: (row) => canCatalogs ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={linking}
                        className="text-[var(--color-danger)]"
                        onClick={() => void unlink(row.id)}
                      >
                        Quitar
                      </Button>
                    ) : null,
                  },
                ]}
                rows={asociaciones.data ?? []}
                empty="Sin actividades asociadas. Usa «Asociar» arriba."
                searchPlaceholder="Buscar actividad asociada…"
                pagination={{ storageKey: 'erp-actividades-labor-linked' }}
                maxHeight="min(50vh, 22rem)"
                showColumnMenu={false}
              />
              {!(asociaciones.data ?? []).length && (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  Elige actividad en el selector y pulsa «Asociar».
                </p>
              )}
            </>
          )}
        </div>
        </>
        )}

        {tab === 'unidades' && (
        <MockListPage<UnidadMedida>
          title="Unidades de control"
          createLabel="Nueva unidad"
          entityLabel="unidad"
          queryKey="unidades"
          searchPlaceholder="Buscar unidad (HR, HA, UN…)…"
          queryFn={api.getUnidades}
          formFields={canCatalogs ? catalogFields : undefined}
          buildMockRow={(values, id) => ({
            id: mockEntityId(id, 'UM'), codigo: String(values.codigo),
            nombre: String(values.nombre), activa: Boolean(values.activa),
          })}
          rowToFormValues={(row) => ({ codigo: row.codigo, nombre: row.nombre, activa: row.activa })}
          onSave={async (values, id) => {
            const payload = { codigo: String(values.codigo), nombre: String(values.nombre), activa: Boolean(values.activa) };
            if (id) await api.updateUnidad(String(id), payload);
            else await api.createUnidad(payload);
          }}
          columns={[
            { key: 'codigo', header: 'Código', cell: (row) => row.codigo },
            { key: 'nombre', header: 'Nombre', cell: (row) => row.nombre },
            { key: 'activa', header: 'Estado', cell: (row) => row.activa ? 'Activa' : 'Inactiva' },
          ]}
        />
        )}

        {tab === 'tipos' && (
        <MockListPage<TipoContratoContratista>
          title="Tipos de contrato"
          createLabel="Nuevo tipo de contrato"
          entityLabel="tipo de contrato"
          queryKey="tipos-contrato-contratista"
          searchPlaceholder="Buscar tipo de contrato…"
          queryFn={api.getTiposContratoContratista}
          formFields={canCatalogs ? tipoFields : undefined}
          formSize="xl"
          buildMockRow={(values, id) => ({
            id: mockEntityId(id, 'TCC'),
            codigo: String(values.codigo), nombre: String(values.nombre),
            cuentaDebeId: String(values.cuentaDebeId), cuentaHaberId: String(values.cuentaHaberId),
            cuentaAdministracionId: String(values.cuentaAdministracionId), activa: Boolean(values.activa),
          })}
          rowToFormValues={(row) => ({
            codigo: row.codigo, nombre: row.nombre, cuentaDebeId: row.cuentaDebeId,
            cuentaHaberId: row.cuentaHaberId, cuentaAdministracionId: row.cuentaAdministracionId,
            activa: row.activa,
          })}
          onSave={async (values, id) => {
            const payload = {
              codigo: String(values.codigo), nombre: String(values.nombre),
              cuentaDebeId: String(values.cuentaDebeId), cuentaHaberId: String(values.cuentaHaberId),
              cuentaAdministracionId: String(values.cuentaAdministracionId), activa: Boolean(values.activa),
            };
            if (id) await api.updateTipoContratoContratista(String(id), payload);
            else await api.createTipoContratoContratista(payload);
          }}
          columns={[
            { key: 'codigo', header: 'Código', cell: (row) => row.codigo },
            { key: 'nombre', header: 'Nombre', cell: (row) => row.nombre },
            { key: 'debe', header: 'Cuenta Debe', cell: (row) => row.cuentaDebe ? `${row.cuentaDebe.codigo} — ${row.cuentaDebe.nombre}` : row.cuentaDebeId },
            { key: 'haber', header: 'Cuenta Haber', cell: (row) => row.cuentaHaber ? `${row.cuentaHaber.codigo} — ${row.cuentaHaber.nombre}` : row.cuentaHaberId },
            { key: 'admin', header: 'Administración', cell: (row) => row.cuentaAdministracion ? `${row.cuentaAdministracion.codigo} — ${row.cuentaAdministracion.nombre}` : row.cuentaAdministracionId },
            { key: 'activa', header: 'Estado', cell: (row) => row.activa ? 'Activa' : 'Inactiva' },
          ]}
        />
        )}
      </section>
    </div>
  );
}
