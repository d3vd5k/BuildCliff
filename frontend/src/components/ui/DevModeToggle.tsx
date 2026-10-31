import React, { useState, useEffect } from 'react';
import { Database, Wrench } from 'lucide-react';
import { getUseMocks, setUseMocks } from '../../api/client';
import { mockAdapter } from '../../api/mockAdapter';

export const DevModeToggle: React.FC = () => {
  const [isMocks, setIsMocks] = useState(getUseMocks());
  const [variant, setVariant] = useState<'High' | 'Low' | 'Clean'>(mockAdapter.getConfidenceVariant());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleToggle = (e: any) => {
      setIsMocks(e.detail.useMocks);
    };
    window.addEventListener('buildcliff:mock-toggle', handleToggle);
    return () => window.removeEventListener('buildcliff:mock-toggle', handleToggle);
  }, []);

  const handleToggleMode = () => {
    const next = !isMocks;
    setIsMocks(next);
    setUseMocks(next);
  };

  const handleVariant = (v: 'High' | 'Low' | 'Clean') => {
    setVariant(v);
    mockAdapter.setConfidenceVariant(v);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 font-mono text-xs select-none">
      <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface-1/90 backdrop-blur border border-border shadow-2xl">
        <button
          onClick={handleToggleMode}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold transition-all ${
            isMocks
              ? 'bg-accent/20 text-accent border border-accent/40'
              : 'bg-success/20 text-success border border-success/40'
          }`}
          title="Toggle between Mock data and Live backend API"
        >
          <Database size={13} />
          <span>{isMocks ? 'MODE: MOCK' : 'MODE: LIVE'}</span>
        </button>

        {isMocks && (
          <div className="flex items-center gap-1 pl-1 border-l border-border">
            <button
              onClick={() => handleVariant('High')}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                variant === 'High'
                  ? 'bg-success/20 text-success font-bold border border-success/30'
                  : 'text-text-muted hover:text-text'
              }`}
              title="High confidence planted cliff"
            >
              High
            </button>
            <button
              onClick={() => handleVariant('Low')}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                variant === 'Low'
                  ? 'bg-danger/20 text-danger font-bold border border-danger/30'
                  : 'text-text-muted hover:text-text'
              }`}
              title="Low confidence 3-commit range"
            >
              Low
            </button>
            <button
              onClick={() => handleVariant('Clean')}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                variant === 'Clean'
                  ? 'bg-accent/20 text-accent font-bold border border-accent/30'
                  : 'text-text-muted hover:text-text'
              }`}
              title="Clean empty state (no regression)"
            >
              Clean
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

