# Concrete Lifting Bid Calculator

A free browser calculator for concrete-lifting contractors. It prices a
mudjacking or polyjacking job the way the trade actually loses money —
void cubic feet, backyard hose runs, extra holes, joint seal, and
occupied-building containment as their own hours — and shows the
margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/concrete-lifting-bid-calculator -p 8080
# Run the tests
cd ventures/concrete-lifting-bid-calculator && node --test
```

## The problem it solves

Small lifting crews are told to bid by a published "$4.50 / sq ft" or
"$75 / hole" special. That rule cannot see the void. An 80-square-foot
sidewalk with a one-inch void and the truck at the curb is not the
same job as a 400-square-foot driveway with a four-inch void,
polyurethane, a backyard hose run, extra holes, and joint seal. The
trip is the same. The cubic feet are not. Matching a cheaper special
written for the sidewalk is how a sold poly backyard hang becomes a
two-day loss after the first extra hole.

Concrete-pour calculators price cubic yards of new mix. Basement
waterproofing prices a French drain and a pit. Neither prices a lift.

After using this, you can now send a lift price that already
includes the void and the extras, which used to take a guess from a
published per-square-foot special.

## How it works

1. **Method and access.** Mudjacking a sidewalk with the truck at the
   curb is not polyjacking a backyard driveway, and is not an occupied
   warehouse floor.
2. **The void as its own hours.** Void cubic feet = slab square feet ×
   void inches ÷ 12. Pump hours and fill material scale with that
   volume. Zero void depth still prices — pump hours are the void,
   not an error. A street-side mud job does not also bill interior
   containment.
3. **Extra holes, joint seal, and occupancy as their own hours.** A
   sidewalk special is not a changeout package. Those extras are not
   blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
effective hourly billing rate, price per square foot, the hour split,
and the **walk-away price** — total cost, below which the job makes
nothing. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, method, and access presets ship with common ballpark hours
and material figures. **They are not an industry standard or a
structural design.** Changing method or access never overwrites a
rate the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `concrete-lifting-bid-usage` — never the address,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One slab / one trip. A new pour, a basement waterproofing package,
  or an epoxy garage floor is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price a concrete pour, basement waterproofing, or epoxy
  coating.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
