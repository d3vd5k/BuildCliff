import React from 'react';

interface BadgeProps {
  variant?: 'danger' | 'success' | 'warning' | 'accent' | 'neutral';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  className = '',
}) => {
  const variantStyles = {
    danger: 'bg-danger/10 text-danger border-danger/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    accent: 'bg-accent/10 text-accent border-accent/30',
    neutral: 'bg-surface-2 text-text-muted border-border',
  }[variant];

  const sizeStyles = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-mono font-medium border ${variantStyles} ${sizeStyles} ${className}`}
    >
      {children}
    </span>
  );
};

