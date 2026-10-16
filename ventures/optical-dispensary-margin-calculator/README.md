# Optical Dispensary Margin Calculator

A free browser tool for optical shops and optometry practices: **type your sale types and costs and see what each kind of eyeglass sale really earns** after the frame, lenses, coatings, a remake allowance, card and vision-plan claim fees, free adjustments and the optician's time, which sales use an optician hour best, the patient price that hits your target margin, how plan sales compare with cash sales, and how many sales a month cover fixed costs.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/optical-dispensary-margin-calculator/

After using this, you can **see which vision-plan sales earn less than a cash sale after remakes and fees, and what to charge the patient to reach your target**, which used to be a spreadsheet nobody kept current.

## Model

Per sale type: collected = patient pays + plan pays. Goods = frame + lens lab + coatings. Remake allowance = remake rate x (lens + coatings + remake minutes x loaded wage). Card fee applies to the patient's payment only (`% + fixed`); the claim fee applies to the plan's payment only. Free adjustments are a flat cost per sale. Labor is optician minutes x wage x (1 + payroll extras). Earns = collected - goods - remake - fees - adjustments - labor; margin = earns / collected. Per optician-hour is earns before labor per hour of optician time.

Patient price for target solves `collected = (K + (claim% - card%) x plan) / (1 - target% - card%)` where K is goods, remake, labor, adjustments and the fixed card fee, then subtracts what the plan pays. Break-even sales is fixed cost per month divided by average earnings per sale at the entered mix. Scenarios re-run the month with frame cost +10%, plan payments -10%, remake rate +3 points and wage +$2.

Not modelled: exam revenue, the doctor's time, contact lenses, insurance billing compliance, taxes, equipment and financing. Idle optician time belongs in fixed costs.

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
