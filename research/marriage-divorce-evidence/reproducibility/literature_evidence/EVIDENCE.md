# What predicts divorce? Published evidence, re-verified

This folder holds 286 records of published evidence on divorce predictors: hazard and odds
ratios, life-table probabilities, correlations and prediction accuracies. Each one carries a
verbatim quote from its source, a DOI checked against Crossref and a `verified` flag. The app's
literature adjustment (`app/literature.js`) reads 10 of them. Nine pass every rule and are
applied. The tenth, the husband's destructive-conflict hazard ratio, is withheld, for the
reason given in the section on what the app uses.

The records were first gathered by hand on 2026-10-20. A spot check then caught one record
that printed a recomputed number in place of the published one: Martin (2006), age at marriage
18 or younger, gave e^B as 2.41 where the PDF prints 2.42. After that, every record was checked
again by a script rather than by eye, and 108 of the 286 changed. Nothing in `evidence.json`
is a number that a published source does not print, unless the record also carries the
calculation that produces it.

**Files**

| File | What it is |
|---|---|
| `evidence.json` | The 286 records (schema at the top of the file). |
| `SOURCES.md`, `SOURCES.json` | Every work cited and every text a quote was checked against, with retrieval method, PDF checksums and licence notes. |
| `doi_check.json` | Crossref record for each of the 45 DOIs (title, year and first author compared with the citation). |
| `nchs_sample30_check.json` | 30 random NCHS table rows, checked against a second PDF text extractor. |
| `../../app/data/nchs_disruption_tables.json` | Bramlett & Mosher (2002) and Copen et al. (2012) disruption and survival curves by characteristic, with SEs (public domain). |
| `../../app/data/literature_evidence.json` | The 10 records the app's literature adjustment can use. |
| `scripts/` | Extraction, verification and export scripts (listed under "Reproduce" below). |

## How each record was verified

`scripts/verify_quotes.py` checks four things for each record, with no judgement calls:

1. **The quote is verbatim.** Each fragment of `quote` must occur in a cached copy of its
   source after normalising only Unicode form, dashes and minus signs, quote marks, case,
   whitespace and table-cell separators. Fragments are separated by " ... ".
2. **Every number is printed as quoted.** "2.41" does not match "2.412" or "12.41".
3. **Every stored value traces to the quote.** `estimate`, `ci_low`, `ci_high` and
   `range_*` are either printed in the quote (or are its percentage divided by 100), or are
   recomputed from an explicit `derivation` whose inputs are printed in the quote. The
   derivations are exp(B) with Wald CI, delta-method CI from an SE on the ratio scale,
   printed ratio with log-scale SE, p ± 1.96 SE, 1 − survival, and percent change.
   Tolerance: 0.0006, which is the 3-decimal storage precision.
4. **Supporting quotes** (`extra_quotes`: base rates, denominators) get checks 1–2 against
   their own sources.

`scripts/check_dois.py` re-resolved every DOI at Crossref. All 45 match the cited title,
year (print or online) and first author.

Every number in the prose fields (`n`, `se_or_other`, `caveats`, and so on) was also
audited against the record's sources. The unsupported ones were removed (see "What changed").
The few that remain are arithmetic on verified numbers, labelled as such: for example
"79/95 = 83.2%".

**Provenance** says what the quote was checked against. `primary` means the full text of
the paper or report (249 records). `abstract` means only the published abstract (31).
`secondhand` means a third party describing the work: the Gottman Institute FAQ, a
university press release or a transcription (6). `verified: true` means the quote, numbers
and derivations check out against the named source. For a secondhand record, that confirms
what the third party wrote, not what the paper found. **`usable_in_app`** is stricter: the
record must be verified, its provenance must be `primary`, it must map to an app factor, and
it must not be withheld.

Source texts are copyrighted and are **not** in the repository. `SOURCES.json` says how to
rebuild each one into `source_cache/`, which git ignores. Without that cache,
`verify_quotes.py` skips the quote checks, says so, and still recomputes every derivation.

**Results (2026-10-20):** 286 records; 286 pass every check against their sources; 45/45
DOIs match Crossref; 9 records are usable by the app. The 10 PDFs with a recorded URL were
downloaded again and are byte-identical to the copies used. The PMC and web texts were
fetched again and match too; the only difference was one IFS page's sidebar.

