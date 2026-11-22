# Draft section: compress every sync but the last

*Draft for the programme paper (milestone 7). AI-assisted; no affiliation implied. It pulls together milestones 6w to 6ae of `LOG.md`. 6ae was run for this section. The tables come from `python3 paper/recipe_table.py --write` (stdlib only, reads the stored `.jsonl` files, see [`recipe_table.md`](recipe_table.md)). Table B and the pooled slopes are exploratory: they were computed while this section was being written, after every run they use. Everything else was registered in `LOG.md` before the runs. The three arXiv ids were machine-checked with the proposal's (`cite_check.py`, 2026-10-29; arxiv.org was refused through this session's proxy on 2026-11-22). What each paper says is taken from its abstract-level claim, not a full re-read.*

## Question

In DiLoCo-style training, workers send their parameter deltas to the outer step once every H inner steps. Unbiased compression of those deltas (rand-k keeping a fraction p, relative variance omega = 1/p - 1) saves bytes and adds noise to the outer step. Section `section_compression.md` showed that at H = 64 the noise costs nothing measurable up to keep 1/8 (omega 7) and then grows linearly, while at H = 16 it costs from the start. This section asks why compression is free at long sync intervals, and whether a practitioner can do better than "free".

## Setup

As in `section_compression.md`, size 2: a 914,880-parameter GPT (dim 192, 2 layers, 6 heads), Tiny Shakespeare at character level, M = 4 simulated workers, batch 16 per worker, 3,840 inner steps per worker, inner AdamW lr 2e-3, plain averaging as the outer step (outer SGD lr 1, which 6y found best among lr 0.7, 1, 1.5, 2 and Nesterov 0.7/0.9). Every run is deterministic given its seed: a fork of a stored run reproduces that run's loss bit-exactly, checked in every milestone from 6w to 6ad (every registered reproduction check was exact, including across the two torch builds used, 2.15.0+cpu and 2.15.0+cu132 on CPU).

Losses are scored on two batch sets: the 16 standard validation batches every earlier milestone used, and 64 fresh validation batches drawn with a different seed (introduced in 6y so that a result chosen on the standard batches is scored on batches nobody looked at). Both are drawn from the same validation text; neither is a held-out split of the training text.

The decomposition (6x). Fork every compressed run just before its last sync and finish it twice: *full* (the last sync compressed too, which is the stored run) and *clean* (the last sync sent dense). Then, paired by seed against the uncompressed run at the same H:

- C = full - uncompressed, the cost of compression as usually measured;
- T = clean - uncompressed, the cost of the compressed *trajectory* before the last sync;
- b = full - clean = C - T, the cost of the last compressed sync alone.

T is also a training recipe: compress every sync but the last, and send the last one dense. It costs 1/H of a run's syncs at full size.

## Results

1. **A single round of compression noise is not washed out** (6w). Injecting one round of rand-k noise at omega 7 mid-training into an otherwise uncompressed run, its parameter-space energy survives 256 further inner steps at both H (it grows 6 to 7%), and the loss bump is larger at H = 64 (+0.012) than at H = 16 (+0.006). A run compressed on every sync at the same level is free at H = 64. Per-round costs do not add up to the run's cost.
2. **The free region is two effects of opposite sign** (6x). At omega 7 the last compressed sync costs about what a single round costs mid-training (b = +0.012 at H = 64, +0.006 at H = 16), and runs compressed throughout do not adapt to it. The trajectory before it is worse than uncompressed at H = 16 (T = +0.016) and *better* at H = 64 (T = -0.014, se 0.0035, all four seeds). The break-even C at H = 64 is that gain cancelling the unrepaired last sync.
3. **It is not an under-tuned baseline** (6y). Plain averaging is the best uncompressed outer step tried. On the fresh batches the omega-7 recipe ends 0.014 below it (se 0.006) and 0.020 below outer lr 0.7. Outer lr 1.5 reaches nearly the recipe's weight norm and ends 0.05 worse, so the gain is not larger weights.
4. **It is a property of outer-step noise, not of sparsity** (6v, 6z, 6aa). Gaussian noise with rand-k's per-coordinate variance and no coordinate dropped gives the same T as rand-k at omega 3 (+0.0004 apart, 0.1 se) and omega 7 (Table A).
5. **At H = 64 the gain has an interior optimum near omega 3** (6z, 6aa). Fresh T is -0.012 at keep 1/2, -0.0185 (0.0020) at keep 1/4 on four seeds (**-0.0134 (0.0026)** on eight, item 8), -0.014 at keep 1/8, +0.011 at keep 1/16 and +0.081 at keep 1/32 (Table A). With Gaussian noise at omega 1/3, 1 and 3 it is -0.001, -0.007 and -0.018. The gain turns into a cost between omega 7 and 15.
6. **The gain needs long inner loops** (6ab to 6ad). At H = 16 no omega from 1 to 7 beats uncompressed training: keep 1/2 and 1/4 tie (-0.004, -0.0004), keep 1/8 costs +0.014 (3.9 se). At H = 32 keep 1/4 is at -0.0072 (0.0041) over eight seeds, 7 of 8 below zero but short of 2 se, and keep 1/8 ties. Exploratory (Table B): per seed, keep 1/4's fresh T falls by 0.0091 nats per doubling of H (se 0.0021, four seeds, all negative), keep 1/8's by 0.0141 (se 0.0040), keep 1/2's by 0.0043 (se 0.0058, not resolved).
7. **The last sync's own cost is linear in omega, with a slope that grows and then saturates in H** (Table C). b / omega is 0.0007 to 0.0009 at H = 16, 0.0013 to 0.0017 at H = 32 and 0.0013 to 0.0019 at H = 64, for every noise and omega from 1/3 to 31.
8. **The headline cell holds over eight seeds, at a smaller size** (6ae). Seeds 4 to 7 were added for keep 1/4 at H = 64, registered before the runs. Pooled over eight seeds the recipe ends **-0.0134 nats (se 0.0026)** below uncompressed training on the fresh batches, 7 of 8 seeds below zero, exact sign-flip P = 0.016. That is the first recipe cell whose permutation test clears 0.05. The new seeds alone give -0.0084 (0.0031), against -0.0185 (0.0020) for the first four (difference 2.7 se), so the four-seed figure was a favourable draw. The fully compressed run ends -0.008 (0.003) on the fresh batches, and b / omega pooled is 0.0020.

