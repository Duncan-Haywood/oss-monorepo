# Vending Machine Route Profit Calculator

Independent vending-machine route operators can use this free browser-local calculator to find real profit for one location — after location commission, card processing fees, shrink/spoilage, drive time, mileage, restock labor, and the machine's own amortized cost — then roll a list of locations up into monthly route profit and check it against an income goal. **After using this, you can tell which locations are actually worth keeping, which used to take a spreadsheet and a guess about what commission and card fees were quietly taking off the top.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/vending-machine-route-margin/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why gross sales are the wrong number to judge a location by

A location that "did $73 in sales since the last restock" can still be losing money once the real costs come out — costs a route operator (not a vending franchise or marketplace app) carries alone:

- **Location commission** is paid on gross sales in nearly every placement agreement, before anything else comes off.
- **Card processing fees** apply to the growing share of vends paid by tap or card, not just cash.
- **Shrink** — theft, spoilage, or damage — is product you already paid for and never got to sell, which is a cost, not a discount on revenue.
- **Drive time and the machine's own monthly cost** (lease or amortized purchase price) apply whether or not the location sells well.

The route section then answers the question one location's profit can't: given your actual location list, does this route hit your monthly income goal, and if not, how many more profitable locations close the gap?

## Privacy and usage

Everything runs in your browser. Your sales figures and location list are never uploaded, there is no account, and nothing is saved when you close the tab — the route table clears on refresh by design. We count anonymous local feature events only (`visit-priced`, `route-check`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No locations, prices, or sales figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, verify a location-owner commission agreement, or replace your own contract, insurance, or accountant.

MIT licensed. See `LICENSE`.
