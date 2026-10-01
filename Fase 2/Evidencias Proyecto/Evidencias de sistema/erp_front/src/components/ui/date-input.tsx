import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { getAppLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** date (default) o month (YYYY-MM). */
  mode?: 'date' | 'month';
};

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  mode = 'date',
  min,
  max,
  ...rest
}: DateInputProps) {
  return (
    <Input
      {...rest}
      type={mode}
      lang={getAppLocale()}
      disabled={disabled}
      min={min}
      max={max}
      className={cn('erp-date-input', mode === 'month' && 'erp-month-input', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
