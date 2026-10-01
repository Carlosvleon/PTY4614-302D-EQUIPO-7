import { useEffect, useState } from 'react';
import { usePeriodoScopeCodigo } from '@/hooks/useQueryScope';
import {
  emptyPeriodoVista,
  fechaEnPeriodoYm,
  filterByPeriodoVista,
  mesContableSlash,
} from '@/lib/periodoVista';

/** Estado local de cada listado: mes del banner, o Todo en esa pantalla. */
export function usePeriodoVista(initialTodo = false) {
  const codigo = usePeriodoScopeCodigo();
  const [todo, setTodo] = useState(initialTodo);

  useEffect(() => {
    setTodo(initialTodo);
  }, [codigo, initialTodo]);

  return {
    codigo,
    todo,
    setTodo,
    vistaKey: todo ? 'all' : codigo,
    inVista: (fecha: string | Date | null | undefined) =>
      todo || fechaEnPeriodoYm(fecha, codigo),
    filter: <T,>(
      rows: T[],
      getFecha: (row: T) => string | Date | null | undefined,
    ) => filterByPeriodoVista(rows, getFecha, codigo, todo),
    empty: (entidad: string) => emptyPeriodoVista(entidad, codigo, todo),
    mesContableCartola: mesContableSlash(codigo),
  };
}

export type PeriodoVista = ReturnType<typeof usePeriodoVista>;
