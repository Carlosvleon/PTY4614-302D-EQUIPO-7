import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Coins,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  X,
  Sparkles,
} from 'lucide-react';
import {
  fetchMonedas,
  fetchCatalogoBCCH,
  createMoneda,
  toggleActivaMoneda,
  toggleFocoMoneda,
  deleteMoneda,
} from '@/lib/api';
import type { Moneda, ItemCatalogoBCCH } from '@/lib/api';

export default function MonedasPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [selectedCatalogo, setSelectedCatalogo] = useState<string>('');
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    simbolo: '$',
    codigoSerieBCCH: '',
    esMonedaNacional: false,
    activa: true,
    sincronizarBCCH: true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const {
    data: monedas = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Moneda[]>({
    queryKey: ['monedas'],
    queryFn: fetchMonedas,
  });

  const { data: catalogoBCCH = [] } = useQuery<ItemCatalogoBCCH[]>({
    queryKey: ['catalogo-bcch'],
    queryFn: fetchCatalogoBCCH,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createMoneda,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monedas'] });
      closeModal();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Error al guardar la moneda';
      setFormError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleActivaMoneda,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monedas'] });
    },
  });

  const toggleFocoMutation = useMutation({
    mutationFn: toggleFocoMoneda,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monedas'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMoneda,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monedas'] });
    },
  });

  const openModal = () => {
    setFormData({
      codigo: '',
      nombre: '',
      simbolo: '$',
      codigoSerieBCCH: '',
      esMonedaNacional: false,
      activa: true,
      sincronizarBCCH: true,
    });
    setSelectedCatalogo('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
  };

  const handleSelectCatalogo = (codigo: string) => {
    setSelectedCatalogo(codigo);
    const item = catalogoBCCH.find((c) => c.codigo === codigo);
    if (item) {
      setFormData((prev) => ({
        ...prev,
        codigo: item.codigo,
        nombre: item.nombre,
        simbolo: item.simbolo,
        codigoSerieBCCH: item.codigoSerieBCCH,
        sincronizarBCCH: true,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.codigo.trim() || !formData.nombre.trim() || !formData.simbolo.trim()) {
      setFormError('Código, nombre y símbolo son campos obligatorios.');
      return;
    }
    createMutation.mutate({
      codigo: formData.codigo.trim().toUpperCase(),
      nombre: formData.nombre.trim(),
      simbolo: formData.simbolo.trim(),
      codigoSerieBCCH: formData.codigoSerieBCCH.trim() || undefined,
      esMonedaNacional: formData.esMonedaNacional,
      activa: formData.activa,
      sincronizarBCCH: formData.sincronizarBCCH,
    });
  };

  const filteredMonedas = monedas.filter((m) => {
    const term = searchTerm.toLowerCase();
    return (
      m.codigo.toLowerCase().includes(term) ||
      m.nombre.toLowerCase().includes(term) ||
      (m.codigoSerieBCCH && m.codigoSerieBCCH.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Coins size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Parametrización de Monedas</h1>
          </div>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Gestión de monedas oficiales, series de sincronización con el Banco Central y divisas de reporte.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors shadow-sm disabled:opacity-50"
            title="Actualizar listado"
          >
            <RefreshCw size={18} className={isRefetching ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm"
          >
            <Plus size={16} />
            <span>Nueva Moneda</span>
          </button>
        </div>
      </div>

      {/* Buscador & Métricas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            placeholder="Buscar por código, nombre o serie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all shadow-sm"
          />
        </div>

        <div className="text-xs text-[var(--color-muted)] flex items-center gap-3">
          <span>Total: <strong className="text-[var(--color-text)]">{monedas.length}</strong></span>
          <span>•</span>
          <span>Activas: <strong className="text-emerald-600">{monedas.filter((m) => m.activa).length}</strong></span>
          <span>•</span>
          <span>Sincronizan con BC: <strong className="text-[var(--color-accent)]">{monedas.filter((m) => m.sincronizarBCCH).length}</strong></span>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/75 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Moneda</th>
                <th className="px-5 py-3.5">Nombre</th>
                <th className="px-5 py-3.5">Serie Banco Central</th>
                <th className="px-5 py-3.5 text-center">Sync BCCH</th>
                <th className="px-5 py-3.5 text-center">Tipo</th>
                <th className="px-5 py-3.5 text-center">Foco Reporte</th>
                <th className="px-5 py-3.5 text-center">Estado</th>
                <th className="px-5 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
                    Cargando monedas...
                  </td>
                </tr>
              ) : filteredMonedas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
                    {searchTerm ? 'No se encontraron monedas para tu búsqueda.' : 'No hay monedas registradas. Haz clic en "Nueva Moneda" para agregar una.'}
                  </td>
                </tr>
              ) : (
                filteredMonedas.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs border border-slate-200">
                          {m.codigo}
                        </span>
                        <span className="font-semibold text-slate-500">{m.simbolo}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-medium text-[var(--color-text)]">
                      {m.nombre}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[var(--color-muted)]">
                      {m.codigoSerieBCCH ? (
                        <span className="bg-indigo-50/80 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                          {m.codigoSerieBCCH}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No asignada</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {m.sincronizarBCCH ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={12} />
                          Automática
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          <XCircle size={12} />
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {m.esMonedaNacional ? (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Moneda Nacional
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-muted)]">Divisa Extranjera</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => toggleFocoMutation.mutate(m.id)}
                        disabled={toggleFocoMutation.isPending}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                          m.focoReporteria
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Alternar foco de reportería"
                      >
                        {m.focoReporteria ? '★ Principal' : 'Secundaria'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => toggleMutation.mutate(m.id)}
                        disabled={toggleMutation.isPending}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          m.activa ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={m.activa ? 'Moneda activa (clic para desactivar)' : 'Moneda inactiva (clic para activar)'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            m.activa ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {!m.esMonedaNacional && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Seguro que deseas eliminar o desactivar la moneda ${m.codigo}?`)) {
                              deleteMutation.mutate(m.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar o retirar moneda"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva Moneda */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <Coins size={20} />
              </div>
              <h2 className="text-lg font-bold">Agregar Nueva Moneda</h2>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-5">
              Puedes seleccionar una moneda oficial del catálogo del Banco Central para auto-completar los datos o ingresar una divisa personalizada.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Selector Catálogo BCCH */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                  <Sparkles size={14} className="text-indigo-600" />
                  <span>Autocompletar desde catálogo oficial del Banco Central</span>
                </label>
                <select
                  value={selectedCatalogo}
                  onChange={(e) => handleSelectCatalogo(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">-- Seleccionar serie oficial del BCCH --</option>
                  {catalogoBCCH.map((item) => (
                    <option key={item.codigo} value={item.codigo}>
                      {item.codigo} - {item.nombre} ({item.codigoSerieBCCH})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Código ISO *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="USD"
                    maxLength={10}
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                    className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Símbolo Gráfico *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="$"
                    maxLength={5}
                    value={formData.simbolo}
                    onChange={(e) => setFormData({ ...formData, simbolo: e.target.value })}
                    className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre descriptivo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Dólar Observado"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Código de Serie oficial Banco Central (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="F073.TCO.PRE.Z.D"
                  value={formData.codigoSerieBCCH}
                  onChange={(e) => setFormData({ ...formData, codigoSerieBCCH: e.target.value })}
                  className="w-full text-sm font-mono rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <span className="text-[11px] text-[var(--color-muted)] mt-0.5 block">
                  Permite descargar automáticamente el tipo de cambio diario desde el Web Service del Banco Central.
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sincronizarBCCH}
                    onChange={(e) => setFormData({ ...formData, sincronizarBCCH: e.target.checked })}
                    className="rounded border-slate-300 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Sincronizar automáticamente con el Banco Central
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.esMonedaNacional}
                    onChange={(e) => setFormData({ ...formData, esMonedaNacional: e.target.checked })}
                    className="rounded border-slate-300 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Marcar como Moneda Nacional base (CLP)
                  </span>
                </label>
              </div>

              {/* Botones */}
              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 text-xs font-bold text-white bg-[var(--color-accent)] rounded-lg hover:opacity-95 transition-opacity disabled:opacity-50 shadow-sm"
                >
                  {createMutation.isPending ? 'Guardando...' : 'Crear Moneda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
