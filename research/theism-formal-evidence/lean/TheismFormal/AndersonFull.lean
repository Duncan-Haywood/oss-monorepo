import TheismFormal.AndersonK
/-!
  E20 (experiments/e20_full_semantics/results.md), machine-checked: what E19's frame conditions
  become once the property collection can tell individuals apart.

  Definitions are `AndersonK`'s: any accessibility relation, any (varying, possibly empty)
  domains, any Henkin-style collection `Pr` with extension `ev`.  Call the collection
  *separating* when, for an individual `x`, it has the rigid singleton `s` (`ev s y v ↔ y = x`),
  its complement, and the existence property `e` (`ev e y v ↔ Ex v y`).  Full semantics
  (`Pr = D → W → Prop`) has all three for every `x`; E19's coarse block algebras need not.

  (1) `god_unique`: with `s` and its complement, A1a and T2 leave at most one God-like
      individual at any world (a God-like world must have a successor, by A1a).
  (2) `essential_any`: GodIsEssential in EVERY frame, from A1a, A2, T2, given singletons and
      complements.  E19's AFP route needed reflexivity and A4a, or symmetry.
  (3) `god_exists_succ`, `geine_any`: with `s` and `e`, A2 and T2 make a God-like individual
      exist and be God-like at every successor; so GodExistenceImpliesNecExistence holds in
      every frame, without A1a, A4a or A5.
  (4) `essential_failure`: for ANY collection, if GodIsEssential fails for `x` at `w`, some
      successor of `w` has an existing God-like individual other than `x`.
  (5) `cm_s4_full`: symmetry stays necessary for GodNecExists under full semantics.  Two worlds
      (`Fin 2`), one individual (`Unit`), every property of type `Unit → Fin 2 → Prop`;
      R = ≤ (reflexive, transitive, not symmetric); the individual exists only at world 1;
      P w Y iff Y holds at world 1.  A1a, A2, T2, A4a and A5 hold, and at world 0 the accessible
      world 0 has no existing God-like individual.  This is E19's smallest S4 countermodel.
-/

namespace TheismFormal.AndersonK

variable {W D Pr : Type}
variable {R : W → W → Prop} {Ex : W → D → Prop} {ev : Pr → D → W → Prop} {P : W → Pr → Prop}

/-- The rigid singleton of `x`. -/
def IsSing (ev : Pr → D → W → Prop) (x : D) (s : Pr) : Prop := ∀ y v, ev s y v ↔ y = x

/-- The existence property. -/
def IsEx (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (e : Pr) : Prop := ∀ y v, ev e y v ↔ Ex v y

/-- A world where someone is God-like has a successor (A1a with a property and its complement). -/
theorem god_serial {x : D} {s sc : Pr} (hc : IsCompl ev s sc) (h1 : A1a ev P) {v : W}
    (hx : God R ev P x v) : ∃ u, R v u := by
  apply Classical.byContradiction
  intro hno
  have hall : ∀ Y, P v Y := fun Y => (hx Y).2 (fun u hu => absurd ⟨u, hu⟩ hno)
  exact h1 v s sc hc (hall sc) (hall s)

/-- **(1)** Two God-like individuals at one world are equal, given `x`'s singleton and its
    complement. -/
theorem god_unique {x z : D} {s sc : Pr} (hs : IsSing ev x s) (hc : IsCompl ev s sc)
    (h1 : A1a ev P) {v : W} (hx : God R ev P x v) (hz : God R ev P z v) : z = x := by
  obtain ⟨u, hu⟩ := god_serial hc h1 hx
  have hpos : P v s := (hx s).2 (fun u' _ => (hs x u').2 rfl)
  exact (hs z u).1 ((hz s).1 hpos u hu)

/-- **(2) GodIsEssential in every frame**, given singletons and their complements. -/
theorem essential_any {g : Pr} (hg : IsG R ev P g) (h1 : A1a ev P) (h2 : A2 R Ex ev P)
    (ht : T2 P g) {x : D} (hsep : ∃ s sc, IsSing ev x s ∧ IsCompl ev s sc) {w : W}
    (hx : God R ev P x w) : Ess R Ex ev w g x := by
  obtain ⟨s, sc, hs, hc⟩ := hsep
  intro Z
  constructor
  · intro hbox v hv z _ hgz
    have hxv : God R ev P x v := (hg x v).1 ((hx g).1 (ht w) v hv)
    have hzx : z = x := god_unique hs hc h1 hxv ((hg z v).1 hgz)
    subst hzx
    exact hbox v hv
  · intro hent
    exact (hx Z).1 (h2 w g Z (ht w) hent)

/-- **(3a)** With `x`'s singleton and the existence property, a God-like `x` exists and is
    God-like at every successor (A2 and T2 only). -/
