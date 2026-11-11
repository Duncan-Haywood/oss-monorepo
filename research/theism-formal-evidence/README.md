# Atheism, Orthodoxy or Catholicism: which premises and numbers does each conclusion depend on?

An open research programme ([PROPOSAL.md](PROPOSAL.md), [LOG.md](LOG.md)) that puts the case
between **naturalism (atheism)**, **Eastern Orthodox Christianity** and **Catholicism** into two
checkable forms: machine-checked symbolic logic (a decision procedure in Python and Lean 4 proofs)
and a probabilistic evidence ledger of Bayes factors with a source on every entry.

**Live page:** https://marisstella.app/research/theism-formal-evidence/

The aim is not to announce a winner. It is to show exactly which premise, and which number, each
side's conclusion rests on, so a reader can change one entry and see what follows.

## Headline results (milestone 1)

**Logic** ([E1 results](experiments/e1_arguments/results.md)):

- All 10 standard arguments in the catalogue are **valid as stated**: the Kalam, the contingency argument, the modal ontological argument and its reverse, Mackie's logical problem of evil, Rowe's evidential argument, Schellenberg's hiddenness argument, and the Honorius and Florence arguments between Rome and Orthodoxy. Validity never decides the debate; the premises do.
- The **free will defence** set (God exists, evil exists, and there is a morally sufficient reason for permitting it) is **consistent**. So Mackie's argument needs the extra premise that no such reason can exist.
- The **modal ontological argument** (□(G → □G), ◇G ⊢ G) needs a symmetric accessibility relation. It is valid in B and S5, and two-world countermodels refute it in K, T and S4. Its **reverse** (◇¬G ⊢ ¬G) is valid already in T. So on the logic alone the atheist mirror is the stronger argument. In S5 the three claims cannot all hold, which makes the whole dispute "is God's existence possible, or is God's non-existence possible?"
- **Rome vs Orthodoxy:** the eight claims behind the Honorius and Florence disputes have exactly two minimal inconsistent sets and 16 coherent positions. The Catholic position gives up "Honorius's condemned letter was ex cathedra" and "the Filioque is false". The Orthodox position gives up "ex cathedra papal teaching cannot err" and "Florence (1439) was ecumenical".

**Evidence** ([E2 results](experiments/e2_ledger/results.md); ledger in [`src/ledger.py`](src/ledger.py)):

- Unwin's published 67% (*The Probability of God*, 2003) reproduces exactly from his 50% prior and six factors.
- **Christianity vs everything else:** the resurrection testimony carries **98.5%** of the variance of the log odds. The Bayes factor it needs to make Christianity more likely than not is only **7.3** under even priors, and 0.5 to 294 across a 3 × 3 grid of priors. The published endpoints are about 1 (a Humean sceptic) and of order 10^44 (reported for the McGrews). The case for Christianity stands or falls on one contested number, and the bar is far lower than either side usually implies.
- **Theism vs naturalism:** the prior carries **54%** of the variance and fine-tuning (a swept range) **31%**. Every item with a published figure carries under 6%. Taking the midpoint of every range except the resurrection item, P(naturalism) = 0.76. In a Monte Carlo over the ranges and priors, P(naturalism) has a median of 0.69 and a 5–95% range of 0.004 to 0.999.
- **Catholic vs Orthodox:** no one has published likelihood ratios for primacy, canon 28, Honorius, the Filioque or doctrinal development. The ledger holds symmetric placeholders until an elicitation from scholars on both sides (milestone M3). The prior choice (Pew's head-count shares or equal shares) is so far the only thing that separates them.

**Limits.** These are model outputs given stated inputs, not findings about whether God exists.
Most ranges are swept, not sourced, and each entry says which (`basis`). The ledger treats items
as independent. A crude ρ = 0.5 discount barely moves the theism result: the share of draws with
P(N) > 0.5 goes from 58% to 55%. The Lean files were first compiled on 2026-11-11 (E11 below);
they built unchanged. The McGrews' figure is a secondary report.

**M2 results (2026-11-07).** *Leave-one-out (E3):* at the midpoints P(naturalism) is 0.76, and
dropping any one of three theism-level items flips it below 0.5: natural evil (to 0.09),
moral evil (0.42), and hiddenness (exactly 0.5, a boundary case). Dropping fine-tuning, the
largest variance contributor, moves it up to 0.99. So the verdict at midpoints is fragile to the
evil items, which is the reverse of what the variance shares alone suggest; the earlier
prediction that no sourced item could move it by 0.1 failed. *Gödel's argument (E4):* in an
exhaustive search of S5 models under full property semantics, Scott's axioms (A1 to A5) have
exactly one model per individual when there is one world, and none with two to five worlds
(up to the sizes tried): the modal collapse of Sobel (1987) shows up as "the argument is
satisfiable only where possibility is trivial". Sizes with 6 or more cells (property sets too
large to enumerate) are not covered, and general models are not excluded by search.

