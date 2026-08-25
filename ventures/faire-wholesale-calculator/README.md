# Faire Wholesale Fee Calculator

The free Faire seller fee calculator shows what a wholesale order leaves after
marketplace commission, the one-time new-customer fee, payout-speed processing,
and your cost of goods. It puts the **same invoice** through a marketplace first
order, a reorder, Faire Direct, and an off-Faire invoice so a brand can see
whether the opening order still clears the floor.

Open `index.html` in a browser. Independent retailers use `retailer.html` to
see landed cost versus shelf price after an opening-order discount and the
units that do not sell. `faire-direct-vs-marketplace.html` answers the search
question in words.

The calculation is local and works without an account, network request, or API
key. It is arithmetic, not an estimate of the fees Faire will charge: enter the
rates from your payout summary and verify them there.

After using this, you can now **set a wholesale price that still works on a
first marketplace order**, which used to take reconciling Faire’s help articles
against a spreadsheet.

## What it checks that a flat 15% page does not

Faire’s public North America help article (read 2026-08-25) states:

- 15% commission on marketplace orders
- a one-time $10 new-customer fee on a retailer’s first marketplace order
- 0% commission on Faire Direct orders you originate
- processing of 3.5% + $0.30 (next day), 2.4% + $0.30 (30-day), or 1.9% + $0.30 (60-day)
- payout = order subtotal + shipping reimbursement − commission − processing,
  with the subtotal taken **after brand-funded promotions**

Brands outside North America pay an extra 10% on that first order instead of
$10. The region control fills those defaults; you can edit every rate.

This is **not** a Faire competitor, a storefront, or a scrape of Faire’s
marketplace. It is a client-side worksheet inspired by the public fee *shape*
Faire publishes for brands. Not affiliated with Faire Wholesale, Inc.

## Save and share your numbers

- **Restored on return.** Inputs are saved in your browser. **Reset to defaults**
  clears them.
- **Shareable link.** **Copy shareable link** writes the current inputs into the
  URL. A link’s values always win over a saved session.

The link and the saved copy contain only the numbers you typed. Nothing is
uploaded.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and shop data are never
uploaded. There are no accounts, cookies, tracking pixels, or analytics vendor.
Two things are stored locally, on your device only: the numbers you enter and,
unless you opt out, an anonymous counter that records only an event name and
the day. Turn the counter off with the checkbox in the footer, or your
browser’s Do Not Track / Global Privacy Control setting.

## Opportunity

Faire brands search for “Faire seller fees”, “Faire commission calculator”, and
“Faire Direct vs marketplace” because the first-order fee and payout-speed
processing make a 15% headline incomplete. Independent retailers search for
opening-order margin after shipping. Both jobs are deterministic arithmetic
with no paid API. GitHub Sponsors is optional and never changes what the tool
does.

## Tests

```bash
node --test
```
