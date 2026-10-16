# AWS Commitment Break-Even Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/aws-commitment-breakeven-calculator/>

A free browser tool for engineers, FinOps practitioners and founders who pay an AWS bill: **paste hourly or daily
usage, enter the discount of each Savings Plan or Reserved Instance option from your own quote, and see how much
to commit, not just whether to.** Every committed hour is paid whether used or not, so the answer depends on the
shape of your usage. The tool finds the commitment that saves the most, draws the savings curve around it, shows
when an upfront payment pays back, and stress-tests the choice if usage falls. Nothing is uploaded.

After using this, you can now **pick a commitment level from your own usage curve, compare 1-year and 3-year and
upfront options on a present-value basis, and see the downside before you buy**.

## Model

- A commitment of C dollars/hour covers x = C/(1-d) of on-demand-equivalent usage each hour; hourly cost is
  C + max(0, U - x). Convex in x; the optimum is the d-quantile of usage (evaluated over every breakpoint in the data).
- Upfront share f over T months is converted to a present-value discount at your cost of capital:
  1 - (1-d)(f*T/A + 1 - f), A = sum of monthly discount factors. At 0% it changes nothing.
- Payback: upfront paid / monthly benefit of running the commitment.
- Stress: commitment held fixed while usage is scaled to 50%-130%.
- A steady workload (rate and share of hours) can stand in for a usage export.

Not modelled: Spot, product-specific flexibility rules, marketplace resale, service eligibility, taxes and credits,
price changes during the term. No AWS prices are fetched; discounts are typed in.

## Run

Open `index.html` through any static server. Tests: `node --test`.

Independent of Amazon Web Services and every cloud provider. AWS and product names are used only to describe what
the tool models.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**No warranty.** Provided free and as-is. Not legal, tax, or financial advice.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
