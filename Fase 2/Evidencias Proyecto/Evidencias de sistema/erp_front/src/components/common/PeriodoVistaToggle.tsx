import { Checkbox } from '@/components/ui/checkbox';
import type { PeriodoVista } from '@/hooks/usePeriodoVista';

const TITLE_TODOS = 'mostrar todos los periodos';

/** Check por pantalla (no en el banner). Igual al de Libro de ventas / Emitir DTE. */
export function PeriodoVistaToggle({ vista }: { vista: PeriodoVista }) {
  return (
    <Checkbox
      checked={vista.todo}
      onChange={(e) => vista.setTodo(e.target.checked)}
      label="Todos"
      title={TITLE_TODOS}
      labelClassName="inline-flex h-8 cursor-pointer items-center gap-2 text-xs text-[var(--color-text)]"
    />
  );
}
