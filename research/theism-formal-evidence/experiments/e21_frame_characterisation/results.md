# E21: which Kripke frames let GodIsEssential fail in Anderson's variant

**Question.** E19 and E20 found that GodIsEssential, a middle step of the AFP's formalisation of
Anderson's ontological argument (Fuenmayor & Benzmüller, AFP 2017, `AndersonProof.thy`), fails
only in some K and K4 frames and never in reflexive or symmetric ones. E20 showed the failures
need a coarse property algebra. Neither said *which frames* allow a failure. This step asks for an
exact frame condition, with rigid positivity (A4a, stages II and III) and without it (stages I
and III-noA4).

**Prediction.** H25 in `LOG.md`, written and committed before this script and the Lean file.

## Method

- **Lean 4** (`lean/TheismFormal/AndersonFrames.lean`, core library only, no `sorry`, no
  warnings, every theorem axiom-free; `lean_build.txt`). Definitions are `AndersonK.lean`'s (E19):
  any accessibility relation, any domains (possibly empty), any Henkin-style property collection.
- **Search** (`run.py`). It reuses E19's exact model enumeration unchanged on every frame up to
  3 worlds × 2 individuals and 2 × 3: every relation, every domain assignment, every partition of
  the cells. That is 6,884,324 frames and 3,470,126 models, in 1,273 s. For each model, world and
  God-like individual it checks H25 (a). For each relation and world it records whether *some*
  model (any domains, partition, individual count) fails GodIsEssential there, per stage, and
  compares that with the frame conditions.

## Results

| H25 | claim | outcome |
|---|---|---|
| (a) | for God-like x at w: essence iff every existing God-like z at every successor v has, at v, every property positive at w | **proved** (`essential_iff`, A2 and T2 only); search: 0 mismatches in 7,915,874 (model, world, individual) checks |
| (b) | T2 makes God-likeness persist along R* | **proved** (`god_reach`) |
| (c) | without A4a, safe at w if every edge out of w lies on a cycle | **proved** (`essential_cycle_edges`; E19's `essential_symm` is a one-line corollary); search: 0 failures at such worlds |
| (d) | with A4a, safe at w if every successor of w lies on a cycle | **proved** (`essential_a4`; E19's `essential_refl` is a one-line corollary); search: 0 failures at such worlds |
| (e) stage II, III | with A4a, a failure exists at w iff some successor of w is on no cycle | **held**: 1,048 of 1,048 (serial relation, world) pairs agree, at both stages |
| (e) stage I, III-noA4 | without A4a, a failure exists at w iff some edge out of w is off every cycle | **refuted**: 822 of 1,048 agree; at 226 worlds the edge condition holds but no model fails |
| (f) | non-serial relations have no stage-I model | **held** (0 models) |

(Relation, world) pairs where some model fails, against each condition (frames up to 3 × 2 and 2 × 3):

| stage | A4a | pairs | agree with H25 (e) | H25 predicts failure, none found | failure H25 did not predict |
|---|---|---|---|---|---|
| I | no | 1,048 | 822 | 226 | 0 |
| III-noA4 | no | 1,048 | 822 | 226 | 0 |
| II | yes | 1,048 | 1,048 | 0 | 0 |
| III | yes | 1,048 | 1,048 | 0 | 0 |

Failing pairs: 36 without A4a, 24 with it. The smallest failing frame, at every stage, has
3 worlds and 2 individuals: 2 → 0 → 1 → 1 (world 1 sees only itself). The failure is at world 2,
whose successor 0 is on no cycle. No 2-world frame allows a failure at any stage.

**Why stage I's converse failed (found after the search, not predicted).** H25 (e) forgot that
a God-like x at w is also God-like at every successor v (T2). Then the positive properties at v
are both "what x has at v's successors" and "what z has there". When v's successors are among w's,
everything positive at w is positive at v, and z has it at v whenever some world z is God-like at
sees v. The condition that matched the quick run (2 worlds) was: every successor v of w has some
u in R*(v) that sees v and sees only successors of w. It is **proved sufficient**
(`essential_back`, axiom-free) and labelled post-hoc in the Lean file and `run.py`. On the full
search it agrees at 1,024 of 1,048 pairs without A4a. At the other 24 (all at 3 worlds, e.g.
2 → 0, 0 → {0, 1}, 1 → 1) it allows a failure that no model shows. By hand for that example: x
and z are both God-like at 0 and 1, so the positive sets there force (z, 0) into the block of
(x, 0), and no positive property at 2 can separate them. So without A4a the exact condition
depends on which blocks the positive sets force together, not on the frame alone, and is still
open.

**Reading.** With A4a (the setting of the AFP's proof), the frame condition is exact at these
sizes: GodIsEssential can fail at w just when w sees a world that never returns to itself. In a
finite serial frame every world reaches a cycle, so the failure needs a "transient" world between
w and the cycle. That is why reflexive frames (every world is its own cycle) and symmetric ones
(every edge is a 2-cycle) never fail. The AFP's reflexivity assumption is much stronger than the
step needs: it is enough that every world seen is on some cycle, of any length. Without A4a,
"every edge out of w lies on a cycle" is sufficient but far from necessary.

## Limits

- The converses are search results on at most 3 worlds and at most 2 individuals at 3 worlds
  (3 at 2 worlds); the Lean theorems carry only the sufficient directions. A Lean construction of
  a failing model for every transient successor (the stage-II converse in general) was not done
  here; E22 proves it for every serial frame (`essential_a4_iff`,
  [E22 results](../e22_transient_countermodel/results.md)).
- Stage I's exact condition is open: the 24 pairs show it depends on the algebra, not only on R.
- As in E19 and E20, the semantics is the AFP file's as we read it, not Anderson (1990) directly.

Reproduce: `python3 research/theism-formal-evidence/experiments/e21_frame_characterisation/run.py`
(about 22 min; `--quick` for sizes up to 2 × 2) and `bash research/theism-formal-evidence/lean/build.sh`.
