# Research algorithms as free tools

Graduate- and research-level algorithms from published papers, implemented
as tools that run on the user's own data, in the browser, from the command
line or from an AI agent, with the paper credited on every surface. Where a
tool runs is the agent's call for the method (owner, 2026-10-30; `goals.md`,
"Direction: every platform"): the browser is a good default, not a rule.

Why (owner, 2026-10-20): "i want to move more into in browser ml run tools
that are actually useful [...] let's either give people access to advanced
graduate level plus algorithms or ml applications drawn from real data.
abiding by licenses obviously. [...] looking at open papers and pulling those
from wide domains and implementing them as publically available tools
obviosuly giving credit and citing it." The full quote is in
[`prompts/goals.md`](../../prompts/goals.md), "Direction: research algorithms
as tools".

## What qualifies

- **A method from a paper**, peer-reviewed or on arXiv, beyond what an
  undergraduate course or a spreadsheet gives you (changepoint posteriors,
  conformal guarantees, matrix profiles, optimal transport, survival models,
  causal estimators, ...). Any field.
- **A job a practitioner has, on their own data.** "Did this series shift,
  and when?" beats "a demo of algorithm X". Each tool takes a pasted or
  uploaded CSV, ships a real public dataset as its example, and answers in
  words as well as numbers.
- **Free to run, for us.** No per-call cost on the owner's accounts. Pure
  JavaScript or WebAssembly in the tab is the easy path and gets the Pages
  site, the extension and the app packagers for free. When a method is
  better as a Python package, a CLI, a GPU job or a service the user runs,
  ship it that way. Small ML models are fine when their weights are openly
  licensed.

## Licences and credit

- Implement from the paper's mathematics. Algorithms are not copyrightable;
  code is. Port code only when its licence is MIT, BSD or Apache-2.0, and
  keep its notice beside the port. Never port GPL, AGPL or "research use
  only" code into this MIT tree.
- If a method is known to be patented, say so in the README and skip it
  unless the patent has expired.
- Example data must be public domain or under an open licence that allows
  redistribution (CC0, CC BY, ODbL, US-government works). Record source,
  licence and retrieval date in `data/SOURCE.md`, and cite it on the page.
- Every tool cites its papers in four places: the engine's exported
  `PAPERS` constant (which `platform/agents/tools.mjs describe` prints), the
  page (a "Method and citation" section with BibTeX), the CLI's `--help`, and
  the README.

## What a tool ships (definition of done)

| File | What it holds |
| --- | --- |
| `engine.mjs` (or the engine in the language that fits) | Pure functions, no DOM, no hidden network calls, seeded randomness only. Exports `PAPERS` (`[{ authors, title, venue, year, url, doi?, implemented, deviations }]`), `DEFAULTS`, and a top-level `analyze(input)` that returns a JSON-serialisable result with a plain-language `summary`. |
| `cli.mjs` | Zero-dependency CLI: CSV file or stdin in, human text or `--json` out, `--help` with the citation. This makes the tool eligible for the npm, Homebrew, container and MCP packagers in `platform/distribution/`. |
| `index.html` | CSV paste/upload, "Load example" with the real dataset, an inline-SVG chart, the result in words, "Method and citation" with BibTeX, limits, FAQ JSON-LD, disclaimer, usage counters (`usage.mjs`). If it runs in the page, nothing is uploaded; if the tool is not a browser tool, this is its home/marketing page with install and usage instead. |
| `data/` | The example dataset and `SOURCE.md` (source URL, licence, retrieval date). |
| `README.md`, `VENTURE.yaml`, `LICENSE` | As for any venture; the README opens with what the tool answers, in a searcher's words, links the live page, and has a "Verification" section. |
| `*.test.mjs` | Tests against a **published or independently computed reference** (the paper's own example, a textbook result, or another implementation's output with its provenance), plus property tests (invariances, edge cases), plus `page.test.mjs`. |

As soon as the page exists, run `node platform/pages/register-tool.mjs <slug> --research`
(about 10 s). It adds the slug to build.mjs's `RESEARCH_ALGORITHM_SLUGS`, the
launch date to `launched.json` and the usage module to
`platform/privacy/optout-switches.txt`, and lists what needs words: the row in
the table below, an inbound link from a sibling tool's page, and any CSV
formula-guard or row-spread hit in this venture. Six run records (2026-11-14 to
-17) found these one red CI job at a time.

