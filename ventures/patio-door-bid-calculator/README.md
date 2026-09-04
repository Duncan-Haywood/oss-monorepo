# Patio Door Bid Calculator

A free browser calculator for window and door shops. It prices a
sliding glass or patio-door replacement the way the trade actually
loses money — extra panels, impact glass, a full-frame
new-construction wrap, a transom, a sill pan, and balcony access as
their own hours — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/patio-door-bid-calculator -p 8080
# Run the tests
cd ventures/patio-door-bid-calculator && node --test
```

## The problem it solves

Small window and door shops are told to bid by a published "$1,800
installed" 6-foot vinyl 2-panel special, or by a "$400 to swap a
slider" coupon. That rule cannot see the opening. A 6-foot vinyl
retrofit on a ground patio is not the same job as a 16-foot 4-panel
impact-rated new-construction unit with a transom, a new sill pan,
and second-story balcony access. The trip is the same. The hours are
not. Matching a cheaper special written for the brochure hang is how
a sold 4-panel impact balcony job becomes a two-day loss after the
first sill-pan rebuild.

Entry-door calculators price sidelights, jamb rot, and a storm door.
Window-replacement calculators price united inches and flashing.
Neither prices a sliding or patio unit.

After using this, you can now send a patio-door price that already
includes the panels and the extras, which used to take a guess from a
published installed special.

## How it works

1. **Configuration, frame, and glass.** A 6-foot vinyl 2-panel is not
   a 16-foot 4-panel fiberglass unit and is not an impact-rated hang.
2. **Install method as its own hours.** A retrofit pocket in an
   existing frame is not a full-frame new-construction wrap. Zero
   wrap hours still prices — wrap hours are zero, not an error.
3. **Screen, transom, trim, sill pan, and balcony as their own hours.**
   A brochure special is not a changeout package. Extra panels and
   impact glass are not blended into the trip.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a shop sanity-checks a bid against:
effective hourly billing rate, the hour split, and the **walk-away
price** — total cost, below which the job makes nothing. Entering a
price already on the table scores it against the same cost base.
**Copy bid summary** turns the result into a plain-text draft with
wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job, configuration, frame, glazing, install, and access presets
ship with common ballpark hours and material figures. **They are not
an industry standard or a door design.** Changing configuration,
frame, glazing, install method, or access never overwrites a rate
the shop has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `patio-door-bid-usage` — never the house, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the shop enters their own numbers.
- One opening / one trip. A commercial storefront, a custom millwork
  shop drawing, or a full wall of sliders is not priced as a package.
- Starting hours are ballpark figures, not timed from a named crew.
- Does not price pedestrian entry doors or window replacement.

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
