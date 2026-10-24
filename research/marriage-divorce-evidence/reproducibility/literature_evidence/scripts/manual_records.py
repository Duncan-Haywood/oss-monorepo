#!/usr/bin/env python3
"""First-pass hand extraction of published-evidence records (2026-10-20), kept unchanged so every
correction in build_evidence.py is auditable against it. Its quotes are NOT the verified ones:
evidence.json (built by build_evidence.py) is canonical.

    python3 scripts/manual_records.py first_pass.json
"""
import json, math, sys
R=[]
FIELDS=['id','predictor','contrast','measure','estimate','ci_low','ci_high','se_or_other','n','events','population','country','years','design','adjusted_for','citation','doi','url','quote','provenance','caveats']
def rec(**k):
    for f in FIELDS: k.setdefault(f,None)
    R.append(k)
def ci_logit(b,se):  # from log-scale coefficient
    return round(math.exp(b),3), round(math.exp(b-1.96*se),3), round(math.exp(b+1.96*se),3)
def ci_hr_se(hr,se):  # SE reported on ratio scale (delta method)
    s=se/hr; return round(math.exp(math.log(hr)-1.96*s),3), round(math.exp(math.log(hr)+1.96*s),3)

# ---------------- A. Gottman program & observational prediction ----------------
G_BUEHL='Buehlman, K. T., Gottman, J. M., & Katz, L. F. (1992). How a couple views their past predicts their future: Predicting divorce from an oral history interview. Journal of Family Psychology, 5(3-4), 295-318.'
rec(id='Buehlman1992_OHI_accuracy', predictor='Oral History Interview (perceived marital bond / "story of us")', contrast='Discriminant classification: divorced/separated vs stable at ~3-year follow-up',
    measure='accuracy (in-sample % correctly classified)', estimate=0.936, se_or_other='No CI, SE, sensitivity/specificity or PPV located. Base rate: Gottman Institute FAQ describes "all seven divorced couples out of 56" for the Gottman, Katz & Hooven sample (12.5%), so always predicting "stays married" would already score ~87.5%.',
    n='52 couples (Gottman Institute blog) / 56 couples (UW News 2000)', events='~7 divorces (per Gottman Institute FAQ)', population='Couples with a preschool child, Champaign-Urbana/Seattle lab samples', country='US', years='~1986-1990',
    design='prospective, in-sample discriminant classification (no cross-validation)', adjusted_for='none',
    citation=G_BUEHL, doi='10.1037/0893-3200.5.3-4.295', url='https://www.gottman.com/about/research/faq/',
    quote='"What Dr. Gottman is able to say is that a particular couple is behaving like the couples that were in the group that got divorced in his 1992 study (Buehlman, K., Gottman, J.M., & Katz, L.), a study in which Dr. Gottman predicted with 93.6% accuracy which couples would divorce."',
    provenance='secondhand', caveats='Primary paper not retrieved; figure from Gottman Institute FAQ (interested party). Sample-size reports conflict (52 vs 56). Tiny number of events; in-sample; accuracy barely above the majority-class base rate.')
rec(id='Carrere2000_OHI_accuracy_T2', predictor='Oral History Interview (perceived marital bond)', contrast='Discriminant classification: divorced vs intact within first ~5 years (Time 2)',
    measure='accuracy (in-sample % correctly classified)', estimate=0.874, se_or_other='No CI/sensitivity/specificity in abstract. UW News: "Only 16 of the 95 couples (18 percent) in the study were divorced at the end of the study" -> majority-class accuracy ~83%.',
    n='95 newlywed couples', events='16 divorced by end of study (UW News)', population='Seattle-area newlyweds', country='US', years='1989-1998',
    design='prospective, in-sample discriminant classification', adjusted_for='none',
    citation='Carrère, S., Buehlman, K. T., Gottman, J. M., Coan, J. A., & Ruckstuhl, L. (2000). Predicting marital stability and divorce in newlywed couples. Journal of Family Psychology, 14(1), 42-58.',
    doi='10.1037/0893-3200.14.1.42', url='https://pubmed.ncbi.nlm.nih.gov/10740681/',
    quote='"A discriminant function analysis of the newlywed oral history data predicted, with 87.4% accuracy, those couples whose marriages remained intact or broke up at the Time 2 data collection point."',
    provenance='abstract', caveats='In-sample; accuracy only ~4 points above always predicting "intact" (~83%).')
rec(id='Carrere2000_OHI_accuracy_T3', predictor='Oral History Interview (perceived marital bond)', contrast='Discriminant classification: divorced vs married at Time 3 (7-9 years)',
    measure='accuracy (in-sample % correctly classified)', estimate=0.81, se_or_other='Below the ~83% majority-class rate implied by 16/95 divorced.',
    n='95 newlywed couples', events='16', population='Seattle-area newlyweds', country='US', years='1989-1998', design='prospective, in-sample discriminant classification', adjusted_for='none',
    citation='Carrère, S., Buehlman, K. T., Gottman, J. M., Coan, J. A., & Ruckstuhl, L. (2000). Predicting marital stability and divorce in newlywed couples. Journal of Family Psychology, 14(1), 42-58.',
    doi='10.1037/0893-3200.14.1.42', url='https://pubmed.ncbi.nlm.nih.gov/10740681/',
    quote='"The oral history data predicted with 81% accuracy those couples who remained married or divorced at the Time 3 data collection point."', provenance='abstract',
    caveats='81% is lower than the ~83% a trivial "nobody divorces" rule would score given 16/95 divorced.')
rec(id='GottmanLevenson1992_regulated', predictor='Positive-to-negative ratio during conflict ("regulated" vs "nonregulated" couples; basis of the 5:1 rule)', contrast='Nonregulated vs regulated couples (balance-theory classification from Rapid Couples Interaction Scoring System point graphs)',
    measure='direction only (higher risk of separation/dissolution); no OR in abstract', estimate=None, se_or_other='No effect size in abstract. The specific "5:1" figure is widely attributed to this paper (e.g., Gottman Institute blog "The magic relationship ratio") but its exact numeric basis was not retrieved.',
    n='73 couples', events=None, population='Bloomington, Indiana community couples', country='US', years='1983-1987', design='prospective (4-year), group comparison', adjusted_for='none',
    citation='Gottman, J. M., & Levenson, R. W. (1992). Marital processes predictive of later dissolution: Behavior, physiology, and health. Journal of Personality and Social Psychology, 63(2), 221-233.',
    doi='10.1037/0022-3514.63.2.221', url='https://pubmed.ncbi.nlm.nih.gov/1403613/',
    quote='"Compared with regulated couples, nonregulated couples had ... (j) greater risk for marital dissolution (lower marital satisfaction and higher incidence of consideration of dissolution and of actual separation)."',
    provenance='abstract', caveats='Small sample; few separations; the popularised 5:1 threshold is not an estimated cut-point with validation. Treat as qualitative.')
rec(id='Gottman1993_typology', predictor='Couple conflict type (validating/volatile/avoiding vs hostile, hostile-detached)', contrast='Hostile & hostile/detached vs three stable types',
    measure='direction only', estimate=None, se_or_other='No numeric effect in abstract.', n='73 couples', population='Same sample as Gottman & Levenson 1992', country='US', years='1983-1987',
    design='prospective, typology derived post hoc', adjusted_for='none',
    citation='Gottman, J. M. (1993). The roles of conflict engagement, escalation, and avoidance in marital interaction: A longitudinal view of five types of couples. Journal of Consulting and Clinical Psychology, 61(1), 6-15.',
    doi='10.1037/0022-006X.61.1.6', url='https://pubmed.ncbi.nlm.nih.gov/8450108/',
    quote='"Over the 4 years, the groups of couples differed significantly in serious considerations of divorce and in the frequency of divorce."', provenance='abstract', caveats='Typology formed on the same data used to show divorce differences.')
rec(id='GottmanLevenson2000_14yr_accuracy', predictor='Affect in conflict & events-of-day conversations + marital satisfaction + thoughts of dissolution', contrast='Divorced vs married over 14 years (early <7y and late divorcers)',
    measure='accuracy (in-sample % correctly classified)', estimate=0.93, se_or_other='No CI. Same sample: Gottman & Levenson (2002) abstract states "21 couples (of 79 studied) who divorced over a 14-year period" -> base rate 26.6%, majority-class accuracy 73.4%.',
    n='79 couples (Bloomington/Berkeley lab sample)', events='21 divorced', population='Married couples, mean ~5 years married at intake', country='US', years='1983-1997',
    design='prospective, in-sample; model includes self-reported satisfaction and thoughts of dissolution', adjusted_for='n/a (classification)',
    citation='Gottman, J. M., & Levenson, R. W. (2000). The timing of divorce: Predicting when a couple will divorce over a 14-year period. Journal of Marriage and Family, 62(3), 737-745.',
    doi='10.1111/j.1741-3737.2000.00737.x', url='https://doi.org/10.1111/j.1741-3737.2000.00737.x',
    quote='"Negative affect during conflict predicted early divorcing, but it did not predict later divorcing. By contrast, the lack of positive affect in events-of-the-day and conflict discussions predicted later divorcing, but it did not predict early divorcing. Prediction was possible over the 14-year period of the study with a model that included marital satisfaction, thoughts of marital dissolution, and affective interaction in both conversations. The model predicted divorce with 93% accuracy."',
    provenance='abstract', caveats='In-sample; predictors include respondents\' own thoughts of dissolution (close to the outcome); 21 events; no holdout.')
rec(id='GottmanLevenson2002_twofactor', predictor='Unregulated volatile affect vs "neutral affective style"', contrast='Among divorcers only: time to divorce',
    measure='post hoc model (no accuracy given in abstract)', estimate=None, n='79 couples; 21 divorced', events='21',
    population='Same as 2000', country='US', years='1983-1997', design='explicitly post hoc, in-sample', adjusted_for='n/a',
    citation='Gottman, J. M., & Levenson, R. W. (2002). A two-factor model for predicting when a couple will divorce: Exploratory analyses using 14-year longitudinal data. Family Process, 41(1), 83-96.',
    doi='10.1111/j.1545-5300.2002.40102000083.x', url='https://pubmed.ncbi.nlm.nih.gov/11924092/',
    quote='"This article examines 14-year longitudinal data and attempts to create a post hoc model that uses Time-1 data to \\"predict\\" the length of time the marriage will last. The sample consists of the 21 couples (of 79 studied) who divorced over a 14-year period."',
    provenance='abstract', caveats='Authors themselves put "predict" in quotes; exploratory.')