**NCHS tables.** `scripts/parse_nchs_tables.py` is a new, independent parser of the
`pdftotext -layout` text. It counts the dot-leader rows in each table block and reads all of
them. Its values agree with the first pass on all 151 rows that went into `evidence.json`.
There it fixed two row labels where a footnote marker had been read into the name ("SMSA1,
other" and "SMSA , central city"). It also parses the second-marriage table (Table 41) in full
and keeps "*" cells (below NCHS reliability standards) as null. For a second check, 30 rows
drawn at random (seed 20261020) were looked up in pypdf's text of the same PDFs. 26 matched
mechanically. The other 4 matched on reading: two Copen Table 7 rows where pypdf interleaves a
Yes/No pair column by column, a row whose "*" cells ended the regex early, and a row on a
"—Con." continuation page. Notes are in `nchs_sample30_check.json`.

## What changed in verification

Of the 286 records, 108 changed. The kinds of change:

* **Numbers that were not as printed (8 records).** Martin (2006) Table 3 prints e^B. The
  first pass used exp(rounded B) instead. Fixed values:

  | Martin 2006 row | First pass | Printed e^B |
  |---|---|---|
  | Married at 18 or younger | 2.41 | 2.42 |
  | 19–21 | 1.60 | 1.59 |
  | 25–27 | 0.803 | 0.80 |
  | 28–30 | 0.787 | 0.79 |
  | 31 or older | 0.607 | 0.61 |
  | Premarital first birth | 1.419 | 1.41 |

  Killewald (2016) had the same problem in two rows: under 21 was 1.346 and the printed OR is
  1.345; South was 1.322 and the printed OR is 1.321. The CIs for all eight were recomputed
  from the printed value and the printed SE of B.
* **Numbers removed because no retrievable source prints them (6 records).**
  * Heyman & Slep (2001), positive predictive value 0.29. This came from a search summary;
    the full text is blocked.
  * Cacioppo et al. (2013), break-up rates of 5.96% and 7.67%. These came from a China Daily
    page that now returns 404.
  * Amato & DeBoer (2001), OR 2.0. The abstract says "approximately doubled", which is not a
    number.
  * Lavner & Bradbury (2012), 0.15. The text prints "Fifteen percent"; the count 21/136 is
    kept in the notes.
  * Schoen & Canudas-Romo (2006) and Lavner & Bradbury (2010): a reported *range* had been
    stored as a confidence interval, and in one case its midpoint as the estimate. Both are
    now in `range_low` and `range_high`.
* **Wrong or unsupported prose (9 records).**
  * Lavner & Bradbury (2012) listed n as "from 464 newlywed spouses". That figure belongs to a
    different paper; this sample is 136 of 172 couples.
  * Sample sizes nobody prints were removed: Heyman & Slep's "528, split 264/264", Amato &
    DeBoer's "~691" and Zhang & Van Hook's "6 panels".
  * Also removed: an unsourced "mean ~5 years married" (Gottman & Levenson 2000), commentary
    percentages for Lehrer & Chiswick (1993), and a comment's volume and pages that were never
    checked.
* **Quotes made verbatim (64 records).**
  * "chi2" restored to "χ2".
  * Stray backslash escapes removed (10 records).
  * Breslau et al. (2011) row labels had been paraphrased, for example "Alcohol abuse
    (with/without dependence)". The printed label is "Alcohol abuse w / without dependence".
    The table title is now part of the quote so that the divorce table cannot be confused with
    the marriage table.
  * Roberts et al. (2007) had "[-]" inserted. The PDF's minus sign and "=" are private
    glyphs; they are now mapped and documented.
  * Quotes that crossed a page footer were split at the break.
  * Table rows were rebuilt in the order the PDF prints them.
  * A press release that renders "Carrère" as "Carr?" is now quoted only after the broken
    name.
* **Derivations made explicit (32 records).** CIs computed from a printed SE now say how,
  and the verifier recomputes them: Manning & Cohen, Francis-Tan & Mialon, Killewald,
  Bratter & King, and Rosenfeld & Roesler.
* **Withheld from the app (1 record).** Birditt et al. (2010)'s husband destructive-conflict
  HR of 4.28 sits in a model that also has a "Hus. Destructive X Years to divorce" term (HR
  .14). The husband effect therefore changes over time, and 4.28 is not a constant hazard
  ratio. The first pass left that term out.
* **Added (4 records).**
  * Breslau et al. (2011) Model 2, all disorders entered together, for depression and for
    alcohol abuse. These are the versions to use when adjustments stack.
  * Rosenfeld & Roesler (2019) Model 4, for one and for two or more earlier cohabiting
    partners. This model has no cohort interaction and prints SEs.

**One correction of the check itself.** An early read of the Gottman Institute FAQ missed
the sentence "picked out all seven divorced couples out of 56", and the first-pass base rate
for Buehlman et al. (1992) was briefly marked as unsupported. A negative test of the verifier
caught the miss. The sentence is in the FAQ, and the base rate is now a checked extra quote.

## Which predictors are robust, and which are fragile

"Robust" here means a large, prospective, multivariable estimate with an interval, replicated
in other data sets. "Fragile" means small, in-sample, unadjusted, secondhand or single-study.
Every number below is in `evidence.json` with its quote.

**Robust**

* **Age at marriage.** Martin (2006), U.S. women 1975–94, Cox model with education, race and
  premarital birth. Against marrying at 22–24, marrying at 18 or younger has HR 2.42 (95% CI
  2.19–2.67, derived) and marrying at 31 or older has HR 0.61 (0.53–0.70). Raley & Bumpass
  (2003): 68% of marriages begun at 13–17 dissolve within 30 years, against 31% of those begun
  at 30 or older. Copen et al. (2012): 46% of women who married before 20 had a disrupted
  first marriage by 10 years, against 22% of those who married at 25 or older.
* **Education.** Copen et al. (2012): women with a bachelor's degree, 15% disrupted at 10
  years; a high-school diploma, 40%. Martin (2006): 10-year dissolution for women with a
  4-year degree fell from 29.0% (1975–79 marriages) to 16.5% (1990–94). Killewald (2016):
  husband's college degree OR 0.572 (0.424–0.772) for post-1975 marriages.
* **Premarital birth.** Martin (2006) HR 1.41 (1.30–1.53). Manning & Cohen (2012), men, HR
  1.84 (1.20–2.82). Killewald (2016), OR 1.244 (0.989–1.565, not significant after 1975).
* **Mental disorders before marriage.** Breslau et al. (2011), WHO surveys in 12 countries,
  all disorders entered together: major depression OR 1.6 (1.4–1.8); alcohol abuse OR 1.6
  (1.4–1.9).
* **Parents' marriage.** Manning & Cohen (2012), full models: growing up with two
  biological or adoptive parents, HR 0.74 (women, 0.55–0.99) and 0.69 (men, 0.48–1.00).
  Bramlett & Mosher (2002): 29% of first marriages disrupted by 10 years if the wife grew up
  in an intact two-parent family, against 43% otherwise. Salvatore et al. (2018) find
  adoptees resemble their *biological* parents' divorce history, which points to inherited
  traits rather than parental example; heritability 0.13.
* **Personality.** Roberts et al. (2007), meta-analysis of prospective studies: neuroticism
  r = .17 (.12–.22), agreeableness −.18, conscientiousness −.13. That is as large as or
  larger than socioeconomic status (r = −.05).

**Moderate, or depends on cohort and specification**

* **Premarital cohabitation with the spouse.**
  * Manning & Cohen (2012), women's zero-order model: HR 1.03 (0.80–1.32).
  * Rosenfeld & Roesler (2019): OR 1.31 with controls, but the effect reverses in the first
    year of marriage (interaction −0.39, SE 0.090).
  * Kuperberg (2014), abstract only: the gap shrinks once couples are compared by age at
    moving in together.
  * Cohabiting with *other* partners first is the strong signal. Rosenfeld & Roesler Model 4:
    OR 3.03 (2.86–3.22) for one other partner and 4.31 (3.98–4.66) for two or more, women
    only. These estimates are heavily selected.
* **Religion.** Killewald (2016): "at least one spouse is not religious", OR 1.293
  (1.061–1.576) after 1975. Francis-Tan & Mialon (2015): regular attendance HR 0.625.
  Bramlett & Mosher (2002): 31% of first marriages disrupted by 10 years when religion is
  "very important" to the wife, against 45% when it is "not important". On religious
  *mismatch*, only an abstract giving direction (Vaaler et al. 2009) and a secondhand
  transcription (Lehrer & Chiswick 1993) were retrievable, so there is no usable number.
* **Paid work.** Killewald (2016): husband employed full-time, OR 0.746 (0.606–0.918) for
  marriages begun after 1975. Wife's full-time work and household income: no significant
  association.

**Fragile: do not lean on these**

* **Wedding spending, engagement ring, attendance and honeymoon** (Francis-Tan & Mialon 2015).
  Online convenience sample, many tests, stars at the 10% level.
* **Premarital sex partners** (Wolfinger 2016, an IFS blog post). Life-table percentages with
  no intervals. The author notes the 33% against 30% difference is not significant.
* **Interracial pairings** (Bratter & King 2008). Some printed SEs (.02, .05) are implausibly
  small for the cell sizes. Zhang & Van Hook (2009, abstract) find the risk tracks the more
  divorce-prone origin group.
* **Meeting online** (Cacioppo et al. 2013). Funded by eHarmony; "slightly less likely" in the
  authors' own words; no verified percentages.
* **Alcohol couple concordance** (Torvik et al. 2013). Abstract only: HR 3.07 when only the
  wife is a heavy drinker, with no CIs. It is not used.

## The Gottman claims, read against the base rate

The popular claim is that John Gottman "predicts divorce with 90%+ accuracy". The numbers
come from discriminant analyses fitted and scored **on the same small samples**, with no
holdout. In samples where few couples divorce, a rule that predicts *nobody divorces*
already scores high. The table compares each claim with that no-divorce rule, using only
base rates that a retrieved source prints.

| Study (record) | Claimed accuracy | Divorced / total | "Nobody divorces" scores | Provenance of claim |
|---|---|---|---|---|
| Buehlman, Gottman & Katz 1992 (`Buehlman1992_OHI_accuracy`) | 93.6% | 7 / 56 (Gottman Institute FAQ, for the Gottman, Katz & Hooven study; same sample by inference) | 87.5% | secondhand (FAQ) |
| Carrère et al. 2000, Time 2 (`Carrere2000_OHI_accuracy_T2`) | 87.4% | 16 / 95 by Time 3 (UW News 2000) | 83.2% at Time 3; higher at Time 2, when fewer had divorced | abstract |
| Carrère et al. 2000, Time 3 (`Carrere2000_OHI_accuracy_T3`) | 81% | 16 / 95 | 83.2%: **the claim is below the no-divorce rule** | abstract |
| Gottman, Coan, Carrère & Swanson 1998 (`GottmanCoan1998_newlywed`) | "90%" (FAQ urn example) | 17 / 147 (130 stayed married + 17 divorced, per the FAQ) | 130/147 = 88.4% | secondhand (FAQ; counts not checked against the paper) |
| Gottman & Levenson 2000 (`GottmanLevenson2000_14yr_accuracy`) | 93% | 21 / 79 (Gottman & Levenson 2002 abstract) | 58/79 = 73.4% | abstract; the model includes the couple's own satisfaction and thoughts of dissolution |
| Gottman & Levenson 1999 (`GottmanLevenson1999_rebound_*`) | 82.6% (conflict talk) / 92.7% (positive talk) | not extracted (73 couples followed) | — | primary; codes chosen because they were significant in the same data |
| Fowers & Olson 1986, PREPARE (`FowersOlson1986_PREPARE`) | 91% | 31 / 90 (extreme groups: 59 happily married against 31 divorced or separated; dissatisfied and cancelled couples dropped) | 65.6% | primary; in-sample, extreme groups |

Three points follow.

1. **Accuracy is the wrong yardstick at low base rates.** At 12–17% divorce, the no-divorce
   rule scores 83–88%. A model has to beat that, out of sample, to show any skill.
2. **Out of sample, the accuracy collapses.**
   * Heyman & Slep (2001) re-analysed archival data and report that "accuracy and predictive
     value drops precipitously during crossvalidation". They conclude that uncross-validated
     results "should be interpreted with extreme caution, no matter how impressive the
     initial results appear to be". This is verified in the abstract. Their specific PPV
     figures could not be retrieved and are not reproduced.
   * Kim, Capaldi & Crosby (2007) tested Gottman et al.'s affective process models in 85
     at-risk community couples: "The major findings of Gottman et al. failed to replicate. In
     particular, men's rejection of their partners' influence, the lack of men's de-escalation
     of partners' negative affect, and women's negative start up were not predictive of
     relationship status." (abstract).
   * Joel et al. (2020), 43 data sets: relationship variables explained up to 45% of
     variance in *current* quality, and change in quality "was largely unpredictable".
3. **What does hold up prospectively is hostile conflict, measured as a hazard.**
   * Birditt et al. (2010) followed 373 couples for 16 years; 46% divorced or separated.
   * Wives' self-reported destructive conflict in year 1 (yelling, insults, raking up the
     past, needing the last word) predicts divorce: HR 1.51 per point on a 1–4 scale,
     p < .05, adjusted for race, education, income and family background. No CI is printed.
   * The husbands' HR is larger (4.28) but varies over time in the published model.
   * Rogge & Bradbury (1999, abstract) found that aggression, not communication, separated
     the divorcing couples.
   * The literature module maps Gottman-style questions to Birditt's wife HR. It never uses
     an accuracy figure.

