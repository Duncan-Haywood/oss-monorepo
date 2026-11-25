# Item response theory: item difficulty, discrimination and fit for a right/wrong test

**Live:** https://marisstella.app/item-response-theory/

You gave a test (a quiz, an exam, a certification test, a screening
questionnaire) and want to know which questions work, how hard each one
really is, and how precisely the test measures. This tool answers, on your
CSV, in the browser:

- **How hard is each question, and how well does it separate strong from
  weak?** The one-parameter (Rasch) and two-parameter logistic models
  (Rasch 1960; Birnbaum 1968), fitted by marginal maximum likelihood
  (Bock & Aitkin 1981), with standard errors from the observed information.
- **Does every question have its own discrimination, or is one enough?**
  Both models, a likelihood-ratio test, AIC and BIC; the lower BIC is kept
  unless you choose.
- **Does a question behave as the model says?** S-X2 item fit (Orlando &
  Thissen 2000), with the model's expected proportions from the
  Lord & Wingersky (1984) recursion.
- **Is a key wrong?** Give raw answers and a key row: for each question,
  the share choosing each answer and the mean score on the other questions
  of those who chose it. A wrong answer chosen by stronger students than the
  key is flagged.
- **Where is the test precise?** The test information curve and the standard
  error of measurement along ability; marginal reliability.
- **What ability does each person have?** EAP scores with posterior standard
  deviations (Bock & Mislevy 1982), and a number-right to ability table
  (Thissen et al. 1995).

Nothing is uploaded. A statistical estimate from the answers you give, not a
substitute for a psychometrician's review of a high-stakes test.

## Methods

