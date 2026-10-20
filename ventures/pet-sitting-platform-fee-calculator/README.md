# Pet Sitting Platform Fee Calculator

A free browser tool: **type your bookings, price and the marketplace's cut, and see what you keep per booking and per
hour on Rover, Wag or another platform versus booking clients directly.** It shows the break-even number of direct
bookings per month, the platform price that would net the same, and take-home at 0-100% direct. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pet-sitting-platform-fee-calculator/

After using this, you can **decide whether building a direct client base is worth the software and marketing cost**, and
what to charge on the platform so a marketplace booking pays what a direct one does.

## Model

- Platform net per booking = price x (1 - platform fee) - your cost.
- Direct net per booking = price - (price x card rate + fixed fee) - your cost.
- Direct bookings carry monthly software and marketing; break-even = that cost / gain per moved booking.
- Fee presets are approximate and editable; platforms change fees, so copy yours from a payout statement.

Not modelled: whether your platform agreement allows moving a client direct (many restrict it), income and
self-employment tax, insurance, owner-side fees, tips and cancellations.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
