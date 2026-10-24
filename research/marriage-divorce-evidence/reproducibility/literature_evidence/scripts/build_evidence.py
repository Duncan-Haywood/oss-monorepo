#!/usr/bin/env python3
"""Build ../evidence.json from the first-pass records, the NCHS table parse and the
corrections found by mechanical verification (2026-10-20).

Inputs
  --manual   JSON written by scripts/manual_records.py (first-pass hand-extracted records)
  --nchs     JSON written by scripts/parse_nchs_tables.py (public-domain NCHS tables)
  --cache    directory of cached source texts (see ../SOURCES.json); used to set `verified`
  --dois     doi_check.json written by scripts/check_dois.py

Every correction below says what was wrong in the first pass (`fixes`). A record is
`verified` only when verify_quotes.py's checks pass against the cached source text AND its
DOI (if any) resolved at Crossref to the cited work. `usable_in_app` additionally needs
provenance "primary" (the full text was checked, not an abstract or a third party),
a `factor` the app adjusts for, and no recorded reason to withhold it.

    python3 scripts/build_evidence.py --manual m.json --nchs nchs.json --cache source_cache \
        --dois doi_check.json --out evidence.json
"""
import argparse, copy, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import verify_quotes as V  # noqa: E402

VERIFIED_ON = '2026-10-20'

# ----------------------------------------------------------------------------------------
# Source keys: which cached text each URL is checked against (details in SOURCES.json).
URL_SOURCES = [
    (r'PMC(\d+)', lambda m: 'pmc_PMC' + m.group(1)),
    (r'pubmed\.ncbi\.nlm\.nih\.gov/(\d+)', lambda m: 'pubmed_' + m.group(1)),
    (r'doi\.org/(.+)$', lambda m: 'doi_' + re.sub(r'[^A-Za-z0-9]+', '_', m.group(1))),
    (r'sr23_022', 'pdf_sr23_022'), (r'nhsr049', 'pdf_nhsr049'), (r'vol15/20/15-20', 'pdf_15-20'),
    (r'vol8/8/8-8', 'pdf_8-8'), (r'But-Will-It-Last', 'pdf_bk2008'), (r'PREPARE', 'pdf_fowers1986'),
    (r'wedding%20expenses', 'pdf_ftm'), (r'aug16asrfeature', 'pdf_killewald'),
    (r'Rebound', 'pdf_rebound'), (r'Rosenfeld_and_Roesler', 'pdf_rr2019'),
    (r'gottman\.com/about/research/faq', 'web_gottman_faq'),
    (r'wait-to-get-married', 'web_ifs_age'), (r'premarital-sex', 'web_ifs_ps'),
    (r'mormonr', 'web_mormonr'), (r'washington\.edu/news/1999', 'web_uw1999'),
    (r'chinadaily', 'web_chinadaily_404'), (r'proquest', 'doi_10_1111_j_1741_3737_2001_01038_x'),
]


def source_for(url):
    for pat, key in URL_SOURCES:
        m = re.search(pat, url)
        if m:
            return key(m) if callable(key) else key
    return None


def dm(method, **inputs):
    return {'method': method, 'inputs': inputs}


UW2000 = 'web_uw2000'
UW2000_56 = 'It predicted with 94 percent accuracy which of 56 couples married four or five years and with a small child would remain married three years later.'
UW2000_16 = 'Only 16 of the 95 couples (18 percent) in the study were divorced at the end of the study.'

# ----------------------------------------------------------------------------------------
# Corrections to first-pass records. Keys are record ids; values replace fields. `fixes`
# lists what was wrong (kept in the record). `factor` names the app adjustment it feeds.
C = {}


def fix(id_, **kw):
    C[id_] = kw


# --- Gottman programme -----------------------------------------------------------------
fix('Buehlman1992_OHI_accuracy',
    se_or_other='No CI, SE, sensitivity/specificity or PPV located. Base rate: the Gottman Institute FAQ says the Gottman, Katz & Hooven study "picked out all seven divorced couples out of 56" (7/56 = 12.5%), so always predicting "stays married" would score 49/56 = 87.5%. That this is the same 56-couple sample as Buehlman et al. (1992) is an inference from UW News describing the 1992 study as 56 couples with a small child.',
    n='52 couples (Gottman Institute blog) / 56 couples (UW News, 2000)', events='7 (Gottman Institute FAQ, for the Gottman, Katz & Hooven study)',
    base_rate={'divorced': 7, 'total': 56, 'majority_class_accuracy': round(49 / 56, 3), 'source': 'web_gottman_faq',
               'note': 'FAQ figure for the Gottman, Katz & Hooven study; same sample as Buehlman 1992 by inference (UW News: 56 couples with a small child)'},
    extra_quotes=[{'source': 'web_gottman_faq', 'quote': 'For the Gottman, Katz and Hooven study, where Gottman et. al. picked out all seven divorced couples out of 56', 'supports': 'base rate 7/56'},
                  {'source': UW2000, 'quote': UW2000_56, 'supports': 'n = 56 and the 94% figure as reported by UW News'},
                  {'source': 'web_gottman_ohi', 'quote': 'They interviewed 52 heterosexual married couples about the history of their relationships.', 'supports': 'n = 52 as reported by the Gottman Institute blog'}],
    fixes=['Base-rate quote ("all seven divorced couples out of 56") re-verified verbatim in the FAQ and stored as a checked extra quote; the sample-size conflict (52 vs 56) is now quoted from both sources.'])

for t in ('T2', 'T3'):
    fix(f'Carrere2000_OHI_accuracy_{t}',
        se_or_other=('No CI/sensitivity/specificity in abstract. ' if t == 'T2' else '') +
        'Base rate (UW News 2000): 16 of 95 couples divorced by the end of the study (Time 3), so always predicting "stays married" scores 79/95 = 83.2% at Time 3' +
        (' and at least that at Time 2 (fewer couples had divorced by then).' if t == 'T2' else '; the reported 81% is below that.'),
        base_rate={'divorced': 16, 'total': 95, 'majority_class_accuracy': round(79 / 95, 3), 'source': UW2000,
                   'note': 'divorces counted at the end of the study (Time 3)'},
        extra_quotes=[{'source': UW2000, 'quote': UW2000_16, 'supports': 'base rate 16/95'}],
        fixes=['Base-rate quote re-verified against UW News 2000 (re-fetched); majority-class accuracy now computed exactly (79/95 = 83.2%) instead of "~83%".'])

fix('GottmanLevenson2000_14yr_accuracy',
    se_or_other='No CI. Same sample: Gottman & Levenson (2002) abstract: 21 of 79 couples divorced over 14 years -> base rate 26.6%, majority-class accuracy 58/79 = 73.4%.',
    base_rate={'divorced': 21, 'total': 79, 'majority_class_accuracy': round(58 / 79, 3), 'source': 'pubmed_11924092'},
    extra_quotes=[{'source': 'pubmed_11924092', 'quote': 'The sample consists of the 21 couples (of 79 studied) who divorced over a 14-year period.', 'supports': 'base rate 21/79'}])

fix('GottmanLevenson2002_twofactor',
    quote='This article examines 14-year longitudinal data and attempts to create a post hoc model that uses Time-1 data to "predict" the length of time the marriage will last. The sample consists of the 21 couples (of 79 studied) who divorced over a 14-year period.',
    fixes=['Quote had stray backslash escapes; now verbatim.'])

fix('GottmanLevenson1999_rebound_conflict',
    quote='For the conflict discussion, four SPAFF codes were entered: husband interest and contempt/disgust, and wife interest and sadness, with canonical correlation 0.43, and χ2 (4) = 13.23, p = .0102. The percent correct prediction in the 4 years of stability and divorce was 82.6%.',
    se_or_other='canonical r = 0.43, χ2(4) = 13.23, p = .0102. Codes entered only if univariate F significant (data-driven selection), in-sample. Number of divorces among the 73 followed couples not extracted.',
    fixes=['Quote rewrote "χ2" as "chi2"; now verbatim.'])
