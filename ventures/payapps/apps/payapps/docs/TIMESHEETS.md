# Crew timesheets

`/orgs/:orgId/timesheets` (linked from the projects page as "Timesheets"). The contractor's own
workers' hours by day, on a job and a schedule-of-values line, one workweek at a time, turned into
labor cost on each job.

## Why

Job costing already reads labor from a payroll report upload and from QuickBooks, but both arrive
after payroll runs, often two to four weeks after the work. A sub tracking labor against the hours it
bid (the most watched number on a job) needs the week's hours on the job while the line can still be
fixed. Time tracking is a standard module in the suites PayApps is compared with (JobTread,
Contractor Foreman, Knowify, Buildertrend); a sub that has to buy one of them for timesheets has
little reason to keep a second tool for billing.

## What it does

- **Crew list** (`GET/POST /api/orgs/:orgId/timesheets/crew`, `PATCH/DELETE .../crew/:workerId`):
  name (one per name in a company, case and spacing ignored), trade or classification, straight-time
  rate per hour (optional). A worker with hours is made inactive, never deleted, so past weeks stay
  whole; an inactive worker takes no new hours. Up to 300 workers.
- **Workweek** (`PUT .../timesheets/settings`): the day it starts, Monday until set. It can change only
  before the first hours are entered: moving it later would split weeks already totalled for overtime
  and posted under their week-ending dates.
- **A week** (`GET .../timesheets/weeks/:weekStart`; the date must be the workweek's first day):
  each worker's rows (job, line or none, seven days of hours in hundredths), replaced whole per worker
  with `PUT .../weeks/:weekStart/workers/:workerId` in one D1 batch. Up to 20 rows a worker, 24 hours a
  day across rows. Jobs offered are the active ones plus any closed job the week already has hours on;
  the sample job takes none.
- **Overtime and wages** (`computeWeek` in `src/shared/timesheets.ts`): hours past 40 in the workweek
  are overtime at 1.5 times the rate (FLSA, 29 U.S.C. 207(a)(1)). Overtime falls on the hours worked
  after the 40th, day by day in row order, so the job worked late in the week carries it. Each
  worker's straight-time and overtime pay are rounded once (half up to the cent) and split onto the
  rows by largest remainder, so the rows add up to the worker's gross exactly.
- **Post to job costs** (`POST .../weeks/:weekStart/post`, `{ burdenBps }`, Crew plan and up as
  every cost change is): one labor cost per job and line, dated the week's last day, vendor
  "Timesheets", wages plus the burden percent typed (payroll taxes, workers' comp, benefits; 0 when
  blank, never assumed), reference `Timesheet w/e <date> item <n>` (or `no line`). It goes through job
  costing's own `addEntries` with `skipExistingReferences`, so posting a week again adds nothing. A
  week changed after posting shows the posted amount beside the current wages; the old cost is edited
  or deleted on the job-cost page and the week posted again. Workers with hours and no rate block
  posting (their hours would post at no cost).
- **CSVs**: `payroll.csv` (per worker: regular and overtime hours, rate, regular, overtime and gross
  pay, jobs) for the payroll service, and `time.csv` (per worker, day and job: regular and overtime
  hours, overtime on each row's latest days) in columns the certified payroll page's timesheet import
  reads, so a prevailing-wage job's week fills the WH-347 without retyping
  (`test/worker/timesheets.test.ts` reads it back through `timesheetHours`). Cells are formula-safe.

## What it does not do

Not payroll: no deductions, taxes or paychecks. Federal weekly overtime only; state daily overtime
(California Labor Code 510, Alaska, Nevada, Colorado and others), double time, exempt employees and
prevailing-wage rates are not applied, and the page says so. No clock-in from a phone, GPS or
photos; no approval step. Those are the next parts if contractors ask.

## Files

Tables `crew_members`, `time_entries`, `timesheet_settings` (migration 0081,
`src/worker/db/schema/timesheets.ts`); `src/shared/timesheets.ts`; `services/payapps/timesheets.ts`;
`routes/org/timesheets.ts`; `services/export/timesheet-export.ts`; `src/client/pages/timesheets.tsx`.
Tests: `src/shared/timesheets.test.ts` (hand sums), `test/worker/timesheets.test.ts` (crew list,
week, overtime, posting once, CSVs, plan gate, workweek lock, viewer, cross-tenant). Privacy policy
2026-11-27.4 names the workers, rates and hours stored.
