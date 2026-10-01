import { cn } from '@/lib/utils';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

const boxClass =
  'h-4 w-4 shrink-0 rounded border border-[var(--color-border)] accent-[var(--color-accent)] ' +
  'focus:ring-2 focus:ring-[var(--color-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Texto junto al control (layout inline). */
  label?: ReactNode;
  /** Clases del wrapper cuando hay `label`. */
  labelClassName?: string;
};

/**
 * Checkbox estándar del ERP. Sustituye `<input type="checkbox">` ad hoc.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, labelClassName, id, title, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      title={label == null ? title : undefined}
      className={cn(boxClass, !label && className)}
      {...rest}
    />
  );

  if (label == null) return input;

  return (
    <label title={title} className={cn('flex items-center gap-2 text-sm', labelClassName, className)}>
      {input}
      <span>{label}</span>
    </label>
  );
});