So: Gottman's work identifies real correlates of unhappy and unstable marriages, especially
contempt and hostility. The headline accuracy figures are in-sample, on small samples, mostly
reported through the Institute's own pages. They sit close to, and in one case below, the
accuracy of predicting that nobody divorces. They are not evidence that an individual
couple's divorce can be predicted with 90% accuracy.

## Population baselines (public domain)

`app/data/nchs_disruption_tables.json` holds the life-table curves with SEs, exactly as
printed:

* **Bramlett & Mosher (2002)**: NSFG 1995, women 15–44. Probability of first-marriage
  disruption (separation or divorce) after 1, 3, 5, 10 and 15 years, by 25 characteristics
  (Table 21) and 8 community characteristics (Table 22), plus second marriages (Table 41).
  Overall, 0.20 by 5 years, 0.33 by 10 and 0.43 by 15. For second marriages, 0.39 by 10
  years.
* **Copen et al. (2012)**: NSFG 2006–2010. Probability that a first marriage survives 5, 10,
  15 and 20 years.
  * Women (Table 5), all women 2006–2010: survival 0.80, 0.68, 0.60 and 0.52, so 48% are
    disrupted by 20 years.
  * Men (Table 6): 0.81, 0.70, 0.62 and 0.56.
  * Table 7 breaks these down by premarital cohabitation and engagement, and by the spouse's
    earlier marriage or children.

