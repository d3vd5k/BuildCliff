import React from 'react';
import { formatDelta } from '../../lib/format';

interface DeltaProps {
  ms: number | null | undefined;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

export const Delta: React.FC<DeltaProps> = ({ ms, className = '', size = 'md' }) => {
  if (ms == null) return <span className="font-mono text-text-muted">—</span>;

  const isPositive = ms > 0;
  const isNegative = ms < 0;

  const colorClass = isPositive
    ? 'text-danger'
    : isNegative
    ? 'text-success'
    : 'text-text-muted';

  const sizeClass = {
    sm: 'text-xs',
    md: 'text-sm font-semibold',
    lg: 'text-lg font-bold',
    hero: 'text-4xl md:text-5xl font-extrabold tracking-tight',
  }[size];

  return (
    <span className={`font-mono tabular-nums ${colorClass} ${sizeClass} ${className}`}>
      {formatDelta(ms)}
    </span>
  );
};

