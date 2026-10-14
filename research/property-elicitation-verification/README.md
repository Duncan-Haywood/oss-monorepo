# Property elicitation for verifiable ML training

Pure-standard-library (MIT) code and a short note connecting the **property
elicitation** literature (Osband 1985; Lambert, Pennock & Shoham 2008;
Frongillo & Kash on convex-analytic characterisations; Waggoner and Frongillo
at CU Boulder) to a concrete verification problem from Gensyn's Verde line of
work: setting a *tolerance threshold* for benign floating-point discrepancy
between replicas recomputing a training step.

## What is here

- `scores.py` -- pinball loss (elicits the tau-quantile), asymmetric squared
  loss (tau-expectile), generic Bregman scores (the mean), and a joint
  (mean, second-moment) score.
- `properties.py` -- finite distributions, exact property computation,
  numerical argmin of expected score, and a test of the necessary
  condition for elicitability (convex level sets).
- `drift.py` -- the application study below.

```bash
cd research/property-elicitation-verification
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
python3 experiments/run.py
```

## Verified facts (tests)

1. Expected pinball loss is minimised at the tau-quantile and expected
   asymmetric-squared loss at the tau-expectile; three different Bregman
   scores (quadratic, exponential, quartic) all elicit the same mean.
2. **Variance is not elicitable alone**: two distributions with variance 1
   mix to one with variance 26, violating convex level sets. It *is*
   elicitable jointly, as a function of (mean, second moment) -- elicitation
   complexity 2. The mean's level sets pass the check.
3. Truthful quantile reports strictly beat every tested misreport.

## Application: pricing a tail-drift bound

A verifier attests a threshold `r` for benign discrepancy (|Student-t, df=3|,
500 calibration samples, mean of 20 seeds, 20000 test steps). Payment is
negative pinball loss against audited discrepancies. Coverage = share of
benign steps under `r`; fault detect = share of faulty steps (benign + a
shift of about 8) above `r`.

| tau | strategy | pinball loss | coverage | fault detect |
|---|---|---|---|---|
| 0.99 | empirical quantile (honest) | **0.0792** | 0.987 | 0.895 |
| 0.99 | Gaussian mean + z*sd | 0.0911 | 0.971 | 0.971 |
| 0.99 | median (lazy) | 0.5334 | 0.502 | 1.000 |
| 0.99 | 2 x max (padded) | 0.2709 | 1.000 | 0.003 |
| 0.95 | empirical | **0.1970** | 0.947 | 0.990 |
| 0.95 | Gaussian | 0.1985 | 0.948 | 0.989 |

The honest empirical quantile has the lowest expected loss in every row, so
the mechanism ranks strategies correctly. Two honest caveats: (a) at tau=0.95
the Gaussian rule is nearly as good (difference 0.0015, within seed noise),
so the payoff advantage is only clear deep in the tail; (b) the "fault detect"
column favours the Gaussian rule at tau=0.99 *only because it under-covers*
(2.9% false alarms vs 1.3%), which is not a real win. The mechanism prices
calibration, not detection power.

## Limitations / open questions

- Payments need audited ground truth for some steps; combining this with
  peer-prediction (see `../decentralized-verification-markets`) so that
  quantile reports are scored against peers is open here.
- Single scalar drift, i.i.d. calibration and test samples; real drift is
  nonstationary and hardware-dependent.
- Only finite-support distributions are used for the exact elicitation
  tests; the study uses samples.
- Multi-dimensional properties (joint quantiles, CVaR via its (quantile,
  expectile-like) pair; Fissler & Ziegel 2016) are natural extensions.
