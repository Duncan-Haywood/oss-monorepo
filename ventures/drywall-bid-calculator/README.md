# Drywall Bid Calculator

A free browser calculator for drywall contractors. It prices a job the way
the trade actually loses money when they skip it — hang is the cheap half;
finish level, texture, height, openings, and waste decide whether the week
pays — and shows the walk-away number before a price-per-square-foot special
goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/drywall-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/drywall-bid-calculator -p 8080
# Run the tests
cd ventures/drywall-bid-calculator && node --test
```

After using this, you can now **quote drywall from rooms, finish level, and
waste instead of a flat house price**, which used to take a spreadsheet that
still hid the mud hours and the burden.

## The problem it solves

Drywall crews are told to bid “the house” or “a dollar fifty a foot.” That
rule cannot see the job. A basement hang-and-texture special is a different
week from a Level 5 skim under a skylight, a 12-ft great room, seven openings,
and a dumpster. Two addresses on the same street can differ by 2× in labor,
and those two lines are most of the cost. A $1.50-a-foot special on the wrong
one is a Saturday the crew works at a loss.

The second thing that sinks these quotes is treating hang and finish as one
number. Gypsum Association finish levels 0–5 exist because the tape, coats,
and skim are a different job from the sheets. Level 4 paint-ready is not
Level 3 plus a spray. 4×12 sheets cut joint tape versus 4×8. A hanger paid
$34 often costs more than $44 once employer taxes, stilts-and-tear-out
workers’ compensation, liability, and paid time off are counted. Contractors
who price off the raw wage and “figure finish in” are short before they start.

## How it works

1. **Per-room takeoff.** Each row is a room with length, width, and height.
   Check the ceiling when you are hanging it. Openings subtract from the
   walls once.
2. **Waste and sheets.** Net hung square feet plus waste is what you buy.
   Sheet size turns that into an estimated sheet count.
3. **Hang vs finish.** Hang hours and finish-level hours are separate stacks.
   Texture is a third. Height over 8 ft multiplies those hours on that room.
4. **Openings and tear-out.** Each opening is cut-and-tape time. Tear-out is
   its own hours plus a dumpster.
5. **Travel and minimum.** Miles are a round trip. If on-site time would
   land under the minimum, the job is padded to that minimum.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Labor + board + tape/mud + texture + add-ons + dumpster +
   trip + other + overhead) ÷ (1 − target margin %), because margin is a
   share of the price the homeowner sees.

It then reports the numbers a contractor sanity-checks a quote against:
price per hung square foot, effective hourly billing rate, the share of
labor that is finish (not hang), the area split across rooms, and the
**walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost base
and says plainly whether it is under water. **Copy quote summary** turns the
result into a plain-text draft. **Copy share link** puts the same figures in
the page hash so the recipient computes the same profit the sender saw.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. Share encoding is an allowlist ([`share.mjs`](share.mjs)) so a
dropped field cannot silently change the quote. See the `*.test.mjs` files.

## Starting hours and material

The board types and finish levels ship with common ballpark hours, waste,
and material costs as a starting point. **They are not a Gypsum Association
production table, a building-code specification, a benchmark, or a
guarantee, and they are not a finding that any wall is fire-rated,
permitted, or paint-ready.** Real times and invoices depend on the crew, the
house, the product, and what is actually found on site. Every rate is
editable, and picking a board or texture never overwrites a figure the
contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `drywall-bid-usage` — never the address, room sizes,
wages, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
A share link encodes only the quote fields in the URL hash; it is not sent
to us. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `room_added`, `room_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`.

## Limitations

- Single currency and no tax or permit handling; the contractor enters their
  own numbers.
- One house, not a multi-building HOA or a commercial shaft-wall system.
- Starting hours are ballpark, not timed from a particular crew or region.
- Access issues (occupied rooms, wet board, crooked framing) are not
  modelled beyond the other-cost field and the stilts add-on.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or
engineering advice, and it does not replace a qualified professional. It is
not a manufacturer, building-code, fire-rating, or insurance inspection, and
it does not determine that any wall is fire-rated, permitted, or paint-ready.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
