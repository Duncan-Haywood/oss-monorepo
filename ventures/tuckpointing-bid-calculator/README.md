# Tuckpointing Bid Calculator

A free browser calculator for masonry contractors. It prices brick
pointing the way the trade actually loses money — grind versus smear,
scaffold versus swing stage, Type N versus historic lime, then lintels,
replacement brick, and caulk — and shows the margin before the price
goes out.

**After using this, you can now** send a walk-away tuckpointing price
that sees the joints and the access, **which used to take** matching a
published $8 / sq ft smear special that treats a one-story ranch as the
same job as a three-story historic grind.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/tuckpointing-bid-calculator -p 8080
# Run the tests
cd ventures/tuckpointing-bid-calculator && node --test
```

## The problem it solves

Owners shop masons on a Facebook special: **$8 / sq ft tuckpointing**.
Those numbers cannot see the joints or the access.

- A **point-only smear** on a one-story ranch with Type N bags is a
  surface coat. There is no grind.
- **Grind-and-point** is a different crew day. **Cut-out and relay** is
  another one still.
- **Ground / ladder** is a one-story day. **Scaffold** is a two-story
  rental. A **swing stage** is a three-story lift. The cheap special
  assumes you can reach the wall from the ground.
- **Historic lime, color-match, lintels, replacement brick, power wash,
  and control-joint caulk** are their own tickets. They do not live in
  an $8 dump.

Matching a cheap ground-level quote on a grind-and-scaffold job is how
a sold wall becomes a two-day loss after the first scaffold ticket.

This is distinct from **stucco / EIFS** (a cementitious skin, not mortar
joints), **foundation repair** (piers and straps, not face brick),
**chimney sweep** (flue and creosote, not joints), **fireplace insert**
(a liner and a hearth), and **exterior painting** (a coat, not a grind).
This prices tuckpointing.

## How it works

1. **Wall.** Length × height is the face. Joint lineal feet is that area
   times a density for the bond.
2. **Method.** Smear, grind-and-point, or rebuild — hours and the mortar
   invoice.
3. **Access.** Ground, scaffold, or swing stage.
4. **Mortar.** Type N, historic lime, or color-match.
5. **Extras.** Replacement brick, lintels, power wash, caulk, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, price per joint foot, effective
hourly rate, the hour split, a three-method comparison on the same wall,
and the **walk-away price**. Entering a price already on the table scores
it against the same cost base. **Copy bid summary** turns the result into
a plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-for-tuckpointing.html`](how-much-to-charge-for-tuckpointing.html).

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

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under `tuckpointing-bid-usage`
— never the wall, wages, costs, or prices. It is opt-out from the footer,
and it is skipped automatically when the browser sends Do Not Track or
Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `method_changed`,
`access_changed`, `mortar_changed`, `proposed_price_compared`,
`summary_copied`,
`proposal_printed`, `company_forgotten`.

## Limitations

- Single currency and no tax, permit, or historic-commission handling.
- One rectangular elevation. Odd shapes and returns are extra length,
  not a polygon.
- Starting grind, mortar, and scaffold rates are ballpark figures, not
  a catalog.
- Structural movement, matching historic mortar chemistry, and lead
  paint are not designed here — that is the stamp or the conservator.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not structural, construction,
historic-preservation, building-code, legal, tax, or financial advice, and
it does not replace a qualified professional. **You are responsible for
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
