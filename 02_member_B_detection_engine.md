# Member B: Detection Engine, Attribution, Analytics and LLM

**You own:** change-point detector, culprit attribution, confidence scoring, cost translation, dependency impact aggregation, compare logic, LLM fix and summary.
**Depends on A for:** seed data (by hour 1.5), detector trigger after ingest.
**C depends on you for:** `/findings`, `/compare`, `/dependency-impacts`.

---

## Hour 0 to 0.5: Kickoff (all three together)
- [ ] Agree on the shared contract with A and C
- [ ] Own the **finding JSON shape**: `step`, `change_point_run_id`, `before_ms`, `after_ms`, `delta_ms`, `suspects[]`, `confidence`, `cost`, `llm`
- [ ] Commit a mock `finding.json`, `compare.json` and `dependency_impacts.json` to `/mocks` so C can start immediately

## Hour 0.5 to 1.5: Prototype on stub data
- [x] Do not wait for A: write a quick throwaway generator or use A's early sample for 1 step
- [x] Prototype the detector pipeline in the Mongo shell or a script
- [x] Draft the aggregation for the dependency impact table (the heaviest pipeline)

**Prototype command:** `npm run prototype:engine` runs
`backend/scripts/prototype-engine.mjs`. Following the Atlas cutover it requires
private `MONGODB_URI` configuration in `.env` and uses a disposable Atlas
database; it no longer downloads or starts local MongoDB. Run `npm ci` first.
The original Step 2 verification below used local MongoDB 8.0.17 before that
cutover. Those results are historical evidence, not current Atlas verification.

- Detector: no qualifying split after 0–4 successful slow runs; the fifth
  confirms the first slow run, with medians `70000 -> 270000 ms`.
  Seeded ±10% jitter, isolated spikes, failed/skipped steps, branch isolation,
  and below-threshold shifts do not confirm a cliff.
- Dependency impacts: six rows measured through `$lookup`, `$setWindowFields`,
  and `$merge`, including two zero-impact bumps and a `-30000 ms` speedup.
  Repeated/concurrent rebuilds preserve measurements; incomplete windows and
  deleted commits remove stale rows.
- Fixed an exposed boundary bug: an unbuilt commit could borrow unrelated
  default-branch runs through a timestamp fallback. Measurements now require
  an actual default-branch build of the commit or a proven descendant.
- Targeted verification:
  `node --test tests/engine/detection.test.mjs tests/engine/impacts.test.mjs`
  passed all four tests, including the unbuilt/descendant commit regression.

Step 2 is complete. This prototype is independent of A's real seed/ingest path
and does not replace that integration.

## Hour 1.5 to 3.5: Change-point detector
- [x] Pull successful runs per project, branch and step ordered by time (exclude failed runs)
- [x] Use `$unwind` on `steps` and `$setWindowFields` for rolling medians
- [x] Compare the median of the previous 10 runs with the median of the next 5
- [x] Flag a change point when all hold: jump >= 25% and >= 20 s, new window minimum above old window p75, shift persists across all 5 runs
- [x] Report the earliest qualifying run as the cliff; compute `delta_ms`
- [x] Do not fire a finding before 5 slow runs exist (needed for replay timing)
- [ ] Tune thresholds on the seed: the planted regressions are found, no false positives on normal jitter
- [x] Write findings to the `findings` collection; make reruns idempotent (no duplicate findings)
- [x] Expose `detect(project)` as a function for A to call after each ingest

**Step 3 detector implementation is verified; real-seed tuning remains pending.**
A's seed generator and accepted-run handler are not present in the repository.
The thresholds remain the contract's 25% and 20000 ms; synthetic checks are not
being presented as validation against A's planted events.

Verified behavior:
- A noisy plateau cannot create a second cliff merely because a rolling
  baseline still straddles the original shift. During that overlap, a distinct
  cliff must also clear the same jump thresholds against the prior confirmed
  plateau. A genuinely larger subsequent shift remains detectable.
