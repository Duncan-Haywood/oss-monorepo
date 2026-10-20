# selfrep-platepack: how many parts should a replicating printer print per plate to double its shop fastest?

Follow-up to `selfrep-partpool` (track 1, `PROJECTS.md`), taking the first item of its "Next steps": plate packing. Real part masses are not available (the `selfrep-closure` bill of materials has only assumed placeholders), so this project does not invent them; it tests packing with the uniform parts instead. It asks a new question about the shop, not another sweep of earlier results. Produced with AI assistance (Claude). Computed only; no printer was built or timed.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-platepack/

**Builds on.** `selfrep-partpool` (simulator, policies, inputs), `selfrep-growth` and `selfrep-closure` (the 44 printed parts of the RepRap Prusa Mendel), all imported by relative path, not copied. RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. It builds on none of the labs in `prompt.md`.

## Method
- The 44 printed parts (1.0 h each at the assumed 25 g/h) are grouped k to a plate, k in {1, 2, 4, 11, 22, 44} (divisors of 44, so every plate is full and identical). A plate job takes k hours plus an **assumed** changeover of 0, 0.25, 0.5 or 1 h (heat-up, bed clear, plate swap). Assembly (6 h) and vitamins are as in `selfrep-partpool`; imports are unlimited so machine time binds.
- Policies `focus` (a shared pool serving the oldest copy first) and `whole` (one copy per printer), fleet 1 to 64, job CV 0.2, 100 runs per cell, seed 0. Effective doubling = time / 6.

## Reproduce
```bash
cd research/selfrep-platepack
python3 -m unittest discover -s tests -v     # 8 tests, standard library only
python3 experiments/run.py                   # about 10 s; writes experiments/results.txt
python3 experiments/figure.py                # plots section A to experiments/plate_size.svg
```

## Results (from `experiments/results.txt`; hours, median effective doubling)
- **Changeover moves the best plate size from one part to several.** For the pooled `focus` fleet the best k is 1 at no changeover (43.2 h), 4 at 0.25 h (46.4 h), 11 at 0.5 h (47.8 h) and 11 at 1 h (49.6 h). One part per plate at 1 h changeover is 78.3 h.
- **Big plates cost the pooling gain.** With 22 or 44 parts per plate `focus` has only 2 or 1 jobs per copy to share; at one plate per copy it equals `whole` (52.5 h at c=0).
- **Pooling stays ahead at each policy's best plate size**: 15.5%, 12.1%, 10.2% and 7.6% faster than the best `whole` at changeover 0, 0.25, 0.5 and 1 h. `whole` prefers one-plate copies once there is any changeover (k=44 is its best from c=0.25).
- Every number depends on the assumed changeover; the finding that the best plate size grows with it is the result, the particular k is not.

## Limitations
- Stylised. Print rate, assembly time and changeover are assumed; the BOM masses are placeholders, so parts are identical and a plate's print time is exactly k times one part's. Real plate packing is limited by bed area and part shape, and a multi-part plate that fails loses all its parts; **failed prints are not modelled**, which favours big plates.
- Only divisors of 44 are tried. Assembly is done by a printer, as in `selfrep-partpool`.
- One seed series; no confidence intervals on a real shop.

## Next steps
Add a per-plate failure probability (a failed plate is reprinted) and see how far it pulls the best k back down; replace the uniform parts with weighed masses once the owner step is done.

## Owner steps
- Time a real printer's plate changeover and weigh the printed parts; replace the assumed values.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-partpool` and `selfrep-closure` source trees (relative paths). The printers need the vitamins listed in `selfrep-closure`.