## Reading

The usual measurement, C, mixes two terms that move in opposite directions as H grows: the trajectory term T, which turns from a cost into a gain, and the last-sync term b, which is a cost proportional to omega whose slope roughly doubles from H = 16 to 32. "Compression is free up to keep 1/8 at H = 64" is the point where they cancel. Taking b out with one dense sync exposes T. No mechanism for T has been found. The step's noise budget (6u), sparsity (6v) and weight norm (6y) are ruled out, and the gain growing with H and with omega up to about 3 is what a mechanism has to explain. Outer-step noise acting as a regulariser on long inner loops is one candidate the data do not contradict; it has not been tested.

## What it means in practice

For a practitioner running DiLoCo-style training at this scale, the defensible recommendation is **rand-k keep 1/4 on every sync but the last, and the last sync dense**. It has not been measurably worse than uncompressed training at any H tried (16, 32, 64), it is at or below uncompressed at every one, and it sends a quarter of the bytes on all syncs but one. Whether it gains, and by how much, depends on H: nothing at H = 16, an unresolved -0.007 at H = 32, and -0.013 (se 0.003) at H = 64 over eight seeds (item 8). Keep 1/8 needs H = 64 to break even or gain. Without the dense last sync, every setting pays b, about 0.0016 omega nats at H = 32 to 64.

## Related work

DiLoCo (Douillard et al., arXiv:2311.08105) is the algorithm studied. Charles et al. (arXiv:2503.09799) fit scaling laws for DiLoCo in model size, M and H with no compression term. Stich (arXiv:1805.09767) gives local-SGD rates in which compression noise only adds variance, so it predicts C >= 0 and no T < 0. The variance factor omega comes from the unbiased-compressor literature the proposal cites. We know of no work that separates the last sync's cost from the trajectory's, or that reports compression noise *improving* the final loss of local SGD. That claim is limited to what the proposal's 16 related works and the three ids above cover, not to a systematic search.

## Limits

One corpus at character level, one width (915k parameters), M = 4, one token budget, one inner lr. Four seeds per cell except keep 1/4 and 1/8 at H = 32 and keep 1/4 at H = 64 (eight each). 6ae showed a four-seed mean can be off by twice its se (-0.0185 against -0.0084 on the next four), so the four-seed cells' differences between omegas at H = 64 are provisional. The fresh batches are new draws from the validation text, not a held-out split of the training text. With four seeds an exact sign-flip test cannot reach P < 0.125, so the "all four seeds" statements are not significance claims. Table B's slopes were computed post hoc over three H values. The outer step was tuned only for the uncompressed run (6y), not for the recipe.

## Reproduce

`experiments/gpt_scale/`: `contraction_6w.py`, `lastround_6x.py`, `tuned_6y.py`, `recipe_6z.py`, `recipe_6aa.py`, `recipe_6ab.py`, `recipe_6ac.py`, `recipe_6ad.py`, `recipe_6ae.py`, each with `run` and `report` and its stored `.jsonl` and `.txt`. Runs take 15 to 23 minutes each on one CPU core, four in parallel. The tables in this section: `python3 paper/recipe_table.py --write`.