- Eligibility uses exact medians. Published millisecond values are rounded once,
  with `delta_ms = after_ms - before_ms` and percentages/cost based on those
  published values.
- Successful step windows remain isolated across projects/branches/steps,
  including out-of-order inserts and tied timestamps.
- Same-project calls queue rather than drop work arriving during detection.
  A unique `finding_id` index protects concurrent engine instances.
- `npm run test:engine` passed all 33 tests. A separate disposable MongoDB/HTTP
  smoke verified clean responses through run four, one persisted finding after
  run five, an independent later cliff, repeat/restart idempotency, emitted
  finding events, and resolution after five recovered runs. The smoke did not
  exercise A's missing ingest API or SSE transport; its temporary script was
  removed.

### Ingest hook handoff to A

Create one engine instance after connecting MongoDB. Use A's shared database
handle and `emit(eventName, data)` publisher:

```js
import { createEngine } from './backend/src/engine/index.mjs';

const engine = createEngine({ db: getDb(), emit });
```

Inside A's accepted-run handler, call the hook **after successful persistence**,
without waiting before sending the ingest response. Illustrative Node HTTP code:

```js
response.writeHead(201, { 'content-type': 'application/json' });
response.end(JSON.stringify(accepted));

void engine.detect(run.project_id).catch(error => {
  console.error('Detection failed', { project_id: run.project_id, error });
});
```

Do not schedule analysis for rejected or duplicate submissions. `detect` returns
`{ created, updated }`: inserted findings and status updates, respectively.
`finding.created` carries the initial finding (`llm` may be null);
`finding.updated` carries explanation/status changes. A remains responsible for
SSE delivery and should avoid publishing the same mutation twice through both a
change-stream observer and this direct emitter.

This is an in-process hook, not a durable worker. A crash can interrupt analysis;
a later call rescans history. As of Step 7, explanation generation is background
work and no longer holds the detection queue. Impact aggregation can still hold
that queue. Resume pending explanations at startup and drain before closing the
database, as described in the Step 7 handoff below.

## Hour 3.5 to 5: Attribution and confidence
- [x] Suspect range: commits between the last good run's SHA and the first bad run's SHA
- [x] Deterministic scoring with a `reasons[]` per suspect:
  - [x] Lockfile or manifest touched (strong)
  - [x] Dockerfile, CI config or cache key touched (strong)
  - [x] Files related to the slow step (medium)
  - [x] Only commit in range (boost)
  - [x] Large diff (small boost)
- [x] Confidence badge: `High | Medium | Low` plus `reasons[]`
  - [x] Jump score: persistence 5/5, separation from baseline
  - [x] Attribution score: top score, margin over runner-up, commits in range, dependency change matches the slow step
- [ ] Planted cliff reads **High**; the 3-commit range reads **Low**
- [x] Attach confidence to the finding (implemented; current Atlas persistence verification remains pending)
- [ ] **Handoff to C (by hour 5):** `/findings/latest` returns real findings

**Step 4 core implementation and unit verification are complete. Atlas/API and
A's real planted-seed checks remain pending, not completed.**

The suspect range follows the proven `parent` chain, excluding the last-good
SHA and including the first-bad SHA. Timestamps do not add unrelated candidates.
Missing intermediate commits, disconnected history, and cycles produce no
suspects rather than presenting a partial path as a sole culprit.

Existing attribution weights are unchanged:

| Evidence category | Points |
|---|---:|
| Lockfile or manifest | 40 |
| Dependency matching the slow step | 30 |
| Docker configuration | 30 |
| CI configuration or cache-key evidence | 30 per distinct reason category |
| Step-related files | 20 |
| Sole commit in the proven range | 22 |
| Large diff (at least 1000 lines) | 5 |

