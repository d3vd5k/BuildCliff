# Plan: BuildCliff (scoped feature set)

## 1. Scope

**In:** the core pipeline (ingest, detect, attribute, LLM fix/summary) plus these eight features:

1. Replay the cliff demo mode
2. Confidence badge with reasons
3. Step breakdown bars
4. Before/after comparison view
5. Dependency impact table
6. Cost translation
7. Auto-revert preview
8. CLI `buildcliff why-slow`

**Out:** vector search, time series collection, change-stream alerts, idempotency panel, flaky classifier, GitHub Action, PR bot, Slack copy button. Duplicate and malformed events are still handled by the API (the track requires one failure case), just without a dedicated panel.

## 2. Architecture

```
Seed generator / replay ──► Ingest API (validation + unique IDs) ──► MongoDB
                                                                      │
                     ┌────────────────────────────────────────────────┤
                     ▼                                                ▼
        Detector + Attribution + Confidence               Change stream ──► SSE ──► Web UI
        (aggregation pipelines) ──► findings                                         ▲
                     │                                                              │
                     ├──► LLM (fix + summary, template fallback)     REST API ──────┤
                     └──► dependency_impacts ($merge)                     ▲
                                                                          └── CLI (buildcliff)
```

The UI and the CLI both read the same REST API, so the CLI costs very little extra.

## 3. Data model

| Collection | Key fields |
|---|---|
| `runs` | `run_id` (unique), `project_id`, `branch`, `commit_sha`, `status`, `started_at`, `total_ms`, `steps[]` (`name`, `duration_ms`), `demo_replay` (bool) |
| `commits` | `sha` (unique), `parent`, `author`, `message`, `committed_at`, `files_changed[]`, `dep_changes[]` (`name`, `from`, `to`) |
| `events` | `event_id` (unique), raw `payload` (flexible) |
| `findings` | `step`, `change_point_run_id`, `before_ms`, `after_ms`, `delta_ms`, `suspects[]` (`sha`, `score`, `reasons[]`), **`confidence`** (`level`, `score`, `reasons[]`), **`cost`**, `llm` (`fix`, `summary`) |
| `dependency_impacts` | `dep`, `from`, `to`, `commit_sha`, `step`, `delta_ms`, `runs_compared`, `computed_at` |
| `projects` | `runs_per_week` (derived), `runner_cost_per_min`, `engineer_cost_per_hour`, `blocking_fraction` (editable assumptions) |

**Indexes:** unique on `runs.run_id`, `events.event_id` and `commits.sha`; compound on `runs {project_id, branch, started_at}`; on `dependency_impacts {dep, delta_ms}`.
**Validation:** `runs` requires `run_id`, `project_id`, `commit_sha`, `started_at` and a non-empty `steps` array with numeric durations.

## 4. Core engine (recap)

- **Detector:** per step, compare the median of the previous 10 successful runs with the next 5. Flag a change point when the jump is ≥25% and ≥20 s, the new window's minimum is above the old window's p75, and the shift persists across all 5 runs. Uses `$setWindowFields`.
- **Attribution:** commits between the last good and first bad run, scored deterministically (lockfile, Dockerfile or cache key, files related to the slow step, sole commit in range). The LLM never picks the culprit.
- **LLM:** drafts `fix` and `summary` from the finding and the top suspect, with a template fallback.

## 5. Feature specs

### Replay the cliff
- The seed leaves out the last block: **1 culprit commit plus 5 slow runs**. Hold them in a `replay_fixture.json`.
- `POST /demo/replay` ingests the commit, then the 5 runs about 1.5 s apart, through the normal ingest path, so validation, idempotency and change streams all fire for real.
- Replayed runs are tagged `demo_replay: true`. `POST /demo/reset` deletes them and their finding, so you can rehearse repeatedly.
- The 5-run block is required by the persistence rule: the finding can't exist after one run.
- **Done when:** pressing the button grows the timeline run by run, and the cliff marker and culprit panel appear after run 5 with no page refresh.

### Confidence badge with reasons
- Score the **jump** (persistence 5/5, separation from baseline) and the **attribution** (top score, margin over the runner-up, commits in range, whether a dependency change matches the slow step).
- Output `High | Medium | Low` plus `reasons[]`, shown as chips: positive (✓ lockfile changed, ✓ only commit in range) and negative (⚠ 3 candidates).
- Low confidence shows the ranked list rather than a single culprit.
- **Done when:** the planted regression reads High, and a seeded ambiguous one (several commits between two runs) reads Low.

### Step breakdown bars
- Recharts stacked bar per run, one color per step, with the jumped step highlighted.
- Shown in the culprit panel (median before vs after) and in the compare view.
- Data comes straight from `runs.steps[]`, so no new queries are needed.

### Before/after comparison view
- `GET /compare?a=…&b=…` defaults to "typical before" (median of 10) vs "typical after" (median of 5) from a finding. Users can also click two timeline points, which uses single runs.
- Returns per-step `{a_ms, b_ms, delta, pct}`, commits between the two, and dependency changes between them.
- UI shows two stacked bars side by side, a diff table, and the commit list with suspects flagged.
- **Done when:** one screen answers "what changed between these two builds?"

