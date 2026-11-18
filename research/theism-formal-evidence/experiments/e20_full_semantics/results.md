# E20: with singleton properties, GodIsEssential needs no frame condition

**Question.** E19 found that GodIsEssential and GodExistenceImpliesNecExistence (GEINE), two steps of
the AFP's formalisation of Anderson's variant (Fuenmayor & Benzmüller, AFP 2017,
`AndersonProof.thy`), fail in some non-reflexive frames, but only in coarse property algebras. Is
that a theorem, and what property does the algebra need? And does the conclusion, GodNecExists,
still need symmetry when every set of cells is a property?

**Prediction.** H24 in `LOG.md`, written before the Lean file and this script.

## Method

- **Lean 4** (`lean/TheismFormal/AndersonFull.lean`, core library only, no `sorry`, no warnings;
  `lean_build.txt` lists each theorem's axioms). Definitions are `AndersonK.lean`'s (E19): any
  accessibility relation, any domains (possibly empty), any Henkin-style property collection. A
  collection is *separating* for x if it has the rigid singleton "is x", its complement, and the
  existence property E!.
- **Search** (`run.py`). It reuses E19's exact model enumeration unchanged, on every frame up to
  3 worlds × 2 individuals (every relation, every domain assignment, every partition of the cells):
  6,884,324 frames, 1,301 s. Each model is classed by frame (K, T, KB, K4, B, S4, S5) and by
  whether its algebra is separating for every individual. Each failure of GodIsEssential is
  checked for a second existing God-like individual at a successor.

## Results

H24 held in all five parts.

| H24 | claim | outcome |
|---|---|---|
| (a) | A1a and T2 leave at most one God-like individual per world, given "is x" and its complement | **proved** (`god_unique`; A1a forces a successor at a godly world) |
| (b) | GodIsEssential in every frame from A1a, A2, T2, given singletons and complements | **proved** (`essential_any`); search: 0 failures in 71,002 separating stage-III models, every class |
| (c) | GEINE in every frame from A2 and T2, given "is x" and E! (no A1a, A4a or A5) | **proved** (`god_exists_succ`, `geine_any`); search: 0 failures in separating models |
| (d) | any algebra: a GodIsEssential failure for x at w means a successor has another existing God-like individual | **proved** (`essential_failure`); search: all 5,256 failing (world, individual) pairs have one, 0 do not |
| (e) | symmetry still needed for GodNecExists under full semantics | **proved** (`cm_s4_full`: 2 worlds, 1 individual, R = ≤, every `Unit → Fin 2 → Prop` a property; A1a, A2, T2, A4a, A5 hold; GodNecExists fails at world 0) |

Failures / models (stages II and III; frames up to 3 × 2, every relation):

| statement | stage | algebra | K | T | KB | K4 | B | S4 | S5 |
|---|---|---|---|---|---|---|---|---|---|
| GodIsEssential | II | not separating | 792/147,891 | 0/33,978 | 0/21,984 | 2,304/179,005 | 0/1,515 | 0/176,600 | 0/26,940 |
| GodIsEssential | II | separating | 0/22,623 | 0/4,950 | 0/3,054 | 0/23,229 | 0/270 | 0/14,810 | 0/2,066 |
| GodIsEssential | III | not separating | 648/69,177 | 0/12,810 | 0/7,636 | 1,512/140,365 | 0/333 | 0/100,128 | 0/20,464 |
| GodIsEssential | III | separating | 0/22,623 | 0/4,950 | 0/3,054 | 0/23,229 | 0/270 | 0/14,810 | 0/2,066 |
| GEINE | III | not separating | 0/69,177 | 0/12,810 | 0/7,636 | 1,164/140,365 | 0/333 | 0/100,128 | 0/20,464 |
| GEINE | III | separating | 0/22,623 | 0/4,950 | 0/3,054 | 0/23,229 | 0/270 | 0/14,810 | 0/2,066 |

The failure counts equal E19's (648 K and 1,512 K4 for GodIsEssential at stage III, 1,164 K4 for
GEINE), so the reused enumeration agrees with itself. Every one of them is in a non-separating
algebra.

**Reading.** The frame conditions the AFP's proof uses for these middle steps (reflexivity, and
A4a) were standing in for something else: an algebra that tells individuals apart. Without it,
two individuals can share every property and both be God-like at one world. Then God-likeness
need not be an essence of either. With it, both steps hold in plain K. The conclusion is
different. GodNecExists needs symmetry whatever the algebra, as E19 found and `cm_s4_full` now
certifies.

## Limits

- The search covers at most 3 worlds × 2 individuals; the Lean theorems carry the general claim.
- "Separating" is a sufficient condition from the proofs, not a characterisation: many
  non-separating models (all of T, KB, B, S4, S5 here) have no failure either.
- As in E19, the semantics is the AFP file's as we read it, not Anderson's (1990) paper directly.

Reproduce: `python3 research/theism-formal-evidence/experiments/e20_full_semantics/run.py`
(about 22 min; `--quick` for sizes up to 2 × 2) and `bash research/theism-formal-evidence/lean/build.sh`.
