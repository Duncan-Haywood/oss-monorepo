# How happy are marriages at different numbers of years married?

**Headline.** Among U.S. spouses still in their first marriage (General Social Survey 1973–1994,
13,959 respondents), **75%** of those married 0–2 years called their marriage "very happy"
(95% CI 72–78%), against **61–64%** at 3–30 years (lowest 61% at 16–20 years, 58–64%) and
**68%** at 41+ years. Adjusting for survey year, sex and age at marriage leaves the same shape
(75%, 61%, 69%). The same married people followed for about four years (HCMST 2009 → 2013, still
together) rated their relationship **0.14 points lower** on a 1–5 scale (95% CI −0.19 to −0.09);
the fall was largest in the first two years of marriage (−0.38, −0.55 to −0.20; 41% rated it
lower). The rise at long durations in cross-sections is at least partly **survivor bias**: in
2009, 71% of married HCMST respondents who stayed together rated their relationship
"excellent", against 17% (10–26%) of the 102 who broke up by 2015, and those marriages are
missing from the later bands.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/marriage-divorce-evidence/app/ (the "Profile report" tab charts it).

## Three views, kept apart

| View | Design | Measure | Sample |
| --- | --- | --- | --- |
| GSS 1973–1994 | cross-sectional: different people at each duration | HAPMAR ("Taken all things together, how would you describe your marriage?"), share "very happy", share "not too happy", mean on 1–3 | currently married, never divorced or legally separated (so a first marriage still intact), survey years when age at first marriage (AGEWED) was asked with HAPMAR; years married = AGE − AGEWED; weight WTSSPS |
| HCMST 2009 | cross-sectional | Q34 relationship quality, share "excellent", share fair or worse, mean on 1–5 | married respondents at wave 1 (Feb–Apr 2009); years married = age − age at this marriage (Q21D), any marriage order; weight WEIGHT2 |
| HCMST 2009 → 2013 | within-couple trajectory: same respondents, same relationship | change in the 1–5 rating between wave 1 and wave 4 | married at wave 1, still together and re-rated at wave 4 (1,045 people) |

Results: [`satisfaction_by_duration.csv`](satisfaction_by_duration.csv) (every series, overall,
by sex, by education, and the adjusted GSS curve), [`hcmst_trajectory.csv`](hcmst_trajectory.csv),
[`survivor_bias.csv`](survivor_bias.csv) and [`sample_audit.json`](sample_audit.json). The app
reads `app/data/satisfaction_by_duration.json`.

## Method

- Shares and means are survey-weighted. Intervals are 95% percentile intervals from 500 respondent
  bootstrap resamples (200 for subgroups and the adjusted curve), seed 20261020. Cells with fewer
  than 50 respondents are not published.
- The adjusted GSS curve is a weighted logistic regression of "very happy" on the duration bands,
  survey year (linear), sex and age at first marriage (quadratic), standardised to the whole
  sample (the average prediction with every respondent set to each band). It removes those
  compositional differences, not survivor bias, and not cohort differences that track duration
  within a survey year.
- The trajectory uses wave-1 sample weights; respondents lost to follow-up are missing, which can
  bias it in either direction.

## Caveats

- **Survivor bias.** Every cross-sectional band holds only marriages that lasted that long. Unhappy
  marriages end more often (the GSS panels show 23.6% of "not too happy" spouses divorced or
  separated two years later, against 2.5% of "very happy"; `../gss_panel/`), so the later bands
  are selected towards happy marriages. A rise after 20 years is not evidence that a given marriage
  gets happier.
- **Age, cohort and period.** In a cross-section, years married move with age and birth cohort. The
  GSS sample ends in 1994 because AGEWED was not asked with HAPMAR later; it describes marriages of
  that era.
- **Different questions.** GSS asks about the marriage on three answers; HCMST about the relationship
  on five. Compare shapes, not levels.
- **The LA newlywed study** (`../newlywed_la_karney/`) measured satisfaction only at baseline in the
  public file, so it gives no trajectory here; NSFG, NLSY and SIPP ask no marital-satisfaction item
  in the files this project uses.

## Reproduce

```sh
sh ../gss_panel/download.sh && sh ../hcmst/download.sh      # official files; raw data stay out of git
GSS_RAW=../gss_panel/raw HCMST_RAW=../hcmst/raw python3 scripts/build.py   # ~3 min
```

Needs numpy, pandas, scikit-learn and pyreadstat. Tests: `python3 -m unittest test_satisfaction`
from `research/marriage-divorce-evidence/`.
