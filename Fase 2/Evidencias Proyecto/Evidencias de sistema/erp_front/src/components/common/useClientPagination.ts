import { useEffect, useState } from 'react';

export type PageSizeOption = 5 | 15 | 'all';

export const PAGE_SIZE_OPTIONS: PageSizeOption[] = [5, 15, 'all'];

/** El <select> entrega strings ("5"); sin coerce, `offset + pageSize` concatena y salta de página. */
export function parsePageSize(raw: unknown, fallback: PageSizeOption = 5): PageSizeOption {
  if (raw === 'all') return 'all';
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (n === 5 || n === 15) return n;
  return fallback;
}

export function pageSizeLimit(size: PageSizeOption, total: number): number {
  return size === 'all' ? Math.max(total, 1) : size;
}

export function loadPageSize(storageKey: string, defaultSize: PageSizeOption = 5): PageSizeOption {
  return parsePageSize(localStorage.getItem(storageKey), defaultSize);
}

export function savePageSize(storageKey: string, size: PageSizeOption) {
  localStorage.setItem(storageKey, String(size));
}

export function useClientPagination<T>(
  items: T[],
  options?: { defaultSize?: PageSizeOption; storageKey?: string },
) {
  const defaultSize = options?.defaultSize ?? 5;
  const storageKey = options?.storageKey;
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(() =>
    storageKey ? loadPageSize(storageKey, defaultSize) : defaultSize,
  );
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [items.length]);

  const size = parsePageSize(pageSize, defaultSize);
  const total = items.length;
  const limit = pageSizeLimit(size, total);
  const totalPages = size === 'all' ? 1 : Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const offset = size === 'all' ? 0 : safePage * limit;
  const pageRows = size === 'all' ? items : items.slice(offset, offset + limit);

  const setPageSize = (next: PageSizeOption | string) => {
    const parsed = parsePageSize(next, defaultSize);
    setPageSizeState(parsed);
    setPage(0);
    if (storageKey) savePageSize(storageKey, parsed);
  };

  const setOffset = (newOffset: number) => {
    if (size === 'all') return;
    const n = Number(newOffset);
    if (!Number.isFinite(n)) return;
    setPage(Math.max(0, Math.floor(n / limit)));
  };

  return {
    pageRows, total, pageSize: size, setPageSize, setOffset, offset,
    from: total === 0 ? 0 : offset + 1,
    to: size === 'all' ? total : Math.min(offset + limit, total),
  };
}
