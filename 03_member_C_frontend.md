# Member C: Frontend and Demo Experience

**You own:** the web UI: timeline, culprit panel, confidence badge, step breakdown bars, compare view, dependency impact table, cost display, revert preview, replay and reset controls.
**Depends on:** A for `/runs`, `/stream`, `/demo/*` (by hour 5); B for `/findings`, `/compare`, `/dependency-impacts` (by hour 5).
**Until then:** build against the mock JSON files in `/mocks`.

---

## Hour 0 to 0.5: Kickoff (all three together)
- [ ] Agree on the shared contract with A and B
- [ ] Get the mock responses for runs, finding, compare and dependency impacts
- [ ] Choose the UI stack (React + Recharts suggested)

## Hour 0.5 to 2: App shell and data layer
- [ ] Scaffold the app, routing, and layout (timeline page, compare page, dependency table page)
- [ ] API client module with a switch between mock data and the real API
- [ ] SSE hook for `/stream` that updates state on new runs and new findings
- [ ] Project and step selector

## Hour 2 to 4: Timeline
- [ ] Line chart of step durations over runs, one line per step, with a step selector
- [ ] Failed runs shown distinctly (muted marker)
- [ ] Cliff marker on the chart, positioned from the finding's `change_point_run_id`
- [ ] Clicking the marker opens the culprit panel
- [ ] Chart grows smoothly when new runs arrive via SSE (no full re-render flash)

## Hour 4 to 6: Culprit panel
- [ ] Panel contents: commit SHA, author, message, `+3m20s` delta, `before -> after`
- [ ] **Confidence badge** (High / Medium / Low) with reason chips: positive (checkmark) and negative (warning)
- [ ] Low confidence shows the ranked candidate list instead of a single culprit
- [ ] **Step breakdown bars:** stacked bar per run, one color per step, jumped step highlighted; show median before vs after
- [ ] Suggested fix and channel summary from `finding.llm`, with a Copy summary button
- [ ] **Cost block:** extra CI hours/week, engineer waiting cost and runner cost, with assumptions shown and editable (calls `PATCH /projects/:id/assumptions`)
- [ ] **Handoff check (hour 5):** switch from mocks to the real API for runs, stream and findings

**B explanation handoff, contract v1.3:** render the deterministic finding while
`llm` is null, show an explanation-pending state, and replace it on
`finding.updated`. Both `source: llm` and `source: template` contain usable
text. Render it as advisory text, not executable commands or trusted HTML.
Ranking/confidence never come from the model; do not infer them from its prose.

## Hour 6 to 7: Replay and revert preview
- [ ] **Replay the cliff** button calling `POST /demo/replay`; disable while running, show progress
- [ ] **Reset demo** button calling `POST /demo/reset`
- [ ] After replay run 5, the cliff marker and culprit panel appear without a page refresh
- [ ] **Auto-revert preview** toggle: dashed line at `before_ms` from the cliff onward, shaded area labeled "time won back", label as "projected"
- [ ] Cost block updates to "reverting recovers ~X h/week" when the toggle is on

## Hour 7 to 8.5: Compare view and dependency table
- [ ] **Compare view:** two stacked bars side by side, diff table (`a_ms`, `b_ms`, `delta_ms`, `delta_pct`), commit list with suspects flagged, dependency changes between the two
- [ ] Open from the finding (typical before vs after); allow clicking two timeline points to compare single runs
- [ ] **Dependency impact table:** columns dependency, version change, step hit, delta time, runs compared; sortable by impact; near-zero rows visibly muted; each row links to its finding or compare view

**B handoff, contract v1.2:** every impact row has `compare: {a, b}`. Prefer
`finding_id` when present; otherwise request `/api/compare` with `project_id`,
`branch=project.default_branch`, and those run IDs. The pair is not the full
median window, so its delta can differ from the impact row under ordinary
jitter. Keep near-zero/speedup rows and handle null percentages. A/B must
rebuild existing impact rows before the v1.2 table is served.

## Hour 8.5 to 9: Polish
- [ ] Empty state for a clean project ("no regression detected")
- [ ] Loading and error states for every API call
- [ ] Show API error messages cleanly (needed for the malformed-event demo)
- [ ] Readable at projector size: larger fonts, high contrast
- [ ] Format durations consistently (`3m20s`)

## Hour 9 to 10: Wrap-up (all three)
- [ ] Architecture slide visuals
- [ ] Two full rehearsals, using reset between runs
- [ ] Screenshot fallback in case the live demo fails

## Cut order if behind
1. Revert preview
2. Click-two-points compare (keep the finding-based compare)
3. Never cut: replay button, confidence badge, step breakdown bars

## Definition of done
- Pressing Replay grows the timeline live and the cliff and culprit panel appear after run 5
- Confidence badge and reasons render for both High and Low cases
- Breakdown bars, compare view, dependency table, cost block and revert preview all run from real API data
- UI numbers match the CLI output
