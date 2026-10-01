import { Toaster } from 'sonner';
import { useTheme } from '@/app/ThemeProvider';

export function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-right"
      richColors
      closeButton
      duration={5000}
      toastOptions={{
        duration: 5000,
        classNames: {
          error: '[&_[data-content]]:whitespace-pre-wrap',
        },
      }}
    />
  );
}
