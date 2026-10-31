import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center font-medium rounded-md transition-all duration-150 cursor-pointer select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary:
      'bg-accent text-bg border-accent font-semibold hover:bg-accent/90 shadow-[0_0_15px_rgba(34,211,238,0.35)]',
    secondary:
      'bg-surface-2 text-text border-border hover:bg-surface-3 hover:border-border-strong text-text-muted hover:text-text',
    danger:
      'bg-danger/15 text-danger border-danger/30 hover:bg-danger/25',
    ghost:
      'bg-transparent text-text-muted border-transparent hover:bg-surface-2 hover:text-text',
  }[variant];

  const sizes = {
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3.5 py-1.5 gap-2',
    lg: 'text-base px-4 py-2 gap-2.5',
  }[size];

  return (
    <button className={`${base} ${variants} ${sizes} ${className}`} disabled={disabled} {...props}>
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

