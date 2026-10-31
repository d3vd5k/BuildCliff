import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import { STEP_COLORS, STEP_LABELS, STEP_ORDER } from '../../lib/colors';
import { formatDuration, formatDelta, sha7, timeAgo } from '../../lib/format';
import { useUI } from '../../context/UIContext';
import { CliffMarkerLabel } from './CliffMarker';
import { Columns, X, AlertTriangle } from 'lucide-react';
import type { Run, Finding } from '../../api/types';

interface TimelineChartProps {
  runs: Run[];
  finding: Finding | null;
  onOpenPanel?: () => void;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({
  runs,
  finding,
  onOpenPanel,
}) => {
  const navigate = useNavigate();
  const {
    selectedStep,
    revertPreview,
    compareSelection,
    toggleCompareRun,
    clearCompareSelection,
  } = useUI();

  const [compareA, compareB] = compareSelection;
  const cliffRunId = finding?.change_point?.run_id;
  const findingStep = finding?.step || 'install';

  // Cliff run index
  const cliffIndex = useMemo(() => {
    if (!cliffRunId) return -1;
    return runs.findIndex((r) => r.run_id === cliffRunId);
  }, [runs, cliffRunId]);

  // Baseline before_ms
  const baselineBeforeMs = useMemo(() => {
    if (!finding) return null;
    if (selectedStep === 'all') {
      return Object.values(finding.breakdown.before_ms).reduce((a, b) => a + b, 0);
    }
    return finding.breakdown.before_ms[selectedStep] ?? finding.before_ms;
  }, [finding, selectedStep]);

  // Transform runs into chart points
  const chartData = useMemo(() => {
    return runs.map((run, idx) => {
      const isFailed = run.status === 'failed';
      const isCliff = run.run_id === cliffRunId;
      const isAfterCliff = cliffIndex !== -1 && idx >= cliffIndex;

      const stepMap: Record<string, number | null> = {};
      (run.steps || []).forEach((s) => {
        // Failed runs are excluded from the line's connection (connectNulls={false})
        stepMap[s.name] = isFailed ? null : s.duration_ms;
      });

      // Total ms (null if failed)
      const totalMs = isFailed ? null : run.total_ms;

      // Revert preview calculation
      let projectedLine: number | null = null;
      let wonBackArea: number | null = null;

      if (revertPreview && isAfterCliff && baselineBeforeMs != null && !isFailed) {
        const curDuration =
          selectedStep === 'all'
            ? totalMs
            : (stepMap[selectedStep] as number | null);

        if (curDuration != null && curDuration > baselineBeforeMs) {
          projectedLine = baselineBeforeMs;
          wonBackArea = curDuration - baselineBeforeMs;
        }
      }

      return {
        run_id: run.run_id,
        commit_sha: run.commit_sha,
        started_at: run.started_at,
        status: run.status,
        demo_replay: run.demo_replay,
        isFailed,
        isCliff,
        isAfterCliff,
        total_ms: totalMs,
        raw_total_ms: run.total_ms,
        ...stepMap,
        projectedLine,
        wonBackArea,
      };
    });
  }, [runs, cliffRunId, cliffIndex, revertPreview, baselineBeforeMs, selectedStep]);

  // Custom marker renderer
  const renderDot = (props: any, stepName: string): React.ReactElement => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return <g />;

    const isSelected = payload?.run_id === compareA || payload?.run_id === compareB;

    // Failed run: muted hollow marker with X (prompt 7.2)
    if (payload?.isFailed) {
      return (
        <g key={`dot-fail-${payload.run_id}-${stepName}`}>
          <circle cx={cx} cy={cy} r={4.5} fill="#161C26" stroke="#5B6779" strokeWidth={1.5} />
          <line x1={cx - 2} y1={cy - 2} x2={cx + 2} y2={cy + 2} stroke="#5B6779" strokeWidth={1} />
          <line x1={cx - 2} y1={cy + 2} x2={cx + 2} y2={cy - 2} stroke="#5B6779" strokeWidth={1} />
        </g>
      );
    }

    // Selected for comparison
    if (isSelected) {
      return (
        <g key={`dot-sel-${payload.run_id}-${stepName}`}>
          <circle cx={cx} cy={cy} r={8} fill="#22D3EE" fillOpacity={0.25} />
          <circle cx={cx} cy={cy} r={5} fill="#22D3EE" stroke="#E6EDF3" strokeWidth={2} />
        </g>
      );
    }

    // Cliff Change-point on the active line
    if (payload?.isCliff && (selectedStep === 'all' || selectedStep === findingStep)) {
      return (
        <g
          key={`dot-cliff-${payload.run_id}-${stepName}`}
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPanel?.();
          }}
        >
          <circle cx={cx} cy={cy} r={12} fill="#FF5C5C" fillOpacity={0.25} className="animate-ping" />
          <circle cx={cx} cy={cy} r={6} fill="#FF5C5C" stroke="#FFFFFF" strokeWidth={2} />
        </g>
      );
    }

    // Replayed run (demo_replay: true) gets a cyan ring (prompt 7.2)
    if (payload?.demo_replay) {
      return (
        <circle
          key={`dot-replay-${payload.run_id}-${stepName}`}
          cx={cx}
          cy={cy}
          r={4}
          fill={STEP_COLORS[stepName]}
          stroke="#22D3EE"
          strokeWidth={1.5}
        />
      );
    }

    // Standard dot: hidden unless hovered or small dot
    if (selectedStep !== 'all' && selectedStep !== stepName) return <g />;
    return (
      <circle
        key={`dot-std-${payload?.run_id}-${stepName}`}
        cx={cx}
        cy={cy}
        r={2.5}
        fill={STEP_COLORS[stepName]}
        opacity={0.8}
      />
    );
  };

  // Click point to select for comparison
  const handleChartClick = (e: any) => {
    if (!e || !e.activePayload || !e.activePayload[0]) return;
    const clickedRun = e.activePayload[0].payload as Run;
    if (clickedRun.run_id === cliffRunId) {
      onOpenPanel?.();
      return;
    }
    toggleCompareRun(clickedRun.run_id);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Compare A / B Selection Tray */}
      {(compareA || compareB) && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs font-mono animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="text-text-muted">Compare selection:</span>
            <span className="px-2 py-0.5 rounded bg-surface-3 text-accent border border-border font-bold">
              Run A: {compareA || 'click point'}
            </span>
            <span className="text-text-faint">vs</span>
            <span className="px-2 py-0.5 rounded bg-surface-3 text-accent border border-border font-bold">
              Run B: {compareB || 'click point'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {compareA && compareB && (
              <button
                onClick={() => navigate(`/compare?a=${compareA}&b=${compareB}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-bg font-bold hover:bg-accent/90 transition-colors"
              >
                <Columns size={12} />
                <span>Compare A to B</span>
              </button>
            )}
            <button
              onClick={clearCompareSelection}
              className="text-text-muted hover:text-text p-1"
              title="Clear comparison selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="w-full h-[420px] relative select-none">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            onClick={handleChartClick}
            margin={{ top: 25, right: 30, left: 10, bottom: 15 }}
          >
            <defs>
              {/* Success-tinted gradient for "time won back" */}
              <linearGradient id="wonBackFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3DDC97" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3DDC97" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#232C3A" strokeDasharray="3 3" opacity={0.5} />

            <XAxis
              dataKey="run_id"
              stroke="#8B98A9"
              tick={{ fontSize: 12, fill: '#8B98A9', fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: '#232C3A' }}
              interval="preserveStartEnd"
            />

            <YAxis
              stroke="#8B98A9"
              tick={{ fontSize: 12, fill: '#8B98A9', fontFamily: 'JetBrains Mono' }}
              tickLine={{ stroke: '#232C3A' }}
              tickFormatter={(v) => formatDuration(v)}
              domain={['auto', 'dataMax + 20000']}
            />

            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="p-3 rounded-lg bg-surface-2 border border-border-strong shadow-2xl text-xs font-mono min-w-[210px]">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                      <span className="font-bold text-accent">{d.run_id}</span>
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          d.isFailed
                            ? 'bg-danger/20 text-danger border border-danger/30'
                            : 'bg-success/20 text-success border border-success/30'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>

                    <div className="text-text-muted text-[11px] mb-2 flex items-center justify-between">
                      <span>Commit: {sha7(d.commit_sha)}</span>
                      <span>{timeAgo(d.started_at)}</span>
                    </div>

                    {d.isFailed ? (
                      <div className="text-danger text-[11px] py-1">
                        Failed, excluded from baselines
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 py-1">
                        {STEP_ORDER.map((step) => (
                          <div
                            key={step}
                            className={`flex items-center justify-between ${
                              selectedStep === step ? 'font-bold text-text' : 'text-text-muted'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: STEP_COLORS[step] }}
                              />
                              {STEP_LABELS[step]}:
                            </span>
                            <span>{formatDuration(d[step])}</span>
                          </div>
                        ))}
                        <div className="pt-1.5 mt-1 border-t border-border flex items-center justify-between font-bold text-text">
                          <span>Total:</span>
                          <span>{formatDuration(d.raw_total_ms)}</span>
                        </div>
                      </div>
                    )}

                    {d.isCliff && (
                      <div className="mt-2 pt-2 border-t border-danger/30 text-danger font-bold flex items-center gap-1.5">
                        <AlertTriangle size={13} />
                        <span>Cliff change-point (+{formatDuration(finding?.delta_ms)})</span>
                      </div>
                    )}

                    {revertPreview && d.projectedLine && (
                      <div className="mt-1 pt-1 border-t border-success/30 text-success text-[11px]">
                        Projected: {formatDuration(d.projectedLine)} (Won back: ~{formatDuration(d.wonBackArea)})
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {/* Cliff Reference Line with custom marker label */}
            {cliffRunId && (
              <ReferenceLine
                x={cliffRunId}
                stroke="#FF5C5C"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={
                  <CliffMarkerLabel
                    deltaText={formatDelta(finding?.delta_ms)}
                    onClick={onOpenPanel}
                  />
                }
              />
            )}

            {/* Baseline before_ms Reference Line */}
            {baselineBeforeMs && (
              <ReferenceLine
                y={baselineBeforeMs}
                stroke="#5B6779"
                strokeDasharray="3 3"
                label={{
                  value: `baseline: ${formatDuration(baselineBeforeMs)}`,
                  position: 'insideBottomLeft',
                  fill: '#8B98A9',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono',
                }}
              />
            )}

            {/* Auto-revert preview: Shaded area "time won back" (prompt 8.4) */}
            {revertPreview && (
              <Area
                type="monotone"
                dataKey="wonBackArea"
                baseValue={baselineBeforeMs || 0}
                stroke="#3DDC97"
                fill="url(#wonBackFill)"
                isAnimationActive={false}
              />
            )}

            {/* Auto-revert preview: Dashed line at before_ms */}
            {revertPreview && (
              <Line
                type="stepAfter"
                dataKey="projectedLine"
                stroke="#3DDC97"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Projected baseline"
                isAnimationActive={true}
                animationDuration={600}
              />
            )}

            {/* 5 Step Lines (prompt 7.2: thick 2.5px for selected, dimmed 0.15 for others) */}
            {STEP_ORDER.map((step) => {
              const isSelected = selectedStep === step;
              const isDimmed = selectedStep !== 'all' && !isSelected;

              return (
                <Line
                  key={step}
                  type="monotone"
                  dataKey={step}
                  name={STEP_LABELS[step]}
                  stroke={STEP_COLORS[step]}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeOpacity={isDimmed ? 0.15 : 1}
                  connectNulls={false} // Exclude failed points (null)
                  dot={(props) => renderDot(props, step)}
                  activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }}
                  isAnimationActive={false} // Smooth SSE growth without full remount flash
                />
              );
            })}

            {/* Total line when 'all' is selected */}
            {selectedStep === 'all' && (
              <Line
                type="monotone"
                dataKey="total_ms"
                name="Total CI"
                stroke="#A78BFA"
                strokeWidth={2.5}
                connectNulls={false}
                dot={(props) => renderDot(props, 'all')}
                activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
