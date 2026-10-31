import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect' }) => {
  const variantStyles = {
    rect: 'rounded-md',
    circle: 'rounded-full',
    text: 'rounded h-4',
  }[variant];

  return (
    <div
      className={`animate-pulse bg-surface-2 border border-border/50 ${variantStyles} ${className}`}
    />
  );
};

