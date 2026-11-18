# Programme: predicting Catholic, Protestant and Orthodox beliefs, practice and marriage outcomes from survey profiles

## Question

From the answers a Christian survey respondent did give, how well can we predict the ones they were not asked? That covers beliefs on marriage and sexuality, adherence to Catholic teaching, devotional practice and marriage outcomes. And do the learned associations hold across Catholic, Protestant and Orthodox subcultures, across decades, across countries and across immigrant generations?

It is open because the existing work does one of two things. It measures belief structure (belief networks, relational class analysis, latent classes) without asking how well that structure *predicts* a held-out answer. Or it imputes survey items (MICE, MissForest, Bayesian mixtures, LLM "silicon samples") without asking whether the imputation model learned on one religious subculture is valid for another. No published study we found reports held-out, survey-weighted prediction skill for religious-belief items by tradition and immigrant generation, with transfer tests between them.

## Why it matters

- **Survey designers and analysts** (GSS, Pew, ISSP, CARA and diocesan surveys) ask long religion modules on split ballots to save respondent time. Knowing which items can be imputed from which others tells them which questions they can rotate out, and where imputation would be biased for a subgroup such as immigrant Catholics.
- **Sociologists of religion** get a predictive test of claims about belief "packages": whether marriage beliefs, sexual morality, devotion and politics hang together the same way for Hispanic immigrant Catholics as for third-generation white Catholics or Evangelicals.
- **Church and pastoral researchers** get honest, uncertainty-labelled estimates of teaching adherence for groups too small to survey directly (small-area and small-group estimation), and an account of where those estimates should not be trusted.

## Scope and ethics

Religious belief is special-category data under GDPR Art. 9. The programme works only with anonymised public survey microdata, under each archive's terms. It reports population associations and imputes the planned missing answers of survey respondents. It does **not** build tools that infer an identifiable person's religion or beliefs from outside data (social media, purchase records, names), and the artefacts are not designed for screening or targeting people. "Prediction" here means filling a respondent's unasked survey item and measuring how wrong that is, never profiling a named person. Teaching-consistency codes come from the Catechism of the Catholic Church (https://www.vatican.va/archive/ENG0015/_INDEX.HTM, paragraph cited per item in `src/gss.py`). They describe agreement with a stated teaching, not a judgement of anyone's faith.

## Related work

DOIs and arXiv ids were checked with `research/_shared/cite_check.py` and the Crossref API on 2026-11-03. Six DOIs first written from memory were wrong and are corrected below.

*Measuring American religion and its change*
- Steensland, Park, Regnerus, Robinson, Wilcox and Woodberry (2000), "The Measure of American Religion", *Social Forces*, doi:10.2307/2675572. Defines the RELTRAD scheme we use for Protestant traditions. It classifies people; it does not predict belief.
- Hout and Fischer (2002), "Why More Americans Have No Religious Preference", *ASR*, doi:10.2307/3088891. GSS cohort and politics account of disaffiliation. It is descriptive and covers affiliation, not belief items.
- Voas and Chaves (2016), "Is the United States a Counterexample to the Secularization Thesis?", *AJS*, doi:10.1086/684202. Cohort decline in GSS attendance and belief. It gives aggregate trends, not individual-level prediction.
- Hadaway, Marler and Chaves (1993), "What the Polls Don't Show", *ASR*, doi:10.2307/2095948, and Brenner (2011), "Exceptional Behavior or Exceptional Identity?", *POQ*, doi:10.1093/poq/nfq068. Self-reported attendance is overreported. Our attendance target is a report, not a behaviour, and the two can differ by subgroup.

*Structure of belief systems*
- Goldberg (2011), "Mapping Shared Understandings Using Relational Class Analysis", *AJS*, doi:10.1086/657976. Finds groups that share a belief *structure*, not shared levels. It has no out-of-sample prediction test.
- Baldassarri and Goldberg (2014), "Neither Ideologues nor Agnostics", *AJS*, doi:10.1086/676042. Moral and economic belief packages differ across groups (including by religiosity) in ANES data. This motivates our H4, but it has no transfer test.
- Boutyline and Vaisey (2017), "Belief Network Analysis", *AJS*, doi:10.1086/691274. Belief networks and their central nodes. It is in-sample and has no held-out skill.
- DellaPosta (2020), "Pluralistic Collapse", *ASR*, doi:10.1177/0003122420922989. GSS attitudes increasingly cluster with partisanship over time. It predicts that temporal transfer degrades, which our temporal hold-out tests.

*Religion, marriage and immigration*
- Lehrer and Chiswick (1993), "Religion as a Determinant of Marital Stability", *Demography*, doi:10.2307/2061647, and Lehrer (2004), *Population and Development Review*, doi:10.1111/j.1728-4457.2004.00038.x. Religion and same- versus mixed-faith unions predict divorce. These are regression associations, without predictive validation.
- Van Tubergen (2006), "Religious Affiliation and Attendance Among Immigrants in Eight Western Countries", *JSSR*, doi:10.1111/j.1468-5906.2006.00002.x, and Massey and Higgins (2011), "The Effect of Immigration on Religious Belief and Practice", *Social Science Research*, doi:10.1016/j.ssresearch.2010.04.012. Migration changes attendance and belief. They model levels, not whether associations transfer.
- Ruiter and van Tubergen (2009), "Religious Attendance in Cross-National Perspective", *AJS*, doi:10.1086/603536. A multilevel model of attendance in 60 countries. It is the global baseline our cross-national milestone has to beat.

