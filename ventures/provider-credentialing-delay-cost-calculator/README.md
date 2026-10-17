# Provider Credentialing Delay Cost Calculator

A free browser tool for medical, dental and therapy practices: **list each new clinician and the days they wait for payer enrollment, and see what the wait costs** in lost and deferred revenue, pay going out while visits cannot be billed, and what filing applications earlier would have saved.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/provider-credentialing-delay-cost-calculator/

After using this, you can **put a dollar figure on starting credentialing paperwork during recruiting instead of on day one**, which used to be a gut feeling in a hiring meeting.

## Model

Per clinician: unbillable days = max(0, delay days - days the payers backdate). Blocked revenue = visits per week x share of visits from payers that need the clinician enrolled x allowed amount x unbillable weeks. The share that waits and is billed later is deferred; the rest is lost. Pay in the gap = weekly pay x restricted share x unbillable weeks. The filing-earlier table cuts every delay by 30/60/90/120 days (floor zero) and reports the lost revenue that remains.

Not modelled: ramp-up of a new clinician's schedule, per-payer timelines, out-of-network or incident-to billing, credentialing-service fees. No clinician or patient names belong in the input.

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
