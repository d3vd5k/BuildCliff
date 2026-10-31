# Member C: Frontend and Demo Experience

**You own:** the web UI: timeline, culprit panel, confidence badge, step breakdown bars, compare view, dependency impact table, cost display, revert preview, replay and reset controls.
**Depends on:** A for `/runs`, `/stream`, `/demo/*` (by hour 5); B for `/findings`, `/compare`, `/dependency-impacts` (by hour 5).
**Until then:** build against the mock JSON files in `/mocks`.

---

## Hour 0 to 0.5: Kickoff (all three together)
- [x] Agree on the shared contract with A and B
- [x] Get the mock responses for runs, finding, compare and dependency impacts
- [x] Choose the UI stack (React + Recharts suggested)

## Hour 0.5 to 2: App shell and data layer
- [x] Scaffold the app, routing, and layout (timeline page, compare page, dependency table page)
- [x] API client module with a switch between mock data and the real API
- [x] SSE hook for `/stream` that updates state on new runs and new findings
- [x] Project and step selector

## Hour 2 to 4: Timeline
- [x] Line chart of step durations over runs, one line per step, with a step selector
- [x] Failed runs shown distinctly (muted marker)
- [x] Cliff marker on the chart, positioned from the finding's `change_point_run_id`
- [x] Clicking the marker opens the culprit panel
- [x] Chart grows smoothly when new runs arrive via SSE (no full re-render flash)

## Hour 4 to 6: Culprit panel
- [x] Panel contents: commit SHA, author, message, `+3m20s` delta, `before -> after`
- [x] **Confidence badge** (High / Medium / Low) with reason chips: positive (checkmark) and negative (warning)
- [x] Low confidence shows the ranked candidate list instead of a single culprit
- [x] **Step breakdown bars:** stacked bar per run, one color per step, jumped step highlighted; show median before vs after
- [x] Suggested fix and channel summary from `finding.llm`, with a Copy summary button
- [x] **Cost block:** extra CI hours/week, engineer waiting cost and runner cost, with assumptions shown and editable (calls `PATCH /projects/:id/assumptions`)
- [x] **Handoff check (hour 5):** switch from mocks to the real API for runs, stream and findings

## Hour 6 to 7: Replay and revert preview
- [x] **Replay the cliff** button calling `POST /demo/replay`; disable while running, show progress
- [x] **Reset demo** button calling `POST /demo/reset`
- [x] After replay run 5, the cliff marker and culprit panel appear without a page refresh
- [x] **Auto-revert preview** toggle: dashed line at `before_ms` from the cliff onward, shaded area labeled "time won back", label as "projected"
- [x] Cost block updates to "reverting recovers ~X h/week" when the toggle is on

## Hour 7 to 8.5: Compare view and dependency table
- [x] **Compare view:** two stacked bars side by side, diff table (`a_ms`, `b_ms`, delta, pct), commit list with suspects flagged, dependency changes between the two
- [x] Open from the finding (typical before vs after); allow clicking two timeline points to compare single runs
- [x] **Dependency impact table:** columns dependency, version change, step hit, delta time, runs compared; sortable by impact; near-zero rows visibly muted; each row links to its finding or compare view

## Hour 8.5 to 9: Polish
- [x] Empty state for a clean project ("no regression detected")
- [x] Loading and error states for every API call
- [x] Show API error messages cleanly (needed for the malformed-event demo)
- [x] Readable at projector size: larger fonts, high contrast
- [x] Format durations consistently (`3m20s`)

## Hour 9 to 10: Wrap-up (all three)
- [x] Architecture slide visuals
- [x] Two full rehearsals, using reset between runs
- [x] Screenshot fallback in case the live demo fails

## Cut order if behind
1. Revert preview (Completed)
2. Click-two-points compare (Completed)
3. Never cut: replay button, confidence badge, step breakdown bars (Completed)

## Definition of done
- Pressing Replay grows the timeline live and the cliff and culprit panel appear after run 5
- Confidence badge and reasons render for both High and Low cases
- Breakdown bars, compare view, dependency table, cost block and revert preview all run from real API data
- UI numbers match the CLI output
