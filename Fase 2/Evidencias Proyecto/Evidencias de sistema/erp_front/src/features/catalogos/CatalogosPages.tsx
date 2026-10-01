import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth-context';
import { useAppSettings } from '@/app/app-settings-context';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { CatalogExcelImport } from '@/components/common/CatalogExcelImport';
import { CATALOG_EXCEL_CENTRO_KEYS } from '@/components/common/catalog-excel-import.util';
import { descargarPlantillaCentros, exportarCentros } from '@/features/catalogos/catalog-excel-plantilla';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import type { Moneda, UnidadMedida, CentroCosto, TipoDocumento } from '@/types/domain';
import { localIsoDate } from '@/lib/utils';
import { HINT_CODIGO_SUGERIDO, siguienteCodigoNumerico } from '@/features/catalogos/siguiente-codigo';
import * as api from '@/services/api';

const activoField: MockFormField = { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true };

const CODIGO_SOLO_DIGITOS = /^\d+$/;

function validateCodigoNuevo(
  value: string | number | boolean,
  _all: Record<string, string | number | boolean>,
  editingId: string | number | null,
): string | null {
  if (editingId != null) return null;
  const c = String(value ?? '').trim();
  if (!c) return null;
  if (!CODIGO_SOLO_DIGITOS.test(c)) return 'El código solo admite dígitos (0-9)';
  return null;
}

