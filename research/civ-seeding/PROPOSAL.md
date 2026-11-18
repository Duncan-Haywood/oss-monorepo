# Proposal: does adoption spread through village networks as a simple or a complex contagion, and does it change whom a rollout should seed?

Programme `civ-seeding`, opened 2026-11-13 as the first programme of research track 24 (`civ`,
`research/PROJECTS.md`; its milestone 3 asked where to seed a complex contagion, and
`civ-levers` answered it only on synthetic Watts–Strogatz graphs). Written with AI assistance
(Claude Code). No affiliation with the authors of the data or of any work cited is implied.

## Question

On real village networks with observed adoption of a new product (the 43 Karnataka villages
where Bharatha Swamukti Samsthe introduced microfinance, Banerjee et al. 2013), can the data
tell a simple contagion (one informed contact is enough) from a complex one (adoption needs
reinforcement from several adopting contacts), and when they cannot, which seeding rule
(leaders, random, degree, centrality, clustered patches, a few extra random seeds) stays close
to the best rule under every model the data cannot rule out?

Open because the two literatures answer it from opposite ends. The economics papers fit one
simple-contagion information model to these villages (Banerjee et al. 2013, 2019) and rank
seeds by diffusion centrality under it; the sociology papers show in experiments and on
synthetic graphs that complex contagions reverse the seeding advice (clustered seeds beat
spread-out hubs: Centola and Macy 2007; Centola 2010; Guilbeault and Centola 2021), and a
field experiment in Malawi found complex-contagion seeding beat the government's default
(Beaman et al. 2021). Nobody has asked, on one real dataset, whether cross-sectional adoption
data can even distinguish the two, and what a rollout designer should do if it cannot.

## Why it matters

Seeding is how real rollouts spend their first budget: which households get the first solar
home systems, clean cookstoves, drip kits, loan products or vaccines. If the best rule depends
on a modelling choice the data cannot settle, the right output is not a ranking but a rule
with bounded regret across the plausible models, plus a statement of which measurement
(timing, a second wave, who told whom) would settle the choice. That is a design rule a
programme officer can adopt and a data-collection protocol an evaluator can budget for.

## Related work

Fitting diffusion models to these villages and to field rollouts:

- Banerjee, Chandrasekhar, Duflo and Jackson (2013), *Science* 341:1236498,
  doi:10.1126/science.1236498. The data and the information model (q<sub>N</sub>, q<sub>P</sub>) fitted by
  simulated method of moments; finds no endorsement (reinforcement) effect. Settles the fit
  of one simple model; does not test identification against complex contagion.
- Banerjee, Chandrasekhar, Duflo and Jackson (2019), *Review of Economic Studies* 86:2453,
  doi:10.1093/restud/rdz008. Villagers can name central "gossips"; seeding them spreads
  information further. Seeding under a simple model only.
- Beaman, BenYishay, Magruder and Mobarak (2021), *American Economic Review* 111:1918,
  doi:10.1257/aer.20200295. Malawi field experiment: seeds chosen for a complex contagion
  (threshold 2) raised adoption of pit planting over the extension service's default.
  Strongest field evidence for complex seeding; one technology, no identification analysis.
- Kim et al. (2015), *The Lancet* 386:145, doi:10.1016/S0140-6736(15)60095-2. Honduras
  cluster-randomised trial: nominated friends as seeds beat random and high-degree seeds for
  some health products. Policy comparison without a fitted contagion model.

Complex contagion:

- Granovetter (1978), *American Journal of Sociology* 83:1420, doi:10.1086/226707. Threshold
  models of collective behaviour.
- Centola and Macy (2007), *American Journal of Sociology* 113:702, doi:10.1086/521848.
  Complex contagions need wide bridges; clustering helps them. Synthetic graphs only.
- Centola (2010), *Science* 329:1194, doi:10.1126/science.1185231. An online experiment where
  behaviour spread further on clustered networks. Settles that reinforcement can matter, not
  how much in a given rollout.
- Guilbeault and Centola (2021), *Nature Communications* 12:4430,
  doi:10.1038/s41467-021-24704-6. Complex centrality: seeding measures for complex
  contagions, tested on networks including these villages' (to be checked: which villages
  and which adoption data they used is read in milestone 2).

Seeding as optimisation:

- Kempe, Kleinberg and Tardos (2003), KDD, doi:10.1145/956750.956769. Influence
  maximisation under independent cascade and linear threshold; greedy is a (1 &minus; 1/e)
  approximation when spread is submodular, which a complex contagion breaks.
- Watts (2002), *PNAS* 99:5766, doi:10.1073/pnas.082090499. Global cascades on random
  networks with thresholds; when a single seed can tip a network.

Identification of contagion from observational network data:

- Shalizi and Thomas (2011), *Sociological Methods & Research* 40:211,
  doi:10.1177/0049124111404820. Homophily and contagion are generically confounded in
  observational data. Bounds what any fit to cross-sectional adoption can claim.
- Aral, Muchnik and Sundararajan (2009), *PNAS* 106:21544, doi:10.1073/pnas.0908800106.
  Matched-sample estimates attribute much apparent contagion to homophily.

Technology adoption through peers (the application):

- Conley and Udry (2010), *American Economic Review* 100:35, doi:10.1257/aer.100.1.35.
  Farmers learn about a new technology from their information neighbours.
