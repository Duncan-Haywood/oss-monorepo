# selfrep-repairlabour: what happens when repairs need labour? (stylised)

Follow-up to `selfrep-repair` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking that project's listed next step "add repair labour as a constraint on machine-limited growth". Why it seemed worth doing: `selfrep-repair` found that repair downtime hardly matters because the shop is import-limited. This asks what happens when repair capacity, not vitamins, is scarce. A discrete-event simulation (standard library). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-repairlabour/

**Builds on.** `research/selfrep-repair` (same build, breakdown and spares rules; the model is a modified copy of its simulator) and, through `research/selfrep-growth` and `research/selfrep-closure` (imported by relative path), W = 50.0 h and V = 170.3 per copy (assumed units). Behind them: Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>; von Neumann (1966); Freitas and Merkle (2004). This project builds on none of the CU Boulder groups in `prompt.md`.

## Method
- Repairs need one of K *benches* (labour). A broken machine buys its spares (c = 0.2 of V, success s = 0.9, as in `selfrep-repair`) and joins a first-come queue; a repair takes an exponential time with mean h on a bench. Queued and in-repair machines are not working.
- `queue_cap` (new): a breakdown that finds that many machines already waiting is retired instead (no spares bought). `0` is replace-only.
- Pre-run prediction (`labour_cap`): the working fleet is about min(import-limited fleet, K L / h), since a bench clears 1/h repairs per hour and each working machine breaks at 1/L.
- 60 runs per row, 20000 h, start from one new machine, seed 0, reserve 1.0 V.

## Reproduce
```bash
cd research/selfrep-repairlabour
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, standard library only
python3 experiments/run.py                                 # about 25 s; writes experiments/results.txt
python3 experiments/figure.py                              # writes experiments/queue_cap.svg from results.txt
```

## Results (from `experiments/results.txt`; L = 2000 h, h = 50 h unless stated)
- **The labour-cap prediction failed.** With B = 40 (machine-limited) and K = 1 / 2 / 4 / 8 / 16 / unlimited benches the working fleet was 414 / 446 / 504 / 629 / 861 / 1424 against caps of 40 / 80 / 160 / 320 / 640. The fleet is well above the cap because the cap assumes every breakdown is repaired; with too few benches most are not.
- **A growing queue is dead stock.** In the same runs 2915 machines (K = 1) sat waiting at the end, each having already paid for spares. The replace-only fleet at B = 40 is 457.6, so one bench with an unbounded queue (413.8) is *worse than never repairing*.
- **Capping the queue fixes most of it.** With K = 1, queue caps of 1 / 5 / 20 give 487 / 492 / 488 working machines, above replace-only (458) and the unbounded queue (414). With K = 4 the same caps give 572 / 569 / 570 against 504 unbounded. The result is flat in the cap between 1 and 20 in this sweep; I did not map the optimum.
- **Import-limited shops need few benches.** At B = 4, K = 4 benches already give 142 against 142 for unlimited labour (formula 156.5, the gap known from `selfrep-repair`); K = 1 / 2 give 68 / 96.
- **Repair time** (B = 40, K = 2): h = 5 / 25 / 50 / 100 / 200 gives 985 / 505 / 446 / 416 / 397.
- **Short life** (L = 300 h, B = 40, K = 1): 56 working machines against 222 with unlimited labour.

## Limitations
- Stylised: every input is assumed; no real repair time, labour cost or bench count is claimed. Labour is a count of benches with no wages, shifts or skill.
- The labour cap is a negative result here; I have no corrected closed form, only the runs. The reason I give (unserved breakdowns idle in the queue) is read from the queue lengths, not tested by a separate experiment.
- Spares are paid on joining the queue, which is what makes a long queue costly; paying at service start would change the cost of queueing. Not tested.
- Memoryless breakdowns, repaired machines as good as new, no recycling of retired ones, single seed set, 60 runs per row.

## Next steps
Pay spares at service start and see whether the unbounded queue is still worse than replace-only; find the optimal queue cap; make benches out of machines the shop builds itself (labour then competes with building).

## Owner steps
- Measure a real repair time and the labour a repair takes, and replace the assumed h and bench count.
- Replace assumed vitamin costs with dated quotes (source and date), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
