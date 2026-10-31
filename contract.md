# BuildCliff Shared Contract (A, B, C)

**contract_version: 1.3**
Single source of truth for field names and response shapes. If you need to change anything here, edit this file, bump the version, add a line to the change log at the bottom, and tell the other two before merging.

Owners: **A** = ingest, seed, stream, demo, CLI. **B** = detector, findings, compare, impacts, LLM. **C** = UI.

---

## 0. Conventions

| Rule | Value |
|---|---|
| Field naming | `snake_case` everywhere (Mongo, API, CLI JSON) |
| Durations | Integer **milliseconds**, field names end in `_ms`. UI/CLI format them (`200000` -> `3m20s`) |
| Timestamps | Stored as BSON `Date`. In the API they are ISO 8601 UTC strings (`2026-10-31T09:40:00Z`) |
| Percentages | Plain numbers in percent, one decimal (`285.7` means 285.7%). Exception: `blocking_fraction` is a fraction from 0 to 1 |
| Money | USD numbers, two decimals, field names end in `_usd` |
| Hours | Numbers with two decimals, field names end in `_hours` |
| IDs | Natural string keys (below). Mongo `_id` is **never** exposed by the API |
| SHAs | Stored as full 40-char hex. Clients display the first 7 characters |
| Branch | Default `main` |
| Base path | All endpoints live under `/api` |
| Nulls | A field that can be absent is returned as `null`, not omitted |

---

## 1. Shared constants

| Constant | Value | Used by |
|---|---|---|
| `DEMO_PROJECT_ID` | `demo-app` | all |
| `STEP_ORDER` | `checkout`, `install`, `build`, `test`, `deploy` | seed, UI colors and order |
| `BASELINE_WINDOW` | 10 successful runs before the split | B |
| `CONFIRM_WINDOW` | 5 runs after the split | B, **A** (replay fixture has exactly 5 slow runs) |
| `MIN_JUMP_PCT` | 25 | B |
| `MIN_JUMP_MS` | 20000 | B |
| `REPLAY_INTERVAL_MS` | 1500 | A |
| `REPLAY_TOTAL_STEPS` | 6 (1 commit + 5 runs) | A, C |
| Confidence levels | `High` (score >= 75), `Medium` (45 to 74), `Low` (< 45) | B sets, C displays |

---

## 2. Collections

Unique keys listed here are the natural keys. A creates the indexes and validators.

### 2.1 `projects`

| Field | Type | Notes |
|---|---|---|
| `project_id` | string, **unique** | `demo-app` |
| `name` | string | Display name |
| `default_branch` | string | `main` |
| `assumptions.runner_cost_per_min_usd` | number | default `0.008` |
| `assumptions.engineer_cost_per_hour_usd` | number | default `60` |
| `assumptions.blocking_fraction` | number 0 to 1 | default `0.5` (share of CI time an engineer actually waits) |
| `created_at` | Date | |

`runs_per_week` is **not stored**. B derives it from the last 14 days of runs (count / 2).

### 2.2 `runs`

| Field | Type | Notes |
|---|---|---|
| `run_id` | string, **unique** | e.g. `run_0116` |
| `event_id` | string | Link to `events` |
| `project_id` | string | |
| `branch` | string | |
| `commit_sha` | string | Commit that triggered the run |
| `status` | `"success"` or `"failed"` | Failed runs are excluded from baselines |
| `started_at` | Date | |
| `total_ms` | int | Sum of step durations (server computes it if the client omits it) |
| `steps[]` | array, non-empty | See below |
| `steps[].name` | string | One of `STEP_ORDER` in the demo; any string is accepted |
| `steps[].duration_ms` | int >= 0 | |
| `steps[].status` | `"success"`, `"failed"` or `"skipped"` | default `success` |
| `source` | `"seed"`, `"replay"`, `"github_actions"` or `"api"` | |
| `demo_replay` | bool | `true` only for replayed runs |
| `ingested_at` | Date | |

**Validator (required):** `run_id`, `project_id`, `branch`, `commit_sha`, `status`, `started_at`, `steps` (non-empty, numeric `duration_ms`).
**Compound index:** `{project_id, branch, started_at}`.

