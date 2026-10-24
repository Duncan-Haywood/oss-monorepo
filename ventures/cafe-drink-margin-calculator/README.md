# Cafe Drink Margin Calculator

A free browser tool for coffee shop owners: **type your drinks and costs and see what each one really earns** after beans, milk, cup, card fee and the barista's time, which drinks use a busy hour best, the price that hits your target margin, an alternative-milk surcharge, and how many drinks a day cover fixed costs.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cafe-drink-margin-calculator/

After using this, you can **reprice the three drinks that lose money and know what an oat milk upcharge has to be**, which used to be a guess or a spreadsheet.

## Model

Per drink: `beans = grams x ($/lb / 453.6) x (1 + waste)`, `milk = oz x ($/gal / 128) x (1 + waste)`, plus syrup/extras and cup. Card fee is `price x % + fixed`. Labor is make-time seconds x wage x (1 + payroll extras). Contribution is price minus all of those; margin is contribution / price. Per barista-hour is (price - ingredients - card fee) per hour of make time. Price for target solves `p = (ingredients + labor + fixed card fee) / (1 - card % - target %)`.

Daily contribution is summed over drinks sold per day; break-even drinks is fixed cost per day divided by average contribution per drink at the entered mix. Sensitivities re-run the month with milk +20%, beans +25%, wage +$2/hour and prices +$0.25.

Not modelled: tips, sales tax, equipment, owner pay, peak-hour queueing, wholesale. Idle labor belongs in fixed costs.

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
