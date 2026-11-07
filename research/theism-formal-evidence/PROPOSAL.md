# Programme proposal: theism-formal-evidence

Opened 2026-11-07 at the owner's request ("an ongoing project to argue between atheism,
Orthodox Christianity and Catholicism from all points of evidence using formal verifiable
symbolic logic, Lean or similar, and probabilistic evidence; deep dives"). Like
`christian-belief-models` and `catholic-demography`, it sits outside the deep-tech focus;
the section on application says what transfers.

## Question

Can the case between naturalism, Eastern Orthodox Christianity and Catholicism be stated so
that (a) every deductive argument is machine-checked and its *cruxes* (the minimal sets of
claims that cannot all be true) are computed, and (b) every probabilistic claim is an explicit,
sourced likelihood ratio in one shared ledger, so that the disagreement reduces to a short,
named list of contested premises and numbers, and how short is that list?

It is open because the formal work so far checks one argument at a time (Gödel's, Anselm's),
the Bayesian work publishes one bottom line at a time (Swinburne's 0.97, Unwin's 0.67) with
inputs that cannot be recombined, and neither has been applied to the Catholic–Orthodox
questions (papal primacy, the Filioque, conciliar authority), where the evidence is almost
entirely historical.

## Why it matters

- Readers on all three sides (students, apologists, sceptics, ecumenical theologians) get an
  executable map: which premise or number each conclusion depends on, and by how much. Changing
  your mind, or seeing why the other side has not, becomes a matter of editing one entry.
- Philosophy of religion gets a check on its published calculations: whether they reproduce,
  and how sensitive they are (one input in Swinburne's calculation is reported to move the result
  from 0.97 to 0.33; NDPR and critics).
- Formal methods get a non-toy domain where the hard part is not proof search but finding
  which claims carry the weight, the same problem assurance cases have.

## Related work

Grouped by approach. DOIs were confirmed by web search on 2026-11-07; `cite_check.py` could not
run (the proxy refused Crossref and arXiv), so entries marked (†) were not confirmed by any
lookup and must be checked by hand before submission.

**Machine-checked natural theology**
- Benzmüller & Woltzenlogel Paleo, *Automating Gödel's ontological proof of God's existence with higher-order automated theorem provers*, ECAI 2014, doi:10.3233/978-1-61499-419-0-93; arXiv:1308.4526. Checks Scott's version in Isabelle/HOL with LEO-II and Satallax, finds modal collapse. Settles the validity of one argument in one logic; says nothing about the premises' credibility.
- Oppenheimer & Zalta, *A computationally-discovered simplification of the ontological argument*, Australasian Journal of Philosophy 89 (2011) 333–349, https://mally.stanford.edu/abstracts/ontological-computational.html. Prover9 finds a one-premise version of Anselm. Validity and economy, not credibility. (Garbacz, AJP 90 (2012), argues the simplification is an artefact of the formalisation.)
- Rushby, *Mechanized analysis of Anselm's modal ontological argument*, International Journal for Philosophy of Religion 89 (2021) 135–152, doi:10.1007/s11153-020-09768-6; arXiv:2205.08628. PVS; shows published modal formalisations are essentially alike and the argument is near-trivial given the modal axioms. Closest to our crux framing, one argument only.

**Deductive arguments from evil and hiddenness**
- Mackie, *Evil and omnipotence*, Mind 64 (1955) 200–212, doi:10.1093/mind/LXIV.254.200. The logical problem. Plantinga, *God, Freedom, and Evil* (1974), replies with a consistency proof; we machine-check both (E1).
- Draper, *Pain and pleasure: an evidential problem for theists*, Noûs 23 (1989) 331–350, doi:10.2307/2215486. Recasts evil as Bayesian evidence against theism relative to a hypothesis of indifference; gives no number, which is why our ledger must sweep its item.
- Rowe, *The problem of evil and some varieties of atheism*, American Philosophical Quarterly 16 (1979) 335–341 (no link). The evidential argument whose deductive core we check; its weight rests on an inductive premise.
- Schellenberg, *Divine Hiddenness and Human Reason* (Cornell, 1993) (no link).