Each reason category contributes at most once, even with repeated paths or
multiple manifests. Total suspect scores cap at 100; equal scores break ties by
SHA, independent of input order. Cache-key evidence requires an explicit
cache-key filename or CI configuration with cache-related summary evidence;
an arbitrary source filename containing `cache` no longer gets that credit.

Confidence retains the 35% timing / 65% attribution blend and the contract's
High >=75, Medium >=45, Low <45 thresholds. A top-two margin below 10 points now
caps the final score at 44: several strongly supported candidates are still
ambiguous if their evidence does not distinguish them. Multiple candidates do
not automatically force Low when one has a clear evidence advantage. The LLM
does not participate in ranking or confidence.

Verification:
- `npm run test:attribution`: all 14 unit tests passed, covering ancestry,
  missing/cyclic history, project isolation, deterministic ties, duplicate
  evidence, cache classification, and High/Medium/Low confidence.
- A direct execution of the actual scoring modules produced the expected
  clear, moderate, ambiguous-strong, and missing-history outcomes. Its temporary
  smoke script was removed. Document-store unit fixtures are not MongoDB proof.
- `npm run verify:attribution` loads the local `.env` and requires
  `MONGODB_URI`. There is no local MongoDB fallback. It creates a uniquely named
  `buildcliff_verify_*` database, exercises persisted clear/ambiguous/missing/
  incomplete-history findings through the real HTTP handlers, and deletes only
  that disposable database afterward. The database user must have the required
  create/write/index/drop permissions for this temporary database.
- The Atlas verifier's syntax and missing-configuration behavior were checked.
  No Atlas connection or persisted HTTP verification was possible: the local
  environment contains no MongoDB connection variable. Set the Atlas Drivers
  URI privately as `MONGODB_URI` in `.env`, then run the verifier. Do not commit
  or paste credentials into chat.

The findings response shape, reason codes, and Low-confidence full suspect list
remain unchanged. C's real-data handoff and A's planted-seed validation are not
marked complete until those external prerequisites can be exercised.

## Hour 5 to 6.5: Cost translation and compare
- [x] Cost: `delta per run x runs/week` (counted from the last 14 days) = extra CI hours/week
- [x] Two lines: engineer waiting time (hours x `blocking_fraction` x hourly rate) and runner cost (minutes x `$/min`)
- [ ] Return the assumptions with the cost so the UI can show them; recompute when A's assumptions endpoint changes them (B's hook is implemented; A's endpoint wiring remains pending)
- [x] Add a "reverting recovers ~X h/week" value on the finding for C's revert preview
- [x] Implement `GET /api/compare?a=...&b=...`: per-step `{a_ms, b_ms, delta_ms, delta_pct}`, commits between the two, and dependency changes (Atlas HTTP verification pending)
- [x] Default compare uses typical before (median of 10) vs typical after (median of 5) from a finding; also support single runs
- [ ] Verify persisted costs and both comparison HTTP modes on Atlas, then integrate with A's real settings endpoint

**Step 5 core implementation is unit-verified; Atlas and A-owned endpoint
integration are still outstanding.**

Cost behavior:
- `getRunsPerWeek(project_id)` counts all project runs in the inclusive past
  14 days through now, then divides by two. Failed runs and other branches count;
  future/older runs and other projects do not.
- CI hours, engineer waiting cost, runner cost, and recovered hours use
  full-precision intermediate arithmetic. Only final fields are rounded.
  Zero rates/activity remain zero without discarding small positive costs.
- `recomputeCosts(project_id)` updates only active findings. It atomically
  returns the current updated document and publishes that as `finding.updated`,
  excluding Mongo `_id`. This fixes an old snapshot overwriting a concurrently
  completed explanation in the event payload. Findings resolved before the
  write are skipped.
- A must validate/save merged assumptions before calling
  `await engine.recomputeCosts(project_id)` and use its returned count as
  `findings_recomputed`. A's settings HTTP endpoint was not implemented here.

Comparison behavior:
- Finding mode uses the detector's successful per-step 10/5 window and the
  finding's stored median breakdown. Failed/skipped/missing target steps do not
  consume window slots. Incomplete windows fail rather than inventing medians.
