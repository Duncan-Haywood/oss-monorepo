/-
  E10's theorem (experiments/e10_theorem/results.md), machine-checked.

  Setting, as in E7 to E10: worlds `W`, individuals `D` (constant domain), S5, cells `W × D`.
  A finite Boolean algebra of properties is the set of unions of the blocks of a partition of
  the cells; we present it by a surjective block map `blk : W × D → K`, so a property is a
  predicate `f : K → Prop` on blocks, holding at the cell `c` when `f (blk c)`.  Nothing here
  needs `K`, `W` or `D` to be finite: the theorem holds for every block algebra (an atomic
  complete algebra of cell sets), which covers every finite algebra.

  `x` has `f` necessarily iff `f` holds at every cell of `x`'s row.  The positive set `P` is
  the same at every world (A4 built in).  Anderson's axioms:

  * A1  `P f` and `f ⊆ g` give `P g`;
  * A2  exactly one of `f` and its complement is positive;
  * G*(x) iff for every property `f`, `P f ↔ □f(x)`;
  * A3' God-likeness (the union of the rows of the God-like) is a property, and it is positive;
  * ess, NE, A5' as in E10, step 4 (proved never to bind, `ne_everyone`).

  Core Lean 4 only; classical logic where A2 needs it.
-/
namespace TheismFormal.Anderson

variable {W D K : Type}

/-- `x` has `f` necessarily: `f` holds at every cell of `x`'s row. -/
def Nec (blk : W × D → K) (f : K → Prop) (x : D) : Prop := ∀ w, f (blk (w, x))

/-- Anderson's God-likeness G*. -/
def GStar (blk : W × D → K) (P : (K → Prop) → Prop) (x : D) : Prop :=
  ∀ f, P f ↔ Nec blk f x

def A1 (P : (K → Prop) → Prop) : Prop := ∀ f g : K → Prop, P f → (∀ k, f k → g k) → P g

def A2 (P : (K → Prop) → Prop) : Prop := ∀ f : K → Prop, P f ↔ ¬ P (fun k => ¬ f k)

/-- Anderson's own A2 (1990): if `f` is positive, its complement is not.  Scott's A2 adds the
    converse; Benzmüller & Fuenmayor (2020, sec. 5) point out that Anderson drops it. -/
def A2w (P : (K → Prop) → Prop) : Prop := ∀ f : K → Prop, P f → ¬ P (fun k => ¬ f k)

theorem A2.weak {P : (K → Prop) → Prop} (h : A2 P) : A2w P := fun f => (h f).1

/-- A3': some positive property holds at exactly the cells of God-like individuals. -/
def A3' (blk : W × D → K) (P : (K → Prop) → Prop) : Prop :=
  ∃ g, P g ∧ ∀ c, g (blk c) ↔ GStar blk P c.2

/-- Anderson's essence: `f` is an essence of `x` iff `x` has necessarily exactly the
    properties `f` entails. -/
def Ess (blk : W × D → K) (f : K → Prop) (x : D) : Prop :=
  ∀ g, Nec blk g x ↔ ∀ k, f k → g k

/-- Necessary existence: every essence of `x` is instantiated at every world. -/
def NE (blk : W × D → K) (x : D) : Prop :=
  ∀ f, Ess blk f x → ∀ w, ∃ y, f (blk (w, y))

/-- Step 4 of E10: everyone necessarily exists, whatever `P` is.  Any essence `f` of `x`
    entails itself, so `x` has `f` necessarily, so `f` holds on `x`'s row at every world. -/
theorem ne_everyone (blk : W × D → K) (x : D) : NE blk x :=
  fun f hf w => ⟨x, (hf f).2 (fun _ h => h) w⟩

/-- Hence A5' (the union of the necessary existents' rows is positive) reduces to "the
    property true everywhere is positive", which A1 gives from any positive property and A2
    guarantees there is one. -/
