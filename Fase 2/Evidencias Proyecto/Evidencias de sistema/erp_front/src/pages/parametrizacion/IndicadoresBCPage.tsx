import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  Download,
  Upload,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  X,
  Filter,
  ArrowRight,
} from 'lucide-react';
import {
  fetchIndicadores,
  fetchMonedas,
  sincronizarIndicadores,
  fetchConfigSync,
  updateConfigSync,
  importarIndicadoresCsv,
  getUrlPlantillaCsv,
} from '@/lib/api';
import type { TipoCambio, ConfiguracionSyncBC } from '@/lib/api';

export default function IndicadoresBCPage() {
  const queryClient = useQueryClient();

  // Filtros de tabla
  const hoyStr = new Date().toISOString().slice(0, 10);
  const [desdeFiltro, setDesdeFiltro] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [hastaFiltro, setHastaFiltro] = useState(hoyStr);
  const [monedaFiltro, setMonedaFiltro] = useState('');

  // Rango sincronización manual
  const [desdeSync, setDesdeSync] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [hastaSync, setHastaSync] = useState(hoyStr);
  const [syncFeedback, setSyncFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Modal importación CSV
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvFeedback, setCsvFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Queries
  const { data: indicadores = [], isLoading, refetch } = useQuery<TipoCambio[]>({
    queryKey: ['indicadores', desdeFiltro, hastaFiltro, monedaFiltro],
    queryFn: () =>
      fetchIndicadores({
        desde: desdeFiltro || undefined,
        hasta: hastaFiltro || undefined,
        monedaCodigo: monedaFiltro || undefined,
      }),
  });

  const { data: monedas = [] } = useQuery({
    queryKey: ['monedas'],
    queryFn: fetchMonedas,
  });

  const { data: configSync } = useQuery<ConfiguracionSyncBC>({
    queryKey: ['config-sync'],
    queryFn: fetchConfigSync,
  });

  // Mutación Sincronización Manual
  const syncMutation = useMutation({
    mutationFn: sincronizarIndicadores,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['indicadores'] });
      queryClient.invalidateQueries({ queryKey: ['config-sync'] });
      setSyncFeedback({
        tipo: 'ok',
        texto: res.mensaje || `Sincronizados ${res.totalSincronizados} registros con éxito.`,
      });
      setTimeout(() => setSyncFeedback(null), 5000);
    },
    onError: (err: any) => {
      setSyncFeedback({
        tipo: 'error',
        texto: err.response?.data?.message || err.message || 'Error en la sincronización.',
      });
    },
  });

  // Mutación Guardar Configuración
  const configMutation = useMutation({
    mutationFn: updateConfigSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config-sync'] });
      alert('Configuración de sincronización guardada correctamente.');
    },
  });

  // Mutación Subir CSV
  const csvMutation = useMutation({
    mutationFn: importarIndicadoresCsv,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['indicadores'] });
      setCsvFeedback({
        tipo: 'ok',
        texto: res.mensaje || `Importados ${res.totalImportados} registros con éxito.`,
      });
      setSelectedFile(null);
      setTimeout(() => {
        setIsCsvModalOpen(false);
        setCsvFeedback(null);
      }, 2000);
    },
    onError: (err: any) => {
      setCsvFeedback({
        tipo: 'error',
        texto: err.response?.data?.message || err.message || 'Error al importar archivo CSV.',
      });
    },
  });

  // Helper: Saber si hoy o el último día disponible tiene registro USD
  const tipoCambioHoy =
    indicadores.find((i) => i.fecha === hoyStr && i.moneda?.codigo === 'USD') ||
    indicadores.find((i) => i.moneda?.codigo === 'USD');
  const esDeHoy = tipoCambioHoy?.fecha === hoyStr;

  const handleManualSync = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSyncFeedback(null);
    syncMutation.mutate({ desde: desdeSync, hasta: hastaSync });
  };

  const handleCsvUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setCsvFeedback(null);
    csvMutation.mutate(selectedFile);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <TrendingUp size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Indicadores Banco Central</h1>
          </div>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Consulta oficial de tipos de cambio diarios, paridades cambiarias y carga masiva histórica.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={getUrlPlantillaCsv()}
            download
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download size={14} className="text-[var(--color-muted)]" />
            <span>Descargar Plantilla CSV</span>
          </a>
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-accent)] hover:bg-indigo-50/50 transition-colors shadow-sm"
          >
            <Upload size={14} />
            <span>Importar Histórico CSV</span>
          </button>
        </div>
      </div>

      {/* Tarjeta de Estado del Día */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl flex items-center justify-center ${
                tipoCambioHoy ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}
            >
              {tipoCambioHoy ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
                  Tipo de cambio {esDeHoy ? `hoy (${hoyStr})` : `vigente (${tipoCambioHoy?.fecha || hoyStr})`}
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    esDeHoy
                      ? 'bg-emerald-100/60 text-emerald-800'
                      : tipoCambioHoy
                      ? 'bg-blue-100/60 text-blue-800'
                      : 'bg-amber-100/60 text-amber-800'
                  }`}
                >
                  {esDeHoy ? 'Al día' : tipoCambioHoy ? 'Último oficial' : 'Pendiente'}
                </span>
              </div>
              <div className="text-2xl font-extrabold text-[var(--color-text)] mt-0.5">
                {tipoCambioHoy ? (
                  <>
                    ${' '}
                    {tipoCambioHoy.valor.toLocaleString('es-CL', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    <span className="text-xs font-normal text-[var(--color-muted)] font-mono">
                      (Dólar Observado · {tipoCambioHoy.fecha})
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-slate-500">
                    Aún no sincronizado para hoy
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => syncMutation.mutate({ desde: hoyStr, hasta: hoyStr })}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-xs font-bold hover:opacity-95 transition-opacity disabled:opacity-50 shadow-sm"
            >
              <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
              <span>{syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Hoy'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sincronización Manual & Programada */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Panel Consulta por Rango */}
        <div className="lg:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-[var(--color-accent)]" />
              <h2 className="text-sm font-bold">Consultar Sincronización por Rango</h2>
            </div>
            {configSync?.ultimaSyncAt && (
              <span className="text-[11px] text-[var(--color-muted)]">
                Última sync: {new Date(configSync.ultimaSyncAt).toLocaleString('es-CL')} (
                <strong className="text-emerald-600">{configSync.ultimoEstado || 'OK'}</strong>)
              </span>
            )}
          </div>

          <form onSubmit={handleManualSync} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Desde</label>
              <input
                type="date"
                required
                value={desdeSync}
                onChange={(e) => setDesdeSync(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hasta</label>
              <input
                type="date"
                required
                value={hastaSync}
                onChange={(e) => setHastaSync(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={syncMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--color-text)] text-white text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm"
              >
                <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
                <span>{syncMutation.isPending ? 'Consultando...' : 'Consultar ahora'}</span>
              </button>
            </div>
          </form>

          {syncFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                syncFeedback.tipo === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {syncFeedback.tipo === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span>{syncFeedback.texto}</span>
            </div>
          )}
        </div>

        {/* Panel Programación Automática */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold">Programación Automática</h2>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-semibold text-slate-700">Sync Automática Diaria</span>
              <input
                type="checkbox"
                checked={configSync?.syncAutomatica ?? false}
                onChange={(e) =>
                  configMutation.mutate({ syncAutomatica: e.target.checked })
                }
                className="h-4 w-4 rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)] border-slate-300"
              />
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Horas de ejecución
              </label>
              <div className="flex gap-2">
                <input
                  type="time"
                  defaultValue={configSync?.horas?.[0] || '09:00'}
                  onBlur={(e) => configMutation.mutate({ horas: [e.target.value] })}
                  className="text-xs rounded-lg border border-slate-300 px-3 py-1.5 bg-slate-50/50"
                />
                <span className="text-xs text-[var(--color-muted)] self-center">
                  (Hora oficial de Chile)
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={configSync?.soloDiasHabiles ?? true}
                onChange={(e) =>
                  configMutation.mutate({ soloDiasHabiles: e.target.checked })
                }
                className="h-4 w-4 rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)] border-slate-300"
              />
              <span className="text-xs text-slate-600">Solo en días hábiles (Lunes a Viernes)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Filtros de la Tabla Histórica */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Filter size={14} />
            <span>Filtrar tabla:</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={desdeFiltro}
              onChange={(e) => setDesdeFiltro(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
            />
            <ArrowRight size={12} className="text-slate-400" />
            <input
              type="date"
              value={hastaFiltro}
              onChange={(e) => setHastaFiltro(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
            />
          </div>

          <select
            value={monedaFiltro}
            onChange={(e) => setMonedaFiltro(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 px-3 py-1.5 bg-white font-medium text-slate-700"
          >
            <option value="">Todas las monedas</option>
            {monedas.map((m) => (
              <option key={m.id} value={m.codigo}>
                {m.codigo} - {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => refetch()}
          className="text-xs font-semibold text-[var(--color-accent)] hover:underline flex items-center gap-1"
        >
          <RefreshCw size={12} />
          <span>Refrescar datos</span>
        </button>
      </div>

      {/* Tabla de Indicadores Históricos */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/75 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Fecha</th>
                <th className="px-5 py-3.5">Moneda</th>
                <th className="px-5 py-3.5">Valor (CLP)</th>
                <th className="px-5 py-3.5">Fuente</th>
                <th className="px-5 py-3.5 text-center">Origen</th>
                <th className="px-5 py-3.5 text-center">Tipo Día</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
                    Cargando indicadores...
                  </td>
                </tr>
              ) : indicadores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
                    No se encontraron tipos de cambio para el rango seleccionado. Haz clic en "Consultar ahora" arriba para sincronizar con el Banco Central.
                  </td>
                </tr>
              ) : (
                indicadores.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800">
                      {item.fecha}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs border border-slate-200">
                        {item.moneda?.codigo || 'N/A'}
                      </span>{' '}
                      <span className="text-xs text-[var(--color-muted)]">
                        {item.moneda?.nombre}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-extrabold text-slate-900 text-sm">
                      ${' '}
                      {item.valor.toLocaleString('es-CL', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[var(--color-muted)]">
                      {item.fuente}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          item.origen === 'API_BCCH'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {item.origen === 'API_BCCH' ? 'API Banco Central' : 'CSV Importado'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {item.esFeriado ? (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          Feriado / Fin de semana
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500">
                          Habil
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Importar CSV */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <button
              onClick={() => setIsCsvModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <FileSpreadsheet size={20} />
              </div>
              <h2 className="text-lg font-bold">Importar Histórico CSV</h2>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-4">
              Carga masivamente tipos de cambio históricos en formato CSV estructurado.
            </p>

            {csvFeedback && (
              <div
                className={`mb-4 p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  csvFeedback.tipo === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {csvFeedback.tipo === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <span>{csvFeedback.texto}</span>
              </div>
            )}

            <form onSubmit={handleCsvUpload} className="space-y-4">
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-[var(--color-accent)] transition-colors">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="csv-file-input"
                />
                <label htmlFor="csv-file-input" className="cursor-pointer block">
                  <Upload size={32} className="mx-auto text-slate-400 mb-2" />
                  <span className="text-xs font-semibold text-[var(--color-accent)] block">
                    {selectedFile ? selectedFile.name : 'Haz clic para seleccionar tu archivo CSV'}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)] mt-1 block">
                    Columnas: Fecha, CodigoMoneda, Valor, Fuente, EsFeriado
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={getUrlPlantillaCsv()}
                  download
                  className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"
                >
                  <Download size={12} />
                  <span>Descargar plantilla de ejemplo</span>
                </a>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCsvModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedFile || csvMutation.isPending}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-[var(--color-accent)] rounded-lg hover:opacity-95 disabled:opacity-50 shadow-sm"
                  >
                    {csvMutation.isPending ? 'Importando...' : 'Subir e Importar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
