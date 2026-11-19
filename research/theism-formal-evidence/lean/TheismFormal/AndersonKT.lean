import TheismFormal.AndersonNP
/-!
  E28 (experiments/e28_frame_classes/results.md), machine-checked: E24's separability by
  frame class.  Prediction H32 is in LOG.md, written before this file.

  General frames:
  * `not_sep_of_reach_w`: if `v` reaches `w`, `v` is not separable; so in every symmetric
    frame (`not_sep_symm`: B, KB, KTB, S5) no successor is separable and, by E24's
    `essential_sep_iff`, GodIsEssential holds in every complement-closed model without A4a.
  * `sep_of_acyclic`: if `v` lies on no cycle, `v` is separable (no seriality needed).
  * `sep_iff_trans`: in a transitive frame (K4, KD4, S4), `v` is separable iff `¬ R v v`.
    So in S4 never, and the test is polynomial.

  Reflexive frames (`KT`): for a hypergraph (points `P`, edges `E`, incidence `mem`), the
  frame `KT.R` is reflexive (`KT.refl`) and `v` is a separable successor of `w` iff the
  hypergraph is 2-colourable (`KT.sep_iff`).  With the cited NP-completeness of hypergraph
  2-colourability (Lovász 1973; Garey & Johnson 1979, SP4) separability stays NP-complete
  on reflexive frames, where E27's gadget broke.
-/

namespace TheismFormal.AndersonK

section general
variable {W : Type} {R : W → W → Prop}

/-- If `v` reaches `w`, then `v` is not a separable successor of `w`. -/
theorem not_sep_of_reach_w {w v : W} (h : Reach R v w) (hw : R w v) : ¬ Separable R w v := by
  rintro ⟨A, S, hA, hSv, hT⟩
  exact hSv ((hT w h).1.1 hA v hw)

/-- In a symmetric frame no successor is separable. -/
theorem not_sep_symm (hsym : ∀ a b, R a b → R b a) {w v : W} (hw : R w v) :
    ¬ Separable R w v :=
  not_sep_of_reach_w (Reach.tail (Reach.refl v) (hsym _ _ hw)) hw

/-- A world on no cycle is separable (A = every world, S = what T sees). -/
theorem sep_of_acyclic {w v : W} (h : ∀ t, Reach R v t → ¬ R t v) : Separable R w v := by
  refine ⟨fun _ => True, fun s => ∃ t, Reach R v t ∧ R t s, fun _ _ => trivial, ?_, ?_⟩
  · rintro ⟨t, ht, htv⟩; exact h t ht htv
  · intro t ht
    exact ⟨⟨fun _ s hs => ⟨t, ht, hs⟩, fun _ _ _ => trivial⟩,
           ⟨fun h' s hs _ => h' s hs trivial, fun h' s hs _ => h' s hs ⟨t, ht, hs⟩⟩⟩

theorem reach_trans_head (htr : ∀ a b c, R a b → R b c → R a c) {v t : W}
    (h : Reach R v t) : t = v ∨ R v t := by
  induction h with
  | refl => exact Or.inl rfl
  | @tail b c _ hbc ih =>
    rcases ih with rfl | hvb
    · exact Or.inr hbc
    · exact Or.inr (htr _ _ _ hvb hbc)

/-- In a transitive frame, a successor `v` of `w` is separable iff `v` does not see itself. -/
theorem sep_iff_trans (htr : ∀ a b c, R a b → R b c → R a c) {w v : W} (hw : R w v) :
    Separable R w v ↔ ¬ R v v := by
  constructor
  · rintro ⟨A, S, hA, hSv, hT⟩ hvv
    exact hSv ((hT v (Reach.refl v)).1.1 (fun s hs => hA s (htr _ _ _ hw hs)) v hvv)
  · intro hvv
    apply sep_of_acyclic
    intro t ht htv
    rcases reach_trans_head htr ht with rfl | hvt
    · exact hvv htv
    · exact hvv (htr _ _ _ hvt htv)

theorem cond_agree {A S : W → Prop} {t : W} (h : ∀ s, R t s → (A s ↔ S s)) :
    Cond R A S t :=
  ⟨⟨fun hA s hs => (h s hs).1 (hA s hs), fun hS s hs => (h s hs).2 (hS s hs)⟩,
   ⟨fun hA s hs hS => hA s hs ((h s hs).2 hS), fun hS s hs hA => hS s hs ((h s hs).1 hA)⟩⟩

end general

namespace KT

inductive W (P E : Type) where
  | w : W P E
  | v : W P E
  | y : W P E
  | x : W P E
  | pt : P → W P E
  | c : E → W P E
  | t0 : E → W P E
  | t1 : E → W P E
  | u0 : E → W P E
  | u1 : E → W P E

variable {P E : Type} (mem : P → E → Prop)