*Imputation of survey items*
- Rubin (1987), *Multiple Imputation for Nonresponse in Surveys*, doi:10.1002/9780470316696; van Buuren and Groothuis-Oudshoorn (2011), "mice", *J. Stat. Softw.*, doi:10.18637/jss.v045.i03. The standard framework. It assumes one imputation model fits all groups unless the analyst adds interactions.
- Stekhoven and Bühlmann (2012), "MissForest", *Bioinformatics*, doi:10.1093/bioinformatics/btr597; Grinsztajn, Oyallon and Varoquaux (2022), arXiv:2207.08815. Tree models are strong on tabular data. They motivate the boosted baseline.
- Si and Reiter (2013), *J. Educ. Behav. Stat.*, doi:10.3102/1076998613480394, and Murray and Reiter (2016), *JASA*, doi:10.1080/01621459.2016.1174132. Bayesian mixture imputation for categorical survey data. It is the strongest principled baseline for our milestone 3.
- Kim and Lee (2023), "AI-Augmented Surveys", arXiv:2305.09620, and Argyle et al. (2023), "Out of One, Many", *Political Analysis*, doi:10.1017/pan.2023.2. LLMs fine-tuned on or prompted with GSS profiles predict missing opinions. Neither checks religious subcultures or immigrant generations separately. A local-model baseline is milestone 5.

## Gap

The new contribution has three parts, narrow enough to check against the work above:

1. Held-out, survey-weighted prediction skill (AUC, log loss, calibration) for each teaching-consistency, devotion and marriage item, within each Christian tradition.
2. A *transfer* test of the learned associations between immigrant generations, traditions, decades and (later) countries, with paired intervals. Belief-network and class-analysis work describes structure but does not test transfer, and imputation work does not stratify by religious subculture.
3. An open, one-command artefact on public data.

Our own `research/marriage-divorce-evidence` modelled divorce with religion as one predictor. This programme reverses the direction (religion and belief as targets) and adds the transfer tests. The sibling programme `research/catholic-demography` (opened the same day, PR `duncan-haywood/oss-monorepo#12893`) estimates *levels* for Catholic subpopulations (fertility, retention, attendance) with design-based intervals. This programme asks the predictive question about individuals' unasked items. The two should share recodes once both land, and milestone 3's checks of imputed shares against asked ballots can use its estimator.

## Hypotheses

H1 to H4 are stated with their refutations in `LOG.md` (2026-11-03), before the first run. In short:

- **H1.** Sexual-morality items are predictable (AUC ≥ 0.75). Divorce law and ever-divorced are not (< 0.70).
- **H2.** Boosting adds under 0.01 AUC over logistic regression.
- **H3.** Associations transfer to first-generation Catholics (AUC loss ≤ 0.03), but levels do not.
- **H4.** Catholic-trained models transfer to white Protestant traditions better than to Black Protestants.
- **H5** (milestone 4). The cross-national ranking skill of a model from one country falls with the distance between countries' religious contexts, measured as the gap in national attendance (Ruiter and van Tubergen 2009). *Refuted if* the transfer loss is unrelated to that gap across country pairs.

## Method

- **Data.** GSS 1972–2024 (NORC; US, all traditions, immigrant generation from `born`/`parborn`, Hispanic origin from 2000). Later: Pew Religious Landscape Study 2014 and 2023–24, EVS/WVS and ISSP religion modules (1991, 1998, 2008, 2018) for global and Orthodox coverage, and Canada's GSS.
- **Targets.** Binary teaching-consistency items, practice levels and marriage outcomes (`src/gss.py`). Ordinal versions come in milestone 3.
- **Models.** A decade prior, L2 logistic regression, gradient boosting, then chained-equation and Bayesian-mixture imputation, a hierarchical model pooling across traditions, and a local LLM baseline.
- **Theory** (milestone 6). Bound the error of a transferred imputation model by the source in-group error plus a term in the shift of the conditional distribution, estimated from the paired transfer gaps. Then test whether the bound orders subgroup pairs correctly.

## Evaluation

- Respondent-level 5-fold cross-validation and temporal hold-outs (train ≤ 2014, test 2016–2024, which spans the 2021 web-mode change).
- Weighted AUC, log loss and Brier, with paired bootstrap 95% intervals.
- Calibration-in-the-large for each subgroup.
- Ablations: drop politics, drop demographics, drop the other belief items.
- Baselines: the published-tables prior, MICE (logistic per item), MissForest-style boosting and Murray–Reiter mixtures.
- Seeds: 3 fold seeds from milestone 2.

## Milestones

1. **US core (session 1).** GSS within-tradition cross-validation, temporal hold-out, generation and tradition transfer, permutation importance (`experiments/m1_imputation/`).
2. Multiple fold seeds, calibration plots, ablations (politics out), and Hispanic versus non-Hispanic first-generation Catholics.
3. Full multiple-imputation baselines (MICE, mixtures). Check that imputed GSS teaching-adherence shares match those from the ballots that asked the item.
4. Global: register for and load EVS/WVS and ISSP religion modules (owner step: data archives require a named registration). Test transfer across countries, and Orthodox coverage from Eastern Europe.
5. A local-LLM imputation baseline (an open-weights model, no paid API) against the tabular models.
6. The transfer bound, and the paper draft.

## Target venue

*Journal for the Scientific Study of Religion* (the field's journal; about 8,000–10,000 words), or *Sociological Methods & Research* for the methods paper. Submitting is an owner step.

## Application

This is not a deep-tech programme. It was opened on the owner's direct request (2026-11-03), and it sits with `religion-origins` in the humanities theme. The practical users are survey designers deciding which religion items to rotate, and researchers needing small-group estimates. The number it moves is the error of an imputed teaching-adherence share for a subgroup. To try it on the real thing: rerun on a diocesan or CARA survey with the same items.
