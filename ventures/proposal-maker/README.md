# Proposal Maker

After using this, you can send a priced, scoped proposal in 15 minutes that
used to take an afternoon in Word.

Free, no account, no watermark, works offline. Everything runs in your browser;
proposals are stored in `localStorage` on your device and never uploaded.

- Client and project summary, the problem, goals
- Scope: deliverables, each with an included list and an excluded list
- Timeline: phases run back to back from a start date, with computed dates
- Pricing: fixed price, good-better-best options, hourly with a not-to-exceed cap, or a monthly retainer; one tax rate
- Deposit and payment milestones as percentages; the final balance is the remainder so the schedule always adds up
- Assumptions, and template clauses (change orders, revisions, client responsibilities, payment, ownership, cancellation) that follow the numbers you enter
- Validity date and an acceptance block with signature lines; print or save as PDF (print stylesheet shows only the proposal), or download a single self-contained HTML file to email
- A "Follow up" list on the dashboard: sent proposals that went quiet for 3 days or expire within 3 days, each with a copyable nudge note
- Saved proposals with draft / sent / accepted / declined (and a derived "expired"), duplicate, win rate, CSV and JSON backup and restore
- Starter templates (website, consulting, marketing retainer, photography) with placeholder rates to edit
- "To estimate" on an accepted proposal adds the pricing as a draft in [Estimate Maker](../estimate-maker/) on the same device
- All money maths in integer cents (`calc.mjs`); deterministic, no network, all user text escaped

Run the tests: `node --test`. Serve `index.html` from any static host.

The clause wording is generic template text. It is not legal advice; have a
lawyer review any contract. Not tax or financial advice either; see the
disclaimer on the page. MIT licensed.
