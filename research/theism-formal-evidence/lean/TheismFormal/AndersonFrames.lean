import TheismFormal.AndersonK
/-!
  E21 (experiments/e21_frame_characterisation/results.md), machine-checked: which frame shapes
  make GodIsEssential (the AFP's step in `AndersonProof.thy`) hold, with and without A4a.

  Definitions are `AndersonK`'s: any accessibility relation, any (varying, possibly empty)
  domains, any Henkin-style collection `Pr`.  `Reach R v u` is R* (zero or more steps).

  (1) `essential_iff` (H25 a): for a God-like `x` at `w`, God-likeness is an essence of `x` at `w`
      iff every existing God-like `z` at every successor `v` of `w` has, at `v`, every property
      positive at `w`.  A2 and T2 only; any frame, any collection.
  (2) `god_reach` (H25 b): T2 makes a God-like individual God-like at every world it reaches.
  (3) `essential_back`: if every successor `v` of `w` has some `u` in R*(v) with `u` R `v` and
      R(u) ⊆ R(w), GodIsEssential holds at `w`; no A4a.  Found AFTER the search refuted H25 (e)
      for stage I; it is the condition the search then matched, not a prediction.
  (4) `essential_cycle_edges` (H25 c): the special case u = w: every edge out of `w` lies on a
      cycle.  `essential_symm` (E19) is its one-line corollary.
  (5) `essential_a4` (H25 d): with A4a, it is enough that every successor of `w` lies on a cycle
      (some `u` in R*(v) sees `v`).  `essential_refl` (E19) is its one-line corollary.
-/

namespace TheismFormal.AndersonK

variable {W D Pr : Type}
variable {R : W → W → Prop} {Ex : W → D → Prop} {ev : Pr → D → W → Prop} {P : W → Pr → Prop}

/-- Zero or more `R` steps. -/
inductive Reach (R : W → W → Prop) : W → W → Prop
  | refl (a : W) : Reach R a a
  | tail {a b c : W} : Reach R a b → R b c → Reach R a c

/-- T2: a God-like individual is God-like at every successor. -/
theorem god_succ {g : Pr} (hg : IsG R ev P g) (ht : T2 P g) {z : D} {v u : W}
    (hz : God R ev P z v) (hu : R v u) : God R ev P z u :=
  (hg z u).1 ((hz g).1 (ht v) u hu)

/-- **(2)** God-likeness persists along R*. -/
theorem god_reach {g : Pr} (hg : IsG R ev P g) (ht : T2 P g) {z : D} {v u : W}
    (hz : God R ev P z v) (h : Reach R v u) : God R ev P z u := by
  induction h with
  | refl => exact hz
  | tail _ hbc ih => exact god_succ hg ht ih hbc

/-- A4a along R*. -/
theorem pos_reach (h4 : A4a R P) {v u : W} (h : Reach R v u) (Z : Pr) (hp : P v Z) : P u Z := by
  induction h with
  | refl => exact hp
  | tail _ hbc ih => exact h4 _ _ hbc Z ih

/-- **(1)** The exact condition for GodIsEssential at a God-like `x`, in any model. -/
theorem essential_iff {g : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    {x : D} {w : W} (hx : God R ev P x w) :
    Ess R Ex ev w g x ↔
      ∀ v, R w v → ∀ z, Ex v z → God R ev P z v → ∀ Z, P w Z → ev Z z v := by
  constructor
  · intro hess v hv z hz hgz Z hZ
    exact ((hess Z).1 ((hx Z).1 hZ)) v hv z hz ((hg z v).2 hgz)
  · intro h Z
    constructor
    · intro hbox v hv z hz hgz
      exact h v hv z hz ((hg z v).1 hgz) Z ((hx Z).2 hbox)
    · intro hent
      exact (hx Z).1 (h2 w g Z (ht w) hent)

/-- **(3)** No A4a: a successor `v` is safe when some `u` in R*(v) sees `v` and sees only
    successors of `w`.  (Post-hoc: stated after the E21 search refuted H25 (e) for stage I.) -/
theorem essential_back {g : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    {x : D} {w : W} (hx : God R ev P x w)
    (hfr : ∀ v, R w v → ∃ u, Reach R v u ∧ R u v ∧ ∀ t, R u t → R w t) :
    Ess R Ex ev w g x := by
  refine (essential_iff hg h2 ht hx).2 ?_
  intro v hv z _ hz Z hZ
  obtain ⟨u, hvu, huv, hsub⟩ := hfr v hv
  have hzu : God R ev P z u := god_reach hg ht hz hvu
  have hxu : God R ev P x u := god_reach hg ht (god_succ hg ht hx hv) hvu
  have hPu : P u Z := (hxu Z).2 (fun t hut => (hx Z).1 hZ t (hsub t hut))
  exact (hzu Z).1 hPu v huv

/-- **(4)** No A4a: every edge out of `w` lies on a cycle (`v` reaches back to `w`). -/
theorem essential_cycle_edges {g : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    {x : D} {w : W} (hx : God R ev P x w) (hcyc : ∀ v, R w v → Reach R v w) :
    Ess R Ex ev w g x :=
  essential_back hg h2 ht hx (fun v hv => ⟨w, hcyc v hv, hv, fun _ h => h⟩)

/-- E19's `essential_symm` again, as a corollary of (4). -/
theorem essential_symm' (hsym : ∀ w v, R w v → R v w) {g : Pr} (hg : IsG R ev P g)
    (h2 : A2 R Ex ev P) (ht : T2 P g) {x : D} {w : W} (hx : God R ev P x w) :
    Ess R Ex ev w g x :=
  essential_cycle_edges hg h2 ht hx (fun v hv => Reach.tail (Reach.refl v) (hsym w v hv))

/-- **(5)** With A4a: every successor of `w` lies on a cycle. -/
theorem essential_a4 {g : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    (h4 : A4a R P) {x : D} {w : W} (hx : God R ev P x w)
    (hcyc : ∀ v, R w v → ∃ u, Reach R v u ∧ R u v) :
    Ess R Ex ev w g x := by
  refine (essential_iff hg h2 ht hx).2 ?_
  intro v hv z _ hz Z hZ
  obtain ⟨u, hvu, huv⟩ := hcyc v hv
  have hzu : God R ev P z u := god_reach hg ht hz hvu
  have hPu : P u Z := pos_reach h4 hvu Z (h4 w v hv Z hZ)
  exact (hzu Z).1 hPu v huv

/-- E19's `essential_refl` again, as a corollary of (5). -/
theorem essential_refl' (hrefl : ∀ w, R w w) {g : Pr} (hg : IsG R ev P g)
    (h2 : A2 R Ex ev P) (ht : T2 P g) (h4 : A4a R P) {x : D} {w : W}
    (hx : God R ev P x w) : Ess R Ex ev w g x :=
  essential_a4 hg h2 ht h4 hx (fun v _ => ⟨v, Reach.refl v, hrefl v⟩)

end TheismFormal.AndersonK
