import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { Input } from '@/components/ui/input';
import { useEmpresaScopeId, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import { hasPermission } from '@/lib/permissions';
import { fmtCLP } from '@/lib/utils';
import type { TarifaContratista } from '@/types/domain';
import * as api from '@/services/api';
import {
  validateTarifaPositiva,
  validateVigenciaTarifa,
} from '@/features/contratistas/contratistas-form-validators';

export default function TarifasContratistaNivel1Page() {
  const { user } = useAuth();
  const canRates = hasPermission(user, 'contratistas:rates');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const [laborId, setLaborId] = useState('');
  const contratistas = useQuery({ queryKey: listQueryKey(scope, empresaId, 'contratistas'), queryFn: api.getContratistas });
  const centros = useQuery({ queryKey: listQueryKey(scope, empresaId, 'centros-costo'), queryFn: api.getCentrosCosto });
  const labores = useQuery({ queryKey: listQueryKey(scope, empresaId, 'labores'), queryFn: () => api.getLabores() });
  const actividades = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'actividades', laborId),
    queryFn: () => api.getActividades(laborId || undefined),
  });
  const tipos = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'tipos-contrato-contratista'),
    queryFn: api.getTiposContratoContratista,
  });

  const unidadOptions = [
    { value: 'JORNADA', label: 'Jornada' },
    { value: 'TRATO', label: 'Trato' },
  ];

  const fields: MockFormField[] = [
    { name: 'contratistaId', label: 'Contratista', type: 'select', required: true, options: (contratistas.data ?? []).filter((row) => row.activo).map((row) => ({ value: row.id, label: row.razonSocial })) },
    { name: 'tipoContratoId', label: 'Tipo de contrato', type: 'select', required: true, options: (tipos.data ?? []).filter((row) => row.activa).map((row) => ({ value: row.id, label: `${row.codigo} — ${row.nombre}` })) },
    { name: 'laborId', label: 'Labor', type: 'select', required: true, options: (labores.data ?? []).map((row) => ({ value: row.id, label: `${row.codigo} — ${row.nombre}` })) },
    { name: 'actividadId', label: 'Actividad asociada', type: 'select', required: true, options: (actividades.data ?? []).map((row) => ({ value: row.id, label: `${row.codigo} — ${row.nombre}` })) },
    { name: 'centroCostoId', label: 'Cuartel / centro de costo', type: 'select', required: true, options: (centros.data ?? []).filter((row) => row.activa).map((row) => ({ value: row.id, label: `${row.codigo} — ${row.nombre}` })) },
    { name: 'unidad', label: 'Unidad (jornada o trato)', type: 'select', required: true, options: unidadOptions },
    { name: 'tarifa', label: 'Tarifa', type: 'number', required: true, validate: validateTarifaPositiva },
    { name: 'vigenciaDesde', label: 'Vigencia desde', type: 'date', required: true },
    { name: 'vigenciaHasta', label: 'Vigencia hasta', type: 'date', validate: validateVigenciaTarifa },
  ];

  const saveInlineTarifa = async (row: TarifaContratista, raw: string) => {
    const tarifa = Number(raw);
    if (!Number.isFinite(tarifa) || tarifa <= 0) {
      toast.error('Tarifa inválida');
      return;
    }
    try {
      await api.patchTarifaContratistaInline(row.id, { tarifa });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'tarifas-contratista') });
      toast.success('Nueva vigencia creada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar');
    }
  };

  return (
    <MockListPage<TarifaContratista>
      title="Tarifas de contratista"
      breadcrumbs={['Contratistas']}
      subtitle="Edición en línea versiona la tarifa (cierra la anterior). Unidad: jornada o trato."
      queryKey="tarifas-contratista"
      queryFn={() => api.getTarifasContratista()}
      createLabel="Nueva tarifa"
      entityLabel="Tarifa"
      formFields={canRates ? fields : undefined}
      formSize="xl"
      buildMockRow={(values, id) => ({
        id: mockEntityId(id, 'TAR'), contratistaId: String(values.contratistaId), contratista: '',
        laborId: String(values.laborId), labor: '', actividadId: String(values.actividadId), actividad: '',
        tipoContratoId: String(values.tipoContratoId), tipoContrato: '', tarifa: Number(values.tarifa),
        unidad: String(values.unidad), centroCostoId: String(values.centroCostoId), centroCosto: '',
        empresaId: '', vigenciaDesde: String(values.vigenciaDesde),
        vigenciaHasta: String(values.vigenciaHasta || '') || undefined,
      })}
      rowToFormValues={(row) => ({
        contratistaId: row.contratistaId, tipoContratoId: row.tipoContratoId ?? '',
        laborId: row.laborId, actividadId: row.actividadId, centroCostoId: row.centroCostoId,
        unidad: row.unidad, tarifa: row.tarifa, vigenciaDesde: row.vigenciaDesde,
        vigenciaHasta: row.vigenciaHasta ?? '',
      })}
      onFormOpen={(values) => setLaborId(String(values.laborId || ''))}
      onFieldChange={(name, value, values) => {
        if (name !== 'laborId') return;
        setLaborId(String(value || ''));
        return { ...values, actividadId: '' };
      }}
      onSave={async (values, id) => {
        const payload = {
          contratistaId: String(values.contratistaId), tipoContratoId: String(values.tipoContratoId),
          laborId: String(values.laborId), actividadId: String(values.actividadId),
          centroCostoId: String(values.centroCostoId), unidad: String(values.unidad),
          tarifa: Number(values.tarifa), vigenciaDesde: String(values.vigenciaDesde),
          vigenciaHasta: String(values.vigenciaHasta || '') || undefined,
        };
        if (id) await api.updateTarifaContratista(String(id), payload);
        else await api.createTarifaContratista(payload);
      }}
      onDelete={canRates ? async (id) => api.deleteTarifaContratista(String(id)) : undefined}
      columns={[
        { key: 'contratista', header: 'Contratista', cell: (row) => row.contratista },
        { key: 'tipo', header: 'Tipo contrato', cell: (row) => row.tipoContrato ?? row.tipoContratoCodigo ?? '—' },
        { key: 'labor', header: 'Labor / actividad', cell: (row) => `${row.labor} · ${row.actividad}` },
        {
          key: 'tarifa',
          header: 'Tarifa (editable)',
          align: 'right',
          cell: (row) => (
            canRates ? (
              <Input
                className="max-w-[120px] text-right tabular-nums"
                defaultValue={String(row.tarifa)}
                onBlur={(e) => {
                  if (String(row.tarifa) !== e.target.value.trim()) {
                    void saveInlineTarifa(row, e.target.value.trim());
                  }
                }}
              />
            ) : fmtCLP(row.tarifa)
          ),
        },
        { key: 'unidad', header: 'Unidad', cell: (row) => row.unidad },
        { key: 'cc', header: 'Cuartel / CC', cell: (row) => row.centroCosto },
        { key: 'vigencia', header: 'Vigencia', cell: (row) => `${row.vigenciaDesde} — ${row.vigenciaHasta ?? 'abierta'}` },
      ]}
    />
  );
}