- Individual-run mode includes every recorded step duration, even from failed
  or skipped steps; it does not apply the detector's eligibility filter.
- Added/removed steps use zero on the absent side. A zero baseline yields
  `delta_pct: null` for a nonzero new duration, or zero when both are zero.
- Per-step rows sort by descending delta. Reversing run order reverses duration
  changes, but commit/dependency metadata retains chronological ancestry.
  Suspects are flagged only for finding-based comparisons.
- Invalid/mixed modes return 400; unknown or cross-project/branch entities
  return 404. Comparison side totals sum the displayed step durations.

Verification and handoff:
- `npm run test:analytics`: all 11 analytics unit tests passed.
  `npm run test:attribution`: all 14 attribution regression tests passed.
- A direct module smoke exercised actual cost/recompute/compare code using
  explicit unit document fixtures. It verified current explanation data in
  cost events and measured failed/skipped-step deltas; it was not MongoDB or
  HTTP persistence evidence. The temporary script was removed.
- `npm run verify:analytics` is the Atlas verification command. It requires
  private `MONGODB_URI` configuration, creates only a random `buildcliff_verify_*`
  database, exercises actual persisted costs and comparison HTTP responses,
  directly saves assumptions before invoking B's hook, and removes its database.
  It does not pretend to exercise A's missing settings endpoint.
- The verifier's syntax and missing-configuration path were exercised. It exited
  explicitly because `MONGODB_URI` is absent; no local MongoDB fallback was used.
  Atlas success has not been observed.
- A/C contract handoff for Step 5 used version 1.1. No response fields
  changed. It clarifies comparison/frequency semantics and corrects the sample
  total from 118.54 to 118.53, consistent with unrounded intermediate costs and
  the existing mocks. Separately rounded displayed costs can sum one cent
  differently from the correctly rounded total.

## Hour 6.5 to 8: Dependency impact table
- [x] Implement median comparisons for every dependency-changing commit using `$lookup` and `$setWindowFields`, not only commits with findings
- [x] Retain bumps with no measurable impact and speedups
- [x] Materialize results with `$merge`; expose recomputation hooks after ingest/reset
- [x] Implement `GET /api/dependency-impacts`, sorted by slowdown, with finding links and required `compare: {a, b}` targets
- [ ] Verify six real Atlas rows, including at least two near-zero, and their HTTP navigation targets
- [ ] Rebuild existing application rows for contract v1.2 and integrate A's real ingest/reset path

**Step 6 implementation is present; its updated MongoDB aggregation and HTTP
flow are not yet verified on Atlas.**

Measurement and navigation:
- Use exactly 10 successful measured-step runs before and 5 after, restricted
  to the project's default branch. An actual run of the dependency-changing
  commit or a proven descendant is required; unbuilt commits do not borrow
  unrelated runs. Incomplete windows are omitted, never reported as zero.
- Choose the step with the largest absolute delta, retain zero/negative rows,
  and sort the endpoint by signed delta descending. Shared window constants
  now keep detection and impact measurement aligned.
- Every row carries `compare.a` (last successful measured-step baseline run)
  and `compare.b` (first successful measured-step after run). These are an
  adjacent run pair, not an assertion that two individual runs equal the
  reported median-window impact. Use the project's default branch in compare
  requests, including when it is not `main`.
- Finding links now require both the measured step and default branch; an
  unrelated-step finding is not used merely because it contains the same SHA.
  Negative half-percent rounding was adjusted to round away from zero rather
  than toward zero. Native regressions cover this behavior but have not run.
- Rebuilds retain the existing same-project queue across factories sharing
  the same Db handle, `$merge` upserts, project-scoped stale-row cleanup, and
  `impacts.updated` publication. This is not a cross-process lock or an atomic
  multi-collection transaction.

