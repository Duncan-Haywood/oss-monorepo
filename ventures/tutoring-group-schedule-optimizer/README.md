# Tutoring Group Schedule Optimizer

A free browser tool for tutoring centres, test-prep, music, swim and language schools that teach in small weekly groups: **list the sessions you could run (capacity, minimum group, cost) and your students (what each pays, every slot they can attend) and get the most profitable timetable.** It says which slots to run, who sits where, who cannot be placed and why, and what flipping each slot is worth. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/tutoring-group-schedule-optimizer/

After using this, you can **decide which group sessions to run from your students' real availability** instead of opening everything and hoping groups fill, or dropping a slot that one moved student would have made viable. For one-to-one lessons see [tutor-weekly-schedule-optimizer](../tutor-weekly-schedule-optimizer/).

## Model

- Input: slots as `slot,capacity,min,cost` (header optional, tab or comma) and students as `name,price,slot;slot;...`.
- For a fixed set of running slots the best seating is a minimum-cost flow (student to slot to sink). The first `min` seats of each slot carry a large bonus, so a slot counts as valid only if its minimum is met.
- Which slots to run: every subset for up to 10 slots (exact); above that, seeded local search with flips, swaps and restarts, reported as not proven best.
- Profit = fees of seated students - cost of each running slot. Each student sits in at most one slot.
- Per slot: run or skip, students, revenue, and the profit change if you did the opposite for that one slot with everyone re-seated. Unplaced students are told why.
- Refuses fewer than 4 students; warns on availability that matches no slot and when no schedule is profitable.

## Verification

`node --test` compares the exact path against an exhaustive oracle (every student in every slot or nowhere) on 60 random instances, checks that reported plans are valid seatings that sum to the reported profit, and keeps local search within 2% of the exact answer on 12-slot instances. Not tested against a real centre's timetable.

## Limits

No group-size pricing, tutor availability, travel, multiple sessions per student, drop-outs or trials.

## Run

Open `index.html`, or `node --test`. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
