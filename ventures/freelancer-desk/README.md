# Freelancer Desk

After using this, you can see in one screen what your clients owe you, what work
you have done but not billed, which quotes are still open, how much to put away
for tax and when the next estimated payment is due, with a to-do list ranked by
dollars. Opening four tools and adding it up by hand used to take a Sunday.

Free, no account, works offline. It reads the data kept on this device by
[Estimate Maker](../estimate-maker/), [Time Tracker](../time-tracker/),
[Invoice Maker](../invoice-maker/) and [Expense Tracker](../expense-tracker/),
read-only, and never uploads anything.

- At-stake total: owed + unbilled time + open quotes (lowest option)
- Overdue receivables aged from the due date, biggest first
- Net profit and a tax set-aside at your chosen share, minus what you already paid
- Next 1040-ES date with days remaining
- Per-client table: billed, owed, overdue, unbilled, hours, effective rate per hour
- One backup file for all four tools; restore asks before replacing anything
- Sample data (in memory only) so a first visit shows the desk working
- Money in whole cents (`calc.mjs`)

Run the tests: `node --test`. Serve `index.html` from any static host.

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.
