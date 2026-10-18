# selfrep-judgement: how much do the RepRap closure numbers depend on which parts we *judge* a shop can make?

New question for track 1 (`PROJECTS.md`), not a micro-variant of an earlier result: the track's projects have varied dynamics (growth, repair, resale) around one fixed make-or-buy table, and `selfrep-closure`'s sensitivity run only scaled masses and costs. Its README admits that "which process can make which part is my judgement". This project flips that judgement and asks how far the headline closure moves, and which *missing* capability would move it most. Produced with AI assistance (Claude). Computed only; no real part was tested.

**Builds on.** `selfrep-closure` (its bill of materials from the RepRap wiki, Prusa Mendel iteration 2, oldid 181926, and its process-capability judgements), imported by relative path. Vocabulary and framing: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Largest seed shop (printer + router + laser + casting), both bearing variants. Unit masses and costs are `selfrep-closure`'s **assumed placeholders**, held fixed; only the binary make/buy status of a line varies.
1. *Buy instead of make*: each of the five lines `selfrep-closure` marks as optimistic (washers, GT2 pulley, MDF bed, brass bushing) is turned into a vitamin, one at a time and all together.
2. *Make instead of buy*: each current vitamin is turned makeable, one at a time, to rank the leverage of a capability the shop lacks.
3. *Monte Carlo*: each judged line stays makeable with probability 0.5, and each fastener, rod, belt or "other" vitamin becomes makeable with probability 0.1 (5,000 draws, seed 0). Both probabilities are arbitrary choices of this project, not estimates.

## Reproduce
```bash
cd research/selfrep-judgement
python3 -m unittest discover -s tests -v     # 5 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`, points of closure)
- Baseline (lm8uu / brass): lines 43.1 / 45.1%, mass 22.4 / 24.1%, cost 15.9 / 21.1%.
- Buying every judged line instead of making it takes mass closure to **17.3%** and cost to **11.4%** (lines 35.3%). That is the same as the printer alone: the judged lines are all of the router, laser and casting shop's contribution.
- One at a time, the largest single mass swing is 2.4 points (M8 washers, or the MDF bed). With brass bushings, the bushing line is the largest cost swing (5.2 points).
- Missing capabilities matter far more than disputed ones. Making the five NEMA17 motors in-house would add 22 points of mass closure and 26 of cost; the 370 mm threaded rods alone 10 points of mass; the smooth and threaded rods together far more than any judged line. Controller and hot end together are worth 26 points of cost.
- Monte Carlo 5–50–95% (lm8uu): lines 39–43–49%, mass 18–24–35%, cost 13–16–20%. Mass closure stays below about 36% even when a tenth of the arguable vitamins are granted.

Reading: the conclusion of `selfrep-closure` (a small shop remains far from closure) does not hinge on its optimistic judgements. Dropping them lowers closure by 5 points of mass; the open question is rods, motors and electronics, not washers. Which of those a hobby shop could make is a design question for `selfrep-redesign` and its siblings, not settled here.

## Limitations
- All masses and costs are assumed, so the point values above inherit `selfrep-closure`'s caveats; the *ranking* of leverage is the more robust output, and the motor result partly reflects the placeholder 280 g and 10 units per motor.
- Binary judgements: a part a shop makes badly, or from an imported semi-finished blank, is not represented.
- The Monte Carlo probabilities (0.5 and 0.1) are arbitrary; the interval shows the spread under them, not a confidence interval.
- Only the printer is decomposed; the added machines have no BOMs here (as in `selfrep-closure`).

## Next steps
Replace the placeholder masses with weighed parts (owner step in `selfrep-closure`) and check whether the rod and motor ranking survives; give motors and rods candidate in-house routes (wound motors, cut and turned rod) with an assumed cost, and rerun the penalty-budget search of `selfrep-redesign`.

## Owner steps
- Weigh the parts and quote the prices (see `selfrep-closure`).

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-closure` source tree (relative path).
