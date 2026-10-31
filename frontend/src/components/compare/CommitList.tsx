import React from 'react';
import { GitCommit } from 'lucide-react';
import { Sha } from '../ui/Sha';
import { timeAgo } from '../../lib/format';
import type { CommitBetween } from '../../api/types';

interface CommitListProps {
  commits: CommitBetween[];
}

export const CommitList: React.FC<CommitListProps> = ({ commits }) => {
  return (
    <div className="rounded-lg bg-surface-1 border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="font-bold text-text flex items-center gap-1.5">
          <GitCommit size={14} className="text-accent" />
          <span>Commits Landed in Window ({commits.length})</span>
        </span>
      </div>

      {commits.length === 0 ? (
        <div className="text-xs text-text-faint p-4 text-center font-mono">
          No commits recorded between selected runs.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {commits.map((c) => (
            <div
              key={c.sha}
              className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-colors ${
                c.is_suspect
                  ? 'bg-danger-soft border-danger/40 shadow-[0_0_12px_rgba(255,92,92,0.15)]'
                  : 'bg-surface-2 border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sha sha={c.sha} />
                  {c.is_suspect && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-danger/20 text-danger border border-danger/40 uppercase">
                      Suspect #{c.suspect_rank || 1}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-text-muted">
                  {timeAgo(c.committed_at)}
                </span>
              </div>

              <div className="text-xs font-semibold text-text">{c.message}</div>

              <div className="text-[11px] text-text-muted">{c.author}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

