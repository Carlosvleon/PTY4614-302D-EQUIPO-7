import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Modal } from '@/components/ui/modal';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import type { AnticipoProductor } from '@/types/domain';
import * as api from '@/services/api';

function parseContraparteKey(key: string): { clienteId?: string; proveedorId?: string } {
  if (key.startsWith('CLIENTE:')) return { clienteId: key.slice('CLIENTE:'.length) };
  if (key.startsWith('PROVEEDOR:')) return { proveedorId: key.slice('PROVEEDOR:'.length) };
  return {};
}

function contraparteKeyOf(r: AnticipoProductor): string {
  if (r.proveedorId) return `PROVEEDOR:${r.proveedorId}`;
  if (r.clienteId) return `CLIENTE:${r.clienteId}`;
  return '';
}

function fmtMoney(moneda: string, clp: number, usd?: number) {
  if (moneda === 'USD') {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD' }).format(usd ?? clp);
  }
  return fmtCLP(clp);
}

export default function AnticiposProductoresPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const qc = useQueryClient();
  const monedasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'monedas'),
    queryFn: api.getMonedas,
  });
  const clientesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'clientes'),
    queryFn: api.getClientes,
  });
  const proveedoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedores'),
    queryFn: api.getProveedores,
  });
  const contraparteOptions = useMemo(() => {
    const cli = (clientesQ.data ?? []).filter((c) => c.activo !== false);
    const prv = (proveedoresQ.data ?? []).filter((p) => p.activo !== false);
    const prod = [
      ...prv.filter((p) => p.esProductor).map((p) => ({
        value: `PROVEEDOR:${p.id}`,
        label: `${p.razonSocial} · ${p.rut} · productor (proveedor)`,
      })),
      ...cli.filter((c) => c.esProductor).map((c) => ({
        value: `CLIENTE:${c.id}`,
        label: `${c.razonSocial} · ${c.rut} · productor (cliente)`,
      })),
    ];
    const rest = [
      ...prv.filter((p) => !p.esProductor).map((p) => ({
        value: `PROVEEDOR:${p.id}`,
        label: `${p.razonSocial} · ${p.rut} · proveedor`,
      })),
      ...cli.filter((c) => !c.esProductor).map((c) => ({
        value: `CLIENTE:${c.id}`,
        label: `${c.razonSocial} · ${c.rut} · cliente`,
      })),
    ];
    return [...prod, ...rest];
  }, [clientesQ.data, proveedoresQ.data]);
  const monedaOptions = (monedasQ.data ?? []).filter((m) => m.activa).map((m) => ({
    value: m.codigo,
    label: m.codigo === 'CLP' ? 'Peso (CLP)' : m.codigo === 'USD' ? 'Dólar (USD)' : `${m.codigo} · ${m.nombre}`,
  }));
  const [calceId, setCalceId] = useState<string | null>(null);
  const [montoCalzado, setMontoCalzado] = useState('');
  const [docs, setDocs] = useState('');
  const [banco, setBanco] = useState('TODOS');
  const [moneda, setMoneda] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [tipoDocto, setTipoDocto] = useState('TODOS');

  const formFields: MockFormField[] = [
    { name: 'fecha', label: 'Fecha comprobante', type: 'date', required: true },
    {
      name: 'contraparteKey',
      label: 'Contraparte (cliente o proveedor)',
      type: 'select',
      required: true,
      options: contraparteOptions.length
        ? contraparteOptions
        : [{ value: '', label: 'Sin fichas — crea cliente/proveedor primero' }],
      hint: 'Obligatorio: el RUT debe existir en el maestro. Preferir flag productor.',
    },
    {
      name: 'banco', label: 'Banco', type: 'select', required: true, defaultValue: 'Banco Chile',
      options: [
        { value: 'Banco Chile', label: 'Banco Chile' },
        { value: 'Banco Estado', label: 'Banco Estado' },
        { value: 'Santander', label: 'Santander' },
      ],
    },
    {
      name: 'formaPago', label: 'Forma de pago', type: 'select', defaultValue: 'TRANSFERENCIAS',
      options: [
        { value: 'TRANSFERENCIAS', label: 'Transferencias' },
        { value: 'CHEQUE', label: 'Cheque' },
      ],
    },
    { name: 'codigoFinanciero', label: 'Código financiero', placeholder: 'MATERIA PRIMA', defaultValue: 'MATERIA PRIMA' },
    {
      name: 'tipoDocto', label: 'Tipo docto', type: 'select', defaultValue: 'ANT',
      options: [
        { value: 'ANT', label: 'ANT (anticipo)' },
        { value: 'TRA', label: 'TRA (traspaso parcial)' },
      ],
    },
    { name: 'nroDocto', label: 'Nro. docto', placeholder: 'ANT-2410' },
    { name: 'nroComprobante', label: 'Nro. comprobante', placeholder: '7255' },
    { name: 'fechaVencimiento', label: 'Fecha vcto.', type: 'date' },
    { name: 'monto', label: 'Monto anticipo', type: 'number', montoKind: 'monto', required: true },
    {
      name: 'moneda', label: 'Moneda (Peso / Dólar)', type: 'select', required: true, defaultValue: 'CLP',
      options: monedaOptions.length
        ? monedaOptions
        : [
            { value: 'CLP', label: 'Peso (CLP)' },
            { value: 'USD', label: 'Dólar (USD)' },
          ],
    },
    { name: 'tc', label: 'Tasa cambio', type: 'number', montoKind: 'tc', placeholder: '936,39', defaultValue: 936.39 },
    { name: 'glosa', label: 'Glosa', type: 'textarea', placeholder: 'Anticipo productor…' },
  ];

  const filterRows = useMemo(() => {
    return (rows: AnticipoProductor[]) => periodoVista.filter(rows, (r) => r.fecha).filter((r) => {
      if (banco !== 'TODOS' && (r.banco ?? '') !== banco) return false;
      if (moneda !== 'TODOS' && r.moneda !== moneda) return false;
      if (estado !== 'TODOS' && r.estado !== estado) return false;
      if (tipoDocto !== 'TODOS' && (r.tipoDocto ?? 'ANT') !== tipoDocto) return false;
      return true;
    });
  }, [banco, moneda, estado, tipoDocto, periodoVista.todo, periodoVista.codigo]);

  const aplicarCalce = async () => {
    if (!calceId) return;
    const n = Number(montoCalzado);
    if (!n || n < 0) {
      toast.error('Ingresa monto a calzar');
      return;
    }
    try {
      await api.updateAnticipoProductor(calceId, { montoCalzado: n, documentosCalce: docs || undefined });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'anticipos-productores') });
      toast.success('Calce parcial aplicado');
      setCalceId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <>
      <MockListPage<AnticipoProductor>
        title="Anticipos productores"
        breadcrumbs={['Tesorería', 'Procesos diarios']}
        queryKey="anticipos-productores"
        queryFn={api.getAnticiposProductores}
        createLabel="Nuevo anticipo"
        entityLabel="Anticipo"
        toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        formFields={formFields}
        formSize="lg"
        filterRows={filterRows}
        filters={(
          <>
            <Select className="max-w-[160px]" value={banco} onChange={(e) => setBanco(e.target.value)}>
              <option value="TODOS">Todos los bancos</option>
              <option value="Banco Chile">Banco Chile</option>
              <option value="Banco Estado">Banco Estado</option>
              <option value="Santander">Santander</option>
            </Select>
            <Select className="max-w-[130px]" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="TODOS">Peso / Dólar</option>
              <option value="CLP">Peso</option>
              <option value="USD">Dólar</option>
            </Select>
            <Select className="max-w-[120px]" value={tipoDocto} onChange={(e) => setTipoDocto(e.target.value)}>
              <option value="TODOS">Tipo docto</option>
              <option value="ANT">ANT</option>
              <option value="TRA">TRA</option>
            </Select>
            <Select className="max-w-[140px]" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="TODOS">Todos los estados</option>
              <option value="ABIERTO">ABIERTO</option>
              <option value="PARCIAL">PARCIAL</option>
              <option value="CERRADO">CERRADO</option>
            </Select>
          </>
        )}
        buildMockRow={(v, id) => {
          const monto = Number(v.monto);
          const mon = String(v.moneda);
          const tc = Number(v.tc) || 936.39;
          const montoUsd = mon === 'USD' ? monto : Math.round((monto / tc) * 100) / 100;
          return {
            id: mockEntityId(id, 'ANT'),
            fecha: String(v.fecha),
            productor: String(v.contraparteKey || v.productor || ''),
            rut: '',
            clienteId: parseContraparteKey(String(v.contraparteKey || '')).clienteId,
            proveedorId: parseContraparteKey(String(v.contraparteKey || '')).proveedorId,
            banco: String(v.banco || ''),
            formaPago: String(v.formaPago || 'TRANSFERENCIAS'),
            codigoFinanciero: String(v.codigoFinanciero || ''),
            tipoDocto: String(v.tipoDocto || 'ANT'),
            nroDocto: String(v.nroDocto || ''),
            nroComprobante: String(v.nroComprobante || ''),
            fechaVencimiento: String(v.fechaVencimiento || v.fecha),
            monto,
            moneda: mon,
            montoUsd,
            montoCalzado: 0,
            saldo: monto,
            saldoUsd: montoUsd,
            tc,
            glosa: String(v.glosa || ''),
            estado: 'ABIERTO' as const,
          };
        }}
        rowToFormValues={(r) => ({
          fecha: r.fecha,
          contraparteKey: contraparteKeyOf(r),
          banco: r.banco ?? '',
          formaPago: r.formaPago ?? 'TRANSFERENCIAS',
          codigoFinanciero: r.codigoFinanciero ?? '',
          tipoDocto: r.tipoDocto ?? 'ANT',
          nroDocto: r.nroDocto ?? '',
          nroComprobante: r.nroComprobante ?? '',
          fechaVencimiento: r.fechaVencimiento ?? '',
          monto: r.monto,
          moneda: r.moneda,
          tc: r.tc ?? 936.39,
          glosa: r.glosa ?? '',
        })}
        onSave={async (values, id) => {
          const monto = Number(values.monto);
          const mon = String(values.moneda);
          const tc = Number(values.tc) || 936.39;
          const montoUsd = mon === 'USD' ? monto : Math.round((monto / tc) * 100) / 100;
          const ids = parseContraparteKey(String(values.contraparteKey || ''));
          if (!ids.clienteId && !ids.proveedorId) {
            throw new Error('Selecciona un cliente o proveedor del maestro');
          }
          const maestro = ids.proveedorId
            ? (proveedoresQ.data ?? []).find((p) => p.id === ids.proveedorId)
            : (clientesQ.data ?? []).find((c) => c.id === ids.clienteId);
          if (!maestro) {
            throw new Error('La contraparte no está en el maestro de la empresa');
          }
          const payload = {
            fecha: String(values.fecha),
            productor: maestro.razonSocial,
            rut: maestro.rut,
            clienteId: ids.clienteId,
            proveedorId: ids.proveedorId,
            banco: String(values.banco || '') || undefined,
            formaPago: String(values.formaPago || '') || undefined,
            codigoFinanciero: String(values.codigoFinanciero || '') || undefined,
            tipoDocto: String(values.tipoDocto || 'ANT'),
            nroDocto: String(values.nroDocto || '') || undefined,
            nroComprobante: String(values.nroComprobante || '') || undefined,
            fechaVencimiento: String(values.fechaVencimiento || '') || undefined,
            monto,
            moneda: mon,
            montoUsd,
            tc,
            glosa: String(values.glosa || '') || undefined,
          };
          if (id) await api.updateAnticipoProductor(String(id), payload);
          else await api.createAnticipoProductor({ ...payload, montoCalzado: 0 });
        }}
        columns={[
          { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
          {
            key: 'tipo',
            header: 'Tipo',
            cell: (r) => <Badge tone={r.tipoDocto === 'TRA' ? 'warning' : 'info'}>{r.tipoDocto ?? 'ANT'}</Badge>,
          },
          { key: 'nroComp', header: 'Nro. comprob', cell: (r) => r.nroComprobante ?? '—' },
          { key: 'nroDoc', header: 'Nro. docto', cell: (r) => r.nroDocto ?? '—' },
          {
            key: 'prod',
            header: 'Productor',
            cell: (r) => (
              <span>
                <span className="block">{r.productor}</span>
                {r.rut ? <span className="font-mono text-xs text-[var(--color-muted)]">{r.rut}</span> : null}
              </span>
            ),
          },
          { key: 'banco', header: 'Banco', cell: (r) => r.banco ?? '—' },
          { key: 'fp', header: 'Forma pago', cell: (r) => r.formaPago ?? '—' },
          { key: 'vcto', header: 'Vcto.', cell: (r) => (r.fechaVencimiento ? fmtDate(r.fechaVencimiento) : '—') },
          { key: 'mon', header: 'Mon.', cell: (r) => r.moneda },
          {
            key: 'total',
            header: 'Total docto',
            cell: (r) => fmtMoney(r.moneda, r.monto, r.montoUsd),
            align: 'right',
          },
          {
            key: 'saldo',
            header: 'Saldo',
            cell: (r) => (
              <span className={r.saldo > 0 ? 'text-[var(--color-accent-2)]' : undefined}>
                {fmtMoney(r.moneda, r.saldo, r.saldoUsd)}
              </span>
            ),
            align: 'right',
          },
          { key: 'calce', header: 'Calzado / a pagar', cell: (r) => fmtCLP(r.montoCalzado), align: 'right' },
          { key: 'tc', header: 'TC', cell: (r) => (r.tc != null ? r.tc.toLocaleString('es-CL') : '—'), align: 'right' },
          {
            key: 'est',
            header: 'Estado',
            cell: (r) => (
              <Badge tone={r.estado === 'CERRADO' ? 'success' : r.estado === 'PARCIAL' ? 'warning' : 'muted'}>
                {r.estado}
              </Badge>
            ),
          },
          {
            key: 'acc',
            header: '',
            cell: (r) => r.estado !== 'CERRADO' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setCalceId(r.id);
                  setMontoCalzado(String(r.montoCalzado || ''));
                  setDocs(r.documentosCalce ?? '');
                }}
              >
                Calzar
              </Button>
            ) : '—',
          },
        ]}
      />

      <Modal
        open={calceId != null}
        onClose={() => setCalceId(null)}
        title="Calce parcial de anticipo"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCalceId(null)}>Cancelar</Button>
            <Button onClick={aplicarCalce}>Aplicar calce</Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <Field label="Monto calzado (acumulado)">
            <MontoInput
              kind="monto"
              value={montoCalzado === '' ? null : Number(montoCalzado)}
              onChange={(v) => setMontoCalzado(v == null ? '' : String(v))}
            />
          </Field>
          <Field label="Documentos / facturas">
            <Input value={docs} placeholder="FAC-V-1201" onChange={(e) => setDocs(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
