# Direction reports: where the work went, how deep each project is, what next

The owner, 2026-11-02: "lets get directional daily and weekly reports of what's
getting worked on and what the depth of the projects are? ie the amount of work
on projects. with suggestions for the agents about what to do to move towards
higher value projects."

**Agents: read [`LATEST.md`](LATEST.md) before picking work with a free
choice.** It holds this week's and today's suggestions. They are advice built
from counts, not orders; a run with a better reason does that and says why in
its run record.

```
python3 portfolio/direction/report.py                     # yesterday (UTC), to stdout
python3 portfolio/direction/report.py --weekly            # last full ISO week (Mon-Mon)
python3 portfolio/direction/report.py --now               # the last 24 hours, up to now
python3 portfolio/direction/report.py --date 2026-10-28   # the day ending at that midnight
python3 portfolio/direction/report.py --write             # also daily/<date>.md, LATEST.md, LATEST.json
python3 portfolio/direction/report.py --weekly --write --json
```

A daily report takes about 10 s, a weekly one under a minute. In a shallow
cloud clone the script first fetches about two weeks of main (`--shallow-since`,
about 30 s); `--no-fetch` skips that and counts what is local.

| File | What it is |
|---|---|
| [`LATEST.md`](LATEST.md) | The latest weekly and daily suggestions, side by side |
| `LATEST.json` | The same, with every headline number, for scripts |
| [`daily/`](daily/) | One report per UTC day |
| [`weekly/`](weekly/) | One report per ISO week |

## What it counts

- **Commits on main** in the window, merges left out. Each commit gets one
  home: the project (`ventures/<slug>` or `research/<slug>`) or area holding
  most of its changed lines. Blog posts, agent docs and run records ride along
  with most PRs, so a commit lands in them only when it touched nothing else.
  One file counts at most 2,000 lines, so a regenerated data file does not
  decide a home. Commits are a proxy for effort, not a measure of it: one
  commit can be a typo or a solver.
- **Kind of work**, from the owner's own rankings, never this script's
  opinion: a flagship (`portfolio/flagships.yaml`), an open request
  (`portfolio/requests/requests.json`), a research programme
  (`research/PROGRAMMES.md`), a research project a programme's "Builds on"
  column names (`accel-*`, `qual-*`, ...), another venture or research project,
  or a calculator (slug ends in `-calculator` or `-estimator`, maintain only).
  **High-value share** is the first three over all project commits.
- **Depth.** *Size hours* is (code + test lines) / 20, a coarse rule of thumb
  for what the tree would take a person to write; data files and Markdown are
  left out, and agent-written padding inflates it, so read it as an order of
  magnitude. The owner's bar for depth is about 300 hours (`prompts/goals.md`,
  "Depth over calculators"). *Sessions* is the number of run records whose
  notes, projects or write-ups name the slug, to date. *Recorded hours* sums
  the human-hour estimates runs gave themselves (`runcost.py attach
  --human-hours`); few runs give one, so a blank is unmeasured, not zero.
- **Run records** dated in the window: the track mix against
  `prompts/routing.json` weights, and outcomes.
- **Baseline.** A daily report compares with the seven days before it; a
  weekly one with the week before.

## The suggestions

Each rule fires only on numbers it prints:

| Kind | Fires when |
|---|---|
| `shift` | high-value share under 50% |
| `untouched` | a flagship, request or unblocked programme got no commits (its `next` is quoted) |
| `unranked` | a project on no ranked list took 5%+ of project commits: rank it, or steer back |
| `calculator` | calculators got commits (maintain only) |
| `sprawl` | new projects under 20 size-hours started outside the ranked lists |
| `orphan-research` | research commits on projects no programme builds on |
| `busy-thin` | 3+ commits on a small unranked project: depth or churn? |
| `overhead` | guidance, CI, portfolio and records hold over 35% of commits |
| `keep-going` | deep (300+ size-hour) projects that got work |

The thresholds are constants at the top of `report.py`; change them with the
reason in the PR.

## Keeping it current

Software for the routine: `.github/workflows/direction-report.yml` runs
`--write` every day at 00:47 UTC (the report for the UTC day just ended) and
`--weekly --write` on Mondays, then commits the reports and `LATEST.*` to main.
It reads only git history and files: no secrets, no paid API. A run that changes
`flagships.yaml` or `PROGRAMMES.md` can regenerate `LATEST.md` in the same PR so
the suggestions match at once.

Tests: `python3 -m pytest -q portfolio/router/test_direction_report.py` (beside the
router, so the checklist line that already runs `portfolio/router` covers them).