### 2.3 `commits`

| Field | Type | Notes |
|---|---|---|
| `sha` | string, **unique** | 40-char hex |
| `project_id` | string | |
| `parent` | string or null | Parent sha |
| `author` | string | Display name |
| `message` | string | First line is enough |
| `committed_at` | Date | |
| `files_changed` | string[] | File paths |
| `dep_changes[]` | array | May be empty |
| `dep_changes[].name` | string | e.g. `puppeteer` |
| `dep_changes[].from` | string | e.g. `21.0.0` |
| `dep_changes[].to` | string | e.g. `22.0.0` |
| `lines_changed` | int | Additions plus deletions (used for the "large diff" boost) |
| `diff_summary` | string or null | One or two sentences, used in the LLM prompt |
| `demo_replay` | bool | |

### 2.4 `events`

Raw ingest log. Keeps source payloads flexible.

| Field | Type | Notes |
|---|---|---|
| `event_id` | string, **unique** | Idempotency key |
| `project_id` | string | |
| `type` | `"run"` or `"commit"` | |
| `received_at` | Date | |
| `payload` | object | Original request body, unvalidated |

**`event_id` format:** `{project_id}:run:{run_id}` and `{project_id}:commit:{sha}`. The seeder, replay and the real uploader all use this format, so re-sending the same data is always a duplicate.

### 2.5 `findings`

Shape defined in section 3 (the stored document is the same as the API object). Natural key `finding_id`, **unique**.

**`finding_id` format:** `{project_id}:{branch}:{step}:{change_point.run_id}`. This makes re-running the detector idempotent (upsert, never duplicate).

### 2.6 `dependency_impacts`

One row per dependency bump, showing the step it affected most.

| Field | Type | Notes |
|---|---|---|
| `impact_id` | string, **unique** | `{commit_sha}:{dep}` |
| `project_id` | string | |
| `dep` | string | Dependency name |
| `from` | string | |
| `to` | string | |
| `commit_sha` | string | |
| `step` | string | Most affected step (largest absolute `delta_ms`) |
| `before_ms` | int | Median over the runs before the commit |
| `after_ms` | int | Median over the runs after the commit |
| `delta_ms` | int | `after_ms - before_ms` (can be near zero or negative) |
| `delta_pct` | number or null | One decimal; null when the baseline is zero and the after duration is nonzero |
| `runs_compared` | object `{before, after}` | Run counts used |
| `compare` | object `{a, b}` | Required run IDs: last successful measured-step baseline run, first successful measured-step after run |
| `finding_id` | string or null | Linked finding for the measured step on the project's default branch, if one exists |
| `demo_replay` | bool | |
| `computed_at` | Date | |

---

## 3. Finding JSON shape

