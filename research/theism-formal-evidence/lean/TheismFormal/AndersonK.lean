/-
  E19 (experiments/e19_afp_anderson/results.md), machine-checked: Anderson's variant as the AFP
  formalises it (Fuenmayor & Benzmüller, AndersonProof.thy), over ANY accessibility relation and
  any (varying, possibly empty) domains, with properties drawn from any Henkin-style collection.

  Properties are a type `Pr` with an extension `ev X y v` (individual `y` has `X` at world `v`);
  full semantics is `Pr = D → W → Prop`, a block algebra is a subtype.  The God-like property,
  its complement and Anderson's necessary existence are assumed to be properties (`IsG`, `IsCompl`,
  `IsNE`), which is what T2, A1a and A5 presuppose.

  The AFP file proves its Part II under S5.  E19's search found that symmetry is what the
  conclusion uses, and these theorems show it:

  (1) `t3`: A1a, A2, T2 give, at every world, an accessible world with an existing God-like
      individual (the file's T3; no frame condition).
  (2) `essential_refl`: in a reflexive frame, A2, T2, A4a make God-likeness an essence of each
      God-like individual (the file's GodIsEssential, from its proof, without symm or tran).
  (3) `essential_symm`: in a symmetric frame the same holds from A2 and T2 alone, without A4a.
  (4) `nec_exists_symm`: in a symmetric frame, A1a, A2, T2, A5 give the file's conclusion
      GodNecExists at every world: at every accessible world some God-like individual exists.
      No reflexivity, no transitivity, no A4a.
  (5) `domain_nonempty_symm`: in a symmetric frame those axioms leave no world with an empty domain.
  (6) `a4b_symm`, `rigid_symm`: with A4a, symmetry makes P rigid (the file's A4b and rigidPred).
-/

namespace TheismFormal.AndersonK

variable {W D Pr : Type}

section defs
variable (R : W → W → Prop) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop)

/-- G^A: `y` is God-like at `w` iff the positive properties are exactly those `y` has at every
    world `w` sees. -/
def God (y : D) (w : W) : Prop := ∀ Y, P w Y ↔ ∀ v, R w v → ev Y y v

/-- Actualist entailment at `w`: box (forall existing z, X z -> Y z). -/
def Ent (w : W) (X Y : Pr) : Prop := ∀ v, R w v → ∀ z, Ex v z → ev X z v → ev Y z v

/-- Anderson's essence (Fitting Def. 11.34): `x` has `Z` necessarily iff `Y` entails `Z`. -/
def Ess (w : W) (Y : Pr) (x : D) : Prop := ∀ Z, (∀ v, R w v → ev Z x v) ↔ Ent R Ex ev w Y Z

/-- Anderson's necessary existence (Def. 11.35). -/
def NE (x : D) (w : W) : Prop :=
  ∀ Y, Ess R Ex ev w Y x → ∀ v, R w v → ∃ z, Ex v z ∧ ev Y z v

def IsCompl (X Xc : Pr) : Prop := ∀ z v, ev Xc z v ↔ ¬ ev X z v
def A1a : Prop := ∀ w X Xc, IsCompl ev X Xc → P w Xc → ¬ P w X
def A2 : Prop := ∀ w X Y, P w X → Ent R Ex ev w X Y → P w Y
def IsG (g : Pr) : Prop := ∀ y v, ev g y v ↔ God R ev P y v
def T2 (g : Pr) : Prop := ∀ w, P w g
def A4a : Prop := ∀ w v, R w v → ∀ X, P w X → P v X
def IsNE (n : Pr) : Prop := ∀ y v, ev n y v ↔ NE R Ex ev y v
def A5 (n : Pr) : Prop := ∀ w, P w n

end defs

variable {R : W → W → Prop} {Ex : W → D → Prop} {ev : Pr → D → W → Prop} {P : W → Pr → Prop}

/-- **(1) T3**: some accessible world has an existing God-like individual. -/
theorem t3 {g gc : Pr} (hg : IsG R ev P g) (hc : IsCompl ev g gc) (h1 : A1a ev P)
    (h2 : A2 R Ex ev P) (ht : T2 P g) (w : W) :
    ∃ v, R w v ∧ ∃ y, Ex v y ∧ God R ev P y v := by
  apply Classical.byContradiction
  intro hno
  have hent : Ent R Ex ev w g gc := by
    intro v hv z hz hgz
    exact absurd ⟨v, hv, z, hz, (hg z v).1 hgz⟩ hno
  exact h1 w g gc hc (h2 w g gc (ht w) hent) (ht w)

/-- **(2) GodIsEssential in a reflexive frame** (the AFP's proof, refl only). -/
theorem essential_refl (hrefl : ∀ w, R w w) {g : Pr} (hg : IsG R ev P g)
    (h2 : A2 R Ex ev P) (ht : T2 P g) (h4 : A4a R P) {x : D} {w : W}
    (hx : God R ev P x w) : Ess R Ex ev w g x := by
  intro Z
  constructor
  · intro hbox v hv z _ hgz
    have hpos : P v Z := h4 w v hv Z ((hx Z).2 hbox)
    exact ((hg z v).1 hgz Z).1 hpos v (hrefl v)
  · intro hent
    exact (hx Z).1 (h2 w g Z (ht w) hent)

/-- In a symmetric frame, a God-like individual at a world `w` sees is God-like at `w`. -/
theorem godlike_back (hsym : ∀ w v, R w v → R v w) {g : Pr} (hg : IsG R ev P g) (ht : T2 P g)
    {w v : W} (hv : R w v) {z : D} (hz : God R ev P z v) : God R ev P z w :=
  (hg z w).1 ((hz g).1 (ht v) w (hsym w v hv))

/-- **(3) GodIsEssential in a symmetric frame**, from A2 and T2 alone. -/
theorem essential_symm (hsym : ∀ w v, R w v → R v w) {g : Pr} (hg : IsG R ev P g)
    (h2 : A2 R Ex ev P) (ht : T2 P g) {x : D} {w : W}
    (hx : God R ev P x w) : Ess R Ex ev w g x := by
  intro Z
  constructor
  · intro hbox v hv z _ hgz
    have hzw : God R ev P z w := godlike_back hsym hg ht hv ((hg z v).1 hgz)
    exact (hzw Z).1 ((hx Z).2 hbox) v hv
  · intro hent
    exact (hx Z).1 (h2 w g Z (ht w) hent)

/-- **(4) GodNecExists in a symmetric frame**: at every world `w` sees, a God-like individual
    exists.  Uses A1a, A2, T2, A5; no reflexivity, transitivity or A4a. -/
theorem nec_exists_symm (hsym : ∀ w v, R w v → R v w) {g gc n : Pr} (hg : IsG R ev P g)
    (hc : IsCompl ev g gc) (hn : IsNE R Ex ev n) (h1 : A1a ev P) (h2 : A2 R Ex ev P)
    (ht : T2 P g) (h5 : A5 P n) (w : W) :
    ∀ v, R w v → ∃ z, Ex v z ∧ God R ev P z v := by
  obtain ⟨v0, hv0, y, _, hy⟩ := t3 hg hc h1 h2 ht w
  have hyw : God R ev P y w := godlike_back hsym hg ht hv0 hy
  have hne : NE R Ex ev y w := (hn y w).1 ((hy n).1 (h5 v0) w (hsym w v0 hv0))
  intro v hv
  obtain ⟨z, hz, hgz⟩ := hne g (essential_symm hsym hg h2 ht hyw) v hv
  exact ⟨z, hz, (hg z v).1 hgz⟩

/-- **(5)** In a symmetric frame the axioms leave no world with an empty domain. -/
theorem domain_nonempty_symm (hsym : ∀ w v, R w v → R v w) {g gc n : Pr} (hg : IsG R ev P g)
    (hc : IsCompl ev g gc) (hn : IsNE R Ex ev n) (h1 : A1a ev P) (h2 : A2 R Ex ev P)
    (ht : T2 P g) (h5 : A5 P n) (w : W) : ∃ z, Ex w z := by
  obtain ⟨v, hv, _⟩ := t3 hg hc h1 h2 ht w
  obtain ⟨z, hz, _⟩ := nec_exists_symm hsym hg hc hn h1 h2 ht h5 v w (hsym w v hv)
  exact ⟨z, hz⟩

/-- **(6)** The file's A4b: with A4a and symmetry, a non-positive property stays non-positive. -/
theorem a4b_symm (hsym : ∀ w v, R w v → R v w) (h4 : A4a R P) {w v : W} (hv : R w v) (X : Pr)
    (hX : ¬ P w X) : ¬ P v X :=
  fun hp => hX (h4 v w (hsym w v hv) X hp)

/-- The file's rigidPred: with A4a and symmetry, P is the same at every accessible world. -/
theorem rigid_symm (hsym : ∀ w v, R w v → R v w) (h4 : A4a R P) {w v : W} (hv : R w v)
    (X : Pr) : P v X ↔ P w X :=
  ⟨fun hp => h4 v w (hsym w v hv) X hp, h4 w v hv X⟩

end TheismFormal.AndersonK
