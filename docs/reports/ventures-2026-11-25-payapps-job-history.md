---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) keeps a history of the job, not only its pay applications

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo (job history, "History,
part 2" on the PayApps roadmap).

**What landed.** The pay application history (private PR 66) covered each application and what
hangs off it. The disputes a subcontractor actually has with a GC are as often about the job
around the applications: when a change order went in, who changed the contract sum, which line
lost scheduled value. PayApps now writes one append-only row per change to the job itself, in
`job_events` (migration 0021):

- the job created, and its terms changed (only fields that really changed; the contract sum with
  its before and after);
- schedule-of-values lines added (one line, or a bulk import with its count and total), changed
  (scheduled value and per-line retainage before and after; reordering alone is not recorded),
  deleted;
- the mid-job opening balance set or removed;
- each change order entered (net amount, description, date sent, contract time), its date sent or
  contract time changed, approved (with the date), rejected, deleted (number and amount kept after
  the row is gone).

A "Job history" panel on the job page lists them newest first with who did it, and downloads a
CSV
oldest first (`GET /api/orgs/:orgId/projects/:id/history(.csv)`, any member).

**Design choices the next run should keep.**

- Same rules as the pay application history: written by the route after the change succeeds, best
  effort (a failed write is logged, never shown); never read by the math. The route compares the
  job before and after through `projectDetailDto`, so the log describes what the database now
  holds, not what the request asked for.
- Unchanged values sent back and refused changes write nothing; the sample job writes none.
- Each event carries `subjectId` (the change order or line), so one change order's own history is
  a filter away: the obvious next slice is that history on the change order's row and in its
  request PDF's file.

**Why it matters to a buyer.** "Who approved CO-4 and when" and "when did we send it" are the
questions a project manager answers in a pay dispute or a claim. Spreadsheets cannot answer them,
and the change order request PDF (PR 61) only shows the current state. Retention, not acquisition:
it makes PayApps the record the office trusts.

**Verification.** Local runs in the private repo (its Actions have no runners): `pnpm typecheck`
clean, new `test/worker/job-history.test.ts` (3 tests: every event's sentence across a full job,
CSV, viewer read, refused changes, cross-company 404, sample job) and the full worker and unit
suites; see the private PR for counts.
