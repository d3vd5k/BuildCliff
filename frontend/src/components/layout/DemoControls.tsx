import React from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { useUI } from '../../context/UIContext';
import { useReplay } from '../../hooks/useReplay';

export const DemoControls: React.FC = () => {
  const { replayProgress, setRevertPreview } = useUI();
  const { isReplaying, startReplay, resetDemo, toastMessage, clearToast } = useReplay();

  const handleReset = async () => {
    if (isReplaying) {
      if (!window.confirm('Replay is currently in progress. Reset anyway?')) {
        return;
      }
    }
    setRevertPreview(false);
    await resetDemo();
  };

  const stepIndex = replayProgress?.step_index ?? 0;
  const totalSteps = replayProgress?.total_steps ?? 6;

  return (
    <div className="relative flex items-center gap-2">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          className="absolute -bottom-10 right-0 z-50 px-3 py-1 text-xs font-mono bg-surface-2 border border-border-strong text-text rounded shadow-xl whitespace-nowrap animate-in fade-in"
          onClick={clearToast}
        >
          {toastMessage}
        </div>
      )}

      {/* Replay the cliff button with progress */}
      <div className="relative">
        <Button
          variant="primary"
          size="sm"
          onClick={startReplay}
          disabled={isReplaying}
          className="font-mono min-w-[155px]"
          title="Replay the puppeteer cliff live (+200s install)"
        >
          <Play size={13} fill={isReplaying ? 'none' : 'currentColor'} />
          <span>
            {isReplaying ? `Replaying ${stepIndex}/${totalSteps}` : 'Replay the cliff'}
          </span>
        </Button>

        {/* Segmented 6-step progress bar */}
        {isReplaying && (
          <div
            role="status"
            aria-label={`Replaying step ${stepIndex} of ${totalSteps}`}
            className="absolute -bottom-1.5 left-0 right-0 h-1 bg-surface-3 rounded-full overflow-hidden flex gap-0.5 p-0.5"
          >
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-full rounded-sm transition-colors duration-300 ${
                  i < stepIndex ? 'bg-accent shadow-[0_0_8px_#22D3EE]' : 'bg-surface-2'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reset button */}
      <Button
        variant="secondary"
        size="sm"
        onClick={handleReset}
        disabled={isReplaying}
        className="font-mono"
        title="Reset demo runs and restore healthy baseline"
      >
        <RotateCcw size={13} />
        <span>Reset</span>
      </Button>
    </div>
  );
};

