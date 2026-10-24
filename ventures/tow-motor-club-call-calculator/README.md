# Tow Motor Club Call Calculator

A free browser calculator for independent towing and roadside operators: **should I accept this
motor-club (Agero, Urgent.ly, Honk, AAA-contractor …) dispatch, or wait for a cash call?**
Everything is typed by you; nothing is uploaded and nothing about any club's terms is assumed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tow-motor-club-call-calculator/

You get the **cost of the job, profit, profit per truck-hour, break-even payout, minimum
acceptable payout and an accept/decline verdict** against a margin threshold you type and the
profit per hour you expect from a cash call, a **deadhead-miles by wait-minutes sensitivity
table**, and a **batch mode**: paste several calls and rank them by profit per truck-hour.

## Model

Cost per billable hour = (truck payment + insurance + overhead) / billable hours + loaded driver
wage. Fuel and maintenance are per mile. Truck-hours = miles / average speed + on-scene minutes,
stretched by a weather slowdown. Payout = flat + per-mile beyond the included miles. Kept =
payout x (1 - club fee - chargebacks - carrying cost of late pay) - fixed fee. Profit = kept -
cost. Break-even payout makes profit zero; the minimum acceptable payout is the larger of the
payout meeting your margin threshold and the payout matching your cash-call alternative.

Not modelled: state or municipal rate rules, storage and lien fees, tolls, taxes, club
penalties for declines. **This is arithmetic on numbers you type, not legal, rate-setting or
financial advice.** Tow rates and rules vary by state and municipality.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output before relying on
it.** To the maximum extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

## Run

Open `index.html` through any static server. Tests: `node --test`.
