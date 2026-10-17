# A/B Test Significance Calculator

A free browser tool for growth teams, product managers, marketers and founders: **enter visitors and
conversions for a control and a variant and see whether the result is real.** It reports the p-value and
confidence interval, a sample ratio mismatch check, the Bayesian probability that the variant is better, and an
always-valid result that stays honest when you peeked at the test while it ran. A second panel plans sample size
and duration before you start. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ab-test-significance-calculator/

After using this, you can now **tell a real lift from noise, catch a broken traffic split, and know how many
visitors you need before launching a test**.

## Model

- Fixed sample: pooled two-proportion z-test (two-sided); unpooled interval on the difference; Katz log-ratio
  interval on relative lift.
- Sample ratio mismatch: chi-square goodness of fit against the planned split; flagged below p = 0.001.
- Bayesian: Beta(1,1) priors, 20,000 seeded posterior draws; probability variant is better, expected loss of each
  choice, 95% credible interval on lift.
- Always-valid: mixture sequential probability ratio test with a normal mixing distribution (spread 10% of the
  control rate); valid at every look.
- Peeking: false-positive rate of "stop at the first significant look" over evenly spaced looks, by seeded
  simulation (matches Armitage: about 14% at 5 looks, 19% at 10).
- Sample size: standard two-proportion formula, per group, with days to run from daily traffic. A reverse mode gives the smallest lift your available traffic can detect.
- Price test: compares revenue per visitor (conversion times price) for two price points with a delta-method z-test and a Bayesian chance that the new price earns more, and states the break-even conversion drop. Fixed prices only; first-purchase revenue, not retention.

- A/B/n: up to nine variants against one control, each with a pooled z-test and Holm step-down adjusted p-values, plus the Bayesian chance each arm is best (20,000 seeded draws). Variant-versus-variant differences are not tested.

Not modelled: non-conversion metrics, variance reduction, novelty and seasonality.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of experimentation platforms and analytics vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `plan_run`, `detect_run`, `multi_test_run`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).

## What you use today, and what this does differently

- **A vendor's built-in significance readout:** convenient inside one testing tool, but each reports its own statistic, and few show a sample-ratio check or what peeking does to the false-positive rate.
- **A generic online significance calculator:** quick for a fixed-sample p-value, typically without the Bayesian view, an always-valid result, or a duration plan.
- **A spreadsheet or a statistics package:** fully transparent, but you write and verify the tests yourself.
- **What this adds:** p-value and intervals, a sample-ratio mismatch check, the Bayesian chance the variant is better, an always-valid result that stays honest if you peeked, a sample-size and duration plan, and a price test, all in the browser with no upload.
