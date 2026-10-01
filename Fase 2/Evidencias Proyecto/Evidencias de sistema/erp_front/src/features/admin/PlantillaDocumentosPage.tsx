import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Printer, Save, Palette, FileText, ExternalLink, GripVertical } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppSettings } from '@/app/app-settings-context';
import { cn } from '@/lib/utils';
import type { Empresa, PlantillaDocumento } from '@/types/domain';
import {
  DEFAULT_PLANTILLA_DOC,
  PLANTILLA_PREVIEW_KIND,
  plantillaPreviewRow,
  printEmpresaDocumento,
  renderDocumentoHtml,
  resolvePlantilla,
} from '@/lib/documentoPrint';
import * as api from '@/services/api';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

type FormState = {
  direccion: string;
  comuna: string;
  ciudad: string;
  telefono: string;
  emailContacto: string;
  logoUrl: string;
  selloUrl: string;
  plantilla: PlantillaDocumento;
};

function fromEmpresa(e: Empresa): FormState {
  return {
    direccion: e.direccion ?? '',
    comuna: e.comuna ?? '',
    ciudad: e.ciudad ?? '',
    telefono: e.telefono ?? '',
    emailContacto: e.emailContacto ?? '',
    logoUrl: e.logoUrl ?? '',
    selloUrl: e.selloUrl ?? '',
    plantilla: resolvePlantilla(e),
  };
}

const emptyForm = (): FormState =>
  fromEmpresa({
    id: '',
    razonSocial: '',
    rut: '',
    giro: '',
    activa: true,
    plantillaDoc: DEFAULT_PLANTILLA_DOC,
  });

