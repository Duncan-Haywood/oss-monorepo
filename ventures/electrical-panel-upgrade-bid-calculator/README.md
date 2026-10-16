# Electrical Panel Upgrade Bid Calculator

A free browser calculator for licensed electricians. It prices a panel
replacement or 100A-to-200A service upgrade the way the trade actually
loses money — the can, then the feeder, the circuit landing, AFCI/GFCI,
underground versus overhead, grounding, the meter socket, temporary
power, and the utility as their own hours — and shows the margin before
the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/electrical-panel-upgrade-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/electrical-panel-upgrade-bid-calculator -p 8080
# Run the tests
cd ventures/electrical-panel-upgrade-bid-calculator && node --test
```

## The problem it solves

Small electrical shops are told to bid by a published panel-upgrade price,
or by dollars per amp. That rule cannot see the service extras. A 100A
same-amp garage swap that keeps the existing grounding is not the same
job as a 100A-to-200A underground service with a meter-main, twenty
AFCI/GFCI breakers, a forty-foot feeder through finished space, temporary
power, and a utility disconnect. The starting amp is the same. The hours
are not. Matching a cheaper per-amp quote written for the brochure swap
is how a sold underground upgrade becomes a two-day loss after the first
feeder pull.

EV-charger calculators price a dedicated circuit, a trench, and panel
*space*. Standby-generator calculators price a transfer switch, a pad, and
gas. Mini-split calculators price a line-set and one more circuit. None of
those price a service and panel.

After using this, you can now send a panel or service-upgrade price that
already includes landing, path, and utility hours, which used to take a
guess from a published per-amp number.

## How it works

1. **Amp change.** A same-amp panel swap is not a service upgrade. The
   amp change is what triggers the utility, the meter, and the
   service-entrance work.
2. **Path and access as their own hours.** Overhead mast versus
   underground lateral, and garage versus finished living space, do not
   scale with the number on the label.
3. **Landing extras.** Feeder feet, circuits landed, and AFCI/GFCI are
   billed as their own hours and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers an electrician sanity-checks a bid against:
price per amp of new service, effective hourly billing rate, the hour
split, and the **walk-away price** — total cost, below which the job
makes nothing. Entering a price already on the table scores it against
the same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, panel-style, and service-path presets ship with common ballpark
hours and material figures. **They are not an industry standard, an
electrical specification, or a building-code determination.** Changing
panel style or path never overwrites a rate the electrician has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `electrical-panel-upgrade-bid-usage` — never the
house, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the electrician enters their own numbers.
- One service / one panel. A whole-house rewire, a subpanel run, or a
  solar/EV/generator add-on is not priced as a package.
- AFCI versus GFCI is one rate; combination breakers are the electrician's
  choice of rate, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not electrical, construction, legal,
tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
