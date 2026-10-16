# Dental Patient Financing Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dental-patient-financing-fee-calculator/>

A free browser tool for dental and orthodontic practices: **compare third-party patient financing, an in-house payment plan and pay-in-full for a large treatment fee**, in what the practice keeps in today's money and in expected value once you weigh each by how many presented cases patients accept.

After using this, you can **say whether patient financing earns back its merchant fee on your own numbers**, instead of taking a vendor's word that it "raises case acceptance", and see the merchant fee at which your own plan would be the better deal.

## Model

Third-party financing: fee x (1 - merchant fee), discounted for the funding delay at your cost of money. In-house plan: a down payment now, then equal monthly instalments; a share of patients stop paying after a share of the term; card fees apply to every payment, admin cost to each month an account is paying; instalments are discounted monthly. Pay in full: fee x (1 - discount) x (1 - card fee). Kept per accepted case = value received - cost of care. Per case presented = kept x acceptance. Break-even acceptance for A against B = B's per-presented value / A's kept per accepted case. Break-even merchant fee: the fee at which financing's kept value equals the plan's.

Not modelled: interest-free promotional terms and who funds them, underwriting and which patients are declined, collections costs, patients who would have paid in full but choose a plan, lending and truth-in-lending rules, tax.

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
