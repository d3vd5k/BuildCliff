import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, Clock, Users, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { formatHours, formatUsd } from '../../lib/format';
import { useProject } from '../../hooks/useProject';
import { useUI } from '../../context/UIContext';
import type { Cost, Assumptions } from '../../api/types';

interface CostBlockProps {
  cost: Cost;
  projectId?: string;
}

export const CostBlock: React.FC<CostBlockProps> = ({ cost, projectId = 'demo-app' }) => {
  const { revertPreview } = useUI();
  const { updateAssumptions, isUpdatingAssumptions } = useProject(projectId);

  const [expanded, setExpanded] = useState(false);
  const [runnerCost, setRunnerCost] = useState(cost.assumptions.runner_cost_per_min_usd);
  const [engCost, setEngCost] = useState(cost.assumptions.engineer_cost_per_hour_usd);
  const [blockingFrac, setBlockingFrac] = useState(cost.assumptions.blocking_fraction);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync when cost props change
  useEffect(() => {
    setRunnerCost(cost.assumptions.runner_cost_per_min_usd);
    setEngCost(cost.assumptions.engineer_cost_per_hour_usd);
    setBlockingFrac(cost.assumptions.blocking_fraction);
  }, [cost.assumptions]);

  const debounceTimer = useRef<any>(null);

  const triggerPatch = (patch: Partial<Assumptions>) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        setValidationError(null);
        await updateAssumptions(patch);
      } catch (err: any) {
        setValidationError(err.message || 'Failed to update assumptions');
      }
    }, 500);
  };

  const handleRunnerChange = (v: number) => {
    if (v < 0) {
      setValidationError('Runner cost must be >= 0');
      return;
    }
    setRunnerCost(v);
    triggerPatch({ runner_cost_per_min_usd: v });
  };

  const handleEngCostChange = (v: number) => {
    if (v < 0) {
      setValidationError('Engineer cost must be >= 0');
      return;
    }
    setEngCost(v);
    triggerPatch({ engineer_cost_per_hour_usd: v });
  };

  const handleBlockingChange = (v: number) => {
    if (v < 0 || v > 1) {
      setValidationError('Blocking fraction must be between 0 and 1');
      return;
    }
    setBlockingFrac(v);
    triggerPatch({ blocking_fraction: v });
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-surface-2 border border-border">
      {/* Header & Revert Headline */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono font-bold text-text flex items-center gap-1.5">
          <DollarSign size={14} className="text-accent" />
          <span>Financial Impact</span>
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-text-muted hover:text-text font-mono text-[11px] flex items-center gap-1"
        >
          <span>{expanded ? 'Hide model' : 'Edit assumptions'}</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Main Headline (Switches to Revert Recovery when Revert Preview is ON) */}
      {revertPreview ? (
        <div className="p-3 rounded-lg bg-success-soft border border-success/40 animate-in fade-in">
          <div className="flex items-center gap-2 text-success font-mono font-bold text-lg md:text-xl">
            <Sparkles size={18} />
            <span>
              Reverting recovers ~{formatHours(cost.recovered_hours_per_week_if_reverted || cost.extra_ci_hours_per_week)}/week
            </span>
          </div>
          <div className="text-xs font-mono text-success/80 mt-1">
            Recovers {formatUsd(cost.total_cost_usd_per_week)}/wk across {cost.runs_per_week} runs/wk
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Headline: Engineer Waiting Time */}
          <div className="flex items-baseline justify-between">
            <div className="text-2xl md:text-3xl font-mono font-bold text-danger">
              {formatHours(cost.engineer_wait_hours_per_week)}/wk
            </div>
            <div className="font-mono font-semibold text-lg text-text">
              {formatUsd(cost.engineer_cost_usd_per_week)}/wk
            </div>
          </div>
          <span className="text-[11px] text-text-muted">
            Engineer waiting time (share of CI runs blocking developers)
          </span>
        </div>
      )}

      {/* Secondary Metrics Table */}
      <div className={`grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs font-mono ${revertPreview ? 'opacity-50' : ''}`}>
        <div>
          <span className="text-text-muted text-[11px]">Extra CI Hours:</span>
          <div className="text-text font-semibold">{formatHours(cost.extra_ci_hours_per_week)}/wk</div>
        </div>
        <div>
          <span className="text-text-muted text-[11px]">Runner Spend:</span>
          <div className="text-text font-semibold">{formatUsd(cost.runner_cost_usd_per_week)}/wk</div>
        </div>
        <div>
          <span className="text-text-muted text-[11px]">Total Impact:</span>
          <div className="text-accent font-bold">{formatUsd(cost.total_cost_usd_per_week)}/wk</div>
        </div>
        <div>
          <span className="text-text-muted text-[11px]">Run Volume:</span>
          <div className="text-text font-semibold">{cost.runs_per_week} runs/wk</div>
        </div>
      </div>

      {isUpdatingAssumptions && (
        <div className="text-[11px] font-mono text-accent animate-pulse">
          // recomputing cost model…
        </div>
      )}

      {validationError && (
        <div className="text-[11px] font-mono text-danger">
          ⚠ {validationError}
        </div>
      )}

      {/* Inline Editable Assumptions Form */}
      {expanded && (
        <div className="flex flex-col gap-3 pt-3 border-t border-border mt-1 animate-in slide-in-from-top-2 text-xs font-mono">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-text-muted">
              <span>Runner cost ($/min):</span>
              <span className="text-text font-bold">${runnerCost}</span>
            </div>
            <input
              type="number"
              step="0.001"
              min="0"
              value={runnerCost}
              onChange={(e) => handleRunnerChange(parseFloat(e.target.value) || 0)}
              className="px-2 py-1 rounded bg-surface-3 border border-border text-text font-mono text-xs focus:border-accent outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-text-muted">
              <span>Engineer cost ($/hr):</span>
              <span className="text-text font-bold">${engCost}/hr</span>
            </div>
            <input
              type="number"
              step="1"
              min="0"
              value={engCost}
              onChange={(e) => handleEngCostChange(parseFloat(e.target.value) || 0)}
              className="px-2 py-1 rounded bg-surface-3 border border-border text-text font-mono text-xs focus:border-accent outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-text-muted">
              <span>Blocking fraction:</span>
              <span className="text-text font-bold">{Math.round(blockingFrac * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={blockingFrac}
              onChange={(e) => handleBlockingChange(parseFloat(e.target.value))}
              className="accent-accent cursor-pointer"
            />
            <span className="text-[10px] text-text-faint">
              Share of CI time an engineer waits (default 50%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

