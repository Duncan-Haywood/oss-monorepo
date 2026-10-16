# Popcorn Ceiling Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/popcorn-ceiling-bid-calculator/>

A free browser calculator for painting and drywall contractors. It prices
popcorn / acoustic-ceiling removal the way the trade actually loses
money — scrape-and-prime versus a Level 4 skim versus Level 5 plus two
coats, 8-foot versus vaulted versus two-story scaffolding, then an
asbestos test, containment, and closet ceilings — and shows the margin
before the price goes out.

**After using this, you can now** send a walk-away popcorn-removal price
that sees the scrape and the skim, **which used to take** matching a
published $1.50 / sq ft scrape special that treats an 8-foot ranch as
the same job as a painted two-story ceiling.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/popcorn-ceiling-bid-calculator -p 8080
# Run the tests
cd ventures/popcorn-ceiling-bid-calculator && node --test
```

## The problem it solves

Owners shop painting contractors on a Facebook special: **$1.50 / sq
ft popcorn removal**. Those numbers cannot see the skim or the height.

- A **scrape-and-prime** on an 8-foot first-floor ranch is a dry
  scrape. There is no skim and no paint.
- A **Level 4 skim** is a different crew day. **Level 5 plus two
  coats** is another one still.
- An **8-foot** ceiling is walkable. A **vaulted** room needs a lift.
  A **two-story stairwell** needs scaffolding. The cheap special
  assumes you can reach the ceiling from the floor.
- **Painted-over popcorn, asbestos testing, containment, furniture
  moves, closet ceilings, and water-stain repairs** are their own
  tickets. They do not live in a $1.50 dump.

Matching a cheap ranch quote on a painted two-story skim-and-paint job
is how a sold ceiling becomes a three-day loss after the first
containment.

This is distinct from **interior painting** (walls and a flat ceiling
as a coat), **drywall hang-and-finish** (new gypsum and a Level 5 on
new board), **exterior painting** (house elevations), **cabinet
refinishing**, and **hardwood refinishing**. This prices popcorn
ceiling removal.

## How it works

1. **Ceiling.** Length × width is the scrape area.
2. **Scope.** Scrape-and-prime, Level 4 skim, or Level 5 plus two
   coats — hours and the finish invoice.
3. **Height.** 8-foot, vaulted / cathedral, or two-story scaffolding.
4. **Texture.** Light popcorn, heavy cottage-cheese, or painted-over.
5. **Extras.** Asbestos test, containment, furniture move, closet
   ceilings, stain repairs, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, effective hourly rate, the hour
split, a three-scope comparison on the same ceiling, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-remove-popcorn-ceiling.html`](how-much-to-charge-to-remove-popcorn-ceiling.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`popcorn-ceiling-bid-usage` — never the ceiling, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`height_changed`, `texture_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or asbestos-clearance handling.
- One rectangular ceiling. Odd rooms and tray ceilings are extra
  length, not a polygon.
- Starting scrape, skim, and paint rates are ballpark figures, not a
  catalog.
- Asbestos, lead paint, structural movement, and finish warranties
  are not designed here — that is the lab or the remediator.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not drywall, painting, asbestos, lead,
building-code, legal, tax, or financial advice, and it does not replace a
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
