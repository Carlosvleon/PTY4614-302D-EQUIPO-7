import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Home, Settings, ShieldCheck, BookOpen, Calculator, Wallet,
  Package, ShoppingCart, ChevronDown, ChevronRight, LogOut,
  Building2, UserCog, Coins, Ruler, Layers, FileText, Users, Receipt, Stamp,
  ClipboardList, Warehouse, ArrowLeftRight, FileCheck, Truck, BadgeDollarSign,
  LineChart, Percent, CalendarRange, SlidersHorizontal, Combine, Boxes, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/Logo';
import { PanelEdgeToggle } from '@/components/common/PanelEdgeToggle';
import { useAuth } from '@/app/auth-context';
import { useSidebar } from '@/app/sidebar-context';
import { filterMenuByPermissions } from '@/lib/filterMenuByPermissions';
import { toast } from 'sonner';

interface Item {
  to?: string;
  icon?: React.ReactNode;
  label: string;
  children?: Item[];
  /** Permiso(s) de lectura del módulo; si falta, el ítem no se muestra. */
  anyOf?: string[];
  /** Visible también si el usuario es AdminConcepto (aunque no tenga admin:read). */
  allowAdminConcepto?: boolean;
  /** Visible si el usuario tiene bandeja del módulo (designado en reglas). */
  bandejaModulo?: 'Compras';
  /** Activo también en subrutas (listado + /nueva). */
  matchPrefix?: boolean;
}

