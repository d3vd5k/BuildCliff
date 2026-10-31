import React, { useState } from 'react';
import { Sha } from '../ui/Sha';
import { Package, ChevronDown, ChevronUp } from 'lucide-react';
import { timeAgo } from '../../lib/format';
import type { Suspect } from '../../api/types';

interface SuspectListProps {
  suspects: Suspect[];
  isLowConfidence?: boolean;
}

export const SuspectList: React.FC<SuspectListProps> = ({
  suspects,
  isLowConfidence = false,
}) => {
  const [collapsed, setCollapsed] = useState(!isLowConfidence);

  if (!suspects || suspects.length === 0) return null;

  // In High/Medium confidence with > 1 suspects, show collapsed "Other suspects"
  if (!isLowConfidence && suspects.length > 1) {
    const otherSuspects = suspects.slice(1);
    return (
      <div className="mt-2 border-t border-border pt-2 text-xs">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full text-text-muted hover:text-text font-mono text-[11px] py-1"
        >
          <span>Other candidates in range ({otherSuspects.length})</span>
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>

        {!collapsed && (
          <div className="flex flex-col gap-2 mt-2">
            {otherSuspects.map((s) => (
              <div
                key={s.sha}
                className="p-2.5 rounded bg-surface-2 border border-border flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-text-muted">#{s.rank}</span>
                    <Sha sha={s.sha} />
                  </div>
                  <span className="font-mono text-text-muted text-[11px]">Score: {s.score}</span>
                </div>
                <div className="font-medium text-text text-xs line-clamp-1">{s.message}</div>
                <div className="text-[11px] text-text-faint">{s.author}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Low confidence required view
  const scoreMargin =
    suspects.length >= 2 ? Math.abs(suspects[0].score - suspects[1].score) : 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs">
        <p className="font-medium text-text leading-snug">
          {suspects.length} commits landed between the last good and first slow run. Attribution is uncertain.
        </p>
        {scoreMargin <= 10 && (
          <p className="text-[11px] text-warning mt-1 font-mono">
            ⚠ Top two suspects score within {scoreMargin} points
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {suspects.map((suspect) => (
          <div
            key={suspect.sha}
            className="p-3 rounded-lg bg-surface-2 border border-border hover:border-border-strong transition-colors flex flex-col gap-2"
          >
            {/* Rank, SHA, Score */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-surface-3 text-text-muted font-mono font-bold text-[11px]">
                  #{suspect.rank}
                </span>
                <Sha sha={suspect.sha} />
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-text-muted">Score:</span>
                <strong className="text-accent">{suspect.score}/100</strong>
              </div>
            </div>

            {/* Score Mini Bar */}
            <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-accent/70 rounded-full"
                style={{ width: `${suspect.score}%` }}
              />
            </div>

            {/* Commit Message & Author */}
            <div className="text-xs font-medium text-text">{suspect.message}</div>

            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>{suspect.author}</span>
              <span>{timeAgo(suspect.committed_at)}</span>
            </div>

            {/* Suspect Reason labels */}
            {suspect.reasons && suspect.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-border/50">
                {suspect.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-muted"
                  >
                    {r.label}
                  </span>
                ))}
              </div>
            )}

            {/* Dep Changes */}
            {suspect.dep_changes && suspect.dep_changes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {suspect.dep_changes.map((dc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-danger-soft text-danger border border-danger/30"
                  >
                    <Package size={11} />
                    <span>{dc.name} {dc.from} → {dc.to}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

