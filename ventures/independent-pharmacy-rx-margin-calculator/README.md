# Independent Pharmacy Prescription Margin Calculator

A free browser tool for independent pharmacies: **type your prescription types and costs and see what each kind of fill really earns** after drug acquisition cost, vials and supplies, PBM claim fees, DIR and post-sale fees, a rework allowance for rejected claims, copay card fees, delivery cost and the pharmacy staff's time, which fills use a staff hour best, the copay that hits your target margin, how insured fills compare with cash fills, and how many prescriptions a month cover fixed costs.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/independent-pharmacy-rx-margin-calculator/

After using this, you can **see which generics, brands and specialty fills earn less than they cost to dispense once fees and staff time are counted**, which used to be a spreadsheet nobody kept current.

## Model

Per prescription type: collected = copay + PBM pays. Goods = drug acquisition cost + vial/supplies + DIR and post-sale fees. Rework allowance = rework rate x (supplies + rework minutes x loaded wage). Card fee applies to the copay only (`% + fixed`); the claim fee applies to the PBM payment only. Delivery and compliance is a flat cost per prescription. Labor is staff minutes x wage x (1 + payroll extras). Earns = collected - goods - rework - fees - delivery - labor; margin = earns / collected. Per staff-hour is earns before labor per hour of staff time.

Copay for target solves `collected = (K + (claim% - card%) x PBM) / (1 - target% - card%)` where K is goods, rework, labor, delivery and the fixed card fee, then subtracts what the PBM pays. Break-even prescriptions is fixed cost per month divided by average earnings per prescription at the entered mix. Scenarios re-run the month with drug cost +10%, PBM payments -10%, rework rate +3 points and wage +$2.

Not modelled: clinical services revenue, front-store sales, the pharmacist-in-charge's salary (a fixed cost), 340B, controlled-substance compliance, taxes, equipment and financing. Idle staff time belongs in fixed costs. No patient or prescription identifiers are asked for.

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
