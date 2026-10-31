import React, { useEffect } from 'react';
import { TimelineChart } from '../components/timeline/TimelineChart';
import { CulpritPanel } from '../components/culprit/CulpritPanel';
import { EmptyState } from '../components/timeline/EmptyState';
import { StepSelector } from '../components/layout/StepSelector';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { useRuns } from '../hooks/useRuns';
import { useLatestFinding, useFinding } from '../hooks/useFinding';
import { useUI } from '../context/UIContext';
import { formatDelta, sha7 } from '../lib/format';
import { AlertTriangle, CheckCircle2, ChevronRight, Activity } from 'lucide-react';

export const TimelinePage: React.FC = () => {
  const { data: runsData, isLoading: runsLoading, error: runsError, refetch: refetchRuns } = useRuns();
  const { data: latestData, isLoading: findingLoading, error: findingError, refetch: refetchFinding } = useLatestFinding();
  const {
    panelOpen,
    setPanelOpen,
    selectedFindingId,
    setSelectedStep,
  } = useUI();

  // If a specific finding was selected from a link, load that, else use latest
  const { data: specificFinding } = useFinding(selectedFindingId);
  const activeFinding = specificFinding || latestData?.finding || null;
  const hasActiveRegression = latestData?.has_active_regression || Boolean(activeFinding);

  // Set default selected step to finding's step when it arrives
  useEffect(() => {
    if (activeFinding?.step) {
      setSelectedStep(activeFinding.step);
    }
  }, [activeFinding?.step, setSelectedStep]);

  if (runsLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <Skeleton className="w-full h-12" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-8 h-[450px]" />
          <Skeleton className="lg:col-span-4 h-[450px]" />
        </div>
      </div>
    );
  }

  if (runsError) {
    return (
      <div className="my-8">
        <ErrorBanner
          message={(runsError as any)?.message || 'Failed to load timeline runs'}
          onRetry={() => {
            refetchRuns();
            refetchFinding();
          }}
        />
      </div>
    );
  }

  const runs = runsData?.runs || [];

  return (
    <div className="flex flex-col gap-5">
      {/* Top Status Strip (Prompt 7.2) */}
      {hasActiveRegression && activeFinding ? (
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-danger-soft border border-danger/40 text-xs font-mono animate-in fade-in">
          <div className="flex items-center gap-2 text-danger">
            <span className="w-2 h-2 rounded-full bg-danger animate-ping flex-shrink-0" />
            <span>
              <strong>● Regression detected in {activeFinding.step}:</strong>{' '}
              {formatDelta(activeFinding.delta_ms)} since {sha7(activeFinding.change_point.commit_sha)}
            </span>
          </div>

          <button
            onClick={() => setPanelOpen(true)}
            className="inline-flex items-center gap-1 font-bold text-danger hover:text-white transition-colors"
          >
            <span>Open culprit</span>
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-lg bg-success-soft border border-success/30 text-xs font-mono text-success">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>✓ No regression detected across pipeline steps</span>
          </div>
          <span className="text-text-muted text-[11px]">{runs.length} runs healthy</span>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Chart (60% or 100% when panel closed / clean) */}
        <div
          className={`flex flex-col gap-4 ${
            panelOpen && activeFinding ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
          }`}
        >
          {/* Chart Header with Step Selector */}
          <div className="cliff-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-accent" />
                <h2 className="text-sm font-mono font-bold text-text">
                  CI Step Duration Timeline
                </h2>
              </div>

              <StepSelector jumpedStep={activeFinding?.step} />
            </div>

            {/* Timeline Chart */}
            <TimelineChart
              runs={runs}
              finding={activeFinding}
              onOpenPanel={() => setPanelOpen(true)}
            />
          </div>

          {/* Clean State prompt hint if no regression */}
          {!hasActiveRegression && <EmptyState runCount={runs.length} />}
        </div>

        {/* Right Column: Culprit Panel (40%) */}
        {panelOpen && activeFinding && (
          <div className="lg:col-span-5 xl:col-span-4 sticky top-20">
            <CulpritPanel
              finding={activeFinding}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
