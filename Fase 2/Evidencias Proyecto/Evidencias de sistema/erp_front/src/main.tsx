import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from '@/app/ThemeProvider';
import { ThemedToaster } from '@/components/common/ThemedToaster';
import { routerBasename } from '@/lib/basePath';
import {
  getErrorStatus,
  isSilentAuthzError,
  queryErrorMessage,
  shouldNotifyQueryError,
  shouldRetryQuery,
} from '@/lib/queryError';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const suppressedStatuses = query.meta?.suppressErrorToastStatuses;
      const status = getErrorStatus(error);
      if (
        Array.isArray(suppressedStatuses)
        && status !== undefined
        && suppressedStatuses.includes(status)
      ) return;
      if (isSilentAuthzError(error)) return;

      if (!shouldNotifyQueryError(query.queryHash, error, query.state.data)) return;

      toast.error(queryErrorMessage(error), {
        id: `query-error:${query.queryHash}`,
        duration: 8_000,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={routerBasename()}>
        <QueryClientProvider client={queryClient}>
          <App />
          <ThemedToaster />
        </QueryClientProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
