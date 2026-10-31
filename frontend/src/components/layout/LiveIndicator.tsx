import React from 'react';

interface LiveIndicatorProps {
  connected: boolean;
}

export const LiveIndicator: React.FC<LiveIndicatorProps> = ({ connected }) => {
  return (
    <div
      role="status"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-colors ${
        connected
          ? 'bg-success/10 text-success border-success/30'
          : 'bg-surface-2 text-text-faint border-border'
      }`}
      title={connected ? 'SSE EventStream active' : 'EventStream offline'}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-success animate-pulse' : 'bg-text-faint'
        }`}
      />
      <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
    </div>
  );
};