fix('GottmanLevenson1999_rebound_positive',
    quote='For the subsequent positive rebound conversation, four SPAFF codes were entered, husband anger, husband contempt/disgust, wife affection, and wife anger, with canonical correlation 0.59, with χ2 (4) = 27.56, p < .00001. The percent correct prediction in the 4 years of stability and divorce was 92.7%.',
    fixes=['Quote rewrote "χ2" as "chi2"; now verbatim.'])

fix('GottmanCoan1998_newlywed',
    se_or_other='Primary paper not retrieved. The Gottman Institute FAQ urn example describes 130 couples who stayed married and 17 who divorced (147 in all): base rate 17/147 = 11.6%, so always predicting "stays married" scores 130/147 = 88.4%, close to the 90% accuracy the FAQ uses in its example. The FAQ\'s counts were not checked against the 1998 paper.',
    base_rate={'divorced': 17, 'total': 147, 'majority_class_accuracy': round(130 / 147, 3), 'source': 'web_gottman_faq',
               'note': 'counts as given in the Gottman Institute FAQ urn example, not checked against the paper'},
    fixes=['Base-rate arithmetic re-verified: 130/(130+17) = 0.884.'])

fix('CarrereGottman1999_startup',
    quote='videotaped problem discussions of 124 couples who had been married for less than nine months ... At the end of the study, 17 of the couples had divorced.',
    extra_quotes=[{'source': 'doi_10_1111_j_1545_5300_1999_00293_x', 'quote': 'The marital conflict discussion of 124 newlywed couples was coded using the Specific Affect Coding System',
                   'supports': 'n = 124 (journal abstract)'}],
    fixes=['The press release prints the first author\'s name with a broken character ("Carr?"); quote now starts after it, verbatim.'])

fix('HeymanSlep2001_crossval', provenance='abstract', estimate=None, measure='qualitative (abstract)',
    source='doi_10_1111_j_1741_3737_2001_00473_x',
    quote='We analyze archival data to demonstrate that accuracy and predictive value drops precipitously during crossvalidation. We conclude that results of studies without crossvalidation analyses should be interpreted with extreme caution, no matter how impressive the initial results appear to be.',
    se_or_other='UNVERIFIED and not used as a number: a search summary attributed derivation-sample PPV 0.65, holdout PPV 0.29 and "PVpos: 20.99%" at 16% prevalence to this paper. The full text could not be retrieved (publisher and PMC PDF blocked), so these figures are not reproduced as data.',
    fixes=['Removed estimate 0.29 (PPV): it came from a search summary, not the paper. Record now carries only the verified abstract text.'])

fix('Rogge1999_aggression', fixes=[])

# --- Birditt et al. 2010 (PMC3777640, Table 3) ----------------------------------------
BIRDITT_TBL = 'Table 3 (Cox regression, Year 1 conflict behaviours; n = 207): columns Model 1 Block 1, Model 1 Block 2, Model 2, Model 3, Model 4'
fix('Birditt2010_destructive_husband',
    quote='Cox Regression Models Examining Divorce as a Function of Conflict Behaviors in Year 1 (n = 207) ... Destructive | | | | | ... Husband | | 4.28** | 6.37** | | ... Hus. Destructive X Years to divorce | | .14** | .13** | |',
    locator=BIRDITT_TBL + '; value = Model 1 Block 2',
    se_or_other='p < .01; no CI or SE printed. Per 1-point higher husband score on a 1-4 scale (mean of: yelled and shouted, insulted or called names, brought up things from long ago, had to have the last word). The same model carries a proportional-hazards correction "Hus. Destructive X Years to divorce" HR .14, i.e. the husband effect is time-varying and 4.28 is not a constant hazard ratio.',
    usable_withheld='Non-proportional: the paper adds a husband-destructive x time interaction (HR .14 per year) whose time scale/centring is not reported, so a constant HR of 4.28 would misstate it. Not applied.',
    factor='destructive_conflict_husband',
    fixes=['Quote reformatted to the table row text; documented the time-interaction term that the first pass omitted; withheld from the app.'])
fix('Birditt2010_destructive_wife',
    quote='Destructive | | | | | ... Husband | | 4.28** | 6.37** | | ... Wife | | 1.51* | 2.02 | |',
    locator=BIRDITT_TBL + '; value = Model 1 Block 2 (all four behaviour types for both spouses plus race, couple education, income, income ratio, premarital children, months cohabited, age at marriage, parents\' family structure)',
    se_or_other='p < .05; no CI or SE printed. Per 1-point higher wife score on a 1-4 scale (same four items). Year 1 wife means printed in Table 2: 2.0 (White) and 2.2 (Black), SD .8. No time interaction reported for wives.',
    factor='destructive_conflict_wife', unit='per 1 point on the 1-4 destructive-behaviour scale',
    center={'value': 2.1, 'note': 'average of the printed Year 1 wife means (2.0 White, 2.2 Black; sample 47% White / 53% Black)'},
    extra_quotes=[{'source': 'pmc_PMC3777640', 'quote': 'Destructive | M | 1.8 | 2.0 | 2.0 | 2.2 | 1.9 | 2.0 | 2.0 | 2.2', 'supports': 'Year 1 means: White husband 1.8, White wife 2.0, Black husband 2.0, Black wife 2.2'}],
    fixes=['Quote reformatted to the table row text; added scale, centring and model contents.'])
fix('Birditt2010_race',
    quote='Race (Black American) | 2.81** | 1.60 | 1.60 | 2.22** | 2.58**', locator=BIRDITT_TBL + '; value = Model 1 Block 1 (covariates only)')

fix('Lavner2012_satisfied_divorce',
    quote='Fifteen percent of couples (n = 21) divorced over ten years ... However, observed negative affect, skills, and support, along with husbands\' self-reported verbal aggression, all distinguished couples who did and did not divorce.',
    estimate=None, measure='proportion divorced (21 of 136; base rate in subgroup)', derivation=None,
    extra_quotes=[{'source': 'pmc_PMC8310662', 'quote': 'We identified 136 couples reporting stably high levels of relationship satisfaction in the first 4 years of marriage.', 'supports': 'denominator 136'}],
    se_or_other='21/136 = 15.4% divorced over 10 years (text: "Fifteen percent"). Group differences reported as Cohen d (Table 3, not extracted). Satisfaction itself did NOT distinguish divorcers.',
    fixes=['Quote ended in a footnote marker and paraphrased the second sentence\'s punctuation; now verbatim. Estimate removed from the numeric field because the text prints it in words ("Fifteen percent"); 21/136 kept in notes.'])
fix('Lavner2010_lowsat_trajectories', ci_low=None, ci_high=None, range_low=0.4, range_high=0.6,
    quote='the two groups characterized by low initial satisfaction scores and/or rapid linear declines in satisfaction had high rates of divorce (ten-year divorce rates ranged between 40–60%) ... Rates of divorce varied between the three groups (ranging from 9% to 21%)',
    fixes=['A reported range (40-60%) was stored as a confidence interval; moved to range_low/range_high.'])
fix('Lavner2012_cold_feet',
    quote='Among wives, 8% of those who reported not having premarital doubts divorced by four years (n = 11 out of 141) compared to 19% of those who did report premarital doubts (n = 16 out of 84). Chi-square analyses indicated that these rates differed significantly, χ2(1, N = 225) = 6.31, p < .05.',
    fixes=['Quote rewrote "χ2" as "chi2"; now verbatim.'])
