import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { KPI } from '@/components/common/KPI';
import { toast } from 'sonner';
import type { CentralizacionResult } from '@/types/domain';
import { codigoFromSettings, labelMes } from '@/lib/appSettings';
import { useAppSettings } from '@/app/app-settings-context';
import { fmtCLP } from '@/lib/utils';
import * as api from '@/services/api';

const ORIGENES = [
  { id: 'ventas', label: 'Ventas (documentos comerciales)' },
  { id: 'compras', label: 'Compras (libro / registros)' },
  { id: 'contratistas', label: 'Contratistas (proformas)' },
  { id: 'bodega', label: 'Bodega (movimientos)' },
] as const;

export function CentralizacionMasivaPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const { periodoContable } = useAppSettings();
  const defaultPeriodo = codigoFromSettings(periodoContable);
  const [periodo, setPeriodo] = useState(defaultPeriodo);
  const [tipoCambio, setTipoCambio] = useState('');
  const [monedaTc, setMonedaTc] = useState('USD');
  const [origenes, setOrigenes] = useState<string[]>(['ventas', 'compras', 'contratistas', 'bodega']);
  const [preview, setPreview] = useState<CentralizacionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: periodos = [] } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
  });

  const periodoOptions = useMemo(() => {
    if (periodos.length) return periodos.map((p) => p.codigo);
    return [defaultPeriodo];
  }, [periodos, defaultPeriodo]);

  const toggleOrigen = (id: string) => {
    setOrigenes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const payload = () => ({
    periodo: periodo.trim(),
    origenes,
    ...(tipoCambio.trim() ? { tipoCambio: Number(tipoCambio), monedaTc } : {}),
  });

  const runPreview = async () => {
    if (!periodo.trim()) {
      toast.error('Indica el periodo');
      return;
    }
    if (!origenes.length) {
      toast.error('Selecciona al menos un origen');
      return;
    }
    setBusy(true);
    try {
      const res = await api.previewCentralizacion(payload());
      setPreview(res);
      if (res.avisos?.length) res.avisos.forEach((a) => toast.info(a));
      toast.success(`Preview: ${res.resumen.pendientes} pendiente(s), ${res.resumen.omitidos} omitido(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en preview');
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async () => {
    if (!preview || preview.resumen.pendientes === 0) {
      toast.info('Nada que centralizar — genera un preview primero');
      return;
    }
    setBusy(true);
    try {
      const res = await api.ejecutarCentralizacion(payload());
      setPreview(res);
      if (res.avisos?.length) res.avisos.forEach((a) => toast.info(a));
      toast.success(
        `Centralización OK · ${res.resumen.asientosCreados} asiento(s) · ${fmtCLP(res.resumen.montoTotal)}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al centralizar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Centralización masiva"
        breadcrumbs={['Contabilidad', 'Operaciones']}
      />

      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Periodo">
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodoOptions.map((c) => {
                const p = periodos.find((x) => x.codigo === c);
                const label = p
                  ? `${c} · ${labelMes(String(p.mes).padStart(2, '0'))} (${p.estado})`
                  : c;
                return <option key={c} value={c}>{label}</option>;
              })}
            </Select>
          </Field>
          <Field label="Tipo de cambio (opc.)">
            <MontoInput
              kind="tc"
              value={tipoCambio === '' ? null : Number(tipoCambio)}
              onChange={(v) => setTipoCambio(v == null ? '' : String(v))}
              placeholder="965,50"
            />
          </Field>
          <Field label="Moneda TC">
            <Select value={monedaTc} onChange={(e) => setMonedaTc(e.target.value)}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="UF">UF</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button disabled={busy} onClick={() => void runPreview()}>Preview</Button>
            <Button disabled={busy || !preview?.resumen.pendientes} onClick={() => void confirmar()}>
              Confirmar
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-3">
        {ORIGENES.map((o) => (
          <Checkbox
            key={o.id}
            label={o.label}
            checked={origenes.includes(o.id)}
            onChange={() => toggleOrigen(o.id)}
          />
        ))}
      </div>

      {preview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPI label="Pendientes" value={String(preview.resumen.pendientes)} />
            <KPI label="Omitidos" value={String(preview.resumen.omitidos)} />
            <KPI label="Asientos creados" value={String(preview.resumen.asientosCreados)} />
            <KPI label="Monto a centralizar" value={fmtCLP(preview.resumen.montoTotal)} />
          </div>
          {preview.porOrigen && Object.keys(preview.porOrigen).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              {Object.entries(preview.porOrigen).map(([origen, s]) => (
                <div key={origen} className="rounded border border-[var(--color-border)] px-3 py-2">
                  <div className="font-medium capitalize">{origen}</div>
                  <div className="text-[var(--color-muted)]">
                    {s.pendientes} pend. · {s.omitidos} omit. · {fmtCLP(s.monto)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {preview.avisos?.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-[var(--color-muted)]">
              {preview.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          <DataTable
            tableKey="contabilidad.centralizacion"
            rows={preview.items.map((r, i) => ({ ...r, id: `${r.origen}-${r.ref}-${i}` }))}
            columns={[
              { key: 'origen', header: 'Origen', cell: (r) => r.origen },
              { key: 'ref', header: 'Ref', cell: (r) => r.ref },
              { key: 'glosa', header: 'Glosa', cell: (r) => r.glosa },
              {
                key: 'monto',
                header: 'Monto',
                align: 'right',
                cell: (r) => fmtCLP(r.monto),
              },
              {
                key: 'accion',
                header: 'Acción',
                cell: (r) => (
                  <Badge tone={r.accion === 'CREAR' ? 'success' : 'muted'}>
                    {r.accion}{r.motivo ? ` · ${r.motivo}` : ''}
                  </Badge>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