const MENU: Item[] = [
  { to: '/', icon: <Home size={16} />, label: 'Panel operativo' },
  {
    icon: <Settings size={16} />,
    label: 'Administración',
    anyOf: ['admin:read'],
    allowAdminConcepto: true,
    children: [
      { to: '/admin/empresas', label: 'Empresas', icon: <Building2 size={14} />, anyOf: ['admin:read'] },
      { to: '/admin/plantilla-documentos', label: 'Plantilla documentos', icon: <Stamp size={14} />, anyOf: ['admin:read'] },
      { to: '/admin/usuarios', label: 'Usuarios', icon: <UserCog size={14} />, anyOf: ['admin:read'] },
      { to: '/admin/roles', label: 'Roles y permisos', icon: <ShieldCheck size={14} />, anyOf: ['admin:read'] },
      {
        to: '/admin/aprobaciones',
        label: 'Reglas de aprobación',
        icon: <FileCheck size={14} />,
        anyOf: ['admin:read'],
        allowAdminConcepto: true,
      },
    ],
  },
  {
    icon: <BookOpen size={16} />,
    label: 'Parametrización',
    anyOf: ['catalogos:read', 'admin:read'],
    children: [
      { to: '/catalogos/monedas', label: 'Monedas', icon: <Coins size={14} /> },
      { to: '/catalogos/unidades', label: 'Unidades de medida', icon: <Ruler size={14} /> },
      { to: '/catalogos/centros-costo', label: 'Centros de costo', icon: <Layers size={14} /> },
      { to: '/catalogos/elementos-costo', label: 'Elementos de costo', icon: <Layers size={14} /> },
      { to: '/catalogos/areas-negocio', label: 'Áreas de negocio', icon: <Layers size={14} /> },
      { to: '/catalogos/conceptos-flujo', label: 'Conceptos', icon: <Hash size={14} /> },
      { to: '/catalogos/codigos-financieros', label: 'Códigos financieros', icon: <Hash size={14} /> },
      { to: '/catalogos/tipos-documento', label: 'Tipos de documento', icon: <FileText size={14} /> },
      { to: '/catalogos/plan-cuentas', label: 'Plan de cuentas', icon: <BookOpen size={14} /> },
      { to: '/catalogos/indicadores-bc', label: 'Indicadores BC', icon: <LineChart size={14} /> },
      { to: '/catalogos/proveedores', label: 'Proveedores', icon: <Truck size={14} /> },
      {
        to: '/catalogos/contratista',
        label: 'Contratista',
        icon: <Users size={14} />,
        anyOf: ['contratistas:read', 'contratistas:catalogs', 'catalogos:read', 'admin:read'],
      },
    ],
  },
  {
    icon: <Users size={16} />,
    label: 'Contratistas',
    anyOf: ['contratistas:read', 'admin:read'],
    children: [
      { to: '/contratistas', label: 'Listado', icon: <Users size={14} /> },
      { to: '/contratistas/ingreso-diario', label: 'Ingreso diario', icon: <ClipboardList size={14} /> },
      { to: '/contratistas/tarifas', label: 'Tarifas', icon: <BadgeDollarSign size={14} /> },
      { to: '/contratistas/proformas', label: 'Proformas y facturas', icon: <ClipboardList size={14} /> },
      { to: '/contratistas/traspaso', label: 'Traspaso y cierre', icon: <ArrowLeftRight size={14} /> },
      { to: '/contratistas/auditoria', label: 'Auditoría', icon: <FileCheck size={14} />, anyOf: ['contratistas:audit'] },
    ],
  },
  {
    icon: <Receipt size={16} />,
    label: 'Ventas',
    anyOf: ['comercial:read', 'admin:read'],
    children: [
      {
        label: 'Operación',
        children: [
          { to: '/comercial/ordenes-venta', label: 'Órdenes de venta', icon: <ClipboardList size={14} />, matchPrefix: true },
          { to: '/comercial/emitir', label: 'Emitir DTE', icon: <FileCheck size={14} /> },
        ],
      },
      {
        label: 'Libros',
        children: [
          { to: '/comercial/libro', label: 'Libro de ventas', icon: <FileText size={14} /> },
          { to: '/comercial/guias-despacho', label: 'Libro de guías', icon: <Truck size={14} /> },
        ],
      },
      {
        label: 'Maestros',
        children: [
          { to: '/comercial/clientes', label: 'Clientes', icon: <Users size={14} /> },
        ],
      },
    ],
  },
  {
    icon: <ShoppingCart size={16} />,
    label: 'Compras',
    anyOf: ['compras:read', 'admin:read'],
    children: [
      { to: '/compras/ordenes', label: 'Órdenes de compra', icon: <ClipboardList size={14} /> },
      { to: '/compras/aprobaciones', label: 'Aprobaciones', icon: <FileCheck size={14} />, bandejaModulo: 'Compras' },
      { to: '/compras/recepciones', label: 'Recepciones', icon: <Truck size={14} /> },
      { to: '/compras/registro', label: 'Libro de compras', icon: <Receipt size={14} /> },
    ],
  },
  {
    icon: <Package size={16} />,
    label: 'Insumos / Bodega',
    anyOf: ['insumos:read', 'admin:read'],
    children: [
      { to: '/insumos/maestro', label: 'Maestro artículos', icon: <Package size={14} /> },
      { to: '/insumos/bodegas', label: 'Bodegas', icon: <Warehouse size={14} /> },
      { to: '/insumos/stock', label: 'Stock por bodega / producto', icon: <Boxes size={14} /> },
      { to: '/insumos/movimientos', label: 'Movimientos / NC', icon: <ArrowLeftRight size={14} /> },
    ],
  },
  {
    icon: <Calculator size={16} />,
    label: 'Contabilidad',
    anyOf: ['contabilidad:read', 'admin:read'],
    children: [
      {
        label: 'Configuración',
        children: [
          { to: '/contabilidad/periodos', label: 'Períodos contables', icon: <CalendarRange size={14} /> },
          { to: '/contabilidad/config-sii', label: 'Cuentas por tipo de documento', icon: <SlidersHorizontal size={14} /> },
        ],
      },
      {
        label: 'Operaciones',
        children: [
          { to: '/contabilidad/asientos', label: 'Comprobantes / asientos', icon: <Receipt size={14} /> },
          { to: '/contabilidad/centralizacion', label: 'Centralización masiva', icon: <Combine size={14} /> },
        ],
      },
      { to: '/contabilidad/honorarios', label: 'Factores honorarios', icon: <Percent size={14} /> },
      { to: '/presupuestos', label: 'Presupuestos', icon: <BadgeDollarSign size={14} /> },
      {
        label: 'Reportes',
        children: [
          { to: '/contabilidad/libro-diario', label: 'Libro diario', icon: <BookOpen size={14} /> },
          { to: '/contabilidad/mayor', label: 'Libro mayor', icon: <BookOpen size={14} /> },
          { to: '/contabilidad/balance-8-columnas', label: 'Balance de 8 columnas', icon: <FileText size={14} /> },
          { to: '/contabilidad/reportes', label: 'Resumen contable', icon: <FileText size={14} /> },
        ],
      },
    ],
  },
  {
    icon: <Wallet size={16} />,
    label: 'Tesorería',
    anyOf: ['tesoreria:read', 'admin:read'],
    children: [
      { to: '/tesoreria/cartolas', label: 'Cartolas', icon: <FileText size={14} /> },
      { to: '/tesoreria/conciliacion', label: 'Conciliación', icon: <Layers size={14} /> },
      { to: '/tesoreria/flujo-caja', label: 'Flujo de caja', icon: <Wallet size={14} /> },
      { to: '/tesoreria/pagos', label: 'Pagos', icon: <Receipt size={14} /> },
      { to: '/tesoreria/nominas', label: 'Nómina semanal', icon: <BadgeDollarSign size={14} /> },
      { to: '/tesoreria/cuentas-corrientes', label: 'Estado de cuenta', icon: <BadgeDollarSign size={14} /> },
    ],
  },
];

