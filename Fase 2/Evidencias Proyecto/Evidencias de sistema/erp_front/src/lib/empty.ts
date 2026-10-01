/**
 * Referencia estable para defaults de React Query.
 * Nunca uses `data = []` inline: cada render crea un array nuevo y un
 * `useEffect([data])` → setState entra en "Maximum update depth exceeded".
 */
export const EMPTY_ARRAY: readonly unknown[] = Object.freeze([]);
