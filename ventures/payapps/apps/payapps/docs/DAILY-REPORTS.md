# Daily reports

One report per job and day (`/orgs/:orgId/projects/:projectId/daily-reports`, every plan). Rules in
`src/shared/daily-reports.ts`, storage in `daily_reports` (migration 0060), service
`src/worker/services/payapps/daily-reports.ts`, routes `src/worker/routes/org/daily-reports.ts`, PDF and
CSV `src/worker/services/export/daily-report-export.ts`, page `src/client/pages/daily-reports.tsx`.
Photos and files: `daily_report_files` (migration 0065), `src/worker/services/payapps/daily-report-files.ts`,
the shared `AttachmentsPanel` (`holder="dailyReport"`).

## What a report holds

- The date (unique per job; at most tomorrow in UTC, so a contractor west of UTC can file tonight's report
  after UTC midnight).
- Weather as typed, and high and low in whole °F (-80 to 140, low not above high). Nothing is looked up:
  there is no weather service, so the report says what the person on site saw.
- Hours lost to weather or another delay (0-24, quarter hours; null when not stated).
- The schedule activity the delay held up (optional; one of the job's activities). The job schedule groups
  the lost hours by it into a delay log, printed as a PDF and attachable to a change order as backup for a
  time extension (`src/shared/schedule-delays.ts`). Deleting the activity keeps the report and its hours,
  untied.
- Crew lines (up to 40): the company (blank for the contractor's own crew), the trade, workers and hours
  each (quarter hours). Workers and man-hours are totalled per report and for the job.
- Text: work performed, delays and problems, equipment, deliveries, visitors and inspections, safety, notes.
- Who wrote it and who changed it last (the members' names, as now).

## What the log shows

- Reports, man-hours, days with hours lost (and their sum), and the weekdays since the first report with
  no report, through yesterday. Weekends are left out (a Saturday report still counts), and so are the
  company's holidays listed on the crews page (the same calendar the job schedule's workdays use;
  2026-11-27): the page names the holidays it left out and links to the list. A report written on a
  holiday still counts, and a day off that is not listed still shows as missing.
- "New, with the crew from <date>" copies the latest report's crew and equipment, nothing else.

## Downloads

- `GET .../daily-reports/:reportId/report.pdf`: one report.
- `GET .../daily-reports/range.pdf?from=&to=`: every report in the range, oldest first, each on its own
  page; at most three months (92 days), 404 when the range holds none.
- `GET .../daily-reports/log.csv`: one row per report, oldest first, the crew in one cell; formula-looking
  text is neutralised (`csvCell`).

The PDF and the page carry the same note: a daily report is a record of what was seen and typed, not a
notice of delay or a claim; the subcontract says how and when those are given.

## Photos and files

- "Add photos" / "Photos (n)" on a report opens the shared attachments panel: up to 30 files per report,
  the same types, 15 MB limit, camera button and shrink-before-upload as pay-app attachments, counted
  against the plan's one storage limit. Kinds: job photo (the default), delivery ticket or inspection
  report, signed copy of the report, other.
- Objects live under `orgs/{orgId}/projects/{projectId}/daily-reports/{reportId}/`; deleting the report
  or the job clears them. Downloads are `attachment` with `nosniff` and the type from the extension list.
- `GET .../daily-reports/:reportId/packet.pdf` ("PDF + photos", shown once a report has files): the
  report, an index page, then its files (not a signed copy), PDFs page for page and photos one to a page;
  other types are listed on the index to send separately.

## Job history

Each report entered, changed (the fields named; a moved date gives both dates) and deleted, and each file
attached or removed, is a row in the job history (`dailyReportEvents` in `src/shared/job-history.ts`),
never for the sample job. A field log is evidence in a delay claim, so an edit made after the day shows
who made it and when; the text itself stays in the report.

## Roles and tenancy

Every member reads and downloads; editors and up add, change and delete. Every query filters by `org_id`
and the job (`test/worker/daily-reports.test.ts` checks another company gets 404 on every route).

## Not yet

Linking a report to a change order or RFI it backs (ROADMAP "Next"); the delay log above is attached to a
change order as a file, not as a link to each report.

## In the weekly email

Since 2026-11-27 the weekly email (docs/EMAIL.md) lists, under "Weekdays without a daily report", each
active job whose log has weekdays with no report in the seven days before the email, the most missing
days first, at most 10 jobs (the rest counted), each linked to the job's log. A job counts only while
someone keeps its log: a report dated within the 14 days through the email's date. No day before the
job's first report is missing, and the email's own day is never counted (it may still be written).
Weekends and the company's listed holidays are not counted either.
Closed jobs and the sample job never. Gaps alone never send the email: a subcontractor is often not on
site every weekday, so an email about days nobody worked would teach people to ignore the next one.
Rules: `dailyReportGaps` in `src/shared/daily-reports.ts`; query: `companyDailyReportJobs` in
`src/worker/services/payapps/daily-reports.ts`.