```json
{
  "finding_id": "demo-app:main:install:run_0116",
  "project_id": "demo-app",
  "branch": "main",
  "step": "install",
  "status": "active",
  "detected_at": "2026-10-31T09:58:12Z",
  "demo_replay": true,

  "change_point": {
    "run_id": "run_0116",
    "started_at": "2026-10-31T09:41:03Z",
    "commit_sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6"
  },
  "last_good_run_id": "run_0115",

  "before_ms": 70000,
  "after_ms": 270000,
  "delta_ms": 200000,
  "delta_pct": 285.7,
  "runs_before": 10,
  "runs_after": 5,

  "breakdown": {
    "before_ms": { "checkout": 8000, "install": 70000, "build": 95000, "test": 120000, "deploy": 30000 },
    "after_ms":  { "checkout": 8100, "install": 270000, "build": 96000, "test": 121000, "deploy": 30000 }
  },

  "commits_in_range": 1,
  "culprit_sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
  "suspects": [
    {
      "rank": 1,
      "sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
      "score": 92,
      "author": "Priya Shah",
      "message": "Bump puppeteer to 22.0.0",
      "committed_at": "2026-10-31T09:38:40Z",
      "dep_changes": [ { "name": "puppeteer", "from": "21.0.0", "to": "22.0.0" } ],
      "reasons": [
        { "code": "LOCKFILE_CHANGED",    "label": "package-lock.json changed", "weight": 40 },
        { "code": "DEP_BUMPED",          "label": "puppeteer 21.0.0 -> 22.0.0", "weight": 30 },
        { "code": "SOLE_COMMIT_IN_RANGE","label": "Only commit between the last good and first slow run", "weight": 22 }
      ]
    }
  ],

  "confidence": {
    "level": "High",
    "score": 91,
    "jump_score": 95,
    "attribution_score": 88,
    "reasons": [
      { "code": "JUMP_PERSISTS",     "label": "Slow in 5 of 5 runs after the change", "polarity": "positive" },
      { "code": "CLEAN_SEPARATION",  "label": "Slowest baseline run is faster than the fastest new run", "polarity": "positive" },
      { "code": "SOLE_COMMIT",       "label": "Only one commit in range", "polarity": "positive" },
      { "code": "DEP_MATCHES_STEP",  "label": "Dependency change matches the install step", "polarity": "positive" }
    ]
  },

  "cost": {
    "runs_per_week": 70,
    "extra_ci_hours_per_week": 3.89,
    "engineer_wait_hours_per_week": 1.94,
    "engineer_cost_usd_per_week": 116.67,
    "runner_cost_usd_per_week": 1.87,
    "total_cost_usd_per_week": 118.53,
    "recovered_hours_per_week_if_reverted": 3.89,
    "assumptions": {
      "runner_cost_per_min_usd": 0.008,
      "engineer_cost_per_hour_usd": 60,
      "blocking_fraction": 0.5
    }
  },

  "llm": {
    "suggested_fix": "Pin puppeteer to 21.x or set PUPPETEER_SKIP_DOWNLOAD and cache the browser binary between runs.",
    "channel_summary": "install went 1m10s -> 4m30s (+3m20s) after a3f9c1d, which bumped puppeteer 21.0.0 -> 22.0.0.",
    "source": "llm",
    "generated_at": "2026-10-31T09:58:14Z"
  }
}
```

### Field rules

| Field | Rule |
|---|---|
| `status` | `"active"` or `"resolved"`. B sets `resolved` when the latest 5 successful runs for that step are back below the baseline p75. |
| `culprit_sha` | Equals `suspects[0].sha`, or `null` if no commit data exists for the range. |
| `suspects` | Sorted by `rank` ascending. Empty array when there is no commit data. C shows the full list when `confidence.level` is `Low`. |
| `suspects[].score` | Integer 0 to 100. |
| `confidence.level` | Exactly `"High"`, `"Medium"` or `"Low"`. |
| `confidence.reasons[].polarity` | `"positive"` (checkmark chip) or `"negative"` (warning chip). |
| `breakdown` | Medians per step. Powers the step breakdown bars and the revert preview. Keys follow the runs' step names. |
| `cost` | Recomputed by B whenever project assumptions change. |
| `llm.source` | `"llm"` or `"template"` (fallback). The UI never needs to branch on it, but may show a small label. |
| `llm` | Null while explanation work is pending. `finding.created` is published before generation; a persisted LLM or template result is published through `finding.updated`. |

New Gateway results must be complete JSON with only `suggested_fix` and
`channel_summary`, bounded to 1600 and 800 characters respectively. The server
adds `source` and `generated_at`; the provider cannot set those fields or alter
suspects, confidence, timings, or costs. Invalid/refused/truncated output,
missing credentials, provider errors, or the 8000 ms request deadline produce
the deterministic template. JSON validity does not establish factual accuracy.

Cost calculations retain full precision until each final hours/USD field is
rounded to two decimals. `total_cost_usd_per_week` is rounded from the sum of
the unrounded engineer and runner costs; it can differ by one cent from the sum
of the two separately rounded display values.


### Enumerated codes

**Suspect reason codes:** `LOCKFILE_CHANGED`, `DEP_BUMPED`, `DOCKERFILE_CHANGED`, `CI_CONFIG_CHANGED`, `CACHE_KEY_CHANGED`, `STEP_RELATED_FILES`, `SOLE_COMMIT_IN_RANGE`, `LARGE_DIFF`

