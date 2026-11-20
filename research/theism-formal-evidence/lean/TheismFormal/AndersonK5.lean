import TheismFormal.AndersonKT
/-!
  E29 (experiments/e29_euclidean/results.md), machine-checked: E24's separability on
  Euclidean frames (axiom 5: K5, KD5, K45, KD45, KT5 = S5).  Prediction H33 is in LOG.md,
  written before this file.

  Let `R` be Euclidean (`a R b → a R c → b R c`) and `w R v`.
  * `eucl_succ_refl`, `eucl_reach`: every successor sees itself, and every `t` reachable
    from `v` has the same successors as `v` (H33 a).
  * `eucl_sep_iff`: `v` is separable iff some successor of `v` is not a successor of `w`
    (H33 b).  A linear test, where K and KT are NP-complete (E27, E28).
  * `eucl_not_sep_refl`: if `w R w` no successor is separable (H33 c); with
    `eucl_not_sep_trans`, nothing in S5, K45 or KD45.
  * `eucl_sep_iff_not_back`: separable iff no back witness, so E24's condition over
    complement-closed collections equals E23's over general ones (H33 d).
  * `eucl_none_sep_iff`: no successor of `w` is separable iff `R` is transitive at `w`;
    with E24's `essential_sep_iff`, that is the exact frame condition for GodIsEssential
    (`eucl_essential_iff`, H33 e).
  * `back_symm`: in a symmetric frame every successor has a back witness (`w` itself), so there
    too the two conditions agree.
-/

namespace TheismFormal.AndersonK

section eucl
variable {W : Type} {R : W → W → Prop}

/-- In a Euclidean frame, every world with a predecessor sees itself. -/
theorem eucl_succ_refl (heu : ∀ a b c, R a b → R a c → R b c) {a b : W} (h : R a b) :
    R b b :=
  heu a b b h h

/-- In a Euclidean frame, a reflexive `v` and any successor `c` of it have the same
    successors. -/
theorem eucl_same {heu : ∀ a b c, R a b → R a c → R b c} {v c : W} (hvv : R v v)
    (hvc : R v c) (s : W) : R c s ↔ R v s := by
  constructor
  · intro hcs
    exact heu c v s (heu v c v hvc hvv) hcs
  · intro hvs
    exact heu v c s hvc hvs

/-- **(a)** Every world reachable from a successor `v` is a successor of `v`, with the same
    successors as `v`. -/
theorem eucl_reach (heu : ∀ a b c, R a b → R a c → R b c) {w v t : W} (hw : R w v)
    (h : Reach R v t) : R v t ∧ ∀ s, R t s ↔ R v s := by
  have hvv := eucl_succ_refl heu hw
  have hvt : R v t := by
    induction h with
    | refl => exact hvv
    | @tail b c _ hbc ih => exact (eucl_same (heu := heu) hvv ih c).1 hbc
  exact ⟨hvt, eucl_same (heu := heu) hvv hvt⟩

/-- **(b)** On a Euclidean frame, a successor `v` of `w` is separable iff some successor of
    `v` is not a successor of `w`. -/
theorem eucl_sep_iff (heu : ∀ a b c, R a b → R a c → R b c) {w v : W} (hw : R w v) :
    Separable R w v ↔ ∃ u, R v u ∧ ¬ R w u := by
  constructor
  · rintro ⟨A, S, hA, hSv, hT⟩
    refine Classical.byContradiction fun hno => ?_
    have hsub : ∀ u, R v u → R w u := fun u hvu =>
      Classical.byContradiction fun hwu => hno ⟨u, hvu, hwu⟩
    exact hSv ((hT v (Reach.refl v)).1.1 (fun s hs => hA s (hsub s hs)) v
      (eucl_succ_refl heu hw))
  · rintro ⟨u, hvu, hwu⟩
    refine ⟨fun s => s ≠ u, fun s => s = u, ?_, ?_, ?_⟩
    · rintro s hs rfl; exact hwu hs
    · rintro rfl; exact hwu hw
    · intro t ht
      have hsame := (eucl_reach heu hw ht).2
      have htv : R t v := (hsame v).2 (eucl_succ_refl heu hw)
      have htu : R t u := (hsame u).2 hvu
      have hvne : v ≠ u := by rintro rfl; exact hwu hw
      refine ⟨⟨fun h => absurd rfl (h u htu), fun h => absurd (h v htv) hvne⟩,
              ⟨fun h => absurd hvne (h v htv), fun h => absurd rfl (h u htu)⟩⟩