fix('FowersOlson1986_PREPARE',
    quote='Furthermore, these combined scores can correctly discriminate successful marriages from those who end in divorce, in 91% of the cases. ... Both Individual and Couple (PCA)Scores 91 93 87',
    base_rate={'divorced': 31, 'total': 90, 'majority_class_accuracy': round(59 / 90, 3), 'source': 'pdf_fowers1986',
               'note': 'extreme-groups comparison: 59 married-satisfied vs 31 divorced/separated couples (married-dissatisfied and cancelled groups excluded)'},
    extra_quotes=[{'source': 'pdf_fowers1986', 'quote': 'satisfied (consisting of 59 married couples), (b) married dissatisfied (consisting of 22 married couples), cancelled (consisting of 52 couples who cancelled or delayed their marriages), and (d) divorced or separated (31 couples).', 'supports': 'group sizes'}],
    se_or_other='In-sample discriminant analysis between extreme groups (happily married 59 vs separated/divorced 31; majority-class 65.6%). Individual scores only: 81%; couple PCA only: 74%; both: 91% (happy 93%, divorced 87%).')

# --- Manning & Cohen 2012 (PMC3487709, Table 2) ----------------------------------------
MC_TBL = 'Table 2 (Cox models, first marriages since 1996, NSFG 2006-2008): columns Women zero-order HR, SE; Women full HR, SE; Men zero-order HR, SE; Men full HR, SE. SE is printed on the hazard-ratio scale.'
MC_FULL = 'full model: cohabitation/engagement status, race/ethnicity, noncohabiting sex partners (women), premarital birth, age at marriage, education, mother\'s education, childhood family structure'
for id_, col, hr, se, q in [
        ('Manning2012_cohab_W_zero', 'Women zero-order', 1.03, 0.13, 'Cohabitation with spouse (reference [ref.]: No) | | | | | | | | ... Yes | 1.03 | 0.13 | | | 1.22 | 0.24 | |'),
        ('Manning2012_cohab_M_zero', 'Men zero-order', 1.22, 0.24, 'Cohabitation with spouse (reference [ref.]: No) | | | | | | | | ... Yes | 1.03 | 0.13 | | | 1.22 | 0.24 | |'),
        ('Manning2012_cohab_engaged_W', 'Women full', 0.57, 0.13, 'Cohabitation and engaged | 0.75† | 0.13 | 0.57* | 0.13 | 1.22 | 0.30 | 0.99 | .19'),
        ('Manning2012_cohab_notengaged_W', 'Women full', 1.07, 0.23, 'Cohabitation and not engaged | 1.40* | 0.23 | 1.07 | 0.23 | 1.22 | 0.27 | 0.98 | 0.23'),
        ('Manning2012_premaritalbirth_W', 'Women full', 1.45, 0.30, None), ('Manning2012_premaritalbirth_M', 'Men full', 1.84, 0.40, None),
        ('Manning2012_agemarr_W', 'Women full', 0.94, 0.02, None), ('Manning2012_college_W', 'Women full', 0.33, 0.07, None),
        ('Manning2012_college_M', 'Men full', 0.59, 0.17, None), ('Manning2012_lessHS_M', 'Men full', 0.51, 0.11, None),
        ('Manning2012_intactfamily_W', 'Women full', 0.74, 0.11, None), ('Manning2012_intactfamily_M', 'Men full', 0.69, 0.13, None),
        ('Manning2012_sexpartners_W', 'Women full', 1.03, 0.01, None)]:
    kw = dict(locator=f'{MC_TBL} Value = {col}' + (f' ({MC_FULL})' if 'full' in col else ''),
              derivation=dm('ratio_se_delta', ratio=hr, se=se),
              se_or_other=f'SE(HR) = {se}; 95% CI derived by the delta method, exp(ln HR +/- 1.96 x SE/HR). Not reported in the paper.',
              fixes=['CI derivation now recorded explicitly (was only described in prose).'])
    if q:
        kw['quote'] = q
    C[id_] = kw
C['Manning2012_intactfamily_W'].update(factor='parental_divorce_wife', transform='reciprocal',
                                         unit='lived with two biological/adoptive parents until 18 (reference: not); the app uses 1/HR for "parents divorced or otherwise not two-parent"')
C['Manning2012_intactfamily_M'].update(factor='parental_divorce_husband', transform='reciprocal',
                                         unit='lived with two biological/adoptive parents until 18 (reference: not); the app uses 1/HR for "parents divorced or otherwise not two-parent"')

# --- Rosenfeld & Roesler 2019 ------------------------------------------------------------
fix('Rosenfeld2019_cohab_M2',
    quote='premarital cohabitation has been ... associated with higher odds of marital dissolution, 1.37 times higher than couples who never cohabited (Model 1, without controls), or 1.31 times higher with controls (Model 2).',
    locator='Text discussing Table 1', fixes=['Quote ran across a page footer ("page 14"); now split at the break with an ellipsis.'])
fix('Rosenfeld2019_cohab_firstyear',
    quote='The coefficient for the interaction between premarital cohabitation and the year of marriage in Model 3 was a highly significant -0.39, more than offsetting the log odds ratio of 0.32 for premarital cohabitation in general. ... Premarital Cohab × -0.39*** -0.37*** -0.40*** Calendar Year of Marriage (0.090) (0.092) (0.090)',
    locator='Text and Table 2, Model 3 (log-odds coefficient, SE in parentheses)', derivation=dm('coef_se_normal', b=-0.39, se=0.090),
    fixes=['CI (-0.566, -0.214) is on the log-odds scale and derived from the printed SE 0.090; derivation now recorded and the SE quoted.'])
fix('Rosenfeld2019_other_cohabs',
    quote='According to Model 2, the odds of marital dissolution in any given year of marriage were e0.18=1.19 times higher for women who cohabited with their husband before marriage. The odds of marital dissolution were e1.18=3.25 times higher for women who had (before marriage) one nonmarital cohabiting partner, and e1.54=4.66 times higher for women who had two or more nonmarital cohabitations before ... marrying their first husband.',
    locator='Text discussing Table 3, Model 2', derivation=None,
    se_or_other='Model 2 also includes a nonmarital-cohabitation x marriage-cohort interaction, so 3.25 applies at the reference cohort. The app uses Model 4 (records Rosenfeld2019_other_cohab1_M4 / _2plus_M4), which has no cohort interaction.',
    fixes=['Quote ran across a page footer ("page 23"); now split. Estimate 3.25 is printed in the text (e^1.18 = 3.254).'])

fix('Kuperberg2014_coresidence_age',
    quote='age at coresidence explained a substantial portion of the higher marital dissolution risk of premarital cohabitors. In comparisons standardized by age at coresidence, the difference in risk of marital dissolution between premarital cohabitors and those who married without prior cohabitation ("direct marriers") was much smaller than in comparisons standardized by age at marriage, and in some models this difference was not significant.',
    fixes=['Quote had stray backslash escapes; now verbatim.'])

# --- Martin 2006 (Table 3 Model B prints B, SE B and e^B) ------------------------------
MARTIN_TBL = 'Table 3, Model B (Cox; women entering a first marriage 1975-1994, SIPP 1996-2001, N = 16,756; reference: 4-year college degree, age 22-24 at marriage, no premarital birth). Columns: B, SE B, e^B.'
for id_, lab, b, se, eb in [('Martin2006_agemarr_le18', '18 or younger', '.88**', 0.05, 2.42),
                            ('Martin2006_agemarr_19_21', '19 to 21', '.47**', 0.04, 1.59),
                            ('Martin2006_agemarr_25_27', '25 to 27', '-.22**', 0.06, 0.80),
                            ('Martin2006_agemarr_28_30', '28 to 30', '-.24**', 0.07, 0.79),
                            ('Martin2006_agemarr_31plus', '31 or older', '-.50**', 0.07, 0.61)]:
    d = dm('ratio_log_se', ratio=eb, se_log=se)
    est, lo, hi = V.derive(d)
    C[id_] = dict(quote=f'{lab} {b} {str(se).lstrip("0")} {eb:.2f}', locator=MARTIN_TBL, derivation=d,
                  estimate=round(est, 3), ci_low=round(lo, 3), ci_high=round(hi, 3),
                  se_or_other=f'B = {b.strip("*")}, SE B = {se}; estimate is the printed e^B; 95% CI derived as exp(ln e^B +/- 1.96 x SE B) (not reported).',
                  fixes=[f'First pass quoted e^B as {"2.41" if eb == 2.42 else "1.60" if eb == 1.59 else "printed"} and set the estimate to exp(rounded B); the table prints e^B = {eb:.2f}. Estimate and CI now use the printed e^B.'])
