import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, History, Shield } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEmpresaScopeId, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import type { AuditoriaContratista } from '@/types/domain';
import * as api from '@/services/api';
import {
  accionTone,
  labelAccion,
  labelEntidad,
  metadataPretty,
  resumenMetadata,
} from '@/features/contratistas/auditoria-format';

const ENTIDADES = [
  '',
  'TARIFA',
  'TIPO_CONTRATO',
  'PROFORMA',
  'PERIODO',
  'INGRESO',
  'LABOR',
  'ACTIVIDAD',
] as const;

export default function AuditoriaContratistasPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [entidad, setEntidad] = useState('');
  const [entidadId, setEntidadId] = useState('');
  const [accionFilter, setAccionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'contratistas-auditoria', entidad, entidadId),
    queryFn: () => api.getAuditoriaContratistas({
      entidad: entidad || undefined,
      entidadId: entidadId.trim() || undefined,
    }),
  });

  const rowsRaw = query.data ?? [];

  const accionesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const row of rowsRaw) set.add(row.accion);
    return [...set].sort();
  }, [rowsRaw]);

  const rows = useMemo(() => {
    if (!accionFilter) return rowsRaw;
    return rowsRaw.filter((row) => row.accion === accionFilter);
  }, [rowsRaw, accionFilter]);

  const stats = useMemo(() => {
    const entidades = new Set(rowsRaw.map((r) => r.entidad));
    const ultimo = rowsRaw[0];
    return {
      total: rowsRaw.length,
      entidades: entidades.size,
      ultimo: ultimo
        ? `${labelAccion(ultimo.accion)} · ${new Date(ultimo.createdAt).toLocaleString('es-CL')}`
        : '—',
    };
  }, [rowsRaw]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Auditoría"
        breadcrumbs={['Contratistas', 'Auditoría']}
        subtitle="Trazabilidad de acciones sensibles del módulo (últimos 200 eventos)."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)] p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            <History size={14} />
            Eventos
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--color-text)]">{stats.total}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">En el resultado actual del servidor</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Tipos de entidad</div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{stats.entidades}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Distintos en el lote</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            <Shield size={14} />
            Más reciente
          </div>
          <p className="mt-2 text-sm font-medium leading-snug text-[var(--color-text)]">{stats.ultimo}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Entidad">
            <Select value={entidad} onChange={(event) => setEntidad(event.target.value)}>
              <option value="">Todas</option>
              {ENTIDADES.filter(Boolean).map((value) => (
                <option key={value} value={value}>{labelEntidad(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Acción">
            <Select value={accionFilter} onChange={(event) => setAccionFilter(event.target.value)}>
              <option value="">Todas</option>
              {accionesDisponibles.map((value) => (
                <option key={value} value={value}>{labelAccion(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="ID entidad">
            <Input
              value={entidadId}
              onChange={(event) => setEntidadId(event.target.value)}
              placeholder="UUID o código (opcional)"
            />
          </Field>
        </div>
        {(accionFilter || entidad || entidadId.trim()) && (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEntidad('');
                setEntidadId('');
                setAccionFilter('');
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <DataTable<AuditoriaContratista>
        rows={rows}
        empty={query.isLoading ? 'Cargando eventos…' : 'No hay eventos con estos filtros'}
        tableKey="contratistas.auditoria"
        searchPlaceholder="Buscar usuario, acción o resumen…"
        pagination={{ storageKey: 'erp-contratistas-auditoria' }}
        maxHeight="min(62vh, 36rem)"
        columns={[
          {
            key: 'fecha',
            header: 'Fecha',
            cell: (row) => {
              const d = new Date(row.createdAt);
              return (
                <div className="leading-tight">
                  <div className="text-sm">{d.toLocaleDateString('es-CL')}</div>
                  <div className="text-[11px] text-[var(--color-muted)]">{d.toLocaleTimeString('es-CL')}</div>
                </div>
              );
            },
          },
          {
            key: 'entidad',
            header: 'Entidad',
            cell: (row) => (
              <Badge tone="accent">{labelEntidad(row.entidad)}</Badge>
            ),
          },
          {
            key: 'accion',
            header: 'Acción',
            cell: (row) => (
              <Badge tone={accionTone(row.accion)}>{labelAccion(row.accion)}</Badge>
            ),
          },
          {
            key: 'usuario',
            header: 'Usuario',
            cell: (row) => row.usuarioNombre ?? row.usuarioId ?? '—',
          },
          {
            key: 'resumen',
            header: 'Resumen',
            cell: (row) => (
              <span className="text-sm text-[var(--color-muted)]">{resumenMetadata(row)}</span>
            ),
          },
          {
            key: 'id',
            header: 'Referencia',
            cell: (row) => (
              <span className="font-mono text-[11px] text-[var(--color-muted)]" title={row.entidadId}>
                {row.entidadId.length > 12 ? `${row.entidadId.slice(0, 8)}…` : row.entidadId}
              </span>
            ),
          },
          {
            key: '_expand',
            header: '',
            sortable: false,
            filterable: false,
            hideable: false,
            align: 'right',
            cell: (row) => {
              const open = expandedId === row.id;
              return (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={open}
                  onClick={() => toggleExpand(row.id)}
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="sr-only">Detalle</span>
                </Button>
              );
            },
          },
        ]}
      />

      {expandedId && (() => {
        const detail = rowsRaw.find((r) => r.id === expandedId);
        if (!detail) return null;
        return (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <h3 className="mb-2 text-sm font-semibold">Detalle del evento</h3>
          <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-relaxed text-[var(--color-text)]">
            {metadataPretty(detail)}
          </pre>
        </div>
        );
      })()}
    </div>
  );
}
