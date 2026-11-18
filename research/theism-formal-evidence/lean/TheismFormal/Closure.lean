/-
  E15 (experiments/e15_a5z_not_a5/results.md), machine-checked: E14's setting (varying domains,
  actualist entailment and actualist "x has f necessarily", Anderson's own A2).  E14 conjectured
  that A5₀ (plain necessary existence is positive) implies Anderson's A5'.  It does not.

  Results: (1) `nea_iff`: Anderson's necessary existence holds of `x` exactly when the blocks
  meeting `x`'s existing cells contain an existent at every world (E13 (b)); (2) `a5a_iff_closed`:
  in any model of A1 and A5₀, A5' holds exactly when the cells of Anderson-necessary individuals
  form a property of the algebra; (3) `full_a5z_imp_a5a`: so under full property semantics A5₀
  implies A5'; (4) `cm8`: a two-world, four-individual, three-block model of A1, A2w, A3', A5₀ in
  which A5' fails.  Core Lean 4 only.
-/
import TheismFormal.Plain

namespace TheismFormal.Closure
open TheismFormal.Anderson TheismFormal.Varying TheismFormal.Actualist TheismFormal.Plain

variable {W D K : Type}

/-- The blocks meeting `x`'s existing cells. -/
def hE (blk : W × D → K) (Ex : W × D → Prop) (x : D) : K → Prop :=
  fun k => ∃ v, Ex (v, x) ∧ blk (v, x) = k

/-- `hE x` is an essence of `x`. -/
theorem hE_ess (blk : W × D → K) (Ex : W × D → Prop) (x : D) : EssA blk Ex (hE blk Ex x) x := by
  intro g
  constructor
  · intro hn c _ ⟨v, hv, heq⟩
    exact heq ▸ hn v hv
  · intro he w hw
    exact he (w, x) hw ⟨w, hw, rfl⟩

/-- **E15 (1).**  Anderson's necessary existence, without quantifying over essences. -/
theorem nea_iff (blk : W × D → K) (Ex : W × D → Prop) (x : D) :
    NEa blk Ex x ↔ ∀ w, ∃ y, Ex (w, y) ∧ hE blk Ex x (blk (w, y)) := by
  constructor
  · intro h
    exact h _ (hE_ess blk Ex x)
  · intro h f hf w
    obtain ⟨y, hy, v, hv, heq⟩ := h w
    have nf : NecA blk Ex f x := (hf f).2 (fun _ _ hc => hc)
    exact ⟨y, hy, heq ▸ nf v hv⟩

/-- **E15 (2).**  Given A1 and A5₀, A5' holds iff the Anderson-necessary individuals' cells form a
    property.  Positivity comes free: A5₀'s property entails it, since plain necessary existence
    implies Anderson's (`ne0_imp_nea`). -/
theorem a5a_iff_closed (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop)
    (h1 : A1v blk Ex P) (h5 : A5z blk Ex P) :
    A5a blk Ex P ↔ ∃ m : K → Prop, ∀ c, m (blk c) ↔ NEa blk Ex c.2 := by
  constructor
  · intro ⟨m, _, hm⟩
    exact ⟨m, hm⟩
  · intro ⟨m, hm⟩
    obtain ⟨n, hn, hnc⟩ := h5
    have ent : Ent blk Ex n m := fun c _ hc =>
      (hm c).2 (ne0_imp_nea blk Ex c.2 ((hnc c).1 hc))
    exact ⟨m, h1 n m hn ent, hm⟩

