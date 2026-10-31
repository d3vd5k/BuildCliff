import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './context/UIContext';
import { AppShell } from './components/layout/AppShell';
import { TimelinePage } from './pages/TimelinePage';
import { ComparePage } from './pages/ComparePage';
import { DependenciesPage } from './pages/DependenciesPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<TimelinePage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/dependencies" element={<DependenciesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </UIProvider>
    </QueryClientProvider>
  );
};