theorem a5'_holds (P : (K → Prop) → Prop) (h1 : A1 P) (h2 : A2 P) :
    P (fun _ => True) := by
  cases Classical.em (P (fun _ => False)) with
  | inl h => exact h1 _ _ h (fun _ _ => trivial)
  | inr h =>
    -- not P ⊥, so by A2 (applied to ¬⊥) P (¬⊥), and ¬⊥ ⊆ ⊤.
    have : P (fun _ => ¬ False) := by
      cases Classical.em (P (fun _ => ¬ False)) with
      | inl h' => exact h'
      | inr h' =>
        -- then by A2, P ⊥ ↔ ¬ P(¬⊥) gives P ⊥, contradiction
        exact absurd ((h2 (fun _ => False)).2 h') h
    exact h1 _ _ this (fun _ _ => trivial)

/-- Step 1: some individual is God-like.  Otherwise A3''s positive `g` is false on every
    block (blocks are non-empty: `blk` is onto), so by A1 every property is positive,
    against A2. -/
theorem exists_godlike (blk : W × D → K) (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1 P) (h2 : A2w P) (h3 : A3' blk P) :
    ∃ x, GStar blk P x := by
  cases Classical.em (∃ x, GStar blk P x) with
  | inl h => exact h
  | inr hno =>
    obtain ⟨g, hg, hgc⟩ := h3
    have gfalse : ∀ k, ¬ g k := by
      intro k hk
      obtain ⟨c, hc⟩ := onto k
      exact hno ⟨c.2, (hgc c).1 (hc ▸ hk)⟩
    have all : ∀ f, P f := fun f => h1 g f hg (fun k hk => absurd hk (gfalse k))
    exact (h2 (fun _ => True) (all _) (all _)).elim

/-- Step 2: a God-like individual's row lies inside one block `b`, and `P` is the principal
    filter at `b`. -/
theorem principal (blk : W × D → K) (P : (K → Prop) → Prop) (h2 : A2 P)
    (x : D) (w0 : W) (hx : GStar blk P x) :
    (∀ w, blk (w, x) = blk (w0, x)) ∧ ∀ f, P f ↔ f (blk (w0, x)) := by
  have row : ∀ w, blk (w, x) = blk (w0, x) := by
    cases Classical.em (P (fun k => k = blk (w0, x))) with
    | inl h => exact (hx _).1 h
    | inr h =>
      have hc := (hx (fun k => ¬ k = blk (w0, x))).1
        (Classical.byContradiction fun hn => h ((h2 _).2 hn))
      exact absurd rfl (hc w0)
  refine ⟨row, fun f => ?_⟩
  rw [hx f]
  exact ⟨fun h => h w0, fun h w => (row w) ▸ h⟩

/-- Step 3: the block `b` is exactly the union of the God-like rows. -/
theorem block_is_godlike (blk : W × D → K) (P : (K → Prop) → Prop) (h2 : A2 P)
    (h3 : A3' blk P) (x : D) (w0 : W) (hx : GStar blk P x) :
    ∀ c, blk c = blk (w0, x) ↔ GStar blk P c.2 := by
  obtain ⟨_, hP⟩ := principal blk P h2 x w0 hx
  obtain ⟨g, hg, hgc⟩ := h3
  intro c
  constructor
  · intro hc
    exact (hgc c).1 (hc ▸ (hP g).1 hg)
  · intro hy
    exact (hy (fun k => k = blk (w0, x))).1 ((hP _).2 rfl) c.1

/-- **E10's theorem, forward direction.**  Every model of A1, A2, A3' (A5' holds
    automatically, `a5'_holds`, `ne_everyone`) has a block `b` such that `P` is the principal
    filter at `b` and `b` is a union of whole rows: those of the God-like individuals. -/
theorem model_has_row_block (blk : W × D → K) (onto : ∀ k, ∃ c, blk c = k) (w0 : W)
    (P : (K → Prop) → Prop) (h1 : A1 P) (h2 : A2 P) (h3 : A3' blk P) :
    ∃ b, (∀ f, P f ↔ f b) ∧ (∀ c, blk c = b ↔ GStar blk P c.2) ∧
      ∃ x, GStar blk P x := by
  obtain ⟨x, hx⟩ := exists_godlike blk onto P h1 h2.weak h3
  exact ⟨blk (w0, x), (principal blk P h2 x w0 hx).2,
    block_is_godlike blk P h2 h3 x w0 hx, x, hx⟩

/-- **E10's theorem, converse.**  If the block `b` is a union of rows (membership depends only
    on the individual; with `blk` onto, `b` is also non-empty), the principal filter at `b` satisfies A1, A2 and A3'. -/
theorem row_block_gives_model (blk : W × D → K) (w0 : W) (b : K)
    (rows : ∀ w w' y, blk (w, y) = b → blk (w', y) = b) :
    let P : (K → Prop) → Prop := fun f => f b
    A1 P ∧ A2 P ∧ A3' blk P := by
  intro P
  refine ⟨fun f g hf hfg => hfg b hf, fun f => ?_, ?_⟩
  · exact ⟨fun h hn => hn h, fun h => Classical.byContradiction h⟩
  · refine ⟨fun k => k = b, rfl, fun c => ⟨fun hc f => ?_, fun hy => ?_⟩⟩
    · constructor
      · intro hf w
        show f (blk (w, c.2))
        rw [rows c.1 w c.2 hc]
        exact hf
      · intro hn
        show f b
        have e := rows c.1 w0 c.2 hc
        rw [← e]
        exact hn w0
    · exact (hy (fun k => k = b)).1 rfl c.1

/-- Distinct blocks give distinct models, so a property algebra has exactly as many models as
    it has blocks that are unions of rows. -/
theorem models_distinct (b b' : K) (h : ∀ f : K → Prop, f b ↔ f b') : b = b' :=
  (h (fun k => k = b')).2 rfl

/-- **Corollary (a).**  A God-like individual has no contingent property. -/
theorem godlike_rigid (blk : W × D → K) (P : (K → Prop) → Prop) (h2 : A2 P)
    (x : D) (hx : GStar blk P x) (f : K → Prop) (w w' : W) :
    f (blk (w, x)) ↔ f (blk (w', x)) := by
  obtain ⟨row, _⟩ := principal blk P h2 x w hx
  rw [row w']

/-- **Corollary (b).**  In a model, the algebra expresses no contingent proposition: if the
    property "S obtains" (true at a cell iff its world is in `S`) is in the algebra, `S` holds at
    every world or at none. -/
theorem no_contingent_proposition (blk : W × D → K) (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1 P) (h2 : A2 P) (h3 : A3' blk P)
    (S : W → Prop) (f : K → Prop) (hf : ∀ w y, f (blk (w, y)) ↔ S w) (w w' : W) :
    S w ↔ S w' := by
  obtain ⟨x, hx⟩ := exists_godlike blk onto P h1 h2.weak h3
  rw [← hf w x, ← hf w' x]
  exact godlike_rigid blk P h2 x hx f w w'

/-- **Corollary (d), full property semantics.**  When every cell is its own block (`blk` is
    injective) and there are two worlds, no model exists: the collapse of E4 and E7, at every
    size, finite or not. -/
theorem full_semantics_collapse (blk : W × D → K) (onto : ∀ k, ∃ c, blk c = k)
    (inj : ∀ c c', blk c = blk c' → c = c') (w w' : W) (hne : w ≠ w')
    (P : (K → Prop) → Prop) (h1 : A1 P) (h2 : A2 P) (h3 : A3' blk P) : False := by
  obtain ⟨x, hx⟩ := exists_godlike blk onto P h1 h2.weak h3
  obtain ⟨row, _⟩ := principal blk P h2 x w hx
  have := inj _ _ (row w')
  exact hne (congrArg Prod.fst this).symm
/-! ## Anderson's own A2 (E11)

With only the weak A2 the positive set need not be an ultrafilter.  The theorem: models
correspond one-to-one to the predicates `H` on blocks (unions of blocks) such that a cell is in
`H` exactly when its individual's hull (the blocks its row meets) is `H`; then `P` is the
principal filter at `H`. -/

/-- The blocks `y`'s row meets. -/
def Hull (blk : W × D → K) (y : D) (k : K) : Prop := ∃ w, blk (w, y) = k

theorem nec_iff_hull (blk : W × D → K) (f : K → Prop) (y : D) :
    Nec blk f y ↔ ∀ k, Hull blk y k → f k :=
  ⟨fun h _ ⟨w, hw⟩ => hw ▸ h w, fun h w => h _ ⟨w, rfl⟩⟩

/-- Two principal filters agree iff their generators do. -/
theorem upsets_eq_iff (A B : K → Prop) :
    (∀ f : K → Prop, (∀ k, A k → f k) ↔ (∀ k, B k → f k)) ↔ ∀ k, A k ↔ B k := by
  constructor
  · intro h k
    exact ⟨fun ha => (h B).2 (fun _ hb => hb) k ha, fun hb => (h A).1 (fun _ ha => ha) k hb⟩
  · intro h f
    exact ⟨fun hA k hb => hA k ((h k).2 hb), fun hB k ha => hB k ((h k).1 ha)⟩

/-- G*(y) with `P` the principal filter at `H` says exactly: `y`'s hull is `H`. -/
theorem gstar_principal (blk : W × D → K) (H : K → Prop) (y : D) :
    GStar blk (fun f => ∀ k, H k → f k) y ↔ ∀ k, H k ↔ Hull blk y k := by
  constructor
  · intro h
    apply (upsets_eq_iff H (Hull blk y)).1
    intro f
    exact (h f).trans (nec_iff_hull blk f y)
  · intro h f
    exact ((upsets_eq_iff H (Hull blk y)).2 h f).trans (nec_iff_hull blk f y).symm

/-- **E11, forward.**  Every model of A1, Anderson's A2, A3' is the principal filter at some
    `H` with: a cell is in `H` iff its individual's hull is `H`. -/
theorem weak_model_form (blk : W × D → K) (onto : ∀ k, ∃ c, blk c = k)
    (P : (K → Prop) → Prop) (h1 : A1 P) (h2 : A2w P) (h3 : A3' blk P) :
    ∃ H : K → Prop, (∀ f, P f ↔ ∀ k, H k → f k) ∧
      (∀ c, H (blk c) ↔ ∀ k, H k ↔ Hull blk c.2 k) := by
  obtain ⟨x, hx⟩ := exists_godlike blk onto P h1 h2 h3
  have hP : ∀ f, P f ↔ ∀ k, Hull blk x k → f k :=
    fun f => (hx f).trans (nec_iff_hull blk f x)
  -- G* is the same with P replaced by its description
  have hG : ∀ y, GStar blk P y ↔ ∀ k, Hull blk x k ↔ Hull blk y k := by
    intro y
    have e : GStar blk P y ↔ GStar blk (fun f => ∀ k, Hull blk x k → f k) y :=
      ⟨fun h f => (hP f).symm.trans (h f), fun h f => (hP f).trans (h f)⟩
    exact e.trans (gstar_principal blk (Hull blk x) y)
  obtain ⟨g, hg, hgc⟩ := h3
  refine ⟨Hull blk x, hP, fun c => ⟨fun hc => (hG c.2).1 ((hgc c).1 ((hP g).1 hg _ hc)),
    fun hc => ((hc (blk c)).2 ⟨c.1, rfl⟩)⟩⟩

/-- **E11, converse.**  Any non-empty such `H` gives a model: its principal filter satisfies
    A1, Anderson's A2 and A3' (A5' holds always, `ne_everyone`, `a5'_holds` needs only A1 and
    some positive property, here `H` itself). -/
theorem weak_model_of (blk : W × D → K) (H : K → Prop) (ne : ∃ k, H k)
    (hH : ∀ c, H (blk c) ↔ ∀ k, H k ↔ Hull blk c.2 k) :
    let P : (K → Prop) → Prop := fun f => ∀ k, H k → f k
    A1 P ∧ A2w P ∧ A3' blk P ∧ P (fun _ => True) := by
  intro P
  obtain ⟨k0, hk0⟩ := ne
  refine ⟨fun f g hf hfg k hk => hfg k (hf k hk), fun f hf hnf => hnf k0 hk0 (hf k0 hk0),
    ⟨H, fun _ h => h, fun c => (hH c).trans (gstar_principal blk H c.2).symm⟩,
    fun _ _ => trivial⟩

/-- Distinct generators give distinct models. -/
theorem weak_models_distinct (H H' : K → Prop)
    (h : ∀ f : K → Prop, (∀ k, H k → f k) ↔ (∀ k, H' k → f k)) : ∀ k, H k ↔ H' k :=
  (upsets_eq_iff H H').1 h

/-- **E11, full property semantics.**  When every cell is its own block, each individual `x`
    gives a model of Anderson's own axioms in which `x` is God-like, at any number of worlds;
    and if two worlds differ, `x` has a contingent property (true of it at `w` only), so
    nothing forces collapse. -/
theorem weak_full_semantics_model (blk : W × D → K)
    (inj : ∀ c c', blk c = blk c' → c = c') (x : D) (w w' : W) (hne : w ≠ w') :
    let P : (K → Prop) → Prop := fun f => ∀ k, Hull blk x k → f k
    (A1 P ∧ A2w P ∧ A3' blk P ∧ P (fun _ => True)) ∧ GStar blk P x ∧
      ∃ f : K → Prop, f (blk (w, x)) ∧ ¬ f (blk (w', x)) := by
  intro P
  have hH : ∀ c, Hull blk x (blk c) ↔ ∀ k, Hull blk x k ↔ Hull blk c.2 k := by
    intro c
    constructor
    · intro ⟨v, hv⟩
      have e : (v, x) = c := inj _ _ hv
      subst e
      exact fun _ => Iff.rfl
    · intro h
      obtain ⟨v, hv⟩ := (h (blk (w, x))).1 ⟨w, rfl⟩
      exact ⟨c.1, by
        have e : (v, c.2) = (w, x) := inj _ _ hv
        have : c.2 = x := congrArg Prod.snd e
        rw [← this]⟩
  refine ⟨weak_model_of blk (Hull blk x) ⟨_, ⟨w, rfl⟩⟩ hH,
    (gstar_principal blk (Hull blk x) x).2 (fun _ => Iff.rfl),
    fun k => k = blk (w, x), rfl, fun h => hne ?_⟩
  exact (congrArg Prod.fst (inj _ _ h)).symm

end TheismFormal.Anderson
