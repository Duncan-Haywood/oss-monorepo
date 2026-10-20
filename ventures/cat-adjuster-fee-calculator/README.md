# CAT Adjuster Fee Schedule & Deployment Profit Calculator

Independent catastrophe (CAT) claims adjusters can use this free browser-local calculator to find real net profit for a storm deployment — after estimating-software, lodging, per diem, vehicle, and mileage cost, including the unpaid travel days spent driving to and from the disaster zone before the first claim closes — then compare two or three IA (independent-adjusting) firms' fee-schedule offers by what they actually pay per hour, not just their headline per-claim rate. **After using this, you can tell which of two offers with different per-claim rates and different claim pace is actually the better trip, which used to mean a spreadsheet or a guess about how much travel days and daily costs were quietly eating into a "good" fee.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cat-adjuster-fee-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why a per-claim rate is the wrong number to judge an offer by

A $550-a-claim offer can still pay a few dollars an hour once the real costs come out — costs an independent 1099 adjuster carries alone, not the firm:

- **Pace is not guaranteed.** Claims-per-day depends on the storm, the firm's own volume, and how claims get assigned — not just the fee schedule.
- **Daily costs run whether you close claims or not**: estimating-software subscription, lodging, per diem, and vehicle cost accrue every day you are in the field.
- **Unpaid travel days are the easiest cost to leave out.** Driving to and from the disaster zone burns days and money with zero claims closed, and a deployment that looks profitable ignoring those days can be a loss once they are counted.
- **A large-loss bonus changes the blended fee**, not just the headline rate — a firm that pays more per large-loss claim but assigns fewer of them may blend lower than it first appears.

The comparison table then answers the question one offer's profit can't: given two or three real fee schedules, which one actually pays the best effective hourly rate for the same trip?

## Privacy and usage

Everything runs in your browser. Your deployment figures are saved locally on this device so you don't retype them; your fee-schedule comparison rows are never uploaded and are cleared on refresh by design. We count anonymous local feature events only (`deployment-priced`, `offers-compared`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No firm names, fees, or deployment figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not determine your licensing, appointment, or authority to handle a claim in any state, and it does not evaluate an IA firm's reputation, timeliness of payment, or claim-volume promises — verify those independently before accepting a deployment. It does not audit your books or replace your own insurance, licensing, or accountant.

MIT licensed. See `LICENSE`.