C['Martin2006_agemarr_25_27']['fixes'] = ['Estimate was exp(rounded B) = 0.803; the table prints e^B = 0.80. Estimate and CI now use the printed value.']
C['Martin2006_agemarr_28_30']['fixes'] = ['Estimate was exp(rounded B) = 0.787; the table prints e^B = 0.79. Now uses the printed value.']
C['Martin2006_agemarr_31plus']['fixes'] = ['Estimate was exp(rounded B) = 0.607; the table prints e^B = 0.61. Now uses the printed value.']
C['Martin2006_agemarr_le18']['fixes'] = ['Quote said e^B = 2.41; the PDF prints 2.42 (2.41 = exp(0.88), from the rounded B). Quote, estimate and CI now use the printed 2.42.']
C['Martin2006_agemarr_19_21']['fixes'] = ['Quote said e^B = 1.60; the PDF prints 1.59 (1.60 = exp(0.47), from the rounded B). Quote, estimate and CI now use the printed 1.59.']
d = dm('ratio_log_se', ratio=1.41, se_log=0.04)
est, lo, hi = V.derive(d)
fix('Martin2006_premaritalbirth', quote='Premarital 1 birth .35** .04 1.41', locator=MARTIN_TBL + ' Row printed as "Premarital 1st birth" with "st" superscript.',
    derivation=d, estimate=1.41, ci_low=round(lo, 3), ci_high=round(hi, 3),
    se_or_other='B = .35, SE B = .04; estimate is the printed e^B; CI derived.',
    fixes=['Estimate was exp(.35) = 1.419; the table prints e^B = 1.41. Quote now matches the PDF text (superscript "st" sits on a separate line).'])
fix('Martin2006_educ_trend',
    quote='All First Marriages 34.8 31.9 30.1 31.2 ... 4-Year College Degree 29.0 20.1 18.7 16.5',
    locator='Table 1 (cohort life table, % of first marriages dissolved within ten years; columns 1975-79, 1980-84, 1985-89, 1990-94)',
    derivation=dm('percent', percent=16.5), estimate=0.165,
    extra_quotes=[{'source': 'pdf_15-20', 'quote': 'No High School Diploma 38.3 42.2 41.5 46.3 + 8.0 High School Diploma 34.7 32.1 33.3 37.9 + 3.2 Some College 38.9 36.8 34.4 36.0 - 2.9', 'supports': 'other education rows'},
                  {'source': 'pdf_15-20', 'quote': 'Master’s or Professional Degree 25.1 20.9 17.6 14.4 - 10.7**', 'supports': 'graduate degree row'}],
    fixes=['Quote stitched cells from different rows with semicolons; replaced by the printed rows.'])

# --- Raley & Bumpass 2003 Table 1 ----------------------------------------------------------
for id_, lab, vals in [('RaleyBumpass2003_age_13_17', '13-17', '37 50 57 63 68'), ('RaleyBumpass2003_age_18_19', '18,19', '30 43 50 55 61'),
                       ('RaleyBumpass2003_age_20_21', '20,21', '22 32 39 44 51'), ('RaleyBumpass2003_age_22_23', '22,23', '15 23 29 33 40'),
                       ('RaleyBumpass2003_age_24_26', '24-26', '14 28 34 41 44'), ('RaleyBumpass2003_age_27_29', '27-29', '16 28 31 36 39'),
                       ('RaleyBumpass2003_age_30plus', '30+', '13 20 23 27 31')]:
    C[id_] = dict(quote=f'Duration 5 10 15 20 30 ... Age at Marriage ... {lab} {vals}',
                  locator='Table 1 (period estimates 1987-1989, 1990 June CPS; % of marriages dissolved by duration 5/10/15/20/30 years; value = 30 years)',
                  fixes=['Header text was paraphrased ("% Marriages Dissolved, Duration"); now verbatim fragments.'])
for id_ in ('RaleyBumpass2003_total', 'RaleyBumpass2003_black', 'RaleyBumpass2003_white', 'RaleyBumpass2003_notHS',
            'RaleyBumpass2003_HS', 'RaleyBumpass2003_somecoll', 'RaleyBumpass2003_college'):
    C[id_] = dict(locator='Table 1 (period estimates 1987-1989, 1990 June CPS; % dissolved at 5/10/15/20/30 years; value = 30 years)')

fix('Wolfinger2015_agemarr_U', derivation=dm('percent_change', percent_change=-11),
    se_or_other='-11% odds per year before ~32 (OR 0.89, derived from the printed percentage); +5% per year after. No CI published in the post; blog summary of the author\'s NSFG analysis.',
    fixes=['Estimate 0.89 is derived from "reduces the odds ... by 11 percent"; derivation now recorded.'])