rec(id='GottmanLevenson1999_rebound_conflict', predictor='SPAFF-coded affect in conflict conversation (husband interest, contempt/disgust; wife interest, sadness)', contrast='Divorced vs stable at 4 years',
    measure='accuracy (in-sample discriminant)', estimate=0.826, se_or_other='canonical r=0.43, chi2(4)=13.23, p=.0102. Codes entered only if univariate F significant (data-driven selection).',
    n='79 couples (73 followed up)', population='Same lab sample', country='US', years='1989-1993', design='prospective, in-sample discriminant with data-driven variable selection', adjusted_for='none',
    citation='Gottman, J. M., & Levenson, R. W. (1999). Rebound from marital conflict and divorce prediction. Family Process, 38(3), 287-292.',
    doi='10.1111/j.1545-5300.1999.00287.x', url='https://bpl.studentorg.berkeley.edu/docs/99-%20Rebound%20from%20marital%20conflict%20and%20divorce%20prediction.pdf',
    quote='"For the conflict discussion, four SPAFF codes were entered: husband interest and contempt/disgust, and wife interest and sadness, with canonical correlation 0.43, and chi2 (4) = 13.23, p = .0102. The percent correct prediction in the 4 years of stability and divorce was 82.6%."',
    provenance='primary', caveats='Classic overfitting setup flagged by Heyman & Slep (2001).')
rec(id='GottmanLevenson1999_rebound_positive', predictor='SPAFF-coded affect in post-conflict positive conversation', contrast='Divorced vs stable at 4 years',
    measure='accuracy (in-sample discriminant)', estimate=0.927, se_or_other='canonical r=0.59, chi2(4)=27.56. Wife affection was HIGHER among divorcers (authors call it "difficult to explain").',
    n='79 couples', population='Same lab sample', country='US', years='1989-1993', design='prospective, in-sample discriminant', adjusted_for='none',
    citation='Gottman, J. M., & Levenson, R. W. (1999). Rebound from marital conflict and divorce prediction. Family Process, 38(3), 287-292.',
    doi='10.1111/j.1545-5300.1999.00287.x', url='https://bpl.studentorg.berkeley.edu/docs/99-%20Rebound%20from%20marital%20conflict%20and%20divorce%20prediction.pdf',
    quote='"For the subsequent positive rebound conversation, four SPAFF codes were entered, husband anger, husband contempt/disgust, wife affection, and wife anger, with canonical correlation 0.59, with chi2 (4) = 27.56, p < .00001. The percent correct prediction in the 4 years of stability and divorce was 92.7%."',
    provenance='primary', caveats='In-sample; counter-intuitive sign for wife affection suggests noise-fitting.')
rec(id='GottmanCoan1998_newlywed', predictor='Newlywed conflict affect: wife harsh startup, husband rejecting influence, lack of de-escalation, low positive affect', contrast='Divorced vs stable over 6 years',
    measure='accuracy (in-sample); figure varies by source (83% Slate; ~90% Wikipedia; FAQ "90%")', estimate=None,
    se_or_other='Primary paper not retrieved; no reliable single figure. Gottman Institute FAQ urn example: "130 white balls (representing couples that stayed married) and 17 red balls (representing couples that ended up divorcing) for a total of 147" -> base rate 11.6%, majority-class accuracy 88.4%. UW News 1999 (Carrere & Gottman, same cohort): 124 couples taped, "17 of the couples had divorced".',
    n='130 newlywed couples (UW News)', events='17 divorced', population='Seattle newlyweds 1989', country='US', years='1989-1995',
    design='prospective, in-sample', adjusted_for='none',
    citation='Gottman, J. M., Coan, J., Carrère, S., & Swanson, C. (1998). Predicting marital happiness and stability from newlywed interactions. Journal of Marriage and the Family, 60(1), 5-22.',
    doi='10.2307/353438', url='https://www.gottman.com/about/research/faq/',
    quote='"Dr. Gottman\'s ability to predict divorce among newlyweds is more clearly understood by imagining an urn that contains 130 white balls (representing couples that stayed married) and 17 red balls (representing couples that ended up divorcing) for a total of 147 balls. The chances that Dr. Gottman could blindly pick balls out of the urn and guess which were red and which were white with 90% accuracy could only happen by chance 1 x 10-19 times."',
    provenance='secondhand', caveats='Accuracy claims cannot be checked against the primary text here. With an 11.6% base rate, 88% accuracy is achievable by predicting no one divorces. Kim, Capaldi & Crosby (2007) failed to replicate the key process predictors.')
rec(id='CarrereGottman1999_startup', predictor='Harsh startup (first 3 minutes of conflict discussion)', contrast='Later-divorced vs stable newlyweds',
    measure='direction only', estimate=None, se_or_other='UW press release; no effect size.', n='124 newlywed couples', events='17 divorced', population='Seattle newlyweds', country='US', years='~1989-1995',
    design='prospective group comparison', adjusted_for='none',
    citation='Carrère, S., & Gottman, J. M. (1999). Predicting divorce among newlyweds from the first three minutes of a marital conflict discussion. Family Process, 38(3), 293-301.',
    doi='10.1111/j.1545-5300.1999.00293.x', url='https://washington.edu/news/1999/09/27/first-three-minutes-of-discussion-about-on-going-area-of-marital-conflict-are-predictive-of-divorce-for-newlyweds',
    quote='"To capture the nuances of marital discord, Carrere and Gottman videotaped problem discussions of 124 couples who had been married for less than nine months. ... At the end of the study, 17 of the couples had divorced."',
    provenance='secondhand', caveats='Press release; primary paper not retrieved.')
rec(id='HeymanSlep2001_crossval', predictor='Methodological: in-sample vs cross-validated divorce prediction', contrast='Derivation half vs holdout half; then adjusted to population base rate',
    measure='positive predictive value', estimate=0.29, se_or_other='Secondhand summary: derivation-sample PPV 0.65 -> holdout PPV 0.29; at 16% prevalence PPV ~0.21 (search summary attributes "PVpos: 20.99%" to the paper\'s Table 3). Not verified against full text.',
    n='528 (1985 National Family Violence Survey), split 264/264 (secondhand)', population='US married adults', country='US', years='1985 survey',
    design='archival re-analysis, split-sample cross-validation', adjusted_for='n/a',
    citation='Heyman, R. E., & Smith Slep, A. M. (2001). The hazards of predicting divorce without crossvalidation. Journal of Marriage and Family, 63(2), 473-479.',
    doi='10.1111/j.1741-3737.2001.00473.x', url='https://doi.org/10.1111/j.1741-3737.2001.00473.x',
    quote='Abstract (verified): "We analyze archival data to demonstrate that accuracy and predictive value drops precipitously during crossvalidation. We conclude that results of studies without crossvalidation analyses should be interpreted with extreme caution, no matter how impressive the initial results appear to be."',
    provenance='secondhand', caveats='Abstract verified via OpenAlex/PMC1622921; the specific numbers (0.65 -> 0.29 PPV; ~21% at 16% prevalence) come from a web-search summary of the paper and should be confirmed in the full text before publication.')
rec(id='Kim2007_nonreplication', predictor='Gottman 1998 affective process predictors (husband rejecting influence, lack of de-escalation, wife negative startup)', contrast='Predicting relationship status ~2.5 years later',
    measure='replication test (null)', estimate=None, se_or_other='Key predictors not significant.', n='85 couples (at-risk community sample, Oregon Youth Study)', population='Young couples ~age 21, married or cohabiting', country='US', years='~1990s-2000s',
    design='prospective replication', adjusted_for='n/a',
    citation='Kim, H. K., Capaldi, D. M., & Crosby, L. (2007). Generalizability of Gottman and colleagues\' affective process models of couples\' relationship outcomes. Journal of Marriage and Family, 69(1), 55-72.',
    doi='10.1111/j.1741-3737.2006.00343.x', url='https://pubmed.ncbi.nlm.nih.gov/17372624/',
    quote='"The major findings of Gottman et al. failed to replicate. In particular, men\'s rejection of their partners\' influence, the lack of men\'s deescalation of partners\' negative affect, and women\'s negative start up were not predictive of relationship status."',
    provenance='abstract', caveats='Different population (at-risk, younger, includes cohabitors) and short follow-up; still the only direct independent replication attempt located.')
rec(id='Rogge1999_aggression', predictor='Physical aggression vs communication (newlyweds)', contrast='Separated/divorced vs married at 4 years',
    measure='accuracy (classification using communication + aggression)', estimate=0.68, se_or_other='No CI.', n='56 newlywed couples', population='Los Angeles newlyweds', country='US', years='~1990s',
    design='prospective, in-sample classification', adjusted_for='initial marital satisfaction',
    citation='Rogge, R. D., & Bradbury, T. N. (1999). Till violence does us part: The differing roles of communication and aggression in predicting adverse marital outcomes. Journal of Consulting and Clinical Psychology, 67(3), 340-351.',
    doi='10.1037/0022-006X.67.3.340', url='https://pubmed.ncbi.nlm.nih.gov/10369054/',
    quote='"Aggression discriminated between separated or divorced couples and those who remained married. In contrast, communication discriminated between couples who were maritally satisfied after 4 years and those who were married but dissatisfied. ... 68% of the marriages could be accurately classified into their outcome groups using communication and aggression variables."',
    provenance='abstract', caveats='Small n; 3-group classification (not directly comparable to binary accuracy).')
rec(id='Markman2010_premarital_comm', predictor='Premarital observed negative/positive communication; self-reported negative communication', contrast='Divorce within first 5 years',
    measure='significance only', estimate=None, se_or_other='Observed communication "nearly reached significance"; self-reported negative communication significant.', n='210 couples', population='Denver-area premarital couples (PREP research)', country='US', years='first 5 years of marriage',
    design='prospective', adjusted_for='not stated in abstract',
    citation='Markman, H. J., Rhoades, G. K., Stanley, S. M., Ragan, E. P., & Whitton, S. W. (2010). The premarital communication roots of marital distress and divorce: The first five years of marriage. Journal of Family Psychology, 24(3), 289-298.',
    doi='10.1037/a0019481', url='https://pubmed.ncbi.nlm.nih.gov/20545402/',
    quote='"The results showed that premarital observed negative and positive communication nearly reached significance as predictors of divorce, while self-reported negative communication was significantly associated with divorce."',
    provenance='abstract', caveats='Observed-communication -> divorce link is weak in this independent lab sample.')
