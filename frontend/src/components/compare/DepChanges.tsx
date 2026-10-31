import React from 'react';
import { Package } from 'lucide-react';
import { Sha } from '../ui/Sha';
import type { DepChange } from '../../api/types';

interface DepChangesProps {
  depChanges: DepChange[];
}

export const DepChanges: React.FC<DepChangesProps> = ({ depChanges }) => {
  return (
    <div className="rounded-lg bg-surface-1 border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="font-bold text-text flex items-center gap-1.5">
          <Package size={14} className="text-warning" />
          <span>Dependency Version Shifts ({depChanges.length})</span>
        </span>
      </div>

      {depChanges.length === 0 ? (
        <div className="text-xs text-text-faint p-4 text-center font-mono">
          No dependency changes between these points.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {depChanges.map((dc, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-surface-2 border border-border flex items-center justify-between text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-text">{dc.name}</span>
                <span className="text-danger font-semibold">
                  {dc.from} → {dc.to}
                </span>
              </div>

              {dc.commit_sha && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-muted">commit:</span>
                  <Sha sha={dc.commit_sha} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