# --- Killewald 2016 Table 3 (B, SE, printed OR) ----------------------------------------
KW_TBL = 'Table 3 (logistic regression of marital dissolution, PSID; columns 1. Married in 1974 or Earlier, 2. Married in 1975 or Later, 3. Pooled). Each cell prints B, (SE), OR.'
KW = [
    ('Killewald2016_husbandFT_post1975', 'Husband −.097 −.293** −.238* (.208) (.106) (.094) OR = .908 OR = .746 OR = .788', 2, .746, .106),
    ('Killewald2016_husbandFT_pooled', 'Husband −.097 −.293** −.238* (.208) (.106) (.094) OR = .908 OR = .746 OR = .788', 3, .788, .094),
    ('Killewald2016_wifeFT_post1975', 'Wife .267 .069 .166* (.153) (.088) (.080) OR = 1.306 OR = 1.071 OR = 1.181', 2, 1.071, .088),
    ('Killewald2016_housework_post1975', 'Wife’s proportion of housework* −1.117* .050 −.244 (.463) (.233) (.224) OR = .327 OR = 1.051 OR = .783', 2, 1.051, .233),
    ('Killewald2016_housework_pre1975', 'Wife’s proportion of housework* −1.117* .050 −.244 (.463) (.233) (.224) OR = .327 OR = 1.051 OR = .783', 1, .327, .463),
    ('Killewald2016_income_post1975', 'Economic well-being (thousands of $) .014 .002 .003 (.009) (.005) (.004) OR = 1.014 OR = 1.002 OR = 1.003', 2, 1.002, .005),
    ('Killewald2016_notreligious_post1975', 'At least one spouse is not religious** .812*** .257* .395*** (.176) (.101) (.091) OR = 2.252 OR = 1.293 OR = 1.485', 2, 1.293, .101),
    ('Killewald2016_homeown_post1975', 'Home ownership −.061 −.398*** −.328*** (.172) (.082) (.071) OR = .941 OR = .672 OR = .720', 2, .672, .082),
    ('Killewald2016_kids5plus_post1975', 'Age 5 and older .091 .152** .108* (.080) (.053) (.043) OR = 1.095 OR = 1.164 OR = 1.114', 2, 1.164, .053),
    ('Killewald2016_kidsunder5_post1975', 'Under age 5 .200 −.001 .004 (.123) (.062) (.054) OR = 1.222 OR = .999 OR = 1.004', 2, .999, .062),
    ('Killewald2016_cohab_post1975', 'Premarital cohabitation* 1.308** .251* .331** (.413) (.120) (.115) OR = 3.700 OR = 1.285 OR = 1.392', 2, 1.285, .120),
    ('Killewald2016_premaritalbirth_post1975', 'Premarital birth .490 .218 .417*** (.424) (.117) (.114) OR = 1.633 OR = 1.244 OR = 1.518', 2, 1.244, .117),
    ('Killewald2016_under21_post1975', 'Under age 21 .628*** .297** .434*** (.181) (.096) (.085) OR = 1.874 OR = 1.345 OR = 1.543', 2, 1.345, .096),
    ('Killewald2016_under25_post1975', 'Under age 25 .666 .246* .337*** (.462) (.105) (.100) OR = 1.947 OR = 1.279 OR = 1.400', 2, 1.279, .105),
    ('Killewald2016_wifecollege_post1975', 'College .091 −.345* −.216 (.280) (.158) (.143) OR = 1.096 OR = .708 OR = .806', 2, .708, .158),
    ('Killewald2016_husbcollege_post1975', 'College −.170 −.559*** −.374** (.218) (.153) (.121) OR = .843 OR = .572 OR = .688', 2, .572, .153),
    ('Killewald2016_south_post1975', 'South .531* .279* .324** (.228) (.124) (.111) OR = 1.701 OR = 1.321 OR = 1.382', 2, 1.321, .124),
    ('Killewald2016_foreignwife_post1975', 'Wife is foreign-born −.275 −.703** −.477* (.543) (.249) (.219) OR = .759 OR = .495 OR = .620', 2, .495, .249),
]
for id_, q, col, orv, se in KW:
    d = dm('ratio_log_se', ratio=orv, se_log=se)
    est, lo, hi = V.derive(d)
    C[id_] = dict(quote=q, locator=f'{KW_TBL} Value = column {col}', derivation=d, estimate=orv, ci_low=round(lo, 3), ci_high=round(hi, 3),
                  se_or_other=f'SE(B) = {se}; estimate is the printed OR; 95% CI derived as exp(ln OR +/- 1.96 x SE) (not reported).',
                  fixes=['Quote rebuilt in the order the PDF prints the cells (B row, SE row, OR row); CI derivation recorded.'])
C['Killewald2016_notreligious_post1975'].update(factor='nonreligious_spouse', unit='at least one spouse reports no religion (reference: other religious combinations except both Catholic)')
C['Killewald2016_under21_post1975']['fixes'].append('Estimate was 1.346 (exp of rounded B); printed OR is 1.345.')
C['Killewald2016_south_post1975']['fixes'].append('Estimate was 1.322 (exp of rounded B); printed OR is 1.321.')

# --- Francis-Tan & Mialon 2015 Table 2 (HR with SE on the HR scale) ---------------------
FTM_TBL = 'Table 2 (population-weighted Cox regressions; columns: Bivariate All Persons; Multivariate All Persons; Men Only; Women Only). "Hazard ratios are reported with standard errors in parentheses." Stars: * 10%, ** 5%, *** 1%.'
for id_, col, hr, se in [('FTM2015_agegap', 'Multivariate All', 1.022, 0.009), ('FTM2015_racediff', 'Multivariate All', 1.180, 0.110),
                         ('FTM2015_educdiff', 'Multivariate All', 1.248, 0.091), ('FTM2015_dated3plus', 'Multivariate All', 0.764, 0.077),
                         ('FTM2015_dated1to2', 'Multivariate All', 0.915, 0.074), ('FTM2015_ring2to4k_men', 'Men Only', 1.334, 0.194),
                         ('FTM2015_wedding_lt1k', 'Multivariate All', 0.642, 0.088), ('FTM2015_wedding_20kplus', 'Multivariate All', 1.323, 0.200),
                         ('FTM2015_attendance_101_200', 'Multivariate All', 0.422, 0.072), ('FTM2015_relig_regular', 'Multivariate All', 0.625, 0.071),
                         ('FTM2015_income125k', 'Multivariate All', 0.390, 0.080), ('FTM2015_honeymoon', 'Multivariate All', 0.870, 0.069),
                         ('FTM2015_marriageage', 'Multivariate All', 0.912, 0.009), ('FTM2015_looks', 'Multivariate All', 1.294, 0.102)]:
    d = dm('ratio_se_delta', ratio=hr, se=se)
    C[id_] = dict(locator=f'{FTM_TBL} Value = {col}', derivation=d,
                  se_or_other=f'SE(HR) = {se}; 95% CI derived by the delta method (not reported).',
                  fixes=['CI derivation recorded explicitly.'])

# --- Bratter & King 2008 Table 4 (B, SE B, e^B; Full model) ----------------------------
BK_TBL = 'Table 4 (event-history models of divorce by year 10, NSFG 2002, N = 35,139 person-years; columns Baseline B, SE B, e^B; Full B, SE B, e^B). Value = Full model.'
for id_, q, eb, se in [('BK2008_BlackH_WhiteW', 'Black/White .81*** .08 2.26 .73*** .05 2.08', 2.08, 0.05),
                       ('BK2008_WhiteH_BlackW', 'White/Black ... .27 0.67 ... .21 0.56', 0.56, 0.21),
                       ('BK2008_AsianH_WhiteW', 'Asian/White .35 .25 1.42 .47*** .02 1.60', 1.60, 0.02),
                       ('BK2008_WhiteH_AsianW', 'White/Asian .06 .04 1.06 ... .02 1.04', 1.04, 0.02)]:
    d = dm('ratio_log_se', ratio=eb, se_log=se)
    est, lo, hi = V.derive(d)
    C[id_] = dict(quote=q, locator=BK_TBL, derivation=d, estimate=eb, ci_low=round(lo, 3), ci_high=round(hi, 3),
                  se_or_other=f'SE B = {se}; CI derived as exp(ln e^B +/- 1.96 x SE B). Some SEs (.02, .05) look implausibly small for the cell sizes; treat CIs as optimistic.',
                  fixes=['CI derivation recorded (uses printed e^B and SE B).'])
C['BK2008_WhiteH_BlackW']['fixes'].append('First pass quoted the PDF\'s glyph-mangled B values ("2.46y", "2.58**" where the article prints negative coefficients); quote now uses only cells that extract cleanly.')
C['BK2008_WhiteH_AsianW']['fixes'].append('B for the full model extracts with a glyph artefact ("y"); quote skips it.')

fix('LehrerChiswick1993_mormon_none',
    quote='With fifth-year dissolution probabilities of 0.13 and 0.36 respectively, homogamous Mormon marriages are the most stable and those among two persons reporting "no religion" the least stable.',
    fixes=['Quote had stray backslash escapes; now verbatim (still a secondhand transcription on mormonr.org).'])
fix('AmatoDeBoer2001_parentaldivorce', provenance='abstract', source='doi_10_1111_j_1741_3737_2001_01038_x', estimate=None,
    measure='magnitude in words ("approximately doubled the odds")', url='https://doi.org/10.1111/j.1741-3737.2001.01038.x',
    caveats='Abstract verified against Crossref. Transmission strongest when parents had LOW discord before divorcing. No numeric OR/CI retrieved.',
    fixes=['First pass had this as a secondhand web-search sentence with estimate 2.0; the sentence is verified verbatim in the Crossref abstract, but "approximately doubled" is not a number, so the estimate field is now empty.'])

