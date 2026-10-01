import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmtCLP } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type LibroResumenDoc = {
  id: string;
  tipo: string;
  neto?: number;
  iva?: number | null;
  total?: number;
  monto?: number;
  afactoFactura?: string;
  indicadorVenta?: string;
  estado?: string;
  billingStatus?: string;
};

type TipoAgg = {
  key: string;
  label: string;
  cantidad: number;
  neto: number;
  iva: number;
  exento: number;
  /** Signo para el total RCV: NC resta. */
  signo: 1 | -1;
};

function tipoLabel(tipo: string): string {
  const t = (tipo || '').toUpperCase();
  if (t === 'FACTURA') return 'Facturas afectas';
  if (t === 'NC') return 'Notas de crédito';
  if (t === 'ND') return 'Notas de débito';
  if (t === 'GUIA') return 'Guías de despacho';
  if (t === 'OC') return 'Órdenes de compra';
  if (t.includes('EXENT')) return 'Facturas exentas';
  if (t.includes('BOLETA')) return 'Boletas';
  return tipo || 'Otros';
}

function signoTipo(tipo: string): 1 | -1 {
  return (tipo || '').toUpperCase() === 'NC' ? -1 : 1;
}

function netoDoc(d: LibroResumenDoc): number {
  return Number(d.neto ?? d.monto ?? 0) || 0;
}

function ivaDoc(d: LibroResumenDoc): number {
  if (d.iva != null && Number.isFinite(Number(d.iva))) return Number(d.iva);
  const n = netoDoc(d);
  if (d.afactoFactura === 'EXENTO') return 0;
  if ((d.indicadorVenta || '').toUpperCase() === 'EXPORTACION'
    || (d.indicadorVenta || '').toUpperCase() === 'EXENTO') return 0;
  return Math.round(n * 0.19);
}

function exentoDoc(d: LibroResumenDoc): number {
  if (d.afactoFactura === 'EXENTO') return netoDoc(d);
  const ind = (d.indicadorVenta || '').toUpperCase();
  if (ind === 'EXPORTACION' || ind === 'EXENTO') return netoDoc(d);
  return 0;
}

function bucketKey(d: LibroResumenDoc): string {
  const t = (d.tipo || 'OTRO').toUpperCase();
  if (t === 'FACTURA' && exentoDoc(d) > 0 && ivaDoc(d) === 0) return 'FACTURA_EXENTA';
  return t;
}

export function LibroResumenPanel({
  rows,
  title = 'Resumen por tipo de documento',
  defaultOpen = true,
}: {
  rows: LibroResumenDoc[];
  title?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const grupos = useMemo(() => {
    const map = new Map<string, TipoAgg>();
    for (const d of rows) {
      if (d.estado === 'ANULADO') continue;
      if ((d.billingStatus || '').toUpperCase() === 'REJECTED') continue;
      const key = bucketKey(d);
      const cur = map.get(key) ?? {
        key,
        label: key === 'FACTURA_EXENTA' ? 'Facturas exentas' : tipoLabel(d.tipo),
        cantidad: 0,
        neto: 0,
        iva: 0,
        exento: 0,
        signo: signoTipo(d.tipo),
      };
      const n = netoDoc(d);
      const iva = ivaDoc(d);
      const ex = exentoDoc(d);
      cur.cantidad += 1;
      cur.neto += n;
      cur.iva += iva;
      cur.exento += ex;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const totales = useMemo(() => {
    let neto = 0;
    let iva = 0;
    let exento = 0;
    let cantidad = 0;
    for (const g of grupos) {
      cantidad += g.cantidad;
      neto += g.signo * g.neto;
      iva += g.signo * g.iva;
      exento += g.signo * g.exento;
    }
    return { cantidad, neto, iva, exento, total: neto + iva };
  }, [grupos]);

  return (
    <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title}
        </span>
        <span className="text-xs tabular-nums text-[var(--color-muted)]">
          {totales.cantidad} docs · Total {fmtCLP(totales.total)}
          {grupos.some((g) => g.signo < 0) ? ' (NC restan)' : ''}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] px-3 pb-3 pt-2">
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Documentos', value: String(totales.cantidad) },
              { label: 'Neto', value: fmtCLP(totales.neto) },
              { label: 'IVA', value: fmtCLP(totales.iva) },
              { label: 'Exento', value: fmtCLP(totales.exento) },
              { label: 'Total', value: fmtCLP(totales.total) },
            ].map((k) => (
              <div key={k.label} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{k.label}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>

          {grupos.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">Sin documentos para resumir.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    <th className="py-1.5 pr-2 font-semibold">Tipo</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Cant.</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Neto</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">IVA</th>
                    <th className="py-1.5 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const tot = g.signo * (g.neto + g.iva);
                    return (
                      <tr key={g.key} className="border-b border-[var(--color-border)]/60 last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-[var(--color-text)]">
                          {g.label}
                          {g.signo < 0 ? (
                            <span className="ml-1 text-[10px] text-[var(--color-muted)]">(resta)</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{g.cantidad}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtCLP(g.signo * g.neto)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtCLP(g.signo * g.iva)}</td>
                        <td className={cn(
                          'py-1.5 text-right tabular-nums font-medium',
                          g.signo < 0 && 'text-[var(--color-danger)]',
                        )}
                        >
                          {fmtCLP(tot)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
