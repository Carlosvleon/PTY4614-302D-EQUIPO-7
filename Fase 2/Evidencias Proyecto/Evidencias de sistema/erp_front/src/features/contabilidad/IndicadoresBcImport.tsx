import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { useEmpresaScopeId, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import { exportRowsToCsv } from '@/lib/exportTable';
import {
  CATALOG_IMPORT_LOST_RESPONSE,
  catalogImportResponseLost,
  toCatalogExcelImportPayload,
} from '@/components/common/catalog-excel-import.util';
import type { CatalogExcelPreview, CatalogExcelPreviewItem } from '@/components/common/CatalogExcelImport';
import * as api from '@/services/api';

const IMPORT_KEYS = ['fecha', 'usd', 'cny', 'eur'] as const;
const PREVIEW_CAP = 200;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function labelAccion(accion?: string) {
  if (accion === 'NUEVO') return 'Nuevo';
  if (accion === 'ACTUALIZA') return 'Actualiza';
  if (accion === 'SIN_CAMBIOS') return 'Sin cambios';
  return '—';
}

export function downloadPlantillaIndicadoresBc() {
  exportRowsToCsv(
    'plantilla-indicadores-bc.csv',
    [
      { key: 'fecha', header: 'fecha', value: (r) => r.fecha },
      { key: 'usd', header: 'usd', value: (r) => r.usd },
      { key: 'cny', header: 'cny', value: (r) => r.cny },
      { key: 'eur', header: 'eur', value: (r) => r.eur },
    ],
    [
      { fecha: '2026-08-28', usd: 945.5, cny: 131.2, eur: 1104 },
      { fecha: '2026-08-31', usd: 948, cny: 131.8, eur: 1106 },
      { fecha: '2026-09-01', usd: 950.2, cny: 132.1, eur: 1108 },
    ],
  );
}

export function IndicadoresBcImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<(CatalogExcelPreview & { fileName: string }) | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!/\.(xlsx?|csv)$/i.test(file.name)) {
      toast.error('Solo se aceptan .xlsx, .xls o .csv');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error('El archivo supera 5 MB');
      return;
    }
    setBusy(true);
    try {
      const res = await api.previewIndicadoresBcExcel(file);
      if (!res.items?.length) {
        toast.error('El archivo no tiene filas para importar');
        return;
      }
      setPreview({ ...res, fileName: file.name });
      setKept(new Set(res.items.filter((it) => it.accion !== 'SIN_CAMBIOS').map((it) => it.codigo)));
      void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'indicadores-bc') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el archivo');
      setPreview(null);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const close = () => {
    setPreview(null);
    setKept(new Set());
  };

  const confirm = async () => {
    if (!preview) return;
    const items = toCatalogExcelImportPayload(
      preview.items.filter((it) => kept.has(it.codigo)) as Array<Record<string, unknown>>,
      IMPORT_KEYS,
    );
    if (!items.length) {
      toast.error('Seleccione al menos una fila');
      return;
    }
    setBusy(true);
    try {
      const res = await api.importIndicadoresBcExcel(
        items as Array<{ fecha: string; usd?: number; cny?: number; eur?: number }>,
        { archivoNombre: preview.fileName },
      );
      toast.success(
        `Importado: +${res.created} nuevas · ${res.updated} actualizadas`
        + (res.unchanged ? ` · ${res.unchanged} sin cambios` : ''),
      );
      close();
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'indicadores-bc') });
    } catch (e) {
      if (catalogImportResponseLost(e)) {
        close();
        await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'indicadores-bc') }).catch(() => undefined);
        toast.warning(CATALOG_IMPORT_LOST_RESPONSE);
      } else {
        toast.error(e instanceof Error ? e.message : 'No se pudo importar');
      }
    } finally {
      setBusy(false);
    }
  };

  const keptCount = preview ? preview.items.filter((it) => kept.has(it.codigo)).length : 0;
  const shown: CatalogExcelPreviewItem[] = preview
    ? preview.items.slice(0, PREVIEW_CAP)
    : [];

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        leftIcon={<Download size={14} />}
        onClick={() => downloadPlantillaIndicadoresBc()}
      >
        Plantilla CSV
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        leftIcon={<Upload size={14} />}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy && !preview ? 'Leyendo…' : 'Importar histórico'}
      </Button>

      <Modal
        open={preview != null}
        onClose={close}
        title="Importar indicadores BC"
        size="xl"
        footer={(
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void confirm()} disabled={busy || keptCount === 0}>
              {busy ? 'Importando…' : `Confirmar importación (${keptCount})`}
            </Button>
          </>
        )}
      >
        {preview && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              <strong className="text-[var(--color-text)]">{preview.fileName}</strong>
              {' · '}
              {preview.nuevos ?? 0} nuevas · {preview.duplicados} con cambios · {preview.sinCambios ?? 0} iguales
            </p>
            <ul className="list-disc pl-5 text-xs text-[var(--color-muted)] space-y-0.5">
              <li>Clave = fecha. Upsert global (mismo modelo que el sync BC). Vacío no pisa el valor grabado.</li>
              <li>USD / Yuan (CNY) / EUR opcional. No cargues 19 mil filas de ejemplo: usa el Excel de Mario.</li>
            </ul>
            {preview.items.length > PREVIEW_CAP && (
              <p className="text-xs text-[var(--color-muted)]">
                Vista previa de {PREVIEW_CAP} de {preview.items.length} filas. La confirmación importa las seleccionadas.
              </p>
            )}
            <div className="max-h-[50vh] overflow-auto rounded border border-[var(--color-border)]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
                  <tr>
                    <th className="w-10 px-2 py-1.5">
                      <Checkbox
                        checked={preview.items.length > 0 && keptCount === preview.items.length}
                        onChange={(e) => {
                          if (e.target.checked) setKept(new Set(preview.items.map((it) => it.codigo)));
                          else setKept(new Set());
                        }}
                        aria-label="Seleccionar todas"
                      />
                    </th>
                    <th className="px-2 py-1.5">Fecha</th>
                    <th className="px-2 py-1.5">USD</th>
                    <th className="px-2 py-1.5">Yuan</th>
                    <th className="px-2 py-1.5">EUR</th>
                    <th className="px-2 py-1.5">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => {
                    const isKept = kept.has(it.codigo);
                    return (
                      <tr
                        key={it.codigo}
                        className={[
                          'border-t border-[var(--color-border)]',
                          it.accion === 'ACTUALIZA' ? 'bg-amber-50/80 dark:bg-amber-950/30' : '',
                          !isKept ? 'opacity-50' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td className="px-2 py-1">
                          <Checkbox
                            checked={isKept}
                            onChange={() => {
                              setKept((prev) => {
                                const next = new Set(prev);
                                if (next.has(it.codigo)) next.delete(it.codigo);
                                else next.add(it.codigo);
                                return next;
                              });
                            }}
                            aria-label={`Conservar ${it.codigo}`}
                          />
                        </td>
                        <td className="px-2 py-1 font-mono">{it.fecha as string}</td>
                        <td className="px-2 py-1">{it.usd != null ? String(it.usd) : '—'}</td>
                        <td className="px-2 py-1">{it.cny != null ? String(it.cny) : '—'}</td>
                        <td className="px-2 py-1">{it.eur != null ? String(it.eur) : '—'}</td>
                        <td className="px-2 py-1">{labelAccion(it.accion)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </span>
  );
}
