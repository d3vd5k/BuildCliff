// Deterministic seed data + replay fixture generator.
// A fixed RNG seed (mulberry32) and crypto-based SHAs make `npm run seed`
// produce identical structure every run. Timestamps are relative to now so
// runs_per_week stays realistic (rolling window).
//
// Design: every planted regression is followed by recovery runs so B's
// detector marks them "resolved". The last ~20 runs are clean, giving a
// clean CLI state before replay. The puppeteer cliff is held back into the
// replay fixture and ingested live by the demo service.

import crypto from 'crypto';
import {
  DEMO_PROJECT_ID,
  DEFAULT_BRANCH,
  STEP_ORDER,
  DEFAULT_ASSUMPTIONS,
  runEventId,
  commitEventId,
} from '@buildcliff/shared';

const SEED_RNG = 42; // fixed RNG seed
const RUN_COUNT = 120;
const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours between runs (~10 days span)

const AUTHORS = ['Priya Shah', 'Marcus Lee', 'Devon Ray', 'Aisha Khan'];

// Base step durations (milliseconds) — matches contract examples.
const BASE_DURATIONS = {
  checkout: 8000,
  install: 70000,
  build: 95000,
  test: 120000,
  deploy: 30000,
};

// --- Planted regressions (each followed by recovery runs → resolved) ---
// Webpack bump: build +40s
const WEBPACK = {
  firstSlowRun: 27,
  numSlow: 5,
  step: 'build',
  deltaMs: 40000,
  commit: {
    message: 'Bump webpack to 5.90.0',
    author: 'Marcus Lee',
    depChanges: [{ name: 'webpack', from: '5.88.0', to: '5.90.0' }],
    filesChanged: ['package.json', 'package-lock.json'],
    linesChanged: 180,
    diffSummary: 'Upgrades webpack and regenerates the lockfile.',
  },
};

// Cache-key change: install +25s (non-dependency cause)
const CACHE_KEY = {
  firstSlowRun: 41,
  numSlow: 5,
  step: 'install',
  deltaMs: 25000,
  commit: {
    message: 'Change CI cache key to content hash',
    author: 'Devon Ray',
    depChanges: [],
    filesChanged: ['.github/workflows/ci.yml', 'scripts/cache-key.sh'],
    linesChanged: 45,
    diffSummary: 'Switches the CI cache key from a fixed string to a content hash.',
  },
};

// --- 2 dependency bumps with no measurable effect (near-zero rows) ---
const NO_EFFECT_BUMPS = [
  {
    atRun: 61,
    commit: {
      message: 'Bump eslint to 8.50.0',
      author: 'Priya Shah',
      depChanges: [{ name: 'eslint', from: '8.45.0', to: '8.50.0' }],
      filesChanged: ['package.json', 'package-lock.json'],
      linesChanged: 320,
      diffSummary: 'Upgrades eslint and regenerates the lockfile.',
    },
  },
  {
    atRun: 71,
    commit: {
      message: 'Bump lodash to 4.17.21',
      author: 'Marcus Lee',
      depChanges: [{ name: 'lodash', from: '4.17.20', to: '4.17.21' }],
      filesChanged: ['package.json', 'package-lock.json'],
      linesChanged: 8,
      diffSummary: 'Patches lodash to 4.17.21.',
    },
  },
];

// --- Low-confidence case: 3 commits in the suspect range, build +40s ---
const LOW_CONFIDENCE = {
  firstSlowRun: 90,
  numSlow: 5,
  step: 'build',
  deltaMs: 40000,
  // 3 commits land between the last good run (89) and first slow run (90).
  // Only the 3rd triggers a run; the first two are extra commits in the repo.
  commits: [
    {
      message: 'Upgrade webpack config to cache busting',
      author: 'Marcus Lee',
      depChanges: [{ name: 'webpack', from: '5.90.0', to: '5.91.0' }],
      filesChanged: ['webpack.config.js', 'package.json'],
      linesChanged: 95,
      diffSummary: 'Tweaks webpack cache-busting config.',
    },
    {
      message: 'Refactor build scripts',
      author: 'Priya Shah',
      depChanges: [],
      filesChanged: ['scripts/build.js', 'package.json'],
      linesChanged: 820,
      diffSummary: 'Refactors the build scripts for modularity.',
    },
    {
      message: 'Update README badges',
      author: 'Devon Ray',
      depChanges: [],
      filesChanged: ['README.md'],
      linesChanged: 340,
      diffSummary: 'Updates README badges and links.',
    },
  ],
};

