# Time Tracker

After using this, you know how many hours you tracked, what they are worth, and
how much of it you have never invoiced, and you can turn a client's unbilled
hours into an invoice in one click.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/time-tracker/

Free, no account, no watermark, works offline. Everything runs in your browser;
entries are stored in `localStorage` on your device and never uploaded.

- Timer that survives a closed tab, plus manual entries (`1:30`, `1h 30m`, `45m`, `1.5`)
- Rate per project, optional per-entry override, billable and non-billable time
- Billing increments of 6, 15, 30 or 60 minutes, applied per entry so invoice lines match the report
- Report by client and project for this week, this month, last month or all time, with tracked, billable and not-yet-invoiced totals
- "Invoice unbilled" adds a draft to [Invoice Maker](../invoice-maker/) on the same device and marks those entries billed (a file download is the fallback when storage is blocked)
- Effective rate per tracked hour (non-billable time counted) beside the billable share
- Printable client timesheet for the chosen range, with billed hours after the increment matching the invoice
- A timer left running for over twelve hours is flagged
- Time in whole seconds, money in whole cents (`calc.mjs`); CSV (formula-safe) and JSON export

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or payroll advice; see the disclaimer on the page. MIT licensed.
