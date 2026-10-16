# Freelance Lead Tracker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-lead-tracker/>

After using this, you know who to follow up with today, which proposals have
gone quiet, what your open pipeline is likely to be worth, and which lead
sources actually turn into paid work.

Free, no account, works offline. Everything runs in your browser; your leads are
stored in `localStorage` on your device and never uploaded.

- Pipeline: new lead, in conversation, proposal sent, negotiating, won, lost
- Follow-ups first: overdue and due today, then leads gone quiet for longer than their stage usually allows
- Weighted forecast: starting guesses (10/25/40/70%) until you have 8 closed leads, then your own win rates, and it says which it is using
- Win rate and won value by source, lost reasons, median days to win
- "How much pipeline do I need" for a monthly target
- One-click hand-off into [Freelance Proposal Maker](../freelance-proposal-maker/) (details travel in the URL fragment, never sent to a server)
- CSV export (formula-safe), JSON backup and restore

Run the tests: `node --test`. Serve `index.html` from any static host.

First step of the pitch -> proposal -> contract -> estimate -> time -> invoice
loop: [Proposal Maker](../freelance-proposal-maker/) ->
[Contract Maker](../freelance-contract-maker/) ->
[Estimate Maker](../estimate-maker/) -> [Time Tracker](../time-tracker/) ->
[Invoice Maker](../invoice-maker/), tied together by the
[Freelance Dashboard](../freelance-dashboard/).

A bookkeeping notebook, not advice; see the disclaimer on the page. MIT licensed.
