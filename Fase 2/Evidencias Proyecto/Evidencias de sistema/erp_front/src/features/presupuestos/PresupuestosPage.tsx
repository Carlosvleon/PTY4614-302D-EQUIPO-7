import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge, ProgressBar } from '@/components/common/Badges';
import { fmtCLP } from '@/lib/utils';
import type { Presupuesto } from '@/types/domain';
import * as api from '@/services/api';

export default function PresupuestosPage() {
  const formFields: MockFormField[] = [
    { name: 'anio', label: 'Año', type: 'number', defaultValue: 2026, required: true },
    { name: 'centroCosto', label: 'Centro de costo', required: true },
    { name: 'montoPresupuestado', label: 'Monto presupuestado', type: 'number', required: true },
    { name: 'montoEjecutado', label: 'Monto ejecutado', type: 'number', defaultValue: 0 },
    {
      name: 'estado', label: 'Estado', type: 'select', defaultValue: 'ACTIVO',
      options: [
        { value: 'ACTIVO', label: 'Activo' },
        { value: 'PENDIENTE', label: 'Pendiente' },
      ],
    },
  ];

  return (
    <MockListPage<Presupuesto>
      title="Presupuestos"
      subtitle="Elaboración y seguimiento vs real"
      queryKey="presupuestos"
      queryFn={api.getPresupuestos}
      createLabel="Nuevo presupuesto"
      entityLabel="Presupuesto"
      formFields={formFields}
      formSize="lg"
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'PRE'),
        anio: Number(v.anio),
        centroCosto: String(v.centroCosto),
        montoPresupuestado: Number(v.montoPresupuestado),
        montoEjecutado: Number(v.montoEjecutado) || 0,
        estado: v.estado as Presupuesto['estado'],
      })}
      rowToFormValues={(r) => ({
        anio: r.anio,
        centroCosto: r.centroCosto,
        montoPresupuestado: r.montoPresupuestado,
        montoEjecutado: r.montoEjecutado,
        estado: r.estado,
      })}
      onSave={async (values, id) => {
        const payload = {
          anio: Number(values.anio),
          centroCosto: String(values.centroCosto),
          montoPresupuestado: Number(values.montoPresupuestado),
          montoEjecutado: Number(values.montoEjecutado) || 0,
          estado: values.estado as Presupuesto['estado'],
        };
        if (id != null) await api.updatePresupuesto(String(id), payload);
        else await api.createPresupuesto(payload);
      }}
      onDelete={async (id) => {
        await api.deletePresupuesto(String(id));
      }}
      columns={[
        { key: 'anio', header: 'Año', cell: (r) => r.anio },
        { key: 'centroCosto', header: 'Centro costo', cell: (r) => r.centroCosto },
        { key: 'presup', header: 'Presupuestado', cell: (r) => fmtCLP(r.montoPresupuestado), align: 'right' },
        { key: 'ejec', header: 'Ejecutado', cell: (r) => fmtCLP(r.montoEjecutado), align: 'right' },
        { key: 'pct', header: '% Ejec.', cell: (r) => <ProgressBar value={(r.montoEjecutado / r.montoPresupuestado) * 100} /> },
        { key: 'estado', header: 'Estado', cell: (r) => <EstadoGenericoBadge estado={r.estado} /> },
      ]}
    />
  );
}
