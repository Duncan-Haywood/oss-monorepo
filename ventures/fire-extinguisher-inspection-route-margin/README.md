# Fire Extinguisher Inspection Route Margin Calculator

Independent fire-extinguisher and life-safety-equipment inspection route operators can use this free browser-local calculator to find real monthly profit for one customer site — after materials cost for recharge, hydrostatic testing, and replacement units, tag cost, drive time and mileage, and a monthly recordkeeping cost — then roll a list of sites up into monthly route profit and check it against an income goal. **After using this, you can tell which sites on your certified-maintenance route are actually worth keeping, which used to take a spreadsheet and a guess about how much a "typical" recharge or replacement rate was quietly costing you.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why an extinguisher count is the wrong number to judge a site by

A site with "18 extinguishers on the schedule" can still be a break-even stop once the real costs come out — costs an independent technician (not a fire-alarm or sprinkler contractor, and not the customer's own monthly self-inspection) carries alone:

- **Recharge, hydrostatic test, and replacement materials** each carry their own cost against their own fee, and the share of units needing each varies site to site.
- **Tags** are a small fee and cost per unit, but they add up across a large site.
- **Drive time and mileage** to reach the site apply whether it has 4 units or 40.
- **Recordkeeping** — the compliance-history software or paper-tag system you keep a customer's inspection record in — is a real, if small, monthly cost per account.

The route section then answers the question one site's profit can't: given your actual site list, does this route hit your monthly income goal, and if not, how many more profitable sites close the gap?

## Privacy and usage

Everything runs in your browser. Your site figures and route list are never uploaded, there is no account, and nothing is saved when you close the tab — the route table clears on refresh by design. We count anonymous local feature events only (`site-priced`, `route-check`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No site names, fees, or unit counts are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not perform, certify, or replace a professional fire-extinguisher or life-safety-equipment inspection, and it does not determine or record NFPA 10 (or any other) fire-code compliance status. It does not audit your books, verify a service contract, or replace your own insurance, licensing, or accountant.

MIT licensed. See `LICENSE`.
