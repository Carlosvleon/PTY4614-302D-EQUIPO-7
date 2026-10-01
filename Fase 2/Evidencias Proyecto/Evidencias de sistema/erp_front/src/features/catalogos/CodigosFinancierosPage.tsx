import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth-context';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { CatalogExcelImport } from '@/components/common/CatalogExcelImport';
import { CATALOG_EXCEL_CODIGO_KEYS } from '@/components/common/catalog-excel-import.util';
import { descargarPlantillaCodigos, exportarCodigos } from '@/features/catalogos/catalog-excel-plantilla';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import type { CodigoFinanciero, ConceptoFlujo } from '@/types/domain';
import { localIsoDate } from '@/lib/utils';
import { HINT_CODIGO_SUGERIDO, siguienteCodigoNumerico } from '@/features/catalogos/siguiente-codigo';
import * as api from '@/services/api';

const activoField: MockFormField = { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true };

const CODIGO_SOLO_DIGITOS = /^\d+$/;

export function CodigosFinancierosPage() {
  const { user } = useAuth();
  const empresaId = user?.empresaId ?? '';
  const scope = useQueryScope();
  const empresaScope = useEmpresaScopeId();
  const hoy = localIsoDate();
  const codigosQ = useQuery({
    queryKey: listQueryKey(scope, empresaScope, 'codigos-financieros'),
    queryFn: api.getCodigosFinancieros,
  });
  const conceptosQ = useQuery({
    queryKey: listQueryKey(scope, empresaScope, 'conceptos-flujo'),
    queryFn: api.getConceptosFlujo,
  });
  const siguienteCodigo = useMemo(
    () => siguienteCodigoNumerico((codigosQ.data ?? []).map((r) => r.codigo)),
    [codigosQ.data],
  );
  const conceptoOptions = useMemo(() => {
    return ((conceptosQ.data ?? []) as ConceptoFlujo[])
      .filter((c) => c.activo)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [conceptosQ.data]);

  const formFields: MockFormField[] = [
    {
      name: 'conceptoId',
      label: 'Concepto',
      type: 'select',
      required: true,
      options: conceptoOptions,
      hint: conceptoOptions.length ? undefined : 'Crea un concepto en Parametrización › Conceptos',
    },
    { name: 'codigo', label: 'Código', required: true, placeholder: '10100' },
    { name: 'nombre', label: 'Nombre', required: true },
    {
      name: 'vigenciaDesdeLabel',
      label: 'Vigente desde',
      disabled: true,
      defaultValue: hoy,
      hint: 'Fecha de alta (automática)',
    },
    activoField,
  ];

  return (
    <MockListPage<CodigoFinanciero>
      title="Códigos financieros"
      subtitle="Cuelgan de un concepto para armar el flujo de caja."
      breadcrumbs={['Parametrización']}
      queryKey="codigos-financieros"
      tableKey="catalogos.codigos-financieros"
      queryFn={api.getCodigosFinancieros}
      entityLabel="Código financiero"
      invalidateKeys={['conceptos-flujo']}
      createDefaults={{ codigo: siguienteCodigo, vigenciaDesdeLabel: hoy }}
      headerExtra={
        <CatalogExcelImport
          queryKey="codigos-financieros"
          title="Preview códigos financieros"
          hint="Descargue la plantilla (hoja Codigos financieros), reemplace la fila de ejemplo y súbala. El concepto se asigna a mano; la carga no lo borra si el código ya existía."
          onDescargarPlantilla={descargarPlantillaCodigos}
          onExportar={() => exportarCodigos(codigosQ.data ?? [])}
          historialTipo="CODIGOS_FINANCIEROS"
          columns={[
            { key: 'codigo', header: 'Código' },
            { key: 'nombre', header: 'Nombre' },
            { key: 'activa', header: 'Activa' },
          ]}
          previewFn={api.previewCodigosFinancierosExcel}
          importFn={api.importCodigosFinancierosExcel}
          importKeys={CATALOG_EXCEL_CODIGO_KEYS}
        />
      }
      resolveFormFields={({ editingId, rows }) => {
        const isEdit = editingId != null;
        const row = isEdit ? rows.find((r) => r.id === editingId) : undefined;
        const vigenteDesde = isEdit
          ? (row?.createdAt ? String(row.createdAt).slice(0, 10) : '—')
          : hoy;
        return formFields.map((f) => {
          if (f.name === 'codigo') {
            return {
              ...f,
              disabled: isEdit,
              digitsOnly: !isEdit,
              hint: isEdit ? undefined : HINT_CODIGO_SUGERIDO,
              validate: (v, _all, id) => {
                if (id != null) return null;
                const c = String(v ?? '').trim();
                if (!c) return null;
                if (!CODIGO_SOLO_DIGITOS.test(c)) return 'El código solo admite dígitos (0-9)';
                return null;
              },
            };
          }
          if (f.name === 'conceptoId') return { ...f, options: conceptoOptions };
          if (f.name === 'vigenciaDesdeLabel') {
            return { ...f, disabled: true, defaultValue: vigenteDesde };
          }
          return f;
        });
      }}
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'CF'),
        codigo: String(v.codigo).trim(),
        nombre: String(v.nombre).trim().toUpperCase(),
        activa: Boolean(v.activa),
        empresaId,
        conceptoId: String(v.conceptoId || '') || undefined,
        createdAt: id == null ? `${hoy}T00:00:00.000Z` : undefined,
      })}
      rowToFormValues={(r) => ({
        codigo: r.codigo,
        nombre: r.nombre,
        activa: r.activa,
        conceptoId: r.conceptoId ?? '',
        vigenciaDesdeLabel: r.createdAt ? String(r.createdAt).slice(0, 10) : '',
      })}
      onSave={async (values, id) => {
        const conceptoId = String(values.conceptoId ?? '').trim();
        if (!conceptoId) throw new Error('Indica el concepto');
        const codigo = String(values.codigo).trim();
        if (id == null && !CODIGO_SOLO_DIGITOS.test(codigo)) {
          throw new Error('El código solo admite dígitos (0-9)');
        }
        const payload = {
          codigo,
          nombre: String(values.nombre).trim().toUpperCase(),
          activa: Boolean(values.activa),
          conceptoId,
        };
        if (id != null) await api.updateCodigoFinanciero(String(id), payload);
        else await api.createCodigoFinanciero(payload);
      }}
      columns={[
        { key: 'concepto', header: 'Concepto', cell: (r) => r.conceptoNombre ?? r.conceptoCodigo ?? '—' },
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
