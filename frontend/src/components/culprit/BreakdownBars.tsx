import React, { useMemo } from 'react';
import { STEP_COLORS, STEP_LABELS, STEP_ORDER } from '../../lib/colors';
import { formatDuration, formatDelta } from '../../lib/format';
import type { Finding } from '../../api/types';

interface BreakdownBarsProps {
  finding: Finding;
}

export const BreakdownBars: React.FC<BreakdownBarsProps> = ({ finding }) => {
  const { breakdown, step: jumpedStep } = finding;

  const totalBefore = useMemo(() => {
    return Object.values(breakdown.before_ms).reduce((a, b) => a + b, 0);
  }, [breakdown.before_ms]);

  const totalAfter = useMemo(() => {
    return Object.values(breakdown.after_ms).reduce((a, b) => a + b, 0);
  }, [breakdown.after_ms]);

  const maxTotal = Math.max(totalBefore, totalAfter);

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface-2 border border-border">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono font-bold text-text">Median Breakdown</span>
        <span className="font-mono text-[11px] text-text-muted">
          Jumped step: <strong className="text-danger">{jumpedStep}</strong>
        </span>
      </div>

      {/* Before Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[11px] font-mono">
          <span className="text-text-muted">Typical before ({finding.runs_before} runs)</span>
          <span className="text-text font-bold">{formatDuration(totalBefore)}</span>
        </div>
        <div
          className="h-5 rounded bg-surface-3 flex overflow-hidden border border-border"
          style={{ width: `${(totalBefore / maxTotal) * 100}%` }}
        >
          {STEP_ORDER.map((step) => {
            const ms = breakdown.before_ms[step] || 0;
            const pct = (ms / totalBefore) * 100;
            const isJumped = step === jumpedStep;
            return (
              <div
                key={`before-${step}`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: STEP_COLORS[step],
                  opacity: isJumped ? 1 : 0.55,
                }}
                className={`h-full transition-all relative ${
                  isJumped ? 'ring-1 ring-danger z-10' : ''
                }`}
                title={`Before ${STEP_LABELS[step]}: ${formatDuration(ms)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* After Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[11px] font-mono">
          <span className="text-danger">Typical after ({finding.runs_after} runs)</span>
          <span className="text-danger font-bold">{formatDuration(totalAfter)}</span>
        </div>
        <div
          className="h-5 rounded bg-surface-3 flex overflow-hidden border border-border"
          style={{ width: `${(totalAfter / maxTotal) * 100}%` }}
        >
          {STEP_ORDER.map((step) => {
            const ms = breakdown.after_ms[step] || 0;
            const pct = (ms / totalAfter) * 100;
            const isJumped = step === jumpedStep;
            return (
              <div
                key={`after-${step}`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: STEP_COLORS[step],
                  opacity: isJumped ? 1 : 0.55,
                }}
                className={`h-full transition-all relative ${
                  isJumped ? 'ring-1 ring-white z-10 shadow-[0_0_8px_#FF5C5C]' : ''
                }`}
                title={`After ${STEP_LABELS[step]}: ${formatDuration(ms)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* Step Deltas List */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t border-border/60 text-[11px] font-mono">
        {STEP_ORDER.map((step) => {
          const delta = (breakdown.after_ms[step] || 0) - (breakdown.before_ms[step] || 0);
          const isJumped = step === jumpedStep;
          return (
            <div
              key={step}
              className={`flex items-center justify-between p-1 rounded ${
                isJumped ? 'bg-danger-soft border border-danger/30 text-danger' : 'text-text-muted'
              }`}
            >
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STEP_COLORS[step] }} />
                {STEP_LABELS[step]}:
              </span>
              <span className={delta > 5000 ? 'text-danger font-bold' : ''}>
                {formatDelta(delta)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

