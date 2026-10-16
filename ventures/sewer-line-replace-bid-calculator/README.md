# Sewer Line Replacement Bid Calculator

A free browser calculator for plumbing and sewer-repair shops. It prices
replacing a sewer line the way the trade actually loses money — open-cut
versus pipe bursting versus CIPP lining, bury depth, laterals, and the
surface you have to put back — and shows the margin before the price goes
out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sewer-line-replace-bid-calculator/

**After using this, you can now** send a replacement bid that names the
method, the restore, and the walk-away number, **which used to take**
matching a published $125-a-foot special and hoping the driveway was lawn.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/sewer-line-replace-bid-calculator -p 8080
# Run the tests
cd ventures/sewer-line-replace-bid-calculator && node --test
```

## The problem it solves

Homeowners shop "$125 a foot" and "$8,000 to replace a sewer line." Those
numbers cannot see the surface. A 40-foot open-cut under lawn at the sample
rates is about $3,400. The same shop's 80-foot open-cut under a driveway with
two laterals is about $10,400 — and half of that is putting the asphalt back.
Pipe bursting that driveway run is about $5,700 because it restores pits, not
the slab. Matching the yard job's per-foot special on the driveway is how a
sold open-cut becomes a two-day loss after the first sawcut.

This is not a hydro-jet / sewer-camera tool (cleaning an existing line) and
not a septic pumping tool (a tank lid and extra gallons). It prices
*replacing or lining* the pipe from the house to the tap.

## How it works

1. **Method hours.** Open-cut excavates the run and sets pipe. Pipe bursting
   digs pits and pulls new pipe. CIPP lines the existing pipe and reopens
   laterals. Depth scales excavation and pit hours off a 6-foot baseline.
2. **Restoration.** Lawn is cheap. Driveway, sidewalk, and street are billed
   as their own hours and patch material. Bursting restores pits; lining
   usually restores nothing.
3. **Laterals, cleanouts, bypass.** Each is its own hours and fittings. An
   occupied house is a bypass pump, not a blended adder.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against: price per
foot, effective hourly rate, restoration share, a three-method comparison on
the same run, and the **walk-away price**. Entering a price already on the
table scores it against the same cost base. **Copy bid summary** turns the
result into a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `sewer-line-replace-bid-usage` — never the house,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `method_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- Starting hours and material rates are ballpark figures, not a catalog,
  a plumbing specification, or a code determination.
- Soil, groundwater, tap location, and what the jurisdiction will accept
  still decide the method. The comparison is arithmetic, not a recommendation.
- Traffic control, night work, and utility conflicts are not modelled as
  their own rows yet — fold them into site hours or travel.

## Disclaimer

This free tool is not plumbing, construction, legal, tax, or financial
advice, and it does not tell anyone what to charge. Outputs are arithmetic
on the user's own inputs. Verify every figure against real payroll,
insurance, material, dump, and permit costs and against a qualified
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
