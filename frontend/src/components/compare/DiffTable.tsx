import React from 'react';
import { STEP_COLORS, STEP_LABELS } from '../../lib/colors';
import { formatDuration, formatDelta, formatPct } from '../../lib/format';
import { isNearZero } from '../../lib/stats';
import type { DiffRow } from '../../api/types';

interface DiffTableProps {
  diff: DiffRow[];
  total: {
    a_ms: number;
    b_ms: number;
    delta_ms: number;
    delta_pct: number;
  };
  labelA?: string;
  labelB?: string;
}

export const DiffTable: React.FC<DiffTableProps> = ({
  diff,
  total,
  labelA = 'A',
  labelB = 'B',
}) => {
  return (
    <div className="rounded-lg bg-surface-1 border border-border overflow-hidden">
      <div className="p-3 bg-surface-2 border-b border-border text-xs font-mono font-bold text-text">
        // step duration diff matrix
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-text-muted bg-surface-2/60">
              <th className="py-2.5 px-4 font-semibold">Step</th>
              <th className="py-2.5 px-4 font-semibold text-right">{labelA}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{labelB}</th>
              <th className="py-2.5 px-4 font-semibold text-right">Δ (Delta)</th>
              <th className="py-2.5 px-4 font-semibold text-right">% Shift</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {diff.map((row) => {
              const nearZero = isNearZero(row.delta_ms);
              const isDanger = row.delta_ms > 0 && !nearZero;
              const isSuccess = row.delta_ms < 0 && !nearZero;

              const deltaColor = isDanger
                ? 'text-danger font-bold'
                : isSuccess
                ? 'text-success font-bold'
                : 'text-text-muted';

              return (
                <tr
                  key={row.step}
                  className={`hover:bg-surface-2/40 transition-colors ${
                    nearZero ? 'opacity-60' : ''
                  }`}
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: STEP_COLORS[row.step] }}
                      />
                      <span className="font-semibold text-text">
                        {STEP_LABELS[row.step] || row.step}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-text-muted tabular-nums">
                    {formatDuration(row.a_ms)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-text-muted tabular-nums">
                    {formatDuration(row.b_ms)}
                  </td>
                  <td className={`py-2.5 px-4 text-right tabular-nums ${deltaColor}`}>
                    {formatDelta(row.delta_ms)}
                  </td>
                  <td className={`py-2.5 px-4 text-right tabular-nums ${deltaColor}`}>
                    {row.delta_pct > 0 ? `+${formatPct(row.delta_pct)}` : formatPct(row.delta_pct)}
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            <tr className="bg-surface-2 border-t-2 border-border-strong font-bold text-text">
              <td className="py-3 px-4">Total CI Pipeline</td>
              <td className="py-3 px-4 text-right tabular-nums">{formatDuration(total.a_ms)}</td>
              <td className="py-3 px-4 text-right tabular-nums">{formatDuration(total.b_ms)}</td>
              <td className="py-3 px-4 text-right tabular-nums text-danger font-extrabold">
                {formatDelta(total.delta_ms)}
              </td>
              <td className="py-3 px-4 text-right tabular-nums text-danger font-extrabold">
                +{formatPct(total.delta_pct)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

