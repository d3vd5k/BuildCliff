import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text, label, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className={`inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors p-1 rounded hover:bg-surface-2 focus-visible:ring-1 focus-visible:ring-accent ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      {label && <span>{copied ? 'Copied ✓' : label}</span>}
    </button>
  );
};