- Bollinger and Gillingham (2012), *Marketing Science* 31:900, doi:10.1287/mksc.1120.0727.
  Peer effects in residential solar PV adoption in California. The energy-technology case
  this programme's rule is meant for; zip-code level, no network.

Our own prior work: `research/civ-levers` (track 24), "where to seed a complex contagion" and
"a committed minority on a lattice": clustered patches beat random seeds for threshold 2 on
Watts–Strogatz graphs, the reverse for a naming-game convention. Synthetic graphs, chosen
thresholds; this programme moves the question onto measured networks and measured adoption.

## Gap

(1) An identification analysis, on the BCDJ villages, of whether the moments those authors
use (or any cross-sectional moments) can separate their information model from fitted
reinforcement and threshold models; (2) seeding rankings computed under every model the data
cannot reject, on the same 43 measured networks, with a minimax-regret rule; (3) a statement
of which extra measurement would identify the model, priced by a power analysis. None of the
works above does (1) or (2) on real networks; Beaman et al. (2021) is closest to (2) and
assumes threshold 2 from its design.

## Hypotheses

- **H1 (reproduction).** Our port of the authors' code recovers q<sub>N</sub> &asymp; 0.10, q<sub>P</sub> &asymp; 0.50
  within one grid step. Refuted if the minimiser is farther away.
- **H2 (non-identification).** On synthetic villages generated from each fitted model on the
  real networks, the BCDJ moment criterion picks the true model family in fewer than 70% of
  datasets. Refuted if recovery is 80% or more for every pair of models.
- **H3 (fit).** A reinforcement model (adoption probability rising with the number of
  adopting neighbours who informed the household) does not beat the information model by
  more than the bootstrap spread of the criterion, out of sample (leave-villages-out).
  Refuted if it wins in at least 95% of paired bootstrap draws.
- **H4 (policy depends on the model).** Among models the data cannot reject, the best seeding
  rule differs, or the rank order of seven rules has Kendall &tau; &lt; 0.6 between some pair.
  Refuted if the top rule agrees and every &tau; &ge; 0.6.
- **H5 (a robust rule exists).** Some rule is within 10% of the best rule's adoption under
  every non-rejected model. Refuted otherwise.

## Method

Data: the BCDJ replication archive (doi:10.7910/DVN/U3BIHX, CC0), 43 villages, 9,126
households, 44,367 ties, take-up and leader status (`data/`). Second datasets, if reachable:
Banerjee et al. (2019) gossip villages; Beaman et al. (2021) Malawi seeding data;
Cai, de Janvry and Sadoulet's weather-insurance villages.

Models: the information model (q<sub>N</sub>, q<sub>P</sub>) and its endorsement variant; a reinforcement model
(adoption probability logistic in covariates plus &gamma; times the number of adopting informers);
a fractional-threshold model; a mixture. All estimated by the same simulated method of moments
(the authors' five moments and a richer set: take-up by number of adopting neighbours, by
distance from leaders, clustering of adopters), with village-level Bayesian bootstrap.

Theory: under what network conditions are the two models' cross-sectional moment maps
locally indistinguishable (rank of the Jacobian of the moment map); a regret bound for the
robust rule.

## Evaluation

Seeding rules at equal budgets (the villages' own leader count): the observed leaders, random,
top degree, eigenvector and diffusion centrality (Banerjee et al. 2013), complex centrality
(Guilbeault and Centola 2021), greedy influence maximisation under each model (Kempe et al.
2003, CELF-accelerated), clustered patches, and "random plus a few" seeds. Metrics: expected
adopters per village, regret against the per-model best, with 200 simulations per village and
village-level bootstrap intervals; seeds of every random choice logged. Ablations: moment set,
period length, network layer (all relationships against advice-only).

## Milestones

1. Reproduce the BCDJ information-model estimate with a port of their code (this session).
2. Fit the reinforcement and threshold models; leave-villages-out comparison (H3).
3. Identification by simulation: synthetic villages from each fitted model, refit, confusion
   matrix (H2); Jacobian rank analysis.
4. Seeding rules under each model, regret table (H4, H5); greedy baselines.
5. A second dataset, if any host serves one; otherwise a power analysis of what timing or
   "who told you" data would identify the model.
6. Browser sandbox on one real village network; paper draft.

## Target venue

Proc. ACM Conference on Economics and Computation (EC), full paper, ACM format, with an
artefact (code and the compact dataset); fallback *Network Science* (Cambridge University
Press). An aim, not a claim the work will be accepted.

## Deep-tech application

The system: a rollout of an energy technology (solar home systems, clean cookstoves, rooftop
PV) or farm equipment into a set of connected households. The number it moves: adopters per
seeded household at a fixed seeding budget, and the regret of the seeding rule under model
uncertainty. Who acts: a distributor's or NGO's rollout team choosing first households, and
the evaluator budgeting the survey. Trying it on the real thing needs a partner rollout that
records network ties and adoption dates; that is an owner step. The evidence here is
microfinance, and transfer to energy products is a hypothesis this programme states, not a
finding.

## Citation status

Checked with `research/_shared/cite_check.py` this session (see `cite_check.json`). The
numbers quoted from Banerjee et al. (2013) are from the NBER working paper w17743 (January
2012), read this session; the Science version was not opened.
