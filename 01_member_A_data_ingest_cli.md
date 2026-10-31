# Member A: Data, Ingest, Demo Mode and CLI

**You own:** MongoDB setup, seed data, ingest API, server skeleton, live stream, replay/reset, CLI.
**Others depend on you for:** seed data (B), `/runs`, `/stream`, `/demo/*` endpoints (C).

---

## Hour 0 to 0.5: Kickoff (all three together)
- [ ] Create the repo, folder layout, and shared `.env` with the Atlas connection string
- [ ] Agree on the shared contract with B and C: collection field names, finding JSON shape, API response shapes
- [ ] Commit the contract to `/docs/contract.md` and `/mocks/*.json`

## Hour 0.5 to 1.5: Database and seed
- [ ] Create Atlas cluster and database; add team IPs
- [ ] Create collections: `runs`, `commits`, `events`, `findings`, `dependency_impacts`, `projects`
- [ ] Add schema validation on `runs` (required: `run_id`, `project_id`, `commit_sha`, `started_at`, non-empty `steps[]` with numeric durations)
- [ ] Add indexes: unique `runs.run_id`, `events.event_id`, `commits.sha`; compound `runs {project_id, branch, started_at}`
- [ ] Build a deterministic seed generator (fixed RNG seed, `npm run seed`):
  - [ ] About 120 runs, 5 steps (`checkout`, `install`, `build`, `test`, `deploy`), ±10% jitter, a few failed runs
  - [ ] Timestamps relative to now
  - [ ] Matching commits with `files_changed[]` and `dep_changes[]`
  - [ ] Planted events: `webpack` bump (`build` +40 s), cache-key change (`install` +25 s), 2 dependency bumps with no effect, one range with 3 commits between two runs (low-confidence case)
  - [ ] Hold back the demo cliff (`puppeteer` 21 to 22, `install` +200 s) into `replay_fixture.json`: 1 culprit commit plus 5 slow runs
- [ ] Seed one `projects` document with default cost assumptions
- [ ] **Handoff to B (by hour 1.5):** seed is runnable and the database is populated

## Hour 1.5 to 3: Ingest API
- [ ] Server skeleton (shared with the team's chosen stack)
- [ ] `POST /ingest/run` and `POST /ingest/commit`
- [ ] Idempotency: store raw payload in `events` with unique `event_id`; duplicate returns `200 duplicate ignored`
- [ ] Validation errors return `400` with a clear message naming the missing field
- [ ] Failed CI runs are stored with `status: failed`
- [ ] `GET /runs?project&step&branch` for the timeline
- [ ] `PATCH /projects/:id/assumptions` for cost settings
- [ ] Test the failure cases: duplicate event, run missing `commit_sha`, failed job

## Hour 3 to 5: Live stream and demo mode
- [ ] Change stream on `runs` and `findings`
- [ ] `GET /stream` (SSE) pushing new run and new finding events to the UI
- [ ] `POST /demo/replay`: ingest the fixture commit, then 5 runs about 1.5 s apart, through the normal ingest path; tag runs `demo_replay: true`
- [ ] `POST /demo/reset`: delete replayed runs, the replay commit, and the resulting finding
- [ ] Trigger B's detector after each ingest (agree on the hook: function call or queue)
- [ ] Test reset and replay at least 5 times in a row
- [ ] **Handoff to C (by hour 5):** `/stream`, `/runs` and `/demo/*` working against real data

**B handoff, contract v1.2:** use the shared Db handle when creating the engine.
`detect(project_id)` already recomputes impacts after runs; call
`recomputeImpacts(project_id)` after accepted commits and completed reset
deletions. Rebuild each project's existing materialized rows once before
serving the v1.2 impact table so all rows have `compare: {a, b}` targets.

**B explanation handoff, contract v1.3:** after database startup, call
`await engine.resumeExplanations()` to queue persisted null explanations.
`detect()` no longer awaits the provider. During shutdown, stop accepting
ingest, then `await engine.drainExplanations()` before closing MongoDB; handle
its errors. Use a persistent Node process or the host's explicit background
lifecycle support—do not assume a serverless response keeps work alive.
The CLI must tolerate `finding.llm === null` (show pending text) without
changing regression exit codes. A later `finding.updated` carries the result.

## Hour 5 to 7: Support integration
- [ ] Help B wire the detector trigger and finding writes
- [ ] Fix integration bugs raised by C
- [ ] Confirm change stream events reach the UI without refresh

## Hour 7 to 9: CLI
- [ ] `buildcliff why-slow` as a thin client over `GET /findings/latest`
- [ ] Flags: `--project`, `--step`, `--json`
- [ ] Output: step, `1m10s -> 4m30s (+3m20s)`, culprit commit, confidence and reasons, ASCII step breakdown, cost line, suggested fix
- [ ] Exit code 1 when an active regression exists, 0 when clean
- [ ] Clean-state output ("no regression found") works before replay
- [ ] Verify CLI numbers match the UI

## Hour 9 to 10: Wrap-up (all three)
- [ ] README with setup steps (`seed`, run server, run UI)
- [ ] Architecture slide (data flow diagram)
- [ ] Two full demo rehearsals, including reset between runs
- [ ] Prepare the failure-case demo: send a duplicate event and a malformed run live

## Definition of done
- `seed` is repeatable and produces identical data
- Duplicate and malformed payloads return clean responses
- Replay forms the cliff live; reset returns to the clean state
- CLI is clean before replay and flags the regression after
