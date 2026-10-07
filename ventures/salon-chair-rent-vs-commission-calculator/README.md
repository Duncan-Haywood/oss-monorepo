# Salon Chair Rent vs Commission Calculator

A free browser tool for stylists, barbers, nail techs and estheticians: **enter two arrangements (commission,
chair or booth rent, or rent plus a smaller commission) and the services you expect to book in a normal week,
and see each one's yearly take-home, your hourly rate, the weekly revenue you need just to cover the rent, the
revenue where the two pay the same, and what happens if bookings run low.** Nothing is uploaded.

After using this, you can now **see that a $300 chair that runs fifty-two weeks costs $1,200 for the four weeks
you are on vacation, and the weekly revenue at which renting actually beats commission**, which used to take a
spreadsheet and a guess.

## Model

- Yearly services = weekly services x weeks worked; retail likewise; tips = tip percent of services.
- Commission keeps the entered share of services and retail; chair rent keeps everything.
- Take-home before tax = kept sales + tips - supplies - card fees - rent (weekly rent x weeks charged) - fixed costs.
- Tax = the self-employment rate the visitor enters x positive income. Hourly = take-home / (hours x weeks).
- Crossovers are found on a fine grid and interpolated. No benchmark or market-rate data is embedded.

Not modelled: income tax, employer benefits, unemployment and workers' compensation coverage, the cost of building
a client book, and how the arrangement is classified for tax or labour law.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of salons, suite operators, booking platforms and licensing boards; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