export default function MonedasPage() {
  const formFields: MockFormField[] = [
    { name: 'codigo', label: 'Código', placeholder: 'CLP', required: true },
    { name: 'nombre', label: 'Nombre', placeholder: 'Peso chileno', required: true },
    { name: 'simbolo', label: 'Símbolo', placeholder: '$', required: true },
    activoField,
  ];

  return (
    <MockListPage<Moneda>
      title="Monedas"
      breadcrumbs={['Parametrización']}
      queryKey="monedas"
      tableKey="catalogos.monedas"
      queryFn={api.getMonedas}
      createLabel="Nueva moneda"
      entityLabel="Moneda"
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'MON'),
        codigo: String(v.codigo).toUpperCase(),
        nombre: String(v.nombre),
        simbolo: String(v.simbolo),
        activa: Boolean(v.activa),
        focoReporteria: ['CLP', 'USD', 'CNY', 'EUR'].includes(String(v.codigo).toUpperCase()),
      })}
      rowToFormValues={(r) => ({ codigo: r.codigo, nombre: r.nombre, simbolo: r.simbolo, activa: r.activa })}
      onSave={async (values, id) => {
        const codigo = String(values.codigo).toUpperCase();
        const payload = {
          codigo,
          nombre: String(values.nombre),
          simbolo: String(values.simbolo),
          activa: Boolean(values.activa),
          focoReporteria: ['CLP', 'USD', 'CNY', 'EUR'].includes(codigo),
        };
        if (id != null) await api.updateMoneda(String(id), payload);
        else await api.createMoneda(payload);
      }}
      invalidateKeys={['pagos', 'anticipos-productores', 'ordenes-compra', 'recepciones-oc']}
      columns={[
        { key: 'codigo', header: 'Código', cell: (r) => <span className="font-mono">{r.codigo}</span> },
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        { key: 'simbolo', header: 'Símbolo', cell: (r) => r.simbolo },
        {
          key: 'foco',
          header: 'Foco',
          filterType: 'boolean',
          filterValue: (r) => r.focoReporteria,
          sortValue: (r) => r.focoReporteria,
          cell: (r) => (r.focoReporteria ? 'Sí' : 'No'),
        },
        {
          key: 'activa',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activa,
          sortValue: (r) => r.activa,
          cell: (r) => <EstadoGenericoBadge estado={r.activa ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}

export function UnidadesPage() {
  const formFields: MockFormField[] = [
    { name: 'codigo', label: 'Código', placeholder: 'KG', required: true },
    { name: 'nombre', label: 'Nombre', placeholder: 'Kilogramo', required: true },
    activoField,
  ];

  return (
    <MockListPage<UnidadMedida>
      title="Unidades de medida"
      breadcrumbs={['Parametrización']}
      queryKey="unidades"
      queryFn={api.getUnidades}
      createLabel="Nueva unidad"
      entityLabel="Unidad"
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'UM'),
        codigo: String(v.codigo).toUpperCase(),
        nombre: String(v.nombre),
        activa: Boolean(v.activa),
      })}
      rowToFormValues={(r) => ({ codigo: r.codigo, nombre: r.nombre, activa: r.activa })}
      onSave={async (values, id) => {
        const payload = {
          codigo: String(values.codigo).toUpperCase(),
          nombre: String(values.nombre),
          activa: Boolean(values.activa),
        };
        if (id != null) await api.updateUnidad(String(id), payload);
        else await api.createUnidad(payload);
      }}
      invalidateKeys={['insumos', 'movimientos-bodega']}
      columns={[
        { key: 'codigo', header: 'Código', cell: (r) => r.codigo },
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        {
          key: 'activa',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activa,
          filterOptions: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          cell: (r) => <EstadoGenericoBadge estado={r.activa ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}

export function CentrosCostoPage() {
  const { user } = useAuth();
  const { selectedEmpresa } = useAppSettings();
  const empresaId = selectedEmpresa?.id ?? user?.empresaId ?? '';
  const empresaNombre = selectedEmpresa?.razonSocial ?? user?.empresa ?? '';
  const hoy = localIsoDate();
  const scope = useQueryScope();
  const empresaScope = useEmpresaScopeId();
  const centrosQ = useQuery({
    queryKey: listQueryKey(scope, empresaScope, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const siguienteCodigo = useMemo(
    () => siguienteCodigoNumerico((centrosQ.data ?? []).map((r) => r.codigo)),
    [centrosQ.data],
  );

  const formFields: MockFormField[] = [
    {
      name: 'codigo',
      label: 'Código',
      placeholder: '10100',
      required: true,
      digitsOnly: true,
      hint: HINT_CODIGO_SUGERIDO,
      validate: validateCodigoNuevo,
    },
    { name: 'nombre', label: 'Nombre', placeholder: 'ADMINISTRACIÓN', required: true },
    { name: 'contactoEncargado', label: 'Contacto / encargado (opcional)', placeholder: 'Mario González' },
    {
      name: 'vigenciaDesde',
      label: 'Vigencia desde',
      type: 'date',
      defaultValue: hoy,
      disabled: true,
      hint: 'Se asigna automáticamente con la fecha de alta',
    },
    activoField,
  ];

  return (
    <MockListPage<CentroCosto>
      title="Centros de costo"
      breadcrumbs={['Parametrización']}
      queryKey="centros-costo"
      tableKey="catalogos.centros-costo"
      queryFn={api.getCentrosCosto}
      createLabel="Nuevo centro"
      entityLabel="Centro de costo"
      enableExport
      exportFilename="centros-costo"
      createDefaults={{ codigo: siguienteCodigo, vigenciaDesde: hoy }}
      resolveFormFields={({ editingId }) =>
        formFields.map((f) => {
          if (f.name === 'codigo') return { ...f, disabled: editingId != null };
          if (f.name === 'vigenciaDesde') return { ...f, disabled: true };
          return f;
        })
      }
      headerExtra={
        <CatalogExcelImport
          queryKey="centros-costo"
          title="Preview centros de costo"
          hint="Descargue la plantilla (hoja Centros de costo), reemplace la fila de ejemplo y súbala. Exportar baja lo cargado en ese mismo formato."
          onDescargarPlantilla={descargarPlantillaCentros}
          onExportar={() => exportarCentros(centrosQ.data ?? [])}
          columns={[
            { key: 'codigo', header: 'Código' },
            { key: 'nombre', header: 'Nombre' },
            { key: 'contactoEncargado', header: 'Encargado' },
            { key: 'activa', header: 'Activa' },
          ]}
          previewFn={api.previewCentrosCostoExcel}
          importFn={api.importCentrosCostoExcel}
          importKeys={CATALOG_EXCEL_CENTRO_KEYS}
          historialTipo="CENTROS_COSTO"
        />
      }
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'CC'),
        codigo: String(v.codigo).trim(),
        nombre: String(v.nombre).trim().toUpperCase(),
        activa: Boolean(v.activa),
        empresaId,
        empresaNombre,
        vigenciaDesde: String(v.vigenciaDesde || hoy),
        contactoEncargado: String(v.contactoEncargado || '') || undefined,
      })}
      rowToFormValues={(r) => ({
        codigo: r.codigo,
        nombre: r.nombre,
        activa: r.activa,
        vigenciaDesde: r.vigenciaDesde ?? '',
        contactoEncargado: r.contactoEncargado ?? '',
      })}
      onSave={async (values, id) => {
        const codigo = String(values.codigo).trim();
        if (id == null && !CODIGO_SOLO_DIGITOS.test(codigo)) {
          throw new Error('El código solo admite dígitos (0-9)');
        }
        const payload = {
          codigo,
          nombre: String(values.nombre).trim().toUpperCase(),
          activa: Boolean(values.activa),
          // Alta: back fuerza hoy. Update: back no toca vigenciaDesde.
          vigenciaDesde: id == null ? hoy : undefined,
          contactoEncargado: String(values.contactoEncargado || '') || undefined,
        };
        if (id != null) await api.updateCentroCosto(String(id), payload);
        else await api.createCentroCosto(payload);
      }}
      invalidateKeys={[
        'ordenes-compra',
        'tarifas-contratista',
        'ingresos-labor-diario',
        'proformas-contratista',
      ]}
      columns={[
        { key: 'codigo', header: 'Código', filterType: 'text', filterValue: (r) => r.codigo, cell: (r) => r.codigo },
        { key: 'nombre', header: 'Nombre', filterType: 'text', filterValue: (r) => r.nombre, cell: (r) => r.nombre },
        { key: 'contacto', header: 'Encargado', filterType: 'text', filterValue: (r) => r.contactoEncargado ?? '', cell: (r) => r.contactoEncargado ?? '—' },
        { key: 'vig', header: 'Desde', filterType: 'date', filterValue: (r) => r.vigenciaDesde, cell: (r) => r.vigenciaDesde ?? '—' },
        {
          key: 'activa',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activa,
          sortValue: (r) => (r.activa ? 'Activo' : 'Inactivo'),
          filterOptions: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          cell: (r) => <EstadoGenericoBadge estado={r.activa ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}

export function TiposDocumentoPage() {
  const formFields: MockFormField[] = [
    { name: 'codigo', label: 'Código', placeholder: 'FAC', required: true },
    { name: 'nombre', label: 'Nombre', required: true },
    {
      name: 'modulo', label: 'Módulo', type: 'select', required: true,
      options: [
        { value: 'Comercial', label: 'Comercial' },
        { value: 'Compras', label: 'Compras' },
        { value: 'Contratistas', label: 'Contratistas' },
        { value: 'Insumos', label: 'Insumos / Bodega' },
        { value: 'Contabilidad', label: 'Contabilidad' },
        { value: 'Tesorería', label: 'Tesorería' },
      ],
    },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
  ];

  return (
    <MockListPage<TipoDocumento>
      title="Tipos de documento"
      breadcrumbs={['Parametrización']}
      queryKey="tipos-documento"
      queryFn={api.getTiposDocumento}
      createLabel="Nuevo tipo"
      entityLabel="Tipo de documento"
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'TD'),
        codigo: String(v.codigo).toUpperCase(),
        nombre: String(v.nombre),
        modulo: String(v.modulo),
        activo: Boolean(v.activo),
      })}
      rowToFormValues={(r) => ({ codigo: r.codigo, nombre: r.nombre, modulo: r.modulo, activo: r.activo })}
      onSave={async (values, id) => {
        const payload = {
          codigo: String(values.codigo).toUpperCase(),
          nombre: String(values.nombre),
          modulo: String(values.modulo),
          activo: Boolean(values.activo),
        };
        if (id != null) await api.updateTipoDocumento(String(id), payload);
        else await api.createTipoDocumento(payload);
      }}
      columns={[
        { key: 'codigo', header: 'Código', filterType: 'text', filterValue: (r) => r.codigo, cell: (r) => r.codigo },
        { key: 'nombre', header: 'Nombre', filterType: 'text', filterValue: (r) => r.nombre, cell: (r) => r.nombre },
        { key: 'modulo', header: 'Módulo', filterType: 'select', filterValue: (r) => r.modulo, cell: (r) => r.modulo },
        {
          key: 'activo',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activo,
          filterOptions: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          cell: (r) => <EstadoGenericoBadge estado={r.activo ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}

import { ProveedoresPage } from '@/features/catalogos/FichaProveedoresPage';
export { ProveedoresPage };
