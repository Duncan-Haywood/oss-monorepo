# Holiday Light Bid Calculator

A free browser calculator for holiday lighting contractors. It prices
Christmas and holiday lights the way the trade actually loses money —
hang-only on customer-owned C9 versus hang-and-takedown versus full
service with storage, 1-story versus 2-story lift versus 3-story lift,
then peaks, tree wraps, and bushes — and shows the margin before the
price goes out.

**After using this, you can now** send a walk-away holiday-light
price that sees the hang and the take-down, **which used to take**
matching a published $3 / LF hang special that treats a 1-story ranch
as the same job as a two-story Victorian.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/holiday-light-bid-calculator -p 8080
# Run the tests
cd ventures/holiday-light-bid-calculator && node --test
```

## The problem it solves

Owners shop holiday lighting contractors on a Facebook special:
**$3 / lineal foot to hang Christmas lights**. Those numbers cannot
see the take-down or the stories.

- A **hang-only** on a 1-story ranch is clips on customer-owned C9.
  There is no January trip and no storage.
- **Hang and take-down** is a second crew day in January.
  **Full service** — contractor lights plus off-season storage — is
  another one still.
- A **1-story** eave is an extension ladder. A **2-story** needs a
  taller ladder or a small lift. A **3-story or steep** needs a lift.
  The cheap special assumes you can reach the eave from the ground.
- **Peaks, tree wraps, bush nets, column wraps, a timer, and a steep
  pitch** are their own tickets. They do not live in a $3 dump.

Matching a cheap ranch quote on a two-story full-service job is how a
sold light job becomes a January loss when take-down eats the margin.

This is distinct from **soffit and fascia** (wrap / replace the eave
board), **gutter install** (K-style trough), **landscape lighting**
(low-voltage path and uplights), **electrical panel** (service amps),
and **exterior painting** (a coat). This prices holiday lights.

## How it works

1. **Eave.** Lineal feet of roofline, not square feet of house.
2. **Scope.** Hang-only, hang-and-takedown, or full-service
   storage — hours and the light invoice.
3. **Stories.** 1-story, 2-story lift, or 3-story lift.
4. **Light type.** C9 / C7, icicle / mini-curtain, or commercial-grade LED C9.
5. **Extras.** Peaks, trees, bushes, columns, timer, steep pitch, travel miles.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per lineal foot, effective hourly rate, the hour
split, a three-scope comparison on the same house, and the **walk-away
price**. Entering a price already on the table scores it against the
same cost base. **Copy bid summary** turns the result into a
plain-text draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-hang-christmas-lights.html`](how-much-to-charge-to-hang-christmas-lights.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`holiday-light-bid-usage` — never the eave, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `scope_changed`,
`stories_changed`, `type_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax, permit, or HOA-color handling.
- One eave run. Odd returns, dormers, and wrap-around porches are extra
  lineal feet, not a polygon.
- Starting hang, take-down, and light rates are ballpark figures, not a
  catalog.
- Electrical design, load calculations, ladder safety, and product
  warranties are not designed here — that is the electrician or the
  manufacturer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not electrical, lighting-design,
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
