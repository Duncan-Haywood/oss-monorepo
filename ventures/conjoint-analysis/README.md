# Conjoint Analysis (choice-based conjoint)

A free browser tool for product managers, founders, pricing consultants and students: **design a
choice-based conjoint (CBC) survey, then paste the answers and get part-worth utilities, attribute
importance, willingness to pay and a market share simulator, each with a confidence interval.**
Nothing is uploaded.

**Live tool:** https://marisstella.app/conjoint-analysis/

After using this, you can now **tell which features buyers trade price for, roughly how much they
would pay for each, and what share a product configuration would win against rivals, from a survey
you designed yourself, without a paid conjoint suite**.

## What it does

1. **Design.** From an attribute list (`Price#: 9, 15, 25` per line; `#` marks a numeric attribute)
   it builds versions × tasks × concepts with an optional "none" option: each attribute's levels are
   drawn from a shuffled deck so they stay balanced, distinct within a task when the attribute has
   enough levels, with identical concepts redrawn; of 30 candidates per version it keeps the most
   D-efficient (information matrix at zero utilities). It reports the D-error, the expected standard
   error of every coefficient for 100 to 500 respondents, and how many respondents bring them all
   under 0.05 or 0.10. Download the design as CSV or a printable questionnaire.
2. **Collect** in any survey or form tool: one version per respondent, record the option picked.
3. **Merge** wide answers (respondent, version, one column per task) with the design into long format.
4. **Analyse.** Aggregate conditional logit by exact maximum likelihood (Newton-Raphson with step
   halving). Output: coefficients with model-based and cluster-robust (by respondent) standard errors;
   part-worths centred within each attribute with delta-method intervals; importance (range share);
   willingness to pay against a numeric price attribute; hit rate, McFadden R², AIC, BIC; a
   respondent bootstrap (200 resamples by default, fixed seed) for importance, WTP and shares.
5. **Simulate** shares of preference for up to eight products, with or without "none", with bootstrap
   intervals. Numeric attributes may take values between the tested levels.

Input (long format), one row per concept shown:

```
respondent,task,concept,Price,Plan,Support,chosen
r1,1,1,15,Team,Chat,1
r1,1,2,9,Starter,Email,0
r1,1,3,None,None,None,0
```

A row whose attribute cells are all empty or `None` is the no-choice option. Tasks with no choice or
two choices are dropped and counted. Without a level list, numeric-looking levels are sorted and
other levels keep their first-seen order; the first level of each attribute is the reference.

## Model and limits

- Utility of a concept = sum of its levels' part-worths (dummy coded against the first level; a
  numeric attribute gets one slope, centred at the mean of its levels) + a "none" constant.
  P(choice) = softmax within the task (McFadden 1974; Louviere & Woodworth 1983; Train 2009).
- **One segment.** Aggregate logit has the IIA property in the simulator, and when respondents
  differ it shrinks coefficients toward zero (see Verification). Hierarchical Bayes, mixed and
  latent-class logit are not here.
- Separation (a level always or never chosen) is detected and reported instead of printing a huge
  coefficient as if it were precise.
- Not modelled: prohibitions in the design, adaptive CBC, dual-response none, individual-level
  utilities, sales volume.

## Run

Open `index.html` through any static server. Tests: `node --test`. CLI:

```
node cli.mjs data/meal-kit-simulated.csv --levels data/meal-kit-levels.txt --price "Price per serving"
node cli.mjs design levels.txt --versions 10 --tasks 12 --concepts 3 > design.csv
node cli.mjs merge design.csv answers-wide.csv > answers.csv
```

## Verification

- **statsmodels pin** (`reference.test.mjs`, `eval/reference.py`, `eval/reference.json`): statsmodels
  0.15.0 `ConditionalLogit` with its own dummy coding in pandas, and a numpy cluster-robust sandwich,
  on four simulated studies (the meal-kit example; forced choice with two concepts; five concepts
  with two numeric attributes and none; homogeneous utilities with none). Coefficients agree to 1e-7,
  model-based and cluster-robust SEs to 1e-6, log-likelihood to 1e-9, importance and WTP to 1e-6.
- **Hand-worked case** (`engine.test.mjs`): two concepts, B picked 3 of 4 times: the estimate is
  ln 3 and its SE 1/sqrt(4 × 0.75 × 0.25). Gradient and Hessian are checked by finite differences;
  integer bootstrap weights equal duplicated rows.
- **Coverage and standard errors** (`eval/coverage.mjs`, output in `eval/coverage-output.txt`):
  - Homogeneous utilities (the logit is the true model), 100 respondents × 9 tasks, 3 concepts + none,
    400 studies: 95% intervals covered the true values 95.0% (model-based) and 94.8%
    (cluster-robust) of 2,400 intervals.
  - Utilities that vary by respondent (the example's settings), 200 studies of 300 respondents:
    coefficients with a true mean of at least 0.25 shrink by 7 to 15 percent (price: −0.381 against
    −0.45); model-based SEs understate the spread of estimates by 5 to 19 percent, cluster-robust SEs
    are within 6 percent; WTP lands within $0.01 to $0.10 of the true ratio of mean utilities (none
    constant aside, which is far off because it varies most between people).
- **Design** (`engine.test.mjs`): level counts within 10 of each other across 360 concepts, no
  repeated level within a task for attributes with 3+ levels, no identical concepts, and a lower
  D-error than pure random draws of the same size.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** Shares of
preference are not sales forecasts. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of survey platforms and market-research software vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`design_generated`, `analysis_run`,
`example_loaded`, `report_downloaded`) are kept only in local storage, can be switched off on the
page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free to use and source available (FSL-1.1-MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).

## Citations

- McFadden, D. (1974). Conditional logit analysis of qualitative choice behavior. In P. Zarembka (ed.),
  *Frontiers in Econometrics*, 105-142. Academic Press.
- Louviere, J. J. & Woodworth, G. (1983). Design and analysis of simulated consumer choice or
  allocation experiments. *Journal of Marketing Research* 20(4), 350-367. doi:10.1177/002224378302000403
- Kuhfeld, W. F., Tobias, R. D. & Garratt, M. (1994). Efficient experimental design with marketing
  research applications. *Journal of Marketing Research* 31(4), 545-557. doi:10.1177/002224379403100408
- Huber, J. & Zwerina, K. (1996). The importance of utility balance in efficient choice designs.
  *Journal of Marketing Research* 33(3), 307-317. doi:10.1177/002224379603300305
- Train, K. E. (2009). *Discrete Choice Methods with Simulation*, 2nd ed. Cambridge University Press.
  doi:10.1017/CBO9780511805271