These are unadjusted, bivariate tables. Rows overlap and are confounded with each other, so
they are baselines, not effects to multiply together.

## What the app uses

`app/literature.js` adjusts a data lens's divorce curve for factors **that lens does not
model**. It shows its result as a **literature-based adjustment, lower confidence than the
data lenses**. It applies only these records:

| Factor | Record | Published | Uncertainty used |
|---|---|---|---|
| Wife's destructive conflict (1–4) | Birditt2010_destructive_wife | HR 1.51 per point, p < .05 | no CI printed: SE = ln(1.51)/1.96, the widest consistent with p < .05 |
| Depression before marriage | Breslau2011_depression_M2 | OR 1.6 (1.4–1.8) | printed CI |
| Alcohol abuse before marriage | Breslau2011_alcoholabuse_M2 | OR 1.6 (1.4–1.9) | printed CI |
| Neuroticism (per SD, each partner) | Roberts2007_neuroticism | r = .17 (.12–.22) | r converted to log odds per SD, d = r / √(p(1−p)(1−r²)), with divorce prevalence p drawn from 0.15–0.5 (an assumption) |
| Wife cohabited with 1 / 2+ other partners | Rosenfeld2019_other_cohab1_M4, _2plus_M4 | OR 3.03 (2.86–3.22) / 4.31 (3.98–4.66) | CI derived from printed SE |
| Did not grow up with both parents (wife / husband) | Manning2012_intactfamily_W / _M | 1 / HR(intact): 1/0.74, 1/0.69 | CI derived from printed SE |
| At least one spouse not religious | Killewald2016_notreligious_post1975 | OR 1.293 (1.061–1.576) | CI derived from printed SE |

The app refuses three factors:

* the husband's destructive conflict (withheld, as above);
* religious mismatch (no verified primary hazard ratio);
* any factor the chosen lens already models. For example, the NSFG 2002 lens models whether
  the wife grew up with both parents, the NLSY79 lenses model religious attendance, and the
  LA newlywed lens models hostility, substance use and negative affect.

The module's documentation covers the Monte Carlo, the transport SD and the overlap
shrinkage. When k adjustments stack, each log HR is multiplied by 1 / (1 + (k − 1)ρ), with
ρ ~ U(0.1, 0.5).

## Reproduce

```
cd research/marriage-divorce-evidence/reproducibility/literature_evidence
python3 scripts/manual_records.py /tmp/first_pass.json                 # first-pass records (kept for audit)
# rebuild source_cache/ (see SOURCES.json "how"), e.g.:
python3 scripts/fetch_sources.py pmc PMC3777640 PMC3487709 PMC4011132 ...
python3 scripts/fetch_sources.py pdf https://www.cdc.gov/nchs/data/nhsr/nhsr049.pdf nhsr049
python3 scripts/parse_nchs_tables.py source_cache/pdf_sr23_022.layout.txt source_cache/pdf_nhsr049.layout.txt ../../app/data/nchs_disruption_tables.json
python3 scripts/check_dois.py --evidence /tmp/first_pass.json          # -> doi_check.json
python3 scripts/build_evidence.py --manual /tmp/first_pass.json --nchs ../../app/data/nchs_disruption_tables.json
python3 scripts/verify_quotes.py                                        # exit 0 = every verified record still checks out
python3 scripts/check_nchs_sample.py sr23_022.pdf nhsr049.pdf           # second-extractor cross-check (needs pypdf)
python3 scripts/export_app_evidence.py && python3 scripts/write_docs.py
cd ../../app && node --test tests/literature.test.mjs
```

<!-- INDEX: generated by scripts/write_docs.py; edits below this line are overwritten -->

## Record index (non-NCHS records)

Every non-NCHS record, grouped by predictor. Estimate and interval are as stored (CI unless marked "range"); "derived" means the value is recomputed from printed numbers by the stated method. The 151 NCHS table rows are in `evidence.json` and, with all durations, in `app/data/nchs_disruption_tables.json`.

### Oral History Interview (perceived marital bond / "story of us")

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Buehlman1992_OHI_accuracy` | Discriminant classification: divorced/separated vs stable at ~3-year follow-up | accuracy (in-sample % correctly classified) | 0.936 |  | secondhand | yes |  |

### Oral History Interview (perceived marital bond)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Carrere2000_OHI_accuracy_T2` | Discriminant classification: divorced vs intact within first ~5 years (Time 2) | accuracy (in-sample % correctly classified) | 0.874 |  | abstract | yes |  |
| `Carrere2000_OHI_accuracy_T3` | Discriminant classification: divorced vs married at Time 3 (7-9 years) | accuracy (in-sample % correctly classified) | 0.81 |  | abstract | yes |  |

### Positive-to-negative ratio during conflict ("regulated" vs "nonregulated" couples; basis of the 5:1 rule)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `GottmanLevenson1992_regulated` | Nonregulated vs regulated couples (balance-theory classification from Rapid Couples Interaction Scoring System point graphs) | direction only (higher risk of separation/dissolution); no OR in abstract |  |  | abstract | yes |  |

### Couple conflict type (validating/volatile/avoiding vs hostile, hostile-detached)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Gottman1993_typology` | Hostile & hostile/detached vs three stable types | direction only |  |  | abstract | yes |  |

### Affect in conflict & events-of-day conversations + marital satisfaction + thoughts of dissolution

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `GottmanLevenson2000_14yr_accuracy` | Divorced vs married over 14 years (early <7y and late divorcers) | accuracy (in-sample % correctly classified) | 0.93 |  | abstract | yes |  |

