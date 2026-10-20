# selfrep-capsequence: in what order should a printer-replicating shop learn its process capabilities?

A new question for track 1 (`PROJECTS.md`), taking the "Next steps" of `selfrep-capability` (a time dimension) one step further. That project picked the best *set* of capabilities for a budget; a shop learns them one at a time, so here the choice is a *sequence*, scored by how much closure the shop holds, and for how long, while it is still learning. Produced with AI assistance (Claude). Computed only; nothing was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-capsequence/

**Headline (stylised, preliminary).** With the assumed efforts of `selfrep-capability`, the best order by cost closure is stamping, winding, lathe, heat treatment, grinding, ball-forming; by mass closure it is lathe, stamping, winding, heat treatment, grinding. Walking up the budget frontier of `selfrep-capability` (cheapest set first) is a poor order: over a 24-week horizon it scores only 54% (mass) and 73% (cost) of the optimum. A greedy rule that takes the best gain-per-week *bundle* of capabilities comes within 0% (mass) to 6% (cost) of the optimum. A rule that ranks one capability at a time reaches 69 to 80%. The optimal order is moderately fragile: with efforts scaled 0.5x to 2x, it stays within 1% of that draw's optimum in 39 to 88% of draws.

## Method
- Capabilities, efforts (weeks, **assumed**) and the line-to-capability map are those of `selfrep-capability`, read from its source tree (relative path), which takes the bill of materials from `selfrep-closure` and `selfrep-learnfirst`.
- A sequence learns one capability at a time; closure steps up when a capability finishes. Score: closure-weeks, the area under closure against time up to a horizon (24, 40 or 60 weeks).
- All 9! = 362,880 orders are covered exactly, by dynamic programming over subsets (the value of the remaining orders depends only on the set learned and the time elapsed); tests check it against brute force on five capabilities.
- Compared: the exact optimum; the order that walks the budget frontier of `selfrep-capability` (add what each frontier set adds, cheapest first); a *lookahead* greedy rule (take the capability bundle with the best gain per week); a *myopic* rule (take the single capability with the best immediate gain per week; after the first, most capabilities unlock nothing alone, so ties fall alphabetically).
- Stability: 1,000 draws scaling every effort by an independent log-uniform factor in 0.5x to 2x; share of draws where the nominal optimal order is within 1% of the draw's optimum.

## Reproduce
```bash
cd research/selfrep-capsequence
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/figure.py                # writes experiments/closure_by_week.svg
```

## Results (from `experiments/results.txt`)
- Closure-weeks as a share of the optimum, horizon 24 / 40 / 60 weeks. Mass: frontier 54 / 76 / 86%, lookahead 100 / 100 / 100%, myopic 80 / 83 / 90%. Cost: frontier 73 / 86 / 92%, lookahead 94 / 97 / 98%, myopic 69 / 85 / 91%.
- Order matters most when the horizon is short, because the gap is closure-weeks lost early; every order reaches the same endpoint (+76 mass and +69 cost points after all 40 weeks).
- By cost, the optimal order is ahead of the others at weeks 8 to 14 (30 points at week 8 against 2 for the frontier order); by week 40 all four orders coincide.
- The set-optimal frontier is not nested: its first step (tube extrusion, 2 weeks, 0.2 points) is not part of the best 8-week set, so a shop following "the best set at each budget" starts down the wrong path.
- Stability of the optimal order (within 1% of the draw's optimum): mass 64% (24 weeks) and 88% (40); cost 39% and 69%. Mean shortfall 0.4 to 3.9%.

## Limitations
- Stylised. Efforts and the line-to-capability map are assumptions inherited from `selfrep-capability`, not sourced from a process study. Capabilities are all-or-nothing, learned strictly one at a time, with no learning curve, parallel work, tooling lead time or quality grade.
- Closure counts a line as made once its capabilities exist; steel stock, wire and magnets are still imported, and the electronics never are.
- Closure-weeks values a point of closure now the same as later and ignores what the shop does with the closure (see `selfrep-reinvest` for that); the horizon choice matters, so three are reported.
- The "lookahead matches the optimum on mass" result holds for this 9-capability instance; it is not a general guarantee.

## Next steps
Let the shop work on two capabilities at once (a team of two), replace the assumed efforts with process data, and make a capability unlock a machine as well so that sequence and `selfrep-nextmachine` are chosen together.

## Owner steps
- Estimate, from shop experience, how long a lathe, winder and heat treatment take to get working at the quality these parts need.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-capability`, `selfrep-closure` and `selfrep-learnfirst` source trees (relative paths). Everything those project imports remains imported here.
