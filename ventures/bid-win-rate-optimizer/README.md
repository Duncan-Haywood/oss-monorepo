# Bid Win-Rate Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/bid-win-rate-optimizer/>

A free browser tool for contractors, agencies, freelancers and anyone who sends quotes: **paste or upload a CSV of
quote price, won or lost, and your cost for the job, and get a win-probability curve, the markup with the highest
expected profit inside the range you have actually quoted, and a back-test that says whether price explains your
wins at all.** Nothing is uploaded.

After using this, you can now **see how much each extra 10% on a quote costs you in win chance, which markup earns
the most per bid, and whether your history can answer that at all**, which used to take a statistician or a guess.

## Model

- Input: rows of `quote,won[,cost]` (a header may reorder the columns by name). Won is 1/0, won/lost, yes/no,
  accepted/declined and similar; unreadable rows are skipped with a warning.
- `P(win) = 1 / (1 + exp(-(a + b·x)))` with `x = ln(quote / cost)` when every row has a cost (markup model,
  comparable across job sizes), else `x = ln(quote)` with a warning when jobs span more than 4x in size.
- Newton-Raphson with step halving and a tiny ridge (perfect separation stays finite and is flagged). 95% interval on
  the slope from the inverse Hessian.
- Best quote: `(quote - cost) × P(win)` searched on a grid between the lowest and highest markup seen, never outside.
  300 seeded bootstrap resamples (wins and losses resampled separately) give the 80% range of the best markup and of
  the profit gain, and the share of resamples in which the best quote beats the usual one.
- Refuses: fewer than 30 bids, fewer than 8 wins or 8 losses, quotes that barely varied (sd of ln markup under 3%), or
  fewer than 4 distinct markup levels.
- Flags: a non-negative slope (you quote higher on easier jobs), perfect separation, a best quote at the edge of the
  tested range.
- Back-test: fit on the first 75% in the order given, score the last 25% by log-loss against the overall win rate.

## Job types

Add a column named `type`, `segment`, `service` or `trade` (needs a cost column too) and the tool also fits **one shared
price slope with a separate base win rate per job type**, so repeat customers, walk-ins and tenders are no longer
averaged together. It reports a best markup per type with a 120-resample 80% range, and a likelihood-ratio test of
whether the types differ at all (if not, it says one overall markup will do). Types with fewer than 10 bids are pooled
into "Other". Each type does not get its own slope: no type alone has enough bids for that.

## Limits

Correlation, not an experiment (job type is modelled only if you add a type column). Competitors, response time, reputation and repeat customers are not
modelled. Verified only against simulated bids with known curves. Statistical estimate from your data, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
