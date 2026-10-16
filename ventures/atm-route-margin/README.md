# ATM Route Margin Calculator

Independent ATM route operators can use this free browser-local calculator to find real monthly profit for one location — after the location's surcharge commission split and/or flat placement fee, per-transaction processor fees, the vault cash cost of capital, refill labor and travel, and the machine's own cost — then roll a list of locations up into monthly route profit and check it against an income goal. **After using this, you can tell which placements are actually worth keeping, which used to take a spreadsheet and a guess about what the location split and processor fees were quietly taking off the top.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/atm-route-margin/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why a transaction count is the wrong number to judge a placement by

A machine that "did 220 withdrawals this month" can still be losing money once the real costs come out — costs an independent route operator (not a bank branch network or a marketplace app) carries alone:

- **The location's cut** is paid on surcharge revenue in nearly every placement agreement, as a percentage split, a flat monthly fee, or both.
- **Processor fees** apply per withdrawal to route and settle the transaction, regardless of what the surcharge is.
- **Vault cash** sitting in the machine is capital that could be earning a return elsewhere, or a fee you pay a cash-servicing company to hold — a cost that never shows up if you only look at surcharge revenue.
- **Refill visits and the machine's own monthly cost** (lease or amortized purchase, plus telecom) apply whether or not the location generates much traffic.

The route section then answers the question one location's profit can't: given your actual location list, does this route hit your monthly income goal, and if not, how many more profitable locations close the gap?

## Privacy and usage

Everything runs in your browser. Your transaction figures and location list are never uploaded, there is no account, and nothing is saved when you close the tab — the route table clears on refresh by design. We count anonymous local feature events only (`location-priced`, `route-check`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No locations, fees, or transaction counts are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, verify a location placement agreement, process a live transaction, or replace your own contract, insurance, or accountant.

MIT licensed. See `LICENSE`.