### Dependency impact table
- Not only findings. For every commit with `dep_changes`, compare each step's median over the N runs before and after it, using `$lookup` and `$setWindowFields`. This also catches bumps with **no** measurable impact.
- Write results with `$merge` into `dependency_impacts`, recomputed after each ingest batch.
- UI table columns: dependency, version change, step hit, Δ time, runs compared. Sort by impact, and link each row to its finding or compare view.
- **Done when:** the table has about 6 rows including at least one near-zero.

### Cost translation
- `Δ per run × runs/week (counted from the last 14 days) = extra CI hours/week`.
- Two lines:
  - **Engineer waiting time:** hours/week × `blocking_fraction` × hourly rate.
  - **Runner cost:** minutes × `$/min`.
- Show the assumptions beside the number and let the user edit them. At default runner rates the compute cost is only a few dollars a week, so lead with waiting time. Presenting runner dollars as the headline would get challenged.
- Stored on the finding, and shown in the panel, the CLI and the table.

### Auto-revert preview
- A toggle in the culprit panel draws a dashed line at `before_ms` from the cliff onward, with the area between the actual and projected lines shaded as "time won back".
- Cost translation updates to "reverting recovers ~X h/week".
- Purely client-side from the finding, with no git operations. Label it "projected".

### CLI: `buildcliff why-slow`
- Thin Node (or Python) client over `GET /api/findings/latest`, with `--project`, `--step` and `--json`.
- Output: the step, `1m10s → 4m30s (+3m20s)`, the culprit commit, the confidence level and reasons, an ASCII step breakdown, the cost line, and the suggested fix.
- Exits with code 1 when an active regression exists. Run it before and after the replay in the demo: "clean", then "regression found".

## 6. Seed data (the thing that makes all eight features look good)

About 120 runs, 5 steps (`checkout`, `install`, `build`, `test`, `deploy`), ±10% jitter, a few failed runs, with timestamps relative to now so runs/week is realistic. Planted events:

| Event | Purpose |
|---|---|
| `puppeteer` 21→22: `install` +200 s (held back for replay) | The demo cliff |
| `webpack` bump: `build` +40 s | A second, smaller finding for the table |
| Cache-key change: `install` +25 s | A non-dependency cause |
| 2 bumps with no effect | Near-zero rows in the table |
| One range with 3 commits between runs | Low-confidence case |

`seed` must be deterministic (fixed RNG seed) so the demo is repeatable.

## 7. API surface

| Endpoint | Used by |
|---|---|
| `POST /ingest/run`, `POST /ingest/commit` | Seeder, replay |
| `GET /runs?project&step` | Timeline |
| `GET /findings/latest`, `GET /findings/:id` | Panel, CLI |
| `GET /compare` | Compare view |
| `GET /dependency-impacts` | Table |
| `PATCH /projects/:id/assumptions` | Cost settings |
| `POST /demo/replay`, `POST /demo/reset` | Demo mode |
| `GET /stream` (SSE) | Live updates |

## 8. Build order (about 9–10 h; scale to your event)

| Phase | Work | Done when |
|---|---|---|
| 1 (0–1.5 h) | Collections, validators, indexes, deterministic seed with replay fixture | `seed` is repeatable |
| 2 (1.5–3 h) | Ingest API with idempotency and validation | Duplicate and malformed payloads give clear responses |
| 3 (3–5 h) | Detector, attribution, confidence, cost on findings | Planted cliff found, correct commit first, High confidence |
| 4 (5–7 h) | UI: timeline, culprit panel, breakdown bars, SSE, replay and reset | Replay button forms the cliff live |
| 5 (7–8.5 h) | Compare view, dependency impact table, revert preview | All three work from real data |
| 6 (8.5–9.5 h) | CLI, LLM step with fallback | `why-slow` output matches the UI |
| 7 (9.5–10 h) | README, architecture slide, two full rehearsals | Demo runs twice without edits |

**Team of 3:** one on ingest, seed and CLI; one on detector, attribution, confidence and impact aggregation; one on UI (timeline, bars, compare, revert preview, replay).

## 9. Demo script (about 5 min)

1. Run `buildcliff why-slow` and it reports clean. Show the runs in MongoDB.
2. Open the timeline and the dependency impact table, noting that history already contains smaller findings.
3. Press **Replay the cliff**. The timeline grows, the cliff appears, and the culprit panel opens with "+3m20s", High confidence and its reasons.
4. Show the breakdown bars, the compare view and the cost line, then toggle the revert preview.
5. Run `buildcliff why-slow` again, which now finds the regression.
6. Send a duplicate event and a malformed run through the API and show the clean responses.

## 10. Risks and cuts

- **Noise causes false detections:** tune thresholds on the seed first, and rely on the persistence rule.
- **Impact aggregation is the heaviest pipeline:** prototype it early in phase 3, and if it slips, compute it only for commits that have findings.
- **Cut order if behind:** revert preview, then click-two-points compare (keep the finding-based one), then the CLI `--step` flag. Never cut replay, confidence or the breakdown bars.
- **Cost credibility:** keep the assumptions visible and editable.

Want me to start with the seed generator and schema validators, or write this up as a shareable doc for your team?