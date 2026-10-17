# Service Van Stock Optimizer

A free browser tool for HVAC, plumbing, electrical and appliance technicians and the small shops that stock their vans:
**paste your parts list and what your past jobs used, and get the stock list that finishes the most jobs on the first
visit** for the money and shelf space you have. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/service-van-stock-optimizer/

After using this, you can now **see which parts earn their shelf space, which are dead stock, and what a return trip to the
supply house really costs you**, which used to be a hunch about what "always" gets used.

## Model

- Catalog: `name, unit cost, shelf slots`. History: one past job per line, parts separated by `;` or `|`, `x2` for two of a
  part, `none` for a job that used no parts, oldest first. Optional: what the van carries now.
- A job finishes on the first visit only if every part it used (in the quantity it used) is on the van. Each unit of a part
  is one item, so the problem is a set cover, not a frequency ranking.
- Value of a stock list = return-trip cost x jobs per year x (share of past jobs completed) - carrying cost x money tied up,
  subject to an optional budget and slot limit.
- **Exact for up to 20 part units**: every list is enumerated and the jobs each list completes come from a subset-sum
  transform. Tests compare it with brute-force enumeration on 40 random problems.
- More units: exact over the 20 most-used units plus greedy/pair-add/drop/swap local search over all; the better wins.
- Self-checks: refit on the oldest 70% of jobs, score on the newest 30%, against simply stocking the most-used parts at the
  same spend; 400 seeded resamples for an 80% range; results under a half and double return-trip cost.

## Limits

Not modelled: substitutions and kits, lead times and restocking, seasonality, which technician, multi-visit jobs, price
changes, regulated or licensed parts, and any benefit beyond the return-trip cost entered. Verified only against brute force
and invented data. Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