// Failed runs (excluded from baselines). Placed away from regression windows.
const FAILED_RUNS = [15, 52, 105];
// For failed runs, "build" is the failing step; later steps are skipped.
const FAILED_STEP = 'build';

// --- Deterministic PRNG (mulberry32) ---
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 40-char hex SHA from a string.
function makeSha(input) {
  return crypto.createHash('sha256').update(`buildcliff:${input}`).digest('hex').slice(0, 40);
}

/** Apply ±10% jitter to a base duration, rounded to an integer. */
function jitter(base, rng) {
  return Math.round(base * (1 + (rng() - 0.5) * 0.2));
}

/** Build the 5 steps for a run, applying jitter + any slow-step delta. */
function buildSteps(rng, slow, isFailed) {
  const failedIdx = STEP_ORDER.indexOf(FAILED_STEP);
  return STEP_ORDER.map((name, idx) => {
    let dur = jitter(BASE_DURATIONS[name], rng);
    if (slow && slow.step === name) dur += slow.deltaMs;
    let status = 'success';
    if (isFailed) {
      if (name === FAILED_STEP) status = 'failed';
      else if (idx > failedIdx) status = 'skipped';
    }
    if (status === 'skipped') dur = 0;
    return { name, duration_ms: dur, status };
  });
}

/**
 * Generate the full seed dataset: one project, 120 runs, matching commits
 * and events. Deterministic structure; timestamps relative to now.
 */
export function generateSeedData() {
  const rng = mulberry32(SEED_RNG);
  const now = Date.now();
  const projectId = DEMO_PROJECT_ID;
  const branch = DEFAULT_BRANCH;

  // Map: runIndex -> { step, deltaMs } for slow windows.
  const slowMap = {};
  for (const r of [WEBPACK, CACHE_KEY]) {
    for (let i = 0; i < r.numSlow; i++) {
      slowMap[r.firstSlowRun + i] = { step: r.step, deltaMs: r.deltaMs };
    }
  }
  for (let i = 0; i < LOW_CONFIDENCE.numSlow; i++) {
    slowMap[LOW_CONFIDENCE.firstSlowRun + i] = {
      step: LOW_CONFIDENCE.step,
      deltaMs: LOW_CONFIDENCE.deltaMs,
    };
  }

  // Map: runIndex -> special commit opts (dep bumps, cache key, low_c).
  const specialCommits = {};
  specialCommits[WEBPACK.firstSlowRun] = WEBPACK.commit;
  specialCommits[CACHE_KEY.firstSlowRun] = CACHE_KEY.commit;
  specialCommits[LOW_CONFIDENCE.firstSlowRun] = LOW_CONFIDENCE.commits[2];
  for (const b of NO_EFFECT_BUMPS) {
    specialCommits[b.atRun] = b.commit;
  }

  const runs = [];
  const commits = [];
  const events = [];
  let commitSeq = 0;
  let parentSha = null;

  for (let i = 1; i <= RUN_COUNT; i++) {
    const runId = `run_${String(i).padStart(4, '0')}`;
    const startedAt = new Date(now - (RUN_COUNT - i) * INTERVAL_MS);
    const isFailed = FAILED_RUNS.includes(i);
    const slow = slowMap[i] || null;

    // Insert low-confidence extra commits (low_a, low_b) before run 90.
    if (i === LOW_CONFIDENCE.firstSlowRun) {
      for (let j = 0; j < 2; j++) {
        commitSeq++;
        const extraSha = makeSha(`commit-${commitSeq}`);
        const opts = LOW_CONFIDENCE.commits[j];
        const committedAt = new Date(startedAt.getTime() - (3 - j) * 20 * 60 * 1000);
        const extra = {
          sha: extraSha,
          project_id: projectId,
          parent: parentSha,
          author: opts.author,
          message: opts.message,
          committed_at: committedAt,
          files_changed: opts.filesChanged,
          dep_changes: opts.depChanges,
          lines_changed: opts.linesChanged,
          diff_summary: opts.diffSummary,
          demo_replay: false,
        };
        parentSha = extraSha;
        commits.push(extra);
        events.push({
          event_id: commitEventId(projectId, extraSha),
          project_id: projectId,
          type: 'commit',
          received_at: committedAt,
          payload: { ...extra },
        });
      }
    }

    // Build the run's commit.
    commitSeq++;
    const sha = makeSha(`commit-${commitSeq}`);
    const opts = specialCommits[i] || {};
    const committedAt = new Date(startedAt.getTime() - 60000);
    const commit = {
      sha,
      project_id: projectId,
      parent: parentSha,
      author: opts.author || AUTHORS[Math.floor(rng() * AUTHORS.length)],
      message: opts.message || `Update module ${commitSeq}`,
      committed_at: committedAt,
      files_changed: opts.filesChanged || [`src/module_${commitSeq}.js`],
      dep_changes: opts.depChanges || [],
      lines_changed: opts.linesChanged || Math.floor(rng() * 150) + 5,
      diff_summary: opts.diffSummary || null,
      demo_replay: false,
    };
    parentSha = sha;
    commits.push(commit);

    // Build steps and run document.
    const steps = buildSteps(rng, slow, isFailed);
    const totalMs = steps.reduce((sum, s) => sum + s.duration_ms, 0);
    const status = isFailed ? 'failed' : 'success';
    const run = {
      run_id: runId,
      event_id: runEventId(projectId, runId),
      project_id: projectId,
      branch,
      commit_sha: sha,
      status,
      started_at: startedAt,
      total_ms: totalMs,
      steps,
      source: 'seed',
      demo_replay: false,
      ingested_at: new Date(now),
    };
    runs.push(run);

    // Events for the run and its commit.
    events.push({
      event_id: runEventId(projectId, runId),
      project_id: projectId,
      type: 'run',
      received_at: startedAt,
      payload: { ...run },
    });
    events.push({
      event_id: commitEventId(projectId, sha),
      project_id: projectId,
      type: 'commit',
      received_at: committedAt,
      payload: { ...commit },
    });
  }

  // Project document with default cost assumptions.
  const project = {
    project_id: projectId,
    name: 'Demo App',
    default_branch: branch,
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    created_at: new Date(now - RUN_COUNT * INTERVAL_MS),
  };

  return { project, runs, commits, events };
}

