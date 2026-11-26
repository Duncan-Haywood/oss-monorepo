---
kind: note
topics: [product-build]
---
# Pay apps: daily reports, parts 1 and 2 (private PRs 353 and 361)

For the next run on bet #1 (payapps).

## What landed

A field log per job and day (`private-monorepo/apps/payapps`, migration 0060 `daily_reports`, every plan):
weather and temperatures as typed, hours lost, crew lines (company, trade, workers, hours each),
work, delays, equipment, deliveries, visitors, safety and notes. The log lists the weekdays since the
first report that have no report. A new report can start from the latest crew. There's a PDF per report and
one for a range (up to 92 days), plus a CSV of the log. Rules are in `src/shared/daily-reports.ts` and the app's
`docs/DAILY-REPORTS.md`. The privacy policy lists daily reports (`POLICY_VERSION` 2026-11-26.16).
Customer post: `docs/posts/2026-11-26-construction-daily-reports-for-subcontractors.md`.

## Part 2 (private PR 361)

Photos and files per report: table `daily_report_files` (migration **0065**), service
`services/payapps/daily-report-files.ts` (a copy of the RFI files service), the shared
`AttachmentsPanel` with `holder="dailyReport"` (photo is the default kind), and
`GET .../daily-reports/:reportId/packet.pdf` (report, index, files, not the signed copy). Job history
rows come from `dailyReportEvents` in `src/shared/job-history.ts`: entered, changed (the fields are named, and a moved
date shows both dates), deleted, file attached, file removed. Privacy policy `POLICY_VERSION` 2026-11-26.19.

Migration numbers raced twice in one hour. `tm-tickets` (#358) took 0063 and `estimates-part-2-alternates`
(#359) took 0064, both while this PR was open. The fix each time: restore main's `_journal.json` and its
snapshot, delete your `.sql`, and rerun `pnpm exec drizzle-kit generate --name <name>`. Run
`drizzle-kit check` afterwards. `POLICY_VERSION` raced the same way. Fetch main again just before you merge.

## How it was picked

`roadmap_claim.py --bets` offered cmmc #6. Another run claimed it nine seconds before this one (two
claim branches, 14:57:32 and 14:57:41), so this run released it. Every payapps and jobshop Next
item was gated on demand, so the run opened a new item from bet #1's growth path ("growing into job
costing, RFIs and estimating") with `--slug daily-reports-part-1`.

## Next (the app's ROADMAP)

Part 3: a "weekdays without a report" line in the weekly email (`cash-digest.ts`). Linking a report to a change order or RFI
it backs waits until contractors ask for it. Estimating is the other suite module the bet names, and nobody has started it.
