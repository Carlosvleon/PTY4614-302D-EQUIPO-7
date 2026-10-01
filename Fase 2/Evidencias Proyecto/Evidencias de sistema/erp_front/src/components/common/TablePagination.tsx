import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import {
  PAGE_SIZE_OPTIONS,
  parsePageSize,
  pageSizeLimit,
  type PageSizeOption,
  savePageSize,
} from './useClientPagination';

export function TablePagination({
  total, pageSize, offset, onPageSizeChange, onOffsetChange, storageKey,
}: {
  total: number;
  pageSize: PageSizeOption;
  offset: number;
  onPageSizeChange: (size: PageSizeOption) => void;
  onOffsetChange: (offset: number) => void;
  storageKey?: string;
}) {
  if (total === 0) return null;
  const size = parsePageSize(pageSize);
  const effectiveLimit = pageSizeLimit(size, total);
  const totalPages = size === 'all' ? 1 : Math.max(1, Math.ceil(total / effectiveLimit));
  const page = size === 'all' ? 1 : Math.floor(offset / effectiveLimit) + 1;
  const from = offset + 1;
  const to = Math.min(offset + effectiveLimit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[var(--color-muted)]">Mostrando {from}–{to} de {total}</span>
        <label className="flex items-center gap-2 text-[var(--color-muted)]">
          <span>Por página</span>
          <Select
            className="h-8 w-auto min-w-[5rem] rounded-lg px-2 text-xs"
            value={String(size)}
            onChange={(e) => {
              const next = parsePageSize(e.target.value);
              onPageSizeChange(next);
              onOffsetChange(0);
              if (storageKey) savePageSize(storageKey, next);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={String(n)} value={String(n)}>{n === 'all' ? 'Todos' : n}</option>
            ))}
          </Select>
        </label>
      </div>
      {size !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-muted)]">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={offset <= 0} onClick={() => onOffsetChange(Math.max(0, offset - effectiveLimit))}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled={offset + effectiveLimit >= total} onClick={() => onOffsetChange(offset + effectiveLimit)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
