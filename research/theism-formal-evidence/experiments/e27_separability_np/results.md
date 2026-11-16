# E27: separability has no closed-form frame condition; deciding it is NP-complete

**Question.** E24 proved that, without rigid positivity A4a and over property collections in
which every property has a complement (block algebras included), GodIsEssential holds at w in
every model iff no successor of w is *separable*: no sets A ⊇ R(w) and S ∌ v such that, at every
t reachable from v, R(t) ⊆ A iff R(t) ⊆ S, and R(t) misses A iff R(t) misses S. The definition
quantifies over two sets of worlds, so brute force costs 4^n. Is there a closed-form graph
condition equivalent to it, as there is (E23's back witness, checkable in polynomial time) over
general collections?

**Prediction.** H31 in `LOG.md`, committed before this script and the Lean file.

## Answer: no, unless P = NP

Read A and S as two colourings a, s of the worlds. The condition says a and s give every R(t),
t ∈ R*(v), the same *type* (all in, all out, or mixed), with a = 1 on R(w), a(v) = 1 and s(v) = 0.

**Reduction.** From a hypergraph with points P and edges E, build the serial frame with worlds
w, v, one world per point and one per edge:

| world | successors |
|---|---|
| w | v |
| v | every edge world |
| edge e | v and the points of e |
| point p | p itself |

- If (A, S) separates v: R(p) = {p} forces a(p) = s(p) =: c(p). At an edge world, a(v) = 1 means
  a's type is all-in or mixed, s(v) = 0 means s's is all-out or mixed; equal types force both
  mixed, so e has a point with c = 0 and a point with c = 1. c is a proper 2-colouring.
- From a proper 2-colouring c: a = s = c on points, a = s = 0 on edge worlds, a(v) = 1,
  s(v) = 0. No world sees w, so w's own condition is never asked.

So v is separable iff the hypergraph is 2-colourable, a problem that is NP-complete
(Lovász 1973; Garey & Johnson 1979, problem SP4, "set splitting"). Separability is in NP (A and
S are a certificate checked in polynomial time), so it is **NP-complete**. Because w has the
single successor v, "GodIsEssential holds at w in every complement-closed model" (stages I and
III-noA4, E24's `essential_sep_iff_III`) is **coNP-complete** for finite frames.

## Method

- **Lean 4** (`lean/TheismFormal/AndersonNP.lean`, core library, no `sorry`, no warnings;
  `lean_build.txt`): `NP.sep_iff` (separable iff 2-colourable, any types of points and edges),
  `NP.serial` (the frame is serial once there is an edge; axiom-free), `NP.reach_ne_w`
  (axiom-free). The NP-completeness of 2-colourability is cited, not formalised.
- **Search** (`run.py`, new code sharing none with E24, 35 s): a backtracking decider for
  separability, checked against exhaustive search over (A, S) and against its own witnesses on
  every serial relation up to 4 worlds; then the reduction frame for every hypergraph with up to
  4 points and up to 4 distinct non-empty edges against brute-force 2-colourability; then the
  Fano plane.

## Results (`results.json`)

| check | cases | agree |
|---|---|---|
| decider vs exhaustive, serial relations up to 4 worlds | separable (relation, w, v): 0, 0, 36, 11,592 at 1–4 worlds | 0 mismatches; total 11,628 = E24's count |
| reduction frame separable vs hypergraph 2-colourable | 2,046 hypergraphs (535 colourable) | 0 mismatches |
| Fano plane (7 points, 7 lines), 16-world frame | not 2-colourable | not separable, no back witness |
| Fano minus one line | 2-colourable | separable, witness checked |

**The Fano frame** is a concrete point where the two settings part: v has no back witness, so by
E23 some general-collection model makes GodIsEssential fail at w; v is not separable, so by E24
it holds at w in every block-algebra model. No polynomial rule distinguishes such points in
general unless P = NP.

H31 held in all three parts. Not predicted: nothing.

## Reading

Whether properties have complements decides not only which frame condition governs Anderson's
essence step without A4a (E23 vs E24) but its complexity: polynomial over general collections,
coNP-complete over complement-closed ones. The open item "a closed-form graph condition for
separability" is closed negatively; what remains is a fast decider in practice (SAT encodings),
and whether the hardness survives in restricted frame classes.

## Limits

- The reduction frames are neither reflexive nor transitive. Whether separability stays hard in
  reflexive (T), transitive (K4) or S4 frames is open; the direct gadget fails under reflexivity
  (an edge world that sees itself can be labelled to satisfy its condition outright).
- Complexity is in the size of the frame; the hypergraphs checked are small, and the claim rests
  on the Lean proof plus the cited NP-completeness, not on the search.

## References

- L. Lovász, "Coverings and colorings of hypergraphs", *Proc. 4th Southeastern Conference on
  Combinatorics, Graph Theory and Computing* (1973), 3–12.
- M. R. Garey and D. S. Johnson, *Computers and Intractability* (Freeman 1979), problem SP4.
- D. Fuenmayor and C. Benzmüller, "Types, Tableaus and Gödel's God in Isabelle/HOL", *Archive of
  Formal Proofs* (2017), `AndersonProof.thy`.
