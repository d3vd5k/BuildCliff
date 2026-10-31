import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ArrowUpDown, ArrowRight, ShieldCheck } from 'lucide-react';
import { STEP_COLORS, STEP_LABELS } from '../../lib/colors';
import { formatDuration, formatDelta, formatPct, sha7, timeAgo } from '../../lib/format';
import { isNearZero } from '../../lib/stats';
import { useUI } from '../../context/UIContext';
import type { DependencyImpact } from '../../api/types';

interface ImpactTableProps {
  impacts: DependencyImpact[];
  computedAt?: string;
  onRefresh?: () => void;
}

type SortField = 'dep' | 'from' | 'step' | 'delta_ms' | 'delta_pct';

export const ImpactTable: React.FC<ImpactTableProps> = ({
  impacts,
  computedAt,
}) => {
  const navigate = useNavigate();
  const { setSelectedFindingId, setPanelOpen } = useUI();

  const [sortField, setSortField] = useState<SortField>('delta_ms');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default desc: biggest slowdown first

  const sorted = useMemo(() => {
    return [...impacts].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [impacts, sortField, sortAsc]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleRowClick = (impact: DependencyImpact) => {
    if (impact.finding_id) {
      setSelectedFindingId(impact.finding_id);
      setPanelOpen(true);
      navigate('/');
    } else {
      navigate(`/compare?finding_id=${encodeURIComponent(impact.impact_id)}`);
    }
  };

  return (
    <div className="cliff-card overflow-hidden">
      {/* Table Header Bar */}
      <div className="p-4 bg-surface-2 border-b border-border flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Package size={15} className="text-accent" />
          <span className="font-bold text-text">Dependency Performance Shift Matrix</span>
          <span className="text-text-muted">({impacts.length} updates tracked)</span>
        </div>

        {computedAt && (
          <span className="text-text-faint text-[11px]">
            Computed {timeAgo(computedAt)}
          </span>
        )}
      </div>

      {/* Table Element */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-text-muted bg-surface-2/40 select-none">
              <th
                onClick={() => toggleSort('dep')}
                className="py-3 px-4 font-semibold cursor-pointer hover:text-text transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Dependency</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('from')}
                className="py-3 px-4 font-semibold cursor-pointer hover:text-text transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Version Change</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('step')}
                className="py-3 px-4 font-semibold cursor-pointer hover:text-text transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Step Hit</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('delta_ms')}
                className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-text transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Δ Time</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th
                onClick={() => toggleSort('delta_pct')}
                className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-text transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>% Shift</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th className="py-3 px-4 font-semibold text-right">Runs Compared</th>
              <th className="py-3 px-4 font-semibold">Commit</th>
              <th className="py-3 px-4 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sorted.map((row) => {
              const nearZero = isNearZero(row.delta_ms);
              const isSevere = row.delta_ms >= 20000;

              return (
                <tr
                  key={row.impact_id}
                  onClick={() => handleRowClick(row)}
                  className={`group cursor-pointer transition-colors ${
                    nearZero
                      ? 'opacity-50 hover:opacity-90 bg-transparent'
                      : isSevere
                      ? 'bg-danger/5 hover:bg-danger/10'
                      : 'hover:bg-surface-2/60'
                  }`}
                >
                  {/* Dep */}
                  <td className="py-3 px-4">
                    <span className="font-bold text-text group-hover:text-accent transition-colors">
                      {row.dep}
                    </span>
                  </td>

                  {/* Version change */}
                  <td className="py-3 px-4 text-text-muted">
                    <span className="tabular-nums">
                      {row.from} → {row.to}
                    </span>
                  </td>

                  {/* Step Hit */}
                  <td className="py-3 px-4">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold"
                      style={{
                        backgroundColor: `${STEP_COLORS[row.step]}15`,
                        color: STEP_COLORS[row.step],
                        border: `1px solid ${STEP_COLORS[row.step]}40`,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: STEP_COLORS[row.step] }}
                      />
                      <span>{STEP_LABELS[row.step] || row.step}</span>
                    </span>
                  </td>

                  {/* Delta Time */}
                  <td className="py-3 px-4 text-right tabular-nums">
                    <div
                      className={`font-bold ${
                        nearZero
                          ? 'text-text-muted font-normal'
                          : isSevere
                          ? 'text-danger'
                          : row.delta_ms > 0
                          ? 'text-warning'
                          : 'text-success'
                      }`}
                    >
                      {formatDelta(row.delta_ms)}
                    </div>
                    {nearZero && (
                      <span className="text-[10px] text-text-faint flex items-center justify-end gap-1">
                        <ShieldCheck size={10} /> no measurable impact
                      </span>
                    )}
                  </td>

                  {/* Delta Pct */}
                  <td
                    className={`py-3 px-4 text-right tabular-nums font-semibold ${
                      nearZero
                        ? 'text-text-muted font-normal'
                        : isSevere
                        ? 'text-danger'
                        : 'text-text-muted'
                    }`}
                  >
                    {row.delta_pct > 0 ? `+${formatPct(row.delta_pct)}` : formatPct(row.delta_pct)}
                  </td>

                  {/* Runs Compared */}
                  <td className="py-3 px-4 text-right tabular-nums text-text-muted">
                    {row.runs_compared.before} → {row.runs_compared.after}
                  </td>

                  {/* Commit */}
                  <td className="py-3 px-4 text-text-muted">
                    <code className="text-accent text-[11px]">{sha7(row.commit_sha)}</code>
                  </td>

                  {/* Hover Arrow Link */}
                  <td className="py-3 px-4 text-right">
                    <span className="text-text-muted group-hover:text-accent transition-colors">
                      <ArrowRight size={14} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

