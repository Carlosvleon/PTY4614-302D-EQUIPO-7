import { useAuth } from '@/app/auth-context';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import type { AreaNegocio } from '@/types/domain';
import { CatalogoImportacionesHistorial } from '@/components/common/CatalogoImportacionesHistorial';
import * as api from '@/services/api';

const activoField: MockFormField = { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true };

export function AreasNegocioPage() {
  const { user } = useAuth();
  const empresaId = user?.empresaId ?? '';
  return (
    <MockListPage<AreaNegocio>
      title="Áreas de negocio"
      breadcrumbs={['Parametrización']}
      queryKey="areas-negocio"
      tableKey="catalogos.areas-negocio"
      queryFn={api.getAreasNegocio}
      headerExtra={<CatalogoImportacionesHistorial tipo="AREAS_NEGOCIO" />}
      entityLabel="Área de negocio"
      formFields={[
        { name: 'codigo', label: 'Código', required: true },
        { name: 'nombre', label: 'Nombre', required: true },
        activoField,
      ]}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'AN'),
        codigo: String(v.codigo).toUpperCase(),
        nombre: String(v.nombre),
        activa: Boolean(v.activa),
        empresaId,
      })}
      rowToFormValues={(r) => ({ codigo: r.codigo, nombre: r.nombre, activa: r.activa })}
      onSave={async (values, id) => {
        const payload = {
          codigo: String(values.codigo).toUpperCase(),
          nombre: String(values.nombre),
          activa: Boolean(values.activa),
        };
        if (id != null) await api.updateAreaNegocio(String(id), payload);
        else await api.createAreaNegocio(payload);
      }}
      invalidateKeys={['cuentas']}
      columns={[
        { key: 'codigo', header: 'Código', cell: (r) => r.codigo },
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        {
          key: 'activa',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activa,
          cell: (r) => <EstadoGenericoBadge estado={r.activa ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}
