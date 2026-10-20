# Lash Studio Service Profit Calculator

A free browser tool for lash artists and small lash studios: **type each service's price, chair time, supplies and no-show rate, plus your rent and card fees, and see what it really takes home per hour of chair time.** It ranks up to three services (a full set, a fill, a volume set), shows the price that reaches your target take-home, the bookings a month that cover the studio, and what a returning client is worth over time. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/lash-studio-service-profit-calculator/

After using this, you can **set or hold a price, and decide how hard to discount a first set, knowing the take-home per hour**, which used to take a spreadsheet and a guess at what the studio costs per booked hour.

## Model

- Expected revenue per booking = price x (1 - no-show chance) + deposit kept x no-show chance; card fees apply to completed bookings only.
- Kept per booking = expected revenue - card fees - supplies.
- Chair time = appointment + consult and clean-up minutes; a no-show still blocks the slot.
- Studio cost per booked hour = (rent + other monthly costs) / (chair hours x share booked).
- Take-home per hour = kept per booking / chair hours - studio cost per booked hour. Price for a target and break-even bookings are solved from the same formula. Value per client = kept per booking x visits.

Not modelled: tax, tips, retail, promotions, refills given away, client acquisition cost.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