/**
 * Build the replay fixture: 1 culprit commit (puppeteer 21→22) + 5 slow runs
 * (install +200s). Timestamps/run IDs are assigned by the demo service at
 * replay time; structural data is deterministic here.
 */
export function buildReplayFixture() {
  const rng = mulberry32(SEED_RNG + 1000); // separate RNG stream
  const projectId = DEMO_PROJECT_ID;
  const branch = DEFAULT_BRANCH;
  const puppeteerSha = makeSha('replay-puppeteer-commit');

  const commit = {
    sha: puppeteerSha,
    project_id: projectId,
    parent: null, // demo service sets to latest commit SHA at replay time
    author: 'Priya Shah',
    message: 'Bump puppeteer to 22.0.0',
    committed_at: null, // demo service sets
    files_changed: ['package.json', 'package-lock.json'],
    dep_changes: [{ name: 'puppeteer', from: '21.0.0', to: '22.0.0' }],
    lines_changed: 412,
    diff_summary: 'Upgrades puppeteer and regenerates the lockfile.',
    demo_replay: true,
  };

  const runs = [];
  for (let i = 0; i < 5; i++) {
    const steps = STEP_ORDER.map((name) => {
      let dur = jitter(BASE_DURATIONS[name], rng);
      if (name === 'install') dur += 200000; // +200s cliff
      return { name, duration_ms: dur, status: 'success' };
    });
    const totalMs = steps.reduce((sum, s) => sum + s.duration_ms, 0);
    runs.push({
      run_id: null, // demo service assigns run_0121..run_0125
      project_id: projectId,
      branch,
      commit_sha: puppeteerSha,
      status: 'success',
      started_at: null, // demo service assigns (now + offset)
      total_ms: totalMs,
      steps,
      source: 'replay',
      demo_replay: true,
      ingested_at: null, // demo service assigns
    });
  }

  return { commit, runs };
}
