# Irrigation Install Bid Calculator

A free browser calculator for irrigation and landscape contractors. It
prices a new sprinkler-system install the way the trade actually
loses money — extra heads, trench footage, clay versus dirt, a
3/4-inch PVB versus a 1.5-inch RPZ, drip conversion, a rain sensor,
and a master valve as their own hours — and shows the margin before
the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/irrigation-install-bid-calculator -p 8080
# Run the tests
cd ventures/irrigation-install-bid-calculator && node --test
```

## The problem it solves

Small irrigation shops are told to bid by a published "$400 a zone
installed" special, or by a "$2,400 for 6 zones" coupon. That rule
cannot see the trench. A 6-zone front-yard spray system with a
3/4-inch PVB in dirt is not the same job as a 10-zone backyard with
extra heads, a 1.5-inch RPZ, rock trench, drip conversion, a rain
sensor, and a master valve. The trip is the same. The hours are not.
Matching a cheaper special written for the brochure system is how a
sold rock drip job becomes a two-day loss after the first extra
valve and the first extra hundred feet of trench.

Irrigation-winterization calculators price a blowout, a backflow
drain, and a seasonal service call. Lawn-care calculators price
mowing. Neither prices a new sprinkler-system install.

After using this, you can now send an irrigation-install price that
already includes the trench and the extras, which used to take a
guess from a published per-zone special.

## How it works

1. **Zones, extra heads, and trench.** A 6-zone spray system with
   180 feet of trench in dirt is not a 10-zone backyard with 420
   feet in rock and is not a drip conversion.
2. **Controller and backflow as their own hours.** A 6-station box
   and a 3/4-inch PVB are not a Wi-Fi weather controller and a
   1.5-inch RPZ. Zero drip hours still prices — extra hours drop,
   trench does not disappear.
3. **Drip, rain sensor, and master valve as their own hours.** A
   brochure special is not an irrigation package. Extra heads and
   soil are not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a contractor sanity-checks a bid against:
price per zone, effective hourly billing rate, the hour split, and the
**walk-away price** — total cost, below which the job makes nothing.
Entering a price already on the table scores it against the same cost
base. **Copy bid summary** turns the result into a plain-text draft
with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, controller, backflow, and soil presets ship with common
ballpark hours and material figures. **They are not an industry
standard or an irrigation design.** Changing controller, backflow,
or soil never overwrites a rate the contractor has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `irrigation-install-bid-usage` — never the yard, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the contractor enters their own numbers.
- One system / one trip. A multi-controller commercial campus, a
  municipal tap that needs engineered drawings, or a well-pump
  upsizing is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price irrigation winterization / blowout or lawn-care mowing.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not construction, legal, tax,
financial, or engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

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
