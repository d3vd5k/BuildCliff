// Shared constants — single source of truth mirroring contract.md section 1.
// Importable by backend, CLI and (later) frontend.

// IDs and defaults
export const DEMO_PROJECT_ID = 'demo-app';
export const DEFAULT_BRANCH = 'main';
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 500;

// Step order (seed, UI colors and order)
export const STEP_ORDER = ['checkout', 'install', 'build', 'test', 'deploy'];

// Detection windows and thresholds (B consumes these; A seeds to match)
export const BASELINE_WINDOW = 10; // successful runs before the split
export const CONFIRM_WINDOW = 5; // runs after the split (replay has exactly 5)
export const MIN_JUMP_PCT = 25; // percent
export const MIN_JUMP_MS = 20000; // milliseconds

// Demo replay
export const REPLAY_INTERVAL_MS = 1500;
export const REPLAY_TOTAL_STEPS = 6; // 1 commit + 5 runs

// Confidence levels (B sets, C/A display)
export const CONFIDENCE_LEVELS = Object.freeze({
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
});

// Default cost assumptions (stored on the projects document)
export const DEFAULT_ASSUMPTIONS = Object.freeze({
  runner_cost_per_min_usd: 0.008,
  engineer_cost_per_hour_usd: 60,
  blocking_fraction: 0.5,
});

// Enumerated field values
export const SOURCE_VALUES = ['seed', 'replay', 'github_actions', 'api'];
export const RUN_STATUS_VALUES = ['success', 'failed'];
export const STEP_STATUS_VALUES = ['success', 'failed', 'skipped'];
export const FINDING_STATUS_VALUES = ['active', 'resolved'];

// Collections (A creates validators + indexes for all)
export const COLLECTIONS = [
  'projects',
  'runs',
  'commits',
  'events',
  'findings',
  'dependency_impacts',
];

// --- ID format helpers (contract section 2.4 / 2.5) ---
// event_id: {project_id}:run:{run_id}  |  {project_id}:commit:{sha}
export const runEventId = (projectId, runId) => `${projectId}:run:${runId}`;
export const commitEventId = (projectId, sha) => `${projectId}:commit:${sha}`;

// finding_id: {project_id}:{branch}:{step}:{change_point.run_id}
export const findingId = (projectId, branch, step, changePointRunId) =>
  `${projectId}:${branch}:${step}:${changePointRunId}`;

// impact_id: {commit_sha}:{dep}
export const impactId = (commitSha, dep) => `${commitSha}:${dep}`;