/-- The reflexive reduction frame of H32 (e). -/
def R : W P E → W P E → Prop
  | .w, .w => True
  | .w, .v => True
  | .w, .t0 _ => True
  | .w, .t1 _ => True
  | .w, .u0 _ => True
  | .v, .v => True
  | .v, .y => True
  | .v, .x => True
  | .v, .t0 _ => True
  | .v, .u0 _ => True
  | .y, .y => True
  | .y, .v => True
  | .x, .x => True
  | .x, .y => True
  | .pt p, .pt q => p = q
  | .c e, .c f => e = f
  | .c e, .pt p => mem p e
  | .t0 e, .t0 f => e = f
  | .t0 e, .t1 f => e = f
  | .t1 e, .t1 f => e = f
  | .t1 e, .c f => e = f
  | .t1 _, .y => True
  | .u0 e, .u0 f => e = f
  | .u0 e, .u1 f => e = f
  | .u0 _, .x => True
  | .u1 e, .u1 f => e = f
  | .u1 e, .c f => e = f
  | .u1 _, .y => True
  | _, _ => False

/-- The frame is reflexive (so serial). -/
theorem refl : ∀ t : W P E, R mem t t
  | .w => trivial
  | .v => trivial
  | .y => trivial
  | .x => trivial
  | .pt _ => rfl
  | .c _ => rfl
  | .t0 _ => rfl
  | .t1 _ => rfl
  | .u0 _ => rfl
  | .u1 _ => rfl

theorem not_R_w : ∀ b : W P E, R mem b .w → b = .w := by
  intro b h
  cases b <;> first | rfl | exact absurd h id

theorem reach_ne_w {t : W P E} (h : Reach (R mem) .v t) : t ≠ .w := by
  induction h with
  | refl => exact fun h => W.noConfusion h
  | @tail b c _ hbc ih =>
    intro hc; subst hc; exact ih (not_R_w mem b hbc)

/-- **E28 (e).** On the reflexive frame, `v` is a separable successor of `w` iff the
    hypergraph is 2-colourable. -/
