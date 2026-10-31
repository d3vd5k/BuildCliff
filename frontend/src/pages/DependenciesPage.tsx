import React from 'react';
import { Package } from 'lucide-react';
import { ImpactTable } from '../components/deps/ImpactTable';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { useImpacts } from '../hooks/useImpacts';

export const DependenciesPage: React.FC = () => {
  const { data: impactsData, isLoading, error, refetch } = useImpacts('demo-app');

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <Skeleton className="w-full h-20" />
        <Skeleton className="w-full h-80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-8">
        <ErrorBanner
          message={(error as any)?.message || 'Failed to load dependency impacts'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const impacts = impactsData?.impacts || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="cliff-card p-5 flex items-center justify-between flex-wrap gap-4 font-mono">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Package size={14} className="text-accent" />
            <span>// dependency matrix telemetry</span>
          </div>
          <h1 className="text-xl font-bold text-text tracking-tight">
            Dependency Version Impact Matrix
          </h1>
          <p className="text-xs text-text-muted font-sans mt-1">
            Every dependency bump, measured against the steps it could affect, including the ones that did nothing.
          </p>
        </div>
      </div>

      {/* Main Impact Table or Empty State */}
      {impacts.length === 0 ? (
        <div className="cliff-card p-10 text-center text-xs font-mono text-text-muted">
          No dependency bumps recorded yet.
        </div>
      ) : (
        <ImpactTable
          impacts={impacts}
          computedAt={impactsData?.computed_at}
          onRefresh={() => refetch()}
        />
      )}
    </div>
  );
};
