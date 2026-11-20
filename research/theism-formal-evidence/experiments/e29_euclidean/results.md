# E29: separability on Euclidean (K5) frames: linear, never with a reflexive w, same as E23's condition

Prediction H33 is in `../../LOG.md`, committed before `run.py` and before
`lean/TheismFormal/AndersonK5.lean`. `results.json` is written by `run.py` (about 15 s); this
file is written by hand from it.

**Question.** E28 placed E24's separability (the exact frame condition for the AFP's
GodIsEssential without A4a over complement-closed property collections) in serial, reflexive,
transitive and symmetric frames, and left Euclidean frames open. Axiom 5 (&loz;p &rarr; &#9633;&loz;p)
is the one Plantinga-style ontological arguments lean on, and K5, KD5, K45 and KD45 sit between
K and S5. Is the test hard there, and do complements matter?

**Answer.** It is easy, and complements stop mattering.

| Frame class | Successor v of w is separable iff | Test | Lean |
|---|---|---|---|
| Euclidean (K5, KD5) | some u with v R u is not a successor of w (equivalently R(v) &ne; R(w)) | linear | `eucl_sep_iff` |
| Euclidean, w R w (KT5 = S5, and any reflexive w) | never | trivial | `eucl_not_sep_refl` |
| Euclidean + transitive (K45, KD45) | never | trivial | `eucl_not_sep_trans` |
| Euclidean, any | iff v has no back witness (E23) | linear | `eucl_sep_iff_not_back` |

Why: in a Euclidean frame every world with a predecessor sees itself, and every t reachable
from v has exactly v's successors (`eucl_succ_refl`, `eucl_reach`), so the only constraint is on
one cluster R(v), which contains v. By E28's label lemma that cluster needs a Y (a world in S
but not in A) next to v's X, and a Y can only sit outside R(w).

**Corollary** (`eucl_none_sep_iff`, `eucl_essential_iff`, with E24's `essential_sep_iff`): on a
Euclidean frame, GodIsEssential holds at w in every complement-closed model satisfying A2 and
T2 iff R is transitive at w (every successor of a successor of w is a successor of w). By
`eucl_sep_iff_not_back` and E23 the same condition is exact over general property collections,
so on Euclidean frames, as on transitive ones (E28), whether properties have complements makes
no difference. On K, KD and KT it does: 5,136 of the 522,576 non-Euclidean (relation, w, v)
triples on 4 worlds have separability and "no back witness" disagree (4,944 serial, 456
reflexive), and E27's 16-world Fano frame is one at scale.

All nine Lean theorems (eight for H33, plus `back_symm`) compile with no `sorry` and no warnings (`lean_build.txt`); the file
built on the first attempt. `eucl_succ_refl`, `eucl_reach` and `back_symm` are axiom-free; the rest use only
classical choice (`Classical.byContradiction`).

**Checks** (`results.json`, 13 s).

- Every Euclidean relation on 1 to 4 worlds (2, 7, 39 and 306 frames; 1,860 (w, v) pairs),
  separability by exhaustive search over (A, S): 0 violations of (a) same successors on R*(v),
  (b) the linear rule, (c) never with w R w or a transitive frame, (d) separable iff no back
  witness, (e) none separable at w iff R transitive at w.
- Separable pairs at 4 worlds: K5 156 of 1,712; KD5 132 of 1,240; K45 0 of 884; KD45 0 of 532;
  S5 0 of 120. At 3 worlds: K5 6 of 135, the first size where one exists (w &rarr; v, and v, u see
  each other and themselves).
- Euclidean closures of seeded random relations: 3,000 frames on 5 worlds (46,147 pairs, 2,217
  separable), 1,500 on 6 (36,905, 1,464), 400 on 7 (14,793, 428): 0 violations.
- Contrast, non-Euclidean frames: separability and "no back witness" differ on 24 of 2,169 triples
  at 3 worlds (E24's 36 against 60 serial pairs) and 5,136 of 522,576 at 4.

**Reading.** With E27 and E28 the map of the essence step without A4a over complement-closed
collections is complete for the fifteen normal logics of the modal cube (K plus any of D, T, B,
4, 5): coNP-complete to check in K, KD and KT; linear in K4, KD4, K5 and KD5; it always holds in
S4, KB, KDB, KTB, KB4 (= KB5), K45, KD45 and S5. In every class where it is not hard it agrees
with E23's condition over general collections (transitive: E28; Euclidean: here; symmetric: w
itself is a back witness, `back_symm`, added after the prediction),
so complements matter only where the problem is hard.

**Not done.** A SAT encoding for large K/T frames; Hájek's variants; Martin (2005) read directly;
the group-level q for the disciples (M3).
