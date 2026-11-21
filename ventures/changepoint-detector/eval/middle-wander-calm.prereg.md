# Pre-registration: a calmer wander gate under the count Middle (2026-11-21)

Written and committed before any run of `eval/middle-wander-calm.mjs` on the seeds below (a smoke run with
`SEED_SHIFT=8500 NSEEDS=1` checks wiring only). Probes on seeds 9901-9916 decide nothing and are not reused.

**Why.** README "A wandering level under Middle" (2026-11-21) shipped the wander gate (W, `--wander gated`) as an
opt-in because it failed K3: on calm simulated Search Console sites (cv 0.15) the gate sometimes opened and the drift
fit read a slow 10% fall as wander, so Middle's change was dropped (W - M +0.68 days unaware per fall, upper end 1.42
against +1.0). The README named two fixes to try: a higher margin than log n, or the drift fit's jump penalty changed.

**What the probes showed** (16 probe seeds; `eval/middle-wander-calm-probe.mjs`, outputs
`eval/middle-wander-calm-probe.out.txt`, `-probe2`, `-probe3`). Cells: calm sites (cv 0.15, base 50 and 400, 10% and
20% falls), where W heard 3 fewer falls than M (52 against 55 heard pooled; W lost 2 at base 400 10% and 1 at base
50 20%), and set 3's T4, T5 (wander) and T6 (growth then a fall). Alerts on T4 + T5: M 29, W 17.

| variant | falls heard of 64 (calm cells) | T4 + T5 alerts | T6 heard of 16 |
|---|---|---|---|
| M (Middle) | 48 | 29 | 15 |
| W (shipped gate) | 45 | 17 | 14 |
| A2: margin 2 log n | 48 | 25 | 15 |
| A3: margin 3 log n | 48 | 26 | 15 |
| J1: drift jump penalty log n (not 2 log n) | 48 | 29 | 15 |
| T1: keep a change if a drift jump forced there gains > log n | 45 | 20 | 14 |
| T05: same, > 0.5 log n | 46 | 22 | 15 |
| **H60: decide on the window before the newest change** | **48** | **22** | **15** |
| S: whole window, newest change as a given jump | 48 | 23 | 15 |

The higher margins and the lower jump penalty keep every fall but give back most of the cut on wander (they let the
gate open less everywhere); the forced-jump test barely rescues falls. H60 asks whether the level wandered *before*
the change Middle is about to report, so a real fall on a calm site, which is not wander, cannot be what opens the
gate. It kept every fall M heard on the probe and the most of W's wander cut among the fall-safe variants, so it is
the candidate.

**The candidate, V.** `COUNT_MIDDLE` plus `wander: 'gated'` plus engine option `wanderBefore: 60`
(`watch-core.mjs` `wanderFilter`): when at least 60 points of the window precede the newest change Middle found, the
gate's open/shut decision is made on the window up to that change; if it is shut, every change is kept. If it is open,
or fewer than 60 points precede the change, W's rule applies unchanged (the whole-window gate and its jumps).

**Arms.** M: `COUNT_MIDDLE`. W: the shipped `--wander gated`. V. All `--model poisson`, watch defaults otherwise,
replayed each day, paired by seed. The count default D, reported only in the last round, is left out to save an hour.
Sets, generators and scoring are those of `eval/middle-wander.prereg.md`, on **fresh seeds**: set 1 **5501-5520**
(20 per cell, cv 0.15 and 0.30), set 2 **7001-7060** (60 per cell), set 3 **5701-5740** (40 per cell). Bootstrap
seed 20261125, 10,000 resamples.

**Bars against Middle (K), unchanged from the last round, with V in W's place.**
- K1: set 3, T4 and T5 pooled, V's alerts at most half of M's.
- K2: set 3 T6, falls heard V at least M's minus 4 of 40.
- K3 (the point of this round): set 1, at each cv, mean days unaware over the nine fall cells, V minus M, upper end of
  the 95% paired bootstrap interval at most +1.0.
- K4: set 2, steps found V minus M, lower end at least -7 of 360; pooled false alerts per 1,000 checks V minus M,
  upper end at most +0.5.
- K5: set 3, T1-T3 each, V's alerts per 1,000 days at most M's + 1.0.

**Decision.**
- All K pass: `COUNT_MIDDLE` gains `wander: 'gated'` with `wanderBefore: 60` (the last round's rule for W).
- K1 fails, all of K2-K5 pass, and **K1'** holds (T4 + T5 pooled, V's alerts at most two thirds of M's): `COUNT_MIDDLE`
  stays, and `--wander gated` switches to V (the opt-in keeps a real cut on wander and stops costing calm sites their
  small falls). The README says how much of W's wander cut it gives back.
- Otherwise: nothing changes; W stays the opt-in and `wanderBefore` stays an engine option for rounds.

**Known risks, written before the runs.** On the probe H60 cut T4 + T5 alerts by a quarter (29 to 22), not by half, so
K1 is expected to fail and K1' is close. The prefix gate is weaker when the newest change is early in the window (less
history). A real wander whose first stretch is calm keeps more alerts under V than W.
