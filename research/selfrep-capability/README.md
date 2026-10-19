# selfrep-capability: which process capabilities should a printer-replicating shop learn, when one capability unlocks several imported parts?

A new question for track 1 (`PROJECTS.md`), taking the "Next steps" of `selfrep-learnfirst` (which imported part to learn first) one step further: that project priced every part as a free, independent upgrade; here a part needs *capabilities* (a lathe with taps and dies, heat treatment, coil winding, ...) with an assumed development effort each, and a capability is paid once however many parts use it. Produced with AI assistance (Claude). Computed only; nothing was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-capability/

**Headline (stylised, preliminary).** In this model the best first capability is a lathe with threading: effort 4 buys +31 points of mass closure (all the nuts, bolts, grub screws and threaded rods) but only +10 of cost closure. By cost the best first buy is winding plus sheet stamping (effort 8, +30 points, the NEMA17 motors). A lathe, winding and stamping together (effort 12) give +53 mass and +40 cost, and adding heat treatment (15) gives +54 and +52. Choosing capability sets exactly beats picking parts one at a time by up to 10 points of mass closure at the same real cost, but the nominal choice is fragile to the assumed efforts.

## Method
- Bill of materials, makers and shop from `selfrep-closure` via `selfrep-learnfirst` (RepRap Prusa Mendel iteration 2, LM8UU variant; printer + router + laser shop; 29 imported lines). Masses and costs there are assumed placeholders.
- **New, all assumed:** nine capabilities with an effort each (lathe 4, heat-treat 3, grinding 6, ball-forming 5, winding 5, stamping 3, belt-casting 5, tube-extrusion 2, glass-casting 7; arbitrary units, roughly person-weeks), and for each imported line the set of capabilities it needs (`REQ` in `src/selfrep_capability/capability.py`). Controller electronics needs integrated circuits and is never reachable. Imported inputs of a made line (steel stock, magnet wire, magnets) stay imported, as filament does for printed parts in `selfrep-closure`.
- With 9 capabilities all 512 subsets are enumerated, so the best set within a budget is exact. Reported: the efficient frontier of effort against closure gained, and two line-by-line rules that pick parts one at a time (by gain per stand-alone effort, and by raw gain as in `selfrep-learnfirst`) but pay the true shared cost.
- Stability: 2,000 draws scaling every capability effort by an independent log-uniform factor in 0.5x to 2x; share of draws where the nominal choice is still affordable and optimal.

## Reproduce
```bash
cd research/selfrep-capability
python3 -m unittest discover -s tests -v     # 7 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/figure.py                # plots closure against budget to experiments/budget_curve.svg
```

## Results (from `experiments/results.txt`)
- Reachable ceilings if every capability were built: +76.3 points of mass and +68.5 of cost closure (the controller electronics stays imported), against +77.6 and +84.1 when `selfrep-learnfirst` assumed any part could be learned.
- Mass frontier: lathe (4) +30.7; lathe + stamping + winding (12) +53.1; add grinding and heat-treat (21) +69.0. Cost frontier: stamping + winding (8) +30.2; add lathe (12) +40.3; add heat-treat (15) +52.2; add grinding (21) +57.4.
- Part-by-part rules lose to the exact set: at budget 8 mass closure is 32.0 (exact) against 22.4 for both rules; at 24, 69.1 against 59.2 (ratio rule); cost at 5, 10.1 against 2.6 (raw-gain rule); cost at 24, 57.6 against 54.5. At several budgets they tie.
- Stability is poor: with efforts scaled 0.5x to 2x, the nominal choice at budget 8 or 16 is both affordable and optimal in only 20 to 28% of draws, and unaffordable in 40 to 57%. Where it is affordable the mean shortfall against the draw's optimum is 0.8 to 2.2 points. The *frontier shape* (a lathe early, motors via winding and stamping, glass and ball-forming last) matters more than the exact sets.

## Limitations
- Stylised. Every capability effort and every line-to-capability mapping is an assumption of this project, not sourced from a process study; a real thread, bearing race or motor stator is harder than the unit counts here suggest, and capabilities are treated as all-or-nothing with no learning curve, tooling lead time or quality grade.
- Closure counts a line as made once its capabilities exist, even though steel, wire and magnets are still imported; it measures the imported share of the *bill of materials*, not of raw material (see `selfrep-stockmass` for that).
- Budget grid points sit at sums of the assumed efforts, so small changes shift which set wins at a given budget (see the stability result).
- The unit metric inherits the wiki box-size caveat of `selfrep-closure` and is not reported here.

## Next steps
Replace the assumed efforts with process data (for example from open machine-shop guides), and let a capability also unlock a machine (a lathe as a seventh seed machine) so `selfrep-nextmachine` and this choice are made together; add a time dimension with learning curves.

## Owner steps
- Estimate, from shop experience, how long a lathe, a winder and heat treatment take to get working to the quality these parts need, to replace the assumed efforts.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-closure` and `selfrep-learnfirst` source trees (relative paths). Everything imported there (and the controller electronics, steel stock, magnet wire and magnets) remains imported here.