Verification:
- Added five Atlas integration cases for descendant anchors, successful-step
  comparison targets, six-row/no-finding measurements, speedups/zeros,
  same-step links, project/branch isolation, repeated/concurrent rebuilds,
  reset cleanup, negative rounding, and multiple dependencies.
- `npm run test:impacts` failed in its credential prerequisite hook: all five
  bodies were blocked by missing `MONGODB_URI`. They are not passing results.
- `npm run verify:impacts` is the real Atlas/HTTP smoke. It creates only a random
  `buildcliff_verify_*` database, follows every comparison/finding target, checks
  empty/reset behavior, and removes its database. Its syntax and explicit
  missing-URI exit were checked; the actual database flow remains unobserved.
- All 11 analytics and 14 attribution unit regressions passed. A temporary
  contract/mock smoke verified new navigation fields and that synthetic
  branch-aware target IDs resolve inside the verifier fixture. It did not
  execute MongoDB aggregation; its script was removed.
- All changed JavaScript files passed syntax checks. Removed the obsolete
  `mongodb-memory-server` dependency and migrated detection/impact integration
  tests and the old prototype command to Atlas-only operation. Integration
  commands now load `.env` explicitly and fail when credentials are absent.
  No local MongoDB fallback was used.

Deployment/handoff:
- Contract v1.2 and `mocks/dependency_impacts.json` include the required targets.
  Rebuild every project's existing rows once with
  `await engine.recomputeImpacts(project_id)` before serving the v1.2 table.
  Old materialized rows are not silently shimmed.
- A should use a shared Db handle for engine factories. `detect(project_id)`
  already recomputes impacts after runs; accepted commits and completed reset
  deletions should call `recomputeImpacts(project_id)` directly.
- C should prefer a finding link when `finding_id` exists; otherwise call
  `/api/compare` with `project_id`, `branch=project.default_branch`, and the
  row's `compare.a` / `compare.b`. Keep near-zero rows muted, not filtered.
- Atlas URI configuration, the real application-row rebuild, A's ingest/reset
  endpoint wiring, and real-seed validation remain external prerequisites.

## Hour 8 to 9: LLM step
- [x] Input: finding, top suspect's diff summary, dependency delta, step name
- [x] Output JSON: `suggested_fix` and `channel_summary`
- [x] Template-based fallback if the API call fails or times out
- [x] Implement reset-safe background persistence in `finding.llm`
- [x] The LLM never chooses the culprit; ranking stays deterministic
- [ ] Verify real GPT-5 nano responses with the user's Gateway credits and complete Atlas-backed lifecycle checks

**Step 7 core is implemented and locally verified. Live Gateway and Atlas
verification are pending private credentials.**

Configuration and request:
- Add `AI_GATEWAY_API_KEY` privately to the existing ignored `.env`.
  `AI_GATEWAY_MODEL` defaults to the user-selected `openai/gpt-5-nano`.
  `.env.example` lists the keys; do not overwrite an existing `.env`.
- Use Vercel AI Gateway Chat Completions at
  `https://ai-gateway.vercel.sh/v1/chat/completions` through native Node fetch.
  No new SDK dependency, legacy `OPENAI_*` configuration, or application-level
  model failover/retry was added. Gateway's own routing remains its default.
- Request strict two-string JSON Schema, `reasoning_effort: minimal`, and
  `max_completion_tokens: 2048`, without unsupported `temperature` or legacy
  `max_tokens`. Model overrides must support the configured request controls.
- Send only bounded timings, confidence reasons, dependency changes, and the
  ranked suspect's short message/diff summary—not full source, logs, or keys.
  Treat commit text as untrusted data. The provider does not execute tools.
- Accept only a complete `stop` response with exactly two nonempty strings,
  limited to 1600/800 characters. Reject extras, refusal, truncation, malformed
  output, and excessive content into the deterministic template. Source and
  timestamp are server-owned. The default 8000 ms deadline covers headers and
  body parsing and aborts stalled transport; callers can inject `timeoutMs`.
