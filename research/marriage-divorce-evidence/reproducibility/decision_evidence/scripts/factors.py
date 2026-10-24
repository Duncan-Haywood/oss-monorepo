"""Evidence grade for every modifiable factor the app lets a person change.

`strongest_design` is the strongest design that estimates an effect of THIS factor on divorce or
separation (designs that reach only another outcome are listed under `evidence` with their
outcome and do not raise the grade). Scale, strongest first:
  experimental > quasi_experimental > prospective_observational_adjusted > cross_sectional.
`evidence` refs: 'decision:<id>' = reproducibility/decision_evidence/evidence.json,
'literature:<id>' = reproducibility/literature_evidence/evidence.json. build.py copies each
ref's numbers, citation and quote from those verified files (nothing is retyped here) and fails
if a ref is missing or unverified. A '#indirect' suffix marks evidence in which the factor itself
was not what was randomised or varied (e.g. a randomised programme with the factor as a
non-randomised moderator); it is listed but does not set the grade.
"""

GRADES = ['experimental', 'quasi_experimental', 'prospective_observational_adjusted', 'cross_sectional']

FACTORS = [
    {
        'factor': 'age_at_marriage', 'label': 'Age / timing of marriage',
        'decision': 'Timing a marriage: marrying later rather than sooner',
        'app_inputs': ['age at marriage (from ages and years married)', 'couple what-if: timing of the wedding'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'later marriage, lower risk (steepest below the early twenties, flattening after about 25-28)',
        'size': 'Teen marriage roughly doubles or more the hazard relative to marrying in the early-to-mid twenties (adjusted HR 2.42 for 18 or younger vs 22-24; this project 2.63 at 17 vs about 23). Beyond the late twenties the gains are small.',
        'causal_reading': 'Consistent across many cohorts and surveys after adjustment, so waiting past the teens and early twenties is a reasonable bet, but no experiment or instrument estimates the effect on divorce itself. The only quasi-experimental study (state marriage-age laws) shows teen marriage causes later poverty, not divorce.',
        'gaps': 'No quasi-experimental estimate of age at marriage on divorce found; selection (maturity, partner quality, pregnancy) remains plausible.',
        'evidence': ['literature:Martin2006_agemarr_le18', 'literature:Killewald2016_under21_post1975', 'literature:Manning2012_agemarr_W',
                     'decision:Project_NSFG_age_RR', 'decision:Rotz2016_age_at_marriage_decline', 'decision:Dahl2010_teen_marriage_IV_poverty'],
    },
    {
        'factor': 'education_completion', 'label': 'Finishing education (degree before marriage)',
        'decision': 'Finishing a degree before marrying; choosing a partner by education',
        'app_inputs': ['highest degree (you / partner)', 'what-if: highest degree'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'more education, lower risk',
        'size': "A bachelor's degree is associated with roughly 30-40% lower hazard after adjustment (this project 0.63; Killewald 2016: wife 0.71, husband 0.57).",
        'causal_reading': 'Robust association; how much is education itself versus the traits and circumstances that lead to college is not identified.',
        'gaps': 'No natural-experiment estimate of schooling on divorce found.',
        'evidence': ['decision:Project_NSFG_degree_RR', 'literature:Killewald2016_wifecollege_post1975', 'literature:Killewald2016_husbcollege_post1975', 'literature:Manning2012_college_W'],
    },
    {
        'factor': 'cohabitation_before_marriage', 'label': 'Living together before marriage',
        'decision': 'Cohabiting first, and whether to do so before or after engagement',
        'app_inputs': ['couple: lived together before marrying', 'couple what-if: live together / do not'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'near null in recent cohorts; higher risk mainly for cohabiting before a commitment to marry or with several prior partners',
        'size': 'Adjusted estimates range from about no difference (this project 1.01, adjusted; Manning & Cohen 1.03, zero-order) to modestly higher (Killewald 2016: OR 1.29); cohabiting after engagement 0.57.',
        'causal_reading': 'No randomised or natural-experiment evidence. A selection model finds dissolution-prone people select into cohabiting, and adjusted estimates shrink toward zero in recent cohorts, so cohabiting itself is unlikely to change risk much. In the Army PREP trial, couples who had cohabited before committing divorced more only without the programme.',
        'gaps': 'No experiment or instrument on cohabitation timing found.',
        'evidence': ['decision:Project_NSFG_cohab_RR', 'literature:Manning2012_cohab_W_zero', 'literature:Manning2012_cohab_engaged_W', 'literature:Killewald2016_cohab_post1975',
                     'literature:Rosenfeld2019_cohab_firstyear', 'decision:Lillard1995_cohab_selection', 'decision:Rhoades2015_PREP_x_precommitment_cohab#indirect'],
    },
    {
        'factor': 'premarital_birth_timing', 'label': 'Having a child before marriage',
        'decision': 'Timing a first birth relative to the wedding',
        'app_inputs': ['first birth before marriage / children from before'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'birth before marriage, higher risk',
        'size': 'Adjusted hazard ratios about 1.2-1.4 (Martin 2006: 1.41; this project 1.20; Killewald 2016: 1.24, CI includes 1).',
        'causal_reading': 'Associations only; partly reflects who has premarital births and why they marry.',
        'gaps': 'No quasi-experimental estimate found.',
        'evidence': ['literature:Martin2006_premaritalbirth', 'decision:Project_NSFG_premarital_birth_RR', 'literature:Killewald2016_premaritalbirth_post1975'],
    },
    {
        'factor': 'religious_attendance', 'label': 'Religious attendance',
        'decision': 'Attending religious services (and choosing a partner who does)',
        'app_inputs': ['religious attendance (you / partner)', 'what-if: religious attendance'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'more attendance, lower risk',
        'size': 'Couples with a non-religious spouse: OR 1.29 (prospective PSID); regular vs never attenders: HR 0.63 (retrospective survey).',
        'causal_reading': 'Associations; attendance travels with values about divorce, community and partner selection. Starting to attend to lower risk is not tested.',
        'gaps': 'No experimental or quasi-experimental evidence; religious premarital programmes have no randomised divorce outcome that we found.',
        'evidence': ['literature:Killewald2016_notreligious_post1975', 'literature:FTM2015_relig_regular'],
    },
    {
        'factor': 'income_employment', 'label': 'Income and employment',
        'decision': 'Job stability, earnings, and income support',
        'app_inputs': ['wages / family income (what-if ±25%)', 'work hours'],
        'strongest_design': 'experimental',
        'direction': 'mixed: job loss raises risk modestly; extra income alone shows little effect',
        'size': 'Welfare work-incentive trial: −3.5 points divorce over 7 years for two-parent recipient families, none for applicants. Plant-closure job loss: +18% (CI includes no effect) in Sweden, no detectable effect in the US; lottery windfalls of $25-50k: no change. Prospective: husband full-time employment OR 0.75; income per $1,000 OR 1.00.',
        'causal_reading': "Randomised and natural-experiment evidence exists but is narrow. It does not support 'more money, fewer divorces' as a general rule; a husband's employment matters more than income in prospective data.",
        'gaps': 'Experimental evidence limited to low-income welfare populations; no trial of earnings for middle-income couples.',
        'evidence': ['decision:MFIP2003_recipients_divorce', 'decision:SIMEDIME_income_maintenance_contested', 'decision:Eliason2012_establishment_closure',
                     'decision:CharlesStephens2004_plant_closure', 'decision:HankinsHoekstra2011_lottery', 'literature:Killewald2016_husbandFT_post1975',
                     'literature:Killewald2016_income_post1975', 'decision:Project_SIPP_wealth_adds_nothing'],
    },
    {
        'factor': 'debt_finances', 'label': 'Debt, wealth and money conflict',
        'decision': 'Paying down debt, building savings, agreeing on money',
        'app_inputs': ['net worth / debt / home ownership (SIPP couples lens)'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'raw gradients steep; little independent effect once other traits and money disagreements are known',
        'size': 'Separation 24.4 vs 4.9 per 1,000 couple-years (negative net worth vs $1M+), but finances add nothing to held-out prediction (−0.79 points). Financial disagreements, not financial well-being, predict divorce in NSFH.',
        'causal_reading': 'No causal evidence that reducing debt lowers divorce risk; money conflict is a marker of relationship process.',
        'gaps': 'No randomised financial-stress or financial-education trial with a divorce outcome found.',
        'evidence': ['decision:Project_SIPP_wealth_adds_nothing', 'decision:Dew2012_financial_disagreements'],
    },
    {
        'factor': 'relationship_education', 'label': 'Relationship / premarital education',
        'decision': 'Taking a relationship-education or premarital programme',
        'app_inputs': ['not a model input: shown as an evidence-based option alongside the estimate'],
        'strongest_design': 'experimental',
        'direction': 'mixed: lower divorce in some trials, null in the two largest federal trials',
        'size': 'Army PREP: 7.6% vs 11.9% divorced at 2 years (8.1% vs 14.9% at the higher-risk site, null at the other); engaged/newlywed trial: 11% vs 24% dissolved at 3 years, but a one-session film-discussion arm did as well as skills training. Building Strong Families (unmarried new parents): 57.4% vs 60.5% still together at 3 years; Supporting Healthy Marriage (low-income married): 81.5% vs 81.5%. Meta-analyses: small quality gains (d about 0.06-0.36), no significant stability effect across ACF-funded programmes.',
        'causal_reading': 'The best-tested option in this list. Expect small gains in relationship quality; a lower divorce risk is plausible for some higher-risk married couples but is not reliable across programmes or populations.',
        'gaps': 'Few trials follow divorce beyond 2-3 years; most participants are white and middle-class except in the federal trials.',
        'evidence': ['decision:Stanley2014_PREP_Army_2yr_pooled', 'decision:Stanley2014_PREP_Army_2yr_site1', 'decision:Stanley2010_PREP_Army_1yr', 'decision:Rogge2013_PREP_CARE_RA_3yr',
                     'decision:BSF2012_36mo_romantic', 'decision:SHM2014_30mo_married', 'decision:Hawkins2008_MRE_meta', 'decision:HawkinsErickson2015_lowincome_meta',
                     'decision:Hawkins2022_ACF_meta_stability', 'decision:CarrollDoherty2003_premarital_meta', 'decision:Stanley2006_premarital_survey'],
    },
    {
        'factor': 'counselling_therapy', 'label': 'Couples counselling / therapy',
        'decision': 'Seeking couple therapy when distressed',
        'app_inputs': ['not a model input: shown as an evidence-based option alongside the estimate'],
        'strongest_design': 'experimental',
        'direction': 'better relationship satisfaction; effect on divorce vs no therapy not established',
        'size': 'Behavioural couple therapy vs no treatment: d = 0.585 (30 RCTs). After 5 years, about 1 in 4 seriously distressed couples had separated after either of two good therapies (25.7% IBCT, 27.9% TBCT); about half improved meaningfully.',
        'causal_reading': 'Strong evidence that therapy improves satisfaction for distressed couples; no trial compares divorce with an untreated group over years, so a divorce-risk number for therapy would be invented.',
        'gaps': 'No long-term RCT with an untreated control and a divorce outcome found; no model has strong support by Chambless criteria.',
        'evidence': ['decision:ShadishBaldwin2005_BMT_meta', 'decision:Roddy2020_couple_therapy_meta', 'decision:Christensen2010_IBCT_TBCT_5yr',
                     'decision:Johnson1999_EFT_meta_secondhand', 'decision:Jackson2026_EST_review'],
    },
    {
        'factor': 'conflict_behaviour', 'label': 'Conflict behaviour',
        'decision': 'Changing how you argue (destructive conflict, hostility, money fights)',
        'app_inputs': ['optional questions: destructive conflict (literature adjustment)', 'newlywed lens: hostility and conflict questions'],
        'strongest_design': 'prospective_observational_adjusted',
        'direction': 'more destructive conflict, higher risk',
        'size': "Husband's destructive conflict at year 1: HR 4.28 per scale point (time-varying); wife's 1.51. Changing conflict through skills training: SHM reduced negative behaviour without changing stability; skills training did no better than a one-session awareness arm.",
        'causal_reading': 'Destructive conflict is a strong prospective marker. Experiments that change conflict skills improve communication but have not shown that this is what lowers divorce.',
        'gaps': 'Gottman-style accuracy claims are in-sample (see literature evidence); no trial isolates conflict change as the mechanism.',
        'evidence': ['literature:Birditt2010_destructive_husband', 'literature:Birditt2010_destructive_wife', 'decision:Dew2012_financial_disagreements',
                     'decision:Rogge2013_PREP_CARE_RA_3yr#indirect', 'decision:Markman1993_PREP_5yr#indirect', 'decision:SHM2014_30mo_happiness#indirect'],
    },
]
