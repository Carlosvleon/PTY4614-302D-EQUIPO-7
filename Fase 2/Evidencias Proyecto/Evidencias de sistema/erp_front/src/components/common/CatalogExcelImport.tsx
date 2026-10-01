import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileDown, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { useEmpresaScopeId, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import {
  CATALOG_IMPORT_LOST_RESPONSE,
  catalogImportResponseLost,
  toCatalogExcelImportPayload,
} from '@/components/common/catalog-excel-import.util';
import { CatalogoImportacionesHistorial, type CatalogoImportacionTipo } from '@/components/common/CatalogoImportacionesHistorial';

export type AccionImport = 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';

export type CatalogExcelPreviewItem = {
  codigo: string;
  nombre: string;
  accion?: AccionImport;
  cambios?: string[];
  [key: string]: unknown;
};

export type CatalogExcelPreview = {
  total: number;
  duplicados: number;
  existingCount: number;
  nuevos?: number;
  sinCambios?: number;
  items: CatalogExcelPreviewItem[];
  duplicateCodigos: string[];
  ignoredHeaders?: string[];
  skippedInFile?: string[];
};

export type ImportResult = { created: number; updated: number; unchanged?: number; total: number };

function labelAccion(accion?: AccionImport) {
  if (accion === 'NUEVO') return 'Nuevo';
  if (accion === 'ACTUALIZA') return 'Actualiza';
  if (accion === 'SIN_CAMBIOS') return 'Sin cambios';
  return '—';
}

export function CatalogExcelImport({
  queryKey,
  previewFn,
  importFn,
  hint,
  columns,
  title,
  importKeys,
  historialTipo,
  onDescargarPlantilla,
  onExportar,
}: {
  queryKey: string;
  previewFn: (file: File) => Promise<CatalogExcelPreview>;
  importFn: (items: CatalogExcelPreviewItem[], meta?: { archivoNombre?: string }) => Promise<ImportResult>;
  hint: string;
  columns: { key: string; header: string }[];
  title: string;
  /** Claves permitidas en el POST (sin accion/cambios del preview). */
  importKeys: readonly string[];
  historialTipo?: CatalogoImportacionTipo;
  onDescargarPlantilla?: () => void;
  onExportar?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<(CatalogExcelPreview & { fileName: string }) | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      toast.error('Solo se aceptan archivos .xlsx o .xls');
      return;
    }
    setBusy(true);
    try {
      const res = await previewFn(file);
      if (!res.items?.length) {
        toast.error('El archivo no tiene filas para importar');
        return;
      }
      setPreview({ ...res, fileName: file.name });
      setKept(new Set(res.items.filter((it) => it.accion !== 'SIN_CAMBIOS').map((it) => it.codigo)));
      void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, queryKey) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el Excel');
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
      importKeys,
    ) as CatalogExcelPreviewItem[];
    if (!items.length) {
      toast.error('Seleccione al menos una fila');
      return;
    }
    setBusy(true);
    try {
      const res = await importFn(items, { archivoNombre: preview.fileName });
      if (res.created === 0 && res.updated === 0) {
        toast.message(
          `Esos ${res.unchanged ?? items.length} códigos ya están en el listado, con el mismo nombre. No se agregó ninguno nuevo.`,
        );
      } else {
        toast.success(
          `Importado: +${res.created} nuevas · ${res.updated} actualizadas`
          + (res.unchanged ? ` · ${res.unchanged} sin cambios` : ''),
        );
      }
      close();
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, queryKey) });
      if (historialTipo) {
        await qc.invalidateQueries({
          queryKey: listQueryKey(scope, empresaId, `catalogo-importaciones:${historialTipo}`),
        });
      }
    } catch (e) {
      if (catalogImportResponseLost(e)) {
        close();
        await Promise.all([
          qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, queryKey) }),
          historialTipo
            ? qc.invalidateQueries({
              queryKey: listQueryKey(scope, empresaId, `catalogo-importaciones:${historialTipo}`),
            })
            : Promise.resolve(),
        ]).catch(() => undefined);
        toast.warning(CATALOG_IMPORT_LOST_RESPONSE);
      } else {
        toast.error(e instanceof Error ? e.message : 'No se pudo importar');
      }
    } finally {
      setBusy(false);
    }
  };

  const keptItems = preview ? preview.items.filter((it) => kept.has(it.codigo)) : [];
  const keptCount = keptItems.length;
  const keptChanged = keptItems.filter((it) => it.accion !== 'SIN_CAMBIOS').length;
  const nadaNuevo = (preview?.nuevos ?? 0) === 0 && (preview?.duplicados ?? 0) === 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
      />
      {onDescargarPlantilla && (
        <Button
          type="button"
          variant="outline"
          leftIcon={<Download size={14} />}
          onClick={onDescargarPlantilla}
        >
          Plantilla
        </Button>
      )}
      {onExportar && (
        <Button
          type="button"
          variant="outline"
          leftIcon={<FileDown size={14} />}
          onClick={onExportar}
        >
          Exportar
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        leftIcon={<Upload size={14} />}
        disabled={busy}
        title={hint}
        onClick={() => inputRef.current?.click()}
      >
        {busy && !preview ? 'Leyendo…' : 'Importar Excel'}
      </Button>
      {historialTipo && <CatalogoImportacionesHistorial tipo={historialTipo} />}

      <Modal
        open={preview != null}
        onClose={close}
        title={title}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void confirm()} disabled={busy || keptChanged === 0}>
              {busy ? 'Importando…' : `Confirmar importación (${keptChanged})`}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              <strong className="text-[var(--color-text)]">{preview.fileName}</strong>
              {' · '}
              {preview.nuevos ?? 0} nuevas · {preview.duplicados} con cambios · {preview.sinCambios ?? 0} iguales
              {' · '}
              {preview.existingCount} ya en la empresa
            </p>
            {nadaNuevo && (
              <p className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)]">
                Estos {preview.sinCambios ?? preview.items.length} códigos ya están en el listado de esta empresa.
                El primero del archivo, <strong>{preview.items[0]?.codigo}</strong>
                {preview.items[0]?.nombre ? ` · ${String(preview.items[0].nombre)}` : ''}, es el que aparece al inicio de la tabla.
                Marcar las filas no las vuelve a crear: el código ya existe con el mismo nombre.
              </p>
            )}
            <ul className="list-disc pl-5 text-xs text-[var(--color-muted)] space-y-0.5">
              <li>Suba la plantilla de este mantenedor: un Excel de una sola hoja. El libro con varias pestañas no se acepta.</li>
              <li>La clave es el <strong>código</strong> de la empresa activa. Exportar baja lo que ya está, en esa misma plantilla, para editarlo y volver a subirlo. No se borran códigos que no vengan en el Excel.</li>
              <li>Si el código ya existe, solo se actualizan campos con valor en el archivo. Una celda vacía no pisa lo grabado.</li>
              <li>Un código repetido en el mismo Excel se toma una sola vez (la primera fila).</li>
            </ul>
            {(preview.ignoredHeaders?.length ?? 0) > 0 && (
              <p className="text-xs text-[var(--color-muted)]">
                El maestro no guarda fundo, especie, hectáreas ni el resto del reporte Agrosoft
                ({preview.ignoredHeaders!.length} columnas omitidas). Solo se cargan código, nombre
                y, si vienen, encargado / activa / vigencia.
              </p>
            )}
            {(preview.skippedInFile?.length ?? 0) > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Códigos repetidos en el archivo (se omitieron filas): {[...new Set(preview.skippedInFile)].join(', ')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setKept(new Set(preview.items.map((it) => it.codigo)))}>
                Conservar todas
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setKept(new Set(preview.items.filter((it) => it.accion !== 'SIN_CAMBIOS').map((it) => it.codigo)))}
              >
                Solo nuevas y cambios
              </Button>
              <Button size="sm" variant="outline" onClick={() => setKept(new Set())}>
                Descartar todas
              </Button>
            </div>
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
                    {columns.map((c) => (
                      <th key={c.key} className="px-2 py-1.5">{c.header}</th>
                    ))}
                    <th className="px-2 py-1.5">Acción</th>
                    <th className="px-2 py-1.5">Cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((it) => {
                    const isKept = kept.has(it.codigo);
                    return (
                      <tr
                        key={it.codigo}
                        className={[
                          'border-t border-[var(--color-border)]',
                          it.accion === 'ACTUALIZA' ? 'bg-amber-50/80 dark:bg-amber-950/30' : '',
                          it.accion === 'NUEVO' ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : '',
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
                        {columns.map((c) => (
                          <td key={c.key} className={c.key === 'codigo' ? 'px-2 py-1 font-mono' : 'px-2 py-1'}>
                            {typeof it[c.key] === 'boolean'
                              ? it[c.key] ? 'Sí' : 'No'
                              : String(it[c.key] ?? '—')}
                          </td>
                        ))}
                        <td className="px-2 py-1 font-medium">{labelAccion(it.accion)}</td>
                        <td className="px-2 py-1 text-[var(--color-muted)]">
                          {(it.cambios ?? []).join('; ') || '—'}
                        </td>
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