**Bayesian natural theology and its critics**
- Swinburne, *The Resurrection of God Incarnate* (OUP 2003); review at https://ndpr.nd.edu/news/the-resurrection-of-god-incarnate/. Bayes' theorem gives ~0.97 for incarnation and resurrection; the review and critics locate the result in the priors.
- Unwin, *The Probability of God* (2003), and Shermer's rerun with his own inputs (2% instead of 67%), *God's number is up*, Scientific American, July 2004, https://michaelshermer.com/sciam-columns/gods-number-is-up/. Six multiplicative "divine indicators"; we reproduce the 67% exactly (E2).
- McGrew & McGrew, *The argument from miracles*, in Craig & Moreland (eds.), *Blackwell Companion to Natural Theology* (2009) 593–662; the authors' later draft: https://lydiaswebpage.blogspot.com/2020/07/a-cumulative-case-for-resurrection-of.html. Large Bayes factors for the resurrection testimony (reported by secondary sources as of order 10^44; to be checked against the chapter).
- Sober, *The design argument*, in Mann (ed.), *Blackwell Guide to the Philosophy of Religion* (2005), and Weisberg, *Firing squads and fine-tuning*, https://philarchive.org/rec/WEIFSA. Whether an observation selection effect cancels the fine-tuning evidence; the two endpoints of our fine-tuning item.
- Benson et al., *Study of the therapeutic effects of intercessory prayer (STEP)*, American Heart Journal 151 (2006) 934–942, doi:10.1016/j.ahj.2005.05.028. The one item with a randomised trial behind it (relative risk 1.02).

**Catholic–Orthodox history**
- Siecienski, *The Filioque: History of a Doctrinal Controversy* (OUP 2010) and *The Papacy and the Orthodox* (OUP 2017) (no link). The standard histories; qualitative.
- Primary texts: Irenaeus, *Against Heresies* 3.3.2, https://www.newadvent.org/fathers/0103303.htm ; Chalcedon canon 28, https://www.newadvent.org/fathers/3811.htm ; Pew Research Center, *Global Christianity* (2011), https://www.pewresearch.org/religion/2011/12/19/global-christianity-traditions/ (shares used for the head-count prior).

**Method**
- Ladner, *The computational complexity of provability in systems of modal propositional logic*, SIAM J. Computing 6 (1977), doi:10.1137/0206033 (†). The S5 small-model bound our checker relies on.
- de Moura & Ullrich, *The Lean 4 theorem prover and programming language*, CADE-28 (2021), doi:10.1007/978-3-030-79876-5_37 (†).
- O'Hagan et al., *Uncertain Judgements: Eliciting Experts' Probabilities* (Wiley 2006), doi:10.1002/0470033312 (†). The elicitation protocol milestone M3 follows.

**Our own prior work**: `research/christian-belief-models` and `research/catholic-demography`
(survey evidence on what Catholics and Orthodox believe and practise, not on whether it is true),
`research/religion-origins`.

## Gap

No published work (a) puts the arguments for and against theism *and* the Catholic–Orthodox
arguments in one machine-checked catalogue with computed cruxes and maximal consistent positions,
(b) joins that catalogue to a single likelihood-ratio ledger whose every entry is labelled
published, argued or swept, with the published bottom lines reproduced where their inputs are
known, or (c) reports which entries carry the variance of the posterior. Rushby's crux framing and
Unwin's multiplicative ledger are the nearest pieces, each on its own.

## Hypotheses

- **H1 (logic is cheap).** Every argument in the catalogue is valid in the weakest logic its
  authors intend, so validity never decides the debate. *Refuted* if a canonical argument is
  invalid as standardly stated (we would report it).
- **H2 (the modal ontological argument is weaker than its reverse).** The Hartshorne–Plantinga
  argument needs a symmetric accessibility relation, its reverse only a reflexive one.
  *Refuted* by a countermodel to the reverse in T, or a proof of the original in S4.
- **H3 (few cruxes).** The Catholic–Orthodox disputes the catalogue covers reduce to at most two
  claims per dispute that the traditions assign opposite truth values. *Refuted* if a dispute's
  minimal inconsistent set forces three or more disputed claims.
