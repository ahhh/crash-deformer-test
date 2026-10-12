# Perf investigation, October 2026

Working notes for the perf program (owner targets: phones 90 fps = 11.1 ms/frame, desktop 240 fps at 2K = 4.17 ms/frame, every course and scene). Raw material for the plan that follows; nothing here is a decision.

| File | What |
|---|---|
| `measurements.md` | Every number taken so far: stage-by-stage regression, live benches per device, browser profiles (top self functions), node call counts, A/B rows of each cut, harness definitions |
| `leads.md` | Open hotspots and candidate cuts, ranked, each with its measured share, the exact change, whether it is bit-identical or sim-changing, and status (idea / probed / lane running / landed) |
| `references.md` | Outside material: Carmageddon (dethrace) techniques, library fit review, the two vehicle-feel talks, profiles and reports kept outside the repo |

Harnesses and scratch trees live outside the repo (`~/crash-wt/`, see `measurements.md` §Harnesses). Agent reports (`rev-*`) are session artefacts; their substance is copied here as it lands.
