# Asphalt Driveway Paving Bid Calculator

A free browser calculator for paving contractors. It prices an asphalt
driveway the way the trade actually loses money — overlay versus
mill-and-overlay versus full-depth, mix tons from thickness, the street
apron, failed base, and the sawcut — and shows the margin before the
price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/asphalt-driveway-pave-bid-calculator/

**After using this, you can now** send a paving bid that names the
method, the tons, and the walk-away number, **which used to take**
matching a published $3.50-a-square-foot special and hoping the base
was sound.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/asphalt-driveway-pave-bid-calculator -p 8080
# Run the tests
cd ventures/asphalt-driveway-pave-bid-calculator && node --test
```

## The problem it solves

Homeowners shop "$3.50 a square foot" and "$4,000 to pave a driveway." Those
numbers cannot see the method. An 800-square-foot 2-inch overlay at the sample
rates is about $3,076. The same shop's 1,000-square-foot full-depth at 3 inches
with failed base and a 4-inch apron is about $6,530 — and a quarter of that is
demo, dump, gravel, and the apron. Overlaying that driveway looks cheaper on
paper (~$5,287) until the failed base shows up under the new mat. Matching the
refresh job's per-square-foot special on the full-depth driveway is how a sold
paving job becomes a two-day loss after the first sawcut.

This is not an asphalt *sealcoat* tool (coats and crack fill on existing
asphalt) and not a concrete driveway *pour* tool (cubic yards of slab). It
prices *placing hot-mix asphalt* — overlay, mill-and-overlay, or full-depth.

## How it works

1. **Mix tons.** Square feet × thickness × 145 lb/ft³ compacted. A 3-inch
   lift is 50% more mix than a 2-inch lift on the same driveway. The apron
   is its own thicker lift.
2. **Method hours.** Overlay tacks and paves. Mill-and-overlay mills first
   and dumps millings. Full-depth demos the existing mat, repairs failed
   base with gravel, and paves a thicker lift.
3. **Apron, failed base, sawcut.** Each is its own hours and tickets. A
   4-inch street apron is not a blended adder.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price per
square foot, mix tons, effective hourly rate, extra-work share, a
three-method comparison on the same driveway, and the **walk-away price**.
Entering a price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft ready to paste
into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

See also: [this calculator vs. a flat rate per square foot](vs-a-flat-rate-per-square-foot.html),
[this calculator vs. JobNimbus](vs-jobnimbus.html), and
[should I only charge material cost for paving fabric?](should-i-only-charge-material-cost-for-paving-fabric.html).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `asphalt-driveway-pave-bid-usage` — never the
driveway, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `method_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- Starting hours and mix rates are ballpark figures, not a catalog,
  a paving specification, or a code determination.
- Base condition, drainage, and what the jurisdiction will accept at the
  street still decide the method. The comparison is arithmetic, not a
  recommendation.
- Night work, traffic control, and utility conflicts are not modelled as
  their own rows yet — fold them into site hours or travel.

## Disclaimer

This free tool is not paving, construction, legal, tax, or financial
advice, and it does not tell anyone what to charge. Outputs are arithmetic
on the user's own inputs. Verify every figure against real payroll,
insurance, mix, dump, gravel, and permit costs and against a qualified
professional before relying on it or submitting a bid. To the maximum
extent permitted by law, the authors accept no liability for loss or
damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).

## Saving and sharing a bid

The whole form is kept in your own browser as you type, so the bid is still
there on the next visit — the rates you tuned, not the ballpark ones this ships
with. **Start a fresh bid** deletes it.

**Copy bid link** puts the same bid in a URL. Opening it reproduces the bid
exactly, in any browser, with nothing stored server-side — there is no server.
A link beats a saved bid when both exist, because someone opening a link meant
to see that bid; the page says which one is on screen.

A bid link carries your own rates — wage, burden, overhead, and target margin.
Send it to yourself or your crew. The customer should get the price, not the
link.

Nothing is uploaded either way. The rates ride in the link's `#` fragment,
which browsers never send to a server or put in a `Referer` header, so opening
or forwarding a bid link does not leak the numbers off the machines you send it
to. The link is built in the browser and copied by you; the save is
`localStorage` on your own device.

`share.mjs` is the pure encode/decode/store module and is identical in every
bid calculator here. Its field list is passed in from the page rather than kept
in the module, so a field added to the form is saved and shareable without
touching it; `page.test.mjs` fails if the two ever drift apart.
