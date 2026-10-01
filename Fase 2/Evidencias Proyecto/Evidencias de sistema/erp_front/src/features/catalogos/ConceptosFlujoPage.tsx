import { useAuth } from '@/app/auth-context';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import type { ConceptoFlujo } from '@/types/domain';
import * as api from '@/services/api';

const activoField: MockFormField = { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true };

export function ConceptosFlujoPage() {
  const { user } = useAuth();
  const empresaId = user?.empresaId ?? '';
  return (
    <MockListPage<ConceptoFlujo>
      title="Conceptos"
      subtitle="Agrupadores del flujo de caja (ítem del Excel). Los códigos financieros cuelgan de un concepto."
      breadcrumbs={['Parametrización']}
      queryKey="conceptos-flujo"
      tableKey="catalogos.conceptos-flujo"
      queryFn={api.getConceptosFlujo}
      entityLabel="Concepto"
      formFields={[
        { name: 'codigo', label: 'Código', required: true },
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'orden', label: 'Orden', type: 'number', defaultValue: 0 },
        activoField,
      ]}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'CX'),
        codigo: String(v.codigo).toUpperCase(),
        nombre: String(v.nombre),
        orden: Number(v.orden) || 0,
        activo: Boolean(v.activo),
        empresaId,
      })}
      rowToFormValues={(r) => ({
        codigo: r.codigo,
        nombre: r.nombre,
        orden: r.orden,
        activo: r.activo,
      })}
      onSave={async (values, id) => {
        const payload = {
          codigo: String(values.codigo).toUpperCase(),
          nombre: String(values.nombre),
          orden: Number(values.orden) || 0,
          activo: Boolean(values.activo),
        };
        if (id != null) await api.updateConceptoFlujo(String(id), payload);
        else await api.createConceptoFlujo(payload);
      }}
      columns={[
        { key: 'orden', header: 'Orden', cell: (r) => r.orden, align: 'right' },
        { key: 'codigo', header: 'Código', cell: (r) => r.codigo },
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        {
          key: 'activo',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activo,
          cell: (r) => <EstadoGenericoBadge estado={r.activo ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}