rec(id='Birditt2010_destructive_husband', predictor='Self-reported destructive conflict behaviour, year 1 (husband)', contrast='Per unit of destructive-behaviour scale',
    measure='HR', estimate=4.28, se_or_other='p<.01; no CI/SE in table. Model 2 block 1. Violated proportional hazards; time interaction added.',
    n='373 couples (Cox model n=207)', events='46% divorced/separated by year 16', population='Early Years of Marriage Project, Wayne County MI, 47% White / 53% Black', country='US', years='1986-2002',
    design='prospective Cox regression', adjusted_for='couple income, education, income ratio, premarital children, months cohabited, couple age, each spouse raised with 2 parents, race',
    citation='Birditt, K. S., Brown, E., Orbuch, T. L., & McIlvane, J. M. (2010). Marital conflict behaviors and implications for divorce over 16 years. Journal of Marriage and Family, 72(5), 1188-1204.',
    doi='10.1111/j.1741-3737.2010.00758.x', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3777640/',
    quote='Table: "Cox Regression Models Examining Divorce as a Function of Conflict Behaviors in Year 1 (n = 207) ... Destructive | Husband | | 4.28** | 6.37** ... Wife | | 1.51* | 2.02"',
    provenance='primary', caveats='Scale-unit HR (not standardised); time-varying effect for husband; self-report.')
