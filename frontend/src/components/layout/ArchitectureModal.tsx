import React, { useEffect } from 'react';
import { X, Cpu, GitCommit, Database, Radio, DollarSign, Sparkles, CheckCircle2 } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface-1 border border-border rounded-xl shadow-2xl p-6 text-text select-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5 font-mono">
            <span className="text-accent text-lg">▲</span>
            <span className="text-base font-bold text-text">BuildCliff Architecture</span>
            <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-text-muted border border-border">
              v1.0
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="mt-6 flex flex-col gap-6">
          {/* High-level summary */}
          <div className="p-4 rounded-lg bg-surface-2 border border-border text-sm leading-relaxed text-text-muted">
            <span className="text-text font-semibold">BuildCliff</span> continuous observability engine ingests CI runs and git commits in real time, automatically detects sudden regressions (&gt;=25% and &gt;=20s) across 5 pipeline steps (<span className="text-step-checkout font-mono">checkout</span>, <span className="text-step-install font-mono">install</span>, <span className="text-step-build font-mono">build</span>, <span className="text-step-test font-mono">test</span>, <span className="text-step-deploy font-mono">deploy</span>), attributes the culprit commit using dependency diff correlation, and estimates team productivity cost in hours and dollars.
          </div>

          {/* Architecture Pipeline Flow Diagram */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider">
              // Data Pipeline Flow
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-xs">
              {/* Step 1 */}
              <div className="p-3.5 rounded-lg bg-surface-2 border border-border flex flex-col gap-2">
                <div className="flex items-center gap-2 text-accent font-bold">
                  <Database size={15} />
                  <span>1. Ingestion API</span>
                </div>
                <p className="text-[11px] text-text-muted font-sans leading-normal">
                  Ingests pipeline runs & git commits with millisecond step timing validation.
                </p>
                <div className="mt-auto text-[10px] text-text-faint">POST /api/runs</div>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-lg bg-surface-2 border border-border flex flex-col gap-2">
                <div className="flex items-center gap-2 text-warning font-bold">
                  <Cpu size={15} />
                  <span>2. Cliff Detector</span>
                </div>
                <p className="text-[11px] text-text-muted font-sans leading-normal">
                  Compares rolling 10-run baseline median against 5 post-change runs for sustained jumps.
                </p>
                <div className="mt-auto text-[10px] text-text-faint">Threshold: &gt;=25% &amp; &gt;=20s</div>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-lg bg-surface-2 border border-border flex flex-col gap-2">
                <div className="flex items-center gap-2 text-danger font-bold">
                  <GitCommit size={15} />
                  <span>3. Attribution</span>
                </div>
                <p className="text-[11px] text-text-muted font-sans leading-normal">
                  Ranks suspect commits by git log diffs, dependency changes, and file touch heuristics.
                </p>
                <div className="mt-auto text-[10px] text-text-faint">Confidence: High / Med / Low</div>
              </div>

              {/* Step 4 */}
              <div className="p-3.5 rounded-lg bg-surface-2 border border-border flex flex-col gap-2">
                <div className="flex items-center gap-2 text-success font-bold">
                  <Radio size={15} />
                  <span>4. Realtime Stream</span>
                </div>
                <p className="text-[11px] text-text-muted font-sans leading-normal">
                  Server-Sent Events push new runs and live findings directly to Web UI and CLI.
                </p>
                <div className="mt-auto text-[10px] text-text-faint">GET /api/stream (SSE)</div>
              </div>
            </div>
          </div>

          {/* Engine Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-surface-2 border border-border flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent">
                <DollarSign size={14} />
                <span>Productivity &amp; Cloud Cost Engine</span>
              </div>
              <ul className="text-xs text-text-muted space-y-1.5 list-disc list-inside">
                <li>Calculates developer blocking wait time per week: <code className="text-text font-mono">runs_per_week * delta_ms * blocking_fraction</code>.</li>
                <li>Computes dollar impact: runner minutes cost + engineer hourly rate.</li>
                <li>Configurable project assumptions persisted via <code className="text-text font-mono">PATCH /api/projects/:id/assumptions</code>.</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-surface-2 border border-border flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent">
                <Sparkles size={14} />
                <span>LLM Remediation &amp; Fallback</span>
              </div>
              <ul className="text-xs text-text-muted space-y-1.5 list-disc list-inside">
                <li>Generates plain-English root cause summaries and actionable rollback fixes.</li>
                <li>Asynchronous generation: UI instantly highlights regression while LLM stream completes.</li>
                <li>Deterministic heuristic fallback template if LLM service is offline or rate-limited.</li>
              </ul>
            </div>
          </div>

          {/* Demo Story recap */}
          <div className="p-3.5 rounded-lg bg-surface-3/50 border border-border text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-success flex-shrink-0" />
              <span className="text-text-muted">
                Planted Demo Case: <span className="font-mono text-text">puppeteer 21.0.0 &rarr; 22.0.0</span> causes <span className="font-mono text-danger">install</span> step cliff (<span className="font-mono text-danger">+3m20s</span>, +285.7%).
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-surface-2 hover:bg-surface-3 border border-border text-text font-mono text-[11px] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

