/-
  E12 (experiments/e12_varying_domains/results.md), machine-checked: Anderson's emendation with
  his own A2, varying domains and actualist quantifiers.

  `Ex c` says the individual of cell `c = (w, y)` exists at world `w`.  Properties stay
  possibilist (predicates on blocks); entailment, essence and necessary existence quantify over
  existents only; "x has f necessarily" (`Nec`) stays possibilist, as in Anderson's G*.

  Results: (1) in every model of A1, Anderson's A2, A3' and A5' some God-like individual exists
  at every world (the argument's conclusion), for any block algebra and any domains;
  (2) under full property semantics God-likeness picks out at most one individual, so that one
  exists at every world; (3) conversely, under full property semantics every individual that
  exists at every world is the God-like individual of a model of all four axioms.
  Core Lean 4 only.
-/
import TheismFormal.Anderson

namespace TheismFormal.Varying
open TheismFormal.Anderson

variable {W D K : Type}

/-- Actualist entailment: at every world, every existing individual with `f` has `g`. -/
def Ent (blk : W × D → K) (Ex : W × D → Prop) (f g : K → Prop) : Prop :=
  ∀ c, Ex c → f (blk c) → g (blk c)

/-- A1 with actualist entailment. -/
def A1v (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∀ f g, P f → Ent blk Ex f g → P g

/-- Anderson's essence, with actualist entailment. -/
def EssV (blk : W × D → K) (Ex : W × D → Prop) (f : K → Prop) (x : D) : Prop :=
  ∀ g, Nec blk g x ↔ Ent blk Ex f g

/-- Necessary existence: every essence of `x` is had by some existent at every world. -/
def NEv (blk : W × D → K) (Ex : W × D → Prop) (x : D) : Prop :=
  ∀ f, EssV blk Ex f x → ∀ w, ∃ y, Ex (w, y) ∧ f (blk (w, y))

/-- A5': some positive property holds at exactly the cells of necessary existents. -/
def A5v (blk : W × D → K) (Ex : W × D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∃ n, P n ∧ ∀ c, n (blk c) ↔ NEv blk Ex c.2

/-- Actualist A1 implies the constant-domain A1 (inclusion is an entailment). -/
theorem A1v.a1 {blk : W × D → K} {Ex : W × D → Prop} {P : (K → Prop) → Prop}
    (h : A1v blk Ex P) : A1 P :=
  fun f g hf hfg => h f g hf (fun _ _ hc => hfg _ hc)

/-- **E12 (1): the conclusion.**  In every model of A1, Anderson's A2, A3' and A5' with varying
    domains, at every world some God-like individual exists.  The God-likeness property `g` is
    an essence of a God-like `x`; `x` has the positive property NE necessarily, so that essence
    is had by an existent at every world, and whoever has `g` is God-like. -/
theorem godlike_exists_everywhere (blk : W × D → K) (Ex : W × D → Prop)
    (onto : ∀ k, ∃ c, blk c = k) (P : (K → Prop) → Prop)
    (h1 : A1v blk Ex P) (h2 : A2w P) (h3 : A3' blk P) (h5 : A5v blk Ex P) :
    ∀ w, ∃ y, Ex (w, y) ∧ GStar blk P y := by
  obtain ⟨x, hx⟩ := exists_godlike blk onto P h1.a1 h2 h3
  obtain ⟨g, hg, hgc⟩ := h3
  have ess : EssV blk Ex g x := by
    intro h
    constructor
    · intro hn c _ hgc'
      have hy : GStar blk P c.2 := (hgc c).1 hgc'
      exact (hy h).1 ((hx h).2 hn) c.1
    · intro he
      exact (hx h).1 (h1 g h hg he)
  obtain ⟨n, hn, hnc⟩ := h5
  intro w
  have nex : NEv blk Ex x := (hnc (w, x)).1 ((hx n).1 hn w)
  obtain ⟨y, hey, hgy⟩ := nex g ess w
  exact ⟨y, hey, (hgc (w, y)).1 hgy⟩

/-- **E12 (2).**  Under full property semantics (`blk` injective) and at least one world,
    two God-like individuals are the same individual. -/
theorem godlike_unique_full (blk : W × D → K) (inj : ∀ c c', blk c = blk c' → c = c')
    (P : (K → Prop) → Prop) (w0 : W) (x y : D)
    (hx : GStar blk P x) (hy : GStar blk P y) : x = y := by
  have : Nec blk (Hull blk x) y := (hy _).1 ((hx _).2 (fun w => ⟨w, rfl⟩))
  obtain ⟨v, hv⟩ := this w0
  exact congrArg Prod.snd (inj _ _ hv)

/-- Hence, under full property semantics, the God-like individual of any model of the four
    axioms exists at every world. -/
theorem full_godlike_necessary (blk : W × D → K) (Ex : W × D → Prop)
    (inj : ∀ c c', blk c = blk c' → c = c') (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1v blk Ex P) (h2 : A2w P) (h3 : A3' blk P)
    (h5 : A5v blk Ex P) (x : D) (hx : GStar blk P x) : ∀ w, Ex (w, x) := by
  intro w
  obtain ⟨y, hey, hy⟩ := godlike_exists_everywhere blk Ex onto P h1 h2 h3 h5 w
  rw [godlike_unique_full blk inj P w x y hx hy]
  exact hey

/-- Under full property semantics everyone is a necessary existent in the sense of NE: an
    individual missing from some world has no essence (the property "not this cell" separates
    them), and one present everywhere has its row as essence. -/
theorem nev_everyone_full (blk : W × D → K) (Ex : W × D → Prop)
    (inj : ∀ c c', blk c = blk c' → c = c') (y : D) : NEv blk Ex y := by
  intro f hf w
  cases Classical.em (∃ z, Ex (w, z) ∧ f (blk (w, z))) with
  | inl h => exact h
  | inr hno =>
    exfalso
    have hent : Ent blk Ex f (fun k => k ≠ blk (w, y)) := by
      intro c hc hfc heq
      have e : c = (w, y) := inj _ _ heq
      subst e
      exact hno ⟨y, hc, hfc⟩
    exact ((hf _).2 hent) w rfl

/-- Under full property semantics an individual's hull is generated by exactly its own row. -/
theorem hull_full (blk : W × D → K) (inj : ∀ c c', blk c = blk c' → c = c') (x : D) (w0 : W) :
    ∀ c, Hull blk x (blk c) ↔ ∀ k, Hull blk x k ↔ Hull blk c.2 k := by
  intro c
  constructor
  · intro ⟨v, hv⟩
    have e : (v, x) = c := inj _ _ hv
    subst e
    exact fun _ => Iff.rfl
  · intro h
    obtain ⟨v, hv⟩ := (h (blk (w0, x))).1 ⟨w0, rfl⟩
    have e : (v, c.2) = (w0, x) := inj _ _ hv
    have hx : c.2 = x := congrArg Prod.snd e
    exact ⟨c.1, by rw [← hx]⟩

/-- **E12 (3).**  Under full property semantics, an individual `x` that exists at every world
    is the God-like individual of a model of all four axioms (`P` = what `x` has necessarily). -/
theorem full_model_of_necessary (blk : W × D → K) (Ex : W × D → Prop)
    (inj : ∀ c c', blk c = blk c' → c = c') (x : D) (w0 : W) (hex : ∀ w, Ex (w, x)) :
    let P : (K → Prop) → Prop := fun f => ∀ k, Hull blk x k → f k
    A1v blk Ex P ∧ A2w P ∧ A3' blk P ∧ A5v blk Ex P ∧ GStar blk P x := by
  intro P
  obtain ⟨_, h2, h3, htop⟩ := weak_model_of blk (Hull blk x) ⟨_, ⟨w0, rfl⟩⟩ (hull_full blk inj x w0)
  refine ⟨?_, h2, h3, ⟨fun _ => True, htop, fun c => ⟨fun _ => nev_everyone_full blk Ex inj c.2,
    fun _ => trivial⟩⟩, (gstar_principal blk (Hull blk x) x).2 (fun _ => Iff.rfl)⟩
  intro f g hf hfg k ⟨v, hv⟩
  subst hv
  exact hfg (v, x) (hex v) (hf _ ⟨v, rfl⟩)

end TheismFormal.Varying
