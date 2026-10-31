import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { sha7 } from '../../lib/format';
import { Tooltip } from './Tooltip';

interface ShaProps {
  sha: string | null | undefined;
  className?: string;
}

export const Sha: React.FC<ShaProps> = ({ sha, className = '' }) => {
  const [copied, setCopied] = useState(false);

  if (!sha) return <span className="font-mono text-text-faint">—</span>;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sha);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tooltip content={sha}>
      <span
        onClick={handleCopy}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs bg-surface-2 hover:bg-surface-3 text-accent border border-border cursor-pointer transition-colors group ${className}`}
        title="Click to copy SHA"
      >
        <span>{sha7(sha)}</span>
        {copied ? (
          <Check size={11} className="text-success" />
        ) : (
          <Copy size={11} className="text-text-muted group-hover:text-accent opacity-75" />
        )}
      </span>
    </Tooltip>
  );
};

