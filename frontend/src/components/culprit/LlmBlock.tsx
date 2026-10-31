import React from 'react';
import { Sparkles, Terminal } from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { Skeleton } from '../ui/Skeleton';
import type { Llm } from '../../api/types';

interface LlmBlockProps {
  llm: Llm | null;
}

export const LlmBlock: React.FC<LlmBlockProps> = ({ llm }) => {
  // Skeleton shimmer state when finding.llm === null initially (prompt 8.1 item 9)
  if (!llm) {
    return (
      <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-surface-2 border border-border">
        <div className="flex items-center gap-2 text-xs font-mono text-accent">
          <Sparkles size={13} className="animate-spin" />
          <span>Generating root cause analysis & fix…</span>
        </div>
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-3/4 h-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-surface-2 border border-border text-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-text flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" />
          <span>Suggested Remediation</span>
        </span>
        {llm.source === 'template' && (
          <span className="text-[10px] font-mono text-text-faint uppercase px-1.5 py-0.5 rounded bg-surface-3">
            template
          </span>
        )}
      </div>

      {/* Suggested Fix */}
      <p className="text-text leading-relaxed font-sans text-xs">
        {llm.suggested_fix}
      </p>

      {/* Channel Summary (Slack/Teams broadcast quote block) */}
      {llm.channel_summary && (
        <div className="mt-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
            <span className="flex items-center gap-1">
              <Terminal size={11} />
              <span>Channel Summary</span>
            </span>
            <CopyButton text={llm.channel_summary} label="Copy summary" />
          </div>

          <div className="p-2.5 rounded bg-surface-3 border border-border-strong font-mono text-xs text-text-muted select-all leading-normal">
            {llm.channel_summary}
          </div>
        </div>
      )}
    </div>
  );
};

