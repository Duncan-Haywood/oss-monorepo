# TikTok Shop Fee Calculator

A free browser calculator for TikTok Shop sellers. It prices one SKU after
the referral fee, the creator commission you set, fulfillment, ads, and
returns — including the usual case where **affiliate commission is not
clawed back on a refund** — then compares the same order under the mid-2026
US defaults and the announced 1 October 2026 schedule.

**After using this, you can now see whether a creator listing still makes
money after returns, and what the announced October rates do to that
number**, which used to mean a spreadsheet that treated “TikTok takes 6%”
as the whole cost.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/tiktok-shop-fee-calculator -p 8080
# Run the tests
cd ventures/tiktok-shop-fee-calculator && node --test
```

## The problem it solves

Generic “TikTok Shop fees 2026” pages stop at the unified US referral
(about 6% of the fee base, already covering payment processing on domestic
orders). Sellers do not decide at 6%. They decide whether to offer creators
10–20%, whether a 10%+ return rate still leaves a margin when that
commission stays with the creator, and whether they can hold a price
through the announced 1 October 2026 move to 8% plus a 1.5% creator
facilitation fee on affiliate-sourced orders.

[Affiliate commission on returns](affiliate-commission-on-returns.html)
works one $19.99 SKU through both paths, fee by fee.

[Should I offer free shipping?](should-i-offer-free-shipping-on-tiktok-shop.html)
compares charging postage, eating the label, and moving it into the item
price. Referral is a tie at the same customer total; creator commission
on item price only is not. The same comparison now also runs on the
[main calculator](index.html) from the SKU you already typed.

## How it works

1. **Fee base.** `(item price + shipping charged + platform discount − tax) × quantity`,
   which is the shape TikTok publishes. US defaults put all of the platform
   take in `referralRate` and leave processing at 0.
2. **Creator path.** Affiliate commission is seller-set. By default it
   applies to item price only. Creator facilitation applies only to
   affiliate-sourced orders.
3. **Returns.** Expected profit is a mix: kept-order profit at
   `(1 − return rate)` plus returned-order profit at the return rate. A
   returned order refunds the buyer, typically refunds most of the referral
   minus a 20% admin fee capped at $5 / unit, and — unless you tick the
   claw-back box — still pays the creator.
4. **Decisions.** Break-even list price, price that hits a target net
   margin, maximum you can pay for the unit, organic vs affiliate on the
   same SKU, mid-2026 vs announced October 2026, and a monthly roll-up at
  365/12 days (not a flat 30). Use **Copy scenario link** beneath the result
  to share or archive the current assumptions. The link contains only values
  entered into this calculator, not usage data or a hidden identifier.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Comparing this SKU against other channels

The [marketplace fee comparison](../marketplace-fee-compare/) ranks TikTok
Shop against eBay, Etsy, Amazon, Walmart and your own store from one set of
inputs. The [where-to-sell calculator](../where-to-sell-calculator/) is a
second, deeper comparison — it also models return rate, sell-through and
shelf time, and ranks TikTok Shop against eBay, Etsy, Amazon, Reverb and an
own store. Both links at the bottom of this page carry this order's item
price, shipping and cost over automatically — no retyping — via
[`to-where-to-sell.mjs`](to-where-to-sell.mjs), the reverse of that page's own
`handoff.mjs`. `to-where-to-sell.test.mjs` decodes the link through that
page's own decoder so a shape change there fails a test here instead of
arriving as a silently wrong number.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `tiktok-shop-fee-usage` — never the price, costs, or
creator rates. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `order_calculated`, `affiliate_compared`, `schedule_compared`,
`free_shipping_compared`, `handoff_where_to_sell`. The first paint from the
prefilled example is not counted.

## Limitations

- Single currency and no tax withholding / VAT handling beyond an optional
  tax field on the fee base.
- Presets are illustrative US starting points, not TikTok’s live schedule.
  Category exceptions, new-seller promotions, Fulfilled by TikTok bands,
  and regional shops differ.
- Affiliate claw-back policy is seller-specific; the default (not clawed
  back) matches what many US sellers report and is a toggle, not a claim
  about every account.
- One SKU, one order. Bundles, sample-request programmes, and creator
  retainers are out of scope.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

MIT licensed — see [`LICENSE`](LICENSE).
