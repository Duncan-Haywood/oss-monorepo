/-
  E13 (experiments/e13_actualist_necessity/results.md), machine-checked: Anderson's emendation
  with varying domains, actualist quantifiers and an ACTUALIST "x has f necessarily"
  (`NecA`: at every world where `x` exists, `x` has `f`).  E12 (`Varying.lean`) kept that one
  notion possibilist.

  Results: (1) de dicto: in every model of A1, Anderson's A2, A3' and A5' read this way, at every
  world some God-like individual exists, for any block algebra and any domains;
  (2) de re fails: a two-world, two-individual, one-block model satisfies all four axioms under
  this reading and under E12's possibilist one, yet no God-like individual exists at every world;
  (3) under full property semantics (`blk` injective) every God-like individual of a model of the
  four axioms exists at every world.  Core Lean 4 only.
-/
import TheismFormal.Varying

namespace TheismFormal.Actualist
open TheismFormal.Anderson TheismFormal.Varying

variable {W D K : Type}

/-- Actualist necessity: at every world where `x` exists, `x` has `f`. -/
def NecA (blk : W × D → K) (Ex : W × D → Prop) (f : K → Prop) (x : D) : Prop :=
  ∀ w, Ex (w, x) → f (blk (w, x))

/-- G* with actualist necessity. -/
def GStarA (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop) (x : D) : Prop :=
  ∀ f, P f ↔ NecA blk Ex f x

