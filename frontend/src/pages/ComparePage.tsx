import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Columns, RotateCw } from 'lucide-react';
import { CompareBars } from '../components/compare/CompareBars';
import { DiffTable } from '../components/compare/DiffTable';
import { CommitList } from '../components/compare/CommitList';
import { DepChanges } from '../components/compare/DepChanges';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { useCompare } from '../hooks/useCompare';
import { useLatestFinding } from '../hooks/useFinding';

export const ComparePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryFindingId = searchParams.get('finding_id');
  const runA = searchParams.get('a') || undefined;
  const runB = searchParams.get('b') || undefined;

  const { data: latestData } = useLatestFinding();
  const findingId = queryFindingId || latestData?.finding?.finding_id || undefined;

  const { data: compareData, isLoading, error, refetch } = useCompare({
    findingId: !runA && !runB ? findingId : undefined,
    a: runA,
    b: runB,
  });

  const handleSwap = () => {
    if (runA && runB) {
      navigate(`/compare?a=${runB}&b=${runA}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <Skeleton className="w-full h-14" />
        <Skeleton className="w-full h-48" />
        <Skeleton className="w-full h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-8">
        <ErrorBanner
          message={(error as any)?.message || 'Failed to compute comparison'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!compareData) {
    return (
      <div className="cliff-card p-8 text-center text-xs font-mono text-text-muted">
        No comparison data available. Select two runs on the timeline or inspect an active finding.
      </div>
    );
  }

  const isRunMode = compareData.mode === 'runs';

  return (
    <div className="flex flex-col gap-6">
      {/* Compare Header */}
      <div className="cliff-card p-4 flex items-center justify-between flex-wrap gap-4 font-mono">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-accent-soft text-accent flex items-center justify-center font-bold">
            <Columns size={16} />
          </div>
          <div>
            <div className="text-xs text-text-muted">// comparison mode: {compareData.mode}</div>
            <h1 className="text-base font-bold text-text">
              {compareData.a.label} <span className="text-accent">vs</span> {compareData.b.label}
            </h1>
          </div>
        </div>

        {isRunMode && (
          <button
            onClick={handleSwap}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 border border-border text-xs text-text transition-colors"
            title="Swap Run A and Run B"
          >
            <ArrowLeftRight size={13} />
            <span>Swap A / B</span>
          </button>
        )}
      </div>

      {/* Side-by-Side Stacked Bars */}
      <CompareBars compare={compareData} />

      {/* Diff Table */}
      <DiffTable
        diff={compareData.diff}
        total={compareData.total}
        labelA={compareData.a.label}
        labelB={compareData.b.label}
      />

      {/* Commits & Dependency Changes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CommitList commits={compareData.commits_between} />
        <DepChanges depChanges={compareData.dependency_changes} />
      </div>
    </div>
  );
};
