import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-white shadow-sm hover:bg-[var(--color-accent-2)]',
  secondary: 'bg-[var(--color-brand)] text-white shadow-sm hover:bg-[var(--color-brand-2)]',
  ghost: 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
  outline: 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
  danger: 'bg-[var(--color-danger)] text-white hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-full',
  md: 'h-10 px-5 text-sm rounded-full',
  lg: 'h-12 px-7 text-base rounded-full',
};

export function Button({
  className, variant = 'primary', size = 'md', leftIcon, rightIcon, children, ...rest
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
