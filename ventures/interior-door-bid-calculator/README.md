# Interior Door Bid Calculator

A free browser calculator for carpenters. It prices an interior door
replacement the way the trade actually loses money — hang-only on an
existing jamb versus a prehung swap versus framing a new opening versus
a pocket conversion, hollow slab versus hollow prehung versus
solid-core versus French-or-barn, then paint, haul-away, and a new
lockset — and shows the margin before the price goes out.

**After using this, you can now** send a walk-away interior-door price
that sees the opening and the leaf, **which used to take** matching a
published $150-a-door installed special that treats a hollow slab hang
as the same job as a pocket-conversion French pair.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/interior-door-bid-calculator -p 8080
# Run the tests
cd ventures/interior-door-bid-calculator && node --test
```

## The problem it solves

Owners shop carpenters on a Facebook special: **$150 a door
installed**. Those numbers cannot see the opening or the leaf.

- **Hang-only** hangs a slab on the existing jamb. There is no frame
  work and no new casing package.
- **Prehung-swap** pulls the old unit and sets a new prehung.
  **New-opening** is a header and studs. **Pocket-conversion** is a
  wall pocket.
- **Hollow-core slab** is a cheap leaf. **Hollow-core prehung** is a
  builder unit. **Solid-core** is weight and a closer fit.
  **French-or-barn** is a pair of leaves or a track. The cheap special
  assumes every opening is an 80-inch hollow slab.
- **Paint both sides, haul-away, and a new lockset** are their own
  tickets. They do not live in a $150 dump.

Matching a cheap hang quote on a pocket-conversion job is how a sold
door becomes a loss when the header and the extra trip eat the margin.

This is distinct from **entry-door / front-door** (weather, sidelights,
transom, jamb-rot, a storm door), **patio-door / slider** (panels and
impact glass), **garage-door** (springs and a header), **plantation
shutter** (louvered panels), **crown molding** (a run of trim), and
**interior painting** (a coat). This prices an interior door
replacement.

## How it works

1. **Opening.** How many doors, plus travel miles.
2. **Scope.** Hang-only, prehung-swap, new-opening, or
   pocket-conversion — hours and the frame / casing invoice.
3. **Leaf.** Hollow slab, hollow prehung, solid-core, or
   French-or-barn — hours and the millwork invoice.
4. **Size.** 80-inch single, 96-inch / 8-foot single, or a double /
   pair.
5. **Extras.** Paint both sides, haul-away, new lockset.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per door, effective hourly rate, the hour split,
a four-scope comparison on the same opening, a four-leaf comparison on
the same opening (the solid-core upgrade versus the hollow-slab
special), and the **walk-away price**. Entering a price already on the
table scores it against the same cost base. **Copy bid summary** turns
the result into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-replace-interior-doors.html`](how-much-to-charge-to-replace-interior-doors.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`interior-door-bid-usage` — never the opening, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`door_changed`, `size_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One trip. A second visit to plane a binding leaf is extra hours, not
  a callback warranty.
- Starting millwork, casing, and hardware rates are ballpark figures,
  not a catalog.
- Building-code design, fire-rating, and product warranties are not
  designed here — that is the carpenter or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not building-code, fire-rating,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
export your inputs and run it yourself.

MIT licensed — see [`LICENSE`](LICENSE).
