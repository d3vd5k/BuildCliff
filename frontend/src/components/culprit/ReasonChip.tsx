import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import type { ConfidenceReason } from '../../api/types';

interface ReasonChipProps {
  reason: ConfidenceReason;
}

export const ReasonChip: React.FC<ReasonChipProps> = ({ reason }) => {
  const isPositive = reason.polarity === 'positive';

  return (
    <Tooltip content={`Code: ${reason.code}`}>
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border leading-tight ${
          isPositive
            ? 'bg-success/10 text-text border-success/30 border-l-2 border-l-success'
            : 'bg-warning/10 text-text border-warning/30 border-l-2 border-l-warning'
        }`}
      >
        <span className="flex-shrink-0">
          {isPositive ? (
            <Check size={13} className="text-success stroke-[2.5]" />
          ) : (
            <AlertTriangle size={13} className="text-warning stroke-[2.5]" />
          )}
        </span>
        <span className="font-sans text-[12px]">{reason.label}</span>
      </div>
    </Tooltip>
  );
};

