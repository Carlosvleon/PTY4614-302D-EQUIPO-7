import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';
import * as api from '@/services/api';
import type { AprobacionesBackupPreview, ResolucionBackupUsuario } from '@/types/domain';

type Props = {
  empresaNombre?: string;
  onImported: () => Promise<void>;
};

export function AprobacionesBackupPanel({ empresaNombre, onImported }: Props) {
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState<AprobacionesBackupPreview | null>(null);
  const [backupRaw, setBackupRaw] = useState<Record<string, unknown> | null>(null);
  const [resoluciones, setResoluciones] = useState<Record<string, ResolucionBackupUsuario>>({});

  const pendientesTotal = useMemo(
    () => Object.values(preview?.pendientes ?? {}).reduce((a, n) => a + n, 0),
    [preview],
  );
  const faltanResolver = (preview?.eslabonesFaltantes ?? []).some((e) => {
    const r = resoluciones[e.usuarioId];
    if (!r) return true;
    if (r.accion === 'reemplazar' && !r.nuevoUsuarioId) return true;
    return false;
  });

  const downloadExport = async () => {
    setBusy(true);
    try {
      const data = await api.exportAprobacionesConfig('empresa') as Record<string, unknown>;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const emp = typeof data.empresaNombre === 'string' ? data.empresaNombre.replace(/\s+/g, '-') : 'empresa';
      a.download = `aprobaciones-${emp}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Respaldo de la empresa descargado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setBusy(false);
    }
  };

  const parseInput = async (text: string) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      toast.error('JSON inválido');
      return;
    }
    setBusy(true);
    try {
      const p = await api.previewAprobacionesConfig(parsed);
      setBackupRaw(parsed);
      setPreview(p);
      const init: Record<string, ResolucionBackupUsuario> = {};
      for (const e of p.eslabonesFaltantes) {
        init[e.usuarioId] = { accion: 'reemplazar', nuevoUsuarioId: '' };
      }
      setResoluciones(init);
      if (!p.eslabonesFaltantes.length && p.ok) {
        toast.success('El respaldo es compatible con los usuarios de esta empresa');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al analizar el respaldo');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setJsonText(text);
    await parseInput(text);
  };

  const confirmarImport = async () => {
    if (!backupRaw || !preview) return;
    if (pendientesTotal > 0) {
      toast.error('Hay documentos pendientes. Reasigne antes de cargar el respaldo.');
      return;
    }
    if (faltanResolver) {
      toast.error('Resuelva cada eslabón faltante: reemplazar o eliminar');
      return;
    }
    if (!window.confirm(
      `Esto reemplazará grupos, escalas, suplencias y administradores de concepto en «${preview.empresaDestinoNombre ?? 'la empresa actual'}». ¿Continuar?`,
    )) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.importAprobacionesConfig({ ...backupRaw, resoluciones });
      toast.success(res.mensaje || 'Respaldo cargado');
      setPreview(null);
      setBackupRaw(null);
      setJsonText('');
      setResoluciones({});
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)]">
        El respaldo queda acotado a la <strong>empresa actual</strong>
        {empresaNombre ? ` (${empresaNombre})` : ''}: grupos, escalas, integrantes, suplencias y administradores.
        No incluye contraseñas. Al cargar se validan los usuarios; si falta un eslabón de la cadena puede reemplazarlo o quitarlo.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void downloadExport()} disabled={busy}>
          {busy ? 'Preparando…' : 'Exportar empresa actual'}
        </Button>
      </div>

      <Field label="Cargar respaldo (archivo JSON)">
        <input
          type="file"
          accept="application/json,.json"
          className="block w-full text-sm text-[var(--color-text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-accent)] file:px-3 file:py-1.5 file:text-sm file:text-white"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </Field>
      <Field label="O pegar JSON">
        <textarea
          className="min-h-[8rem] w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)]"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='{"version":2,"empresaId":"...","grupos":[...]}'
        />
      </Field>
      <Button
        variant="ghost"
        onClick={() => void parseInput(jsonText)}
        disabled={busy || !jsonText.trim()}
      >
        Analizar respaldo
      </Button>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Cargar respaldo de aprobaciones"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => void confirmarImport()}
              disabled={busy || faltanResolver || pendientesTotal > 0}
            >
              {busy ? 'Importando…' : 'Aplicar a esta empresa'}
            </Button>
          </>
        )}
      >
        {preview && (
          <div className="space-y-4 text-sm">
            <p className="text-[var(--color-muted)]">
              Origen: <strong className="text-[var(--color-text)]">{preview.empresaOrigenNombre ?? preview.empresaOrigenId ?? '—'}</strong>
              {' → '}destino: <strong className="text-[var(--color-text)]">{preview.empresaDestinoNombre ?? preview.empresaDestinoId}</strong>
            </p>
            <ul className="grid grid-cols-2 gap-1 text-xs text-[var(--color-muted)] sm:grid-cols-4">
              <li>{preview.resumen.grupos} grupos</li>
              <li>{preview.resumen.nodos} nodos</li>
              <li>{preview.resumen.delegaciones} suplencias</li>
              <li>{preview.resumen.adminConcepto} admin(s)</li>
            </ul>
            {pendientesTotal > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
                Hay documentos pendientes ({Object.entries(preview.pendientes).map(([m, n]) => `${m}: ${n}`).join(', ')}).
                Reasigne antes de importar.
              </p>
            )}
            {preview.autoMatched.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Emparejados por email</p>
                <ul className="space-y-1 text-xs">
                  {preview.autoMatched.map((m) => (
                    <li key={m.origenId}>
                      {m.origenNombre} ({m.origenEmail}) → {m.destinoNombre}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.eslabonesFaltantes.length === 0 ? (
              <p className="text-emerald-700 dark:text-emerald-400">Todos los usuarios del respaldo existen en esta empresa (o se emparejaron por email).</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Eslabones / usuarios faltantes
                </p>
                {preview.eslabonesFaltantes.map((e) => {
                  const r = resoluciones[e.usuarioId] ?? { accion: 'reemplazar' as const, nuevoUsuarioId: '' };
                  return (
                    <div key={e.usuarioId} className="rounded-md border border-[var(--color-border)] p-3">
                      <p className="font-medium text-[var(--color-text)]">
                        {e.nombre ?? e.usuarioId}
                        {e.email ? <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">{e.email}</span> : null}
                      </p>
                      <ul className="mt-1 list-disc pl-4 text-[11px] text-[var(--color-muted)]">
                        {e.usos.map((u, i) => (
                          <li key={`${u.tipo}-${i}`}>{u.detalle}{u.grupoNombre ? '' : ''} · {u.modulo}</li>
                        ))}
                      </ul>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Field label="Acción">
                          <Select
                            value={r.accion}
                            onChange={(ev) => setResoluciones((s) => ({
                              ...s,
                              [e.usuarioId]: {
                                accion: ev.target.value as 'reemplazar' | 'eliminar',
                                nuevoUsuarioId: s[e.usuarioId]?.nuevoUsuarioId ?? '',
                              },
                            }))}
                          >
                            <option value="reemplazar">Reemplazar con otro usuario</option>
                            <option value="eliminar">Eliminar eslabón / omitir</option>
                          </Select>
                        </Field>
                        {r.accion === 'reemplazar' && (
                          <Field label="Usuario de esta empresa">
                            <Select
                              value={r.nuevoUsuarioId ?? ''}
                              onChange={(ev) => setResoluciones((s) => ({
                                ...s,
                                [e.usuarioId]: { accion: 'reemplazar', nuevoUsuarioId: ev.target.value },
                              }))}
                            >
                              <option value="">— Seleccionar —</option>
                              {preview.usuariosDestino.map((u) => (
                                <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>
                              ))}
                            </Select>
                          </Field>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