### Unregulated volatile affect vs "neutral affective style"

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `GottmanLevenson2002_twofactor` | Among divorcers only: time to divorce | post hoc model (no accuracy given in abstract) |  |  | abstract | yes |  |

### SPAFF-coded affect in conflict conversation (husband interest, contempt/disgust; wife interest, sadness)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `GottmanLevenson1999_rebound_conflict` | Divorced vs stable at 4 years | accuracy (in-sample discriminant) | 0.826 |  | primary | yes |  |

### SPAFF-coded affect in post-conflict positive conversation

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `GottmanLevenson1999_rebound_positive` | Divorced vs stable at 4 years | accuracy (in-sample discriminant) | 0.927 |  | primary | yes |  |

### Newlywed conflict affect: wife harsh startup, husband rejecting influence, lack of de-escalation, low positive affect

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `GottmanCoan1998_newlywed` | Divorced vs stable over 6 years | accuracy (in-sample); figure varies by source (83% Slate; ~90% Wikipedia; FAQ "90%") |  |  | secondhand | yes |  |

### Harsh startup (first 3 minutes of conflict discussion)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `CarrereGottman1999_startup` | Later-divorced vs stable newlyweds | direction only |  |  | secondhand | yes |  |

### Methodological: in-sample vs cross-validated divorce prediction

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `HeymanSlep2001_crossval` | Derivation half vs holdout half; then adjusted to population base rate | qualitative (abstract) |  |  | abstract | yes |  |

### Gottman 1998 affective process predictors (husband rejecting influence, lack of de-escalation, wife negative startup)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Kim2007_nonreplication` | Predicting relationship status ~2.5 years later | replication test (null) |  |  | abstract | yes |  |

### Physical aggression vs communication (newlyweds)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Rogge1999_aggression` | Separated/divorced vs married at 4 years | accuracy (classification using communication + aggression) | 0.68 |  | abstract | yes |  |

### Premarital observed negative/positive communication; self-reported negative communication

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Markman2010_premarital_comm` | Divorce within first 5 years | significance only |  |  | abstract | yes |  |

### Self-reported destructive conflict behaviour, year 1 (husband)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Birditt2010_destructive_husband` | Per unit of destructive-behaviour scale | HR | 4.28 |  | primary | yes | withheld |

### Self-reported destructive conflict behaviour, year 1 (wife)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Birditt2010_destructive_wife` | Per unit of scale | HR | 1.51 |  | primary | yes | used |

### Race: Black American couple

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Birditt2010_race` | Black vs White couples (covariate-only model) | HR | 2.81 |  | primary | yes |  |

### Observed hostility during conflict (meta-analysis)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Woodin2011_hostility_meta` | Association with relationship SATISFACTION (not divorce) | r (described as medium effect) |  |  | abstract | yes |  |

### Negative communication among initially highly satisfied newlyweds

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Lavner2012_satisfied_divorce` | Divorced by year 10 vs married, among 136 stably satisfied couples | proportion divorced (21 of 136; base rate in subgroup) |  |  | primary | yes |  |

### Marital satisfaction trajectory (low intercept and/or steep decline over first 4 years)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Lavner2010_lowsat_trajectories` | Low/declining trajectory groups: 10-year divorce rate | proportion divorced (range across groups) |  | range 0.4–0.6 | secondhand | yes |  |

### Premarital doubts (wife)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Lavner2012_cold_feet` | Wives with vs without premarital doubts: 4-year divorce | proportion divorced | 0.19 |  | primary | yes |  |

### Couple already had a shared child at marriage

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Lavner2020_premarital_parenthood` | Premarital parents vs non-parents: dissolution over ~4.5 years | proportion dissolved | 0.191 |  | abstract | yes |  |

### Longitudinal predictors of marital quality and stability (review)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `KB1995_review_scope` | n/a | review scope |  |  | abstract | yes |  |

### Negative communication (critique of behavioral models)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `KB2020_review` | n/a | qualitative review conclusion |  |  | abstract | yes |  |

### Self-report predictors of relationship QUALITY (ML across 43 datasets)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Joel2020_ML_predictability` | Variance explained | R^2 (max) | 0.45 |  | abstract | yes |  |

### PREPARE premarital inventory (individual + couple positive-agreement scores)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FowersOlson1986_PREPARE` | Happily married vs separated/divorced at 3 years | accuracy (in-sample discriminant, % correctly classified) | 0.91 |  | primary | yes |  |

### PREPARE premarital couple type (Vitalized, Harmonious, Traditional, Conflicted)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Fowers1996_PREPARE_types` | Conflicted vs other types | direction only |  |  | abstract | yes |  |

### Premarital cohabitation with spouse

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_cohab_W_zero` | Cohabited vs did not (women) | HR (Cox) | 1.03 | 0.804–1.319 (derived) | primary | yes |  |
| `Manning2012_cohab_M_zero` | Cohabited vs did not (men) | HR (Cox) | 1.22 | 0.83–1.794 (derived) | primary | yes |  |
| `Rosenfeld2019_cohab_M2` | Cohabited vs not (pooled over marriage durations; discrete-time logit) | OR (per marriage-year, discrete-time) | 1.31 |  | primary | yes |  |

### Premarital cohabitation x engagement

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_cohab_engaged_W` | Cohabited AND engaged vs no cohabitation (women, full model) | HR (Cox) | 0.57 | 0.365–0.891 (derived) | primary | yes |  |
| `Manning2012_cohab_notengaged_W` | Cohabited NOT engaged vs no cohabitation (women, full model) | HR (Cox) | 1.07 | 0.702–1.631 (derived) | primary | yes |  |

### Premarital birth

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_premaritalbirth_W` | Had a birth before first marriage vs not (women, full) | HR (Cox) | 1.45 | 0.967–2.175 (derived) | primary | yes |  |
| `Manning2012_premaritalbirth_M` | Had a birth before first marriage vs not (men, full) | HR (Cox) | 1.84 | 1.202–2.818 (derived) | primary | yes |  |
| `Martin2006_premaritalbirth` | Premarital first birth vs none | HR (Cox) | 1.41 | 1.304–1.525 (derived) | primary | yes |  |
| `Killewald2016_premaritalbirth_post1975` | Premarital birth (married 1975+) | OR (discrete-time logit, per couple-year) | 1.244 | 0.989–1.565 (derived) | primary | yes |  |

### Age at first marriage

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_agemarr_W` | Per additional year of age at marriage (women, full) | HR (Cox) | 0.94 | 0.902–0.98 (derived) | primary | yes |  |

