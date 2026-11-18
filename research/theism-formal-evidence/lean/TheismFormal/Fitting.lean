/-
  E17 (experiments/e17_fitting/results.md), machine-checked: Fitting's variant of Gödel's
  argument, as Benzmüller & Fuenmayor (2020, arXiv:1910.08955, Fig. 6) encode it, over any block
  algebra of individuals and any (varying) domains, in S5.

  Positive properties are extensions: predicates on blocks `K`, the same at every world; `blk x`
  is the block of individual `x` (full property semantics: `blk` injective).  `Ex v z` says `z`
  exists at world `v`.  Every condition below is evaluated with one positive set `P`; without
  A4 a model gives each world its own `P`, each satisfying them.

  Results: (1) the models of A1a, A1b, A2, T2 are "contains x's block" for an x that exists
  somewhere, and adding A5 asks that x's block have an existent at every world; (2) Fitting's NE
  depends only on the block, so it is always in the algebra; (3) de dicto: with A5 some God-like
  individual exists at every world; (4) under full semantics God-likeness is unique and, with
  one positive set for all worlds (A4), de re holds; (5) countermodels: de re fails in a
  one-block algebra, and without A4 it fails under full semantics.  Core Lean 4 only.
-/

namespace TheismFormal.Fitting

variable {W D K : Type}

/-- Actualist entailment in S5: every individual that exists at some world and has `f` has `h`. -/
def Ent (blk : D → K) (Ex : W → D → Prop) (f h : K → Prop) : Prop :=
  ∀ v z, Ex v z → f (blk z) → h (blk z)

