import React from 'react';
import { STEP_COLORS, STEP_LABELS, STEP_ORDER } from '../../lib/colors';
import { formatDuration } from '../../lib/format';
import type { CompareResponse } from '../../api/types';

interface CompareBarsProps {
  compare: CompareResponse;
}

export const CompareBars: React.FC<CompareBarsProps> = ({ compare }) => {
  const { a, b } = compare;
  const maxTotal = Math.max(a.total_ms || 1, b.total_ms || 1);

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg bg-surface-1 border border-border">
      <div className="flex items-center justify-between text-xs font-mono text-text-muted">
        <span>// step duration comparison</span>
        <span>Relative total scaling</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Side A */}
        <div className="flex flex-col gap-2 p-3 rounded-md bg-surface-2 border border-border">
          <div className="flex justify-between items-baseline text-xs font-mono">
            <span className="text-text font-semibold">{a.label}</span>
            <span className="text-base font-bold text-accent">{formatDuration(a.total_ms)}</span>
          </div>
          <div
            className="h-6 rounded bg-surface-3 flex overflow-hidden border border-border"
            style={{ width: `${(a.total_ms / maxTotal) * 100}%` }}
          >
            {STEP_ORDER.map((step) => {
              const ms = a.steps_ms[step] || 0;
              const pct = (ms / (a.total_ms || 1)) * 100;
              return (
                <div
                  key={`a-${step}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STEP_COLORS[step],
                  }}
                  className="h-full hover:brightness-125 transition-all"
                  title={`${STEP_LABELS[step]}: ${formatDuration(ms)} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="text-[11px] font-mono text-text-faint">
            Runs: {a.run_ids.join(', ')}
          </div>
        </div>

        {/* Side B */}
        <div className="flex flex-col gap-2 p-3 rounded-md bg-surface-2 border border-border">
          <div className="flex justify-between items-baseline text-xs font-mono">
            <span className="text-text font-semibold">{b.label}</span>
            <span className="text-base font-bold text-danger">{formatDuration(b.total_ms)}</span>
          </div>
          <div
            className="h-6 rounded bg-surface-3 flex overflow-hidden border border-border"
            style={{ width: `${(b.total_ms / maxTotal) * 100}%` }}
          >
            {STEP_ORDER.map((step) => {
              const ms = b.steps_ms[step] || 0;
              const pct = (ms / (b.total_ms || 1)) * 100;
              return (
                <div
                  key={`b-${step}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STEP_COLORS[step],
                  }}
                  className="h-full hover:brightness-125 transition-all"
                  title={`${STEP_LABELS[step]}: ${formatDuration(ms)} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="text-[11px] font-mono text-text-faint">
            Runs: {b.run_ids.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
};

