# Window Replacement Bid Calculator

A free browser calculator for window replacement contractors. It prices a
residential replacement job the way the trade actually loses money when they
skip it — each opening by United Inches, story, and tear-out — and shows the
margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/window-replacement-bid-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/window-replacement-bid-calculator -p 8080
# Run the tests
cd ventures/window-replacement-bid-calculator && node --test
```

After using this, you can now send a walk-away price grounded in United Inches
and access, which used to take a spreadsheet that treated every sash as the
same $550 window.

## The problem it solves

Homeowners and even many replacement crews are told to bid by price per window.
That rule cannot see the shape of a house. A 3040 double-hung is 70 United
Inches; a 6048 picture is 108. Four second-floor bedrooms and one first-floor
picture are five openings on a postcard and two different invoices in the shop.
A rotten sill is a carpentry job hiding inside a "window" line. Two houses with
the same window count can differ by 30% in labor, and labor plus the unit is
most of the cost. A per-window bid on the wrong one is a week the contractor
works at a loss.

The second thing that sinks these bids is payroll burden. An installer paid $38
costs more like $50 once employer taxes, workers' compensation, liability
insurance, and paid time off are counted. Crews who price off the raw wage are
short before they start.

## How it works

1. **Per-opening takeoff.** Each row is a distinct size and condition: width
   and height in inches (United Inches = width + height), quantity, story,
   frame, install method, and tear-out. Material starts from a stock 3040
   (70 UI) and adds for every extra inch. Hours add for large/oversize units,
   the second or third story, full-frame tear-out, rot, masonry, and lead-safe
   work.
2. **Loaded labor.** Hourly wage × (1 + payroll burden %).
3. **Other direct cost.** Disposal per old unit, scaffolding or a lift when any
   priced opening is on the second story or higher, trip fee, permit, and
   optional interior casing or exterior capping.
4. **Overhead.** A percentage markup on that direct cost. It is not applied to
   itself or to profit.
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a share
   of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against: average
price per opening, effective hourly billing rate, the labor split across
openings, the share of hours that sit on the second story or higher, and the
**walk-away price** — total cost, below which the job makes nothing. Entering a
price already on the table scores it against the same cost base and says
  plainly whether it is under water. **Copy quote summary** turns the result into
  a plain-text draft. **Print quote** formats the result as a jobsite-ready quote
  sheet without the editable inputs. **Copy share link** puts the same fields in the page hash
so the recipient reconstructs the same quote.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency, so it is testable and auditable on its own. See
[`calc.test.mjs`](calc.test.mjs).

## Starting rates

Unit prices, hours, and adders ship with common ballpark figures as a starting
point. **They are not a manufacturer size chart, an Energy Star list, a
building-code table, or a guarantee.** Real numbers depend on the brand, the
crew, access, and what is actually in the opening. Every rate is editable.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `window-replacement-bid-usage` — never the address,
sizes, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `opening_added`, `opening_removed`,
`proposed_price_compared`, `summary_copied`, `share_copied`, `quote_printed`.

A share link encodes only the allowlisted quote fields in the URL hash. It is
not sent to us. See [`share.mjs`](share.mjs).

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One replacement-job model. New construction of a whole house, commercial
  storefront, and historic restoration are not priced separately yet.
- Starting unit prices are vinyl-shop ballparks, not a live distributor quote.
- Egress, tempered glass, and impact/coastal ratings are not modelled; treat
  them as other cost or a custom unit price.

## Disclaimer

This free tool is not legal, tax, financial, or engineering advice, and it does
not tell anyone what to charge. It is not a manufacturer, building-code, Energy
Star, lead, or insurance inspection. Outputs are arithmetic on the user's own
inputs. Verify every figure against real payroll, insurance, and supply costs
and against a qualified professional before relying on it or submitting a bid.
To the maximum extent permitted by law, the authors accept no liability for
loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
