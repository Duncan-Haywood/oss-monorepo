# Booth Rent vs Commission Calculator

A free browser calculator for hair stylists, barbers, nail techs, and other
chair-rental trades. It compares a salon commission split to a booth-rent
lease on the **same client book**, and it shows both take-home and take-home
per hour — because a bigger check that costs six unpaid hours is not always
the better job.

**After using this, you can now see which deal pays you more on your own
book, and the client count or rent that flips it, which used to take a
guess until the first rent check cleared.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/booth-rent-vs-commission -p 8080
# Run the tests
cd ventures/booth-rent-vs-commission && node --test
```

## The problem it solves

Leaving a 45–55% commission chair for booth rent looks like a raise: you keep
the whole ticket. The costs that used to sit on the salon — weekly rent, card
fees, color used on clients, wholesale retail, towels, insurance, and the
booking/laundry hours the front desk covered — come with you. Stylists who
compare only the weekly check sign a lease that pays less per hour than the
split they left.

Search demand is specific: "booth rent vs commission calculator", "is booth
rental worth it", "how many clients to cover booth rent". Generic take-home
tools do not model the two actual compensation structures in US salons.

## How it works

1. **The book.** Average ticket × clients per week, plus retail, working weeks
   per year, and minutes per service.
2. **Commission path.** Service split and retail commission. Rent, card fees,
   and backbar stay at zero — the salon typically absorbs them. Unpaid hours
   are the small leftover (notes, cleanup).
3. **Booth path.** 100% of service and retail, minus weekly rent (monthly
   quotes are converted with 52/12, not a flat four), card fees, backbar as a
   percent of service, wholesale cost of retail, and other weekly cost.
   Unpaid hours are higher because laundry and booking moved onto the renter.
4. **The two verdicts.** Dollar winner (weekly/monthly/annual take-home) and
   hourly winner (take-home ÷ chair hours + unpaid hours). They can disagree.
5. **Walk-away numbers.** Break-even clients per week holding retail constant,
   extra clients needed to match the current split, and the maximum weekly
   rent at which booth still matches commission. An optional rent offer is
   scored against the same book.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `booth-rent-vs-commission-usage` — never the ticket,
book, rent, or take-home. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `comparison_calculated`, `summary_copied`, `share_copied`,
`share_opened`, `offered_rent_compared`.

## Limitations

- Single currency and no tax handling. Self-employment tax, booth insurance
  write-offs, and household bills are yours to layer on — this is not a tax
  tool.
- One book, two deals. Sliding-scale commission, house fees on top of booth
  rent, and assistant tip-outs are not modelled as separate rows yet.
- Retail does not automatically grow when you add clients. That is
  intentional: the break-even count is appointments, not a bundled retail
  forecast.
- Starting inputs are a mid-book colorist example, not a wage survey.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, employment, or
career advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

MIT licensed — see [`LICENSE`](LICENSE).
