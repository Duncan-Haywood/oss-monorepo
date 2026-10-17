# Artificial Turf Bid Calculator

A free browser calculator for turf and landscape contractors. It prices an
artificial turf install the way the trade actually loses money — landscape
versus pet versus putting-green, turf you have to buy after 15-foot-roll
waste, crushed-rock base tons, sod demo, infill, seams, and tree wells —
and shows the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/artificial-turf-bid-calculator/

**After using this, you can now** send a turf bid that names the type, the
rolls you have to buy, and the walk-away number, **which used to take**
matching a published $8-a-square-foot special and hoping the yard was a
clean landscape pad.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/artificial-turf-bid-calculator -p 8080
# Run the tests
cd ventures/artificial-turf-bid-calculator && node --test
```

## The problem it solves

Homeowners shop "$8 a square foot installed" and "$5,000 to turf a backyard."
Those numbers cannot see the type. A 600-square-foot landscape job with 10%
waste, a 3-inch base, and sod demo at the sample rates is about $5,468. The
same shop's 800-square-foot pet yard with a 4-inch base and two tree wells is
about $11,124 — and about a third of that is thicker base, zeolite, drainage,
and the wells. Landscaping that yard looks cheaper on paper (~$7,225) until
the odor call comes back. Matching the landscape job's per-square-foot
special on the pet yard is how a sold turf job becomes a two-day loss.

This is not a lawn-care *mowing* tool (a recurring stop on living grass) and
not a paver or concrete *patio* tool (hardscape). It prices *placing
synthetic turf* — landscape, pet, or putting-green.

## How it works

1. **Turf you buy.** Lawn square feet × (1 + waste %). Rolls are 15 feet
   wide. A 10% waste factor on 600 sq ft is 60 sq ft of turf the brochure
   never counts.
2. **Base tons.** Square feet × depth × 100 lb/ft³ compacted crushed rock.
   A 4-inch pet base is not a 3-inch landscape base.
3. **Type hours.** Landscape tacks, sews, and sands. Pet adds drainage and
   zeolite. Putting-green buys more seams and a thicker base.
4. **Sod demo, seams, wells.** Each is its own hours and tickets. A tree
   well is not a blended adder.
5. **Loaded labor.** Hourly wage × (1 + payroll burden %).
6. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price per
square foot, turf to buy, effective hourly rate, extra-work share, a
three-type comparison on the same lawn, and the **walk-away price**.
Entering a price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft ready to paste
into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `artificial-turf-bid-usage` — never the lawn, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `turf_type_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- Starting hours and turf rates are ballpark figures, not a catalog,
  a landscaping specification, or a drainage design.
- Base condition, drainage, and what the homeowner will accept still decide
  the type. The comparison is arithmetic, not a recommendation.
- Irrigation cap-offs, concrete borders, and night work are not modelled as
  their own rows yet — fold them into site hours or travel.

## Disclaimer

This free tool is not landscaping, construction, legal, tax, or financial
advice, and it does not tell anyone what to charge. Outputs are arithmetic
on the user's own inputs. Verify every figure against real payroll,
insurance, turf, quarry, dump, and permit costs and against a qualified
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