function isChildActive(pathname: string, to: string, matchPrefix?: boolean): boolean {
  if (matchPrefix) return pathname === to || pathname.startsWith(`${to}/`);
  return pathname === to;
}

function groupHasActive(pathname: string, children: Item[]): boolean {
  return children.some((c) => {
    if (c.to && isChildActive(pathname, c.to, c.matchPrefix)) return true;
    if (c.children) return groupHasActive(pathname, c.children);
    return false;
  });
}

function NavLeaf({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to!}
      end={!item.matchPrefix}
      title={item.label}
      onClick={onNavigate}
      className={({ isActive: active }) => cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
        active
          ? 'text-[var(--color-accent-2)] bg-[var(--color-accent-soft)] font-medium'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

function NestedGroup({ item, pathname }: { item: Item; pathname: string }) {
  const hasActive = groupHasActive(pathname, item.children!);
  /** Ventas tiene pocos ítems: los grupos arrancan abiertos para no esconder OV/Emitir. */
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide',
          hasActive ? 'text-[var(--color-brand)]' : 'text-[var(--color-muted)]',
        )}
      >
        {item.label}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pl-1">
          {item.children!.map((c) => (
            <NavLeaf key={c.to || c.label} item={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsedFlyout({ item, pathname }: { item: Item; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasActive = groupHasActive(pathname, item.children!);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.right + 8 });
    }
    setOpen((v) => !v);
  };

  const leaves = item.children!.flatMap((c) => {
    if (c.children) {
      return [
        { kind: 'header' as const, label: c.label },
        ...c.children.map((leaf) => ({ kind: 'link' as const, item: leaf })),
      ];
    }
    return [{ kind: 'link' as const, item: c }];
  });

  return (
    <div className="relative mb-0.5">
      <button
        ref={btnRef}
        type="button"
        title={item.label}
        onClick={toggle}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center rounded-md p-2 transition-colors hover:bg-[var(--color-surface-2)]',
          hasActive && 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)]',
        )}
      >
        <span className={hasActive ? 'text-[var(--color-brand)]' : 'text-[var(--color-muted)]'}>{item.icon}</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 max-h-[80vh] min-w-56 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]">
            {item.label}
          </div>
          {leaves.map((entry, idx) => {
            if (entry.kind === 'header') {
              return (
                <div
                  key={`h-${entry.label}-${idx}`}
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]"
                >
                  {entry.label}
                </div>
              );
            }
            return (
              <NavLink
                key={entry.item.to}
                to={entry.item.to!}
                end={!entry.item.matchPrefix}
                title={entry.item.label}
                onClick={() => setOpen(false)}
                className={({ isActive: active }) => cn(
                  'flex items-center gap-2 px-3 py-2 text-[13px] transition-colors',
                  active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)] font-medium'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
                )}
              >
                {entry.item.icon}
                {entry.item.label}
              </NavLink>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const { collapsed, toggleCollapsed } = useSidebar();
  const nav = useNavigate();
  const loc = useLocation();

  const visibleMenu = filterMenuByPermissions(MENU, user);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    MENU.forEach((m) => {
      if (m.children && groupHasActive(loc.pathname, m.children)) {
        init[m.label] = true;
      }
    });
    return init;
  });

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    nav('/login', { replace: true });
  };

  return (
    <aside
      className={cn(
        'relative flex h-screen shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <PanelEdgeToggle
        edge="left"
        collapsed={collapsed}
        onClick={toggleCollapsed}
        title={collapsed ? 'Expandir menú' : 'Minimizar menú'}
      />

      <div className={cn('border-b border-[var(--color-border)] py-4', collapsed ? 'px-2' : 'px-4')}>
        <Logo size={collapsed ? 'sm' : 'md'} variant={collapsed ? 'icon' : 'full'} className={collapsed ? 'mx-auto justify-center' : undefined} />
      </div>

      {!collapsed && (
        <div className="border-b border-[var(--color-border)] px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Almahue ERP
          </div>
        </div>
      )}

      <nav className={cn('flex-1 overflow-y-auto py-2 text-sm', collapsed ? 'px-1.5' : 'px-2 overflow-x-hidden')}>
        {visibleMenu.map((item) => {
          if (item.children) {
            if (collapsed) {
              return <CollapsedFlyout key={item.label} item={item} pathname={loc.pathname} />;
            }

            const isOpen = open[item.label] ?? false;
            const hasActive = groupHasActive(loc.pathname, item.children);
            return (
              <div key={item.label} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [item.label]: !isOpen }))}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)]',
                    hasActive && 'text-[var(--color-brand)] font-medium',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={hasActive ? 'text-[var(--color-brand)]' : 'text-[var(--color-muted)]'}>{item.icon}</span>
                    {item.label}
                  </span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className="ml-7 mt-0.5 border-l border-[var(--color-border)] pl-2">
                    {item.children.map((c) => (
                      c.children ? (
                        <NestedGroup key={c.label} item={c} pathname={loc.pathname} />
                      ) : (
                        <NavLeaf key={c.to} item={c} />
                      )
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to!}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive: active }) => cn(
                'mb-0.5 flex items-center rounded-md transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-2 px-2 py-2',
                active
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)] font-medium border-l-2 border-[var(--color-accent)]'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
                collapsed && active && 'border-l-0 ring-2 ring-[var(--color-accent)]/30',
              )}
            >
              <span className="text-[var(--color-muted)]">{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className={cn('border-t border-[var(--color-border)] py-3', collapsed ? 'px-1.5' : 'px-2')}>
        {!collapsed && user && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-xs font-bold text-[var(--color-accent-2)]">
              {user.nombre.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--color-text)]">{user.nombre}</p>
              <p className="truncate text-[10px] text-[var(--color-muted)]">{user.empresa}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={cn(
            'mb-2 flex w-full items-center rounded-md text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]',
            collapsed ? 'justify-center p-2' : 'gap-2 px-2 py-2',
          )}
        >
          <LogOut size={16} />
          {!collapsed && 'Cerrar sesión'}
        </button>
        {!collapsed && (
          <div className="px-2 text-[11px] text-[var(--color-muted)]">© Almahue ERP</div>
        )}
      </div>
    </aside>
  );
}