rec(id='Birditt2010_destructive_wife', predictor='Self-reported destructive conflict behaviour, year 1 (wife)', contrast='Per unit of scale', measure='HR', estimate=1.51, se_or_other='p<.05; no CI.',
    n='373 couples (Cox n=207)', events='46% by year 16', population='Early Years of Marriage Project', country='US', years='1986-2002', design='prospective Cox', adjusted_for='as Birditt2010_destructive_husband',
    citation='Birditt, K. S., Brown, E., Orbuch, T. L., & McIlvane, J. M. (2010). Marital conflict behaviors and implications for divorce over 16 years. Journal of Marriage and Family, 72(5), 1188-1204.',
    doi='10.1111/j.1741-3737.2010.00758.x', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3777640/', quote='Table: "Destructive ... Wife | | 1.51* | 2.02"', provenance='primary', caveats='Self-report; unit HR.')
rec(id='Birditt2010_race', predictor='Race: Black American couple', contrast='Black vs White couples (covariate-only model)', measure='HR', estimate=2.81, se_or_other='p<.01; attenuates to 1.60 (ns) once conflict behaviours added.',
    n='373 couples', population='Early Years of Marriage Project', country='US', years='1986-2002', design='prospective Cox', adjusted_for='SES and family covariates listed above',
    citation='Birditt, K. S., Brown, E., Orbuch, T. L., & McIlvane, J. M. (2010). Marital conflict behaviors and implications for divorce over 16 years. Journal of Marriage and Family, 72(5), 1188-1204.',
    doi='10.1111/j.1741-3737.2010.00758.x', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3777640/', quote='Table: "Race (Black American) | 2.81** | 1.60 | 1.60 | 2.22** | 2.58**"', provenance='primary', caveats='Regional sample.')
rec(id='Woodin2011_hostility_meta', predictor='Observed hostility during conflict (meta-analysis)', contrast='Association with relationship SATISFACTION (not divorce)',
    measure='r (described as medium effect)', estimate=None, se_or_other='Abstract gives only "medium effect"; exact pooled r not retrieved.', n='64 studies, 5,071 couples', population='Couples in observational studies', country='mixed', years='through ~2010',
    design='meta-analysis (mostly cross-sectional)', adjusted_for='n/a',
    citation='Woodin, E. M. (2011). A two-dimensional approach to relationship conflict: Meta-analytic findings. Journal of Family Psychology, 25(3), 325-335.',
    doi='10.1037/a0023791', url='https://pubmed.ncbi.nlm.nih.gov/21553964/',
    quote='"For both men and women, hostility was robustly associated with lower relationship satisfaction (medium effect), distress and withdrawal were somewhat associated (small effect), and intimacy and problem solving were both closely associated with relationship satisfaction (medium effect)."',
    provenance='abstract', caveats='Outcome is satisfaction, not dissolution; use only as an indirect pathway.')
rec(id='Lavner2012_satisfied_divorce', predictor='Negative communication among initially highly satisfied newlyweds', contrast='Divorced by year 10 vs married, among 136 stably satisfied couples',
    measure='proportion divorced (base rate in subgroup)', estimate=0.15, se_or_other='21/136 divorced; group differences reported as Cohen d (Table 3, not extracted). Satisfaction itself did NOT distinguish divorcers.',
    n='136 couples (from 464 newlywed spouses)', events='21', population='Los Angeles newlyweds', country='US', years='~1990s-2000s, 10-year follow-up',
    design='prospective', adjusted_for='n/a (group comparison)',
    citation='Lavner, J. A., & Bradbury, T. N. (2012). Why do even satisfied newlyweds eventually go on to divorce? Journal of Family Psychology, 26(1), 1-10.',
    doi='10.1037/a0025966', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8310662/',
    quote='"Fifteen percent of couples (n = 21) divorced over ten years, with three of these divorces occurring before the fourth year of marriage. ... observed negative affect, skills, and support, along with husbands\' self-reported verbal aggression, all distinguished couples who did and did not divorce."',
    provenance='primary', caveats='Small; multiple comparisons.')
rec(id='Lavner2010_lowsat_trajectories', predictor='Marital satisfaction trajectory (low intercept and/or steep decline over first 4 years)', contrast='Low/declining trajectory groups: 10-year divorce rate',
    measure='proportion divorced (range across groups)', estimate=None, ci_low=0.40, ci_high=0.60, se_or_other='Reported as a range "40-60%" (not a CI) vs 9-21% in the three satisfied groups.',
    n='464 newlywed spouses (232 couples)', population='Los Angeles newlyweds', country='US', years='10-year follow-up',
    design='prospective, latent-class growth', adjusted_for='none',
    citation='Lavner, J. A., & Bradbury, T. N. (2010). Patterns of change in marital satisfaction over the newlywed years. Journal of Marriage and Family, 72(5), 1171-1187.',
    doi='10.1111/j.1741-3737.2010.00757.x', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8310662/',
    quote='Lavner & Bradbury (2012) describing the 2010 paper: "the two groups characterized by low initial satisfaction scores and/or rapid linear declines in satisfaction had high rates of divorce (ten-year divorce rates ranged between 40-60%) ... Rates of divorce varied between the three groups (ranging from 9% to 21%)"',
    provenance='secondhand', caveats='Quoted from the authors\' own follow-up paper (2012), not the 2010 paper. ci_low/ci_high hold the reported range, not a confidence interval.')
rec(id='Lavner2012_cold_feet', predictor='Premarital doubts (wife)', contrast='Wives with vs without premarital doubts: 4-year divorce',
    measure='proportion divorced', estimate=0.19, se_or_other='19% (16/84) vs 8% (11/141); chi2(1,N=225)=6.31, p<.05. Husbands: 14% (15/106) vs 9% (10/117), ns. Couple-level: no doubts 6%, both doubt 20%.',
    n='232 couples (464 spouses)', events='27 couples divorced by 4 years', population='Los Angeles newlyweds', country='US', years='4-year follow-up',
    design='prospective (retrospective report of doubts at newlywed stage)', adjusted_for='controls in regression: satisfaction, engagement difficulty, parental divorce, cohabitation, neuroticism',
    citation='Lavner, J. A., Karney, B. R., & Bradbury, T. N. (2012). Do cold feet warn of trouble ahead? Premarital uncertainty and four-year marital outcomes. Journal of Family Psychology, 26(6), 1012-1017.',
    doi='10.1037/a0029912', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3525794/',
    quote='"Among wives, 8% of those who reported not having premarital doubts divorced by four years (n = 11 out of 141) compared to 19% of those who did report premarital doubts (n = 16 out of 84). Chi-square analyses indicated that these rates differed significantly, chi2(1, N = 225) = 6.31, p < .05."',
    provenance='primary', caveats='Unadjusted RR ~2.4 computable from counts (16/84 vs 11/141).')
rec(id='Lavner2020_premarital_parenthood', predictor='Couple already had a shared child at marriage', contrast='Premarital parents vs non-parents: dissolution over ~4.5 years',
    measure='proportion dissolved', estimate=0.191, se_or_other='19.1% vs 9.5% ("twice as high"); robust to controls.',
    n='low-income newlywed couples (n in paper, ~431)', population='Low-income, ethnically diverse first-married newlyweds, Los Angeles', country='US', years='first 4.5 years',
    design='prospective', adjusted_for='race, age, education, household income, work status, relationship length, premarital cohabitation',
    citation='Lavner, J. A., Williamson, H. C., Karney, B. R., & Bradbury, T. N. (2020). Premarital parenthood and newlyweds\' marital trajectories. Journal of Family Psychology, 34(3), 279-290.',
    doi='10.1037/fam0000596', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7102923/',
    quote='"the rate of marital dissolution was twice as high among premarital parents (19.1%) relative to couples who were not parents at the start of marriage (9.5%)."',
    provenance='abstract', caveats='Sample size not extracted.')
rec(id='KB1995_review_scope', predictor='Longitudinal predictors of marital quality and stability (review)', contrast='n/a', measure='review scope', estimate=None,
    se_or_other='Abstract gives scope only; per-predictor effect sizes from the review were NOT retrieved and are not reproduced here.', n='115 longitudinal studies, >45,000 marriages', population='mostly US', country='mixed', years='through ~1993', design='narrative + quantitative review',
    citation='Karney, B. R., & Bradbury, T. N. (1995). The longitudinal course of marital quality and stability: A review of theory, method, and research. Psychological Bulletin, 118(1), 3-34.',
    doi='10.1037/0033-2909.118.1.3', url='https://pubmed.ncbi.nlm.nih.gov/7644604/',
    quote='"the methods and findings of 115 longitudinal studies--representing over 45,000 marriages--are summarized and evaluated"', provenance='abstract', caveats='Need full text for its effect-size tables (neuroticism, negative behaviour, satisfaction etc.).')
rec(id='KB2020_review', predictor='Negative communication (critique of behavioral models)', contrast='n/a', measure='qualitative review conclusion', estimate=None,
    population='literature 2010-2019', country='mixed', years='2010s', design='review',
    citation='Karney, B. R., & Bradbury, T. N. (2020). Research on marital satisfaction and stability in the 2010s: Challenging conventional wisdom. Journal of Marriage and Family, 82(1), 100-116.',
    doi='10.1111/jomf.12635', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8186435/',
    quote='"contrary to predictions of behavioral models of marriage, negative communication between spouses can be difficult to change, does not necessarily lead to more satisfying relationships when it is changed, and does not always predict distress in the first place. Third, dyadic processes that are reliably adaptive for middle-class and more affluent couples may operate differently in lower-income couples"',
    provenance='abstract', caveats='Qualitative; key context for down-weighting communication predictors.')
rec(id='Joel2020_ML_predictability', predictor='Self-report predictors of relationship QUALITY (ML across 43 datasets)', contrast='Variance explained', measure='R^2 (max)', estimate=0.45,
    se_or_other='Up to 45% of variance at baseline, 18% at end of study; change in quality "largely unpredictable".', n='43 dyadic longitudinal datasets from 29 laboratories', population='mixed', country='mixed', years='various',
    design='prospective, random forests with cross-validation', adjusted_for='n/a',
    citation='Joel, S., Eastwick, P. W., Allison, C. J., et al. (2020). Machine learning uncovers the most robust self-report predictors of relationship quality across 43 longitudinal couples datasets. PNAS, 117(32), 19061-19071.',
    doi='10.1073/pnas.1917036117', url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7431040/',
    quote='"Overall, relationship-specific variables predicted up to 45% of variance at baseline, and up to 18% of variance at the end of each study. ... relationship-quality change (i.e., increases or decreases in relationship quality over the course of a study) was largely unpredictable from any combination of self-report variables."',
    provenance='abstract', caveats='Outcome is relationship quality, not divorce; included as a ceiling on how predictable relationship outcomes are from self-report.')

# ---------------- D. Premarital inventories ----------------
rec(id='FowersOlson1986_PREPARE', predictor='PREPARE premarital inventory (individual + couple positive-agreement scores)', contrast='Happily married vs separated/divorced at 3 years',
    measure='accuracy (in-sample discriminant, % correctly classified)', estimate=0.91, se_or_other='Individual scores only: 81%; couple PCA only: 74%; both: 91% (happy 93%, divorced 87%).',
    n='164 couples (59 satisfied, 22 dissatisfied, 52 cancelled, 31 separated/divorced per PREPARE summary)', events='31 separated/divorced', population='Engaged couples in Minnesota churches taking PREPARE', country='US', years='~1980-1983',
    design='prospective, in-sample discriminant between extreme groups (dissatisfied/cancelled excluded from that contrast)', adjusted_for='none',
    citation='Fowers, B. J., & Olson, D. H. (1986). Predicting marital success with PREPARE: A predictive validity study. Journal of Marital and Family Therapy, 12(4), 403-413.',
    doi='10.1111/j.1752-0606.1986.tb00673.x', url='https://www.prepare-enrich.com/wp-content/uploads/2020/12/Fowers-Olson-1986-Predicting-Marital-Success-With-PREPARE.pdf',
    quote='"Furthermore, these combined scores can correctly discriminate successful marriages from those who end in divorce, in 91% of the cases." Table 3 row: "Both Individual and Couple (PCA)Scores 91 93 87"',
    provenance='primary', caveats='Hosted by the instrument vendor; in-sample; compares extremes only; group sizes 59 vs 31 (balanced-ish so accuracy is more meaningful than in Gottman samples, but still no holdout). DOI verified via Crossref.')
rec(id='Fowers1996_PREPARE_types', predictor='PREPARE premarital couple type (Vitalized, Harmonious, Traditional, Conflicted)', contrast='Conflicted vs other types', measure='direction only', estimate=None,
    n='393 couples', population='PREPARE users', country='US', years='3-year follow-up', design='prospective', adjusted_for='none',
    citation='Fowers, B. J., Montel, K. H., & Olson, D. H. (1996). Predicting marital success for premarital couple types based on PREPARE. Journal of Marital and Family Therapy, 22(1), 103-119.',
    doi='10.1111/j.1752-0606.1996.tb00190.x', url='https://doi.org/10.1111/j.1752-0606.1996.tb00190.x',
    quote='"A substantial relationship was found, with conflicted couples being the most likely to separate or divorce. ... Traditional couples were less likely to have divorced than Harmonious couples, even though Harmonious couples had higher premarital relationship satisfaction scores."',
    provenance='abstract', caveats='No numeric effect in abstract.')

# ---------------- B. Demographic / structural ----------------
MC='Manning, W. D., & Cohen, J. A. (2012). Premarital cohabitation and marital dissolution: An examination of recent marriages. Journal of Marriage and Family, 74(2), 377-387.'
MCu='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3487709/'
MCpop='US first marriages since 1996, NSFG 2006-2008'
MCadj='race/ethnicity, number of noncohabiting sex partners (women), premarital birth, age at first marriage, education, mother\'s education, two-parent family at 14'
def mc(id_,pred,con,sex,hr,se,full,quote,cav=''):
    lo,hi=ci_hr_se(hr,se)
    rec(id=id_,predictor=pred,contrast=con,measure='HR (Cox)',estimate=hr,ci_low=lo,ci_high=hi,se_or_other=f'SE(HR)={se}; CI derived by delta method exp(ln HR +/- 1.96*SE/HR)',
        n=('2,003 women' if sex=='W' else '1,483 men'),population=MCpop+(' (women)' if sex=='W' else ' (men)'),country='US',years='marriages 1996-2008',
        design='retrospective event history (Cox)',adjusted_for=(MCadj if full else 'none (zero-order)'),citation=MC,doi='10.1111/j.1741-3737.2012.00960.x',url=MCu,quote=quote,provenance='primary',caveats=cav or 'Dissolution includes separation.')
mc('Manning2012_cohab_W_zero','Premarital cohabitation with spouse','Cohabited vs did not (women)','W',1.03,0.13,False,'Table 2: "Cohabitation with spouse (reference [ref.]: No) | Yes | 1.03 | 0.13 | | | 1.22 | 0.24"')
mc('Manning2012_cohab_M_zero','Premarital cohabitation with spouse','Cohabited vs did not (men)','M',1.22,0.24,False,'Table 2: "Yes | 1.03 | 0.13 | | | 1.22 | 0.24"')
mc('Manning2012_cohab_engaged_W','Premarital cohabitation x engagement','Cohabited AND engaged vs no cohabitation (women, full model)','W',0.57,0.13,True,'Table 2: "Cohabitation and engaged | 0.75† | 0.13 | 0.57* | 0.13 | 1.22 | 0.30 | 0.99 | .19"')
mc('Manning2012_cohab_notengaged_W','Premarital cohabitation x engagement','Cohabited NOT engaged vs no cohabitation (women, full model)','W',1.07,0.23,True,'Table 2: "Cohabitation and not engaged | 1.40* | 0.23 | 1.07 | 0.23 | 1.22 | 0.27 | 0.98 | 0.23"')
mc('Manning2012_premaritalbirth_W','Premarital birth','Had a birth before first marriage vs not (women, full)','W',1.45,0.30,True,'Table 2: "Premarital birth (ref: No) | Yes | 2.03*** | 0.31 | 1.45† | 0.30 | 2.24*** | 0.43 | 1.84** | 0.40"')
mc('Manning2012_premaritalbirth_M','Premarital birth','Had a birth before first marriage vs not (men, full)','M',1.84,0.40,True,'Table 2: "Premarital birth (ref: No) | Yes | 2.03*** | 0.31 | 1.45† | 0.30 | 2.24*** | 0.43 | 1.84** | 0.40"')
mc('Manning2012_agemarr_W','Age at first marriage','Per additional year of age at marriage (women, full)','W',0.94,0.02,True,'Table 2: "Age at first marriage | 0.93** | 0.02 | 0.94** | 0.02 | 1.00 | 0.03 | 1.00 | 0.03"','Linear term; men show no association (HR 1.00).')
mc('Manning2012_college_W','Own education','College degree vs high school (women, full)','W',0.33,0.07,True,'Table 2: "College degree | 0.25*** | 0.05 | 0.33*** | 0.07 | 0.46* | 0.14 | 0.59* | 0.17"','Education measured at interview, not at marriage.')
mc('Manning2012_college_M','Own education','College degree vs high school (men, full)','M',0.59,0.17,True,'Table 2: "College degree | 0.25*** | 0.05 | 0.33*** | 0.07 | 0.46* | 0.14 | 0.59* | 0.17"','Education measured at interview.')
mc('Manning2012_lessHS_M','Own education','Less than high school vs high school (men, full)','M',0.51,0.11,True,'Table 2: "Less than high school degree | 0.90 | 0.21 | 0.81 | 0.17 | 0.53** | 0.12 | 0.51** | 0.11"','Counter-intuitive protective estimate for low-education men; likely selection/measurement.')
mc('Manning2012_intactfamily_W','Parental divorce / family of origin','Two biological/adoptive parents at 14 vs not (women, full)','W',0.74,0.11,True,'Table 2: "Two biological/adoptive parents | 0.51*** | 0.07 | 0.74* | 0.11 | 0.61* | 0.12 | 0.69† | 0.13"')
mc('Manning2012_intactfamily_M','Parental divorce / family of origin','Two biological/adoptive parents at 14 vs not (men, full)','M',0.69,0.13,True,'Table 2: "Two biological/adoptive parents | 0.51*** | 0.07 | 0.74* | 0.11 | 0.61* | 0.12 | 0.69† | 0.13"')
mc('Manning2012_sexpartners_W','Number of premarital (noncohabiting) sex partners','Per additional partner (women, full)','W',1.03,0.01,True,'Table 2: "No. noncohabiting sex partners | 1.04** | 0.01 | 1.03** | 0.01"')

# Rosenfeld & Roesler
RR='Rosenfeld, M. J., & Roesler, K. (2019). Cohabitation experience and cohabitation\'s association with marital dissolution. Journal of Marriage and Family, 81(1), 42-58.'
RRu='https://web.stanford.edu/~mrosenfe/Rosenfeld_and_Roesler_Cohabitation_Experience_NSFG.pdf'
o,l,h=ci_logit(0.30,0.021)
rec(id='Rosenfeld2019_cohab_M2', predictor='Premarital cohabitation with spouse', contrast='Cohabited vs not (pooled over marriage durations; discrete-time logit)', measure='OR (per marriage-year, discrete-time)', estimate=1.31, ci_low=None, ci_high=None,
    se_or_other='Text: OR 1.37 unadjusted, 1.31 with controls (Table 1). Table 2 M2 log-OR 0.30 (SE 0.021) -> OR %.2f, 95%% CI %.2f-%.2f (derived; model also includes cohort interaction).'%(o,l,h),
    n='24,888 couples; 216,455 couple-years', events='8,488 breakups', population='US women <=44 in first marriages, NSFG waves 1988-2015', country='US', years='marriages 1970-2015',
    design='retrospective, discrete-time event history', adjusted_for='marital duration, year of marriage, age at marriage, children <18, calendar decade, education, race, stable family of origin, mother\'s education, NSFG wave',
    citation=RR, doi='10.1111/jomf.12530', url=RRu,
    quote='"premarital cohabitation has been associated with higher odds of marital dissolution, 1.37 times higher than couples who never cohabited (Model 1, without controls), or 1.31 times higher with controls (Model 2)."',
    provenance='primary', caveats='Author preprint (July 2018) of the published paper. Effect is time-varying: lower risk in year 1, higher afterward.')
rec(id='Rosenfeld2019_cohab_firstyear', predictor='Premarital cohabitation x first year of marriage', contrast='Interaction: cohabited x calendar year of marriage', measure='log-OR interaction', estimate=-0.39, ci_low=round(-0.39-1.96*0.090,3), ci_high=round(-0.39+1.96*0.090,3),
    se_or_other='SE 0.090 (CI on log scale, derived). Main effect log-OR 0.32 in same model -> net first-year OR ~exp(-0.07)=0.93.',
    n='24,888 couples', events='8,488', population='as above', country='US', years='1970-2015', design='discrete-time event history', adjusted_for='as above',
    citation=RR, doi='10.1111/jomf.12530', url=RRu,
    quote='"The coefficient for the interaction between premarital cohabitation and the year of marriage in Model 3 was a highly significant -0.39, more than offsetting the log odds ratio of 0.32 for premarital cohabitation in general."',
    provenance='primary', caveats='Contested by Manning, Smock & Kuperberg (2021 comment, JMF 83, 260-267).')
rec(id='Rosenfeld2019_other_cohabs', predictor='Number of prior (nonmarital) cohabiting partners other than spouse', contrast='1 other cohabitation / 2+ other cohabitations vs none', measure='OR (per marriage-year)', estimate=3.25,
    se_or_other='1 prior cohabitation: OR e^1.18=3.25; 2+: OR e^1.54=4.66; premarital cohab with spouse drops to 1.19 once these are included. No SE extracted for these terms.',
    n='24,888 couples', events='8,488', population='as above', country='US', years='1970-2015', design='discrete-time event history', adjusted_for='as above plus premarital cohabitation with spouse',
    citation=RR, doi='10.1111/jomf.12530', url=RRu,
    quote='"According to Model 2, the odds of marital dissolution in any given year of marriage were e0.18=1.19 times higher for women who cohabited with their husband before marriage. The odds of marital dissolution were e1.18=3.25 times higher for women who had (before marriage) one nonmarital cohabiting partner, and e1.54=4.66 times higher for women who had two or more nonmarital cohabitations before marrying their first husband."',
    provenance='primary', caveats='Large effect; serial cohabitation is likely a marker of selection.')
rec(id='Kuperberg2014_coresidence_age', predictor='Age at coresidence (vs age at marriage) for cohabitors', contrast='Cohabitors vs direct marriers, standardised by age at coresidence', measure='direction only', estimate=None,
    n='7,037', population='NSFG 1995, 2002, 2006-2010', country='US', years='1985-2009 marriages', design='retrospective event history', adjusted_for='various',
    citation='Kuperberg, A. (2014). Age at coresidence, premarital cohabitation, and marriage dissolution: 1985-2009. Journal of Marriage and Family, 76(2), 352-369.',
    doi='10.1111/jomf.12092', url='https://doi.org/10.1111/jomf.12092',
    quote='"age at coresidence explained a substantial portion of the higher marital dissolution risk of premarital cohabitors. In comparisons standardized by age at coresidence, the difference in risk of marital dissolution between premarital cohabitors and those who married without prior cohabitation (\\"direct marriers\\") was much smaller than in comparisons standardized by age at marriage, and in some models this difference was not significant."',
    provenance='abstract', caveats='Implies a calculator should use age at moving in together, not just wedding age, for cohabitors.')

# Martin 2006
MA='Martin, S. P. (2006). Trends in marital dissolution by women\'s education in the United States. Demographic Research, 15(20), 537-560.'
MAu='https://www.demographic-research.org/volumes/vol15/20/15-20.pdf'
for nm,b,se,lab in [('le18',.88,.05,'18 or younger'),('19_21',.47,.04,'19 to 21'),('25_27',-.22,.06,'25 to 27'),('28_30',-.24,.07,'28 to 30'),('31plus',-.50,.07,'31 or older')]:
    o,l,h=ci_logit(b,se)
    rec(id=f'Martin2006_agemarr_{nm}',predictor='Age at first marriage (wife)',contrast=f'{lab} vs 22-24',measure='HR (Cox)',estimate=o,ci_low=l,ci_high=h,se_or_other=f'B={b}, SE={se}; CI derived',
        n='16,756 women',population='US-born women entering first marriage 1975-1994, SIPP 1996-2001',country='US',years='1975-1994 marriages',design='retrospective event history (Cox), Model B',
        adjusted_for='education (time-varying), year of marriage x education, race x year, premarital birth',citation=MA,doi='10.4054/DemRes.2006.15.20',url=MAu,
        quote=f'Table 3 Model B, Age at 1st marriage: "{lab} ... {b:+.2f}** {se:.2f} {o:.2f}"'.replace('+',''),provenance='primary',caveats='Women only; SIPP divorce underreporting (Kennedy & Ruggles 2014).')
o,l,h=ci_logit(.35,.04)
rec(id='Martin2006_premaritalbirth',predictor='Premarital birth',contrast='Premarital first birth vs none',measure='HR (Cox)',estimate=o,ci_low=l,ci_high=h,se_or_other='B=.35, SE=.04',n='16,756 women',population='US women, SIPP',country='US',years='1975-1994',design='retrospective Cox',adjusted_for='education, age at marriage, race, year',citation=MA,doi='10.4054/DemRes.2006.15.20',url=MAu,quote='Table 3 Model B: "Premarital 1st birth .35** .04 1.41"',provenance='primary',caveats='')
rec(id='Martin2006_educ_trend',predictor='Wife education (4-year degree vs none) - trend',contrast='10-year dissolution, 1990-94 cohort: 4-year college 16.5% vs no HS diploma 46.3%',measure='probability (life-table, 10-year dissolution)',estimate=0.165,
    se_or_other='Same table: HS diploma 37.9%, some college 36.0%, master\'s+ 14.4%; all first marriages 31.2%. Degree before marriage 14.0%.',n='3,912 women in 1990-94 cohort',population='US-born women, SIPP',country='US',years='1990-1994 marriages',design='cohort life table',adjusted_for='none',citation=MA,doi='10.4054/DemRes.2006.15.20',url=MAu,
    quote='Table 1 (1990-94 column): "No High School Diploma ... 46.3; High School Diploma ... 37.9; Some College ... 36.0; 4-Year College Degree ... 16.5; Master\'s or Professional Degree ... 14.4"; "All First Marriages 31.2"',provenance='primary',caveats='Educational gradient widened sharply across cohorts.')

# Raley & Bumpass 2003
RB='Raley, R. K., & Bumpass, L. (2003). The topography of the divorce plateau: Levels and trends in union stability in the United States after 1980. Demographic Research, 8(8), 245-260.'
RBu='https://www.demographic-research.org/volumes/vol8/8/8-8.pdf'
for nm,row,p30 in [('13_17','13-17 37 50 57 63 68',0.68),('18_19','18,19 30 43 50 55 61',0.61),('20_21','20,21 22 32 39 44 51',0.51),('22_23','22,23 15 23 29 33 40',0.40),('24_26','24-26 14 28 34 41 44',0.44),('27_29','27-29 16 28 31 36 39',0.39),('30plus','30+ 13 20 23 27 31',0.31)]:
    rec(id=f'RaleyBumpass2003_age_{nm}',predictor='Age at first marriage (woman)',contrast=f'Age {row.split()[0]} at marriage',measure='probability (period life table, % of first marriages dissolved by 30 years)',estimate=p30,
        se_or_other='Durations 5/10/15/20/30 years: '+' '.join(row.split()[1:])+' (percent). No SE reported.',n='June 1990 CPS women',population='US women, first marriages, period rates 1987-89',country='US',years='1987-1989 period rates',design='period life table',adjusted_for='none',
        citation=RB,doi='10.4054/DemRes.2003.8.8',url=RBu,quote=f'Table 1 "% Marriages Dissolved, Duration 5 10 15 20 30 ... Age at Marriage ... {row}"',provenance='primary',caveats='Period (synthetic cohort) estimate; includes separation.')
for nm,row,p in [('total','Total 20 31 38 43 50',0.50),('black','Black 26 44 53 59 70',0.70),('white','White 19 30 37 42 47',0.47),('notHS','Not HS Grad 26 39 47 53 60',0.60),('HS','High School Grad 23 35 43 47 53',0.53),('somecoll','Some College 20 32 38 45 51',0.51),('college','College Graduate 11 20 25 28 36',0.36)]:
    rec(id=f'RaleyBumpass2003_{nm}',predictor='Base rate / education / race (lifetime dissolution)',contrast=row.rsplit(' ',5)[0],measure='probability (% dissolved by 30 years)',estimate=p,
        se_or_other='Durations 5/10/15/20/30: '+' '.join(row.split()[-5:]),n='June 1990 CPS',population='US women first marriages',country='US',years='1987-89 period rates',design='period life table',adjusted_for='none',
        citation=RB,doi='10.4054/DemRes.2003.8.8',url=RBu,quote=f'Table 1: "{row}"',provenance='primary',caveats='Period estimate; separation included.')

# Wolfinger
rec(id='Wolfinger2015_agemarr_U',predictor='Age at first marriage (nonlinear; late-marriage upturn)',contrast='Per year of age at marriage: before ~32 vs after ~32',measure='odds change per year',estimate=0.89,
    se_or_other='-11% odds per year before ~32; +5% per year after (OR ~1.05). No CI published in post; GAM method.',n='NSFG 2006-2010 (35+ group N=379)',population='US NSFG respondents 15-44',country='US',years='2006-2010',
    design='cross-sectional retrospective, GAM',adjusted_for='sex, race, family structure of origin, age at survey, education, religious tradition, attendance, sexual history, metro size',
    citation='Wolfinger, N. H. (2015, July 16). Want to avoid divorce? Wait to get married, but not too long. Institute for Family Studies blog.',doi=None,url='https://ifstudies.org/blog/want-to-avoid-divorce-wait-to-get-married-but-not-too-long',
    quote='"My data analysis shows that prior to age 32 or so, each additional year of age at marriage reduces the odds of divorce by 11 percent. However, after that the odds of divorce increase by 5 percent per year. The change in slopes is statistically significant."',
    provenance='primary',caveats='Non-peer-reviewed blog; right-censoring for 35+; not replicated by Kuperberg/others in peer-reviewed form (contested).')
rec(id='Wolfinger2016_sexpartners',predictor='Number of premarital sex partners (women)',contrast='5-year divorce rate, women marrying in 2000s: 10+ partners vs 0 partners',measure='probability (5-year life-table divorce)',estimate=0.33,
    se_or_other='10+ partners 33%; 2 partners 30% (difference ns); virgins 6% (2000s; 11% 1980s, 8% 1990s). Appendix HRs (e.g. 1 partner vs 0 in 1990s: 75% higher) not fully extracted.',n='NSFG 2002, 2006-10, 2011-13 women',population='US women first marriages',country='US',years='marriages 1980s-2000s',
    design='retrospective life table + Cox',adjusted_for='life table unadjusted',citation='Wolfinger, N. H. (2016, June 6). Counterintuitive trends in the link between premarital sex and marital stability. Institute for Family Studies blog.',doi=None,
    url='https://ifstudies.org/blog/counterintuitive-trends-in-the-link-between-premarital-sex-and-marital-stability',
    quote='"The highest five-year divorce rates of all are associated with marrying in the 2000s and having ten or more premarital sex partners: 33 percent." ... "Eleven percent of virgin marriages ... in the 1980s dissolved within five years. This number fell to 8 percent in the 1990s, then fell again to 6 percent in the 2000s."',
    provenance='primary',caveats='Blog brief; strong selection (religiosity). Date of post approximate.')

# Killewald 2016
KW='Killewald, A. (2016). Money, work, and marital stability: Assessing change in the gendered determinants of divorce. American Sociological Review, 81(4), 696-719.'
KWu='https://www.asanet.org/wp-content/uploads/attach/journals/aug16asrfeature.pdf'
KWadj='economic well-being, wife economic dependence, both spouses\' FT employment, wife housework share, duration, religion, race, nativity, home ownership, children, premarital cohabitation/birth, age at marriage, each spouse\'s education, health, occupation/industry sex composition, region, marriage cohort'
for id_,pred,con,b,se,col,q in [
 ('Killewald2016_husbandFT_post1975','Husband employment','Husband employed full-time vs not (married 1975+)',-.293,.106,'1975+','"Husband −.097 (.208) OR = .908 | −.293** (.106) OR = .746 | −.238* (.094) OR = .788"'),
 ('Killewald2016_husbandFT_pooled','Husband employment','Husband employed full-time vs not (pooled)',-.238,.094,'pooled','"Husband ... −.238* (.094) OR = .788"'),
 ('Killewald2016_wifeFT_post1975','Wife employment','Wife employed full-time vs not (married 1975+)',.069,.088,'1975+','"Wife .267 (.153) OR = 1.306 | .069 (.088) OR = 1.071 | .166* (.080) OR = 1.181"'),
 ('Killewald2016_housework_post1975','Division of housework','Wife\'s proportion of housework (0-1) (married 1975+)',.050,.233,'1975+','"Wife\'s proportion of housework −1.117* (.463) OR = .327 | .050 (.233) OR = 1.051 | −.244 (.224) OR = .783"'),
 ('Killewald2016_housework_pre1975','Division of housework','Wife\'s proportion of housework (0-1) (married <=1974)',-1.117,.463,'<=1974','"Wife\'s proportion of housework −1.117* (.463) OR = .327"'),
 ('Killewald2016_income_post1975','Household income / financial strain','Economic well-being, per $1,000 (married 1975+)',.002,.005,'1975+','"Economic well-being (thousands of $) .014 (.009) OR = 1.014 | .002 (.005) OR = 1.002"'),
 ('Killewald2016_notreligious_post1975','Religiosity','At least one spouse not religious vs other (married 1975+)',.257,.101,'1975+','"At least one spouse is not religious** .812*** (.176) OR = 2.252 | .257* (.101) OR = 1.293 | .395*** (.091) OR = 1.485"'),
 ('Killewald2016_homeown_post1975','Home ownership','Owns home vs not (married 1975+)',-.398,.082,'1975+','"Home ownership −.061 (.172) OR = .941 | −.398*** (.082) OR = .672"'),
 ('Killewald2016_kids5plus_post1975','Number of children','Per child aged 5+ (married 1975+)',.152,.053,'1975+','"Age 5 and older .091 (.080) OR = 1.095 | .152** (.053) OR = 1.164"'),
 ('Killewald2016_kidsunder5_post1975','Number of children','Per child under 5 (married 1975+)',-.001,.062,'1975+','"Under age 5 .200 (.123) OR = 1.222 | −.001 (.062) OR = .999"'),
 ('Killewald2016_cohab_post1975','Premarital cohabitation','Cohabited before marriage (married 1975+)',.251,.120,'1975+','"Premarital cohabitation* 1.308** (.413) OR = 3.700 | .251* (.120) OR = 1.285"'),
 ('Killewald2016_premaritalbirth_post1975','Premarital birth','Premarital birth (married 1975+)',.218,.117,'1975+','"Premarital birth .490 (.424) OR = 1.633 | .218 (.117) OR = 1.244"'),
 ('Killewald2016_under21_post1975','Age at marriage','At least one spouse under 21 at marriage (married 1975+)',.297,.096,'1975+','"Under age 21 .628*** (.181) OR = 1.874 | .297** (.096) OR = 1.345"'),
 ('Killewald2016_under25_post1975','Age at marriage','At least one spouse under 25 at marriage (married 1975+; additional to <21 term)',.246,.105,'1975+','"Under age 25 .666 (.462) OR = 1.947 | .246* (.105) OR = 1.279"'),
 ('Killewald2016_wifecollege_post1975','Education (wife)','Wife college vs high school (married 1975+)',-.345,.158,'1975+','"College .091 (.280) OR = 1.096 | −.345* (.158) OR = .708"'),
 ('Killewald2016_husbcollege_post1975','Education (husband)','Husband college vs high school (married 1975+)',-.559,.153,'1975+','"College −.170 (.218) OR = .843 | −.559*** (.153) OR = .572"'),
 ('Killewald2016_south_post1975','Region','South vs Northeast (married 1975+)',.279,.124,'1975+','"South .531* (.228) OR = 1.701 | .279* (.124) OR = 1.321"'),
 ('Killewald2016_foreignwife_post1975','Nativity','Wife foreign-born (married 1975+)',-.703,.249,'1975+','"Wife is foreign-born −.275 (.543) OR = .759 | −.703** (.249) OR = .495"'),
]:
    o,l,h=ci_logit(b,se)
    rec(id=id_,predictor=pred,contrast=con,measure='OR (discrete-time logit, per couple-year)',estimate=o,ci_low=l,ci_high=h,se_or_other=f'logit B={b}, SE={se}; CI derived',
        n='6,309 couples (PSID); 1,303 divorces in 1975+ cohort, 381 in earlier cohort',events='1,303 (1975+) / 381 (<=1974)',population=f'US first-married different-sex couples, both 18-55, PSID ({col} cohort)',country='US',years='1968-2013',
        design='prospective panel, discrete-time logistic',adjusted_for=KWadj,citation=KW,doi='10.1177/0003122416655340',url=KWu,quote='Table 3: '+q,provenance='primary',caveats='Annual hazard OR; covariates measured in prior year.')

# Francis-Tan & Mialon 2015
FT='Francis-Tan, A., & Mialon, H. M. (2015). "A diamond is forever" and other fairy tales: The relationship between wedding expenses and marriage duration. Economic Inquiry, 53(4), 1919-1930.'
FTu='https://www.csus.edu/faculty/m/fred.molitor/docs/wedding%20expenses%20and%20marriage%20duration1.pdf'
FTadj='age, marriage age, sex, race, education, employment, household income, region, religious attendance, spouse age/race/education differences, children, knew spouse well, dating length, attitudes, honeymoon, ring cost, attendance, wedding cost'
for id_,pred,con,hr,se,q in [
 ('FTM2015_agegap','Spousal age gap','Per year of age difference (all persons)',1.022,0.009,'"Age difference (in years) 0.994 (0.007) 1.022*** (0.009) 1.041** (0.017) 1.014 (0.010)"'),
 ('FTM2015_racediff','Interracial / race difference','Respondent-spouse race difference (all persons)',1.180,0.110,'"Race difference 1.343*** (0.114) 1.180* (0.110) 1.262* (0.169) 1.124 (0.158)"'),
 ('FTM2015_educdiff','Educational heterogamy','Respondent-spouse education difference (all persons)',1.248,0.091,'"Education difference 1.227*** (0.086) 1.248*** (0.091) 1.130 (0.114) 1.331*** (0.140)"'),
 ('FTM2015_dated3plus','Premarital relationship length','Dated 3+ years before proposal vs <1 year (all persons)',0.764,0.077,'"3 or more years 0.518*** (0.046) 0.764*** (0.077) 0.576*** (0.087) 0.980 (0.135)"'),
 ('FTM2015_dated1to2','Premarital relationship length','Dated 1-2 years vs <1 year (all persons)',0.915,0.074,'"1–2 years 0.788*** (0.059) 0.915 (0.074) 0.784* (0.099) 0.997 (0.107)"'),
 ('FTM2015_ring2to4k_men','Engagement ring cost','$2,000-$4,000 vs $500-$2,000 (men)',1.334,0.194,'"$2,000 to $4,000 0.935 (0.103) 1.099 (0.119) 1.334** (0.194) 0.880 (0.144)"'),
 ('FTM2015_wedding_lt1k','Wedding cost','Wedding <$1,000 vs $5,000-$10,000 (all persons)',0.642,0.088,'"$0 to $1,000 1.367*** (0.148) 0.642*** (0.088) 0.492*** (0.107) 0.697* (0.131)"'),
 ('FTM2015_wedding_20kplus','Wedding cost','Wedding $20,000+ vs $5,000-$10,000 (all persons)',1.323,0.200,'"$20,000 or more 0.811 (0.115) 1.323* (0.200) 1.122 (0.235) 1.595** (0.358)"'),
 ('FTM2015_attendance_101_200','Wedding attendance','101-200 guests vs couple only (all persons)',0.422,0.072,'"101–200 0.327*** (0.044) 0.422*** (0.072) 0.411*** (0.104) 0.414*** (0.099)"'),
 ('FTM2015_relig_regular','Religiosity (attendance)','Attends regularly vs never (all persons)',0.625,0.071,'"Regularly 0.428*** (0.045) 0.625*** (0.071) 0.587*** (0.110) 0.652*** (0.096)"'),
 ('FTM2015_income125k','Household income','$125,000+ vs $0-$24,999 (all persons)',0.390,0.080,'"$125,000 or more 0.238*** (0.045) 0.390*** (0.080) 0.497** (0.138) 0.339*** (0.100)"'),
 ('FTM2015_honeymoon','Honeymoon','Had a honeymoon vs not (all persons)',0.870,0.069,'"Had a honeymoon 0.642*** (0.043) 0.870* (0.069) 0.780** (0.096) 0.900 (0.095)"'),
 ('FTM2015_marriageage','Age at marriage','Per year of marriage age (all persons)',0.912,0.009,'"Marriage age (in years) 0.920*** (0.009) 0.912*** (0.009) 0.892*** (0.013) 0.921*** (0.013)"'),
 ('FTM2015_looks','Partner looks important at proposal','Yes vs no (all persons)',1.294,0.102,'"Partner looks important 1.232*** (0.092) 1.294*** (0.102) 1.485*** (0.158) 0.993 (0.124)"'),
]:
    l,h=ci_hr_se(hr,se)
    rec(id=id_,predictor=pred,contrast=con,measure='HR (Cox, population-weighted)',estimate=hr,ci_low=l,ci_high=h,se_or_other=f'SE(HR)={se}; CI derived (delta method). Stars: *10%, **5%, ***1%.',
        n='3,151 ever-married persons (1,455 men, 1,696 women)',population='US online survey (SurveyMonkey Audience) of ever-married adults, weighted to ACS',country='US',years='survey 2014',
        design='retrospective, Cox (respondent-reported)',adjusted_for=FTadj,citation=FT,doi='10.1111/ecin.12206',url=FTu,quote='Table 2 (bivariate | multivariate all | men | women): '+q,provenance='primary',
        caveats='Opt-in online sample, retrospective recall of costs; many covariates (some arguably mediators); significance at 10% flagged as *.')

# Bratter & King 2008 (signs: PDF renders minus as "2")
BK='Bratter, J. L., & King, R. B. (2008). "But will it last?": Marital instability among interracial and same-race couples. Family Relations, 57(2), 160-171.'
BKu='https://www.healthymarriageinfo.org/wp-content/uploads/2017/12/But-Will-It-Last--Marital.pdf'
for id_,con,b,se,q in [('BK2008_BlackH_WhiteW','Black husband / White wife vs White/White',.73,.05,'"Black/White .81*** .08 2.26 .73*** .05 2.08"'),
                       ('BK2008_WhiteH_BlackW','White husband / Black wife vs White/White',-.58,.21,'"White/Black 2.46y .27 0.67 2.58** .21 0.56" (minus signs render as "2" in the PDF text; eB=0.56 confirms negative B)'),
                       ('BK2008_AsianH_WhiteW','Asian husband / White wife vs White/White',.47,.02,'"Asian/White .35 .25 1.42 .47*** .02 1.60"'),
                       ('BK2008_WhiteH_AsianW','White husband / Asian wife vs White/White',.04,.02,'"White/Asian .06 .04 1.06 .04y .02 1.04"')]:
    o,l,h=ci_logit(b,se)
    rec(id=id_,predictor='Interracial marriage (race-gender combination)',contrast=con,measure='HR (event history, divorce by year 10)',estimate=round(math.exp(b),2),ci_low=l,ci_high=h,se_or_other=f'B={b}, SE={se}; CI derived. SEs look implausibly small for some cells (design-weighted person-years); treat CIs as optimistic.',
        n='35,139 person-years (NSFG 2002 men and women)',population='US first marriages, NSFG Cycle 6',country='US',years='marriages pre-1980 to 2002',design='retrospective discrete-time event history',
        adjusted_for='marriage cohort, age at marriage, education, parents\' marital status at 14, spousal age difference, premarital cohabitation, premarital birth',citation=BK,doi='10.1111/j.1741-3729.2008.00491.x',url=BKu,
        quote='Table 4 (Baseline B, SE, eB | Full B, SE, eB): '+q+'; text: "NH Black husband/White wife marriages were twice as likely to divorce as White/White couples, and NH Asian husband/White wife couples were 59% more likely, according to Model II."',
        provenance='primary',caveats='Zhang & Van Hook (2009, SIPP) find interracial risk similar to the more divorce-prone origin group, i.e., no "interracial penalty" per se. DOI verified via Crossref.')
rec(id='ZhangVanHook2009',predictor='Interracial marriage',contrast='Interracial vs endogamous',measure='direction only',estimate=None,n='23,139 married couples (SIPP, 6 panels)',population='US married couples',country='US',years='1990s-2000s',design='prospective panel',adjusted_for='couple characteristics',
    citation='Zhang, Y., & Van Hook, J. (2009). Marital dissolution among interracial couples. Journal of Marriage and Family, 71(1), 95-107.',doi='10.1111/j.1741-3737.2008.00582.x',url='https://doi.org/10.1111/j.1741-3737.2008.00582.x',
    quote='"After controlling for couple characteristics, the risk of divorce or separation among interracial couples was similar to the more-divorce-prone origin group. Although marital dissolution was found to be strongly associated with race or ethnicity, the results failed to provide evidence that interracial marriage per se is associated with an elevated risk of marital dissolution."',
    provenance='abstract',caveats='Suggests modelling as max(risk of each spouse\'s group) rather than an extra interracial term.')

# Religion
rec(id='LehrerChiswick1993_mormon_none',predictor='Religious homogamy / affiliation',contrast='Homogamous Mormon vs both "no religion": 5-year dissolution probability',measure='probability (5-year dissolution)',estimate=0.13,
    se_or_other='Both no religion: 0.36. Commentary (Christian Post / Fox News) attributes ~1 in 5 for two mainline Protestants, ~1 in 3 Catholic-evangelical, >40% Jewish-Christian -- not verified against primary.',n='NSFH 1987-88 (n not retrieved)',population='US first marriages',country='US',years='1987-88 survey',
    design='retrospective event history',adjusted_for='not retrieved',citation='Lehrer, E. L., & Chiswick, C. U. (1993). Religion as a determinant of marital stability. Demography, 30(3), 385-404.',doi=None,url='https://mormonr.org/records/nqh19b-7XIPwb',
    quote='"With fifth-year dissolution probabilities of 0.13 and 0.36 respectively, homogamous Mormon marriages are the most stable and those among two persons reporting \\"no religion\\" the least stable."',
    provenance='secondhand',caveats='Numbers from mormonr.org summary of the paper (PMID 8405605); the PubMed abstract (verified) confirms direction only: "interfaith unions have generally higher rates of dissolution than intrafaith unions" and religious compatibility has "a large influence on marital stability, rivaling in magnitude that of age at marriage". Data are NSFH 1987-88. DOI not verified (omitted).')
rec(id='Vaaler2009_attendance_mismatch',predictor='Religious attendance mismatch / theological mismatch',contrast='Husband attends more than wife; wife more conservative than husband',measure='direction only (higher risk)',estimate=None,
    se_or_other='HRs not retrieved (abstract only).',n='2,979 first-married couples (NSFH waves 1-2)',population='US couples',country='US',years='1987-1994',design='prospective proportional hazards',adjusted_for='sociodemographics, marital duration, marital quality',
    citation='Vaaler, M. L., Ellison, C. G., & Powers, D. A. (2009). Religious influences on the risk of marital dissolution. Journal of Marriage and Family, 71(4), 917-934.',doi='10.1111/j.1741-3737.2009.00644.x',url='https://doi.org/10.1111/j.1741-3737.2009.00644.x',
    quote='"the risk of divorce was elevated if husbands attended services more frequently than their wives and if wives were more theologically conservative than their husbands. These patterns withstood controls for sociodemographic covariates, marital duration, and marital quality."',
    provenance='abstract',caveats='')

# Intergenerational transmission
rec(id='AmatoDeBoer2001_parentaldivorce',predictor='Parental divorce (intergenerational transmission)',contrast='Offspring of divorced vs continuously married parents',measure='OR (approximate, "about doubled")',estimate=2.0,
    se_or_other='Abstract wording "approximately doubled"; exact OR/CI not retrieved.',n='~691 adult offspring (Marital Instability Over the Life Course)',population='US',country='US',years='1980-1997',design='prospective, two-generation panel',adjusted_for='not retrieved',
    citation='Amato, P. R., & DeBoer, D. D. (2001). The transmission of marital instability across generations: Relationship skills or commitment to marriage? Journal of Marriage and Family, 63(4), 1038-1051.',doi='10.1111/j.1741-3737.2001.01038.x',url='https://www.proquest.com/docview/219750142',
    quote='"Parental divorce approximately doubled the odds that offspring would see their own marriages end in divorce."',provenance='secondhand',
    caveats='Abstract sentence obtained via web-search summary, not fetched directly; DOI verified via Crossref. Transmission strongest when parents had LOW discord before divorcing.')
rec(id='Salvatore2018_adoption',predictor='Parental divorce: genetic vs rearing transmission',contrast='Heritability of divorce across generations',measure='heritability (h2)',estimate=0.13,
    n='19,715 adoptees; 82,698 offspring in extended design',population='Swedish national registers',country='Sweden',years='birth cohorts mid-20th c.',design='adoption study (registers)',adjusted_for='n/a',
    citation='Salvatore, J. E., Larsson Lönn, S., Sundquist, J., Sundquist, K., & Kendler, K. S. (2018). Genetics, the rearing environment, and the intergenerational transmission of divorce: A Swedish national adoption study. Psychological Science, 29(3), 370-378.',
    doi='10.1177/0956797617734864',url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5854499/',
    quote='"adoptees ( n = 19,715) resembled their biological parents, rather than their adoptive parents, in their history of divorce. ... The heritability of divorce assessed across generations was 0.13."',
    provenance='abstract',caveats='Implies parental-divorce association is largely genetic confounding, not a modifiable cause.')
rec(id='Jockin1996_personality_heritability',predictor='Personality (MPQ) and genetic risk of divorce',contrast='Share of divorce heritability via personality',measure='proportion of heritability',estimate=0.30,
    se_or_other='30% (women) and 42% (men).',n='Minnesota Twin Registry adult twins (n not in abstract)',population='US twins',country='US',years='1990s',design='twin study',adjusted_for='n/a',
    citation='Jocklin, V., McGue, M., & Lykken, D. T. (1996). Personality and divorce: A genetic analysis. Journal of Personality and Social Psychology, 71(2), 288-299.',doi='10.1037/0022-3514.71.2.288',url='https://pubmed.ncbi.nlm.nih.gov/8765483/',
    quote='"Positive Emotionality and Negative Emotionality factors were positively related to divorce risk, whereas Constraint was negatively related. In women and men, respectively, 30% and 42% of the heritability of divorce risk consisted of genetic factors affecting personality"',
    provenance='abstract',caveats='Author name is spelled Jocklin in PubMed.')

# Personality
RO='Roberts, B. W., Kuncel, N. R., Shiner, R., Caspi, A., & Goldberg, L. R. (2007). The power of personality: The comparative validity of personality traits, socioeconomic status, and cognitive ability for predicting important life outcomes. Perspectives on Psychological Science, 2(4), 313-345.'
ROu='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4499872/'
for id_,pred,r,lo,hi in [('Roberts2007_neuroticism','Neuroticism',.17,.12,.22),('Roberts2007_agreeableness','Agreeableness',-.18,-.27,-.09),('Roberts2007_conscientiousness','Conscientiousness',-.13,-.17,-.09),('Roberts2007_SES','Socioeconomic status',-.05,-.08,-.02)]:
    rec(id=id_,predictor=pred,contrast=f'Higher {pred.lower()} (continuous)',measure='r (meta-analytic correlation with divorce)',estimate=r,ci_low=lo,ci_high=hi,se_or_other='95% CI as reported (minus signs lost in PDF text extraction; direction confirmed by surrounding text).',
        n='13 prospective studies (personality); 11 (SES/IQ)',population='mostly US/European prospective cohorts',country='mixed',years='follow-ups up to 45 years',design='meta-analysis of prospective studies',adjusted_for='varies by study (fewer controls than health studies)',
        citation=RO,doi='10.1111/j.1745-6916.2007.00047.x',url=ROu,
        quote='"When so aggregated, the effect of Neuroticism on divorce was .17 (CIs = .12 and .22), the effect of Agreeableness was [-].18 (CIs = [-].27 and [-].09), and the effect of Conscientiousness on divorce was [-].13 (CIs = [-].17 and [-].09)." / "the relation between SES and divorce was [-].05 (CIs = [-].08 and [-].02)"',
        provenance='primary',caveats='Correlations with a binary outcome; convert to OR via d (r->d->lnOR) with base rate care.')

# Mental health / alcohol
TV='Torvik, F. A., Røysamb, E., Gustavson, K., Idstad, M., & Tambs, K. (2013). Discordant and concordant alcohol use in spouses as predictors of marital dissolution in the general population: Results from the Hunt study. Alcoholism: Clinical and Experimental Research, 37(5), 877-884.'
for id_,con,hr in [('Torvik2013_heavy_men','Heavy-drinking husband vs light drinker',1.39),('Torvik2013_heavy_women','Heavy-drinking wife vs light drinker',1.41),('Torvik2013_only_husband','Only husband heavy drinker (couple)',1.51),('Torvik2013_only_wife','Only wife heavy drinker (couple)',3.07),('Torvik2013_both_heavy','Both heavy drinkers vs both light',1.63)]:
    rec(id=id_,predictor='Alcohol use (spousal concordance)',contrast=con,measure='HR',estimate=hr,se_or_other='CI not in abstract.',n='19,977 married couples',population='Nord-Trøndelag (HUNT) general population',country='Norway',years='15-year follow-up from mid-1980s',
        design='prospective cohort, survival analysis',adjusted_for='demographics, mental distress',citation=TV,doi='10.1111/acer.12029',url='https://pubmed.ncbi.nlm.nih.gov/23384147/',
        quote='"Heavy drinking among men (hazard ratio [HR] = 1.39) and women (HR = 1.41) increased the risk of future marital dissolution, even after adjusting for demography (reference group \\"light drinkers\\"). The HR for divorce was 1.51 when only the husband was a heavy drinker, while it was 3.07 when only the wife was a heavy drinker. ... couples with 2 heavy drinkers (HR = 1.63) had higher risk of divorce than couples with 2 light drinkers."',
        provenance='abstract',caveats='Citation verified via Crossref.')
BR='Breslau, J., Miller, E., Jin, R., Sampson, N. A., Alonso, J., Andrade, L. H., ... Kessler, R. C. (2011). A multinational study of mental disorders, marriage, and divorce. Acta Psychiatrica Scandinavica, 124(6), 474-486.'
for id_,dis,o,lo,hi in [('Breslau2011_depression','Major depression',1.6,1.5,1.8),('Breslau2011_alcoholabuse','Alcohol abuse (with/without dependence)',1.7,1.5,1.9),('Breslau2011_GAD','Generalized anxiety disorder',1.4,1.2,1.8),('Breslau2011_PTSD','PTSD',1.7,1.4,2.1),('Breslau2011_drugabuse','Drug abuse',1.8,1.4,2.2)]:
    rec(id=id_,predictor='Premarital mental disorder',contrast=f'{dis} before marriage vs none',measure='OR (discrete-time survival, individual-disorder model)',estimate=o,ci_low=lo,ci_high=hi,se_or_other='95% CI as reported (Model 1).',
        n='30,729 (divorce analysis, 12 countries)',population='World Mental Health Surveys',country='12 countries',years='2001-2007 surveys',design='retrospective survival (age-of-onset recall)',adjusted_for='sex, age, country, years since marriage, months dating before marriage, education',
        citation=BR,doi='10.1111/j.1600-0447.2011.01712.x',url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4011132/',quote=f'Table 4 (Model 1): "{dis} | {o} | {lo}, {hi}"',provenance='primary',caveats='Disorders not mutually adjusted in Model 1; depression 1.5 (1.3-1.7) in Model 3. Citation verified via Crossref (first authors).')

# Infidelity
rec(id='PrevitiAmato2004_EMS',predictor='Infidelity (extramarital sex)',contrast='EMS vs none',measure='direction only (increases odds of divorce)',estimate=None,se_or_other='OR not retrieved.',n='1,475 (17-year panel)',population='Marital Instability Over the Life Course study',country='US',years='1980-1997',design='prospective panel',adjusted_for='marital happiness, divorce proneness',
    citation='Previti, D., & Amato, P. R. (2004). Is infidelity a cause or a consequence of poor marital quality? Journal of Social and Personal Relationships, 21(2), 217-230.',doi='10.1177/0265407504041384',url='https://doi.org/10.1177/0265407504041384',
    quote='"Our results indicate that divorce proneness predicts the occurrence of EMS. Results also suggest that EMS lowers subsequent marital happiness, increases subsequent divorce proneness, and increases the odds of divorce. We conclude that infidelity is both a cause and a consequence of relationship deterioration."',provenance='abstract',caveats='')

# Meeting online
rec(id='Cacioppo2013_online',predictor='Meeting venue (online vs offline)',contrast='Met online vs offline: % separated/divorced',measure='probability (break-up)',estimate=0.0596,se_or_other='5.96% vs 7.67% offline (secondhand); significant after controls. Survey commissioned by eHarmony.',
    n='19,131 married 2005-2012',population='US Harris Interactive panel',country='US',years='2005-2012 marriages',design='cross-sectional retrospective',adjusted_for='year of marriage, gender, age, ethnicity, education, religion, employment, income',
    citation='Cacioppo, J. T., Cacioppo, S., Gonzaga, G. C., Ogburn, E. L., & VanderWeele, T. J. (2013). Marital satisfaction and break-ups differ across on-line and off-line meeting venues. PNAS, 110(25), 10135-10140.',doi='10.1073/pnas.1222447110',url='https://language.chinadaily.com.cn/2013-06/05/content_16568963.htm',
    quote='Abstract (verified): "marriages that began on-line, when compared with those that began through traditional off-line venues, were slightly less likely to result in a marital break-up (separation or divorce)". Percentages 5.96% vs 7.67% from China Daily report.',
    provenance='secondhand',caveats='Conflict of interest (eHarmony); short exposure (0-7 yrs); tiny absolute difference.')

# Base rates
rec(id='SchoenCanudasRomo2006_PMED',predictor='Base rate: US probability of divorce (timing-adjusted)',contrast='Year 2000 period',measure='probability (lifetime, period, timing-adjusted)',estimate=0.445,ci_low=0.43,ci_high=0.46,se_or_other='Reported as a range 0.43-0.46 (not a CI).',
    n='US vital statistics',population='US marriages',country='US',years='1910-2000',design='period demographic adjustment',adjusted_for='timing (tempo) effects',
    citation='Schoen, R., & Canudas-Romo, V. (2006). Timing effects on divorce: 20th century experience in the United States. Journal of Marriage and Family, 68(3), 749-758.',doi='10.1111/j.1741-3737.2006.00287.x',url='https://doi.org/10.1111/j.1741-3737.2006.00287.x',
    quote='"Adjusted values for recent years do not suggest a decline in the likelihood of divorce, with year 2000 values indicating a divorce probability of 0.43 - 0.46."',provenance='abstract',caveats='estimate is the midpoint of the reported range.')
rec(id='KennedyRuggles2014_RDR',predictor='Base rate: refined divorce rate trend',contrast='ACS-corrected refined divorce rate 2008 vs 1980',measure='rate (divorces per 1,000 married women)',estimate=22.1,se_or_other='Vital stats: 22.6 (1980) -> 17.8 (2008); ACS-substituted: 22.6 -> 22.1. Age-standardised rate rose 40% 1980-2008.',
    n='ACS + vital statistics',population='US married women',country='US',years='1980-2011',design='demographic rate analysis',adjusted_for='age standardisation (separate figure)',
    citation='Kennedy, S., & Ruggles, S. (2014). Breaking up is hard to count: The rise of divorce in the United States, 1980-2010. Demography, 51(2), 587-598.',doi='10.1007/s13524-013-0270-9',url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3972308/',
    quote='"According to the vital statistics, the refined divorce rate declined by 21 % (from 22.6 to 17.8 divorces per thousand married women) between 1980 and 2008; substituting the ACS estimates, the decline was only 2 % (from 22.6 to 22.1)." and "By 2010, almost one-half of ever-married persons had been divorced or separated by the time they reached their late 50s."',
    provenance='primary',caveats='')
rec(id='StevensonWolfers2007',predictor='Base rate: divorce trend',contrast='Recent quarter century',measure='direction only',estimate=None,population='US',country='US',years='1850s-2000s',design='descriptive',
    citation='Stevenson, B., & Wolfers, J. (2007). Marriage and divorce: Changes and their driving forces. Journal of Economic Perspectives, 21(2), 27-52.',doi='10.1257/jep.21.2.27',url='https://doi.org/10.1257/jep.21.2.27',
    quote='"While divorce rates have risen over the past 150 years, they have been falling for the past quarter century."',provenance='abstract',caveats='Kennedy & Ruggles (2014) argue the post-1990 decline is partly a data artefact.')
rec(id='Killewald2016_baseline1960s',predictor='Base rate',contrast='Couples first married in the 1960s: divorced within 15 years',measure='probability',estimate=0.30,population='US',country='US',years='1960s marriages',design='cited descriptive',
    citation=KW,doi='10.1177/0003122416655340',url=KWu,quote='"For couples marrying for the first time in the 1960s, approximately 30 percent divorced within 15 years, and divorce risks are even higher for couples in more recent marriage cohorts (Stevenson and Wolfers 2007)."',provenance='secondhand',caveats='Killewald citing Stevenson & Wolfers.')
rec(id='Birditt2010_baseline16yr',predictor='Base rate (newlywed cohort)',contrast='Divorced/separated by year 16',measure='probability',estimate=0.46,n='373 couples',population='Wayne County MI 1986 newlyweds (53% Black)',country='US',years='1986-2002',design='prospective cohort',
    citation='Birditt, K. S., Brown, E., Orbuch, T. L., & McIlvane, J. M. (2010). Marital conflict behaviors and implications for divorce over 16 years. Journal of Marriage and Family, 72(5), 1188-1204.',doi='10.1111/j.1741-3737.2010.00758.x',url='https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3777640/',
    quote='"By Year 16, 46% of the couples had divorced or separated from their original spouse whereas 49% had remained married."',provenance='primary',caveats='Urban, high-risk sample.')

json.dump(R,open(sys.argv[1],'w'),indent=1,ensure_ascii=False)
print(len(R))
