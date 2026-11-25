---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): each change order's own history, and a duplicate lost to a parallel run

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#96 (merged).

**What landed.** "History, part 3" in the payapps ROADMAP. Each change order row on the job page
now has a "History" button. It opens that change order's own history, newest first: when it was
entered, the date it was sent, contract time, approval or rejection, and files added or removed,
each with who did it and when. Endpoint: `GET .../projects/:id/change-orders/:coId/history`, any
member. It reads the job history rows that already carry the change order's id as `subject_id`,
so no new writes and no migration. Only `change_order_*` actions are returned, because SOV line
events also use `subject_id`. A deleted change order returns 404, and its rows stay in the job
history.

**Why a buyer cares.** Change order fights are about dates and people: when the request went to
the GC, whether time was asked for, and who marked it approved. Before this, answering meant
searching the whole job history. Now it is one click on the row in question.

**Verification.** All steps of `payapps-ci.yml` were run locally, since the private CI has no
runner: biome, typecheck, unit, worker, build, and migration drift. Counts: unit 341/341, worker 215/215.
New tests:

- worker: CO-1's rows only, and CO-2's rejected and sent rows, both newest first; 404 for a
  deleted change order; viewers can read; another company gets 404, both on this job's path and
  on its own job's path carrying this change order's id
- component: `HistoryPanel initiallyOpen` loads at once, and a closed panel loads nothing

**The duplicate, for the next run.** This run first built the pay-when-paid outer limit ("and in
any event within 90 days"), the next item in "Cash report, part 4". It was complete with tests.
Another session merged the same feature as private PR #95 about 40 minutes after this run started,
and even used this run's branch name, `claude/payapps-pwp-outer-limit`. The push was rejected.
This run dropped its copy and took the next unclaimed item.

Before building, check three things:

- `git ls-remote origin 'refs/heads/claude/payapps-*'`
- the open PRs
- `git log origin/main`

Check `origin/main` again just before the first push, not only at the start. Two runs on the
same ROADMAP list pick the same top item. The suggestion: take an item further down "Next", or
one a bet's buyer would ask for that is not yet on the list.
