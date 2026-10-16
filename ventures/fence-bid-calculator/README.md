# Fence Bid Calculator

A free browser calculator for fence contractors. It prices an install the way
the job actually costs — posts from spacing, heavier terminals at ends,
corners, and gates, tear-out, and the extra hours clay or rock will eat — and
shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/fence-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/fence-bid-calculator -p 8080
# Run the tests
cd ventures/fence-bid-calculator && node --test
```

## The problem it solves

Homeowners and cheap quoting apps bid fence work by a published installed
price per linear foot. That rule cannot see the shape of the yard. A 140-foot
6-foot wood privacy run with two corners, a walk gate, a drive gate, and 40
feet of tear-out in clay is not the same job as 140 feet of flat chain-link
with no gates. Posts, terminals, and gates are a large share of the material;
tear-out and digging conditions add hours with no extra footage to bill. A
flat $35/ft number on the gated privacy job is often below cost.

The second thing that sinks these bids is payroll burden. A crew paid $25
costs more like $32 once employer taxes, workers' compensation, liability
insurance, and paid time off are counted. Contractors who price off the raw
wage are short before they set the first post.

**After using this, you can now send a job price that already counted posts,
gates, and tear-out, which used to take a scratch-pad per-foot guess and a
hope that the hardware invoice would fit.**

## How it works

1. **Posts from spacing.** A run of *L* feet on spacing *S* needs
   `ceil(L / S) + 1` posts, plus one extra terminal per corner. Ends and
   corners start as terminals; each walk or drive gate upgrades two line posts
   to terminals (or adds terminals on a short run that is almost all gate).
2. **Infill is what is left after the openings.** A 4-foot walk gate and a
   12-foot drive gate come out of the panel footage so those feet are not
   billed as solid fence.
3. **Loaded labor.** Hourly wage × (1 + payroll burden %). Digging and slope
   multiply hours, not material.
4. **Other direct cost.** Tear-out haul, permits, dump, travel.
5. **Overhead.** A percentage markup on that direct cost. It is not applied to
   itself or to profit.
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a share
   of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: installed
price per linear foot, effective hourly billing rate, post and gate counts,
the material split (panels vs posts/gates vs tear-out), and the **walk-away
price** — total cost, below which the job makes nothing. Entering a price
already on the table scores it against the same cost base and says plainly
whether it is under water. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

A longer walkthrough of the same method, written in the words a contractor
searches, is [`how-to-bid-a-fence-job.html`](how-to-bid-a-fence-job.html).

## Starting figures

Material types ship with common ballpark costs and hours as a starting point.
**They are not a price book, an industry standard, a benchmark, or a
guarantee.** Real numbers depend on supplier, species, height, local wage, and
how the crew actually works. Every figure is editable. Picking a material
fills in starting costs but does not overwrite hours the contractor has
already changed — a rate timed from their own crew is worth more than any
published figure.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `fence-bid-usage` — never the yard, wages, costs, or
prices. It is opt-out from the footer, and it is skipped automatically when
the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `run_added`, `run_removed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax or permit-fee schedule; the contractor enters
  their own numbers.
- One install model. Repair, staining-only, commercial high-security, and
  rental-property unit pricing are not modelled separately yet.
- Custom run names are not a field; "Other / custom" rows are labelled
  `Run N`.
- Underground utility locates, HOA rules, and property-line disputes are
  outside the arithmetic — the proposal draft says to confirm them.

## Disclaimer

This free tool is not legal, tax, financial, engineering, or business advice,
and it does not tell anyone what to charge. Outputs are arithmetic on the
user's own inputs. Verify every figure against real payroll, insurance,
supplier invoices, and site conditions, and against a qualified professional,
before relying on it or submitting a bid. To the maximum extent permitted by
law, the authors accept no liability for loss or damage from its use.
