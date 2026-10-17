# No Surprises Act IDR Offer Calculator

Free, browser-only tool for out-of-network providers and billing teams disputing
payments under the No Surprises Act. List each claim with its billed charge, the
payer's QPA and the amount already paid, enter the current fees and your own
win-chance assumptions, and it shows the offer with the best expected net, the win
chance you need to break even, which claims are worth taking to federal IDR, how
much rides on the win-chance assumption, and the open negotiation and IDR
initiation dates. No patient information is needed; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/nsa-idr-offer-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, win-chance curve, expected net, break-even, offer search, deadlines, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal or
billing advice. The win-chance curve is the user's assumption, not a prediction of
an arbitrator's decision, and the tool carries no fee schedule or QPA of its own.
Unverified against real IDR outcomes: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
