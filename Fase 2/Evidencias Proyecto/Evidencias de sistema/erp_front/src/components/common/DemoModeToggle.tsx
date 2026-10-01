import { cn } from '@/lib/utils';
import { useAppSettings } from '@/app/app-settings-context';

export function DemoModeToggle() {
  const { demoMode, setDemoMode } = useAppSettings();

  return (
    <button
      type="button"
      onClick={() => setDemoMode(!demoMode)}
      title={demoMode ? 'Datos de demostración' : 'Datos en vivo'}
      className={cn(
        'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors',
        demoMode
          ? 'border-[var(--color-mock-text)]/40 bg-[var(--color-mock-bg)] text-[var(--color-mock-text)] hover:brightness-105'
          : 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent-2)] hover:brightness-105',
      )}
    >
      {demoMode ? 'Modo demo' : 'Modo real'}
    </button>
  );
}
