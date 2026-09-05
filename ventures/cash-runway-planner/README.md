# Cash Runway Planner

Small service businesses often know their profit and still run out of cash because invoices arrive later than bills. Cash Runway Planner turns starting cash, weekly income, invoice collection delay, and recurring costs into a low-balance forecast of up to 52 weeks.

When the forecast dips below zero it names **the first week cash goes negative**, which is usually earlier than the lowest week and is the date an invoice or a bill has to move in front of.

## The payments that do not repeat

A business that looks fine on a smooth weekly average is short the week the quarterly tax bill clears. A forecast built only from a weekly average cannot say that, so it answers "cash stays positive" to an owner who is about to be $3,000 down — which is worse than no answer, because they believe it.

So the form carries up to eight **one-off rows**: a description, an amount, the week it lands in, whether it is money in or money out, and an optional repeat interval in weeks. A quarterly tax bill, an insurance renewal, a van payment, the deposit you are owed on a job that starts next month. Each lands in its own week and nowhere else — unless it repeats.

**Repeats every (weeks)** turns one row into every occurrence of that bill inside the forecast window. A quarterly tax bill entered once with `13` in that field lands in week 2, 15, 28, and 41 of a 52-week forecast, instead of spending four of the eight precious rows to say the same thing four times. Leave it blank (or 0) for a payment that only happens once. Each landing still shows on its own line in the results list and the CSV, carries the same name, and is independently eligible to be the payment a shortfall plan suggests moving — the occurrence inside that particular shortfall, not always the first one.

Three rules the tests pin, each of which is a way to answer the wrong question:

- **A half-filled row is refused, not ignored.** A row with a week and no amount is a payment the visitor meant to include. Skipping it would forecast a business they do not have, and they would never learn the row had been dropped.
- **The gap measured is the deepest week of the run, not the first negative one.** Covering only the first week's shortfall leaves the owner short again a fortnight later — the shortfall they came here to avoid.
- **A structural gap is named as structural.** If weekly costs exceed weekly collections, moving one payment postpones the shortfall rather than fixing it, and the page says so instead of offering a date change that buys a week.

## What it tells you to do

Naming the week cash runs out tells an owner they have a problem. It does not tell them what to do about it, which is the only reason they opened the page. When there is a shortfall the forecast also names the single payment whose date would close it:

> First projected shortfall: **week 2**. You are $3,000.00 short at the low point (week 2).
> Moving **Quarterly tax** ($6,000.00, week 2) past week 5 closes the gap.
> Collecting **Invoice 118** ($4,000.00, due week 6) before week 2 closes the gap.

A payment that would only cover part of the gap is described as covering part of it. A payment that lands after the shortfall starts is not offered at all, because delaying it cannot rescue a week that has already gone negative.

## Using it

Open `index.html` in a browser. No account, server, API key, or upload is required. Draft values stay in your browser and can be cleared with **Reset**. A draft that used a hidden one-off row re-opens that row, so the forecast never includes a payment you cannot see.

After a forecast, **Download CSV** creates a spreadsheet-friendly copy of the rows locally. It contains week, income, costs, projected balance, and the one-off items that landed in that week — a copy that shows $9,000 leaving in week 7 without saying it was the tax bill is a worse document than the page it came from.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. We count anonymous events (forecast runs, forecasts that used a one-off row, and CSV downloads), nothing about who used it and nothing about what any row said. The **Share anonymous usage** checkbox is off by default and can be disabled at any time. Counting is also disabled when the browser sends Do Not Track or Global Privacy Control.

`cash-runway-item-events` against `cash-runway-events` is the reading that matters: whether the one-off rows are used at all is what says whether the lumpy half of a runway is the half people came for.

## Liability

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
