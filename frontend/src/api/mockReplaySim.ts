import findingHighJson from '../../../mocks/finding_high.json';
import type { Finding, Run, Assumptions, DemoProgressEvent } from './types';

export class ApiClientError extends Error {
  code: string;
  field: string | null;
  status: number;

  constructor(message: string, code = 'INTERNAL_ERROR', field: string | null = null, status = 500) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

type EventCallback = (data: any) => void;

class MockReplaySim {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private isReplaying = false;
  private replayedRuns: Run[] = [];
  private activeFinding: Finding | null = JSON.parse(JSON.stringify(findingHighJson));
  private replayTimeout: any = null;

  on(event: string, cb: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return () => {
      this.listeners.get(event)?.delete(cb);
    };
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[mockReplaySim] Error in listener for ${event}:`, err);
      }
    });
  }

  getReplayedRuns(): Run[] {
    return [...this.replayedRuns];
  }

  getActiveFinding(): Finding | null {
    return this.activeFinding;
  }

  setActiveFinding(f: Finding | null) {
    this.activeFinding = f;
    this.emit('finding.updated', f);
  }

  clearActiveFinding() {
    this.activeFinding = null;
    this.emit('finding.updated', null);
  }

  updateAssumptions(assumptions: Assumptions) {
    if (this.activeFinding?.cost) {
      this.activeFinding.cost.assumptions = { ...assumptions };
      const deltaMins = this.activeFinding.delta_ms / 1000 / 60;
      const runsPerWk = this.activeFinding.cost.runs_per_week || 70;
      const extraCiHours = Math.round(((deltaMins * runsPerWk) / 60) * 100) / 100;
      const engWaitHours = Math.round(extraCiHours * assumptions.blocking_fraction * 100) / 100;
      const engCost = Math.round(engWaitHours * assumptions.engineer_cost_per_hour_usd * 100) / 100;
      const runnerCost = Math.round(extraCiHours * 60 * assumptions.runner_cost_per_min_usd * 100) / 100;
      const totalCost = Math.round((engCost + runnerCost) * 100) / 100;

      this.activeFinding.cost.extra_ci_hours_per_week = extraCiHours;
      this.activeFinding.cost.engineer_wait_hours_per_week = engWaitHours;
      this.activeFinding.cost.engineer_cost_usd_per_week = engCost;
      this.activeFinding.cost.runner_cost_usd_per_week = runnerCost;
      this.activeFinding.cost.total_cost_usd_per_week = totalCost;
      this.activeFinding.cost.recovered_hours_per_week_if_reverted = extraCiHours;

      this.emit('finding.updated', this.activeFinding);
    }
  }

  async startReplay(): Promise<{ status: string; total_steps: number; interval_ms: number }> {
    if (this.isReplaying) {
      throw new ApiClientError('Replay requested while one is running', 'REPLAY_IN_PROGRESS', null, 409);
    }
    if (this.replayedRuns.length > 0) {
      throw new ApiClientError('Replay requested twice without reset', 'REPLAY_ALREADY_APPLIED', null, 409);
    }

    this.isReplaying = true;

    // Fixture of 5 slow runs for install (+200s)
    const fixtureRuns: Run[] = [
      {
        run_id: 'run_0116',
        commit_sha: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
        status: 'success',
        started_at: new Date(Date.now() - 4 * 60000).toISOString(),
        total_ms: 525100,
        demo_replay: true,
        steps: [
          { name: 'checkout', duration_ms: 8100, status: 'success' },
          { name: 'install', duration_ms: 270000, status: 'success' },
          { name: 'build', duration_ms: 96000, status: 'success' },
          { name: 'test', duration_ms: 121000, status: 'success' },
          { name: 'deploy', duration_ms: 30000, status: 'success' },
        ],
      },
      {
        run_id: 'run_0117',
        commit_sha: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
        status: 'success',
        started_at: new Date(Date.now() - 3 * 60000).toISOString(),
        total_ms: 523500,
        demo_replay: true,
        steps: [
          { name: 'checkout', duration_ms: 7900, status: 'success' },
          { name: 'install', duration_ms: 269000, status: 'success' },
          { name: 'build', duration_ms: 95500, status: 'success' },
          { name: 'test', duration_ms: 121100, status: 'success' },
          { name: 'deploy', duration_ms: 30000, status: 'success' },
        ],
      },
      {
        run_id: 'run_0118',
        commit_sha: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
        status: 'success',
        started_at: new Date(Date.now() - 2 * 60000).toISOString(),
        total_ms: 526000,
        demo_replay: true,
        steps: [
          { name: 'checkout', duration_ms: 8050, status: 'success' },
          { name: 'install', duration_ms: 271000, status: 'success' },
          { name: 'build', duration_ms: 96200, status: 'success' },
          { name: 'test', duration_ms: 120750, status: 'success' },
          { name: 'deploy', duration_ms: 30000, status: 'success' },
        ],
      },
      {
        run_id: 'run_0119',
        commit_sha: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
        status: 'success',
        started_at: new Date(Date.now() - 1 * 60000).toISOString(),
        total_ms: 524000,
        demo_replay: true,
        steps: [
          { name: 'checkout', duration_ms: 8150, status: 'success' },
          { name: 'install', duration_ms: 268500, status: 'success' },
          { name: 'build', duration_ms: 95900, status: 'success' },
          { name: 'test', duration_ms: 121450, status: 'success' },
          { name: 'deploy', duration_ms: 30000, status: 'success' },
        ],
      },
      {
        run_id: 'run_0120',
        commit_sha: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
        status: 'success',
        started_at: new Date().toISOString(),
        total_ms: 527200,
        demo_replay: true,
        steps: [
          { name: 'checkout', duration_ms: 8000, status: 'success' },
          { name: 'install', duration_ms: 272000, status: 'success' },
          { name: 'build', duration_ms: 96200, status: 'success' },
          { name: 'test', duration_ms: 121000, status: 'success' },
          { name: 'deploy', duration_ms: 30000, status: 'success' },
        ],
      },
    ];

    let currentStep = 0;

    const tick = () => {
      currentStep++;
      if (currentStep === 1) {
        // Step 1: Ingest commit
        const progress: DemoProgressEvent = {
          step_index: 1,
          total_steps: 6,
          kind: 'commit',
          id: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
        };
        this.emit('demo.progress', progress);
        this.replayTimeout = setTimeout(tick, 1500);
      } else if (currentStep <= 6) {
        // Steps 2..6: Ingest 5 runs
        const runIdx = currentStep - 2;
        const newRun = fixtureRuns[runIdx];
        this.replayedRuns.push(newRun);

        const progress: DemoProgressEvent = {
          step_index: currentStep,
          total_steps: 6,
          kind: 'run',
          id: newRun.run_id,
        };
        this.emit('demo.progress', progress);
        this.emit('run.created', newRun);

        if (currentStep === 6) {
          // Replay finished! Emit finding.created with llm: null first (prompt 5.4 rule 3)
          this.isReplaying = false;
          const initialFinding: Finding = JSON.parse(JSON.stringify(findingHighJson));
          const fullLlm = initialFinding.llm;
          initialFinding.llm = null; // Exercise the null path!
          this.activeFinding = initialFinding;

          this.emit('finding.created', initialFinding);
          this.emit('impacts.updated', { project_id: 'demo-app', computed_at: new Date().toISOString() });

          // 2s later: emit finding.updated with llm populated!
          setTimeout(() => {
            if (this.activeFinding) {
              this.activeFinding.llm = fullLlm;
              this.emit('finding.updated', this.activeFinding);
            }
          }, 2000);
        } else {
          this.replayTimeout = setTimeout(tick, 1500);
        }
      }
    };

    this.replayTimeout = setTimeout(tick, 1500);
    return { status: 'started', total_steps: 6, interval_ms: 1500 };
  }

  async reset(): Promise<{ status: string; deleted: Record<string, number> }> {
    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
    this.isReplaying = false;
    const deletedCount = this.replayedRuns.length;
    this.replayedRuns = [];
    this.activeFinding = null;

    this.emit('demo.reset', {});
    return {
      status: 'reset',
      deleted: {
        runs: deletedCount,
        commits: 1,
        events: deletedCount + 1,
        findings: 1,
        dependency_impacts: 1,
      },
    };
  }
}

export const mockReplaySim = new MockReplaySim();
