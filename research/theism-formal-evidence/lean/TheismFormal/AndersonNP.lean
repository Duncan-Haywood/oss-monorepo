import TheismFormal.AndersonSep
/-!
  E27 (experiments/e27_separability_np/results.md), machine-checked: E24's separability is
  as hard as hypergraph 2-colourability (set splitting), so it has no polynomial-time
  ("closed-form") frame condition unless P = NP.  Prediction H31 is in LOG.md, written
  before this file.

  For any hypergraph (points `P`, edges `E`, incidence `mem`), the serial frame `NP.R` has
  worlds `w`, `v`, one world per point and one per edge, with
    R(w) = {v},  R(v) = the edge worlds,  R(e) = {v} ∪ (points of e),  R(p) = {p}.
  `NP.sep_iff`: `v` is a separable successor of `w` iff some colouring leaves no edge
  monochromatic.  With `essential_sep_iff_III` (E24) this makes "GodIsEssential holds at w in
  every complement-closed model" coNP-hard for finite frames; it is in coNP because a
  separation (A, S) is a polynomial certificate of failure.  The NP-completeness of
  hypergraph 2-colourability is cited (Lovász 1973; Garey & Johnson 1979, SP4), not proved
  here.
-/

namespace TheismFormal.AndersonK.NP

inductive W (P E : Type) where
  | w : W P E
  | v : W P E
  | pt : P → W P E
  | ed : E → W P E

variable {P E : Type} (mem : P → E → Prop)

/-- The reduction frame. -/
def R : W P E → W P E → Prop
  | .w, t => t = .v
  | .v, t => ∃ e, t = .ed e
  | .ed e, t => t = .v ∨ ∃ p, mem p e ∧ t = .pt p
  | .pt p, t => t = .pt p

/-- A colouring with no monochromatic edge. -/
def TwoCol : Prop := ∃ c : P → Prop, ∀ e, (∃ p, mem p e ∧ c p) ∧ (∃ p, mem p e ∧ ¬ c p)

/-- Every world has a successor (once the hypergraph has an edge). -/
theorem serial (e0 : E) : ∀ x : W P E, ∃ y, R mem x y
  | .w => ⟨.v, rfl⟩
  | .v => ⟨.ed e0, e0, rfl⟩
  | .ed _ => ⟨.v, Or.inl rfl⟩
  | .pt p => ⟨.pt p, rfl⟩

/-- No world sees `w`. -/
theorem not_R_w : ∀ b : W P E, ¬ R mem b .w
  | .w, h => W.noConfusion h
  | .v, ⟨_, h⟩ => W.noConfusion h
  | .ed _, Or.inl h => W.noConfusion h
  | .ed _, Or.inr ⟨_, _, h⟩ => W.noConfusion h
  | .pt _, h => W.noConfusion h

/-- `w` is not reachable from `v`, so `Separable` never asks for `Cond` at `w`. -/
theorem reach_ne_w {t : W P E} (h : Reach (R mem) .v t) : t ≠ .w := by
  induction h with
  | refl => exact fun h => W.noConfusion h
  | tail _ hbc _ => exact fun h => not_R_w mem _ (h ▸ hbc)

theorem cond_of_agree {A S : W P E → Prop} {t : W P E}
    (h : ∀ s, R mem t s → (A s ↔ S s)) : Cond (R mem) A S t :=
  ⟨⟨fun hA s hs => (h s hs).1 (hA s hs), fun hS s hs => (h s hs).2 (hS s hs)⟩,
   ⟨fun hA s hs hS => hA s hs ((h s hs).2 hS), fun hS s hs hA => hS s hs ((h s hs).1 hA)⟩⟩

/-- The colouring's sets: `A` holds at `w`, `v` and the points coloured true; `S` at the
    points coloured true (and at `w`, which is never asked). -/
def cA (c : P → Prop) : W P E → Prop
  | .w => True
  | .v => True
  | .pt p => c p
  | .ed _ => False

def cS (c : P → Prop) : W P E → Prop
  | .w => True
  | .v => False
  | .pt p => c p
  | .ed _ => False

/-- **E27.** `v` is a separable successor of `w` iff the hypergraph is 2-colourable. -/
theorem sep_iff : Separable (R mem) .w .v ↔ TwoCol mem := by
  constructor
  · rintro ⟨A, S, hA, hSv, hT⟩
    have hAv : A .v := hA .v rfl
    have hve : ∀ e, Reach (R mem) .v (.ed e) := fun e => Reach.tail (Reach.refl _) ⟨e, rfl⟩
    have hpt : ∀ e p, mem p e → (A (.pt p) ↔ S (.pt p)) := by
      intro e p hp
      have hc := hT (.pt p) (Reach.tail (hve e) (Or.inr ⟨p, hp, rfl⟩))
      constructor
      · intro ha; exact hc.1.1 (fun s hs => (show s = .pt p from hs) ▸ ha) _ rfl
      · intro hs; exact hc.1.2 (fun s' hs' => (show s' = .pt p from hs') ▸ hs) _ rfl
    refine ⟨fun p => A (.pt p), fun e => ⟨?_, ?_⟩⟩
    · have hc := (hT (.ed e) (hve e)).2
      apply Classical.byContradiction
      intro hn
      have hall : ∀ s, R mem (.ed e) s → ¬ S s := by
        rintro s (rfl | ⟨p, hp, rfl⟩)
        · exact hSv
        · exact fun hs => hn ⟨p, hp, (hpt e p hp).2 hs⟩
      exact hc.2 hall .v (Or.inl rfl) hAv
    · have hc := (hT (.ed e) (hve e)).1
      apply Classical.byContradiction
      intro hn
      have hall : ∀ s, R mem (.ed e) s → A s := by
        rintro s (rfl | ⟨p, hp, rfl⟩)
        · exact hAv
        · exact Classical.byContradiction fun ha => hn ⟨p, hp, ha⟩
      exact hSv (hc.1 hall .v (Or.inl rfl))
  · rintro ⟨c, hc⟩
    refine ⟨cA c, cS c, fun s hs => (show s = .v from hs) ▸ trivial, id, ?_⟩
    intro t ht
    match t, ht with
    | .w, ht => exact absurd rfl (reach_ne_w mem ht)
    | .v, _ => exact cond_of_agree mem (by rintro s ⟨e, rfl⟩; exact Iff.rfl)
    | .pt p, _ => exact cond_of_agree mem (by rintro s rfl; exact Iff.rfl)
    | .ed e, _ =>
      obtain ⟨⟨p1, hp1, hc1⟩, ⟨p0, hp0, hc0⟩⟩ := hc e
      refine ⟨⟨fun h => absurd (h (.pt p0) (Or.inr ⟨p0, hp0, rfl⟩)) hc0,
                fun h => absurd (h .v (Or.inl rfl)) id⟩,
              ⟨fun h => absurd trivial (h .v (Or.inl rfl)),
                fun h => absurd hc1 (h (.pt p1) (Or.inr ⟨p1, hp1, rfl⟩))⟩⟩

end TheismFormal.AndersonK.NP
