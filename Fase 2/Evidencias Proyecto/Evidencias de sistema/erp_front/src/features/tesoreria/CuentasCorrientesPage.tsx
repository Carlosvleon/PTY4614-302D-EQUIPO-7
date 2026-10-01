import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { useQueryScope, useEmpresaScopeId, usePeriodoScopeCodigo, periodListQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { hasAnyPermission } from '@/lib/permissions';
import { usuarioPuedeVerPantalla } from '@/lib/pantallas-permisos';
import { labelMes } from '@/lib/appSettings';
import * as api from '@/services/api';
import type { SessionUser } from '@/types/domain';

type RolCc = 'CLIENTE' | 'PROVEEDOR' | 'PRODUCTOR';

type SaldoCc = {
  rut: string;
  rutDisplay?: string;
  nombre: string;
  clienteNombre?: string;
  proveedorNombre?: string;
  clienteId?: string;
  proveedorId?: string;
  roles: RolCc[];
  terceroTipo?: RolCc;
  terceroId?: string;
  terceroNombre?: string;
  debe: number;
  haber: number;
  saldo: number;
  saldoCliente?: number;
  saldoProveedor?: number;
  movimientos: number;
  ultimaFecha: string;
};

/** El payload no trae `id`; la fila se identifica por RUT para la tabla. */
type SaldoCcRow = SaldoCc & { id: string };

type CalceRef = {
  tipo: 'PAGO' | 'ANTICIPO' | 'COMPROBANTE';
  id: string;
  ref: string;
  label: string;
  to?: string;
};

type LinkTarget = { tipo: string; to: string; label: string };

type MovCc = {
  id: string;
  fecha: string;
  folio?: string;
  documentoRef?: string;
  documentoTipo?: string;
  terceroTipo?: RolCc;
  debe: number;
  haber: number;
  saldo: number;
  glosa?: string;
  origen?: string;
  estadoLiquidacion?: 'PENDIENTE' | 'CALZADO';
  calces?: CalceRef[];
  linkTarget?: LinkTarget | null;
};

type EstadoCuentaRut = {
  rut: string;
  rutDisplay?: string;
  nombre: string;
  dual?: boolean;
  cliente?: { id: string; razonSocial: string } | null;
  proveedor?: { id: string; razonSocial: string } | null;
  roles: RolCc[];
  saldoCliente: number;
  saldoProveedor: number;
  saldoNeto: number;
  movimientos: MovCc[];
};

function rolesLabel(roles: RolCc[] | undefined, fallback?: string) {
  const r = roles?.length ? roles : fallback ? [fallback as RolCc] : [];
  return r;
}

function folioDestinoAccesible(
  user: SessionUser | null,
  to?: string,
): boolean {
  if (!to || !user) return false;
  if (to.startsWith('/compras/')) {
    if (!hasAnyPermission(user, ['compras:read', 'admin:read'])) return false;
    return usuarioPuedeVerPantalla(user, 'Compras · Libro de compras');
  }
  if (to.startsWith('/comercial/libro') || to.startsWith('/comercial/')) {
    if (!hasAnyPermission(user, ['comercial:read', 'admin:read'])) return false;
    return usuarioPuedeVerPantalla(user, 'Ventas · Libro de ventas');
  }
  return true;
}

export default function CuentasCorrientesPage() {
  const { user } = useAuth();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodo = usePeriodoScopeCodigo();
  const periodoVista = usePeriodoVista();
  const periodoFiltro = periodoVista.todo ? undefined : periodo;
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [vista, setVista] = useState<'TODOS' | 'PENDIENTES'>('PENDIENTES');
  const soloSaldo = vista === 'PENDIENTES';
  const [detalleRut, setDetalleRut] = useState<string | null>(null);
  const [filtroDet, setFiltroDet] = useState<'PENDIENTE' | 'HISTORICO' | 'TODOS'>('PENDIENTE');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajuste, setAjuste] = useState({
    terceroTipo: 'CLIENTE',
    terceroId: '',
    terceroNombre: '',
    fecha: periodo ? `${periodo}-01` : new Date().toISOString().slice(0, 10),
    debe: 0,
    haber: 0,
    glosa: '',
  });

  const listQ = useQuery({
    queryKey: periodListQueryKey(scope, empresaId, periodoVista.vistaKey, 'cuentas-corrientes', q, soloSaldo),
    queryFn: () =>
      api.getCuentasCorrientes({
        q: q || undefined,
        soloConSaldo: soloSaldo,
        periodo: periodoFiltro,
      }),
  });
  const raw = listQ.data ?? [];
  const data = useMemo(
    () =>
      (raw as SaldoCc[]).map((r): SaldoCcRow => ({
        ...r,
        id: r.rut || r.terceroId || '',
        rut: r.rut || r.terceroId || '',
        nombre: r.nombre || r.terceroNombre || '',
        roles: rolesLabel(r.roles, r.terceroTipo),
      })),
    [raw],
  );

  const detQ = useQuery({
    queryKey: periodListQueryKey(scope, empresaId, periodoVista.vistaKey, 'cc-por-rut', detalleRut),
    queryFn: () => api.getEstadoCuentaPorRut(detalleRut!, { filtro: 'TODOS', periodo: periodoFiltro }),
    enabled: !!detalleRut,
  });
  const estado = detQ.data as EstadoCuentaRut | undefined;

  const movsFiltrados = useMemo(() => {
    const rows = estado?.movimientos ?? [];
    if (filtroDet === 'TODOS') return rows;
    if (filtroDet === 'HISTORICO') return rows.filter((m) => m.estadoLiquidacion === 'CALZADO');
    return rows.filter((m) => m.estadoLiquidacion !== 'CALZADO');
  }, [estado, filtroDet]);

  const totalSel = useMemo(() => {
    let debe = 0;
    let haber = 0;
    for (const m of movsFiltrados) {
      if (!selected.has(m.id)) continue;
      debe += m.debe;
      haber += m.haber;
    }
    return { debe, haber, neto: debe - haber, n: selected.size };
  }, [movsFiltrados, selected]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [scope, empresaId, periodoVista.vistaKey, 'cuentas-corrientes'] });
    void qc.invalidateQueries({ queryKey: [scope, empresaId, periodoVista.vistaKey, 'cc-por-rut'] });
  };

  const openDetalle = (r: SaldoCc) => {
    setDetalleRut(r.rut);
    setSelected(new Set());
    setExpanded(new Set());
    setFiltroDet('PENDIENTE');
  };

  const cols: Column<SaldoCcRow>[] = useMemo(
    () => [
      {
        key: 'rut',
        header: 'RUT',
        filterValue: (r) => r.rutDisplay || r.rut,
        sortValue: (r) => r.rut,
        cell: (r) => <span className="font-mono text-xs">{r.rutDisplay || r.rut || '—'}</span>,
      },
      {
        key: 'nombre',
        header: 'Nombre',
        filterValue: (r) => r.nombre,
        sortValue: (r) => r.nombre,
        cell: (r) => (
          <div>
            <div>{r.nombre}</div>
            {r.roles.includes('CLIENTE') && r.roles.includes('PROVEEDOR') && r.clienteNombre && r.proveedorNombre && r.clienteNombre !== r.proveedorNombre ? (
              <div className="text-xs text-[var(--color-muted)]">
                Cliente: {r.clienteNombre} · Proveedor: {r.proveedorNombre}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'roles',
        header: 'Roles',
        filterValue: (r) => r.roles.join(','),
        cell: (r) => (
          <span className="inline-flex flex-wrap gap-1">
            {r.roles.map((rol) => (
              <Badge key={rol} tone={rol === 'CLIENTE' ? 'info' : rol === 'PROVEEDOR' ? 'accent' : 'warning'}>
                {rol === 'CLIENTE' ? 'Cliente' : rol === 'PROVEEDOR' ? 'Proveedor' : 'Productor'}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        key: 'saldoCli',
        header: 'Saldo cliente',
        filterType: 'number',
        filterValue: (r) => r.saldoCliente ?? 0,
        sortValue: (r) => r.saldoCliente ?? 0,
        align: 'right',
        cell: (r) => (r.roles.includes('CLIENTE') ? fmtCLP(r.saldoCliente ?? 0) : '—'),
      },
      {
        key: 'saldoProv',
        header: 'Saldo proveedor',
        filterType: 'number',
        filterValue: (r) => r.saldoProveedor ?? 0,
        sortValue: (r) => r.saldoProveedor ?? 0,
        align: 'right',
        cell: (r) => (r.roles.includes('PROVEEDOR') || r.roles.includes('PRODUCTOR') ? fmtCLP(r.saldoProveedor ?? 0) : '—'),
      },
      {
        key: 'saldo',
        header: 'Neto',
        filterType: 'number',
        filterValue: (r) => r.saldo,
        sortValue: (r) => r.saldo,
        align: 'right',
        cell: (r) => (
          <span className={r.saldo < 0 ? 'text-[var(--color-danger)]' : undefined}>{fmtCLP(r.saldo)}</span>
        ),
      },
      {
        key: 'mov',
        header: 'Movs',
        filterType: 'number',
        filterValue: (r) => r.movimientos,
        sortValue: (r) => r.movimientos,
        align: 'right',
        cell: (r) => r.movimientos,
      },
      {
        key: 'acc',
        header: '',
        cell: (r) => (
          <Button size="sm" variant="outline" onClick={() => openDetalle(r)}>
            Detalle
          </Button>
        ),
      },
    ],
    [],
  );

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === movsFiltrados.length) setSelected(new Set());
    else setSelected(new Set(movsFiltrados.map((m) => m.id)));
  };
  const toggleExp = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAjuste = async () => {
    try {
      await api.createCuentaCorrienteAjuste({
        ...ajuste,
        debe: Number(ajuste.debe) || 0,
        haber: Number(ajuste.haber) || 0,
      });
      toast.success('Ajuste registrado');
      setAjusteOpen(false);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const tituloDetalle = estado
    ? `Estado de cuenta · ${estado.rutDisplay || estado.rut} · ${estado.nombre}`
    : 'Estado de cuenta';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Estado de cuenta"
        subtitle={periodoVista.todo
          ? 'Kardex unificado por RUT. Todos los periodos.'
          : `Kardex unificado por RUT. Saldos y movimientos hasta ${labelMes(periodo.slice(5, 7))} ${periodo.slice(0, 4)} (mes contable de la sesión).`}
        breadcrumbs={['Tesorería']}
        action={(
          <Button onClick={() => setAjusteOpen(true)}>Registrar ajuste</Button>
        )}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Buscar RUT o nombre
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="76.882.110-4 / Frutam"
          />
        </label>
        <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5">
          <Button size="sm" variant={vista === 'TODOS' ? 'primary' : 'ghost'} onClick={() => setVista('TODOS')}>
            Todos
          </Button>
          <Button
            size="sm"
            variant={vista === 'PENDIENTES' ? 'primary' : 'ghost'}
            onClick={() => setVista('PENDIENTES')}
          >
            Pendientes
          </Button>
        </div>
      </div>

      {listQ.isError ? (
        <p className="text-sm text-[var(--color-danger)]">
          {listQ.error instanceof Error ? listQ.error.message : 'No se pudo cargar el estado de cuenta'}
        </p>
      ) : null}

      <DataTable columns={cols} rows={data} tableKey="tesoreria.cuentas-corrientes" enableExport onRowClick={openDetalle} toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />} />

      <Modal open={!!detalleRut} onClose={() => setDetalleRut(null)} title={tituloDetalle} size="xl">
        {estado?.dual ? (
          <p className="mb-3 text-sm text-[var(--color-muted)]">
            Dual: cliente
            {estado.cliente ? ` (${estado.cliente.razonSocial})` : ''} y proveedor
            {estado.proveedor ? ` (${estado.proveedor.razonSocial})` : ''}.
          </p>
        ) : estado ? (
          <p className="mb-3 text-sm text-[var(--color-muted)]">
            {estado.roles.includes('CLIENTE') ? 'Cliente' : ''}
            {estado.roles.includes('CLIENTE') && estado.roles.includes('PROVEEDOR') ? ' · ' : ''}
            {estado.roles.includes('PROVEEDOR') ? 'Proveedor' : ''}
            {estado.roles.includes('PRODUCTOR') ? ' · Productor' : ''}
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--color-muted)]">Movimientos</span>
          {(['PENDIENTE', 'HISTORICO', 'TODOS'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtroDet === f ? 'primary' : 'ghost'}
              onClick={() => {
                setFiltroDet(f);
                setSelected(new Set());
              }}
            >
              {f === 'PENDIENTE' ? 'Pendientes' : f === 'HISTORICO' ? 'Histórico' : 'Todos'}
            </Button>
          ))}
        </div>

        {detQ.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : detQ.isError ? (
          <p className="text-sm text-[var(--color-danger)]">
            {detQ.error instanceof Error ? detQ.error.message : 'No se pudo cargar el estado de cuenta'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <Checkbox
                      checked={movsFiltrados.length > 0 && selected.size === movsFiltrados.length}
                      onChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="w-8 px-1 py-2" />
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Folio</th>
                  <th className="px-2 py-2">Rol</th>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2 text-right">Debe</th>
                  <th className="px-2 py-2 text-right">Haber</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                  <th className="px-2 py-2">Glosa</th>
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-[var(--color-muted)]">
                      Sin movimientos en este filtro
                    </td>
                  </tr>
                ) : (
                  movsFiltrados.map((m) => {
                    const hasCalce = (m.calces?.length ?? 0) > 0;
                    const open = expanded.has(m.id);
                    const folio = m.folio || m.documentoRef;
                    return (
                      <tr key={m.id} className="border-t border-[var(--color-border)] align-top">
                        <td className="px-2 py-2">
                          <Checkbox
                            checked={selected.has(m.id)}
                            onChange={() => toggleSel(m.id)}
                            aria-label={`Seleccionar ${folio ?? m.id}`}
                          />
                        </td>
                        <td className="px-1 py-2">
                          {hasCalce ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                              onClick={() => toggleExp(m.id)}
                              aria-expanded={open}
                              title="Ver calce"
                            >
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">{fmtDate(m.fecha)}</td>
                        <td className="px-2 py-2">
                          {m.linkTarget && folio && folioDestinoAccesible(user, m.linkTarget.to) ? (
                            <Link
                              className="font-mono text-xs text-[var(--color-accent-2)] underline"
                              to={m.linkTarget.to}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {folio}
                            </Link>
                          ) : (
                            <span
                              className="font-mono text-xs"
                              title={
                                m.linkTarget && folio && !folioDestinoAccesible(user, m.linkTarget.to)
                                  ? 'Sin permiso para abrir el libro'
                                  : undefined
                              }
                            >
                              {folio ?? '—'}
                            </span>
                          )}
                          {hasCalce && open ? (
                            <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
                              {m.calces!.map((c) => (
                                <li key={`${c.tipo}-${c.id}-${c.ref}`}>
                                  {c.to && folioDestinoAccesible(user, c.to) ? (
                                    <Link className="text-[var(--color-accent-2)] underline" to={c.to}>
                                      {c.label}
                                    </Link>
                                  ) : (
                                    c.label
                                  )}
                                  <span className="ml-1 font-mono">({c.ref})</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">{m.terceroTipo === 'CLIENTE' ? 'Cliente' : m.terceroTipo === 'PROVEEDOR' ? 'Proveedor' : m.terceroTipo === 'PRODUCTOR' ? 'Productor' : '—'}</td>
                        <td className="px-2 py-2">
                          <Badge tone={m.estadoLiquidacion === 'CALZADO' ? 'success' : 'warning'}>
                            {m.estadoLiquidacion === 'CALZADO' ? 'Calzado' : 'Pendiente'}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-right">{fmtCLP(m.debe)}</td>
                        <td className="px-2 py-2 text-right">{fmtCLP(m.haber)}</td>
                        <td className="px-2 py-2 text-right">{fmtCLP(m.saldo)}</td>
                        <td className="px-2 py-2">{m.glosa ?? '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-sm">
                    {totalSel.n === 0
                      ? 'Selecciona movimientos para ver el total (compensar)'
                      : `${totalSel.n} seleccionados`}
                  </td>
                  <td className="px-2 py-2 text-right font-medium">{fmtCLP(totalSel.debe)}</td>
                  <td className="px-2 py-2 text-right font-medium">{fmtCLP(totalSel.haber)}</td>
                  <td className="px-2 py-2 text-right font-medium">{fmtCLP(totalSel.neto)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {estado ? (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Saldo cliente {fmtCLP(estado.saldoCliente)} · Saldo proveedor {fmtCLP(estado.saldoProveedor)} · Neto{' '}
            {fmtCLP(estado.saldoNeto)}
          </p>
        ) : null}
      </Modal>

      <Modal open={ajusteOpen} onClose={() => setAjusteOpen(false)} title="Ajuste estado de cuenta">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Tipo
            <Select
              value={ajuste.terceroTipo}
              onChange={(e) => setAjuste((s) => ({ ...s, terceroTipo: e.target.value }))}
            >
              <option value="CLIENTE">Cliente</option>
              <option value="PROVEEDOR">Proveedor</option>
              <option value="PRODUCTOR">Productor</option>
            </Select>
          </label>
          <label className="text-sm">
            Fecha
            <Input
              type="date"
              value={ajuste.fecha}
              onChange={(e) => setAjuste((s) => ({ ...s, fecha: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            ID tercero
            <Input
              value={ajuste.terceroId}
              onChange={(e) => setAjuste((s) => ({ ...s, terceroId: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            Nombre
            <Input
              value={ajuste.terceroNombre}
              onChange={(e) => setAjuste((s) => ({ ...s, terceroNombre: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            Debe
            <MontoInput
              kind="monto"
              value={ajuste.debe}
              onChange={(v) => setAjuste((s) => ({ ...s, debe: v ?? 0 }))}
            />
          </label>
          <label className="text-sm">
            Haber
            <MontoInput
              kind="monto"
              value={ajuste.haber}
              onChange={(v) => setAjuste((s) => ({ ...s, haber: v ?? 0 }))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Glosa
            <Input
              value={ajuste.glosa}
              onChange={(e) => setAjuste((s) => ({ ...s, glosa: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAjusteOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submitAjuste}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