| Method | Paper | What it does |
| --- | --- | --- |
| 1PL / Rasch, 2PL | Rasch 1960; Birnbaum 1968 | P(right) = 1 / (1 + exp(-a(theta - b))), logistic metric (no 1.7 constant); the 1PL shares one slope, ability N(0, 1) |
| Marginal ML by EM | Bock & Aitkin 1981 | 61 nodes on [-6, 6] with normal weights; E-step posteriors per response pattern; M-step Newton per item (jointly for the 1PL's shared slope); missing answers skipped |
| Standard errors | (Fisher's identity) | Observed information by central differences of the exact marginal score; delta method for b = -d / a |
| Item fit | Orlando & Thissen 2000 | S-X2 over total scores 1 to J-1, pooled until both expected counts reach 1; df = groups - item parameters; complete data only |
| Summed scores | Lord & Wingersky 1984; Thissen et al. 1995 | Score distribution at each ability; number-right to EAP table |
| Ability | Bock & Mislevy 1982 | EAP and posterior SD per person |
| Classical | | Proportion right, item-rest correlation, distractor shares and mean rest score |

`PAPERS` in `engine.mjs` lists what was implemented from each paper and every
deviation. All DOIs were checked against Crossref on 2026-11-17.

## Input

```
student,q1,q2,q3
key,B,D,A
Ana,B,D,C
Ben,A,D,A
```

CSV or tab-separated, one row per person, one column per question. Cells are
0/1 (also true/false, yes/no, right/wrong), or raw answers with a row whose
first cell is `key` (or the `key` option). Blank, `NA`, `.` and `-` are
missing and treated as not presented. A column headed `id`, `name`,
`student` ... holds labels; one headed `count`, `freq` or `weight` says how
many people gave that row (pattern tables like `data/lsat6.csv`). Limits:
20 to 20,000 people, 2 to 100 questions; every question needs at least one
right and one wrong answer.

## Use it

- **Browser:** the live page, or open `index.html` from a checkout (served
  over http, since it loads ES modules).
- **CLI:** `node cli.mjs answers.csv [--model auto|1pl|2pl] [--key BDAC...] [--items|--people|--report|--json] [--no-se]`.
- **Agents:** `node platform/agents/tools.mjs call item-response-theory analyze --input '{"text":"item1,item2,item3,count\n1,1,1,40\n1,1,0,25\n1,0,0,20\n0,0,0,15\n0,1,0,5\n1,0,1,5","model":"1pl"}'`.
- **JavaScript:** `analyze({text, model, key, standardErrors})`, or the
  pieces: `parseResponses`, `compressPatterns`, `fitModel`,
  `standardErrors`, `sx2`, `scoreTable`, `testInformation`,
  `marginalLogLik`.

## Verification

`node --test '*.test.mjs'` (about 5 s). Against independent references:

- **ltm's published output.** Rizopoulos (2006, *Journal of Statistical
  Software* 17(5)) prints `rasch(LSAT)` and the 2PL comparison. The 1PL here
  matches every printed digit: the five difficulties (-3.6153, -1.3224,
  -0.3176, -1.7301, -2.7802), their standard errors (0.3266, 0.1422, 0.0977,
  0.1691, 0.2510), the slope 0.7551 (0.0694), log-likelihood -2466.938, AIC
  4945.875, BIC 4975.322; and the 2PL's log-likelihood -2466.65, AIC 4953.31,
  BIC 5002.38 and likelihood-ratio test 0.57 on 4 df, p = 0.967.
- **girth** (Python, MIT, version 0.8.0; `eval/reference.py`, saved in
  `eval/reference.json`), with the same 61-point quadrature: within 0.0002
  on LSAT and 0.004 on a simulated 15-item, 1,000-person test
  (`eval/sim-2pl.csv`). The remaining gap is girth's looser stopping rule.
- **Identities.** Pattern counts and expanded rows give the same fit; the EM
  log-likelihood never decreases; no small move of any parameter raises it
  at the fit; the Lord-Wingersky distribution matches brute-force
  enumeration; the chi-square tail matches tabulated quantiles; a reversed
  item gets a negative slope and a flag.
- **Simulation with a known truth** (`eval/simulate.mjs`, saved in
  `eval/simulation.json`): 60 tests of 20 items and 1,000 people. 95%
  intervals covered 95.1% of the true slopes and 95.5% of the true
  difficulties (RMSE 0.13 and 0.11). S-X2 flagged 5.1% of 1,140 items that
  fit at the 5% level. On one item with a 25% guessing floor, which a 2PL
  cannot represent, S-X2 flagged it in only 7 of 60 tests (11.7%): with
  1,000 people the test has little power against guessing alone. When the
  truth was a 1PL, BIC chose the 1PL in all 60, and the likelihood-ratio
  test rejected at 5% in 0 of 60 (expected about 3; its p-values were spread
  evenly, mean 0.48).
- **A miskeyed question** (`eval/sat12.py`, `eval/sat12.mjs`, saved in
  `eval/sat12.json`). On mirt's SAT12 data (600 students, 32 questions), the
  distractor table flags question 32's answer 3 as chosen by stronger
  students than the keyed answer 5; rescored, its discrimination rises from
  0.12 to 0.47. mirt's documentation says the key "may be incorrect, and
  should be changed from 5 to 3", found there by a nominal response model.
  The table also flags question 12's answer 3, by a much smaller margin
  (mean rest 18.5 against 18.3 for the key); nothing outside the data says
  whether that key is wrong.

## What it does not do

No three-parameter (guessing) model, no partial-credit or graded items, one
dimension only, a normal ability distribution, no differential item
functioning and no equating. S-X2 and the score table need complete
answers. Discriminations from a few hundred people are rough; read the
standard errors.

## Sources and credit

Implemented from the papers cited above; no third-party code was ported. The
LSAT data are from Bock & Lieberman (1970) as distributed with the R package
ltm (`data/SOURCE.md`). Not affiliated with the authors of the cited papers,
the Law School Admission Council, or the authors of ltm, mirt or girth.

## No warranty

Provided free and as-is, without warranty of any kind. Not psychometric,
educational, legal or other professional advice; a testing standard,
licensing body or contract may require a different method. FSL-1.1-MIT licence.
