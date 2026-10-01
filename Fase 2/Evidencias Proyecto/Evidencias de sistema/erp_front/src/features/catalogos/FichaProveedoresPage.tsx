import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import type { FichaCambio, Proveedor } from '@/types/domain';
import * as api from '@/services/api';
import { validateFiscalId } from '@/lib/inputValidation';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { useAppSettings } from '@/app/app-settings-context';
import {
  emptyFicha,
  FichaContraparteModal,
  type FichaFormState,
} from '@/components/ficha/FichaContraparteModal';

export function ProveedoresPage() {
  const { user } = useAuth();
  const { demoMode } = useAppSettings();
  const canWrite = hasPermission(user, 'catalogos:write') || hasPermission(user, 'compras:write');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedores'),
    queryFn: api.getProveedores,
  });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FichaFormState>(emptyFicha('proveedor'));
  const [historial, setHistorial] = useState<FichaCambio[]>([]);
  const [saving, setSaving] = useState(false);
  const [rutNota, setRutNota] = useState<string | null>(null);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyFicha('proveedor'));
    setHistorial([]);
    setRutNota(null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open || editingId) return;
    const rut = form.rut.trim();
    const check = rut ? validateFiscalId(rut, { demoMode, allowForeign: true }) : null;
    if (!check?.valid) {
      setRutNota(null);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void api.buscarContrapartePorRut(rut).then((data) => {
        if (cancel) return;
        const contratista = data.contratista;
        if (!contratista) {
          setRutNota(null);
          return;
        }
        setRutNota('Este RUT ya es contratista. Se trajeron los datos y al guardar quedarán asociados.');
        setForm((current) => {
          if (current.rut.trim() !== rut) return current;
          const tieneDireccion = current.direcciones.some((dir) => dir.linea.trim());
          const direcciones = tieneDireccion || !contratista.direccion
            ? current.direcciones
            : [{
                tipo: 'DESPACHO' as const,
                linea: contratista.direccion,
                comuna: contratista.comuna ?? '',
                ciudad: contratista.ciudad ?? '',
                principal: true,
              }];
          return {
            ...current,
            razonSocial: contratista.razonSocial || current.razonSocial,
            email: contratista.email || current.email,
            telefono: contratista.telefono || current.telefono,
            direccion: current.direccion.trim() ? current.direccion : (contratista.direccion ?? ''),
            comuna: current.comuna.trim() ? current.comuna : (contratista.comuna ?? ''),
            ciudad: current.ciudad.trim() ? current.ciudad : (contratista.ciudad ?? ''),
            direcciones,
          };
        });
      }).catch(() => {
        if (!cancel) setRutNota(null);
      });
    }, 350);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [open, editingId, form.rut, demoMode]);

  const openEdit = async (id: string) => {
    try {
      const p = await api.getProveedor(id) as Proveedor;
      setEditingId(id);
      setForm({
        rut: p.rut,
        razonSocial: p.razonSocial,
        giro: p.giro ?? '',
        telefono: p.telefono ?? '',
        email: p.email ?? '',
        direccion: '',
        comuna: '',
        ciudad: '',
        activo: p.activo,
        esProductor: p.esProductor ?? false,
        condicionPagoDias: typeof p.condicionPagoDias === 'number' && p.condicionPagoDias >= 1
          ? p.condicionPagoDias
          : '',
        condicionIvaDia: p.condicionIvaDia ?? 10,
        monedaPago: (p.monedaPago?.trim().toUpperCase() || 'CLP'),
        contacto: p.contacto ?? '',
        cuentasBancarias: p.cuentasBancarias?.length ? p.cuentasBancarias : emptyFicha('proveedor').cuentasBancarias,
        contactos: p.contactos?.length ? p.contactos : emptyFicha('proveedor').contactos,
        direcciones: p.direcciones?.length ? p.direcciones : emptyFicha('proveedor').direcciones,
      });
      setHistorial(p.historial ?? []);
      setRutNota(p.esContratista ? 'Este proveedor también está en Contratistas.' : null);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar la ficha');
    }
  };

  const save = async () => {
    if (!form.rut.trim() || !form.razonSocial.trim()) {
      toast.error('RUT y razón social son obligatorios');
      return;
    }
    const rutValidation = validateFiscalId(form.rut, { demoMode, allowForeign: true });
    if (!rutValidation.valid) {
      toast.error(rutValidation.error ?? 'Identificador fiscal inválido');
      return;
    }
    if (rutValidation.warning) toast.warning(rutValidation.warning);
    setSaving(true);
    try {
      const payload = {
        rut: form.rut.trim(),
        razonSocial: form.razonSocial.trim(),
        giro: form.giro.trim() || undefined,
        contacto: form.contacto?.trim() || undefined,
        email: form.email.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        activo: form.activo,
        esProductor: form.esProductor ?? false,
        condicionPagoDias:
          typeof form.condicionPagoDias === 'number' && form.condicionPagoDias >= 1
            ? form.condicionPagoDias
            : null,
        condicionIvaDia:
          typeof form.condicionIvaDia === 'number' && form.condicionIvaDia >= 1
            ? form.condicionIvaDia
            : 10,
        monedaPago: (form.monedaPago?.trim().toUpperCase() || 'CLP'),
        cuentasBancarias: form.cuentasBancarias,
        contactos: form.contactos,
        direcciones: form.direcciones,
        solicitadoPor: form.solicitadoPor?.trim() || undefined,
        solicitadoNota: form.solicitadoNota?.trim() || undefined,
      };
      if (editingId) await api.updateProveedor(editingId, payload);
      else await api.createProveedor(payload);
      toast.success('Ficha guardada');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'proveedores') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'contratistas') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proveedores"
        breadcrumbs={['Parametrización', 'Compras']}
        action={canWrite ? <Button disabled={q.isError} onClick={openNew}>Nuevo proveedor</Button> : undefined}
      />
      <QueryErrorAlert
        error={q.error}
        isLoading={q.isLoading}
        resource="los proveedores"
        onRetry={() => void q.refetch()}
      />
      {!q.error && <DataTable
        tableKey="catalogos.proveedores"
        columns={[
          { key: 'rut', header: 'RUT', cell: (r: Proveedor) => r.rut },
          {
            key: 'razonSocial',
            header: 'Razón social',
            cell: (r: Proveedor) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                {r.razonSocial}
                {r.esContratista && <Badge tone="info">Contratista</Badge>}
              </span>
            ),
          },
          { key: 'giro', header: 'Giro', cell: (r: Proveedor) => r.giro ?? '—' },
          { key: 'activo', header: 'Estado', cell: (r: Proveedor) => <EstadoGenericoBadge estado={r.activo ? 'ACTIVO' : 'INACTIVO'} /> },
          {
            key: 'acc',
            header: '',
            cell: (r: Proveedor) => (
              <Button size="sm" variant="ghost" onClick={() => void openEdit(r.id)}>Ficha</Button>
            ),
          },
        ]}
        rows={(q.data ?? []) as Proveedor[]}
        empty={q.isLoading ? 'Cargando…' : 'Sin proveedores'}
      />}
      <FichaContraparteModal
        kind="proveedor"
        open={open}
        title={editingId ? 'Ficha proveedor' : 'Nuevo proveedor'}
        canWrite={canWrite}
        value={form}
        historial={historial}
        saving={saving}
        onChange={setForm}
        onClose={() => setOpen(false)}
        onSave={() => void save()}
        rutNota={rutNota}
      />
    </div>
  );
}