# --- Roberts et al. 2007 (publisher PDF; minus signs and "=" use special glyphs) --------
RO_Q = ('When so aggregated, the effect of Neuroticism on divorce was .17 (CIs = .12 and .22), the effect of Agreeableness was −.18 (CIs = −.27 and −.09), '
        'and the effect of Conscientiousness on divorce was −.13 (CIs = −.17 and −.09). ... the relation between SES and divorce was −.05 (CIs = −.08 and −.02)')
for id_ in ('Roberts2007_neuroticism', 'Roberts2007_agreeableness', 'Roberts2007_conscientiousness', 'Roberts2007_SES'):
    C[id_] = dict(quote=RO_Q, source='pdf_roberts2007', locator='Text, section on divorce (meta-analytic average of prospective studies; correlations)',
                  se_or_other='95% CI as printed. The PDF encodes the minus sign and "=" with private glyphs (extract as U+0001 and "5"); SOURCES.json records this glyph map.',
                  fixes=['Quote used "[-]" insertions; now verbatim with the printed minus signs (glyph map documented). Checked against the publisher PDF (PMC landing page kept as URL).'])
C['Roberts2007_neuroticism'].update(factor='neuroticism', unit='correlation with divorce; converted to a per-SD log-odds in app/literature.js with an explicit base-rate assumption')

for id_ in ('Torvik2013_heavy_men', 'Torvik2013_heavy_women', 'Torvik2013_only_husband', 'Torvik2013_only_wife', 'Torvik2013_both_heavy'):
    C[id_] = dict(quote='Heavy drinking among men (hazard ratio [HR] = 1.39) and women (HR = 1.41) increased the risk of future marital dissolution, even after adjusting for demography (reference group "light drinkers"). The HR for divorce was 1.51 when only the husband was a heavy drinker, while it was 3.07 when only the wife was a heavy drinker. ... Nevertheless, couples with 2 heavy drinkers (HR = 1.63) had higher risk of divorce than couples with 2 light drinkers.',
                  fixes=['Quote had stray backslash escapes and dropped "Nevertheless,"; now verbatim (abstract).'])

BR_TBL = 'Table 4 "Association between premarital mental disorders and the age of first divorce in all countries" (discrete-time survival ORs; columns Model 1 individual disorders, Model 2 all disorders, Model 3 all disorders with number of disorders; controls: sex, age, country, years since marriage, months dating prior to marriage, education).'
for id_, q in [('Breslau2011_depression', 'Major depression | 1.6 | 1.5, 1.8 | 1.6 | 1.4, 1.8 | 1.5 | 1.3, 1.7'),
               ('Breslau2011_alcoholabuse', 'Alcohol abuse w / without dependence | 1.7 | 1.5, 1.9 | 1.6 | 1.4, 1.9 | 1.4 | 1.2, 1.7'),
               ('Breslau2011_GAD', 'GAD with hierarchy | 1.4 | 1.2, 1.8 | 1.2 | 0.9, 1.5 | 1.1 | 0.9, 1.4'),
               ('Breslau2011_PTSD', 'PTSD | 1.7 | 1.4, 2.1 | 1.5 | 1.2, 1.8 | 1.4 | 1.2, 1.7'),
               ('Breslau2011_drugabuse', 'Drug abuse w / without dependence | 1.8 | 1.4, 2.2 | 1.6 | 1.2, 2.2 | 1.3 | 0.9, 1.7')]:
    C[id_] = dict(quote='Association between premarital mental disorders and the age of first divorce in all countries ... ' + q,
                  locator=BR_TBL + ' Value = Model 1.', fixes=['Row labels were paraphrased ("Alcohol abuse (with/without dependence)", "Generalized anxiety disorder", "Drug abuse"); now as printed, with the table title so the divorce table (not the marriage table) is identified.'] if id_ not in ('Breslau2011_depression', 'Breslau2011_PTSD') else ['Table title added to the quote so the divorce table (not the marriage table) is identified.'])

fix('Cacioppo2013_online', provenance='abstract', source='doi_10_1073_pnas_1222447110', url='https://doi.org/10.1073/pnas.1222447110', estimate=None,
    measure='direction only (abstract)',
    quote='marriages that began on-line, when compared with those that began through traditional off-line venues, were slightly less likely to result in a marital break-up (separation or divorce)',
    se_or_other='UNVERIFIED and not used as a number: 5.96% (online) vs 7.67% (offline) break-up were taken from a China Daily report whose page now returns 404.',
    fixes=['Removed estimate 0.0596: it came from a news report that can no longer be retrieved. Quote re-verified against the PNAS abstract (Crossref/OpenAlex/Europe PMC).'])
fix('SchoenCanudasRomo2006_PMED', estimate=None, ci_low=None, ci_high=None, range_low=0.43, range_high=0.46,
    fixes=['A reported range (0.43-0.46) was stored as a CI with its midpoint as the estimate; moved to range_low/range_high.'])

# --- Numbers in prose fields that no source supports (found by auditing every number in
#     n / events / se_or_other / caveats against the record's sources) ------------------
def more(id_, note, **kw):
    C.setdefault(id_, {}).update(kw)
    C[id_].setdefault('fixes', []).append(note)


more('GottmanLevenson1992_regulated', 'n restated as printed in the abstract ("Seventy-three").', n='73 couples (abstract: "Seventy-three married couples were studied in 1983 and 1987.")')
more('Gottman1993_typology', 'n restated as printed in the abstract ("Seventy-three").', n='73 couples (abstract: "Seventy-three couples were studied at 2 time points 4 years apart.")')
more('GottmanLevenson2000_14yr_accuracy', 'Removed "mean ~5 years married at intake": not in any retrieved source.', population='Married couples (Bloomington, Indiana / Berkeley laboratory sample)')
for t in ('T2', 'T3'):
    more(f'Carrere2000_OHI_accuracy_{t}', 'Caveat restated with the exact base-rate arithmetic.',
         caveats='In-sample. Majority-class ("nobody divorces") accuracy is 79/95 = 83.2% at Time 3 (16/95 divorced); ' +
         ('the 87.4% claim is about 4 points above that, and the Time 2 baseline is higher still.' if t == 'T2' else '81% is below it.'))
more('HeymanSlep2001_crossval', 'Removed unverified sample sizes (528; 264/264) and PPV figures from n/caveats.',
     n='not retrieved (full text unavailable)',
     se_or_other='A web-search summary attributed specific positive-predictive-value figures to this paper; the full text could not be retrieved (publisher and PMC PDF blocked), so they are not reproduced here.',
     caveats='Abstract verified (PMC1622921 record, Crossref, OpenAlex, Europe PMC). Its point stands without the numbers: accuracy and predictive value fall sharply on cross-validation, and low divorce prevalence makes positive predictions mostly wrong.')
more('Lavner2012_satisfied_divorce', 'n corrected: "from 464 newlywed spouses" belongs to a different paper; this sample is 136 of 172 couples.',
     n='136 couples (of 172 newlywed couples from Los Angeles County marriage licences)')
C['Lavner2012_satisfied_divorce']['extra_quotes'].append({'source': 'pmc_PMC8310662', 'quote': 'the 136 couples studied here come from a sample of 172 newlywed couples identified from marriage licenses filed in Los Angeles County', 'supports': '136 of 172'})
more('Lavner2010_lowsat_trajectories', 'Sample size now quoted from the 2010 abstract.', n='464 newlywed spouses (232 couples)',
     extra_quotes=[{'source': 'doi_10_1111_j_1741_3737_2010_00757_x', 'quote': 'Using 8 self-reports of satisfaction collected over 4 years from 464 newlywed spouses, we identified 5 trajectory groups', 'supports': 'n = 464 spouses'}])
