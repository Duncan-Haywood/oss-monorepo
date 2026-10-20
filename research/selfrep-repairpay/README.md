# selfrep-repairpay: does paying for spares late rescue the long repair queue? (stylised)

Follow-up to `selfrep-repairlabour` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the first of that project's listed next steps: pay spares at service start and see whether an unbounded queue is still worse than never repairing. Why it seemed worth doing: that project's headline ("a long queue is dead stock") depended on a modelling choice, buying spares the moment a machine breaks, that a real shop need not make. A discrete-event simulation (standard library). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-repairpay/

**Builds on.** `research/selfrep-repairlabour` (this model is a copy of its simulator with one added parameter `pay_at`), and through `research/selfrep-growth` and `research/selfrep-closure` (imported by relative path), W = 50.0 h and V = 170.3 per copy (assumed units). Behind them: Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>; von Neumann (1966); Freitas and Merkle (2004). This project builds on none of the CU Boulder groups in `prompt.md`.

## Method
- Same shop as `selfrep-repairlabour`: K repair benches, exponential repair time (mean h = 50 h), spares cost c = 0.2 of V with success s = 0.9, breakdowns exponential with mean L = 2000 h, import stream B per hour, reserve 1.0, 60 runs per row, 20000 h, seed 0.
- `pay_at = "join"`: spares are bought when the machine breaks (the earlier project). `pay_at = "service"` (new): a breaking machine joins the queue for free; when a bench frees up, the spares are bought then, and if the stock is short at that moment the machine is retired.
- Pre-run expectation: paying late stops waiting machines locking up vitamins, so the unbounded queue should no longer lose to replace-only.

## Reproduce
```bash
cd research/selfrep-repairpay
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, standard library only
python3 experiments/run.py                                 # about 75 s; writes experiments/results.txt
python3 experiments/figure.py                              # writes experiments/pay_rule.svg from results.txt
```

## Results (from `experiments/results.txt`; working fleet, tail-quarter mean, median over runs)
- **The expectation held.** At B = 40 with an unbounded queue, paying at service start gives 488 / 518 / 572 / 681 / 910 working machines for K = 1 / 2 / 4 / 8 / 16 benches, against 414 / 446 / 504 / 629 / 861 when paying at breakdown. Replace-only is 458. So with one bench the unbounded queue now beats never repairing (488 against 458) instead of losing to it (414).
- **So the earlier "dead stock" result was largely a payment-timing effect.** The queue is just as long when paying late (about 3400 machines waiting at K = 1, more than before) but it no longer ties up spares, so it costs nothing beyond the machines already built.
- **The queue cap stops mattering.** With K = 1 the capped fleets sit between 484 and 492 for every cap from 1 to 200, under both pay rules; the unbounded service-start queue (488) is inside that band. With K = 4 the band is 568–573 and the unbounded service-start queue gives 572. I did not compute standard errors; differences of a few machines between caps are not resolved and I report no optimal cap. The optimum-cap question is answered only as "any cap from 1 up is about equally good here".
- **Import-limited shops barely notice.** At B = 4, K = 1 / 2 / 4: 74 / 102 / 143 paying late, against 68 / 96 / 142 paying early.
- A queue that is free to join can still be wasteful in ways this model omits: waiting machines are counted as built assets that a real shop would store, power, or lose.

## Limitations
- Stylised: every input is assumed, as in `selfrep-repairlabour`; no real repair time, labour cost or bench count is claimed.
- Under "service", a machine whose turn comes when stock is short is retired outright rather than waiting for stock; a wait-for-stock rule is not tested.
- A single seed set, 60 runs per row, no confidence intervals; the memoryless breakdowns and as-good-as-new repairs of the parent models remain.
- First-come service only; no priority for machines that are cheap to repair.

## Next steps
Make the benches out of machines the shop builds itself, so labour competes with building; let a machine wait for stock instead of retiring; add confidence intervals so a cap optimum can be resolved or ruled out.

## Owner steps
- Measure a real repair time and the labour a repair takes, and replace the assumed h and bench count.
- Replace assumed vitamin costs with dated quotes (source and date), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