### Own education

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_college_W` | College degree vs high school (women, full) | HR (Cox) | 0.33 | 0.218–0.5 (derived) | primary | yes |  |
| `Manning2012_college_M` | College degree vs high school (men, full) | HR (Cox) | 0.59 | 0.335–1.038 (derived) | primary | yes |  |
| `Manning2012_lessHS_M` | Less than high school vs high school (men, full) | HR (Cox) | 0.51 | 0.334–0.778 (derived) | primary | yes |  |

### Parental divorce / family of origin

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_intactfamily_W` | Two biological/adoptive parents at 14 vs not (women, full) | HR (Cox) | 0.74 | 0.553–0.99 (derived) | primary | yes | used |
| `Manning2012_intactfamily_M` | Two biological/adoptive parents at 14 vs not (men, full) | HR (Cox) | 0.69 | 0.477–0.998 (derived) | primary | yes | used |

### Number of premarital (noncohabiting) sex partners

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Manning2012_sexpartners_W` | Per additional partner (women, full) | HR (Cox) | 1.03 | 1.011–1.05 (derived) | primary | yes |  |

### Premarital cohabitation x first year of marriage

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Rosenfeld2019_cohab_firstyear` | Interaction: cohabited x calendar year of marriage | log-OR interaction | -0.39 | -0.566–-0.214 (derived) | primary | yes |  |

### Number of prior (nonmarital) cohabiting partners other than spouse

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Rosenfeld2019_other_cohabs` | 1 other cohabitation / 2+ other cohabitations vs none | OR (per marriage-year) | 3.25 |  | primary | yes |  |

### Age at coresidence (vs age at marriage) for cohabitors

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Kuperberg2014_coresidence_age` | Cohabitors vs direct marriers, standardised by age at coresidence | direction only |  |  | abstract | yes |  |

### Age at first marriage (wife)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Martin2006_agemarr_le18` | 18 or younger vs 22-24 | HR (Cox) | 2.42 | 2.194–2.669 (derived) | primary | yes |  |
| `Martin2006_agemarr_19_21` | 19 to 21 vs 22-24 | HR (Cox) | 1.59 | 1.47–1.72 (derived) | primary | yes |  |
| `Martin2006_agemarr_25_27` | 25 to 27 vs 22-24 | HR (Cox) | 0.8 | 0.711–0.9 (derived) | primary | yes |  |
| `Martin2006_agemarr_28_30` | 28 to 30 vs 22-24 | HR (Cox) | 0.79 | 0.689–0.906 (derived) | primary | yes |  |
| `Martin2006_agemarr_31plus` | 31 or older vs 22-24 | HR (Cox) | 0.61 | 0.532–0.7 (derived) | primary | yes |  |

### Wife education (4-year degree vs none) - trend

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Martin2006_educ_trend` | 10-year dissolution, 1990-94 cohort: 4-year college 16.5% vs no HS diploma 46.3% | probability (life-table, 10-year dissolution) | 0.165 |  | primary | yes |  |

### Age at first marriage (woman)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `RaleyBumpass2003_age_13_17` | Age 13-17 at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.68 |  | primary | yes |  |
| `RaleyBumpass2003_age_18_19` | Age 18,19 at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.61 |  | primary | yes |  |
| `RaleyBumpass2003_age_20_21` | Age 20,21 at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.51 |  | primary | yes |  |
| `RaleyBumpass2003_age_22_23` | Age 22,23 at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.4 |  | primary | yes |  |
| `RaleyBumpass2003_age_24_26` | Age 24-26 at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.44 |  | primary | yes |  |
| `RaleyBumpass2003_age_27_29` | Age 27-29 at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.39 |  | primary | yes |  |
| `RaleyBumpass2003_age_30plus` | Age 30+ at marriage | probability (period life table, % of first marriages dissolved by 30 years) | 0.31 |  | primary | yes |  |

### Base rate / education / race (lifetime dissolution)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `RaleyBumpass2003_total` | Total | probability (% dissolved by 30 years) | 0.5 |  | primary | yes |  |
| `RaleyBumpass2003_black` | Black | probability (% dissolved by 30 years) | 0.7 |  | primary | yes |  |
| `RaleyBumpass2003_white` | White | probability (% dissolved by 30 years) | 0.47 |  | primary | yes |  |
| `RaleyBumpass2003_notHS` | Not HS Grad | probability (% dissolved by 30 years) | 0.6 |  | primary | yes |  |
| `RaleyBumpass2003_HS` | High School Grad | probability (% dissolved by 30 years) | 0.53 |  | primary | yes |  |
| `RaleyBumpass2003_somecoll` | Some College | probability (% dissolved by 30 years) | 0.51 |  | primary | yes |  |
| `RaleyBumpass2003_college` | College Graduate | probability (% dissolved by 30 years) | 0.36 |  | primary | yes |  |

### Age at first marriage (nonlinear; late-marriage upturn)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Wolfinger2015_agemarr_U` | Per year of age at marriage: before ~32 vs after ~32 | odds change per year | 0.89 (derived) |  | primary | yes |  |

### Number of premarital sex partners (women)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Wolfinger2016_sexpartners` | 5-year divorce rate, women marrying in 2000s: 10+ partners vs 0 partners | probability (5-year life-table divorce) | 0.33 |  | primary | yes |  |

### Husband employment

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_husbandFT_post1975` | Husband employed full-time vs not (married 1975+) | OR (discrete-time logit, per couple-year) | 0.746 | 0.606–0.918 (derived) | primary | yes |  |
| `Killewald2016_husbandFT_pooled` | Husband employed full-time vs not (pooled) | OR (discrete-time logit, per couple-year) | 0.788 | 0.655–0.947 (derived) | primary | yes |  |

### Wife employment

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_wifeFT_post1975` | Wife employed full-time vs not (married 1975+) | OR (discrete-time logit, per couple-year) | 1.071 | 0.901–1.273 (derived) | primary | yes |  |

