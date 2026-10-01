import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type {
  AreaNegocio,
  CentroCosto,
  ConfigContableSii,
  CuentaContable,
  ElementoCosto,
} from '@/types/domain';
import { EMPTY_ARRAY } from '@/lib/empty';
import * as api from '@/services/api';
import { cuentasParaImputar, labelCuentaImputacion } from '@/lib/cuentasImputacion';

const EMPTY_CONFIGS = EMPTY_ARRAY as ConfigContableSii[];
const EMPTY_CUENTAS = EMPTY_ARRAY as CuentaContable[];
const EMPTY_CC = EMPTY_ARRAY as CentroCosto[];
const EMPTY_AREAS = EMPTY_ARRAY as AreaNegocio[];
const EMPTY_ELEMENTOS = EMPTY_ARRAY as ElementoCosto[];

type Draft = {
  tipoDocumentoSii: string;
  codigoSii: string;
  nombre: string;
  cuentaContableId: string;
  centroCostoId: string;
  areaNegocioId: string;
  elementoCostoId: string;
  lado: string;
  activa: boolean;
};

export function ConfigContableSiiPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const { data: configs = EMPTY_CONFIGS, isLoading } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'config-contable-sii'),
    queryFn: api.getConfigContableSii,
  });

  const { data: cuentasRaw = EMPTY_CUENTAS } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: () => api.getCuentas(),
  });

  const { data: centrosCosto = EMPTY_CC } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: () => api.getCentrosCosto(),
  });

  const { data: areasNegocio = EMPTY_AREAS } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'areas-negocio'),
    queryFn: () => api.getAreasNegocio(),
  });

  const { data: elementosCosto = EMPTY_ELEMENTOS } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'elementos-costo'),
    queryFn: () => api.getElementosCosto(),
  });

  const cuentasNuevas = cuentasParaImputar(cuentasRaw as CuentaContable[]);
  const cuentaPorId = new Map((cuentasRaw as CuentaContable[]).map((c) => [c.id, c]));

  useEffect(() => {
    setDrafts(configs.map((c) => ({
      tipoDocumentoSii: c.tipoDocumentoSii,
      codigoSii: c.codigoSii || '',
      nombre: c.nombre,
      cuentaContableId: c.cuentaContableId,
      centroCostoId: c.centroCostoId || '',
      areaNegocioId: c.areaNegocioId || '',
      elementoCostoId: c.elementoCostoId || '',
      lado: c.lado || 'DEBE',
      activa: c.activa,
    })));
  }, [configs]);

  const addRow = () => {
    setDrafts((s) => [
      ...s,
      {
        tipoDocumentoSii: '',
        codigoSii: '',
        nombre: '',
        cuentaContableId: cuentasNuevas[0]?.id || '',
        centroCostoId: '',
        areaNegocioId: '',
        elementoCostoId: '',
        lado: 'DEBE',
        activa: true,
      },
    ]);
  };

  const save = async () => {
    const validos = drafts.filter((d) => d.tipoDocumentoSii.trim() && d.nombre.trim() && d.cuentaContableId);
    if (!validos.length) {
      toast.error('Completa al menos un mapeo válido');
      return;
    }
    for (const d of validos) {
      const cuenta = cuentaPorId.get(d.cuentaContableId);
      const faltan: string[] = [];
      if (cuenta?.requiereCc && !d.centroCostoId) faltan.push('centro de costo');
      if (cuenta?.requiereArea && !d.areaNegocioId) faltan.push('área de negocio');
      if (cuenta?.requiereElemento && !d.elementoCostoId) faltan.push('elemento de costo');
      if (faltan.length) {
        toast.error(
          `${d.tipoDocumentoSii}: la cuenta ${cuenta?.codigo} exige ${faltan.join(', ')}.`,
        );
        return;
      }
    }
    const items = validos.map((d) => ({
      tipoDocumentoSii: d.tipoDocumentoSii,
      codigoSii: d.codigoSii,
      nombre: d.nombre,
      cuentaContableId: d.cuentaContableId,
      centroCostoId: d.centroCostoId || null,
      areaNegocioId: d.areaNegocioId || null,
      elementoCostoId: d.elementoCostoId || null,
      lado: d.lado,
      activa: d.activa,
    }));
    try {
      await api.putConfigContableSii({ items });
      toast.success(`Guardados ${items.length} mapeo(s) SII → cuenta`);
      void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'config-contable-sii') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  const update = (idx: number, patch: Partial<Draft>) => {
    setDrafts((s) => s.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cuentas por tipo de documento"
        subtitle="Define en qué cuenta del plan se anota cada tipo de documento al contabilizar. Es imputación interna del ERP: no se envía al SII ni configura al facturador electrónico."
        breadcrumbs={['Contabilidad', 'Configuración']}
        action={(
          <div className="flex gap-2">
            <Button variant="ghost" onClick={addRow}>Agregar fila</Button>
            <Button onClick={() => void save()}>Guardar mapeos</Button>
          </div>
        )}
      />

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Tipo / clave</th>
                <th className="px-3 py-2">Cód. SII</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">Dimensiones que exige la cuenta</th>
                <th className="px-3 py-2">Lado</th>
                <th className="px-3 py-2">Activa</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, idx) => (
                <tr key={`${d.tipoDocumentoSii}-${idx}`} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1.5">
                    <Input
                      value={d.tipoDocumentoSii}
                      onChange={(e) => update(idx, { tipoDocumentoSii: e.target.value.toUpperCase() })}
                      placeholder="33 / CLIENTES"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={d.codigoSii}
                      onChange={(e) => update(idx, { codigoSii: e.target.value })}
                      placeholder="33"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={d.nombre}
                      onChange={(e) => update(idx, { nombre: e.target.value })}
                      placeholder="Factura venta"
                    />
                  </td>
                  <td className="px-2 py-1.5 min-w-[220px]">
                    <Select
                      value={d.cuentaContableId}
                      onChange={(e) => update(idx, { cuentaContableId: e.target.value })}
                    >
                      <option value="">—</option>
                      {cuentasParaImputar(cuentasRaw as CuentaContable[], d.cuentaContableId).map((c) => (
                        <option key={c.id} value={c.id}>{labelCuentaImputacion(c)}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5 min-w-[240px] space-y-1">
                    {(() => {
                      const cuenta = cuentaPorId.get(d.cuentaContableId);
                      if (!cuenta?.requiereCc && !cuenta?.requiereArea && !cuenta?.requiereElemento) {
                        return <span className="text-xs text-[var(--color-muted)]">Ninguna</span>;
                      }
                      return (
                        <>
                          {cuenta.requiereCc && (
                            <Select
                              value={d.centroCostoId}
                              onChange={(e) => update(idx, { centroCostoId: e.target.value })}
                            >
                              <option value="">Centro de costo…</option>
                              {(centrosCosto as CentroCosto[]).map((cc) => (
                                <option key={cc.id} value={cc.id}>{cc.codigo} · {cc.nombre}</option>
                              ))}
                            </Select>
                          )}
                          {cuenta.requiereArea && (
                            <Select
                              value={d.areaNegocioId}
                              onChange={(e) => update(idx, { areaNegocioId: e.target.value })}
                            >
                              <option value="">Área de negocio…</option>
                              {(areasNegocio as AreaNegocio[]).map((a) => (
                                <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                              ))}
                            </Select>
                          )}
                          {cuenta.requiereElemento && (
                            <Select
                              value={d.elementoCostoId}
                              onChange={(e) => update(idx, { elementoCostoId: e.target.value })}
                            >
                              <option value="">Elemento de costo…</option>
                              {(elementosCosto as ElementoCosto[]).map((el) => (
                                <option key={el.id} value={el.id}>{el.codigo} · {el.nombre}</option>
                              ))}
                            </Select>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={d.lado} onChange={(e) => update(idx, { lado: e.target.value })}>
                      <option value="DEBE">DEBE</option>
                      <option value="HABER">HABER</option>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Checkbox
                      checked={d.activa}
                      onChange={(e) => update(idx, { activa: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
              {!drafts.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">
                    Sin mapeos. Usa “Agregar fila”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <DataTable
        tableKey="contabilidad.config-sii-readonly"
        rows={configs as ConfigContableSii[]}
        columns={[
          { key: 'tipo', header: 'Tipo', cell: (r) => r.tipoDocumentoSii },
          { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
          {
            key: 'cuenta',
            header: 'Cuenta guardada',
            cell: (r) => r.cuentaCodigo ? `${r.cuentaCodigo} · ${r.cuentaNombre}` : r.cuentaContableId,
          },
          {
            key: 'dimensiones',
            header: 'Dimensiones del asiento',
            cell: (r) => {
              const partes = [
                r.centroCostoId
                  && `CC ${(centrosCosto as CentroCosto[]).find((c) => c.id === r.centroCostoId)?.codigo ?? r.centroCostoId}`,
                r.areaNegocioId
                  && `Área ${(areasNegocio as AreaNegocio[]).find((a) => a.id === r.areaNegocioId)?.codigo ?? r.areaNegocioId}`,
                r.elementoCostoId
                  && `EC ${(elementosCosto as ElementoCosto[]).find((e) => e.id === r.elementoCostoId)?.codigo ?? r.elementoCostoId}`,
              ].filter(Boolean);
              return partes.length ? partes.join(' · ') : '—';
            },
          },
          {
            key: 'lado',
            header: 'Lado',
            cell: (r) => <Badge tone="muted">{r.lado}</Badge>,
          },
        ]}
      />
    </div>
  );
}
