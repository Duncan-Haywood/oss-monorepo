# accel-dataflowbuf: how big must an activation buffer be before the best dataflow for a small keyword-spotting accelerator changes? (stylised)

Follow-up to `accel-dataflow`, track 8 (task-specific AI accelerators) in `PROJECTS.md`; it takes that project's first "Next steps" item, a bounded input buffer. `accel-dataflow` found that giving every dataflow an unbounded activation buffer flips the winner at 32 lanes, and left open how large the buffer has to be. Here the buffer has a size K, in 8-bit words. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-dataflowbuf/

**Builds on.** `research/accel-dataflow` (its schedules, simulator and cost model are imported unchanged) and `research/accel-kws` (the 40 models). Dataflow vocabulary follows Chen, Emer and Sze (2016), "Eyeriss", ISCA, and Sze et al. (2017), *Proc. IEEE*; the buffer is a small LRU cache, not a design from either paper. Energy constants are `accel-kws`'s assumed ones (Horowitz 2014 style, not re-checked). No paper's numbers are reproduced, and the project builds on none of the CU Boulder groups in `prompt.md`.

## Method
- Same four schedules and counts as `accel-dataflow` (OS, WS, IS, RT; lanes P; batch B; both layers of each model). Only activation (`x`) reads change.
- **Buffer.** An activation `(b, i)` is free if it was on the broadcast bus last cycle (as before). Otherwise it is looked up in a K-entry LRU buffer. A hit costs a buffer read; a miss costs an SRAM read and fills the buffer. K = 0 reproduces `accel-dataflow` (a test checks it), and the lookups-total is independent of K.
- **Buffer-read energy** is `rb` times SRAM energy per bit, with `rb` = 0.1 and 0.5 (both **assumed**, not taken from a library or a paper). Buffer area is reported only as K words (8K bits); no area model was built, so the cost of a buffer is not converted into energy or area here.
- Sweep: K in {0, 4, ..., 512}, P in {8, 16, 32}, B in {1, 4}, 40 models. WS is omitted from B = 4 discussion below because it is 9x worse there, as in `accel-dataflow`.

## Reproduce
```bash
cd research/accel-dataflowbuf
python3 -m unittest discover -s tests -v   # 4 tests, <1 s
python3 experiments/run.py                 # ~2 min; writes experiments/results.json and results.txt
python3 experiments/figure.py              # needs matplotlib; writes experiments/buffer.png
```

## Results (from `experiments/results.txt`; assumed constants, 40 models, rb = 0.1 unless stated)
- **Batch 1.** OS and WS (identical schedules at B = 1) win all 40 models at every K, P and rb tried. A buffer only matters for RT: RT's median energy relative to the best falls from 2.3x to 1.1x once K reaches 128 (rb = 0.1; to 1.6x at rb = 0.5), but never overtakes OS.
- **Batch 4 flips the winner, at a small K.** OS is the sole winner for K = 0. The first K where another dataflow ties or beats OS is **32 words at P = 8, 64 at P = 16, 128 at P = 32** (each for 10 of 40 models, all with 8-bit weights; at P = 32 also the 3- and 4-bit models, so 30 of 40). In all those cases the winner is IS. The size scales with P, in these runs as K = 4P. I did not establish why; one candidate is that K then holds a lane-tile of the activation stream for several batch elements, but that was not tested.
- **The rest never flip.** The 2-bit models keep OS as the sole winner at every K up to 512 (the largest tried, which exceeds B x 120 = 480 words); so do the 3- and 4-bit models at P = 8 and 16.
- **With the buffer-read price at 0.5x SRAM** the flips mostly vanish: no model flips at P = 8, 1 of 40 at P = 16, 10 at P = 32 (K = 128). So whether a buffer changes the dataflow depends on how cheap the buffer is relative to SRAM, an assumed number.
- **What each dataflow needs.** Median smallest K within 5% of its own K = 512 energy at B = 4: IS 32 / 64 / 128 words at P = 8 / 16 / 32; RT 512 at all P; OS 0 at P = 16 and 32 (512 at P = 8). So IS gets most of its saving from a small buffer; RT needs a full-vector buffer.

## Limitations
- Stylised. Inherits every limitation of `accel-dataflow` (1-D array, plain matrix-vector layers, batch as a software knob, no leakage, assumed constants, third-party dataset mirror in `accel-kws`).
- No RTL for the buffer; no area or leakage cost for K words, so a "flip at K words" is not a claim that the buffered design is cheaper in silicon. LRU is one policy; a scheduler-aware (Belady-like) buffer could need fewer words.
- Winner margins are small in places (median OS within 1.02x to 1.2x of the best); the 5% rule of thumb in `accel-dataflow` applies.
- Ties count as wins for each tied dataflow, and the IS/RT flips at P = 16 and 32 for K = 512 include exact RT = IS ties.

## Next steps
Give the buffer an area and leakage cost from an open PDK macro or flop count (see `accel-pdkprice`) so the flip becomes a net-energy claim; write the IS engine with a K-word buffer in RTL and compare counts with this model; try a Belady-optimal buffer as a lower bound.

## Owner steps
None. Simulation only; no hardware was specified, bought or measured.

## Outside dependencies (vitamins)
`accel-dataflow`'s simulator and `accel-kws`'s trained models and assumed energy constants. Python standard library; matplotlib for the figure.
