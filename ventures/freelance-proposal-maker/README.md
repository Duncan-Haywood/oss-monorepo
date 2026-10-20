# Freelance Proposal Maker

After using this, you have a client-ready proposal: the client's problem in
their words, what you deliver, a timeline with real dates, up to three priced
options with deposits worked out, and an expiry date, ready to print, save as
PDF or paste into an email.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/freelance-proposal-maker/

Free, no account, no watermark, works offline. Everything runs in your browser;
your answers are stored in `localStorage` on your device and never uploaded.

- Private rate check: enter your own hours per option and a target hourly rate and it shows what each option pays an hour and the price that would reach the target; never printed in the proposal
- Phases chain from a start date into dated milestones and a finish date
- Good / better / best options, each with deposit and balance exact to the cent
- Shows how far apart the options are, and warns when they are priced too close, when there is only one, or when there is no expiry or timeline
- Deterministic template in `calc.mjs`, no model; text download, copy, print, JSON backup

Run the tests: `node --test`. Serve `index.html` from any static host.

Front of the proposal -> [Freelance Contract Maker](../freelance-contract-maker/) ->
[Estimate Maker](../estimate-maker/) -> [Time Tracker](../time-tracker/) ->
[Invoice Maker](../invoice-maker/) loop, tied together by the
[Freelance Dashboard](../freelance-dashboard/).

An offer template, not legal advice; see the disclaimer on the page. MIT licensed.

## Hand-off (added 2026-10-07)

After a client says yes, pick the accepted option under the proposal and press
**Draft the contract** (opens Freelance Contract Maker pre-filled with parties,
fee, deposit, dates and deliverables) or **Make the deposit invoice** (opens
Invoice Maker with the deposit line and terms). The data travels in the URL
fragment, which browsers never send to a server; receiving tools whitelist the
fields.