**M2 (part), Shermer's published inputs (E6, 2026-11-08).** The six D values of Shermer's
*God's Number Is Up* (Scientific American, July 2004) are transcribed from the column and run through
Unwin's formula. They multiply to 2.5×10^−4, so P(God) = 0.025%, not the 2% the column states; the
stated bottom line is about 82 times too large in odds for its own inputs. Unwin's 67% does reproduce.
Which side is a slip is not knowable from the column; no claim is made. Order of application is
irrelevant. Swinburne's four inputs remain untranscribed (the book is not reachable).

**M4 (part), shared-cause dependence (E5, 2026-11-07).** Replacing the crude ρ discount, the
resurrection testimony items share one latent source reliability. The combined Bayes factor is
then BF = 1 + ω(L − 1), with L the independent product (10^44, the McGrews' figure as reported
secondarily) and ω the credence a sceptic still gives the source after the reports; the formula
agrees with direct enumeration of the joint model. Dependence acts on log BF only by log ω, not
per item: ω = 10^−12 still leaves BF ≈ 10^32. At even priors the testimony stops lifting
P(Christian) to 0.5 only if ω < 10^−43.2 (10^−41.5 at 0.1/0.1 priors). E2's ρ would have to be
0.024 to say the same. So given a large product L, correlated reliability alone cannot defeat it;
the dispute moves to L itself, i.e. the per-item ratios, which this ledger does not source.
Limit: the model assumes the unreliable route yields reports under both hypotheses alike.

**M2 (part), a theorem for Anderson's repair (E10, 2026-11-10).** E7 to E9 searched for models
of Anderson's emendation of Gödel's argument. E10 proves what they were finding: over any finite
property algebra (the unions of the blocks of some partition of world-individual cells), Anderson's
axioms have a model exactly when one block is made of whole individuals, one model per such block.
So the God-like individual has no contingent property, and the algebra cannot contain "being such
that p" for any contingent p: the repair avoids modal collapse only for propositions its property
space cannot express. Under full property semantics there is no model with two or more worlds at
any finite size. The exhaustive search agrees on all 563 partitions it was run on. Finite models,
S5, constant domain only; the proof is in `experiments/e10_theorem/results.md` and, since E11, in Lean.