### Division of housework

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_housework_post1975` | Wife's proportion of housework (0-1) (married 1975+) | OR (discrete-time logit, per couple-year) | 1.051 | 0.666–1.659 (derived) | primary | yes |  |
| `Killewald2016_housework_pre1975` | Wife's proportion of housework (0-1) (married <=1974) | OR (discrete-time logit, per couple-year) | 0.327 | 0.132–0.81 (derived) | primary | yes |  |

### Household income / financial strain

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_income_post1975` | Economic well-being, per $1,000 (married 1975+) | OR (discrete-time logit, per couple-year) | 1.002 | 0.992–1.012 (derived) | primary | yes |  |

### Religiosity

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_notreligious_post1975` | At least one spouse not religious vs other (married 1975+) | OR (discrete-time logit, per couple-year) | 1.293 | 1.061–1.576 (derived) | primary | yes | used |

### Home ownership

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_homeown_post1975` | Owns home vs not (married 1975+) | OR (discrete-time logit, per couple-year) | 0.672 | 0.572–0.789 (derived) | primary | yes |  |

### Number of children

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_kids5plus_post1975` | Per child aged 5+ (married 1975+) | OR (discrete-time logit, per couple-year) | 1.164 | 1.049–1.291 (derived) | primary | yes |  |
| `Killewald2016_kidsunder5_post1975` | Per child under 5 (married 1975+) | OR (discrete-time logit, per couple-year) | 0.999 | 0.885–1.128 (derived) | primary | yes |  |

### Premarital cohabitation

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_cohab_post1975` | Cohabited before marriage (married 1975+) | OR (discrete-time logit, per couple-year) | 1.285 | 1.016–1.626 (derived) | primary | yes |  |

### Age at marriage

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_under21_post1975` | At least one spouse under 21 at marriage (married 1975+) | OR (discrete-time logit, per couple-year) | 1.345 | 1.114–1.623 (derived) | primary | yes |  |
| `Killewald2016_under25_post1975` | At least one spouse under 25 at marriage (married 1975+; additional to <21 term) | OR (discrete-time logit, per couple-year) | 1.279 | 1.041–1.571 (derived) | primary | yes |  |
| `FTM2015_marriageage` | Per year of marriage age (all persons) | HR (Cox, population-weighted) | 0.912 | 0.895–0.93 (derived) | primary | yes |  |

### Education (wife)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_wifecollege_post1975` | Wife college vs high school (married 1975+) | OR (discrete-time logit, per couple-year) | 0.708 | 0.519–0.965 (derived) | primary | yes |  |

### Education (husband)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_husbcollege_post1975` | Husband college vs high school (married 1975+) | OR (discrete-time logit, per couple-year) | 0.572 | 0.424–0.772 (derived) | primary | yes |  |

### Region

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_south_post1975` | South vs Northeast (married 1975+) | OR (discrete-time logit, per couple-year) | 1.321 | 1.036–1.684 (derived) | primary | yes |  |

### Nativity

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_foreignwife_post1975` | Wife foreign-born (married 1975+) | OR (discrete-time logit, per couple-year) | 0.495 | 0.304–0.806 (derived) | primary | yes |  |

### Spousal age gap

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_agegap` | Per year of age difference (all persons) | HR (Cox, population-weighted) | 1.022 | 1.005–1.04 (derived) | primary | yes |  |

### Interracial / race difference

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_racediff` | Respondent-spouse race difference (all persons) | HR (Cox, population-weighted) | 1.18 | 0.983–1.417 (derived) | primary | yes |  |

### Educational heterogamy

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_educdiff` | Respondent-spouse education difference (all persons) | HR (Cox, population-weighted) | 1.248 | 1.082–1.44 (derived) | primary | yes |  |

### Premarital relationship length

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_dated3plus` | Dated 3+ years before proposal vs <1 year (all persons) | HR (Cox, population-weighted) | 0.764 | 0.627–0.931 (derived) | primary | yes |  |
| `FTM2015_dated1to2` | Dated 1-2 years vs <1 year (all persons) | HR (Cox, population-weighted) | 0.915 | 0.781–1.072 (derived) | primary | yes |  |

### Engagement ring cost

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_ring2to4k_men` | $2,000-$4,000 vs $500-$2,000 (men) | HR (Cox, population-weighted) | 1.334 | 1.003–1.774 (derived) | primary | yes |  |

### Wedding cost

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_wedding_lt1k` | Wedding <$1,000 vs $5,000-$10,000 (all persons) | HR (Cox, population-weighted) | 0.642 | 0.491–0.84 (derived) | primary | yes |  |
| `FTM2015_wedding_20kplus` | Wedding $20,000+ vs $5,000-$10,000 (all persons) | HR (Cox, population-weighted) | 1.323 | 0.984–1.779 (derived) | primary | yes |  |

### Wedding attendance

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_attendance_101_200` | 101-200 guests vs couple only (all persons) | HR (Cox, population-weighted) | 0.422 | 0.302–0.59 (derived) | primary | yes |  |

### Religiosity (attendance)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_relig_regular` | Attends regularly vs never (all persons) | HR (Cox, population-weighted) | 0.625 | 0.5–0.781 (derived) | primary | yes |  |

### Household income

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_income125k` | $125,000+ vs $0-$24,999 (all persons) | HR (Cox, population-weighted) | 0.39 | 0.261–0.583 (derived) | primary | yes |  |

### Honeymoon

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_honeymoon` | Had a honeymoon vs not (all persons) | HR (Cox, population-weighted) | 0.87 | 0.745–1.016 (derived) | primary | yes |  |

### Partner looks important at proposal

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `FTM2015_looks` | Yes vs no (all persons) | HR (Cox, population-weighted) | 1.294 | 1.109–1.51 (derived) | primary | yes |  |

### Interracial marriage (race-gender combination)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `BK2008_BlackH_WhiteW` | Black husband / White wife vs White/White | HR (event history, divorce by year 10) | 2.08 | 1.886–2.294 (derived) | primary | yes |  |
| `BK2008_WhiteH_BlackW` | White husband / Black wife vs White/White | HR (event history, divorce by year 10) | 0.56 | 0.371–0.845 (derived) | primary | yes |  |
| `BK2008_AsianH_WhiteW` | Asian husband / White wife vs White/White | HR (event history, divorce by year 10) | 1.6 | 1.538–1.664 (derived) | primary | yes |  |
| `BK2008_WhiteH_AsianW` | White husband / Asian wife vs White/White | HR (event history, divorce by year 10) | 1.04 | 1–1.082 (derived) | primary | yes |  |