more('Rosenfeld2019_cohab_firstyear', 'Removed an unverified citation (volume/pages of a 2021 comment).', caveats='Single data source (NSFG women). The first-year reversal is the authors\' interpretation of a calendar-year interaction.')
more('LehrerChiswick1993_mormon_none', 'Removed unverified commentary figures (~1 in 5, ~1 in 3, >40%).',
     se_or_other='Both no religion: 0.36 (same sentence).',
     extra_quotes=[{'source': 'pubmed_8405605', 'quote': 'interfaith unions have generally higher rates of dissolution than intrafaith unions', 'supports': 'direction, from the PubMed abstract'},
                   {'source': 'pubmed_8405605', 'quote': 'religious compatibility between spouses at the time of marriage has a large influence on marital stability, rivaling in magnitude that of age at marriage', 'supports': 'magnitude in words, from the PubMed abstract'}])
more('ZhangVanHook2009', 'Removed "6 panels": not in the abstract.', n='23,139 married couples (SIPP)')
more('AmatoDeBoer2001_parentaldivorce', 'Removed unverified sample size (~691).', n='not in the abstract')
more('Cacioppo2013_online', 'Removed unverified break-up percentages and exposure range from notes.',
     se_or_other='Break-up percentages reported in the press were taken from a China Daily page that now returns 404; they are not reproduced here.',
     caveats='Conflict of interest (survey commissioned by eHarmony); small absolute difference by the authors\' own description ("slightly less likely").')


# ----------------------------------------------------------------------------------------
# New records added during verification (each verified like the rest).
NEW = []
_BRES = dict(predictor='Premarital mental disorder (lifetime, before marriage)', measure='OR (discrete-time survival, divorce)',
             n='WHO World Mental Health surveys, 12 countries with divorce timing', population='Ever-married adults in WHO World Mental Health surveys',
             country='12 countries (mixed income levels)', years='surveys 2001-2007', design='retrospective survey, discrete-time survival (onset of disorder before marriage)',
             citation='Breslau, J., Miller, E., Jin, R., Sampson, N. A., Alonso, J., Andrade, L. H., ... Kessler, R. C. (2011). A multinational study of mental disorders, marriage, and divorce. Acta Psychiatrica Scandinavica, 124(6), 474-486.',
             doi='10.1111/j.1600-0447.2011.01712.x', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4011132/', provenance='primary', source='pmc_PMC4011132',
             caveats='Retrospective reports of disorder onset; cross-national pooled; individual-level (the respondent\'s own divorce). Model 2 adjusts all disorders simultaneously, which is the version used when several adjustments stack.')
NEW.append(dict(_BRES, id='Breslau2011_depression_M2', contrast='Major depression before marriage vs none (all disorders entered together)', estimate=1.6, ci_low=1.4, ci_high=1.8,
                adjusted_for='sex, age, country, years since marriage, months dating prior to marriage, education, all other disorders',
                quote='Association between premarital mental disorders and the age of first divorce in all countries ... Major depression | 1.6 | 1.5, 1.8 | 1.6 | 1.4, 1.8 | 1.5 | 1.3, 1.7',
                locator=BR_TBL + ' Value = Model 2.', se_or_other='95% CI as printed.', factor='depression', unit='person had major depression before the marriage',
                fixes=['Added: Model 2 (mutually adjusted) is the right version to stack with other adjustments.']))
NEW.append(dict(_BRES, id='Breslau2011_alcoholabuse_M2', contrast='Alcohol abuse (with or without dependence) before marriage vs none (all disorders entered together)', estimate=1.6, ci_low=1.4, ci_high=1.9,
                adjusted_for='sex, age, country, years since marriage, months dating prior to marriage, education, all other disorders',
                quote='Association between premarital mental disorders and the age of first divorce in all countries ... Alcohol abuse w / without dependence | 1.7 | 1.5, 1.9 | 1.6 | 1.4, 1.9 | 1.4 | 1.2, 1.7',
                locator=BR_TBL + ' Value = Model 2.', se_or_other='95% CI as printed.', factor='alcohol_problem', unit='person had alcohol abuse (with or without dependence) before the marriage',
                fixes=['Added: Model 2 (mutually adjusted) is the right version to stack with other adjustments.']))
_RR = dict(predictor='Premarital cohabitation with partners other than the eventual husband', measure='OR (discrete-time logit, per marriage-year)',
           n='24,888 couples; 216,455 couple-years; 8,488 dissolutions', population='U.S. women\'s first marriages, NSFG 1995-2015 waves', country='US', years='marriages to 2015',
           design='retrospective marital histories, discrete-time event history', adjusted_for='premarital cohabitation with husband (and its calendar-year interaction), marital duration, year of marriage, age at marriage, children, calendar decade, education, race, family of origin, mother\'s education, NSFG wave',
           citation='Rosenfeld, M. J., & Roesler, K. (2019). Cohabitation experience and cohabitation\'s association with marital dissolution. Journal of Marriage and Family, 81(1), 42-58.',
           doi='10.1111/jomf.12530', url='https://web.stanford.edu/~mrosenfe/Rosenfeld_and_Roesler_Cohabitation_Experience_NSFG.pdf', provenance='primary', source='pdf_rr2019',
           caveats='Women only; strongly selected (people with more prior cohabitations differ in many ways). Model 4 has no cohort interaction, so it is an average over marriage cohorts. Author\'s posted manuscript (2018), published 2019.',
           locator='Table 3, Model 4 (log-odds coefficients, SE in parentheses; columns M1-M4)', factor='prior_cohabitations_other_partners')
NEW.append(dict(_RR, id='Rosenfeld2019_other_cohab1_M4', contrast='Wife had one nonmarital cohabiting partner before marriage vs none',
                quote='Nonmarital cohab (1) 1.18*** 1.18*** 1.11*** (0.04) (0.04) (0.03)', derivation=dm('exp_coef', b=1.11, se=0.03),
                unit='wife cohabited with exactly one partner other than her husband before marrying',
                fixes=['Added: Model 4 estimate with its SE (the first pass used the Model 2 text figure, which carries a cohort interaction and no SE).']))
NEW.append(dict(_RR, id='Rosenfeld2019_other_cohab2plus_M4', contrast='Wife had two or more nonmarital cohabitations before marriage vs none',
                quote='1.54*** 1.54*** 1.46*** Nonmarital cohab (2 or more) (0.06) (0.06) (0.04)', derivation=dm('exp_coef', b=1.46, se=0.04),
                unit='wife cohabited with two or more partners other than her husband before marrying',
                fixes=['Added: Model 4 estimate with its SE.']))
for r in NEW:
    if r.get('derivation'):
        e, lo, hi = V.derive(r['derivation'])
        r.update(estimate=round(e, 3), ci_low=round(lo, 3), ci_high=round(hi, 3))
        r['se_or_other'] = f"log-odds B = {r['derivation']['inputs']['b']}, SE = {r['derivation']['inputs']['se']}; OR = exp(B), 95% CI exp(B +/- 1.96 SE) derived (not printed)."


