# Time Tracker to Invoice

After using this, you can track the hours you work, round them the way you bill,
and turn the unbilled ones into an invoice in one click, which used to mean a
paid timer app plus retyping hours into a separate invoice.

Free, no account, no watermark, works offline. Everything runs in your browser;
time entries are stored in `localStorage` on your device and never uploaded.

- Timer that survives reloads and closed tabs, or manual entries ("1:30", "1.5", "90m", "1h 20m")
- Hourly rate per client with a per-entry override; billable and non-billable time
- Each entry rounds up to 5/6/10/15/30/60 minutes (or the nearest minute) before pricing
- Unbilled time per client, billable share and effective hourly rate, for this week, this month or all time
- "Invoice unbilled time" writes a draft into [Invoice Maker](../invoice-maker/) on the same device (file download if storage is blocked) and marks those entries invoiced
- Hours on the invoice are the hours on screen, to the cent (`calc.mjs`, integer cents and seconds); CSV and JSON export

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
