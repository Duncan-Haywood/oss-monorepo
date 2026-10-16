# Break-Even ROAS Calculator

A free browser calculator for ecommerce and direct-to-consumer sellers: **enter your price, costs, fees, returns and (optionally)
repeat purchases, and get your break-even ROAS, the most you can pay per customer (max CPA), and the ROAS you need for the
profit margin you want**, with a campaign checker that tells you whether real spend and revenue clear it. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/breakeven-roas-calculator/

After using this, you can now **say what ROAS and CPA an ad campaign must hit to break even or earn a 10% or 20% margin, and see
how much a higher return rate or cost of goods moves that line, in minutes instead of a spreadsheet afternoon**.

## Model

- Reported revenue `R = price x (1 - discount) + shipping charged` (what an ad platform reports, before returns).
- Refunds hand back `R` on a share of orders. Platform fee applies to kept revenue; payment fee (`% of R + fixed`) applies to every order and is not returned.
- COGS is spent on every order less the resold share of returned units; shipping on every order, return shipping on returned ones.
- `contribution = kept revenue - platform fee - payment fee - COGS - shipping`. Max CPA = contribution; break-even ROAS = `R / contribution`.
- Target margin `m` (profit as a share of reported revenue): max CPA = `contribution - m x R`, target ROAS = `R / max CPA`; unreachable when max CPA is not positive.
- LTV basis: `n` orders per customer, repeat orders earn a share of first-order contribution, margin measured on `n x R`; ROAS is still first-order revenue over spend.
- Scenario table (default 0%, 10%, 20% margins), sensitivity grid (return rate x COGS change), campaign checker (spend, platform revenue, optional orders), MER check, CSV exports.

## Limits

Not modelled: sales tax, fixed overhead, creative and agency cost, churn curves, new-versus-returning mix inside attributed sales, cash timing, attribution windows.
Verified only against hand-worked examples and identity tests on invented data. Planning aid, not financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