const TABS = [
  { id: 'diseno', label: 'Diseño', icon: Palette },
  { id: 'contenido', label: 'Contenido', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

function SelectorArchivo({
  value,
  onChange,
  maxLabel,
}: {
  value: string;
  onChange: (url: string) => void;
  maxLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 800_000) {
            toast.error(maxLabel);
            return;
          }
          void fileToDataUrl(f).then(onChange);
          e.target.value = '';
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        Seleccionar archivo
      </Button>
      {value ? (
        <>
          <img src={value} alt="" className="h-10 max-w-[160px] object-contain" />
          <button
            type="button"
            className="text-xs text-[var(--color-muted)] underline"
            onClick={() => onChange('')}
          >
            Quitar
          </button>
        </>
      ) : (
        <span className="text-xs text-[var(--color-muted)]">Sin archivo</span>
      )}
    </div>
  );
}

export default function PlantillaDocumentosPage() {
  const { selectedEmpresa, empresas, refreshEmpresas, setSelectedEmpresaId } = useAppSettings();
  const empresa = selectedEmpresa ?? empresas[0] ?? null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('diseno');
  const [previewHtml, setPreviewHtml] = useState('');
  /** % del ancho para el panel de vista previa (barra vertical arrastrable). */
  const [previewPct, setPreviewPct] = useState(() => {
    const raw = sessionStorage.getItem('erp.plantilla.previewPct');
    const n = raw ? Number(raw) : 40;
    return Number.isFinite(n) ? Math.min(70, Math.max(22, n)) : 40;
  });
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    sessionStorage.setItem('erp.plantilla.previewPct', String(previewPct));
  }, [previewPct]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      if (rect.width < 80) return;
      const fromRight = rect.right - e.clientX;
      const pct = (fromRight / rect.width) * 100;
      setPreviewPct(Math.min(70, Math.max(22, pct)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const startSplitDrag = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (empresa) setForm(fromEmpresa(empresa));
  }, [empresa]);

  const previewEmpresa = useMemo((): Empresa | null => {
    if (!empresa) return null;
    return {
      ...empresa,
      direccion: form.direccion,
      comuna: form.comuna,
      ciudad: form.ciudad,
      telefono: form.telefono,
      emailContacto: form.emailContacto,
      logoUrl: form.logoUrl || undefined,
      selloUrl: form.selloUrl || undefined,
      plantillaDoc: form.plantilla,
    };
  }, [empresa, form]);

  // Debounce de la vista previa embebida para no re-renderizar el iframe en cada tecla.
  useEffect(() => {
    if (!previewEmpresa) {
      setPreviewHtml('');
      return;
    }
    const timer = window.setTimeout(() => {
      setPreviewHtml(
        renderDocumentoHtml({
          empresa: previewEmpresa,
          kind: PLANTILLA_PREVIEW_KIND,
          title: 'Vista previa · Nota de débito de exportación',
          rows: [plantillaPreviewRow()],
        }),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [previewEmpresa]);

  const setPlantilla = <K extends keyof PlantillaDocumento>(key: K, value: PlantillaDocumento[K]) => {
    setForm((s) => ({ ...s, plantilla: { ...s.plantilla, [key]: value } }));
  };

  const save = async () => {
    if (!empresa) {
      toast.error('Selecciona una empresa en el header');
      return;
    }
    setSaving(true);
    try {
      await api.updateEmpresa(empresa.id, {
        razonSocial: empresa.razonSocial,
        rut: empresa.rut,
        giro: empresa.giro,
        activa: empresa.activa,
        direccion: form.direccion,
        comuna: form.comuna,
        ciudad: form.ciudad,
        telefono: form.telefono,
        emailContacto: form.emailContacto,
        logoUrl: form.logoUrl || undefined,
        selloUrl: form.selloUrl || undefined,
        plantillaDoc: form.plantilla,
        gosocketBillerId: empresa.gosocketBillerId ?? null,
      });
      await refreshEmpresas();
      toast.success('Plantilla de documentos guardada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const openPrintPreview = () => {
    if (!previewEmpresa) return;
    try {
      printEmpresaDocumento({
        empresa: previewEmpresa,
        kind: PLANTILLA_PREVIEW_KIND,
        title: 'Vista previa · Nota de débito de exportación',
        rows: [plantillaPreviewRow()],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la vista previa');
    }
  };

  const openPreviewWindow = () => {
    if (!previewHtml) {
      toast.error('Vista previa aún no disponible');
      return;
    }
    try {
      const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'width=920,height=780');
      if (!w) {
        URL.revokeObjectURL(url);
        toast.error('El navegador bloqueó la ventana emergente');
        return;
      }
      // Liberar blob cuando la ventana ya cargó / se cierra (mejor esfuerzo).
      const revoke = () => URL.revokeObjectURL(url);
      w.addEventListener('load', () => setTimeout(revoke, 60_000), { once: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la ventana');
    }
  };

  return (
    <div>
      <PageHeader
        title="Plantilla documentos"
        breadcrumbs={['Administración']}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={openPrintPreview} disabled={!empresa}>
              Abrir para imprimir
            </Button>
            <Button leftIcon={<Save size={16} />} onClick={() => void save()} disabled={saving || !empresa}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        )}
      />

      {!empresa ? (
        <p className="text-sm text-[var(--color-muted)]">No hay empresa seleccionada.</p>
      ) : (
        <div
          ref={splitRef}
          className="flex min-h-[min(70vh,720px)] flex-col lg:flex-row lg:items-stretch"
          style={{ ['--preview-pct' as string]: `${previewPct}%` }}
        >
          <div className="grid min-w-0 flex-1 gap-6 lg:overflow-y-auto lg:pr-1 lg:basis-[calc(100%-var(--preview-pct))]">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="mb-3 text-sm text-[var(--color-muted)]">
                Empresa activa: <strong className="text-[var(--color-fg)]">{empresa.razonSocial}</strong>
                {' · '}
                <select
                  className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
                  value={empresa.id}
                  onChange={(e) => setSelectedEmpresaId(e.target.value)}
                >
                  {empresas.map((em) => (
                    <option key={em.id} value={em.id}>{em.razonSocial}</option>
                  ))}
                </select>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Dirección">
                  <Input value={form.direccion} onChange={(e) => setForm((s) => ({ ...s, direccion: e.target.value }))} placeholder="Camino Almahue s/n" />
                </Field>
                <Field label="Comuna">
                  <Input value={form.comuna} onChange={(e) => setForm((s) => ({ ...s, comuna: e.target.value }))} />
                </Field>
                <Field label="Ciudad">
                  <Input value={form.ciudad} onChange={(e) => setForm((s) => ({ ...s, ciudad: e.target.value }))} />
                </Field>
                <Field label="Teléfono">
                  <Input value={form.telefono} onChange={(e) => setForm((s) => ({ ...s, telefono: e.target.value }))} />
                </Field>
                <Field label="Email contacto">
                  <Input value={form.emailContacto} onChange={(e) => setForm((s) => ({ ...s, emailContacto: e.target.value }))} />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                      tab === id
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]',
                    )}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'diseno' && (
                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Color primario (marca)">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-9 w-12 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
                          value={form.plantilla.colorPrimario || DEFAULT_PLANTILLA_DOC.colorPrimario}
                          onChange={(e) => setPlantilla('colorPrimario', e.target.value)}
                        />
                        <Input
                          value={form.plantilla.colorPrimario || ''}
                          onChange={(e) => setPlantilla('colorPrimario', e.target.value)}
                          placeholder="#1a4d2e"
                        />
                      </div>
                    </Field>
                    <Field label="Tipografía">
                      <Select
                        value={form.plantilla.fontFamily || 'serif'}
                        onChange={(e) => setPlantilla('fontFamily', e.target.value as PlantillaDocumento['fontFamily'])}
                      >
                        <option value="serif">Clásica (serif)</option>
                        <option value="sans">Moderna (sans-serif)</option>
                      </Select>
                    </Field>
                    <Field label="Tamaño de letra">
                      <Select
                        value={form.plantilla.fontSize || 'M'}
                        onChange={(e) => setPlantilla('fontSize', e.target.value as PlantillaDocumento['fontSize'])}
                      >
                        <option value="S">Pequeña</option>
                        <option value="M">Normal</option>
                        <option value="L">Grande</option>
                      </Select>
                    </Field>
                  </div>

                  <div className="rounded border border-[var(--color-border)] p-3">
                    <Checkbox
                      label="Logo"
                      checked={form.plantilla.showLogo !== false}
                      onChange={(e) => setPlantilla('showLogo', e.target.checked)}
                    />
                    {form.plantilla.showLogo !== false ? (
                      <div className="mt-3 grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Posición">
                            <Select
                              value={form.plantilla.logoPosicion || 'izquierda'}
                              onChange={(e) => setPlantilla('logoPosicion', e.target.value as PlantillaDocumento['logoPosicion'])}
                            >
                              <option value="izquierda">Izquierda</option>
                              <option value="centro">Centro</option>
                              <option value="derecha">Derecha</option>
                            </Select>
                          </Field>
                          <Field label="Tamaño">
                            <Select
                              value={form.plantilla.logoTamano || 'M'}
                              onChange={(e) => setPlantilla('logoTamano', e.target.value as PlantillaDocumento['logoTamano'])}
                            >
                              <option value="S">Pequeño</option>
                              <option value="M">Mediano</option>
                              <option value="L">Grande</option>
                            </Select>
                          </Field>
                        </div>
                        <SelectorArchivo
                          value={form.logoUrl}
                          maxLabel="Logo máximo ~800 KB"
                          onChange={(url) => setForm((s) => ({ ...s, logoUrl: url }))}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {tab === 'contenido' && (
                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ['showAddress', 'Mostrar dirección'],
                      ['showFooter', 'Mostrar pie'],
                    ] as const).map(([key, label]) => (
                      <Checkbox
                        key={key}
                        label={label}
                        checked={Boolean(form.plantilla[key])}
                        onChange={(e) => setPlantilla(key, e.target.checked)}
                      />
                    ))}
                    <Field label="Texto pie">
                      <Textarea
                        rows={2}
                        value={form.plantilla.footerText ?? ''}
                        onChange={(e) => setPlantilla('footerText', e.target.value)}
                      />
                    </Field>
                    <Field label="Marca de agua (texto)">
                      <Input
                        value={form.plantilla.watermarkText ?? ''}
                        onChange={(e) => setPlantilla('watermarkText', e.target.value)}
                        placeholder="BORRADOR / FACTURA"
                      />
                    </Field>
                  </div>

                  <h4 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Columnas del detalle</h4>
                  <p className="text-xs text-[var(--color-muted)]">Descripción, cantidad, precio y total van siempre. El timbre del DTE lo pone GoSocket al emitir.</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <Checkbox
                      label="Código"
                      checked={form.plantilla.colCodigo !== false}
                      onChange={(e) => setPlantilla('colCodigo', e.target.checked)}
                    />
                    <Checkbox
                      label="Unidad"
                      checked={form.plantilla.colUnidad !== false}
                      onChange={(e) => setPlantilla('colUnidad', e.target.checked)}
                    />
                    <Checkbox
                      label="Descuento"
                      checked={form.plantilla.colDescuento === true}
                      onChange={(e) => setPlantilla('colDescuento', e.target.checked)}
                    />
                    <Checkbox
                      label="Monto en letras"
                      checked={form.plantilla.showMontoLetras !== false}
                      onChange={(e) => setPlantilla('showMontoLetras', e.target.checked)}
                    />
                  </div>

                  <div className="mt-2 border-t border-[var(--color-border)] pt-4">
                    <Checkbox
                      label="Mostrar términos y datos de pago al pie del documento"
                      className="mb-3 text-sm font-medium"
                      checked={Boolean(form.plantilla.showTerminos)}
                      onChange={(e) => setPlantilla('showTerminos', e.target.checked)}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Términos y condiciones">
                        <Textarea
                          rows={3}
                          disabled={!form.plantilla.showTerminos}
                          value={form.plantilla.terminosPago ?? ''}
                          onChange={(e) => setPlantilla('terminosPago', e.target.value)}
                          placeholder="Plazo de pago 30 días. Precios netos, no incluyen IVA…"
                        />
                      </Field>
                      <Field label="Datos de pago / bancarios">
                        <Textarea
                          rows={3}
                          disabled={!form.plantilla.showTerminos}
                          value={form.plantilla.datosBancarios ?? ''}
                          onChange={(e) => setPlantilla('datosBancarios', e.target.value)}
                          placeholder="Banco Estado · Cta. Cte. 123456789 · contacto@almahue.cl"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Barra vertical arrastrable: divide configuración | vista previa */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(previewPct)}
            aria-valuemin={22}
            aria-valuemax={70}
            aria-label="Redimensionar vista previa"
            title="Arrastra para ampliar o reducir la vista previa"
            tabIndex={0}
            onPointerDown={startSplitDrag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setPreviewPct((p) => Math.min(70, p + 2));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setPreviewPct((p) => Math.max(22, p - 2));
              }
            }}
            className={cn(
              'group relative my-4 flex h-3 w-full shrink-0 cursor-row-resize items-center justify-center lg:my-0 lg:h-auto lg:w-3 lg:cursor-col-resize',
              'touch-none select-none',
            )}
          >
            <span
              className={cn(
                'rounded-full bg-[var(--color-border)] transition-colors',
                'h-1 w-16 group-hover:bg-[var(--color-brand)] group-focus-visible:bg-[var(--color-brand)]',
                'lg:h-16 lg:w-1',
              )}
            />
            <GripVertical
              size={14}
              className="pointer-events-none absolute hidden text-[var(--color-muted)] group-hover:text-[var(--color-brand)] lg:block"
              aria-hidden
            />
          </div>

          <div className="flex min-h-[320px] w-full min-w-0 flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:w-auto lg:basis-[var(--preview-pct)] lg:shrink-0">
            <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="text-sm font-semibold">Vista previa en vivo</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  leftIcon={<ExternalLink size={14} />}
                  disabled={!previewHtml}
                  onClick={openPreviewWindow}
                  title="Abrir vista previa en una nueva ventana"
                >
                  Nueva ventana
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--color-border)] bg-white">
                <iframe
                  title="Vista previa de documento"
                  srcDoc={previewHtml}
                  className="h-full min-h-[480px] w-full border-0"
                  sandbox=""
                />
              </div>
              <p className="mt-2 px-1 text-xs text-[var(--color-muted)]">
                Arrastra la barra vertical entre los paneles para ver más configuración o más vista previa.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
