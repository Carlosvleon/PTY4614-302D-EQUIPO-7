import { useMemo, useRef, useState, useEffect } from 'react';
import { Building2, Check, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAppSettings } from '@/app/app-settings-context';
import { useAuth } from '@/app/auth-context';

export function EmpresaSelector() {
  const { empresas, selectedEmpresa, setSelectedEmpresaId } = useAppSettings();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.permisos?.includes('*') ?? false;

  const visible = useMemo(() => {
    const base = isSuperAdmin
      ? empresas
      : empresas.filter((e) => e.id === user?.empresaId);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (e) => e.razonSocial.toLowerCase().includes(q) || e.rut.toLowerCase().includes(q),
    );
  }, [empresas, isSuperAdmin, query, user?.empresaId]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[200px] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
      >
        <Building2 size={16} className="shrink-0 text-[var(--color-accent)]" />
        <span className="truncate font-medium text-[var(--color-text)]">
          {selectedEmpresa?.razonSocial ?? 'Seleccionar empresa'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Mis empresas
            </p>
            <div className="relative mt-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por RUT o nombre…"
                className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] pl-8 pr-3 text-xs outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {visible.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">Sin resultados</li>
            )}
            {visible.map((e) => {
              const active = e.id === selectedEmpresa?.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!e.activa}
                    onClick={() => { setSelectedEmpresaId(e.id); setOpen(false); setQuery(''); }}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                      e.activa ? 'hover:bg-[var(--color-surface-2)]' : 'cursor-not-allowed opacity-50',
                      active && 'bg-[var(--color-accent-soft)]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--color-text)]">{e.razonSocial}</span>
                      <span className="block text-[11px] text-[var(--color-muted)]">{e.rut}</span>
                    </span>
                    {active && <Check size={16} className="shrink-0 text-[var(--color-accent)]" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {isSuperAdmin && (
            <div className="border-t border-[var(--color-border)] p-2">
              <Link
                to="/admin/empresas"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
              >
                <Plus size={14} />
                Nueva empresa
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
