import {
  Children,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';
import { getAppLocale } from '@/lib/locale';
import { INPUT_LIMITS, defaultMaxLengthForHtmlType } from '@/lib/inputValidation';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';

const base =
  'h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all shadow-sm';

function optionsFromSelectChildren(children: ReactNode): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const el = child as ReactElement<{ value?: string; children?: ReactNode }>;
      if (el.type === 'option') {
        const value = String(el.props.value ?? '');
        const label = String(el.props.children ?? value);
        opts.push({ value, label });
        return;
      }
      if (el.type === 'optgroup' && el.props.children) {
        walk(el.props.children);
      }
    });
  };
  walk(children);
  return opts;
}

/**
 * Input del design system. Aplica maxLength defensivo por tipo si no se pasa uno.
 * Fechas/números no reciben maxLength; email/password usan techos de `inputValidation`.
 */
export function Input({ className, type, lang, maxLength, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  const isDate = type === 'date' || type === 'datetime-local' || type === 'time' || type === 'month';
  const resolvedLang = lang ?? (isDate ? getAppLocale() : undefined);
  const resolvedMax = maxLength ?? defaultMaxLengthForHtmlType(type);
  return (
    <input
      className={cn(base, className)}
      type={type}
      {...p}
      maxLength={resolvedMax}
      lang={resolvedLang}
    />
  );
}

/**
 * Select con buscador integrado (misma UX que SearchableSelect).
 * Acepta `<option>` como un `<select>` nativo para no reescribir pantallas.
 */
export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  id,
  name,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => optionsFromSelectChildren(children), [children]);
  const placeholderOpt = options.find((o) => o.value === '');
  const selectableOptions = options.filter((o) => o.value !== '');
  const resolvedValue =
    value !== undefined && value !== null
      ? String(value)
      : defaultValue !== undefined && defaultValue !== null
        ? String(defaultValue)
        : '';

  return (
    <>
      {name ? <input type="hidden" name={name} value={resolvedValue} required={required} /> : null}
      <SearchableSelect
        id={id}
        className={className}
        value={resolvedValue}
        onChange={(next) => {
          onChange?.({
            target: { value: next, name: name ?? '' },
            currentTarget: { value: next, name: name ?? '' },
          } as React.ChangeEvent<HTMLSelectElement>);
        }}
        options={selectableOptions}
        placeholder={placeholderOpt?.label ?? 'Seleccionar…'}
        disabled={disabled}
        buttonClassName={cn(rest['aria-invalid'] && 'border-[var(--color-danger)]')}
      />
    </>
  );
}

export function Textarea({ className, maxLength, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(base, 'h-24 py-2 resize-none rounded-2xl', className)}
      {...p}
      maxLength={maxLength ?? INPUT_LIMITS.glosa}
    />
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-[var(--color-muted)]">{children}</label>;
}

export function Field({
  label,
  children,
  className,
  required,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <Label>
        {label}
        {required ? <span className="text-[var(--color-danger)]"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

export { SearchableSelect } from '@/components/ui/searchable-select';
export type { SearchableOption } from '@/components/ui/searchable-select';
