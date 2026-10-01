import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { INPUT_LIMITS, formatRutDisplay, sanitizeRutInput } from '@/lib/inputValidation';
import { cn } from '@/lib/utils';

type RutInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function RutInput({ value, onChange, className, onBlur, disabled, placeholder, ...rest }: RutInputProps) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      placeholder={placeholder ?? '12.345.678-9'}
      maxLength={INPUT_LIMITS.rut}
      className={cn('font-mono tracking-wide', className)}
      value={value}
      onChange={(e) => onChange(sanitizeRutInput(e.target.value))}
      onBlur={(e) => {
        const formatted = formatRutDisplay(e.target.value);
        if (formatted !== e.target.value) onChange(formatted);
        onBlur?.(e);
      }}
    />
  );
}
