import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X, GitCommit, User, Clock, Package, ExternalLink, Columns } from 'lucide-react';
import { Sha } from '../ui/Sha';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SuspectList } from './SuspectList';
import { BreakdownBars } from './BreakdownBars';
import { CostBlock } from './CostBlock';
import { LlmBlock } from './LlmBlock';
import { RevertPreviewControl } from '../timeline/RevertPreviewLayer';
import { STEP_COLORS, STEP_LABELS } from '../../lib/colors';
import { formatDuration, formatPct, timeAgo, formatDelta } from '../../lib/format';
import type { Finding } from '../../api/types';

interface CulpritPanelProps {
  finding: Finding;
  onClose: () => void;
}

export const CulpritPanel: React.FC<CulpritPanelProps> = ({ finding, onClose }) => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  // Close on Escape key (prompt 8.1 & 10)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const {
    step,
    status,
    delta_ms,
    delta_pct,
    before_ms,
    after_ms,
    confidence,
    suspects,
    cost,
    llm,
    finding_id,
  } = finding;

  const isLowConfidence = confidence.level === 'Low';
  const topSuspect = suspects?.[0];

  return (
    <motion.aside
      role="region"
      aria-label="Culprit Attribution Panel"
      initial={shouldReduceMotion ? { opacity: 0 } : { x: 80, opacity: 0 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { x: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      className="cliff-card culprit-glow p-4 md:p-5 flex flex-col gap-4 relative overflow-y-auto max-h-[85vh] select-none"
    >
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-faint font-semibold">// culprit</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
              status === 'active'
                ? 'bg-danger/20 text-danger border border-danger/40'
                : 'bg-success/20 text-success border border-success/40'
            }`}
          >
            {status}
          </span>
          <span
            className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{
              backgroundColor: `${STEP_COLORS[step]}20`,
              color: STEP_COLORS[step],
              border: `1px solid ${STEP_COLORS[step]}40`,
            }}
          >
            {STEP_LABELS[step] || step}
          </span>
        </div>

        <button
          onClick={onClose}
          className="text-text-muted hover:text-text p-1 rounded hover:bg-surface-2 transition-colors"
          title="Close panel (Esc)"
          aria-label="Close culprit panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* 2. Hero Delta */}
      <div className="flex flex-col gap-1">
        <div className="text-4xl md:text-5xl font-mono font-extrabold text-danger tracking-tight tabular-nums">
          {formatDelta(delta_ms)}
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
          <span>{formatDuration(before_ms)} → {formatDuration(after_ms)}</span>
          <span className="text-border-strong">•</span>
          <span className="text-danger font-bold">+{formatPct(delta_pct)}</span>
        </div>
      </div>

      {/* 3. Culprit Commit Card (or SuspectList for Low confidence) */}
      {!isLowConfidence && topSuspect ? (
        <div className="p-3.5 rounded-lg bg-surface-2 border border-border flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCommit size={14} className="text-accent" />
              <Sha sha={topSuspect.sha} />
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              Attribution: <strong className="text-accent">{topSuspect.score}/100</strong>
            </span>
          </div>

          <div className="text-sm font-semibold text-text leading-snug">
            {topSuspect.message}
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted font-sans">
            <span className="flex items-center gap-1.5">
              <User size={13} className="text-text-faint" />
              <span>{topSuspect.author}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-mono">
              <Clock size={12} className="text-text-faint" />
              <span>{timeAgo(topSuspect.committed_at)}</span>
            </span>
          </div>

          {topSuspect.dep_changes && topSuspect.dep_changes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 pt-2 border-t border-border">
              {topSuspect.dep_changes.map((dc, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-danger-soft text-danger border border-danger/30"
                >
                  <Package size={12} />
                  <span>{dc.name} {dc.from} → {dc.to}</span>
                </span>
              ))}
            </div>
          )}

          {/* Secondary suspects if any */}
          <SuspectList suspects={suspects} isLowConfidence={false} />
        </div>
      ) : (
        /* Low confidence: show Ranked Candidate list */
        <SuspectList suspects={suspects} isLowConfidence={true} />
      )}

      {/* 4. ConfidenceBadge with Reason Chips */}
      <ConfidenceBadge confidence={confidence} />

      {/* 5. Breakdown Bars */}
      <BreakdownBars finding={finding} />

      {/* 6. Revert Preview Toggle */}
      <RevertPreviewControl findingStep={step} />

      {/* 7. Cost Block with Editable Assumptions */}
      <CostBlock cost={cost} projectId={finding.project_id} />

      {/* 8. LLM Suggested Fix & Channel Summary */}
      <LlmBlock llm={llm} />

      {/* 9. Footer Action Links (prompt 8.1 item 10) */}
      <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-mono">
        <button
          onClick={() => navigate(`/compare?finding_id=${encodeURIComponent(finding_id)}`)}
          className="inline-flex items-center gap-1.5 text-accent hover:text-accent/80 font-bold transition-colors"
        >
          <Columns size={13} />
          <span>Compare before and after</span>
        </button>

        <button
          onClick={() => navigate('/dependencies')}
          className="inline-flex items-center gap-1.5 text-text-muted hover:text-text transition-colors"
        >
          <span>View dependency impact</span>
          <ExternalLink size={12} />
        </button>
      </div>
    </motion.aside>
  );
};