/-- **(c)** If `w` sees itself, no successor of `w` is separable (S5 and every KT5 frame). -/
theorem eucl_not_sep_refl (heu : ∀ a b c, R a b → R a c → R b c) {w v : W} (hww : R w w)
    (hw : R w v) : ¬ Separable R w v := by
  rw [eucl_sep_iff heu hw]
  rintro ⟨u, hvu, hwu⟩
  exact hwu (heu v w u (heu w v w hw hww) hvu)

/-- **(c')** On a transitive Euclidean frame (K45, KD45) no successor is separable. -/
theorem eucl_not_sep_trans (heu : ∀ a b c, R a b → R a c → R b c)
    (htr : ∀ a b c, R a b → R b c → R a c) {w v : W} (hw : R w v) : ¬ Separable R w v := by
  rw [eucl_sep_iff heu hw]
  rintro ⟨u, hvu, hwu⟩
  exact hwu (htr w v u hw hvu)

/-- **(d)** On a Euclidean frame, separable iff no back witness (E23): the complement-closed
    condition and the general-collection condition coincide. -/
theorem eucl_sep_iff_not_back (heu : ∀ a b c, R a b → R a c → R b c) {w v : W} (hw : R w v) :
    Separable R w v ↔ ¬ Horn.Back R w v := by
  refine ⟨not_back_of_sep, fun hnb => ?_⟩
  rw [eucl_sep_iff heu hw]
  refine Classical.byContradiction fun hno => hnb ⟨v, Reach.refl v, eucl_succ_refl heu hw, ?_⟩
  intro t hvt
  exact Classical.byContradiction fun hwt => hno ⟨t, hvt, hwt⟩

/-- **(e)** On a Euclidean frame, no successor of `w` is separable iff `R` is transitive at
    `w`. -/
theorem eucl_none_sep_iff (heu : ∀ a b c, R a b → R a c → R b c) (w : W) :
    (∀ v, R w v → ¬ Separable R w v) ↔ ∀ v u, R w v → R v u → R w u := by
  constructor
  · intro h v u hw hvu
    exact Classical.byContradiction fun hwu => h v hw ((eucl_sep_iff heu hw).2 ⟨u, hvu, hwu⟩)
  · intro h v hw hs
    obtain ⟨u, hvu, hwu⟩ := (eucl_sep_iff heu hw).1 hs
    exact hwu (h v u hw hvu)

/-- **(e')** With E24: on a Euclidean frame, GodIsEssential holds at `w` in every
    complement-closed model (A2, T2) iff `R` is transitive at `w`. -/
theorem eucl_essential_iff (heu : ∀ a b c, R a b → R a c → R b c) (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop) (g : Pr),
      IsG R ev P g → A2 R Ex ev P → T2 P g → (∀ X : Pr, ∃ Xc, IsCompl ev X Xc) →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v u, R w v → R v u → R w u) :=
  (essential_sep_iff w).trans (eucl_none_sep_iff heu w)

/-- In a symmetric frame `w` is a back witness for each of its successors, so E23's condition
    over general collections agrees with `not_sep_symm` (no successor separable). -/
theorem back_symm (hsym : ∀ a b, R a b → R b a) {w v : W} (hw : R w v) : Horn.Back R w v :=
  ⟨w, Reach.tail (Reach.refl v) (hsym _ _ hw), hw, fun _ h => h⟩

end eucl

end TheismFormal.AndersonK