### Interracial marriage

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `ZhangVanHook2009` | Interracial vs endogamous | direction only |  |  | abstract | yes |  |

### Religious homogamy / affiliation

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `LehrerChiswick1993_mormon_none` | Homogamous Mormon vs both "no religion": 5-year dissolution probability | probability (5-year dissolution) | 0.13 |  | secondhand | yes |  |

### Religious attendance mismatch / theological mismatch

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Vaaler2009_attendance_mismatch` | Husband attends more than wife; wife more conservative than husband | direction only (higher risk) |  |  | abstract | yes |  |

### Parental divorce (intergenerational transmission)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `AmatoDeBoer2001_parentaldivorce` | Offspring of divorced vs continuously married parents | magnitude in words ("approximately doubled the odds") |  |  | abstract | yes |  |

### Parental divorce: genetic vs rearing transmission

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Salvatore2018_adoption` | Heritability of divorce across generations | heritability (h2) | 0.13 |  | abstract | yes |  |

### Personality (MPQ) and genetic risk of divorce

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Jockin1996_personality_heritability` | Share of divorce heritability via personality | proportion of heritability | 0.3 |  | abstract | yes |  |

### Neuroticism

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Roberts2007_neuroticism` | Higher neuroticism (continuous) | r (meta-analytic correlation with divorce) | 0.17 | 0.12–0.22 | primary | yes | used |

### Agreeableness

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Roberts2007_agreeableness` | Higher agreeableness (continuous) | r (meta-analytic correlation with divorce) | -0.18 | -0.27–-0.09 | primary | yes |  |

### Conscientiousness

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Roberts2007_conscientiousness` | Higher conscientiousness (continuous) | r (meta-analytic correlation with divorce) | -0.13 | -0.17–-0.09 | primary | yes |  |

### Socioeconomic status

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Roberts2007_SES` | Higher socioeconomic status (continuous) | r (meta-analytic correlation with divorce) | -0.05 | -0.08–-0.02 | primary | yes |  |

### Alcohol use (spousal concordance)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Torvik2013_heavy_men` | Heavy-drinking husband vs light drinker | HR | 1.39 |  | abstract | yes |  |
| `Torvik2013_heavy_women` | Heavy-drinking wife vs light drinker | HR | 1.41 |  | abstract | yes |  |
| `Torvik2013_only_husband` | Only husband heavy drinker (couple) | HR | 1.51 |  | abstract | yes |  |
| `Torvik2013_only_wife` | Only wife heavy drinker (couple) | HR | 3.07 |  | abstract | yes |  |
| `Torvik2013_both_heavy` | Both heavy drinkers vs both light | HR | 1.63 |  | abstract | yes |  |

### Premarital mental disorder

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Breslau2011_depression` | Major depression before marriage vs none | OR (discrete-time survival, individual-disorder model) | 1.6 | 1.5–1.8 | primary | yes |  |
| `Breslau2011_alcoholabuse` | Alcohol abuse (with/without dependence) before marriage vs none | OR (discrete-time survival, individual-disorder model) | 1.7 | 1.5–1.9 | primary | yes |  |
| `Breslau2011_GAD` | Generalized anxiety disorder before marriage vs none | OR (discrete-time survival, individual-disorder model) | 1.4 | 1.2–1.8 | primary | yes |  |
| `Breslau2011_PTSD` | PTSD before marriage vs none | OR (discrete-time survival, individual-disorder model) | 1.7 | 1.4–2.1 | primary | yes |  |
| `Breslau2011_drugabuse` | Drug abuse before marriage vs none | OR (discrete-time survival, individual-disorder model) | 1.8 | 1.4–2.2 | primary | yes |  |

### Infidelity (extramarital sex)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `PrevitiAmato2004_EMS` | EMS vs none | direction only (increases odds of divorce) |  |  | abstract | yes |  |

### Meeting venue (online vs offline)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Cacioppo2013_online` | Met online vs offline: % separated/divorced | direction only (abstract) |  |  | abstract | yes |  |

### Base rate: US probability of divorce (timing-adjusted)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `SchoenCanudasRomo2006_PMED` | Year 2000 period | probability (lifetime, period, timing-adjusted) |  | range 0.43–0.46 | abstract | yes |  |

### Base rate: refined divorce rate trend

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `KennedyRuggles2014_RDR` | ACS-corrected refined divorce rate 2008 vs 1980 | rate (divorces per 1,000 married women) | 22.1 |  | primary | yes |  |

### Base rate: divorce trend

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `StevensonWolfers2007` | Recent quarter century | direction only |  |  | abstract | yes |  |

### Base rate

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Killewald2016_baseline1960s` | Couples first married in the 1960s: divorced within 15 years | probability | 0.3 |  | secondhand | yes |  |

### Base rate (newlywed cohort)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Birditt2010_baseline16yr` | Divorced/separated by year 16 | probability | 0.46 |  | primary | yes |  |

### Premarital mental disorder (lifetime, before marriage)

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Breslau2011_depression_M2` | Major depression before marriage vs none (all disorders entered together) | OR (discrete-time survival, divorce) | 1.6 | 1.4–1.8 | primary | yes | used |
| `Breslau2011_alcoholabuse_M2` | Alcohol abuse (with or without dependence) before marriage vs none (all disorders entered together) | OR (discrete-time survival, divorce) | 1.6 | 1.4–1.9 | primary | yes | used |

### Premarital cohabitation with partners other than the eventual husband

| Record | Contrast | Measure | Estimate | Interval | Provenance | Verified | App |
|---|---|---|---|---|---|---|---|
| `Rosenfeld2019_other_cohab1_M4` | Wife had one nonmarital cohabiting partner before marriage vs none | OR (discrete-time logit, per marriage-year) | 3.034 (derived) | 2.861–3.218 (derived) | primary | yes | used |
| `Rosenfeld2019_other_cohab2plus_M4` | Wife had two or more nonmarital cohabitations before marriage vs none | OR (discrete-time logit, per marriage-year) | 4.306 (derived) | 3.981–4.657 (derived) | primary | yes | used |

