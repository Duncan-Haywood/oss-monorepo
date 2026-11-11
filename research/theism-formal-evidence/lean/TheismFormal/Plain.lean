/-
  E14 (experiments/e14_plain_necessity/results.md), machine-checked: E13's setting (varying
  domains, actualist quantifiers, actualist "x has f necessarily", Anderson's own A2) with
  Anderson's A5' (his essence-based necessary existence is positive) replaced by A5₀: plain
  necessary existence, "exists at every world", is positive.

  Results: (1) de re: in every model of A1, Anderson's A2, A3' and A5₀ EVERY God-like individual
  exists at every world, for any block algebra and any domains, and some God-like individual
  exists (so a necessary God-like being exists); (2) plain necessary existence implies Anderson's
  (`ne0_imp_nea`), so A5₀ asks more of the property space, not less; (3) E13's de re countermodel
  satisfies A5' but not A5₀.  Core Lean 4 only.
-/
import TheismFormal.Actualist

namespace TheismFormal.Plain
open TheismFormal.Anderson TheismFormal.Varying TheismFormal.Actualist

variable {W D K : Type}

/-- Plain necessary existence: `x` exists at every world. -/
def NE0 (Ex : W × D → Prop) (x : D) : Prop := ∀ w, Ex (w, x)

/-- A5₀: some positive property holds at exactly the cells of the individuals that exist at
    every world. -/
def A5z (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∃ n, P n ∧ ∀ c, n (blk c) ↔ NE0 Ex c.2

/-- **E14 (1a).**  With A5₀, every God-like individual exists at every world.  Only Anderson's
    A2 and A5₀ are used: a God-like `x` exists somewhere (else every property is positive), it
    has the positive property `n` at that world, and `n` holds there only if `x` is a necessary
    existent. -/
theorem godlike_necessary_plain (blk : W × D → K) (Ex : W × D → Prop)
    (P : (K → Prop) → Prop) (h2 : A2w P) (h5 : A5z blk Ex P)
    (x : D) (hx : GStarA blk Ex P x) : NE0 Ex x := by
  obtain ⟨w1, hw1⟩ := godlike_exists_somewhere blk Ex P h2 x hx
  obtain ⟨n, hn, hnc⟩ := h5
  exact (hnc (w1, x)).1 ((hx n).1 hn w1 hw1)

/-- **E14 (1b): de re.**  In every model of A1, Anderson's A2, A3' and A5₀ (actualist reading),
    some God-like individual exists at every world. -/
theorem de_re_plain (blk : W × D → K) (Ex : W × D → Prop) (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1v blk Ex P) (h2 : A2w P) (h3 : A3a blk Ex P)
    (h5 : A5z blk Ex P) : ∃ x, GStarA blk Ex P x ∧ NE0 Ex x := by
  obtain ⟨x, hx⟩ := exists_godlikeA blk Ex onto P h1 h2 h3
  exact ⟨x, hx, godlike_necessary_plain blk Ex P h2 h5 x hx⟩

/-- **E14 (2).**  Plain necessary existence implies Anderson's: an essence `f` of an
    everywhere-existent `x` entails itself, so `x` has it necessarily, so `x` itself exemplifies
    it at every world. -/
theorem ne0_imp_nea (blk : W × D → K) (Ex : W × D → Prop) (x : D) (h : NE0 Ex x) :
    NEa blk Ex x := by
  intro f hf w
  have : NecA blk Ex f x := (hf f).2 (fun _ _ hc => hc)
  exact ⟨x, h w, this w (h w)⟩

/-- **E14 (3).**  E13's de re countermodel (two worlds, two individuals, one block, each
    individual existing at one world) satisfies A5' but not A5₀. -/
theorem cm_a5_not_a5z : A5a blk1 Ex1 P1 ∧ ¬ A5z blk1 Ex1 P1 := by
  refine ⟨cm_axioms_actualist.2.2.2, ?_⟩
  intro ⟨n, hn, hnc⟩
  exact cm_no_necessary_being ⟨true, (hnc (true, true)).1 hn⟩

end TheismFormal.Plain