Before merging a new tool, run `node platform/pages/venture-preflight.mjs <slug>`: it
catches the repository-wide steps a tool's own tests cannot see (the launch date in
`launched.json`, a link from a sibling tool, the privacy-switch count), each of which
otherwise surfaces as a red CI job (run record, 2026-11-14).

Agents get each tool for free: `node platform/agents/tools.mjs search
changepoint`, `describe <slug>` (prints `PAPERS`), `call <slug> analyze
--input '{...}'`, and the same through the MCP server. The page is eligible
for the browser-extension, iOS and Android packagers.

## Tools

| Tool | Papers | Answers |
| --- | --- | --- |
| [`changepoint-detector`](../../ventures/changepoint-detector/) | Adams & MacKay 2007; Killick, Fearnhead & Eckley 2012 | Did this series change level or volatility, when, and how sure? |
| [`conformal-prediction-intervals`](../../ventures/conformal-prediction-intervals/) | Lei et al. 2018; Romano, Patterson & Candès 2019 | How wide must a prediction interval be to cover 90% of new cases, with no distributional assumption? |
| [`matrix-profile-explorer`](../../ventures/matrix-profile-explorer/) | Yeh et al. 2016; Zhu et al. 2016 | Which stretch of this series repeats (motif), and which is unlike anything else (discord)? |
| [`survival-analysis`](../../ventures/survival-analysis/) | Kaplan & Meier 1958; Mantel 1966; Cox 1972; Efron 1977; Grambsch & Therneau 1994 | How long until the event, do groups differ, and by what hazard ratio once covariates are adjusted for? |
| [`fdr-multiple-testing`](../../ventures/fdr-multiple-testing/) | Benjamini & Hochberg 1995; Benjamini & Yekutieli 2001; Benjamini, Krieger & Yekutieli 2006; Storey 2002; Wang & Ramdas 2022; Javanmard & Montanari 2018; Ramdas, Yang, Wainwright & Jordan 2017; Ramdas, Zrnic, Wainwright & Jordan 2018 | I ran many tests: which results still stand, at a chosen false discovery rate or family-wise error rate? And when tests arrive one at a time, which do I keep before the next one comes? |
| [`synthetic-control`](../../ventures/synthetic-control/) | Abadie & Gardeazabal 2003; Abadie, Diamond & Hainmueller 2010, 2015; Abadie 2021 | Did this intervention change one unit's outcome, by how much, and is the gap unusual against placebo runs on every donor? |
| [`stl-decomposition`](../../ventures/stl-decomposition/) | Cleveland, Cleveland, McRae & Terpenning 1990; Cleveland 1979; Wang, Smith & Hyndman 2006; Bandara, Hyndman & Bergmeir 2021 (MSTL) | Is it the season or the trend: what are this series' trend, seasonal pattern (or daily, weekly and yearly patterns at once) and remainder, and which points stand out from both? |
| [`fuzzy-dedupe`](../../ventures/fuzzy-dedupe/) | Fellegi & Sunter 1969; Winkler 1988, 1990; Jaro 1989 | Which rows of this contact or customer file are the same person, even spelled differently, and what does the merged file look like? |
| [`spc-control-charts`](../../ventures/spc-control-charts/) | Shewhart 1931; Nelson 1984; Tippett 1925; Bissell 1990; Rigdon, Cruthis & Champ 1994 | Has this process changed or is it noise: which points break which run rule, are the subgroups hiding batch-to-batch variation, and is Cpk worth quoting? |
| [`isolation-forest`](../../ventures/isolation-forest/) | Liu, Ting & Zhou 2008, 2012 | Which rows of this table are unusual across all their numeric columns at once, how unusual, and which columns make each one stand out? |
| [`gaussian-process-regression`](../../ventures/gaussian-process-regression/) | Rasmussen & Williams 2006; Liu & Nocedal 1989; MacKay 1998 | What smooth curve runs through these points, how sure is it at each x, what are its length scale, period and noise in my units, which kernel do the data favour, and how honest is the band? |
| [`wasserstein-distance`](../../ventures/wasserstein-distance/) | Cuturi 2013; Altschuler, Weed & Rigollet 2017; Peyré & Cuturi 2019; Székely & Rizzo 2013 | How far apart are two groups' distributions in my units, what moved up and what moved down, and across several columns, how far by optimal transport, with a certified range on the exact value? |
| [`ranked-ballot-counter`](../../ventures/ranked-ballot-counter/) | Schulze 2011; Droop 1881 | Who won our ranked-choice vote: by instant runoff, by STV for several seats, and by Schulze, and is there a candidate who beats every other head to head? |
| [`assembly-line-balancer`](../../ventures/assembly-line-balancer/) | Sewell & Jacobson 2012; Scholl & Klein 1997; Jackson 1956; Helgeson & Birnie 1961 | How few stations can this line run on at takt (or how short a cycle on the stations I have), and is that proved optimal or only the best found? |
| [`job-shop-scheduler`](../../ventures/job-shop-scheduler/) | Nowicki & Smutnicki 1996; Taillard 1994; Giffler & Thompson 1960; Carlier 1982 | Which order should each machine run its jobs in so the last one finishes soonest, and how far from the best possible is that schedule? |
| [`robust-pca`](../../ventures/robust-pca/) | Candès, Li, Ma & Wright 2011; Lin, Chen & Ma 2010; Hestenes 1958 | Which cells of this table break the pattern the rows share, by how much, what should the empty cells be, and how close to optimal is that split? |
| [`lomb-scargle-periodogram`](../../ventures/lomb-scargle-periodogram/) | Lomb 1976; Scargle 1982; Zechmeister & Kürster 2009; Baluev 2008; VanderPlas 2018 | Which periods are in these unevenly spaced measurements, could the strongest be noise, is there another once it is removed, and is any of them an alias of the sampling? |
| [`mann-kendall-trend`](../../ventures/mann-kendall-trend/) | Mann 1945; Kendall 1975; Sen 1968; Hamed & Rao 1998; Yue & Wang 2004; Yue, Pilon, Phinney & Cavadias 2002; Hirsch, Slack & Smith 1982; Hirsch & Slack 1984; van Belle & Hughes 1984 | Is this series going up or down, by how much per year with what interval, does that survive the correlation between readings, and with a seasonal cycle, do all the seasons share the trend? |
| [`inter-rater-agreement`](../../ventures/inter-rater-agreement/) | Krippendorff 2004, 2011; Hayes & Krippendorff 2007; Cohen 1960, 1968; Fleiss, Cohen & Everitt 1969; Fleiss 1971; Gwet 2008; Shrout & Fleiss 1979; McGraw & Wong 1996 | Do my raters, coders or annotators agree beyond chance, with what interval, which category and which rater pull agreement down, and for numeric scores, which intraclass correlation fits the design? |
| [`probability-calibration`](../../ventures/probability-calibration/) | Dimitriadis, Gneiting & Jordan 2021; Ayer et al. 1955; Brier 1950; Murphy 1973; Spiegelhalter 1986; Cox 1958; Naeini, Cooper & Hauskrecht 2015 | When these forecasts said 70%, did it happen 70% of the time: a bin-free reliability diagram, the Brier and log scores split into miscalibration, discrimination and uncertainty, and a recalibration map? |
| [`hdbscan-clustering`](../../ventures/hdbscan-clustering/) | Campello, Moulavi & Sander 2013; Campello, Moulavi, Zimek & Sander 2015; McInnes & Healy 2017 | Which groups are in this table, how many, which rows belong to none, and what sets each group apart? |
| [`kalman-smoother`](../../ventures/kalman-smoother/) | Durbin & Koopman 2012; Koopman 1997; Harvey 1989; Harvey & Koopman 1992; de Jong & Penzer 1998 | What is the real level under this noisy series and how sure is it, what are the missing values, where is it heading, and which points are one-off outliers and which are level shifts? |
| [`extreme-value-analysis`](../../ventures/extreme-value-analysis/) | Coles 2001; Jenkinson 1955; Pickands 1975; Davison & Smith 1990; Hosking, Wallis & Wood 1985; Hosking 1990 | How big is the 100-year flood, gust or load, how much higher could it plausibly be, is the tail heavy or bounded, and has the level drifted over the record? |
| [`dynamic-time-warping`](../../ventures/dynamic-time-warping/) | Sakoe & Chiba 1978; Itakura 1975; Giorgino 2009; Tormene, Giorgino, Quaglini & Stefanelli 2009; Müller 2007 | How alike are these two series once timing can stretch, where does one run ahead of the other and is that gap timing or level, and where in a long series does this short pattern recur? |
| [`meta-analysis`](../../ventures/meta-analysis/) | DerSimonian & Laird 1986; Viechtbauer 2005; Paule & Mandel 1982; Knapp & Hartung 2003; Higgins & Thompson 2002; Viechtbauer 2007; Riley, Higgins & Deeks 2011; Egger et al. 1997; Hedges 1981 | What do these studies say together, how much do they disagree, where would the next study land, and does a study-level variable explain the differences? |
| [`cost-sharing-calculator`](../../ventures/cost-sharing-calculator/) | Shapley 1953; Schmeidler 1969; Maschler, Peleg & Shapley 1979; Young, Okada & Hashimoto 1982; Littlechild & Owen 1973; Aumann & Maschler 1985; O'Neill 1982 | Who should pay what for something we share, would any subgroup pay less on its own, how should neighbours split a private road, and how do you divide an estate that cannot pay every claim? |
| [`stable-matching`](../../ventures/stable-matching/) | Gale & Shapley 1962; McVitie & Wilson 1971; Gusfield & Irving 1989; Irving, Leather & Gusfield 1987; Gusfield 1987; Roth 1982, 1984, 1986; Dubins & Freedman 1981 | Who should be matched with whom so no pair would rather have each other, how many stable answers are there and which is fairest to both sides, and is the matching I made by hand stable? |
| [`kriging-interpolation`](../../ventures/kriging-interpolation/) | Matheron 1963; Krige 1951; Cressie & Hawkins 1980; Cressie 1985; Dubrule 1983; Shepard 1968; Gneiting 2013 | What is the value between my sample points and how sure is it, what are my data's nugget, sill and range, does kriging beat inverse distance here, and which readings disagree with their neighbours? |
| [`scale-reliability`](../../ventures/scale-reliability/) | Cronbach 1951; Guttman 1945; McDonald 1999; Feldt, Woodruff & Salih 1987; Kelley & Pornprasertmanit 2016; Efron 1987; Sijtsma 2009; Spearman 1910; Brown 1910 | Is my questionnaire scale reliable, with what interval, does omega tell a different story from alpha, which items pull it down, and did I forget to reverse one? |
| [`item-response-theory`](../../ventures/item-response-theory/) | Bock & Aitkin 1981; Birnbaum 1968; Rasch 1960; Orlando & Thissen 2000; Lord & Wingersky 1984; Bock & Mislevy 1982; Thissen et al. 1995 | Which questions on my test work, how hard is each and how well does it separate strong from weak, does a question misfit, is a key wrong, and where is the test precise? |
| [`difference-in-differences`](../../ventures/difference-in-differences/) | Callaway & Sant'Anna 2021; Goodman-Bacon 2021; Card & Krueger 1994 | Did a change adopted at different times move the outcome, by how much at each time since adoption, were the adopters already drifting apart before, and how much of the usual two-way fixed effects estimate compares late adopters with units already treated? |
| [`method-comparison`](../../ventures/method-comparison/) | Passing & Bablok 1983; Cornbleet & Gochman 1979; Linnet 1990, 1993; Bland & Altman 1986, 1999; Knight 1966; Sen 1968; Dillencourt, Mount & Netanyahu 1992 | Do two measurement methods agree, is the difference constant or proportional, what are the limits of agreement, and how far apart are they at a decision level? |
| [`regression-discontinuity`](../../ventures/regression-discontinuity/) | Calonico, Cattaneo & Titiunik 2014; Calonico, Cattaneo & Farrell 2020; McCrary 2008; Cattaneo, Titiunik & Vazquez-Bare 2017; Lee 2008 | Did crossing a threshold of a score, income, age or vote margin change the outcome, by how much for units near it, with an interval that accounts for the fit's bias, and does the design survive other bandwidths, placebo cutoffs, covariates and a bunching test? |
| [`contingency-table-tests`](../../ventures/contingency-table-tests/) | Fisher 1935; Freeman & Halton 1951; Mehta & Patel 1983; Barnard 1945; Boschloo 1970; Lancaster 1961; Lydersen, Fagerland & Laake 2009; Pearson 1900; Yates 1934; Haberman 1973; Mantel & Haenszel 1959; Robins, Breslow & Greenland 1986; Tarone 1985; McNemar 1947; Newcombe 1998; Katz et al. 1978; Woolf 1955 | Do these two groups' proportions differ when the counts are small, which exact test loses least power, how big is the odds ratio or risk difference, does the association survive splitting by site or department, and did paired before-and-after answers change? |
| [`propensity-score`](../../ventures/propensity-score/) | Rosenbaum & Rubin 1983; Lunceford & Davidian 2004; Robins, Rotnitzky & Zhao 1994; Abadie & Imbens 2006; Austin 2009, 2011; Crump, Hotz, Imbens & Mitnik 2009 | What did a treatment people chose do to the outcome once the measured differences between who chose it and who did not are accounted for, for everyone and for the treated, by weighting, regression, a doubly robust estimate and matching, and did the adjustment balance the covariates? |
| [`instrumental-variables`](../../ventures/instrumental-variables/) | Theil 1953; Anderson & Rubin 1949; Fuller 1977; White 1980; Staiger & Stock 1997; Montiel Olea & Pflueger 2013; Lee, McCrary, Moreira & Porter 2022; Shea 1997; Sargan 1958; Hansen 1982; Durbin 1954; Hausman 1978 | What does a regressor that people chose do to the outcome, using instruments that move it and reach the outcome only through it, are the instruments strong enough, what interval is still valid if they are weak, do several instruments agree, and is IV needed at all? |
| [`gage-rr`](../../ventures/gage-rr/) | Montgomery & Runger 1993; Burdick, Borror & Montgomery 2003; Ting et al. 1990; Graybill & Wang 1980; AIAG MSA 4th ed. 2010 | Can this gauge tell the parts apart: how much of the measured variation is the gauge (repeatability), who used it (reproducibility) and the parts themselves, against the tolerance, with how much uncertainty from a study of ten parts and three operators, including destructive (nested) studies? |
| [`conjoint-analysis`](../../ventures/conjoint-analysis/) | McFadden 1974; Louviere & Woodworth 1983; Kuhfeld, Tobias & Garratt 1994; Huber & Zwerina 1996; Train 2009 | Which product features do buyers trade price for, how much would they pay for each, what share would a configuration win against rivals, and how should the choice survey be designed and sized to tell? |
| [`capture-recapture`](../../ventures/capture-recapture/) | Otis et al. 1978; Darroch 1958; Chapman 1951; Seber 1982; Chao 1987; Burnham & Overton 1978; Akaike 1974 | How many animals (or defects, or cases) are there, counting the ones never caught: Lincoln-Petersen and Chapman from two samples, M0, Mt and Mb with profile-likelihood intervals and AIC from capture histories, and Chao and the jackknife when animals differ in catchability? |
| [`heckman-selection`](../../ventures/heckman-selection/) | Heckman 1979; Greene 1981; Heckman 1974; White 1982; Liang & Zeger 1986; Puhani 2000 | What do the regressors do to an outcome seen only for selected units (wages for people in work, losses for approved loans), is there selection bias (rho), and is the correction identified by a real exclusion restriction: probit, OLS on the selected rows, the two-step with corrected errors and maximum likelihood side by side? |
| [`spatial-autocorrelation`](../../ventures/spatial-autocorrelation/) | Moran 1950; Geary 1954; Cliff & Ord 1981; Getis & Ord 1992; Ord & Getis 1995; Anselin 1995; Sokal, Oden & Thomson 1998; Benjamini & Hochberg 1995 | Are high values next to high values on this map, where are the clusters, outliers and hot spots, and which of them survive a multiple-testing correction: Moran's I, Geary's C and General G with two-sided permutation p-values, local Moran (LISA), Gi* and a correlogram, from coordinates or a neighbour list? |
| [`pairwise-ranking`](../../ventures/pairwise-ranking/) | Bradley & Terry 1952; Zermelo 1929; Ford 1957; Davidson 1970; Davidson & Beaver 1977; Hunter 2004 | Who is really the strongest team, player or option from head-to-head results, how sure is the order, how much is home advantage worth, how often do equal sides draw, and what are the chances in this pairing? And when one group never lost, why is there no ranking at all? |
| [`species-diversity`](../../ventures/species-diversity/) | Hill 1973; Chao 1984, 1987; Chao & Lee 1992; Chao & Jost 2012; Chao, Wang & Jost 2013; Chao et al. 2014 | How many species are there, counting the ones not found yet, and is this site really richer than that one or just sampled harder (compared at equal sample coverage)? |
| [`roc-analysis`](../../ventures/roc-analysis/) | DeLong, DeLong & Clarke-Pearson 1988; Sun & Xu 2014; Hanley & McNeil 1982; Youden 1950; Wilson 1927; Simel, Samsa & Matchar 1991; McClish 1989; Vickers & Elkin 2006 | How well does this test, marker or model tell cases from non-cases, is it really better than that one on the same people (DeLong's paired test), where should the cut-off go, and over which risk thresholds is the model worth using? |
| [`ordinal-regression`](../../ventures/ordinal-regression/) | McCullagh 1980; Walker & Duncan 1967; Brant 1990; McFadden 1974; Agresti 2010 | What pushes a rating, a Likert answer, a grade or a stage up or down the scale, by how much (odds ratios per unit and per SD), what is the chance of each level for a given profile, and does one odds ratio really hold at every cut of the scale (Brant's test with the per-cut slopes)? |

The site files them under "Research algorithms & ML"
(`platform/pages/build.mjs`, `research-algorithms`). Add a row here and the
slug there when a tool lands.

## Candidates

Next papers to implement, each a job someone has: covariate-adjusted RD (Calonico, Cattaneo, Farrell & Titiunik 2019), the rddensity test (Cattaneo, Jansson & Ma 2020) and local randomisation inference for discrete scores as modes of `regression-discontinuity`; covariates by the doubly robust estimator (Sant'Anna & Zhao 2020), the imputation estimator (Borusyak, Jaravel & Spiess 2024) and HonestDiD sensitivity bounds (Rambachan & Roth 2023) as modes of `difference-in-differences`; augmented synthetic
control (Ben-Michael, Feller & Rothstein 2021) as a bias-corrected mode for
`synthetic-control`; several input columns
with automatic relevance determination, and a forecast-calibrated mean, as
modes of `gaussian-process-regression`;
the debiased Sinkhorn divergence (Genevay, Peyré & Cuturi 2018) and unbalanced
transport as modes of `wasserstein-distance`;
stable PCP with an explicit noise level (Zhou, Li, Wright, Candès & Ma 2010) as a mode of `robust-pca`; ADDIS (Tian & Ramdas 2019) for online FDR with conservative nulls, and online rules under dependence, as modes of `fdr-multiple-testing` (LOND, LORD++ and SAFFRON landed 2026-11-16);
p-to-e calibrators (Vovk & Wang 2021) so e-BH in `fdr-multiple-testing` can take p-values;
the extended isolation forest's random-hyperplane cuts (Hariri, Carrasco Kind & Brunner 2021) as a mode of `isolation-forest`;
multiclass and ordinal calibration, and calibration tracked over time with a monitoring chart, as modes of `probability-calibration`;
predicting the cluster of new rows (McInnes & Healy's approximate_predict) and the DBSCAN-style `cluster_selection_epsilon` cut (Malzer & Baum 2020) as modes of `hdbscan-clustering`;
multivariate DTW, DTW barycentre averaging (Petitjean, Ketterlin & Gançarski 2011) and LB_Keogh-pruned search (Keogh & Ratanamahatana 2005) as modes of `dynamic-time-warping`;
trigonometric seasonals, a stochastic cycle, regressors with intervention dummies (the seat-belt law as a level dummy, Harvey & Durbin 1986) and simulation smoothing (Durbin & Koopman 2002) as modes of `kalman-smoother`;
historical and censored floods (Stedinger & Cohn 1986), covariates beyond the year in the GEV parameters, and the point-process likelihood (Smith 1989) as modes of `extreme-value-analysis`;
the kernel and the tau-value, Monte Carlo Shapley sampling past 14 members (Castro, Gómez & Tejada 2009), and the airport game's closed-form nucleolus (Littlechild 1974) as modes of `cost-sharing-calculator`;
ties in the lists with weak and super-stability (Irving 1994), stable roommates for one-sided pairing (Irving 1985), the rotation poset for egalitarian matchings past the listing limit (Irving, Leather & Gusfield 1987), and couples (Roth & Peranson 1999) as modes of `stable-matching`;
partial proportional odds (Peterson & Harrell 1990) for the predictors Brant's test flags, profile-likelihood intervals and a complementary log-log link as modes of `ordinal-regression`;
an unpaired AUC comparison, covariate-adjusted ROC (Janes & Pepe 2009) and time-dependent ROC for censored outcomes (Heagerty, Lumley & Pepe 2000) as modes of `roc-analysis`;
trim-and-fill (Duval & Tweedie 2000), subgroup tests on a categorical column, Mantel-Haenszel pooling for sparse tables, and multilevel models for several effects per study as modes of `meta-analysis`.
