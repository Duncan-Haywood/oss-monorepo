# Propane Delivery Route Margin Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/propane-delivery-route-margin/>

Independent propane (LP gas) delivery route operators can use this free browser-local calculator to find real annual and monthly profit for one customer — after the retail/wholesale price spread, a small-fill minimum-delivery fee, drive time and mileage, and the fixed monthly tank rental and hazmat compliance cost — then roll a list of customers up into monthly route profit and check it against an income goal. **After using this, you can tell which customers are actually worth the trip, which used to take a spreadsheet and a guess about whether a small-fill account was quietly losing money to a minimum-delivery fee you weren't charging.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why an annual gallon count is the wrong number to judge a customer by

A customer who "took 850 gallons this year" can still be barely worth the trip once the real costs come out — costs an independent route operator (a small bulk plant or bobtail-truck dealer, not a national retailer and not a tank manufacturer or installer) carries alone:

- **Average fill size** decides how many separate truck trips a year's volume takes. The same annual gallons split into small top-offs costs far more in drive time and mileage than the same volume taken in fewer, larger fills — and a small enough fill can trigger a minimum-delivery fee, if you charge one.
- **The minimum-delivery fee** recovers the fixed cost of dispatching a truck for a small fill. Skipping it on a low-volume, small-fill customer is how a route quietly loses money on an account that looks fine by gallons alone.
- **Tank rental** runs every month you own the tank at the customer's property, whether they take one delivery a year or four.
- **Hazmat compliance cost** — your DOT hazmat endorsement, vehicle, and cargo-insurance cost — has to be allocated across your customer base somehow, and a low-volume account carries the same share as a high-volume one.

The route section then answers the question one customer's profit can't: given your actual customer list, does this route hit your monthly income goal, and if not, how many more profitable customers close the gap?

This tool deliberately does not size a tank, forecast degree-day usage, or judge a safe fill level — those are propane-supply and safety questions for your own licensed judgment. It only prices the route economics of a delivery you have already scheduled, from numbers you supply.

## Privacy and usage

Everything runs in your browser. Your customer figures and route list are never uploaded, there is no account, and nothing is saved when you close the tab — the route table clears on refresh by design. We count anonymous local feature events only (`customer-priced`, `route-check`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No customers, prices, or gallon counts are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. It is also not propane-supply, delivery-scheduling, or safety guidance of any kind — it never sizes a tank, forecasts usage, or judges a safe fill level, and it does not replace your own licensed propane supplier's judgment on any of that. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, verify a customer contract, forecast propane usage, or replace your own accountant.

MIT licensed. See `LICENSE`.
