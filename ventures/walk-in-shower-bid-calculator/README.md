# Walk-In Shower Bid Calculator

A free browser calculator for tile and bathroom contractors. It prices a
tiled walk-in shower or tub-to-shower conversion the way the trade actually
loses money — wall and floor tile, then the drain, the slope, the niches,
the bench, and the glass as their own hours — and shows whether Saturday
still pays after overtime before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/walk-in-shower-bid-calculator -p 8080
# Run the tests
cd ventures/walk-in-shower-bid-calculator && node --test
```

## The problem it solves

Small tile shops are told to bid by price per square foot of tile. That
rule cannot see the wet-area extras. A 5x3 alcove tub-to-shower that keeps
the existing valve and a framed door is not the same job as a 5x5 curbless
walk-in with a linear drain, a valve relocate, two niches, a masonry bench,
and frameless glass. The tile counts are close. The hours are not. Matching
a cheaper per-SF quote written for the brochure alcove is how a sold
walk-in becomes a week-long loss after the first curbless floor. Owners
also shop a second special — “I already bought the tile, just set it for
$45 / SF” — that zeros the invoice and leaves the set hours.

Flooring calculators price LVP, hardwood, and *floor* tile. Cabinet and
countertop calculators price kitchens. Drywall prices hang-and-finish. None
of those price a wet-area system.

## How it works

1. **Tile and waterproofing.** Wall and floor square footage, plus waste on
   the billed tile and waterproofing on the same wet area.
2. **Wet-area extras as their own hours.** Tub tear-out, valve relocate,
   linear drain, and curbless slope do not scale with tile SF.
3. **Finish extras.** Niches, a floating or masonry bench, glass, and an
   optional steam unit.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: price
per square foot of tile, effective hourly billing rate, the hour split, and
the **walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost base.
The **four-bathroom table** prices the brochure alcove, the curbless
walk-in, the steam shower, and the tile-only alcove from the same crew
rates, then scores matching the alcove’s price per tile square foot
against each cost base. The **who-supplies table** prices the same
shower three ways — you supply the tile, they bought boxes that cover
the takeoff, or they bought too little / the wrong dye lot — against
the $45 / SF labor-only special. The **access table** prices the same
shower three ways — they leave on a weekday, they still shower around
you, or after-hours / weekend — against the Saturday number they
named. **Copy bid summary** turns the result into a plain-text draft
with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs). Matching a brochure
alcove number? See
[`should-i-match-an-alcove-price-on-a-curbless-walk-in.html`](should-i-match-an-alcove-price-on-a-curbless-walk-in.html).
Customer bought the tile? See
[`should-i-install-customer-supplied-tile.html`](should-i-install-customer-supplied-tile.html).
They want Saturday? See
[`should-i-tile-a-walk-in-shower-after-hours.html`](should-i-tile-a-walk-in-shower-after-hours.html).

## Starting rates

The job, bench, and glass presets ship with common ballpark hours and
material figures. **They are not an industry standard, a waterproofing
warranty, or a building-code determination.** Picking a bench or glass type
never overwrites a rate the contractor has already changed.

## Hand the customer a proposal

The price is for you; the **proposal** is for the customer. Fill in your
business details, the customer's name, the deposit split, and how long the
price stands, then **Print proposal / Save as PDF** produces a one-page
document: your header, their details, the scope, the total, the deposit and
balance, a validity date, your payment terms, and a line for them to sign.

The scope lines start from the job you just priced and are yours to edit —
recalculating never overwrites wording you have changed.

Two things it deliberately does not do:

- **Your costs never reach the customer's copy.** Wages, burden, overhead,
  margin, and the walk-away price are not on the printed sheet.
- **It drafts no legal terms.** Every clause on the page is text you typed.
  Warranty, lien, and cancellation wording depend on your jurisdiction and
  your contract; this tool will not invent them for you.

Your business block is saved on your device so you type it once, and
**Forget my business details** removes it. The customer's name and address
are never saved. See [`proposal.mjs`](proposal.mjs), its tests, and
[`platform/proposal/`](../../platform/proposal/README.md).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `walk-in-shower-bid-usage` — never the bathroom,
wages, costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `scope_compared`, `access_compared`,
`summary_copied`,
`proposal_printed`, `company_forgotten`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One wet-area system. A whole-bath remodel (vanity, flooring outside the
  shower, paint) is not priced as a package.
- Waterproofing is one rate for the wet area; sheet versus liquid is the
  contractor's choice of rate, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not plumbing, waterproofing,
construction, legal, tax, or financial advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
export your inputs and run it yourself.

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
