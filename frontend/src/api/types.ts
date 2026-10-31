// Types mirroring contract.md v1.0 exactly

export interface RunStep {
  name: string;
  duration_ms: number;
  status?: 'success' | 'failed' | 'skipped';
}

export interface Run {
  run_id: string;
  commit_sha: string;
  status: 'success' | 'failed';
  started_at: string; // ISO 8601 UTC
  total_ms: number;
  demo_replay: boolean;
  steps: RunStep[];
}

export interface RunsResponse {
  project_id: string;
  branch: string;
  count: number;
  runs: Run[];
}

export interface SuspectReason {
  code: string;
  label: string;
  weight: number;
}

export interface DepChange {
  name: string;
  from: string;
  to: string;
  commit_sha?: string;
}

export interface Suspect {
  rank: number;
  sha: string;
  score: number;
  author: string;
  message: string;
  committed_at: string;
  dep_changes: DepChange[];
  reasons: SuspectReason[];
}

export interface ConfidenceReason {
  code: string;
  label: string;
  polarity: 'positive' | 'negative';
}

export interface Confidence {
  level: 'High' | 'Medium' | 'Low';
  score: number;
  jump_score?: number;
  attribution_score?: number;
  reasons: ConfidenceReason[];
}

export interface Assumptions {
  runner_cost_per_min_usd: number;
  engineer_cost_per_hour_usd: number;
  blocking_fraction: number;
}

export interface Cost {
  runs_per_week: number;
  extra_ci_hours_per_week: number;
  engineer_wait_hours_per_week: number;
  engineer_cost_usd_per_week: number;
  runner_cost_usd_per_week: number;
  total_cost_usd_per_week: number;
  recovered_hours_per_week_if_reverted: number;
  assumptions: Assumptions;
}

export interface Llm {
  suggested_fix: string;
  channel_summary: string;
  source: 'llm' | 'template';
  generated_at: string;
}

export interface Finding {
  finding_id: string;
  project_id: string;
  branch: string;
  step: string;
  status: 'active' | 'resolved';
  detected_at: string;
  demo_replay: boolean;

  change_point: {
    run_id: string;
    started_at: string;
    commit_sha: string;
  };
  last_good_run_id: string;

  before_ms: number;
  after_ms: number;
  delta_ms: number;
  delta_pct: number;
  runs_before: number;
  runs_after: number;

  breakdown: {
    before_ms: Record<string, number>;
    after_ms: Record<string, number>;
  };

  commits_in_range: number;
  culprit_sha: string | null;
  suspects: Suspect[];
  confidence: Confidence;
  cost: Cost;
  llm: Llm | null; // Note: llm can be null initially!
}

export interface LatestFindingResponse {
  project_id: string;
  has_active_regression: boolean;
  finding: Finding | null;
}

export interface DiffRow {
  step: string;
  a_ms: number;
  b_ms: number;
  delta_ms: number;
  delta_pct: number;
}

export interface CommitBetween {
  sha: string;
  author: string;
  message: string;
  committed_at: string;
  is_suspect: boolean;
  suspect_rank: number | null;
}

export interface CompareResponse {
  mode: 'finding' | 'runs';
  project_id: string;
  a: {
    label: string;
    run_ids: string[];
    total_ms: number;
    steps_ms: Record<string, number>;
  };
  b: {
    label: string;
    run_ids: string[];
    total_ms: number;
    steps_ms: Record<string, number>;
  };
  diff: DiffRow[];
  total: {
    a_ms: number;
    b_ms: number;
    delta_ms: number;
    delta_pct: number;
  };
  commits_between: CommitBetween[];
  dependency_changes: DepChange[];
}

export interface DependencyImpact {
  impact_id: string;
  project_id: string;
  dep: string;
  from: string;
  to: string;
  commit_sha: string;
  step: string;
  before_ms: number;
  after_ms: number;
  delta_ms: number;
  delta_pct: number;
  runs_compared: {
    before: number;
    after: number;
  };
  finding_id: string | null;
  demo_replay?: boolean;
  computed_at?: string;
}

export interface DependencyImpactsResponse {
  project_id: string;
  computed_at: string;
  count: number;
  impacts: DependencyImpact[];
}

export interface ProjectInfo {
  project_id: string;
  name: string;
  default_branch: string;
  assumptions: Assumptions;
  runs_per_week: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    field: string | null;
  };
}

export interface DemoProgressEvent {
  step_index: number;
  total_steps: number;
  kind: 'commit' | 'run';
  id: string;
}

export interface ImpactsUpdatedEvent {
  project_id: string;
  computed_at: string;
}

