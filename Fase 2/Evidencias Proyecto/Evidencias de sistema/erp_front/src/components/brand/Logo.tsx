import { cn } from '@/lib/utils';
import logoFull from '@/assets/logo.png';
import logoMark from '@/assets/logo-mark.png';

const HEIGHT = { sm: 36, md: 52, lg: 76 } as const;
const MARK = { sm: 32, md: 36, lg: 52 } as const;

export function Logo({
  size = 'md',
  variant = 'full',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon' | 'compact';
  className?: string;
}) {
  const icon = variant === 'icon';
  const height = icon ? MARK[size] : HEIGHT[size];

  return (
    <span className={cn('inline-flex max-w-full items-center', className)}>
      <img
        src={icon ? logoMark : logoFull}
        alt={icon ? '' : 'Almahue Export'}
        draggable={false}
        className="w-auto max-w-full object-contain"
        style={{ height }}
      />
    </span>
  );
}
