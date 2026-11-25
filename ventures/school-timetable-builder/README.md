# School Timetable Builder

Free, browser-only timetable generator for small and mid-size schools,
departments, tutoring and language centres. Type one line per lesson
(`7A: Maths / Okafor / 5`), with rooms, double periods, joint classes and
teachers' periods off; it builds a weekly timetable where no class, teacher or
room is double-booked, then squeezes out class gaps, teacher gaps and the same
subject twice in a day. Views and prints per class, teacher and room; exports
CSV; a share link carries the list in the URL fragment (never sent to a
server). Nothing is uploaded.

**Live tool:** https://marisstella.app/school-timetable-builder/

## What you use today, and what this does differently

- **A spreadsheet:** free, but every moved lesson can create a clash you only
  find on the first Monday.
- **aSc TimeTables, Untis and similar suites:** paid, mature, with
  substitution planning and school-system links. Use them if you need those.
- **FET:** free to use and source available (GPL), very capable, but a desktop program
  with a long learning curve.
- **This:** no install, a plain-text input a deputy head can type in ten
  minutes, a counting check that says *why* a week cannot fit before any
  solving, and an independent validator behind every "no hard problems".

## Input format

```
days: Mon, Tue, Wed, Thu, Fri
periods: 6
breaks after: 2, 4                 # doubles never span these
rooms: Lab 1 (lab), Lab 2 (lab), Gym (gym)
teacher Okafor: off Mon 1-2, Fri; max 5 per day
class 7A: off Fri 6
7A: Maths / Okafor / 5
7A: Science / Patel / 4 / 2 doubles / lab   # any lab
7A+7B: PE / Garcia / 2 / double / gym       # joint lesson
7B: Assembly / Head / 1 / room Hall         # one named room
8A: Science / Asante+Ng / 2                 # two teachers
```

A room type (`lab`) means any room of that type; `room Lab 1` pins one room;
lessons with neither are taught in the class's own base room and get no room.

## How it works (`timetable.mjs`)

- `parseSchool(text)` reads the format above; errors name the line and say how
  to fix it.
- `feasibility(problem)` counts before solving: a teacher with more lessons
  than free periods (periods off and the daily max included), a class over the
  week, room-type demand over capacity, doubles with no two adjacent periods.
  Soft notes flag subjects that must repeat on a day (five lessons, four days
  the teacher is in).
- `solve(problem, {seed, iterations, initial})`: greedy construction (hardest
  units first, each at its cheapest slot), then simulated annealing over two
  moves, relocating one unit (with the least-booked room of its type) and
  swapping two same-length units of one class. Hard violations cost 1000;
  soft weights: class gap 10, teacher gap 3, same subject twice a day 20,
  over a teacher's daily max 30, late class start 2. Scoring is incremental
  per class/teacher-day. Seeded, so the same seed gives the same timetable;
  `initial` continues from a previous result ("Keep improving").
- `validate(problem, units, placements)` re-checks from placements alone,
  sharing no state with the solver; the page shows its verdict, not the
  solver's.
- `grid`, `toCsv`, `softBreakdown` for views and exports.

`worker.mjs` runs the solver off the page's main thread; `cli.mjs` is the
command line: `node cli.mjs school.txt [--seed N] [--iterations N] [--csv out.csv] [--json]`
(exit 0 clean, 1 hard problems remain, 2 input error).

## Measured

`eval/benchmark-2026-11-16.md`: 21 synthetic secondary schools with every class
fully booked (30 lessons in 30 periods), 4 to 40 classes: all 21 solved with no
hard problem, validator-confirmed, in 0.2 to 2.3 s on one 2.1 GHz core. The
instances are synthetic (`eval/generate.mjs`), not real schools.

## Not yet

Drag-and-drop edits with locked lessons, cover/substitution planning,
option blocks (sets taught in parallel across classes), split sites with
travel time, reading XHSTT (ITC 2011) instances. `NEXT.md` has the order.

## Tests

`node --test timetable.test.mjs usage.test.mjs page.test.mjs`

## Disclaimer, privacy, licence

No warranty: it builds a timetable from what you type; it does not know your
staff contracts, working-time or legal rules, and the person responsible for
the timetable must check it. Everything runs in the browser and nothing is
uploaded; usage counters stay in local storage and can be switched off on the
page (Do Not Track and Global Privacy Control are honoured). FSL-1.1-MIT licence.
[Sponsor on GitHub](https://github.com/sponsors/Duncan-Haywood).
