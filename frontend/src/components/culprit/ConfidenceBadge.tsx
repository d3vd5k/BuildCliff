import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { CONFIDENCE_COLORS } from '../../lib/colors';
import { ReasonChip } from './ReasonChip';
import type { Confidence } from '../../api/types';

interface ConfidenceBadgeProps {
  confidence: Confidence;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ confidence }) => {
  const { level, score, jump_score, attribution_score, reasons } = confidence;
  const colors = CONFIDENCE_COLORS[level] || CONFIDENCE_COLORS.High;

  const icon = {
    High: <ShieldCheck size={16} />,
    Medium: <AlertTriangle size={16} />,
    Low: <ShieldAlert size={16} />,
  }[level];

  return (
    <div className="flex flex-col gap-2.5">
      {/* Badge Header Row */}
      <div className="flex items-center justify-between">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider border shadow-sm"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
          }}
        >
          {icon}
          <span>
            {level} · {score}%
          </span>
        </div>

        {/* Sub-bars: Jump & Attribution */}
        {jump_score != null && attribution_score != null && (
          <div className="flex items-center gap-3 text-[11px] font-mono text-text-muted">
            <span title="Persistence across confirm window & separation from baseline">
              Jump: <strong className="text-text">{jump_score}</strong>
            </span>
            <span className="text-border-strong">•</span>
            <span title="Culprit commit attribution score">
              Attr: <strong className="text-text">{attribution_score}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Progress score bar */}
      <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden border border-border/50">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${score}%`,
            backgroundColor: colors.text,
          }}
        />
      </div>

      {/* Reason Chips list */}
      {reasons && reasons.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          {reasons.map((r, i) => (
            <ReasonChip key={`${r.code}-${i}`} reason={r} />
          ))}
        </div>
      )}
    </div>
  );
};

