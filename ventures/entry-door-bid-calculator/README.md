# Entry Door Bid Calculator

A free browser calculator for door and carpentry shops. It prices an
entry-door replacement the way the trade actually loses money —
sidelights, a transom, an out-of-square rough opening, jamb and sill
rot, brickmold, a storm door, and paint as their own hours — and shows
the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/entry-door-bid-calculator -p 8080
# Run the tests
cd ventures/entry-door-bid-calculator && node --test
```

## The problem it solves

Small door shops are told to bid by a published "$1,200 installed"
steel-entry-door special, or by a "$400 to hang a prehung" coupon.
That rule cannot see the opening. A 36-inch steel prehung in a square,
rot-free one-story opening is not the same job as a fiberglass unit
with two sidelights, a transom, eight feet of jamb rot, brickmold, and
a storm door. The trip is the same. The hours are not. Matching a
cheaper special written for the brochure hang is how a sold
sidelight-and-rot job becomes a two-day loss after the first
out-of-square shim.

Garage-door calculators price springs, torsion, and the opener.
Window-replacement calculators price united inches and flashing.
Neither prices a pedestrian entry unit.

After using this, you can now send an entry-door price that already
includes the opening and the extras, which used to take a guess from a
published installed special.

## How it works

1. **Configuration, material, and hang style.** A 36-inch steel
   prehung is not a double fiberglass unit and is not a slab-only swap
   in an existing jamb.
2. **The opening as its own hours.** An out-of-square rough opening
   and jamb or sill rot are billed separately. Zero rot still prices —
   rot hours are zero, not an error.
3. **Lights, trim, storm door, and paint as their own hours.** A
   brochure special is not a changeout package. Sidelights, a transom,
   brickmold, and a storm door are not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
effective hourly billing rate, the hour split, and the **walk-away
price** — total cost, below which the job makes nothing. Entering a
price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft with
wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, configuration, material, hang-style, and story presets ship
with common ballpark hours and material figures. **They are not an
industry standard or a door design.** Changing configuration, material,
hang style, or stories never overwrites a rate the shop has already
changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `entry-door-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One opening / one trip. A commercial storefront, a custom millwork
  shop drawing, or a full porch rebuild is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price garage doors or window replacement.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