**Confidence reason codes, positive:** `JUMP_PERSISTS`, `CLEAN_SEPARATION`, `SOLE_COMMIT`, `DEP_MATCHES_STEP`, `LARGE_SCORE_MARGIN`
**Confidence reason codes, negative:** `MULTIPLE_CANDIDATES`, `SMALL_SCORE_MARGIN`, `NO_COMMIT_DATA`, `FEW_BASELINE_RUNS`

### Low-confidence variant (the 3-commit range)

Same shape, with these differences:

```json
{
  "commits_in_range": 3,
  "culprit_sha": "7be21c90d4a85f3e6b1c0d92a47e8f35b6c1d0e7",
  "suspects": [
    { "rank": 1, "sha": "7be21c90d4a85f3e6b1c0d92a47e8f35b6c1d0e7", "score": 48, "...": "..." },
    { "rank": 2, "sha": "c04d8e7a19b3f6250e8d1a7c94b2f06d3a58e1c9", "score": 44, "...": "..." },
    { "rank": 3, "sha": "...", "score": 12, "...": "..." }
  ],
  "confidence": {
    "level": "Low",
    "score": 34,
    "reasons": [
      { "code": "JUMP_PERSISTS",       "label": "Slow in 5 of 5 runs after the change", "polarity": "positive" },
      { "code": "MULTIPLE_CANDIDATES", "label": "3 commits between the last good and first slow run", "polarity": "negative" },
      { "code": "SMALL_SCORE_MARGIN",  "label": "Top two suspects score within 4 points", "polarity": "negative" }
    ]
  }
}
```

---

## 4. API

### 4.1 Rules for every endpoint