- Schema checks do not prove recommendations are correct. Keep fixes advisory,
  preserve uncertainty, and review real High/Low-confidence model output.

Background lifecycle:
- Publish/persist the finding first with `llm: null`, then schedule generation
  without awaiting the provider. `detect()` retains `{created, updated}` for
  inserted findings/status updates, not a count of asynchronous explanation
  writes.
- A should call `await engine.resumeExplanations()` once after database startup.
  An optional project ID scopes recovery; detection also resumes its project's
  null explanations automatically. Resume returns the number of jobs queued,
  not a count of paid requests or completed results.
- Factories sharing one Db handle deduplicate in-flight work by persisted
  identity. Writes match the original `_id` plus `llm: null`: reset/replay can
  reuse a public finding ID without accepting an old response. A concurrent
  completed result also wins over a late response.
- Updates write only the explanation and emit the atomically current full
  finding without Mongo `_id`, preserving newer cost/status changes.
- After stopping new ingest, A should `await engine.drainExplanations()` before
  closing MongoDB. It waits ongoing detection as well as explanation tasks.
  Unexpected DB/publication errors are logged without credentials and surfaced
  by drain; null work can be resumed on the next startup/detection.
- Completed templates and LLM text are cached. Adding a key/changing model does
  not regenerate them; new or interrupted/null findings use the current config.
  This is process-local recovery, not a durable queue or exactly-once billing
  across independent server processes. Serverless hosting needs an appropriate
  lifecycle hook to keep background work alive after the HTTP response.

Verification and limits:
- `npm run test:llm`: all 44 provider-boundary/background-lifecycle tests passed.
  The 11 analytics and 14 attribution regressions also passed (69 non-DB tests).
  Old incidental wording/endpoint-alias tests were removed, not re-pinned.
- A real loopback HTTP/fetch smoke checked the Gateway request shape, background
  return while a response was gated, current-state publication, and deadline
  fallback on an actual stalled HTTP body. It used a controlled provider and
  unit document fixtures, not GPT-5 nano or Atlas. Its script was removed.
- A second real HTTP smoke reproduced an unread HTTP 503 body remaining open
  after fallback, then passed after failed transports were explicitly aborted.
  A permanent real-HTTP regression now checks connection closure; the throwaway
  reproducer was removed. All 69 non-database tests passed again after the fix.
- Added an Atlas regression for nonblocking detection and reset/recreated
  identity protection using a controlled provider. That native case and other
  database regressions remain unexecuted without `MONGODB_URI`.
- `npm run verify:llm` makes at most two application Gateway requests (synthetic
  High/Low inputs), requires `source: llm`, prints actual elapsed time/text for
  quality review, and does not accept a template as live success.
- `npm run verify:explanations` requires both credentials and uses one application
  Gateway request in a disposable Atlas database. It checks persistence, events,
  actual read API responses, unchanged deterministic facts, and no regeneration
  on repeated detection. A's real ingest/SSE and C's UI are not exercised.
- Both live commands were attempted and exited at missing-credential checks:
  neither `AI_GATEWAY_API_KEY` nor `MONGODB_URI` was available. No live model
  output, latency benchmark, free-tier eligibility, or Atlas success is claimed.
  Changed source files passed syntax checks; other Atlas verifiers/native test
  teardown now drain explanations before deleting their databases.

Official request references:
- [Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions)
- [Gateway reasoning controls](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/reasoning)
- [Gateway structured outputs](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/structured-outputs)

## Hour 9 to 10: Wrap-up (all three)
- [ ] Re-tune thresholds after replay is final
- [ ] Verify finding numbers match between UI and CLI
- [ ] Two full rehearsals

## Definition of done
- Planted regression found, correct commit ranked first, High confidence
- Ambiguous range reads Low with candidates listed
- Cost, compare and dependency impact endpoints return real data
- LLM fix and summary present, with fallback working
