# Custom Farm Rate Calculator

Custom farm operators — anyone who owns field equipment (a combine, planter,
sprayer, baler, or tillage tool) and does field work for other farmers for pay
— can use this free browser-local calculator to find the rate to charge for
one job from their own machine's numbers: field speed, working width, field
efficiency, fuel burn, repairs, the machine's annual ownership cost spread
over the hours it actually runs, and their own labor. **After using this, you
can price a job from what it actually costs your machine, instead of a
published survey average from someone else's.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`.
The deterministic calculation works with no account, API key, upload, or paid
dependency.

## Why a survey average is the wrong number to price your own job by

Published regional custom rate surveys report what other operators charged
last season, averaged across many farms and machines. That is a useful market
check — it is not your cost structure:

- **Field capacity** (acres covered per hour) depends on your own speed,
  implement width, and field efficiency, not a survey's assumed average.
- **Fuel and repairs** scale with the hours a job takes on your machine, at
  your fuel price and your repair history.
- **Ownership cost** — depreciation, interest, insurance, and housing — is
  fixed for the year regardless of how many acres you run, so a machine used
  lightly needs a materially higher rate per acre than the same machine run
  hard across more customers.

The season section then answers the question one job's rate can't: given your
actual job list this year, does it hit your income goal, and if not, how many
more jobs at the same average profit close the gap?

## Privacy and usage

Everything runs in your browser. Your job figures and season list are never
uploaded, there is no account, and nothing is saved when you close the tab —
the season table clears on refresh by design. We count anonymous local
feature events only (`job-priced`, `season-check`), with a visible opt-out. Do
Not Track and Global Privacy Control disable counting automatically. No
acres, rates, or profit figures are recorded. The counter is not sent to the
maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not agronomic, tax, financial, or
business advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, set a market rate, verify a custom-farming
agreement, or replace your own contract, insurance, or accountant.

MIT licensed. See `LICENSE`.
