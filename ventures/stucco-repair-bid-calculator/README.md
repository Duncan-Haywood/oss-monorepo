# Stucco / EIFS Repair Bid Calculator

A free browser calculator for stucco and EIFS contractors. It prices a
repair the way the trade actually loses money — crack linear feet, hollow
area, tear-off to the substrate, stories and scaffolding, window
flashing, color match, and moisture investigation as their own hours —
and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/stucco-repair-bid-calculator -p 8080
# Run the tests
cd ventures/stucco-repair-bid-calculator && node --test
```

## The problem it solves

Small plastering shops are told to bid by a published stucco-repair price,
or by dollars per square foot. That rule cannot see the extras. Forty
feet of first-story hairline crack on hard-coat, no scaffold, is not the
same job as 180 square feet of second-story EIFS torn back to the
substrate with new mesh, four window flashings, a moisture investigation,
and an integral-color match. The wall is still "stucco." The hours are
not. Matching a cheaper per-square-foot quote written for the brochure
crack patch is how a sold second-story EIFS job becomes a two-day loss
after the first lift day.

Siding calculators price vinyl, fiber-cement, or engineered-wood
replacement. Exterior-painting calculators price a coating on an intact
surface. Foundation-repair calculators price structure. None of those
price a stucco or EIFS repair.

After using this, you can now send a stucco-repair price that already
includes access, tear-off, flashing, and color-match hours, which used
to take a guess from a published per-square-foot number.

## How it works

1. **Crack feet versus hollow versus tear-off.** Hairline cracks are
   linear feet. Hollow / delaminated stucco is cut-out square footage.
   Tear-off to the substrate is a different square footage and a
   different mesh / lath kit.
2. **Stories as their own hours.** A first-story patch keeps the
   scaffolding at zero. A second-story lift is a day. A third-story
   gable is another one. Those hours do not scale with wall area.
3. **System extras.** Hard-coat, one-coat, and EIFS carry different mix,
   mesh, and tear-off hours. Color match and moisture investigation are
   billed as their own hours and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a plasterer sanity-checks a bid against:
price per square foot of hollow-plus-tear-off, effective hourly billing
rate, the hour split, and the **walk-away price** — total cost, below
which the job makes nothing. Entering a price already on the table
scores it against the same cost base. **Copy bid summary** turns the
result into a plain-text draft with wages omitted, ready to paste into a
proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, system, and story presets ship with common ballpark hours and
material figures. **They are not an industry standard, a stucco
specification, or a moisture determination.** Changing system or stories
never overwrites a rate the plasterer has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `stucco-repair-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the plasterer enters their own numbers.
- One elevation / one system. A whole-house re-stucco, a new-construction
  three-coat, or an EIFS reclad is not priced as a package.
- Color match is one rate; integral color versus painted finish is the
  plasterer's choice of rate, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, engineering, moisture,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