- **H4 (one number decides Christianity).** Under any prior on the 3 × 3 grid of E2, the
  posterior of Christianity is driven by the resurrection item's Bayes factor, and the threshold
  it must pass is below 10^3. *Refuted* if another item's sourced range carries more than 10% of
  the variance of the Christianity-vs-rest log odds.
- **H5 (theism vs naturalism is prior-dominated).** With sourced ranges, the prior carries more
  of the variance of the theism-vs-naturalism log odds than any single evidence item. *Refuted*
  when the elicited ranges (M3) make one item's share exceed the prior's.

## Method

**Theory / formal.** `src/logic.py` decides validity and computes minimal inconsistent and
maximal consistent subsets for propositional modal logic (S5 exactly by Ladner's bound; K, T, B,
S4 by certified countermodels plus Lean proofs) and monadic first-order logic without nested
quantifiers (exact, by a small-model argument proved in its docstring). `lean/` states the same
results as Lean 4 theorems (core library only). Later: quantified modal logic for Gödel–Scott
(reusing Benzmüller's embedding), and arguments with relations (the Kalam's second stage, the
Thomist ways), which need full first-order logic and will go to Lean only.

**Experiments.** E1 decides the catalogue (11 arguments, 2 joint sets). E2 runs the ledger
(5 hypotheses, 13 items): reproduction of Unwin, bounds over the box of ranges, exact variance
shares of each log-odds contrast (log odds are additive), flip thresholds, the resurrection Bayes
factor needed by prior, and a Monte Carlo with a crude dependence discount (ρ = 0.5).

## Evaluation

- Baselines: the published bottom lines (Unwin 0.67 reproduced; Shermer 0.02, Swinburne 0.97
  bracketed once their inputs are transcribed), and for the logic, Benzmüller's and Rushby's
  machine-checked results (ours must agree where they overlap: the ontological argument's
  validity in S5 and B).
- Metrics: verdicts (valid, invalid with countermodel), crux count and size per dispute;
  variance shares, flip thresholds, posterior quantiles. Seeds fixed (Monte Carlo seed 1,
  20,000 draws); tests check each decision procedure against textbook axioms (T, 4, B, 5, K).
- Ablations: head-count vs equal priors within Christianity; ρ = 1 vs 0.5; with and without the
  resurrection item; each item removed in turn (M2).

## Milestones

1. **M1 (this session).** Catalogue of 11 arguments decided with cruxes; Lean source; ledger of
   13 items with sources; E1, E2; Unwin reproduced. Lean compilation pending a toolchain in the
   session (the download was refused in this run).
2. **M2.** Compile `lean/` in CI; transcribe Swinburne's (2003) four inputs and Shermer's six from
   the sources and reproduce both; per-item leave-one-out; add Gödel–Scott via a quantified modal
   embedding and check modal collapse.
3. **M3.** Structured elicitation (SHELF-style, O'Hagan et al.) of the church-level ratios from
   readers on both sides; until then those ranges are symmetric placeholders.
4. **M4.** Dependence modelling: replace the ρ discount with explicit shared-cause structure
   (e.g. the resurrection testimony items share the reliability of the Gospel tradition).
5. **M5.** Paper draft.

## Target venue

*Religious Studies* (Cambridge) or *International Journal for Philosophy of Religion*, where
Rushby's mechanised analysis appeared, as a full article (about 8,000–10,000 words) with the code
as supplementary material; a short formal version to a workshop on automated reasoning in
philosophy (e.g. the CICM/ITP workshop circuit). An aim, not a claim of acceptance.

## Deep-tech application

None directly: a humanities programme at the owner's request. What transfers is the tooling:
computing minimal inconsistent premise sets and variance shares of a likelihood-ratio ledger is
the core of checking an assurance case (the structured safety argument an autonomous vehicle or
medical device is certified on), where the question "which premise or evidence item carries this
conclusion?" is the same. Trying it there would mean encoding a public GSN assurance case and
comparing the computed cruxes with the assessor's.
