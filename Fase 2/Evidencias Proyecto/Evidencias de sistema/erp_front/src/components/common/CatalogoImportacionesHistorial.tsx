import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import * as api from '@/services/api';

export type CatalogoImportacionTipo =
  | 'PLAN_CUENTAS'
  | 'CENTROS_COSTO'
  | 'ELEMENTOS_COSTO'
  | 'AREAS_NEGOCIO'
  | 'CODIGOS_FINANCIEROS';

const TIPO_LABEL: Record<CatalogoImportacionTipo, string> = {
  PLAN_CUENTAS: 'Plan de cuentas',
  CENTROS_COSTO: 'Centros de costo',
  ELEMENTOS_COSTO: 'Elementos de costo',
  AREAS_NEGOCIO: 'Áreas de negocio',
  CODIGOS_FINANCIEROS: 'Códigos financieros',
};

type Fila = {
  id: string;
  archivoNombre?: string | null;
  created: number;
  updated: number;
  unchanged: number;
  usuarioEmail?: string | null;
  usuarioNombre?: string | null;
  createdAt: string;
  resumen?: Array<{ codigo: string; cambios: string[] }>;
};

export function CatalogoImportacionesHistorial({
  tipo,
  size = 'md',
}: {
  tipo: CatalogoImportacionTipo;
  size?: 'sm' | 'md';
}) {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: listQueryKey(scope, empresaId, `catalogo-importaciones:${tipo}`),
    queryFn: () => api.getCatalogoImportaciones(tipo),
    enabled: open,
  });
  const rows = (q.data ?? []) as Fila[];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        leftIcon={<History size={14} />}
        onClick={() => setOpen(true)}
      >
        Historial
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Historial · ${TIPO_LABEL[tipo]}`}
        size="lg"
      >
        {q.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : q.isError ? (
          <p className="text-sm text-[var(--color-danger)]">No se pudo cargar el historial.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Aún no hay importaciones en esta empresa.</p>
        ) : (
          <ul className="max-h-[60vh] space-y-3 overflow-auto">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <div className="font-medium text-[var(--color-text)]">
                  {new Date(r.createdAt).toLocaleString('es-CL')}
                  {' · '}
                  {r.usuarioNombre || r.usuarioEmail || 'Usuario'}
                </div>
                <div className="mt-1 text-[var(--color-muted)]">
                  {r.archivoNombre || 'Sin nombre de archivo'}
                  {' · '}
                  {r.created} nuevas
                  {' · '}
                  {r.updated} actualizadas
                  {' · '}
                  {r.unchanged} sin cambios
                </div>
                {(r.resumen?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-[var(--color-text)]">
                    {r.resumen!.slice(0, 12).map((item) => (
                      <li key={item.codigo}>
                        <span className="font-mono">{item.codigo}</span>
                        {item.cambios?.length ? ` — ${item.cambios.join('; ')}` : ''}
                      </li>
                    ))}
                    {r.resumen!.length > 12 && (
                      <li className="text-[var(--color-muted)]">y {r.resumen!.length - 12} más</li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