# ----------------------------------------------------------------------------------------
def nchs_records(nchs):
    out = []
    slug = lambda s: re.sub(r'[^A-Za-z0-9]+', '_', s or 'x').strip('_')
    for t in nchs['tables']:
        bm = t['source'] == 'bramlett_mosher_2002'
        for row in t['rows']:
            if t['table'] == 'Table 41' and row['label'] != 'Total':
                continue
            sec = row['section']
            label = row['label'] + (f' (under "{row["parent_row"]}")' if row.get('parent_row') else '')
            printed = re.sub(r'\s*(?:\.\s?){2,}\s*', ' … ', row['printed'])
            if bm:
                c10 = row['p_disrupt']['10y']
                d = dm('p_se_normal', p=c10['p'], se=c10['se'])
                rid = f"BM2002_{t['table'].replace(' ', '')}_{slug(sec)}_{slug(row['label'])}"
                curve = row['p_disrupt']
                pop = 'U.S. women 15-44 in 1995' + (', second marriages' if t['table'] == 'Table 41' else ', first marriages')
                measure = ('probability of SECOND marriage disruption at 10 years' if t['table'] == 'Table 41'
                           else 'probability (life-table cumulative probability of first-marriage disruption = separation or divorce, at 10 years)')
                cit = nchs['sources']['bramlett_mosher_2002']['citation']
                url = nchs['sources']['bramlett_mosher_2002']['url']
                src = 'pdf_sr23_022'
                years = 'NSFG Cycle 5 (1995)'
                n = '10,847 women in the 1995 NSFG (row n not printed)'
                sex = 'Women'
            else:
                c10 = row['survival']['10y']
                d = dm('one_minus_survival', survival=c10['survival'], se=c10['se'])
                rid = f"Copen2012_{t['table'].replace(' ', '')}_{row['sex']}_{slug(sec)}_{slug(row['label'])}"
                curve = row['survival']
                pop = f"U.S. {row['sex'].lower()} 15-44, first marriages"
                measure = 'probability (1 - life-table survival of first marriage at 10 years; disruption = separation or divorce)'
                cit = nchs['sources']['copen_2012']['citation']
                url = nchs['sources']['copen_2012']['url']
                src = 'pdf_nhsr049'
                years = 'NSFG 2006-2010' + (' (trend row)' if row['label'] in ('1995', '2002') else '')
                n = f"weighted population {row['n_thousands']:,} thousand"
                sex = row['sex']
            e, lo, hi = V.derive(d)
            out.append(dict(
                id=rid, predictor=('Second (higher-order) marriage: base rate' if t['table'] == 'Table 41' else sec),
                contrast=f"{sex}: {label}", measure=measure, estimate=round(e, 3), ci_low=round(lo, 3), ci_high=round(hi, 3),
                derivation=d, se_or_other=f"10-year SE = {c10['se']}; 95% CI derived as +/- 1.96 SE (not printed). Full curve in curve / app/data/nchs_disruption_tables.json.",
                n=n, events=None, population=pop, country='US', years=years,
                design='retrospective marital histories, life table (unadjusted, bivariate)', adjusted_for='none',
                citation=cit, doi=None, url=url, source=src, locator=f"{t['table']}: {t['title']} Section: {sec}.",
                quote=printed, provenance='primary', source_table=t['table'], curve=curve,
                caveats='Disruption includes separation (not only divorce). Unadjusted; rows overlap and are confounded with each other. CI derived from SE.'))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--manual', required=True)
    ap.add_argument('--nchs', required=True)
    ap.add_argument('--cache', default=os.path.join(ROOT, 'source_cache'))
    ap.add_argument('--dois', default=os.path.join(ROOT, 'doi_check.json'))
    ap.add_argument('--sources', default=os.path.join(ROOT, 'SOURCES.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'evidence.json'))
    a = ap.parse_args(argv)

    manual = json.load(open(a.manual, encoding='utf-8'))
    nchs = json.load(open(a.nchs, encoding='utf-8'))
    dois = json.load(open(a.dois, encoding='utf-8')) if os.path.exists(a.dois) else {}
    smeta = json.load(open(a.sources, encoding='utf-8'))['sources']
    sources = {k: V.Source(k, v, a.cache) for k, v in smeta.items()}

    recs = []
    for r in manual:
        r = copy.deepcopy(r)
        r['source'] = source_for(r['url'])
        r['quote_first_pass'] = r['quote']
        # first-pass quotes wrap the verbatim text in double quotes and add labels around it
        segs = re.findall(r'"((?:[^"\\]|\\.)*)"', r['quote'])
        if segs:
            r['quote'] = ' ... '.join(s.replace('\\"', '"') for s in segs)
        r.update(C.get(r['id'], {}))
        recs.append(r)
    recs += [copy.deepcopy(x) for x in NEW]
    recs += nchs_records(nchs)
    missing = set(C) - {r['id'] for r in recs}
    assert not missing, missing

    for r in recs:
        res = V.check_record(r, sources)
        src = sources.get(r.get('source'))
        doi_ok = (r.get('doi') is None) or (dois.get(r['doi'], {}).get('status') == 'ok')
        failed = [k for k in ('quote', 'numbers', 'values') if res[k] == 'fail'] + (['extra_quotes'] if 'fail' in res['extra_quotes'] else [])
        skipped = src is None or not src.available
        r['verification'] = {
            'date': VERIFIED_ON, 'quote_in_source': res['quote'], 'numbers_in_source': res['numbers'],
            'values_traced': res['values'], 'extra_quotes': res['extra_quotes'],
            'doi': 'none' if r.get('doi') is None else dois.get(r['doi'], {}).get('status', 'unchecked'),
            'problems': res['problems']}
        r['verified'] = bool(not failed and not skipped and doi_ok)
        why = []
        if skipped:
            why.append('source text not retrievable (' + (smeta.get(r.get('source'), {}).get('note') or 'no cached text') + ')')
        if failed:
            why.append('failed: ' + ', '.join(failed))
        if not doi_ok:
            why.append('DOI did not match Crossref')
        r['verification']['reason'] = 'all checks passed' if r['verified'] else '; '.join(why)
        usable = r['verified'] and r.get('provenance') == 'primary' and bool(r.get('factor')) and not r.get('usable_withheld')
        r['usable_in_app'] = usable
        r.setdefault('fixes', [])
        r.setdefault('locator', None)
        r.setdefault('derivation', None)
    order = ['id', 'predictor', 'factor', 'contrast', 'measure', 'unit', 'estimate', 'ci_low', 'ci_high', 'range_low', 'range_high',
             'derivation', 'center', 'transform', 'se_or_other', 'n', 'events', 'base_rate', 'population', 'country', 'years', 'design',
             'adjusted_for', 'citation', 'doi', 'url', 'source', 'locator', 'quote', 'extra_quotes', 'provenance', 'verified',
             'verification', 'usable_in_app', 'usable_withheld', 'fixes', 'quote_first_pass', 'caveats', 'source_table', 'curve']
    recs = [{k: r[k] for k in order if k in r and r[k] is not None} | {k: v for k, v in r.items() if k not in order}
            for r in recs]
    doc = {'about': ('Published-evidence records on predictors of divorce, re-verified mechanically on ' + VERIFIED_ON +
                     ': every quote is checked verbatim against a cached copy of its source, every number in it is checked as printed, '
                     'every estimate is either printed in the quote or recomputed from an explicit derivation, and every DOI is checked at Crossref. '
                     'See EVIDENCE.md for the reading guide and SOURCES.md for the source list.'),
           'schema': {'verified': 'true only if all mechanical checks passed against the cached source and the DOI (if any) matched Crossref',
                      'provenance': 'primary = full text checked; abstract = only the published abstract checked; secondhand = a third party describing the work',
                      'usable_in_app': 'verified AND primary AND mapped to an app factor AND not withheld (see usable_withheld)',
                      'derivation': 'how a value not printed in the source was computed; verify_quotes.py recomputes it',
                      'quote': 'verbatim text; " ... " joins non-adjacent fragments; " | " separates table cells in PMC XML tables; " … " replaces dot leaders in NCHS tables',
                      'quote_first_pass': 'the quote as first extracted, kept so every correction is auditable'},
           'records': recs}
    json.dump(doc, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    nv = sum(r['verified'] for r in recs)
    print(f"{len(recs)} records; verified {nv}; not verified {len(recs) - nv}; usable_in_app {sum(r['usable_in_app'] for r in recs)}")
    for r in recs:
        if not r['verified']:
            print('  NOT VERIFIED', r['id'], '|', r['provenance'], '|', r['verification']['reason'], '|', '; '.join(r['verification']['problems'])[:300])
    return 0


if __name__ == '__main__':
    sys.exit(main())
