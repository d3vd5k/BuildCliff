import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  variant?: 'positive' | 'negative' | 'neutral';
}

export const Chip: React.FC<ChipProps> = ({
  children,
  icon,
  className = '',
  variant = 'neutral',
}) => {
  const styles = {
    positive: 'bg-success/10 text-text border-success/30 border-l-2 border-l-success',
    negative: 'bg-danger/10 text-text border-danger/30 border-l-2 border-l-danger',
    neutral: 'bg-surface-2 text-text-muted border-border',
  }[variant];

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border ${styles} ${className}`}>
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="leading-snug">{children}</span>
    </div>
  );
};

