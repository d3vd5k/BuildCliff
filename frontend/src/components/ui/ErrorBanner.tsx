import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  field?: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  field,
  onRetry,
  onDismiss,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 p-3 rounded-lg bg-danger-soft border border-danger/40 text-danger text-sm ${className}`}
    >
      <div className="flex items-center gap-2">
        <AlertCircle size={16} className="flex-shrink-0" />
        <span>
          {field && <strong className="font-mono mr-1.5">{field}:</strong>}
          {message}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-danger/20 hover:bg-danger/30 text-text transition-colors"
          >
            <RefreshCw size={12} /> Retry
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="text-danger hover:text-white p-1">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

