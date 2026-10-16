# Crawl Space Encapsulation Bid Calculator

A free browser calculator for waterproofing contractors. It prices
encapsulation the way the trade actually loses money — liner-only versus
a sealed encapsulate, hatch versus belly-crawl versus standing water,
then a dehumidifier, a dedicated circuit, and a clean-out — and shows
the margin before the price goes out.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/crawl-space-encapsulation-bid-calculator/

**After using this, you can now** send a walk-away encapsulation price
that sees the liner and the access, **which used to take** matching a
published $4 / sq ft liner special that treats a dry ranch as the same
job as a wet belly crawl.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/crawl-space-encapsulation-bid-calculator -p 8080
# Run the tests
cd ventures/crawl-space-encapsulation-bid-calculator && node --test
```

## The problem it solves

Owners shop waterproofing contractors on a Facebook special: **$4 / sq
ft encapsulation**. Those numbers cannot see the liner or the access.

- A **6-mil liner-only** on a dry, walkable ranch is a dirt cover.
  There is no wall liner and no dehumidifier.
- A **sealed encapsulate** is a different crew day. **Encapsulate plus
  a commercial dehumidifier** is another one still.
- A **hatch** is walkable. An **18-inch belly crawl** is slower.
  **Standing water** is a pump-out plus mud. The cheap special assumes
  you can walk the crawl.
- **Belly batts, rim foam, clean-out, support piers, a dedicated
  circuit, and exterior grade work** are their own tickets. They do
  not live in a $4 dump.

Matching a cheap dry-hatch quote on a wet encapsulate-and-dehumidifier
job is how a sold crawl becomes a two-day loss after the first
pump-out.

This is distinct from **basement waterproofing** (an interior perimeter
drain in a finished basement, window wells, a sump pit), **French
drain** (a yard trench), **sump-pump** (a pit and a discharge swap),
**radon** (SSD pipes), **foundation repair** (piers as the job),
**mold** (containment), **spray-foam** (board-foot insulation as the
job), and **attic blown-in** (bags above a ceiling). This prices crawl
space encapsulation.

## How it works

1. **Floor.** Length × width is the dirt. Stem-wall area is the
   perimeter times height.
2. **Scope.** Liner-only, sealed encapsulate, or encapsulate-plus-
   dehumidifier — hours and the liner invoice.
3. **Access.** Hatch, belly crawl, or wet / standing water.
4. **Insulation.** None, faced belly batts, or closed-cell on the rim
   as a line item.
5. **Extras.** Clean-out, support piers, dedicated circuit, exterior
   grade, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, effective hourly rate, the hour
split, a three-scope comparison on the same floor, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-for-crawl-space-encapsulation.html`](how-much-to-charge-for-crawl-space-encapsulation.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`crawl-space-encapsulation-bid-usage` — never the crawl, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`access_changed`, `insulation_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or moisture-warranty handling.
- One rectangular dirt floor. Odd shapes and doglegs are extra length,
  not a polygon.
- Starting liner, access, and dehumidifier rates are ballpark figures,
  not a catalog.
- Structural movement, standing-water source, radon, mold clearance,
  and lead paint are not designed here — that is the stamp or the
  remediator.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not waterproofing, structural,
construction, radon, mold, building-code, legal, tax, or financial advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising
from its use.

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