**M2 (part), Lean compiled, and a correction: Anderson's own A2 (E11, 2026-11-11).** The Lean
files now compile (Lean 4.15.0, no `sorry`; `lean/build.sh`), and E10's theorem is proved in
`lean/TheismFormal/Anderson.lean` for every block algebra, finite or not. Checking the
literature turned up a modelling error: E7 to E10 gave Anderson's emendation Scott's A2 ("exactly
one of a property and its complement is positive"), but Anderson keeps only "if a property is
positive, its complement is not" (Benzmüller & Fuenmayor 2020). So E7's "Anderson's repair
collapses under full property semantics" is true of a hybrid, not of Anderson's system. With his own
A2 (prediction written before the run, proved in Lean, search agrees on all 573 partitions
checked): models are exactly the principal filters at a non-empty union of blocks H that is the
union of the rows of the individuals whose hull is H. Under full property semantics that means one
model per individual at every number of worlds, with the God-like individual free to have
contingent properties, so modal collapse is not forced, as Benzmüller & Fuenmayor's model finder
found for two worlds and one entity. Constant domain, S5, extensional properties; Anderson's
intended varying-domain reading is not covered.

**M2 (part), varying domains (E12, 2026-11-11).** Anderson intends worlds with different
domains and quantifiers over what exists. With them (and his own A2), every model of his four
axioms has a God-like individual existing at every world, for any property algebra: the
argument's conclusion follows, proved in Lean 4 (`lean/TheismFormal/Varying.lean`). But the axiom
"necessary existence is positive" (A5'), idle under a constant domain, now carries the weight:
without it 1,612 of 8,534 models found have a world with no God-like existent. Under full
property semantics a model exists exactly for each individual that exists at every world, and
none if no individual does. Prediction written before the search; the search agrees with it on
all 17,440 (domain, algebra) frames checked. Whenever "exists" is expressible as a property, it is
positive. Possibilist reading of "x has f necessarily"; other variants not covered.

**M2 (part), actualist necessity and de re vs de dicto (E13, 2026-11-11).** Reading "x has f
necessarily" actualistically too (box (x exists -> x has f)), every model of Anderson's four
axioms still has some God-like individual at every world (Lean 4,
`lean/TheismFormal/Actualist.lean`). But under both readings the de re claim, one God-like
individual existing at every world, fails in some models: 580 of 3,638 (actualist) and 382 of
6,706 (possibilist) models found share God-likeness between individuals that each exist at only
some worlds. The smallest is two worlds, two individuals and one block, proved in Lean under both
readings. Under full property semantics de re always holds. Prediction written before the
search; it matched on all 17,440 frames. So the argument shows "necessarily something God-like
exists", and "something God-like necessarily exists" only when the properties separate
individuals.

## Layout

- `src/logic.py`: decision procedures (S5 exact, K/T/B/S4 by certified countermodels, monadic first-order exact), minimal inconsistent and maximal consistent subsets.
- `src/arguments.py`: the 11 arguments, each with its published source.
- `src/ledger.py`, `src/bayes.py`: hypotheses, priors, the 13 evidence items, and the posterior arithmetic.
- `lean/`: Lean 4 (core library only) theorems for every argument, the B/T frame results, the S4 countermodel, and E10's and E11's theorems on Anderson's emendation (`TheismFormal/Anderson.lean`) E12's varying-domain theorems (`TheismFormal/Varying.lean`) and E13's actualist ones (`TheismFormal/Actualist.lean`). `lean/build.sh` fetches the pinned toolchain if needed, builds, and prints each headline theorem's axioms.
- `experiments/e1_arguments/run.py`, `experiments/e2_ledger/run.py`, `experiments/e3_leave_one_out/run.py`, `experiments/e4_godel_scott/run.py`, `experiments/e5_shared_cause/run.py`, `experiments/e6_shermer_check/run.py`, `experiments/e7_anderson/run.py`, `experiments/e8_restricted/run.py`, `experiments/e9_restricted_larger/run.py`, `experiments/e10_theorem/run.py`, `experiments/e11_anderson_a2/run.py`, `experiments/e12_varying_domains/run.py`, `experiments/e13_actualist_necessity/run.py`: these regenerate `results.md` and `results.json`.
- `test_theism.py`: 23 tests (textbook modal axioms per system, genuine countermodels, the church positions, Unwin's reproduction, posterior identities). Stdlib only: `python3 test_theism.py`.

## Run

```
python3 research/theism-formal-evidence/test_theism.py
python3 research/theism-formal-evidence/experiments/e1_arguments/run.py
python3 research/theism-formal-evidence/experiments/e2_ledger/run.py
python3 research/theism-formal-evidence/experiments/e3_leave_one_out/run.py
python3 research/theism-formal-evidence/experiments/e4_godel_scott/run.py
python3 research/theism-formal-evidence/experiments/e5_shared_cause/run.py
python3 research/theism-formal-evidence/experiments/e6_shermer_check/run.py
python3 research/theism-formal-evidence/experiments/e10_theorem/run.py   # about 6 s
python3 research/theism-formal-evidence/experiments/e11_anderson_a2/run.py   # about 5 s
python3 research/theism-formal-evidence/experiments/e12_varying_domains/run.py   # about 2 min
python3 research/theism-formal-evidence/experiments/e13_actualist_necessity/run.py   # about 4 min
research/theism-formal-evidence/lean/build.sh   # downloads Lean 4.15.0 (~250 MB) if lake is not on PATH; needs zstd
```

To use your own numbers, edit the `lo`/`hi` of any item in `src/ledger.py` (or a prior in
`PRIOR_DEFAULT`) and rerun E2.

Related programmes: [`christian-belief-models`](../christian-belief-models) and
[`catholic-demography`](../catholic-demography) (what Catholics and Orthodox believe and practise,
from surveys) and [`religion-origins`](../religion-origins).