/-- A1a: if the complement of `f` is positive, `f` is not. -/
def A1a (P : (K → Prop) → Prop) : Prop := ∀ f, P (fun k => ¬ f k) → ¬ P f
/-- A1b: if `f` is not positive, its complement is. -/
def A1b (P : (K → Prop) → Prop) : Prop := ∀ f, ¬ P f → P (fun k => ¬ f k)
/-- A2: positive properties are closed under actualist entailment. -/
def A2 (blk : D → K) (Ex : W → D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∀ f h, P f → Ent blk Ex f h → P h
/-- Fitting's God-likeness: in the extension of every positive property. -/
def God (blk : D → K) (P : (K → Prop) → Prop) (x : D) : Prop := ∀ f, P f → f (blk x)
/-- T2: the extension of G is a property and is positive. -/
def T2 (blk : D → K) (P : (K → Prop) → Prop) : Prop :=
  ∃ g, P g ∧ ∀ x, g (blk x) ↔ God blk P x
/-- Fitting's essence: `x` has `f`, and `f` entails every property `x` has. -/
def Ess (blk : D → K) (Ex : W → D → Prop) (f : K → Prop) (x : D) : Prop :=
  f (blk x) ∧ ∀ h, h (blk x) → Ent blk Ex f h
/-- Necessary existence: every essence of `x` has an existent at every world. -/
def NE (blk : D → K) (Ex : W → D → Prop) (x : D) : Prop :=
  ∀ f, Ess blk Ex f x → ∀ v, ∃ z, Ex v z ∧ f (blk z)
/-- A5: the extension of NE is a property and is positive. -/
def A5 (blk : D → K) (Ex : W → D → Prop) (P : (K → Prop) → Prop) : Prop :=
  ∃ n, P n ∧ ∀ x, n (blk x) ↔ NE blk Ex x

variable {blk : D → K} {Ex : W → D → Prop} {P : (K → Prop) → Prop}

/-- Some God-like individual exists at some world (A1a, A2, T2). -/
theorem exists_god (h1a : A1a P) (h2 : A2 blk Ex P) (ht : T2 blk P) :
    ∃ x v, Ex v x ∧ God blk P x := by
  obtain ⟨g, hg, hgx⟩ := ht
  apply Classical.byContradiction
  intro hno
  have ent : ∀ h, Ent blk Ex g h := by
    intro h v z hz hgz
    exact (hno ⟨z, v, hz, (hgx z).1 hgz⟩).elim
  exact h1a (fun _ => True) (h2 g (fun k => ¬ (fun _ : K => True) k) hg (ent _))
    (h2 g (fun _ => True) hg (ent _))

/-- A God-like individual's properties are all positive (A1b). -/
theorem pos_of_god (h1b : A1b P) {x : D} (hx : God blk P x) (f : K → Prop)
    (hf : f (blk x)) : P f :=
  Classical.byContradiction fun hn => (hx _ (h1b f hn)) hf

/-- **E17 (2).**  Fitting's NE depends only on the block: `x` is a necessary existent iff its
    block has an existent at every world.  So NE is always in the algebra. -/
theorem ne_iff (blk : D → K) (Ex : W → D → Prop) (x : D) :
    NE blk Ex x ↔ ∀ v, ∃ z, Ex v z ∧ blk z = blk x := by
  constructor
  · intro hne v
    have ess : Ess blk Ex (fun k => k = blk x) x := by
      refine ⟨rfl, ?_⟩
      intro h hh w z _ hz
      have hz' : blk z = blk x := hz
      show h (blk z)
      rw [hz']; exact hh
    exact hne _ ess v
  · intro hb f hf v
    obtain ⟨z, hz, hzx⟩ := hb v
    refine ⟨z, hz, ?_⟩
    rw [hzx]; exact hf.1

theorem ne_in_algebra (blk : D → K) (Ex : W → D → Prop) :
    ∃ n : K → Prop, ∀ x, n (blk x) ↔ NE blk Ex x :=
  ⟨fun k => ∀ v, ∃ z, Ex v z ∧ blk z = k, fun x => (ne_iff blk Ex x).symm⟩

/-- **E17 (1).**  The models of A1a, A1b, A2, T2 are exactly "contains x's block" for an
    individual x that exists somewhere. -/
theorem model_iff (blk : D → K) (Ex : W → D → Prop) (P : (K → Prop) → Prop) :
    (A1a P ∧ A1b P ∧ A2 blk Ex P ∧ T2 blk P) ↔
      ∃ x, (∃ v, Ex v x) ∧ ∀ f, P f ↔ f (blk x) := by
  constructor
  · rintro ⟨h1a, h1b, h2, ht⟩
    obtain ⟨x, v, hv, hx⟩ := exists_god h1a h2 ht
    exact ⟨x, ⟨v, hv⟩, fun f => ⟨hx f, pos_of_god h1b hx f⟩⟩
  · rintro ⟨x, ⟨v0, hv0⟩, hP⟩
    refine ⟨?_, ?_, ?_, ?_⟩
    · intro f hn hf
      exact (hP _).1 hn ((hP f).1 hf)
    · intro f hn
      exact (hP _).2 (fun hf => hn ((hP f).2 hf))
    · intro f h hf he
      exact (hP h).2 (he v0 x hv0 ((hP f).1 hf))
    · refine ⟨fun k => k = blk x, (hP _).2 rfl, fun y => ⟨?_, ?_⟩⟩
      · intro hy f hf
        have hy' : blk y = blk x := hy
        rw [hy']; exact (hP f).1 hf
      · intro hy
        exact hy (fun k => k = blk x) ((hP _).2 rfl)

/-- **E17 (1), with A5.**  The models of all five are "contains x's block" for an x whose block
    has an existent at every world (given at least one world). -/
theorem model_a5_iff (w0 : W) (blk : D → K) (Ex : W → D → Prop) (P : (K → Prop) → Prop) :
    (A1a P ∧ A1b P ∧ A2 blk Ex P ∧ T2 blk P ∧ A5 blk Ex P) ↔
      ∃ x, (∀ v, ∃ z, Ex v z ∧ blk z = blk x) ∧ ∀ f, P f ↔ f (blk x) := by
  constructor
  · rintro ⟨h1a, h1b, h2, ht, ⟨n, hn, hnx⟩⟩
    obtain ⟨x, _, hP⟩ := (model_iff blk Ex P).1 ⟨h1a, h1b, h2, ht⟩
    exact ⟨x, (ne_iff blk Ex x).1 ((hnx x).1 ((hP n).1 hn)), hP⟩
  · rintro ⟨x, hb, hP⟩
    obtain ⟨z, hz, hzx⟩ := hb w0
    have hPz : ∀ f, P f ↔ f (blk z) := by
      intro f; rw [hzx]; exact hP f
    obtain ⟨h1a, h1b, h2, ht⟩ := (model_iff blk Ex P).2 ⟨z, ⟨w0, hz⟩, hPz⟩
    refine ⟨h1a, h1b, h2, ht, fun k => ∀ v, ∃ z, Ex v z ∧ blk z = k, (hP _).2 hb,
      fun y => (ne_iff blk Ex y).symm⟩

/-- **E17 (3): de dicto.**  With A5, at every world some God-like individual exists. -/
theorem de_dicto (h1a : A1a P) (h1b : A1b P) (h2 : A2 blk Ex P) (ht : T2 blk P)
    (h5 : A5 blk Ex P) : ∀ v, ∃ y, Ex v y ∧ God blk P y := by
  obtain ⟨x, _, _, hx⟩ := exists_god h1a h2 ht
  obtain ⟨g, hg, hgx⟩ := ht
  obtain ⟨n, hn, hnx⟩ := h5
  have ess : Ess blk Ex g x := by
    refine ⟨(hgx x).2 hx, ?_⟩
    intro h hh v z _ hgz
    exact (hgx z).1 hgz h (pos_of_god h1b hx h hh)
  have ne : NE blk Ex x := (hnx x).1 (hx n hn)
  intro v
  obtain ⟨z, hz, hgz⟩ := ne g ess v
  exact ⟨z, hz, (hgx z).1 hgz⟩

/-- **E17 (4).**  Under full semantics two God-like individuals are the same (A1b). -/
theorem god_unique_full (inj : ∀ x y, blk x = blk y → x = y) (h1b : A1b P) {x y : D}
    (hx : God blk P x) (hy : God blk P y) : x = y := by
  rcases Classical.em (P (fun k => k = blk x)) with h | h
  · exact (inj y x (hy (fun k => k = blk x) h)).symm
  · exact absurd rfl (hx (fun k => ¬ (fun k => k = blk x) k) (h1b _ h))

/-- **E17 (4): de re under full semantics with A4** (one positive set for every world): some
    individual is God-like and exists at every world. -/
theorem de_re_full (w0 : W) (inj : ∀ x y, blk x = blk y → x = y) (h1a : A1a P) (h1b : A1b P)
    (h2 : A2 blk Ex P) (ht : T2 blk P) (h5 : A5 blk Ex P) :
    ∃ x, God blk P x ∧ ∀ v, Ex v x := by
  have dd := de_dicto h1a h1b h2 ht h5
  obtain ⟨x, _, hx⟩ := dd w0
  refine ⟨x, hx, fun v => ?_⟩
  obtain ⟨y, hy, hgy⟩ := dd v
  rw [god_unique_full inj h1b hx hgy]; exact hy

/-- **E17 (5a): the de re gap, with A4.**  Two worlds, two individuals, each existing at one
    world, one block.  All five axioms hold and both individuals are God-like, yet no individual
    exists at every world. -/
theorem cm_de_re :
    let blk : Bool → Unit := fun _ => ()
    let Ex : Bool → Bool → Prop := fun v y => v = y
    let P : (Unit → Prop) → Prop := fun f => f ()
    (A1a P ∧ A1b P ∧ A2 blk Ex P ∧ T2 blk P ∧ A5 blk Ex P) ∧ (∀ y, God blk P y) ∧
      ¬ ∃ x : Bool, ∀ v, Ex v x := by
  intro blk Ex P
  refine ⟨(model_a5_iff true blk Ex P).2 ⟨true, fun v => ⟨v, rfl, rfl⟩, fun _ => Iff.rfl⟩,
    fun _ _ hf => hf, ?_⟩
  rintro ⟨x, hx⟩
  cases x
  · exact Bool.noConfusion (hx true)
  · exact Bool.noConfusion (hx false)

/-- **E17 (5b): without A4.**  Full semantics, two worlds, two individuals existing at both.
    Each world's positive set is a model of all five axioms, but the God-like individual at
    world `v` is `v`, so no individual is God-like at every world. -/
theorem cm_no_a4 :
    let blk : Bool → Bool := id
    let Ex : Bool → Bool → Prop := fun _ _ => True
    let Pw : Bool → (Bool → Prop) → Prop := fun v f => f v
    (∀ v, A1a (Pw v) ∧ A1b (Pw v) ∧ A2 blk Ex (Pw v) ∧ T2 blk (Pw v) ∧ A5 blk Ex (Pw v)) ∧
      ¬ ∃ x, ∀ v, God blk (Pw v) x := by
  intro blk Ex Pw
  refine ⟨fun v => (model_a5_iff true blk Ex (Pw v)).2
    ⟨v, fun _ => ⟨v, trivial, rfl⟩, fun _ => Iff.rfl⟩, ?_⟩
  rintro ⟨x, hx⟩
  have ht : x = true := hx true (fun k => k = true) rfl
  have hf : x = false := hx false (fun k => k = false) rfl
  exact Bool.noConfusion (ht.symm.trans hf)

end TheismFormal.Fitting
