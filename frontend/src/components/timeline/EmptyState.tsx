import React from 'react';
import { CheckCircle2, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { useReplay } from '../../hooks/useReplay';

interface EmptyStateProps {
  runCount?: number;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ runCount = 20 }) => {
  const { startReplay, isReplaying } = useReplay();

  return (
    <div className="cliff-card p-10 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-8">
      <div className="w-14 h-14 rounded-full bg-success/10 border border-success/30 flex items-center justify-center text-success mb-4 shadow-[0_0_20px_rgba(61,220,151,0.2)]">
        <CheckCircle2 size={32} />
      </div>

      <h3 className="text-xl font-bold text-text mb-2 tracking-tight">
        No regression detected
      </h3>

      <p className="text-sm text-text-muted mb-6">
        Your last {runCount} runs look healthy. All step durations are within baseline bounds.
      </p>

      <div className="p-4 rounded-lg bg-surface-2 border border-border w-full text-xs text-text-muted flex flex-col items-center gap-3">
        <span>Ready for demonstration?</span>
        <Button
          variant="primary"
          size="sm"
          onClick={startReplay}
          disabled={isReplaying}
          icon={<Play size={13} fill="currentColor" />}
          className="font-mono"
        >
          {isReplaying ? 'Replay in progress…' : 'Replay the cliff'}
        </Button>
      </div>
    </div>
  );
};

