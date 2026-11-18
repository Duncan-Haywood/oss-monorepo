/-
  Kripke semantics, shallowly embedded: a proposition is a predicate on worlds.
  Core Lean 4 only (no Mathlib), so the file checks with a bare toolchain.

  The results mirror experiments/e1_arguments (src/logic.py decides them by search;
  here they are proved, including the frame-class claims the search can only bound).
-/
namespace TheismFormal

abbrev Prp (W : Type) := W → Prop

abbrev box {W : Type} (R : W → W → Prop) (p : Prp W) : Prp W := fun w => ∀ v, R w v → p v
abbrev dia {W : Type} (R : W → W → Prop) (p : Prp W) : Prp W := fun w => ∃ v, R w v ∧ p v

/-- Modal ontological argument (Hartshorne, Plantinga): from □(G → □G) and ◇G, G.
    Needs only a symmetric accessibility relation (so it holds in B and S5). -/
theorem ontological_symmetric {W : Type} (R : W → W → Prop)
    (symm : ∀ w v, R w v → R v w) (G : Prp W) (w : W)
    (anselm : box R (fun u => G u → box R G u) w)
    (poss : dia R G w) : G w := by
  obtain ⟨v, hwv, hv⟩ := poss
  exact anselm v hwv hv w (symm w v hwv)

/-- Reverse ("parody") argument: from □(G → □G) and ◇¬G, ¬G.
    Needs only reflexivity (so it holds already in T, hence in S4, B and S5). -/
theorem parody_reflexive {W : Type} (R : W → W → Prop)
    (refl : ∀ w, R w w) (G : Prp W) (w : W)
    (anselm : box R (fun u => G u → box R G u) w)
    (poss : dia R (fun u => ¬ G u) w) : ¬ G w := by
  intro hw
  obtain ⟨v, hwv, hnv⟩ := poss
  exact hnv (anselm w (refl w) hw v hwv)

/-- In S5 (here: an equivalence relation) the three claims
    □(G → □G), ◇G, ◇¬G cannot all hold at one world. -/
theorem ontological_pair_inconsistent {W : Type} (R : W → W → Prop)
    (refl : ∀ w, R w w) (symm : ∀ w v, R w v → R v w)
    (G : Prp W) (w : W)
    (anselm : box R (fun u => G u → box R G u) w)
    (pos : dia R G w) (neg : dia R (fun u => ¬ G u) w) : False :=
  parody_reflexive R refl G w anselm neg (ontological_symmetric R symm G w anselm pos)

/-! ### The ontological argument fails on a reflexive, transitive frame (S4).
  Worlds: `Bool`.  `true` sees itself and `false`; `false` sees only itself.
  G holds only at `false`.  At `true`: □(G → □G) and ◇G hold, G does not. -/

def R4 : Bool → Bool → Prop := fun w v => w = true ∨ v = false

theorem R4_refl : ∀ w, R4 w w := by
  intro w; cases w
  · exact Or.inr rfl
  · exact Or.inl rfl

theorem R4_trans : ∀ a b c, R4 a b → R4 b c → R4 a c := by
  intro a b c hab hbc
  cases a with
  | true => exact Or.inl rfl
  | false =>
    cases hab with
    | inl h => exact absurd h (by decide)
    | inr hb =>
      subst hb
      cases hbc with
      | inl h => exact absurd h (by decide)
      | inr hc => exact Or.inr hc

def G4 : Prp Bool := fun u => u = false

theorem ontological_fails_S4 :
    ¬ (∀ (W : Type) (R : W → W → Prop), (∀ w, R w w) → (∀ a b c, R a b → R b c → R a c) →
        ∀ (G : Prp W) (w : W), box R (fun u => G u → box R G u) w → dia R G w → G w) := by
  intro h
  have anselm : box R4 (fun u => G4 u → box R4 G4 u) true := by
    intro v _ hv u hu
    -- hv : G4 v, i.e. v = false; hu : R4 v u
    have hv' : v = false := hv
    subst hv'
    cases hu with
    | inl h' => exact absurd h' (by decide)
    | inr h' => exact h'
  have poss : dia R4 G4 true := ⟨false, Or.inl rfl, rfl⟩
  have hG : G4 true := h Bool R4 R4_refl R4_trans G4 true anselm poss
  have hEq : true = false := hG
  exact absurd hEq (by decide)

end TheismFormal