theorem god_exists_succ {g s e : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    {x : D} (hs : IsSing ev x s) (he : IsEx Ex ev e) {w : W} (hx : God R ev P x w) :
    ∀ v, R w v → Ex v x ∧ God R ev P x v := by
  have hps : P w s := (hx s).2 (fun u _ => (hs x u).2 rfl)
  have hent : Ent R Ex ev w s e := fun v _ z hz _ => (he z v).2 hz
  have hpe : P w e := h2 w s e hps hent
  intro v hv
  exact ⟨(he x v).1 ((hx e).1 hpe v hv), (hg x v).1 ((hx g).1 (ht w) v hv)⟩

/-- **(3b) GodExistenceImpliesNecExistence in every frame**: if someone is God-like at `w`,
    every successor has an existing God-like individual. -/
theorem geine_any {g e : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    (he : IsEx Ex ev e) (hsing : ∀ x : D, ∃ s, IsSing ev x s) {w : W}
    (hex : ∃ x, God R ev P x w) : ∀ v, R w v → ∃ z, Ex v z ∧ God R ev P z v := by
  obtain ⟨x, hx⟩ := hex
  obtain ⟨s, hs⟩ := hsing x
  intro v hv
  exact ⟨x, god_exists_succ hg h2 ht hs he hx v hv⟩

/-- **(4)** For any collection: a failure of GodIsEssential for `x` at `w` forces a successor
    with an existing God-like individual other than `x`. -/
theorem essential_failure {g : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    {x : D} {w : W} (hx : God R ev P x w) (hfail : ¬ Ess R Ex ev w g x) :
    ∃ v z, R w v ∧ Ex v z ∧ God R ev P z v ∧ z ≠ x := by
  apply Classical.byContradiction
  intro hno
  apply hfail
  intro Z
  constructor
  · intro hbox v hv z hz hgz
    have hzx : z = x := Classical.byContradiction fun hne => hno ⟨v, z, hv, hz, (hg z v).1 hgz, hne⟩
    subst hzx
    exact hbox v hv
  · intro hent
    exact (hx Z).1 (h2 w g Z (ht w) hent)

/-! ### (5) The S4 countermodel under full semantics -/

namespace CM

abbrev W2 := Fin 2
abbrev Prf := Unit → W2 → Prop

def R2 : W2 → W2 → Prop := fun w v => w ≤ v
def Ex2 : W2 → Unit → Prop := fun v _ => v = 1
def ev2 : Prf → Unit → W2 → Prop := fun X y v => X y v
def P2 : W2 → Prf → Prop := fun _ Y => Y () 1

def g2 : Prf := fun y v => God R2 ev2 P2 y v
def n2 : Prf := fun y v => NE R2 Ex2 ev2 y v

theorem r_one (w : W2) : R2 w 1 := by
  show w ≤ 1
  exact Fin.le_last w

theorem r_from_one {v : W2} (h : R2 1 v) : v = 1 := by
  apply Fin.ext
  have h' : (1 : W2).val ≤ v.val := h
  have : v.val < 2 := v.isLt
  show v.val = 1
  have : (1 : W2).val = 1 := rfl
  omega

theorem god_one : God R2 ev2 P2 () 1 := by
  intro Y
  constructor
  · intro hY v hv
    have := r_from_one hv
    subst this
    exact hY
  · intro h
    exact h 1 (r_one 1)

theorem not_god_zero : ¬ God R2 ev2 P2 () 0 := by
  intro h
  have h1 : (fun (_ : Unit) (v : W2) => v = 1) () 0 :=
    (h (fun _ v => v = 1)).1 rfl 0 (Fin.le_refl 0)
  exact absurd h1 (by decide)

theorem ne_one : NE R2 Ex2 ev2 () 1 := by
  intro Y hY v hv
  have := r_from_one hv
  subst this
  have hent : Ent R2 Ex2 ev2 1 Y Y := fun _ _ _ _ h => h
  have hY1 : ev2 Y () 1 := (hY Y).2 hent 1 (r_one 1)
  exact ⟨(), rfl, hY1⟩

theorem cm_s4_full :
    (∀ w, R2 w w) ∧ (∀ a b c, R2 a b → R2 b c → R2 a c) ∧ ¬ (∀ a b, R2 a b → R2 b a) ∧
    IsG R2 ev2 P2 g2 ∧ IsNE R2 Ex2 ev2 n2 ∧
    A1a ev2 P2 ∧ A2 R2 Ex2 ev2 P2 ∧ T2 P2 g2 ∧ A4a R2 P2 ∧ A5 P2 n2 ∧
    (∀ x : Unit, ∃ s, IsSing ev2 x s) ∧ IsEx Ex2 ev2 (fun y v => Ex2 v y) ∧
    ¬ (∀ v, R2 0 v → ∃ z, Ex2 v z ∧ God R2 ev2 P2 z v) := by
  refine ⟨fun w => Fin.le_refl w, fun a b c h1 h2 => Fin.le_trans h1 h2, ?_,
    fun _ _ => Iff.rfl, fun _ _ => Iff.rfl, ?_, ?_, ?_, ?_, ?_, ?_, fun _ _ => Iff.rfl, ?_⟩
  · intro h
    have : (1 : W2) ≤ 0 := h 0 1 (r_one 0)
    exact absurd this (by decide)
  · intro w X Xc hc hXc hX
    exact (hc () 1).1 hXc hX
  · intro w X Y hX hent
    exact hent 1 (r_one w) () rfl hX
  · intro w
    exact god_one
  · intro w v _ X hX
    exact hX
  · intro w
    exact ne_one
  · intro x
    exact ⟨fun y _ => y = x, fun _ _ => Iff.rfl⟩
  · intro h
    obtain ⟨_, hz, _⟩ := h 0 (Fin.le_refl 0)
    have hz' : (0 : W2) = 1 := hz
    exact absurd hz' (by decide)

end CM

end TheismFormal.AndersonK
