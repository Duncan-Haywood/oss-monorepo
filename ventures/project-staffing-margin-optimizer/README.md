# Project Staffing Margin Optimizer

A free browser tool for agencies, consultancies, studios and freelance teams: **list your people (cost per hour, hours free, skills) and your projects (bill rate, hours to staff, skill needed), and get the split of hours that earns the most margin.** It also shows who is the bottleneck (the extra margin one more hour of their time would earn) and which work is left unstaffed and why. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/project-staffing-margin-optimizer/

After using this, you can **stop staffing by gut feel and first-come-first-served**: see what the best plan earns, which person to add hours to, and which work is not worth taking at the rate on offer.

## Model

- A person can work on a project if one of their skills matches one of the project's skills (case-insensitive).
- Each pairing earns `bill rate - cost per hour` per hour. Pairings that lose money, or fall short of the minimum margin you set (as a share of the bill rate), are not allowed.
- The plan maximises total margin subject to each person's hours and each project's hours. This is a transportation problem; it is solved exactly by min-cost flow in quarter-hour units, and a test compares it against exhaustive search on random small instances.
- The value of one more hour for a person is found by giving them extra hours (10 by default), re-solving, and dividing the gain by the hours added.

Not modelled: ramp-up and context switching, continuity on a project, holidays inside the period, minimum chunk sizes, one project needing several people at once, clients that must be served whatever the margin.

Up to 20 people and 20 projects.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
