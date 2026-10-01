import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '@/services/api';
import type { UiTablePreference } from '@/types/domain';

export type ResolvedColumnPrefs = {
  order: string[];
  visible: Set<string>;
};

/** Fusiona preferencias guardadas con las columnas actuales del código. */
export function resolveColumnPrefs(
  allKeys: string[],
  prefs: Pick<UiTablePreference, 'visibleColumns' | 'columnOrder'> | null | undefined,
): ResolvedColumnPrefs {
  const known = new Set(allKeys);
  const savedOrder = (prefs?.columnOrder ?? []).filter((k) => known.has(k));
  const newKeys = allKeys.filter((k) => !savedOrder.includes(k));
  const order = [...savedOrder, ...newKeys];

  const visible = new Set<string>();
  if (!prefs?.visibleColumns) {
    for (const k of allKeys) visible.add(k);
  } else {
    const savedVisible = new Set(prefs.visibleColumns);
    for (const k of savedOrder) {
      if (savedVisible.has(k)) visible.add(k);
    }
    // Columnas nuevas en código → visibles por defecto
    for (const k of newKeys) visible.add(k);
  }

  if (visible.size === 0 && order[0]) visible.add(order[0]);
  return { order, visible };
}

/**
 * Carga/guarda preferencias de columnas por `tableKey` (debounced).
 * En demo: mock/localStorage; en real: GET/PUT `/ui/table-preferences/:tableKey`.
 */
export function useTablePreferences(tableKey: string | undefined, columnKeys: string[]) {
  const keysSig = columnKeys.join('\0');
  const [prefs, setPrefs] = useState<UiTablePreference | null>(null);
  const [loaded, setLoaded] = useState(!tableKey);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    if (!tableKey) {
      setPrefs(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    skipNextSave.current = true;
    void api.getTablePreference(tableKey).then((row) => {
      if (cancelled) return;
      if (row.visibleColumns && row.columnOrder) {
        setPrefs({
          tableKey: row.tableKey,
          visibleColumns: row.visibleColumns,
          columnOrder: row.columnOrder,
        });
      } else {
        setPrefs(null);
      }
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) {
        setPrefs(null);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [tableKey]);

  const resolved = useMemo(
    () => resolveColumnPrefs(columnKeys, prefs),
    // keysSig captura cambios de columnas sin reordenar por referencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keysSig, prefs],
  );

  const persist = useCallback((next: UiTablePreference) => {
    setPrefs(next);
  }, []);

  useEffect(() => {
    if (!tableKey || !loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (!prefs) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api.putTablePreference(tableKey, {
        visibleColumns: prefs.visibleColumns,
        columnOrder: prefs.columnOrder,
      }).catch(() => { /* silencioso: no bloquear UX */ });
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tableKey, loaded, prefs]);

  const setVisible = useCallback((key: string, show: boolean) => {
    const { order, visible } = resolveColumnPrefs(columnKeys, prefs);
    const nextVisible = new Set(visible);
    if (show) nextVisible.add(key);
    else {
      if (nextVisible.size <= 1) return;
      nextVisible.delete(key);
    }
    persist({
      tableKey: tableKey ?? '',
      columnOrder: order,
      visibleColumns: order.filter((k) => nextVisible.has(k)),
    });
  }, [columnKeys, prefs, persist, tableKey]);

  const moveColumn = useCallback((key: string, dir: -1 | 1) => {
    const { order, visible } = resolveColumnPrefs(columnKeys, prefs);
    const idx = order.indexOf(key);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const nextOrder = [...order];
    [nextOrder[idx], nextOrder[swap]] = [nextOrder[swap], nextOrder[idx]];
    persist({
      tableKey: tableKey ?? '',
      columnOrder: nextOrder,
      visibleColumns: nextOrder.filter((k) => visible.has(k)),
    });
  }, [columnKeys, prefs, persist, tableKey]);

  const reorderColumn = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const { order, visible } = resolveColumnPrefs(columnKeys, prefs);
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const nextOrder = [...order];
    const [item] = nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, item);
    persist({
      tableKey: tableKey ?? '',
      columnOrder: nextOrder,
      visibleColumns: nextOrder.filter((k) => visible.has(k)),
    });
  }, [columnKeys, prefs, persist, tableKey]);

  return {
    loaded,
    order: resolved.order,
    visible: resolved.visible,
    setVisible,
    moveColumn,
    reorderColumn,
  };
}