theorem sep_iff : Separable (R mem) .w .v ↔ AndersonK.NP.TwoCol mem := by
  constructor
  · rintro ⟨A, S, hA, hSv, hT⟩
    have r1 : ∀ {a b : W P E}, R mem a b → Reach (R mem) .v a → Reach (R mem) .v b :=
      fun hab ha => Reach.tail ha hab
    have hv : Reach (R mem) .v .v := Reach.refl _
    have hy := r1 (show R mem .v .y from trivial) hv
    have hx := r1 (show R mem .v .x from trivial) hv
    have hAv : A .v := hA .v trivial
    -- y is labelled Y
    have cy := hT .y hy
    have nAy : ¬ A .y := fun ha => hSv (cy.1.1 (by
      intro s hs; cases s <;> first | exact absurd hs id | exact ha | exact hAv) .v trivial)
    have Sy : S .y := Classical.byContradiction fun hs => cy.2.2 (by
      intro s hs'; cases s <;> first | exact absurd hs' id | exact hs | exact hSv) .v trivial hAv
    -- x is labelled X
    have cx := hT .x hx
    have Ax : A .x := Classical.byContradiction fun ha => (cx.2.1 (by
      intro s hs; cases s <;> first | exact absurd hs id | exact ha | exact nAy)) .y trivial Sy
    have nSx : ¬ S .x := fun hs => nAy (cx.1.2 (by
      intro s hs'; cases s <;> first | exact absurd hs' id | exact hs | exact Sy) .y trivial)
    refine ⟨fun p => A (.pt p), fun e => ?_⟩
    have ht0 := r1 (show R mem .v (.t0 e) from trivial) hv
    have ht1 := r1 (show R mem (.t0 e) (.t1 e) from rfl) ht0
    have hc := r1 (show R mem (.t1 e) (.c e) from rfl) ht1
    have hu0 := r1 (show R mem .v (.u0 e) from trivial) hv
    have hu1 := r1 (show R mem (.u0 e) (.u1 e) from rfl) hu0
    have At0 : A (.t0 e) := hA _ trivial
    have At1 : A (.t1 e) := hA _ trivial
    have Au0 : A (.u0 e) := hA _ trivial
    -- t0: both in A, so both in S
    have St1 : S (.t1 e) := (hT _ ht0).1.1 (by
      intro s hs; cases s <;> first | exact absurd hs id | (cases hs; first | exact At0 | exact At1))
      (.t1 e) rfl
    -- t1: c is not in S
    have nSc : ¬ S (.c e) := fun hs => nAy ((hT _ ht1).1.2 (by
      intro s hs'
      cases s <;> first | exact absurd hs' id | exact Sy | (cases hs'; first | exact St1 | exact hs))
      .y trivial)
    -- u0: u1 is not in A
    have nAu1 : ¬ A (.u1 e) := fun ha => nSx ((hT _ hu0).1.1 (by
      intro s hs
      cases s <;> first | exact absurd hs id | exact Ax | (cases hs; first | exact Au0 | exact ha))
      .x trivial)
    -- u1: so c is in A
    have Ac : A (.c e) := Classical.byContradiction fun hac => ((hT _ hu1).2.1 (by
      intro s hs
      cases s <;> first | exact absurd hs id | exact nAy | (cases hs; first | exact nAu1 | exact hac)))
      .y trivial Sy
    -- points of e agree on A and S
    have hpt : ∀ p, mem p e → (A (.pt p) ↔ S (.pt p)) := by
      intro p hp
      have cp := hT _ (r1 (show R mem (.c e) (.pt p) from hp) hc)
      constructor
      · intro ha
        exact cp.1.1 (by intro s hs; cases s <;> first | exact absurd hs id | (cases hs; exact ha)) _ rfl
      · intro hs
        exact cp.1.2 (by intro s hs'; cases s <;> first | exact absurd hs' id | (cases hs'; exact hs)) _ rfl
    have cc := hT _ hc
    constructor
    · apply Classical.byContradiction
      intro hn
      refine (cc.2.2 ?_) (.c e) rfl Ac
      intro s hs
      cases s with
      | c f => cases hs; exact nSc
      | pt p => exact fun hsp => hn ⟨p, hs, (hpt p hs).2 hsp⟩
      | _ => exact absurd hs id
    · apply Classical.byContradiction
      intro hn
      refine nSc (cc.1.1 ?_ (.c e) rfl)
      intro s hs
      cases s with
      | c f => cases hs; exact Ac
      | pt p => exact Classical.byContradiction fun ha => hn ⟨p, hs, ha⟩
      | _ => exact absurd hs id
  · rintro ⟨col, hcol⟩
    let A : W P E → Prop := fun
      | .y => False
      | .u1 _ => False
      | .pt p => col p
      | _ => True
    let S : W P E → Prop := fun
      | .w => True
      | .y => True
      | .pt p => col p
      | .t0 _ => True
      | .t1 _ => True
      | .u0 _ => True
      | _ => False
    refine ⟨A, S, ?_, id, ?_⟩
    · intro s hs; cases s <;> first | exact absurd hs id | trivial
    · intro t ht
      have hne := reach_ne_w mem ht
      cases t with
      | w => exact absurd rfl hne
      | v =>
        exact ⟨iff_of_false (fun h => h .y trivial) (fun h => h .v trivial),
               iff_of_false (fun h => h .v trivial trivial) (fun h => h .y trivial trivial)⟩
      | y =>
        exact ⟨iff_of_false (fun h => h .y trivial) (fun h => h .v trivial),
               iff_of_false (fun h => h .v trivial trivial) (fun h => h .y trivial trivial)⟩
      | x =>
        exact ⟨iff_of_false (fun h => h .y trivial) (fun h => h .x trivial),
               iff_of_false (fun h => h .x trivial trivial) (fun h => h .y trivial trivial)⟩
      | pt p =>
        exact cond_agree (fun s hs => by
          cases s <;> first | exact absurd hs id | (cases hs; exact Iff.rfl))
      | c e =>
        obtain ⟨⟨p1, hp1, hc1⟩, ⟨p0, hp0, hc0⟩⟩ := hcol e
        exact ⟨iff_of_false (fun h => hc0 (h (.pt p0) hp0)) (fun h => h (.c e) rfl),
               iff_of_false (fun h => h (.c e) rfl trivial) (fun h => h (.pt p1) hp1 hc1)⟩
      | t0 e =>
        refine ⟨⟨fun _ s hs => ?_, fun _ s hs => ?_⟩, ⟨fun h => ?_, fun h => ?_⟩⟩
        · cases s <;> first | exact absurd hs id | trivial
        · cases s <;> first | exact absurd hs id | trivial
        · exact absurd trivial (h (.t0 e) rfl)
        · exact absurd trivial (h (.t0 e) rfl)
      | t1 e =>
        exact ⟨iff_of_false (fun h => h .y trivial) (fun h => h (.c e) rfl),
               iff_of_false (fun h => h (.t1 e) rfl trivial) (fun h => h (.t1 e) rfl trivial)⟩
      | u0 e =>
        exact ⟨iff_of_false (fun h => h (.u1 e) rfl) (fun h => h (.u1 e) rfl),
               iff_of_false (fun h => h (.u0 e) rfl trivial) (fun h => h (.u0 e) rfl trivial)⟩
      | u1 e =>
        exact ⟨iff_of_false (fun h => h (.u1 e) rfl) (fun h => h (.u1 e) rfl),
               iff_of_false (fun h => h (.c e) rfl trivial) (fun h => h .y trivial trivial)⟩

end KT

end TheismFormal.AndersonK
