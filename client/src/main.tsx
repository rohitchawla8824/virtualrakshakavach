import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import '@/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <React.Suspense
        fallback={
          <main className="grid min-h-screen place-items-center bg-neutral-50 px-4 text-sm text-neutral-600">
            Loading Virtual Raksha Kavach…
          </main>
        }
      >
        <RouterProvider router={router} />
      </React.Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
);
