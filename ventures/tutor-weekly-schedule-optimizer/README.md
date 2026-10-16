# Tutor Weekly Schedule Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tutor-weekly-schedule-optimizer/>

A free browser tool for private tutors, music teachers, coaches and instructors: **list your students with what they pay and when they can come, give the hours you teach, and get the weekly timetable that earns the most.** It respects the gap you need between lessons, daily limits, the cost of opening a day and students you will not drop. Nothing is uploaded.

After using this, you can **stop building the timetable by hand as students arrive**: see which students to book where, what a first-come timetable would have cost you, and which single question to ask a family (could Wednesday work?) is worth the most.

## Model

- Each student has a fee, a lesson length, a window (earliest start, latest finish) and the days they can attend. You have open hours per day, a gap between lessons, a most-lessons and most-hours cap per day, an optional cost to open each day and an optional cost per lesson.
- For every day, a subset DP finds the earliest possible finish for every group of students that fits (release times, deadlines and gaps); a group is feasible exactly when that finish meets every deadline. A second DP over the seven days picks one feasible group per day so no student is used twice, maximising fees minus per-lesson costs minus day costs. This is exact. A randomised test compares it with exhaustive search over every assignment and ordering.
- Must-keep students are given priority over any combination of others; if one cannot fit, the tool says so.
- The comparison timetable is greedy: highest fee per minute first, earliest slot that fits, no reshuffling.
- Suggestions re-solve the whole week with one change (an hour later or earlier on a day, a student's finish time an hour later, a student available on any day, a closed day opened) and report the exact gain.

Not modelled: lessons that alternate weeks, cancellations, group lessons, travel between venues beyond the fixed gap, fee changes.

Up to 12 students, so the exact search stays interactive.

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
