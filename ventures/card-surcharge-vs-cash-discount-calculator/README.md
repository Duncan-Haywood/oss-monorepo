# Card Surcharge vs Cash Discount Calculator

A free browser calculator for small merchants: **should you add a card
surcharge, offer a cash discount, or absorb the processing fee?** Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/card-surcharge-vs-cash-discount-calculator/

After using this, you can now **see monthly profit under each option and how
many card customers you can lose before a surcharge or cash discount costs
more than it saves**, which used to mean a spreadsheet or a processor's sales
pitch.

## Inputs

Monthly sales, card share, average ticket, processing rate, per-transaction
fee, contribution margin, the surcharge and cash discount under
consideration, the share of card customers who would switch to cash/debit and
the share who would walk away.

## Outputs

Monthly card fee cost; profit contribution under absorb, surcharge and cash
discount; the full-recovery surcharge `(rate + fee/ticket) / (1 - rate)`; the
largest share of walk-aways each option tolerates; and a surcharge by
walk-away table.

## The model (stated so you can disagree with it)

- Fee cost = card sales x rate + card transactions x per-transaction fee.
- **Surcharge:** customers who stay pay sale + surcharge and the processor
  takes its rate on the surcharge too; switchers pay cash/debit (no fee, no
  surcharge); walk-aways lose their margin.
- **Cash discount:** card price is list; switchers pay list x (1 - discount).
- Profit is linear in the walk-away share, so the break-even is solved exactly
  from two points; tests check it.

## What this does not cover

Interchange tiers by card type, chargebacks, sales tax on the surcharge,
tips, lost repeat business, ticket-size effects and POS change costs.
Surcharge rules: card brand rules are commonly reported to cap surcharges
near 3%, generally disallow them on debit cards and require disclosure, and
some states cap or ban them. Confirm current rules with your processor and
state.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, or financial advice, and it
does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature
counts live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
