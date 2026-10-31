import React from 'react';
import { Toggle } from '../ui/Toggle';
import { useUI } from '../../context/UIContext';
import { ArrowRight } from 'lucide-react';

interface RevertPreviewLayerProps {
  findingStep: string;
}

export const RevertPreviewControl: React.FC<RevertPreviewLayerProps> = ({ findingStep }) => {
  const { revertPreview, setRevertPreview, selectedStep, setSelectedStep } = useUI();

  const isStepMatching = selectedStep === findingStep || selectedStep === 'all';

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-border">
      <div className="flex flex-col gap-1">
        <Toggle
          checked={revertPreview}
          onChange={setRevertPreview}
          label="Auto-revert preview"
          badge="PROJECTED"
        />
        <span className="text-[11px] text-text-muted">
          Projects CI baseline if the culprit commit is reverted
        </span>
      </div>

      {!isStepMatching && revertPreview && (
        <button
          onClick={() => setSelectedStep(findingStep)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-accent bg-accent-soft border border-accent/30 rounded hover:bg-accent/20 transition-colors"
        >
          <span>Switch to {findingStep}</span>
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
};

