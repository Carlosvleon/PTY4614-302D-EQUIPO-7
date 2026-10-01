import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { useAppSettings } from '@/app/app-settings-context';
import type { Empresa } from '@/types/domain';
import * as api from '@/services/api';
import { isValidRutChecksum } from '@/lib/inputValidation';
import { SII_DTE_LIMITS } from '@/lib/siiDteLimits';

export default function EmpresasPage() {
  const { refreshEmpresas } = useAppSettings();
  const empresa = 'Datos de la empresa';
  const representante = 'Representante legal';
  const formFields: MockFormField[] = [
    {
      name: 'activa',
      label: 'Activa',
      type: 'checkbox',
      defaultValue: true,
      section: empresa,
      sectionHeader: true,
      sectionHeaderText: { on: 'Estado de empresa: Activa', off: 'Estado de empresa: Inactiva' },
    },
    { name: 'rut', label: 'RUT', placeholder: '76.123.456-7', required: true, kind: 'rut', section: empresa },
    { name: 'razonSocial', label: 'Razón social', required: true, kind: 'nombre', maxLength: SII_DTE_LIMITS.rznSoc, section: empresa },
    { name: 'giro', label: 'Giro', required: true, kind: 'nombre', maxLength: SII_DTE_LIMITS.giroEmis, hint: 'SII GiroEmis: máx. 80 caracteres.', section: empresa },
    { name: 'direccion', label: 'Dirección', kind: 'texto', maxLength: 60, section: empresa },
    {
      name: 'aceptacionCompraPlazoDias',
      label: 'Aceptación compra (días)',
      type: 'number',
      defaultValue: 8,
      hint: 'Sin reclamo, la factura se marca aceptada (plazo). No aprueba la OC.',
      section: empresa,
    },
    {
      name: 'gosocketBillerId',
      label: 'Billing ID (BillerID GoSocket)',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      kind: 'texto',
      maxLength: 36,
      hint: 'UUID de la sociedad en GoSocket. Distinto por empresa; se envía al emitir DTE. ApiUser y password de esa sociedad van en el billing-gateway (.env), no aquí.',
      section: empresa,
    },
    {
      name: 'gosocketNroResolucion',
      label: 'N° resolución SII (CAE)',
      placeholder: '0',
      kind: 'texto',
      maxLength: 20,
      hint: 'Número de resolución que autoriza DTE. QA distinta de productivo. Por empresa, no en el intermediario.',
      section: empresa,
    },
    {
      name: 'gosocketFechaResolucion',
      label: 'Fecha resolución SII (CAE)',
      placeholder: '2024-01-15',
      kind: 'texto',
      maxLength: 10,
      hint: 'Fecha de esa resolución (YYYY-MM-DD). Cambia al pasar a productivo.',
      section: empresa,
    },
    {
      name: 'gosocketActeco',
      label: 'Acteco SII (6 dígitos)',
      placeholder: '461001',
      kind: 'texto',
      maxLength: 6,
      hint: 'Código de actividad económica inscrito en el SII. Obligatorio en factura 33 (va antes de DirOrigen).',
      section: empresa,
    },
    { name: 'representanteLegalNombre', label: 'Nombre', kind: 'nombre', maxLength: 120, section: representante },
    {
      name: 'representanteLegalRut',
      label: 'RUT',
      placeholder: '12.345.678-5',
      kind: 'rut',
      section: representante,
      validate: (value) => {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        return isValidRutChecksum(raw)
          ? null
          : 'RUT inválido: revise el número y su dígito verificador.';
      },
    },
    {
      name: 'representanteLegalEmail',
      label: 'Mail contacto',
      type: 'email',
      kind: 'email',
      maxLength: 120,
      section: representante,
    },
    {
      name: 'representanteLegalTelefono',
      label: 'Número de contacto',
      kind: 'texto',
      maxLength: 40,
      section: representante,
    },
  ];

  return (
    <MockListPage<Empresa>
      title="Empresas"
      breadcrumbs={['Administración']}
      queryKey="empresas"
      tableKey="admin.empresas"
      queryFn={api.getEmpresas}
      createLabel="Nueva empresa"
      entityLabel="Empresa"
      formFields={formFields}
      formSize="lg"
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'EMP'),
        rut: String(v.rut),
        razonSocial: String(v.razonSocial),
        giro: String(v.giro),
        activa: Boolean(v.activa),
        aceptacionCompraPlazoDias: Number(v.aceptacionCompraPlazoDias || 8),
        gosocketBillerId: v.gosocketBillerId ? String(v.gosocketBillerId) : '',
        gosocketNroResolucion: v.gosocketNroResolucion ? String(v.gosocketNroResolucion) : '',
        gosocketFechaResolucion: v.gosocketFechaResolucion ? String(v.gosocketFechaResolucion) : '',
        gosocketActeco: v.gosocketActeco ? String(v.gosocketActeco) : '',
        representanteLegalNombre: v.representanteLegalNombre ? String(v.representanteLegalNombre) : '',
        representanteLegalRut: v.representanteLegalRut ? String(v.representanteLegalRut) : '',
        representanteLegalEmail: v.representanteLegalEmail ? String(v.representanteLegalEmail) : '',
        representanteLegalTelefono: v.representanteLegalTelefono ? String(v.representanteLegalTelefono) : '',
        direccion: v.direccion ? String(v.direccion) : '',
      })}
      rowToFormValues={(r) => ({
        rut: r.rut,
        razonSocial: r.razonSocial,
        giro: r.giro,
        representanteLegalNombre: r.representanteLegalNombre ?? '',
        representanteLegalRut: r.representanteLegalRut ?? '',
        representanteLegalEmail: r.representanteLegalEmail ?? '',
        representanteLegalTelefono: r.representanteLegalTelefono ?? '',
        direccion: r.direccion ?? '',
        activa: r.activa,
        aceptacionCompraPlazoDias: r.aceptacionCompraPlazoDias ?? 8,
        gosocketBillerId: r.gosocketBillerId ?? '',
        gosocketNroResolucion: r.gosocketNroResolucion ?? '',
        gosocketFechaResolucion: r.gosocketFechaResolucion ?? '',
        gosocketActeco: r.gosocketActeco ?? '',
      })}
      onSave={async (values, id) => {
        const payload = {
          rut: String(values.rut),
          razonSocial: String(values.razonSocial),
          giro: String(values.giro),
          activa: Boolean(values.activa),
          aceptacionCompraPlazoDias: Number(values.aceptacionCompraPlazoDias || 8),
          gosocketBillerId: values.gosocketBillerId
            ? String(values.gosocketBillerId).trim()
            : null,
          gosocketNroResolucion: values.gosocketNroResolucion
            ? String(values.gosocketNroResolucion).trim()
            : null,
          gosocketFechaResolucion: values.gosocketFechaResolucion
            ? String(values.gosocketFechaResolucion).trim()
            : null,
          gosocketActeco: values.gosocketActeco
            ? String(values.gosocketActeco).trim()
            : null,
          representanteLegalNombre: String(values.representanteLegalNombre ?? '').trim() || null,
          representanteLegalRut: String(values.representanteLegalRut ?? '').trim() || null,
          representanteLegalEmail: String(values.representanteLegalEmail ?? '').trim() || null,
          representanteLegalTelefono: String(values.representanteLegalTelefono ?? '').trim() || null,
          direccion: String(values.direccion ?? '').trim() || null,
        };
        if (id != null) await api.updateEmpresa(String(id), payload);
        else await api.createEmpresa(payload);
        await refreshEmpresas();
      }}
      columns={[
        {
          key: 'rut',
          header: 'RUT',
          filterType: 'text',
          filterValue: (r) => r.rut,
          cell: (r) => <span className="font-mono text-xs">{r.rut}</span>,
        },
        {
          key: 'razonSocial',
          header: 'Razón social',
          filterType: 'text',
          filterValue: (r) => r.razonSocial,
          cell: (r) => r.razonSocial,
        },
        {
          key: 'giro',
          header: 'Giro',
          filterType: 'text',
          filterValue: (r) => r.giro,
          cell: (r) => r.giro,
        },
        {
          key: 'aceptacionCompraPlazoDias',
          header: 'Acept. compra (días)',
          cell: (r) => r.aceptacionCompraPlazoDias ?? 8,
        },
        {
          key: 'gosocketBillerId',
          header: 'Billing ID',
          filterType: 'text',
          filterValue: (r) => r.gosocketBillerId ?? '',
          cell: (r) => (
            <span className="font-mono text-xs">{r.gosocketBillerId || '—'}</span>
          ),
        },
        {
          key: 'gosocketNroResolucion',
          header: 'N° resol. SII',
          filterType: 'text',
          filterValue: (r) => r.gosocketNroResolucion ?? '',
          cell: (r) => (
            <span className="font-mono text-xs">{r.gosocketNroResolucion || '—'}</span>
          ),
        },
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
