# E31: E30's SAT encoding of separability, proved correct in Lean

**Headline.** E30's CNF (`experiments/e30_sat/run.py`, `encode`) is satisfiable exactly when a
successor v of w is separable, for **every** frame given by successor lists, of any size and any
shape. Until this step that rested on agreement with exhaustive search up to 4 worlds and on 2,520
reduction frames. It is now a Lean 4 theorem (`lean/TheismFormal/AndersonSAT.lean`, no `sorry`, no
warnings; build log in [`lean_build.txt`](lean_build.txt)), and a separate check shows that the
Lean statement is about the clauses the Python writes: the two clause sets match on all 526,625
(relation, w, v) triples up to 4 worlds. So every SAT verdict E30 reports, on frames of up to 3,704
worlds, is a verdict on separability itself, and every SAT model is a separation.

Prediction H35 is in `LOG.md`, committed before the Lean file was written (commit "E31 prediction
(H35) before any Lean"). Disclosure: the proof plan was worked out on paper this session; the
file compiled on its second build (the first failed only because core Lean 4.15 has no `not_not`;
`not_not.2 h` became `fun hn => hn h`, no proof step changed). A third build moved one case split so
that soundness avoids `Classical.choice` (below).

## Setting

The frame is `succ : W → List W` for any type W, with R t y := y ∈ succ t. Variables: `a x`,
`s x` for [x ∈ A], [x ∈ S]; `p t` for "R(t) ⊆ A and R(t) ⊆ S"; `q t` for "R(t) misses A and misses
S". `Enc succ w v` has one constructor per line of `encode`: the unit clauses a_v, ¬s_v and a_x for
x ∈ R(w) ∩ R*(v); for each t ∈ R*(v) with R(t) non-empty and y ∈ R(t), the four binary clauses
(¬p_t ∨ a_y), (¬p_t ∨ s_y), (¬q_t ∨ ¬a_y), (¬q_t ∨ ¬s_y); and the four long clauses
(p_t ∨ ⋁ ¬a_y), (p_t ∨ ⋁ ¬s_y), (q_t ∨ ⋁ a_y), (q_t ∨ ⋁ s_y). R*(v) stays reachability (`Reach`)
rather than a computed list.

## Theorems

| Lean name | statement (H35 part) | axioms used |
|---|---|---|
| `witness` | every model σ gives a separation A = {x : σ a_x} ∪ R(w), S = {x : σ s_x}; no hypothesis on the frame (a) | propext, Quot.sound |
| `sep_of_sat` | satisfiable ⇒ separable (a) | propext, Quot.sound |
| `sat_of_sep` | w R v and separable ⇒ satisfiable, with a := A, s := S, p_t := R(t) ⊆ A, q_t := R(t) misses A (b) | propext, Classical.choice, Quot.sound |
| `sat_iff` | for w R v: satisfiable ⇔ separable (c) | propext, Classical.choice, Quot.sound |
| `need_succ` | worlds w (no successors) and v (sees only itself): v separable from w, clauses unsatisfiable (d) | propext, Quot.sound |
| `sep_of_not_succ` | not predicted: if not w R v, v is separable from w on any frame (A = S = R(w)) | none |

As predicted in (c), only completeness needs classical choice (the case split in each long clause);
soundness, the direction that makes each SAT model a certificate, is constructive. `propext` and
`Quot.sound` come in through `simp` on list membership.

## The Python matches the Lean statement (H35 (e))

`run.py` (stdlib, 40 s) writes the clauses the eleven constructors allow, with named variables, and
compares them as a set with `encode`'s numbered clauses renamed back through `encode`'s own maps.

| worlds | relations | (w, v) with w R v | clause sets differ |
|---|---|---|---|
| 1 | 2 | 1 | 0 |
| 2 | 16 | 32 | 0 |
| 3 | 512 | 2,304 | 0 |
| 4 | 65,536 | 524,288 | 0 |
| **total** | **66,066** | **526,625** | **0** |

`encode` repeats one clause per instance (a_v, once as the head unit clause and once as x = v in
the loop over R(w)), 526,625 duplicates in all; a set of clauses and a list with a repeat have the
same models, so this changes nothing. For (d): on the 2,337 pairs with no w R v up to 3 worlds,
exhaustive search finds all 2,337 separable (as `sep_of_not_succ` says), and `encode` is
unsatisfiable on 1,018 of them, including the two-world frame of `need_succ`. E30 only calls
`encode` on successors, so none of its numbers are affected.

## Reading

E27 to E30 now form a closed chain: the essence step of Anderson's emendation fails at w in some
complement-closed model iff a successor is separable (E24, Lean); deciding that is NP-complete in
K, KD and KT (E27, E28, Lean); and a linear-size CNF decides it exactly (E31, Lean), fast in
practice (E30, measured). What remains unproved is the size bound (counted by E30 on every
instance, not formalised) and the Python itself, which is checked against the Lean statement by
enumeration rather than extracted from it.

## Reproduce

    research/theism-formal-evidence/lean/build.sh                          # Lean, ~2 min first time
    python3 research/theism-formal-evidence/experiments/e31_sat_lean/run.py  # 40 s
