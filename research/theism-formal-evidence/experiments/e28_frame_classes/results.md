# E28: separability by frame class (hard in KT, polynomial in K4, impossible in B)

Prediction H32 is in `../../LOG.md`, committed before `run.py` and before
`lean/TheismFormal/AndersonKT.lean`. `results.json` is written by `run.py` (about 20 s); this
file is written by hand from it.

**Question.** E27 showed that E24's separability (the exact frame condition for the AFP's
GodIsEssential without A4a over complement-closed property collections) is NP-complete on serial
frames, with a gadget that breaks under reflexivity. Does the hardness survive in the frame
classes people actually use for metaphysical modality (T, S4, B, S5)?

**Answer.** It depends on the class, and the boundary is sharp:

| Frame class | Separable successor of w | Complexity of the test | Lean |
|---|---|---|---|
| any frame where v reaches w (all symmetric: B, KB, KTB, S5) | never | trivial | `not_sep_of_reach_w`, `not_sep_symm` |
| any frame, v on no cycle | always | (sufficient condition) | `sep_of_acyclic` |
| transitive (K4, KD4) | iff not v R v | linear | `sep_iff_trans` |
| reflexive + transitive (S4) | never | trivial | `sep_iff_trans` |
| reflexive (KT) | iff the encoded hypergraph is 2-colourable | NP-complete | `KT.refl`, `KT.sep_iff` |
| serial (KD), all (K) | (E27) | NP-complete | `NP.sep_iff` |

All Lean theorems compile with no `sorry` and no warnings (`lean_build.txt`); every general-frame
theorem and `KT.refl` is axiom-free, `KT.sep_iff` uses only classical choice.

**The label lemma (a).** Label each world of T = R*(v) by ([in A], [in S]): E0 = (0,0),
E1 = (1,1), X = (1,0), Y = (0,1). E24's Cond holds at t iff the labels on R(t) are all E0/E1, or
contain both E0 and E1, or contain both X and Y. Checked against Cond on all 1,364 label
sequences of length 1 to 5 (0 mismatches); since the condition depends only on which labels are
present, this covers every case.

**Checks.**

- Every relation (not only serial ones) on up to 4 worlds, every (w, v) with w R v: 0 violations
  of (b) "v reaches w => not separable", (c) "v on no cycle => separable" and (d) "transitive =>
  separable iff not v R v"; E27's decider agreed with exhaustive search over (A, S) everywhere
  (where some world of T has no successor the decider does not apply and exhaustive search alone
  was used).
- Separable (w, v) pairs by class at 4 worlds: all 43,872 of 524,288; serial 11,592 of 432,000
  (E24's and E27's count); reflexive 1,128 of 40,960; transitive 6,780 of 23,788; symmetric 0 of
  8,192; S4 0 of 2,968.
- The reflexive reduction (H32 (e), 4 + |P| + 5|E| worlds) on all 2,046 hypergraphs with up to 4
  points and up to 4 distinct non-empty edges (535 2-colourable): separability equals
  2-colourability in every case, every witness checks, and on the 4 smallest an independent
  labelling search written from the lemma agrees.
- Fano plane (46-world reflexive frame): not separable; with one line removed it is separable and
  the witness checks.
- Arc consistency is not enough on KT: on the 7-world reflexive frame in `results.json`
  (w = 2, v = 4) generalised arc consistency over the labels leaves every domain non-empty,
  yet exhaustive search over all (A, S) finds no separation. (Found by scratch code before H32; it
  is what suggested looking for a reduction rather than a propagation rule.)

**Not predicted.** Nothing.

**Reading.** For the AFP's essence step without A4a over complement-closed collections:
in any symmetric logic (B, S5) and in S4 it holds at every world of every frame; in K4/KD4 it holds
at w iff every successor of w is reflexive, which is also E22's condition with A4a and E23's over
general collections (so in transitive frames the three settings agree); in T, as in K and KD, the
question is coNP-complete for finite frames. Reflexivity alone does not tame it; transitivity or
symmetry does.

**Limits.** NP-completeness of hypergraph 2-colourability is cited (Lovász 1973; Garey & Johnson
1979, SP4), not formalised. KD45 and K45 frames are transitive, so `sep_iff_trans` covers them; frames
that are euclidean but not transitive (K5 alone) were not analysed.