- Request and response bodies are JSON.
- **Error shape** (all non-2xx):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: commit_sha",
    "field": "commit_sha"
  }
}
```

`field` uses dotted paths for nested problems (`steps.2.duration_ms`), and is `null` when not applicable.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or invalid field |
| 404 | `NOT_FOUND` | Unknown project, finding or run |
| 409 | `REPLAY_ALREADY_APPLIED` | Replay requested twice without reset |
| 409 | `REPLAY_IN_PROGRESS` | Replay requested while one is running |
| 500 | `INTERNAL_ERROR` | Anything else |

- Query parameter is always `project_id` (default `demo-app` if omitted) and `branch` (default `main`).

### 4.2 Ingest (owner: A)

**`POST /api/ingest/run`**

Request:
```json
{
  "event_id": "demo-app:run:run_0121",
  "project_id": "demo-app",
  "run_id": "run_0121",
  "branch": "main",
  "commit_sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
  "status": "success",
  "started_at": "2026-10-31T10:05:00Z",
  "source": "api",
  "steps": [
    { "name": "checkout", "duration_ms": 8100 },
    { "name": "install",  "duration_ms": 268000 },
    { "name": "build",    "duration_ms": 96000 },
    { "name": "test",     "duration_ms": 121000 },
    { "name": "deploy",   "duration_ms": 30000 }
  ]
}
```
`total_ms`, `source` and `steps[].status` are optional.

| Result | HTTP | Body |
|---|---|---|
| New run | 201 | `{ "status": "accepted", "event_id": "...", "run_id": "..." }` |
| Same `event_id` again | 200 | `{ "status": "duplicate", "event_id": "...", "message": "duplicate ignored" }` |
| Invalid | 400 | Error shape, e.g. `"Missing required field: commit_sha"` |

After an accepted run, A calls B's `detect(project_id)`. The response does **not** wait for detection.

**`POST /api/ingest/commit`**

Request:
```json
{
  "event_id": "demo-app:commit:a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
  "project_id": "demo-app",
  "sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
  "parent": "5d10e2c7b9a4f8036c1e7d2a94b0f5e83c6a1d72",
  "author": "Priya Shah",
  "message": "Bump puppeteer to 22.0.0",
  "committed_at": "2026-10-31T09:38:40Z",
  "files_changed": ["package.json", "package-lock.json"],
  "dep_changes": [ { "name": "puppeteer", "from": "21.0.0", "to": "22.0.0" } ],
  "lines_changed": 412,
  "diff_summary": "Upgrades puppeteer and regenerates the lockfile."
}
```
Responses use the same three outcomes as run ingest, with `sha` instead of `run_id`. After an accepted commit, A calls B's `recomputeImpacts(project_id)`.

### 4.3 Runs (owner: A)

**`GET /api/runs?project_id=demo-app&branch=main&limit=200`**

Returns runs in **ascending** `started_at` order (oldest first). Includes failed runs. All steps are returned for every run, so C picks the step to plot client-side.

```json
{
  "project_id": "demo-app",
  "branch": "main",
  "count": 2,
  "runs": [
    {
      "run_id": "run_0001",
      "commit_sha": "9c1e...",
      "status": "success",
      "started_at": "2026-10-10T08:00:00Z",
      "total_ms": 231000,
      "demo_replay": false,
      "steps": [
        { "name": "checkout", "duration_ms": 8000,  "status": "success" },
        { "name": "install",  "duration_ms": 69000, "status": "success" }
      ]
    }
  ]
}
```
Optional filters: `since` (ISO timestamp), `limit` (default 200, max 500).

### 4.4 Findings (owner: B)

**`GET /api/findings?project_id=demo-app&status=active`**
```json
{ "project_id": "demo-app", "count": 1, "findings": [ { "...Finding..." } ] }
```
`status` is optional (`active`, `resolved`). Sorted by `detected_at` descending.

**`GET /api/findings/latest?project_id=demo-app&step=install`**

Used by the CLI and the UI. Returns the newest **active** finding (optionally for one step).
```json
{
  "project_id": "demo-app",
  "has_active_regression": true,
  "finding": { "...Finding..." }
}
```
When clean: `{ "project_id": "demo-app", "has_active_regression": false, "finding": null }`.

**`GET /api/findings/:finding_id`** returns a single Finding object (the finding id contains colons, so URL-encode it). 404 with `NOT_FOUND` if missing.

### 4.5 Compare (owner: B)

**`GET /api/compare?finding_id=...`** compares typical before (median of the 10 baseline runs) with typical after (median of the 5 slow runs).
**`GET /api/compare?a=run_0100&b=run_0118`** compares two single runs.

```json
{
  "mode": "finding",
  "project_id": "demo-app",
  "a": {
    "label": "Typical before (10 runs)",
    "run_ids": ["run_0106", "run_0107"],
    "total_ms": 323000,
    "steps_ms": { "checkout": 8000, "install": 70000, "build": 95000, "test": 120000, "deploy": 30000 }
  },
  "b": {
    "label": "Typical after (5 runs)",
    "run_ids": ["run_0116", "run_0117"],
    "total_ms": 525000,
    "steps_ms": { "checkout": 8100, "install": 270000, "build": 96000, "test": 121000, "deploy": 30000 }
  },
  "diff": [
    { "step": "install",  "a_ms": 70000, "b_ms": 270000, "delta_ms": 200000, "delta_pct": 285.7 },
    { "step": "checkout", "a_ms": 8000,  "b_ms": 8100,   "delta_ms": 100,    "delta_pct": 1.3 }
  ],
  "total": { "a_ms": 323000, "b_ms": 525000, "delta_ms": 202000, "delta_pct": 62.5 },
  "commits_between": [
    {
      "sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
      "author": "Priya Shah",
      "message": "Bump puppeteer to 22.0.0",
      "committed_at": "2026-10-31T09:38:40Z",
      "is_suspect": true,
      "suspect_rank": 1
    }
  ],
  "dependency_changes": [
    { "name": "puppeteer", "from": "21.0.0", "to": "22.0.0", "commit_sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6" }
  ]
}
```
- `mode` is `"finding"` or `"runs"`.
- `diff` includes every step, sorted by `delta_ms` descending.
- `is_suspect` is `false` and `suspect_rank` is `null` when the commit is not a suspect or the comparison is run-to-run with no finding.
- For `mode: "runs"`, `label` is the run id and `run_ids` has one entry.
- Single-run mode includes every recorded step duration, including failed and skipped steps. Successful-only timing windows apply to finding mode, not to individual run snapshots.
- Each side's `total_ms` is the sum of its displayed `steps_ms` values.
- An absent step contributes `0` on that side. A zero baseline returns `delta_pct: null` when the other duration is nonzero, or `0` when both durations are zero.
- Reversing a single-run comparison reverses the duration deltas; its commit/dependency list still describes the proven chronological ancestry range.

### 4.6 Dependency impacts (owner: B)

**`GET /api/dependency-impacts?project_id=demo-app`**

Sorted by `delta_ms` descending (the biggest slowdown first).
```json
{
  "project_id": "demo-app",
  "computed_at": "2026-10-31T09:58:13Z",
  "count": 6,
  "impacts": [
    {
      "impact_id": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6:puppeteer",
      "dep": "puppeteer",
      "from": "21.0.0",
      "to": "22.0.0",
      "commit_sha": "a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6",
      "step": "install",
      "before_ms": 70000,
      "after_ms": 270000,
      "delta_ms": 200000,
      "delta_pct": 285.7,
      "runs_compared": { "before": 10, "after": 5 },
      "compare": { "a": "run_0115", "b": "run_0116" },
      "finding_id": "demo-app:main:install:run_0116"
    }
  ]
}
```
A row is "near zero" when `abs(delta_ms) < 5000`. C mutes those rows; B does not filter them out.

Rows measure the project's `default_branch`; branches are not combined. Every
row includes a non-null `compare` target, even if `finding_id` is null. Prefer a
finding link when present; otherwise open
`GET /api/compare?project_id=...&branch=<project.default_branch>&a=<row.compare.a>&b=<row.compare.b>`.
The target is an adjacent measured-run pair, not the full 10/5 median window;
ordinary timing jitter can make that pair's delta differ from the impact row.
No incomplete window is reported as a zero-impact measurement. A successful
empty rebuild returns `computed_at: null`, `count: 0`, and `impacts: []`.

For the v1.2 cutover, rebuild each project's materialized rows with
`recomputeImpacts(project_id)` before serving the table. Existing rows are
replaced with the required comparison targets; there is no read-time guessing
or legacy response shim.

### 4.7 Projects and assumptions (owner: A)

**`GET /api/projects/:project_id`**
```json
{
  "project_id": "demo-app",
  "name": "Demo App",
  "default_branch": "main",
  "assumptions": {
    "runner_cost_per_min_usd": 0.008,
    "engineer_cost_per_hour_usd": 60,
    "blocking_fraction": 0.5
  },
  "runs_per_week": 70
}
```
`runs_per_week` is read-only and derived (the API gets it from B).
It is the count of all project runs (all statuses and branches) with `started_at`
in the inclusive interval from now minus 14 days through now, divided by two.
Older and future-dated runs are excluded.

**`PATCH /api/projects/:project_id/assumptions`**

Request (any subset):
```json
{ "engineer_cost_per_hour_usd": 80, "blocking_fraction": 0.6 }
```
Response:
```json
{
  "project_id": "demo-app",
  "assumptions": { "runner_cost_per_min_usd": 0.008, "engineer_cost_per_hour_usd": 80, "blocking_fraction": 0.6 },
  "findings_recomputed": 1
}
```
A saves the values, then calls B's `recomputeCosts(project_id)`, which updates `cost` on active findings and emits `finding.updated`. Validation: costs >= 0, `blocking_fraction` between 0 and 1.

### 4.8 Demo mode (owner: A)

**`POST /api/demo/replay`** (no body)

`202`:
```json
{ "status": "started", "total_steps": 6, "interval_ms": 1500 }
```
Order: 1 commit, then 5 runs. Errors: `409 REPLAY_ALREADY_APPLIED` or `409 REPLAY_IN_PROGRESS`.

**`POST /api/demo/reset`** (no body)

`200`:
```json
{
  "status": "reset",
  "deleted": { "runs": 5, "commits": 1, "events": 6, "findings": 1, "dependency_impacts": 1 }
}
```
Removes everything with `demo_replay: true` plus findings and impact rows linked to it. Safe to call when nothing is replayed (all counts 0). Emits `demo.reset`.

### 4.9 Health (owner: A)

**`GET /api/health`** returns `{ "status": "ok", "db": "connected" }`.

---

## 5. Live stream (owner: A, `GET /api/stream`)

Server-sent events. Each message is `event: <name>` plus `data: <json>`. A comment line (`: ping`) is sent every 20 seconds as a heartbeat. The stream accepts `?project_id=demo-app`.

| Event | Data | Fired when |
|---|---|---|
| `run.created` | A full Run object (same shape as in `GET /runs`) | A run is inserted |
| `finding.created` | A full Finding | B inserts a finding |
| `finding.updated` | A full Finding | Cost recomputed, LLM text arrives, or status changes |
| `demo.progress` | `{ "step_index": 3, "total_steps": 6, "kind": "run", "id": "run_0118" }` | Each replay step is ingested (`kind` is `commit` or `run`) |
| `demo.reset` | `{}` | Reset completes. C refetches runs, findings and impacts |
| `impacts.updated` | `{ "project_id": "demo-app", "computed_at": "..." }` | B finishes recomputing impacts. C refetches the table |

---

## 6. Internal function hooks (A and B, same codebase)

| Function | Owner | Called by | Behavior |
|---|---|---|---|
| `detect(project_id)` | B | A, after each accepted run | Detects/attributes, persists findings and schedules background explanations without awaiting the provider; returns `{ created, updated }` |
| `resumeExplanations(project_id?)` | B | A at startup; detection for its project | Queue persisted null explanations; return number scheduled. Omit project to resume the application database. |
| `drainExplanations()` | B | A during graceful shutdown | Wait for in-flight/queued detection and explanation tasks; reject on unexpected persistence/publication errors. |
| `recomputeCosts(project_id)` | B | A, after assumptions change | Updates `cost` on active findings |
| `recomputeImpacts(project_id)` | B | A, after commits and reset | Rebuilds `dependency_impacts` with `$merge`, then emits `impacts.updated` |
| `getDb()` | A | B | Returns the shared Mongo database handle |
| `emit(eventName, data)` | A | B | Publishes to the SSE stream |

`detect` must be safe to call repeatedly and concurrently. Replay calls it five times about 1.5 seconds apart, and the finding must only appear after the fifth slow run.

Explanation work is process-local and deduplicated across factories sharing
the same Db handle. Conditional writes use the original Mongo `_id` and require
`llm: null`, so late responses cannot overwrite a reset/recreated finding or a
completed result. Only pending/null work resumes; completed templates and LLM
text are not automatically regenerated when credentials or model change.

At startup, resume pending work after connecting the database. On shutdown,
stop accepting ingest before draining, then close MongoDB. A process crash can
leave null work for the next startup/detection; this is not a durable broker or
an exactly-once provider-billing guarantee across processes. A serverless host
must retain the work using its execution lifecycle rather than terminating
immediately after an ingest response.

---

## 7. Mock files for C (committed to `/mocks` at kickoff)

B and A write these directly from the examples above so C can build immediately.

| File | Source |
|---|---|
| `runs.json` | Section 4.3 shape, about 20 runs including 1 failed run |
| `finding_high.json` | Section 3 example |
| `finding_low.json` | Section 3 base shape with the low-confidence variant applied |
| `findings_latest_clean.json` | `{ "project_id": "demo-app", "has_active_regression": false, "finding": null }` |
| `compare.json` | Section 4.5 example |
| `dependency_impacts.json` | Section 4.6 shape, about 6 rows with at least 2 near-zero |
| `project.json` | Section 4.7 example |
| `error_validation.json` | Section 4.1 error shape |

---

## 8. Change log

| Version | Date | Change | By |
|---|---|---|---|
| 1.0 | 2026-10-31 | Initial contract | A, B, C |
| 1.1 | 2026-10-31 | Correct full-precision cost total; clarify recent-run frequency and comparison status/zero-baseline/direction semantics. No response fields changed. | B |
| 1.2 | 2026-10-31 | Add required impact `compare: {a, b}` targets; restrict finding links to the measured step/default branch; clarify zero-baseline and empty-result semantics. | B |
| 1.3 | 2026-10-31 | Move explanations to background work; add resume/drain hooks and reset-safe persistence; specify Gateway GPT-5 nano request/fallback boundaries. Finding response fields unchanged. | B |