/-- A3': some positive property holds at exactly the cells of the God-like individuals. -/
def A3a (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∃ g, P g ∧ ∀ c, g (blk c) ↔ GStarA blk Ex P c.2

/-- Anderson's essence, actualist on both sides. -/
def EssA (blk : W × D → K) (Ex : W × D → Prop) (f : K → Prop) (x : D) : Prop :=
  ∀ g, NecA blk Ex g x ↔ Ent blk Ex f g

/-- Necessary existence: every essence of `x` is had by some existent at every world. -/
def NEa (blk : W × D → K) (Ex : W × D → Prop) (x : D) : Prop :=
  ∀ f, EssA blk Ex f x → ∀ w, ∃ y, Ex (w, y) ∧ f (blk (w, y))

/-- A5': some positive property holds at exactly the cells of necessary existents. -/
def A5a (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∃ n, P n ∧ ∀ c, n (blk c) ↔ NEa blk Ex c.2

/-- Some individual is God-like (else A3''s `g` is empty, so A1 makes everything positive). -/
theorem exists_godlikeA (blk : W × D → K) (Ex : W × D → Prop) (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1v blk Ex P) (h2 : A2w P) (h3 : A3a blk Ex P) :
    ∃ x, GStarA blk Ex P x := by
  cases Classical.em (∃ x, GStarA blk Ex P x) with
  | inl h => exact h
  | inr hno =>
    obtain ⟨g, hg, hgc⟩ := h3
    have gfalse : ∀ k, ¬ g k := by
      intro k hk
      obtain ⟨c, hc⟩ := onto k
      exact hno ⟨c.2, (hgc c).1 (hc ▸ hk)⟩
    have all : ∀ f, P f := fun f => h1 g f hg (fun c _ hc => absurd hc (gfalse _))
    exact (h2 (fun _ => True) (all _) (all _)).elim

/-- A God-like individual exists at some world (else it has every property necessarily, so
    every property is positive, against A2). -/
theorem godlike_exists_somewhere (blk : W × D → K) (Ex : W × D → Prop)
    (P : (K → Prop) → Prop) (h2 : A2w P) (x : D) (hx : GStarA blk Ex P x) :
    ∃ w, Ex (w, x) := by
  cases Classical.em (∃ w, Ex (w, x)) with
  | inl h => exact h
  | inr hno =>
    have all : ∀ f, P f := fun f => (hx f).2 (fun w hw => absurd ⟨w, hw⟩ hno)
    exact (h2 (fun _ => True) (all _) (all _)).elim

/-- **E13 (1): de dicto.**  In every model of A1, Anderson's A2, A3' and A5' with actualist
    necessity, at every world some God-like individual exists. -/
theorem godlike_exists_everywhereA (blk : W × D → K) (Ex : W × D → Prop)
    (onto : ∀ k, ∃ c, blk c = k) (P : (K → Prop) → Prop)
    (h1 : A1v blk Ex P) (h2 : A2w P) (h3 : A3a blk Ex P) (h5 : A5a blk Ex P) :
    ∀ w, ∃ y, Ex (w, y) ∧ GStarA blk Ex P y := by
  obtain ⟨x, hx⟩ := exists_godlikeA blk Ex onto P h1 h2 h3
  obtain ⟨w1, hw1⟩ := godlike_exists_somewhere blk Ex P h2 x hx
  obtain ⟨g, hg, hgc⟩ := h3
  have ess : EssA blk Ex g x := by
    intro h
    constructor
    · intro hn c hc hgc'
      have hy : GStarA blk Ex P c.2 := (hgc c).1 hgc'
      exact (hy h).1 ((hx h).2 hn) c.1 hc
    · intro he
      exact (hx h).1 (h1 g h hg he)
  obtain ⟨n, hn, hnc⟩ := h5
  have nex : NEa blk Ex x := (hnc (w1, x)).1 ((hx n).1 hn w1 hw1)
  intro w
  obtain ⟨y, hey, hgy⟩ := nex g ess w
  exact ⟨y, hey, (hgc (w, y)).1 hgy⟩

/-! ### E13 (2): de re fails, under both readings

Two worlds and two individuals (both `Bool`), one block (`Unit`), individual `y` exists only at
world `y`.  `P` = "holds of the block".  Both individuals are God-like and each is a necessary
existent in Anderson's sense (their one essence is had by someone at every world), but neither
exists at every world. -/

def blk1 : Bool × Bool → Unit := fun _ => ()
def Ex1 : Bool × Bool → Prop := fun c => c.1 = c.2
def P1 : (Unit → Prop) → Prop := fun f => f ()

theorem cm_axioms_actualist :
    A1v blk1 Ex1 P1 ∧ A2w P1 ∧ A3a blk1 Ex1 P1 ∧ A5a blk1 Ex1 P1 := by
  have gs : ∀ y, GStarA blk1 Ex1 P1 y := fun y f =>
    ⟨fun h _ _ => h, fun h => h y rfl⟩
  refine ⟨fun f g hf hfg => hfg (true, true) rfl hf, fun f hf hn => hn hf,
    ⟨fun _ => True, trivial, fun c => ⟨fun _ => gs c.2, fun _ => trivial⟩⟩,
    ⟨fun _ => True, trivial, fun c => ⟨fun _ => ?_, fun _ => trivial⟩⟩⟩
  intro f hf w
  exact ⟨w, rfl, ((hf f).2 (fun _ _ h => h)) c.2 rfl⟩

theorem cm_axioms_possibilist :
    A1v blk1 Ex1 P1 ∧ A2w P1 ∧ A3' blk1 P1 ∧ A5v blk1 Ex1 P1 := by
  have gs : ∀ y, GStar blk1 P1 y := fun y f =>
    ⟨fun h _ => h, fun h => h y⟩
  refine ⟨fun f g hf hfg => hfg (true, true) rfl hf, fun f hf hn => hn hf,
    ⟨fun _ => True, trivial, fun c => ⟨fun _ => gs c.2, fun _ => trivial⟩⟩,
    ⟨fun _ => True, trivial, fun c => ⟨fun _ => ?_, fun _ => trivial⟩⟩⟩
  intro f hf w
  exact ⟨w, rfl, ((hf f).2 (fun _ _ h => h)) c.2⟩

/-- In the countermodel no individual (God-like or not) exists at every world. -/
theorem cm_no_necessary_being : ¬ ∃ y, ∀ w, Ex1 (w, y) := by
  intro ⟨y, h⟩
  cases y
  · exact Bool.noConfusion (show true = false from h true)
  · exact Bool.noConfusion (show false = true from h false)

/-- **E13 (2).**  All four axioms hold under both readings, both individuals are God-like, and
    no God-like individual exists at every world. -/
theorem de_re_fails :
    (A1v blk1 Ex1 P1 ∧ A2w P1 ∧ A3a blk1 Ex1 P1 ∧ A5a blk1 Ex1 P1) ∧
    (A1v blk1 Ex1 P1 ∧ A2w P1 ∧ A3' blk1 P1 ∧ A5v blk1 Ex1 P1) ∧
    (∀ y, GStarA blk1 Ex1 P1 y ∧ GStar blk1 P1 y) ∧
    ¬ ∃ y, ∀ w, Ex1 (w, y) :=
  ⟨cm_axioms_actualist, cm_axioms_possibilist,
    fun y => ⟨fun _ => ⟨fun h _ _ => h, fun h => h y rfl⟩, fun _ => ⟨fun h _ => h, fun h => h y⟩⟩,
    cm_no_necessary_being⟩

/-- **E13 (3).**  Under full property semantics (`blk` injective), every God-like individual of
    a model of the four axioms (actualist reading) exists at every world. -/
theorem full_godlike_necessaryA (blk : W × D → K) (Ex : W × D → Prop)
    (inj : ∀ c c', blk c = blk c' → c = c') (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1v blk Ex P) (h2 : A2w P) (h3 : A3a blk Ex P)
    (h5 : A5a blk Ex P) (x : D) (hx : GStarA blk Ex P x) : ∀ w, Ex (w, x) := by
  intro w
  obtain ⟨y, hey, hy⟩ := godlike_exists_everywhereA blk Ex onto P h1 h2 h3 h5 w
  let hE : K → Prop := fun k => ∃ v, Ex (v, x) ∧ blk (v, x) = k
  have : NecA blk Ex hE y := (hy hE).1 ((hx hE).2 (fun v hv => ⟨v, hv, rfl⟩))
  obtain ⟨v, hv, heq⟩ := this w hey
  have e : (v, x) = (w, y) := inj _ _ heq
  have ex : x = y := congrArg Prod.snd e
  rw [ex]; exact hey

end TheismFormal.Actualist
