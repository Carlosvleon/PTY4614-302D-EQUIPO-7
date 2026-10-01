import { AlertTriangle, RefreshCw } from 'lucide-react';
import { hasUsableQueryData, isSilentAuthzError, queryErrorMessage } from '@/lib/queryError';

export function QueryErrorAlert({
  error,
  data,
  isLoading,
  resource,
  onRetry,
  className = '',
  includeAuthzError = false,
}: {
  error: unknown;
  /** Si existe, un refetch fallido conserva el contenido cacheado y no bloquea la vista. */
  data?: unknown;
  isLoading?: boolean;
  resource?: string;
  onRetry?: () => void;
  className?: string;
  /** En imputación OC: mostrar 403 en vez de ocultarlo (el digitador necesita el aviso). */
  includeAuthzError?: boolean;
}) {
  if (!error || isLoading || hasUsableQueryData(data)) return null;
  if (!includeAuthzError && isSilentAuthzError(error)) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100 ${className}`}
    >
      <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{queryErrorMessage(error, resource)}</span>
      {onRetry && (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2"
          onClick={onRetry}
        >
          <RefreshCw size={13} aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
}
