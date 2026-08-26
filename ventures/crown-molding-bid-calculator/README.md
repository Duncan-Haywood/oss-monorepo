# Crown Molding Bid Calculator

A free browser calculator for finish carpenters. It prices a
residential crown-molding install the way the trade actually loses
money — paint-grade versus stain-grade, simple cove versus colonial
versus built-up, flat versus cathedral versus tray, then corners,
foyer scaffolding, demo, blocking, and an LED cove — and shows the
margin before the price goes out.

**After using this, you can now** send a walk-away crown-molding
price that sees the run and the extras, **which used to take**
matching a published $8-a-foot special that treats 80 lf of
paint-grade cove as the same job as a stain-grade foyer.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/crown-molding-bid-calculator -p 8080
# Run the tests
cd ventures/crown-molding-bid-calculator && node --test
```

## The problem it solves

Owners shop finish carpenters on a Facebook special: **$8 a foot
installed crown**. Those numbers cannot see the grade or the extras.

- **Paint-grade** is miters, caulk, then paint. **Stain-grade** is
  coped inside corners and stock that costs more — there is no
  caulk hiding a bad joint.
- **Simple cove** is the cheap special. **Colonial** is more cuts.
  **Built-up** is two or three stacked pieces.
- **Flat, 8-ft** is the cheap-special assumption. A cathedral or
  tray ceiling changes the spring angle. A two-story foyer is a
  scaffold ticket.
- **Demo, blocking, an LED cove, and matching existing casing**
  are their own tickets. They do not live in an $8/ft dump.

Matching a cheap paint-grade quote on a stain-grade foyer is how a
sold crown job becomes a loss when the corners and the access eat
the margin.

This is distinct from **interior painting** (a coat on walls),
**drywall** (gypsum hang-and-finish), **cabinet refinishing**
(doors), **popcorn-ceiling** (a scrape and skim), and **plantation
shutters** (louvered panels in an opening). This prices a
crown-molding run.

## How it works

1. **Run.** Linear feet of wall, plus inside and outside corners
   and the number of rooms.
2. **Grade.** Paint-grade or stain-grade — cope hours and stock
   factor.
3. **Profile.** Simple cove, colonial, or built-up — hours per
   foot and the millwork invoice.
4. **Ceiling and height.** Flat, cathedral, or tray; 8-ft, 10-ft,
   or a two-story foyer.
5. **Extras.** Demo, blocking, LED cove, casing match, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per linear foot, effective hourly rate, the hour
split, a three-profile comparison on the same run, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-crown-molding.html`](how-much-to-charge-to-install-crown-molding.html).

## Come back to a bid

**Copy link to this bid** puts every number you entered into the URL after the
`#`, and reopening that link restores them. It is how you get back to a bid
tomorrow, and how you hand one to whoever prices with you.

Browsers never send a fragment to a server &mdash; not in the request, not in
the `Referer` header a click through to another site would carry &mdash; so the
link keeps the same promise as the rest of the page: nothing you typed is
uploaded. Anyone holding the link can read the numbers in it, so treat it like
the bid itself.

Nothing is written to the link that is not on the page. The snapshot is taken
from the form itself rather than from a list of field names, so a field added
to this calculator later travels the day it ships &mdash; a field silently
missing from a link is a wrong price for the recipient, not an error message.

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`crown-molding-bid-usage` — never the run, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `grade_changed`,
`profile_changed`, `ceiling_changed`, `height_changed`,
`proposed_price_compared`, `summary_copied`, `bid_link_copied`,
`bid_link_opened`.

## Limitations

- Single currency and no tax, permit, or rebate handling.
- One run. A second floor or a curved wall is extra linear feet
  and corners, not a millwork shop drawing.
- Starting millwork and labor rates are ballpark figures, not a
  catalog.
- Structural backing, fire-rating, and product warranties are not
  designed here — that is the carpenter or the manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not millwork, structural, paint-spec,
legal, tax, or financial advice, and it does not replace a
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
