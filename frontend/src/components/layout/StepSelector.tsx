import React from 'react';
import { STEP_COLORS, STEP_LABELS, STEP_ORDER } from '../../lib/colors';
import { useUI } from '../../context/UIContext';

interface StepSelectorProps {
  className?: string;
  jumpedStep?: string;
}

export const StepSelector: React.FC<StepSelectorProps> = ({ className = '', jumpedStep }) => {
  const { selectedStep, setSelectedStep } = useUI();

  const options = ['all', ...STEP_ORDER];

  return (
    <div
      role="radiogroup"
      aria-label="Select CI Step"
      className={`inline-flex items-center p-1 rounded-lg bg-surface-2 border border-border gap-1 flex-wrap ${className}`}
    >
      {options.map((step) => {
        const isSelected = selectedStep === step;
        const color = STEP_COLORS[step];
        const isJumped = jumpedStep && step === jumpedStep;

        return (
          <button
            key={step}
            role="radio"
            aria-checked={isSelected}
            onClick={() => setSelectedStep(step)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
              isSelected
                ? 'bg-surface-3 text-text shadow-sm border border-border-strong'
                : 'text-text-muted hover:text-text hover:bg-surface-1 border border-transparent'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span>{STEP_LABELS[step] || step}</span>
            {isJumped && (
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-ping ml-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
};

