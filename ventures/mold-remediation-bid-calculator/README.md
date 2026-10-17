# Mold Remediation Bid Calculator

A free browser calculator for mold remediators. It prices a
containment, demolition, dry-out, and clearance job the way the trade
actually loses money — the included closet, then the extra zone, the
demo squares, equipment days, HVAC cleaning, a dumpster, occupied-home
access, and a third-party clearance as their own hours — and shows the
margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mold-remediation-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/mold-remediation-bid-calculator -p 8080
# Run the tests
cd ventures/mold-remediation-bid-calculator && node --test
```

## The problem it solves

Small remediation shops are told to bid a published mold special, or by
dollars per square foot of affected area. That rule cannot see the
containment extras. An 80-square-foot closet with one zone and one
equipment day is not the same job as an 800-square-foot finished
basement with two zones, four dry-out days, 240 square feet of demo,
and a clearance. The word "mold job" is the same. The hours are not.
Matching a cheaper per-square-foot quote written for the brochure
special is how a sold basement job becomes a loss after the first
extra zone.

Basement-waterproofing calculators price wells, a pit, and discharge.
Radon-mitigation calculators price suction, membrane, and circuit.
Pest-control calculators price bait stations and route stops. Drywall
calculators price hang-and-finish of new board. None of those price a
mold remediation.

After using this, you can now send a remediation price that already
includes extra containment, demo, and clearance hours, which used to
take a guess from a published special.

## How it works

1. **Included closet.** An 80 sq ft include is not an 800 sq ft
   finished basement. Extra square feet over the include are their own
   hours.
2. **Containment as its own hours.** Extra zones and demo do not scale
   with "a mold job is a mold job."
3. **Service extras.** Dry-out days, clearance, HVAC cleaning, a
   dumpster, and occupied-home access are billed as their own hours
   and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a remediator sanity-checks a bid against:
price per square foot of affected area, effective hourly billing rate, the
hour split, and the **walk-away price** — total cost, below which the
job makes nothing. Entering a price already on the table scores it
against the same cost base. **Copy bid summary** turns the result into
a plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job and job-type presets ship with common ballpark hours
and kit figures. **They are not an industry standard, a mold protocol,
or a health determination.** Changing job type never
overwrites a rate the remediator has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `mold-remediation-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the remediator enters their own numbers.
- One contained area. A whole-house rebuild, a structural dry-out of
  a flooded slab, or a contents pack-out is not priced as a package.
- Clearance is one third-party fee; a county form is the remediator's
  choice of permit, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not mold, environmental, construction,
health, legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
