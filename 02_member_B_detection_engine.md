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
- [ ] Do not wait for A: write a quick throwaway generator or use A's early sample for 1 step
- [ ] Prototype the detector pipeline in the Mongo shell or a script
- [ ] Draft the aggregation for the dependency impact table (the heaviest pipeline)

## Hour 1.5 to 3.5: Change-point detector
- [ ] Pull successful runs per project, branch and step ordered by time (exclude failed runs)
- [ ] Use `$unwind` on `steps` and `$setWindowFields` for rolling medians
- [ ] Compare the median of the previous 10 runs with the median of the next 5
- [ ] Flag a change point when all hold: jump >= 25% and >= 20 s, new window minimum above old window p75, shift persists across all 5 runs
- [ ] Report the earliest qualifying run as the cliff; compute `delta_ms`
- [ ] Do not fire a finding before 5 slow runs exist (needed for replay timing)
- [ ] Tune thresholds on the seed: the planted regressions are found, no false positives on normal jitter
- [ ] Write findings to the `findings` collection; make reruns idempotent (no duplicate findings)
- [ ] Expose `detect(project)` as a function for A to call after each ingest

## Hour 3.5 to 5: Attribution and confidence
- [ ] Suspect range: commits between the last good run's SHA and the first bad run's SHA
- [ ] Deterministic scoring with a `reasons[]` per suspect:
  - [ ] Lockfile or manifest touched (strong)
  - [ ] Dockerfile, CI config or cache key touched (strong)
  - [ ] Files related to the slow step (medium)
  - [ ] Only commit in range (boost)
  - [ ] Large diff (small boost)
- [ ] Confidence badge: `High | Medium | Low` plus `reasons[]`
  - [ ] Jump score: persistence 5/5, separation from baseline
  - [ ] Attribution score: top score, margin over runner-up, commits in range, dependency change matches the slow step
- [ ] Planted cliff reads **High**; the 3-commit range reads **Low**
- [ ] Attach confidence to the finding
- [ ] **Handoff to C (by hour 5):** `/findings/latest` returns real findings

## Hour 5 to 6.5: Cost translation and compare
- [ ] Cost: `delta per run x runs/week` (counted from the last 14 days) = extra CI hours/week
- [ ] Two lines: engineer waiting time (hours x `blocking_fraction` x hourly rate) and runner cost (minutes x `$/min`)
- [ ] Return the assumptions with the cost so the UI can show them; recompute when A's assumptions endpoint changes them
- [ ] Add a "reverting recovers ~X h/week" value on the finding for C's revert preview
- [ ] `GET /compare?a=...&b=...`: per-step `{a_ms, b_ms, delta, pct}`, commits between the two, dependency changes between them
- [ ] Default compare uses typical before (median of 10) vs typical after (median of 5) from a finding; also support single runs

## Hour 6.5 to 8: Dependency impact table
- [ ] For every commit with `dep_changes`, compare each step's median over N runs before and after (`$lookup` plus `$setWindowFields`)
- [ ] Include bumps with no measurable impact (near-zero rows)
- [ ] Write results with `$merge` into `dependency_impacts`; recompute after each ingest batch
- [ ] `GET /dependency-impacts` sorted by impact, with a link field to the finding or compare view
- [ ] Table has about 6 rows including at least 2 near-zero
- [ ] If this slips: compute only for commits that have findings

## Hour 8 to 9: LLM step
- [ ] Input: finding, top suspect's diff summary, dependency delta, step name
- [ ] Output JSON: `suggested_fix` and `channel_summary`
- [ ] Template-based fallback if the API call fails or times out
- [ ] Store in `finding.llm`
- [ ] The LLM never chooses the culprit; ranking stays deterministic

## Hour 9 to 10: Wrap-up (all three)
- [ ] Re-tune thresholds after replay is final
- [ ] Verify finding numbers match between UI and CLI
- [ ] Two full rehearsals

## Definition of done
- Planted regression found, correct commit ranked first, High confidence
- Ambiguous range reads Low with candidates listed
- Cost, compare and dependency impact endpoints return real data
- LLM fix and summary present, with fallback working