/-- **E15 (3).**  Under full property semantics (`blk` injective) A5₀ implies A5'. -/
theorem full_a5z_imp_a5a (blk : W × D → K) (Ex : W × D → Prop)
    (inj : ∀ c c', blk c = blk c' → c = c') (P : (K → Prop) → Prop)
    (h1 : A1v blk Ex P) (h5 : A5z blk Ex P) : A5a blk Ex P := by
  refine (a5a_iff_closed blk Ex P h1 h5).2 ⟨fun k => ∃ c, blk c = k ∧ NEa blk Ex c.2, ?_⟩
  intro c
  constructor
  · intro ⟨c', heq, hc'⟩
    exact inj _ _ heq ▸ hc'
  · intro hc
    exact ⟨c, rfl, hc⟩

/-! ### E15 (4): the 8-cell countermodel

Worlds `Bool` (`false` = world 0).  Individuals: `g` exists at both worlds, `a` only at world 0,
`c` and `b` only at world 1.  Blocks: `B` = g's row; `k1` = {(0,a), (1,c), (0,b)};
`k3` = {(1,b), (1,a), (0,c)}.  Positive = "holds of `B`".  `a` and `c` are Anderson-necessary
(block `k1` holds an existent at each world), `b` is not, but (0,b) shares `k1` with (0,a). -/

inductive I | g | a | c | b
inductive Bk | B | k1 | k3

def blk8 : Bool × I → Bk
  | (_, .g) => .B
  | (false, .a) => .k1
  | (true, .c) => .k1
  | (false, .b) => .k1
  | _ => .k3

def ex8 : Bool × I → Bool
  | (_, .g) => true
  | (false, .a) => true
  | (true, .c) => true
  | (true, .b) => true
  | _ => false

def Ex8 (c : Bool × I) : Prop := ex8 c = true
def P8 (f : Bk → Prop) : Prop := f .B

theorem gstar8 (y : I) : GStarA blk8 Ex8 P8 y ↔ y = .g := by
  constructor
  · intro h
    have hn : NecA blk8 Ex8 (fun k => k = .B) y := (h _).1 rfl
    cases y with
    | g => rfl
    | a => exact Bk.noConfusion (hn false rfl)
    | c => exact Bk.noConfusion (hn true rfl)
    | b => exact Bk.noConfusion (hn true rfl)
  · intro hy f
    subst hy
    exact ⟨fun hf w _ => by cases w <;> exact hf, fun hn => hn false rfl⟩

theorem ne0_8 (y : I) : NE0 Ex8 y ↔ y = .g := by
  constructor
  · intro h
    cases y with
    | g => rfl
    | a => exact Bool.noConfusion (h true)
    | c => exact Bool.noConfusion (h false)
    | b => exact Bool.noConfusion (h false)
  · intro hy w
    subst hy
    cases w <;> rfl

theorem blkB (c : Bool × I) : blk8 c = .B ↔ c.2 = .g := by
  obtain ⟨w, y⟩ := c
  cases w <;> cases y <;> simp [blk8]

theorem nea_a : NEa blk8 Ex8 .a := by
  intro f hf w
  have nf : NecA blk8 Ex8 f .a := (hf f).2 (fun _ _ h => h)
  cases w with
  | false => exact ⟨.a, rfl, nf false rfl⟩
  | true => exact ⟨.c, rfl, nf false rfl⟩

theorem not_nea_b : ¬ NEa blk8 Ex8 .b := by
  intro h
  have ess : EssA blk8 Ex8 (fun k => k = .k3) .b := by
    intro g
    constructor
    · intro hn ⟨w, y⟩ hc hf
      cases w <;> cases y <;> first
        | exact Bool.noConfusion hc
        | exact Bk.noConfusion hf
        | exact hn true rfl
    · intro he w hw
      cases w with
      | false => exact Bool.noConfusion hw
      | true => exact he (true, .b) rfl rfl
  obtain ⟨y, hy, hf⟩ := h _ ess false
  cases y <;> first | exact Bool.noConfusion hy | exact Bk.noConfusion hf

/-- **E15 (4).**  A model of A1, Anderson's A2, A3' and A5₀ (actualist reading) in which A5'
    fails: no property of the algebra holds at exactly the Anderson-necessary individuals. -/
theorem cm8 : A1v blk8 Ex8 P8 ∧ A2w P8 ∧ A3a blk8 Ex8 P8 ∧ A5z blk8 Ex8 P8 ∧
    ¬ A5a blk8 Ex8 P8 := by
  refine ⟨fun f g hf hfg => hfg (false, .g) rfl hf, fun f hf hn => hn hf,
    ⟨fun k => k = .B, rfl, fun c => (blkB c).trans (gstar8 c.2).symm⟩,
    ⟨fun k => k = .B, rfl, fun c => (blkB c).trans (ne0_8 c.2).symm⟩, ?_⟩
  intro ⟨n, _, hnc⟩
  have hk : n .k1 := (hnc (false, .a)).2 nea_a
  exact not_nea_b ((hnc (false, .b)).1 hk)

end TheismFormal.Closure
