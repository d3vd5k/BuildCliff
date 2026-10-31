import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  badge?: string;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  badge,
  disabled = false,
}) => {
  return (
    <label
      className={`inline-flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out border ${
          checked ? 'bg-success/20 border-success' : 'bg-surface-2 border-border'
        }`}
      >
        <div
          className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-4 bg-success' : 'translate-x-0 bg-text-muted'
          }`}
        />
      </div>
      {label && <span className="text-text-muted hover:text-text transition-colors">{label}</span>}
      {badge && (
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-accent border border-border">
          {badge}
        </span>
      )}
    </label>
  );
};

