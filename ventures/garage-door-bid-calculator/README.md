# Garage Door Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/garage-door-bid-calculator/>

A free browser calculator for garage-door technicians and small shops. It
prices a replacement or a broken-spring service from parts, shop hours, and
the drive — then shows the walk-away number and whether travel is eating the
ticket.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/garage-door-bid-calculator -p 8080
# Run the tests
cd ventures/garage-door-bid-calculator && node --test
```

After using this, you can now quote a spring job or a 16×7 replacement with
the drive priced in, which used to take a napkin guess that treated every
opening as a neighborhood lump sum.

## The problem it solves

Two quotes sink small door shops.

1. **The $189 spring special.** The kit and an hour in the driveway look
   cheap. Forty minutes each way at a loaded wage plus vehicle cost is often
   more than the shop labor. The advertised number is already a loss before
   the hood goes up.
2. **Treating a 16×7 as two 8×7s.** The slab is about double the square
   footage. The trip, the opener, and most of the setup happen once. Labor is
   closer to 1.3× than 2×. Shops that copy “two singles” overprice the double
   and still underprice the far single.

## How it works

1. **Job type.** Spring-only, opener-only, door replacement, or door + opener.
   Suggested hours and parts fill in and stay put once you edit them.
2. **Opening.** Width × height, or a single/double preset. Construction sets a
   starting slab cost per square foot.
3. **Parts.** Slab, spring kit, opener, hardware/wind-load/windows, disposal,
   permit — only the lines that belong on this ticket.
4. **Loaded shop labor.** Hours × wage × (1 + burden %) × after-hours
   multiplier. The multiplier is shop labor only.
5. **Travel.** Round-trip miles × $/mile, plus (miles ÷ mph) × loaded wage.
   That is the line a lump-sum special hides.
6. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because margin
   is a share of price.

It reports parts / shop labor / travel as shares of the price, the effective
hourly rate, price per square foot of door on replacements, and the
**walk-away price**. A spring ticket whose travel is 35% or more of the price,
or whose drive costs more than the hour on site, is flagged. Paste a number
already on the table to see whether it is underwater. **Copy bid summary**
turns the result into a plain-text draft.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

Niche pages in the customer's search words:

- [How much to charge to replace a garage door](how-much-to-charge-to-replace-a-garage-door.html)
- [How much to charge for a broken spring](how-much-to-charge-for-a-broken-spring.html)

## Starting figures

Door costs, spring kits, opener prices, and hours ship as common ballpark
starting points. **They are not a manufacturer list, a code requirement, a
wind-load calculation, or a guarantee.** Replace them with your supplier
invoice and a timed job. Picking a size or job type never overwrites a figure
you have already edited.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `garage-door-bid-usage` — never the address, the door,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `job_type_changed`, `door_size_changed`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no sales-tax handling.
- One door per ticket. Multi-door commercial jobs are not modelled as a route.
- No torsion-vs-extension spring physics and no safety or wind-load engineering.
- After-hours is a single multiplier, not a call-out table by day of week.

## Disclaimer

This free tool is not legal, tax, financial, engineering, or business advice,
and it does not tell anyone what to charge. It is not a safety inspection, a
permit determination, or a wind-load calculation. Outputs are arithmetic on
the user's own inputs. Verify every figure against real payroll, insurance,
and supplier invoices and against a qualified professional before relying on
it or submitting a bid. To the maximum extent permitted by law, the authors
accept no liability for loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
