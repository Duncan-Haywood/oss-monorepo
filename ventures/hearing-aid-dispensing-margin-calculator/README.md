# Hearing Aid Dispensing Margin Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hearing-aid-dispensing-margin-calculator/>

A free browser tool for hearing aid clinics and audiology practices: **type your sale types and costs and see what each kind of hearing aid sale really earns** after the device and accessories, an allowance for trial-period returns, the follow-up visits bundled into the price, commission, card and plan fees and the clinician's time, which sales use a clinician hour best, the patient price that hits your target margin, how plan-funded sales compare with private-pay sales, how over-the-counter price pressure would hit the month, and how many sales a month cover fixed costs.

After using this, you can **see which bundles and tiers earn less than they look like they do once returns and follow-up visits are counted, and what to charge to reach your target**, which used to be a spreadsheet nobody kept current.

## Model

Per sale type: collected = patient pays + plan pays. Goods = device cost + accessories. Return allowance = return rate x (share of device cost lost on a return x device cost + wasted minutes x loaded wage), spread over every kept sale. Card fee applies to the patient's payment only (`% + fixed`); the plan fee applies to the plan's payment only; commission is a share of collected. Clinician time = first-fitting minutes + included follow-ups x minutes each, at wage x (1 + payroll extras). Earns = collected - goods - returns - fees - commission - labor; margin = earns / collected. Per clinician-hour is earns before labor per hour of clinician time.

Patient price for target solves `collected = (K + (plan% - card%) x plan) / (1 - target% - card% - commission%)` where K is goods, return allowance, labor and the fixed card fee, then subtracts what the plan pays. Break-even sales is fixed cost per month divided by average earnings per sale at the entered mix. Scenarios re-run the month with device cost +8%, plan payments -10%, private-pay prices -15%, returns +5 points and wage +$5.

Not modelled: diagnostic evaluation revenue, repair and warranty revenue, battery and supply sales, clinical outcomes, taxes, equipment and financing. Idle clinician time belongs in fixed costs.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
