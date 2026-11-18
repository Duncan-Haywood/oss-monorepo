import TheismFormal.AndersonTransient
/-!
  E23 (experiments/e23_horn_countermodel/results.md), machine-checked: without A4a, E21's
  post-hoc condition `essential_back` is EXACT over general (Henkin-style) property collections,
  for every frame (stage I without A1a) and every serial frame (stage III-noA4), of any size.

  E21 proved `essential_back` sufficient: GodIsEssential holds at `w` if every successor `v` of
  `w` has some `u` in R*(v) with `u` R `v` and R(u) ⊆ R(w).  Its partition-only search found
  24 entries where the condition fails but no block-algebra model fails.  Here, for ANY relation,
  world `w` and successor `v0` of `w` with no such `u`, we build a model whose collection is not
  a block algebra and in which GodIsEssential fails for a God-like individual at `w`.

  The model (prediction H27 in LOG.md, written before this file):
  * individuals `Bool` (`true` is x, `false` is z), both existing at every world;
  * `T t` iff `v0` reaches `t` (zero or more steps);
  * a property is any set of cells `Y` that is *closed*: for every `t` with `T t`, x has `Y` on
    all of R(t) iff z has `Y` on all of R(t) (the Horn rules T2 forces once x and z are both
    God-like at `t`);
  * `P t Y` iff x has `Y` on all of R(t).

  (1) `god_x`: x is God-like everywhere.  (2) `god_z`: z is God-like on R*(v0).
  (3) `model`: the God-like property `g`, its complement and NE are properties and A2, T2, A5
      hold (any frame); `model_A1a`: A1a with seriality.
  (4) `fails`: GodIsEssential fails for x at `w`, via the closed property `zZ`
      (x on R(w); z on every R(t) with `T t` and R(t) ⊆ R(w)).
  (5) `essential_back_iff` (A2, T2; any frame) and `essential_back_iff_III` (A1a, A2, T2, A5,
      complement and NE; serial frames): GodIsEssential holds at `w` in every model iff every
      successor `v` of `w` has `u` in R*(v) with `u` R `v` and R(u) ⊆ R(w).
-/

namespace TheismFormal.AndersonK

variable {W : Type} {R : W → W → Prop}

namespace Horn

variable (R) (v0 : W)

/-- `T t`: `v0` reaches `t`. -/
def T (t : W) : Prop := Reach R v0 t

/-- The Horn rules on a set of cells. -/
def Closed (Y : Bool → W → Prop) : Prop :=
  ∀ t, T R v0 t → ((∀ s, R t s → Y true s) ↔ (∀ s, R t s → Y false s))

/-- Properties: closed sets of cells. -/
def Pr : Type := {Y : Bool → W → Prop // Closed R v0 Y}

def ev (Y : Pr R v0) (y : Bool) (t : W) : Prop := Y.1 y t
def Ex (_ : W) (_ : Bool) : Prop := True
def P (t : W) (Y : Pr R v0) : Prop := ∀ s, R t s → Y.1 true s

variable {R v0}

/-- **(1)** x is God-like at every world (by the definition of `P`). -/
theorem god_x (u : W) : God R (ev R v0) (P R v0) true u := fun _ => Iff.rfl

/-- **(2)** z is God-like at every world `v0` reaches. -/
theorem god_z {u : W} (hu : T R v0 u) : God R (ev R v0) (P R v0) false u :=
  fun Y => Y.2 u hu

/-- R*(v0) is closed under R. -/
theorem T_succ {u s : W} (hu : T R v0 u) (hs : R u s) : T R v0 s := Reach.tail hu hs

variable (R v0)

/-- The God-like property. -/
def g : Pr R v0 :=
  ⟨fun y t => God R (ev R v0) (P R v0) y t, fun _t ht =>
    ⟨fun _ _s hs => god_z (T_succ ht hs), fun _ s _ => god_x s⟩⟩

/-- Its complement (closed only in a serial frame; see `gc`). -/
def gcSet : Bool → W → Prop := fun y t => ¬ God R (ev R v0) (P R v0) y t

theorem gc_closed (hser : ∀ u, ∃ t, R u t) : Closed R v0 (gcSet R v0) := by
  intro t ht
  obtain ⟨s, hs⟩ := hser t
  constructor
  · intro h; exact absurd (god_x s) (h s hs)
  · intro h; exact absurd (god_z (T_succ ht hs)) (h s hs)

def gc (hser : ∀ u, ∃ t, R u t) : Pr R v0 := ⟨gcSet R v0, gc_closed R v0 hser⟩

/-- Anderson's necessary existence: every cell (total domains). -/
def n : Pr R v0 := ⟨fun _ _ => True, fun _ _ => ⟨fun _ _ _ => trivial, fun _ _ _ => trivial⟩⟩

/-- The property positive at `w` that z lacks at `v0`. -/
def zZ (w : W) : Pr R v0 :=
  ⟨fun y s => match y with
    | true => R w s
    | false => ∃ t, T R v0 t ∧ (∀ r, R t r → R w r) ∧ R t s,
   fun t ht => ⟨fun h s hs => ⟨t, ht, h, hs⟩,
     fun h s hs => by obtain ⟨t', _, hsub, hs'⟩ := h s hs; exact hsub s hs'⟩⟩

variable {R v0}

/-- **(3)** A2, T2, A5, and the God-like property and NE are what they should be; any frame. -/
theorem model :
    IsG R (ev R v0) (P R v0) (g R v0) ∧ IsNE R (Ex (W := W)) (ev R v0) (n R v0) ∧
    A2 R (Ex (W := W)) (ev R v0) (P R v0) ∧ T2 (P R v0) (g R v0) ∧ A5 (P R v0) (n R v0) := by
  refine ⟨fun _ _ => Iff.rfl, ?_, ?_, ?_, ?_⟩
  · intro y v
    refine ⟨fun _ => ?_, fun _ => trivial⟩
    intro Y hess t ht
    exact ⟨y, trivial, ((hess Y).2 (fun _ _ _ _ h => h)) t ht⟩
  · intro u X Y hX hent s hs
    exact hent s hs true trivial (hX s hs)
  · intro _ s _; exact god_x s
  · intro _ _ _; trivial

/-- **(3')** With seriality: the complement is the complement, and A1a holds. -/
theorem model_A1a (hser : ∀ u, ∃ t, R u t) :
    IsCompl (ev R v0) (g R v0) (gc R v0 hser) ∧ A1a (ev R v0) (P R v0) := by
  refine ⟨fun _ _ => Iff.rfl, ?_⟩
  intro w X Xc hc hXc hX
  obtain ⟨s, hs⟩ := hser w
  exact ((hc true s).1 (hXc s hs)) (hX s hs)

/-- `essential_back`'s witness for one successor. -/
def Back (R : W → W → Prop) (w v : W) : Prop :=
  ∃ u, Reach R v u ∧ R u v ∧ ∀ t, R u t → R w t

/-- **(4)** GodIsEssential fails for x at `w` when its successor `v0` has no back witness. -/
theorem fails {w : W} (hw : R w v0) (hno : ¬ Back R w v0) :
    God R (ev R v0) (P R v0) true w ∧ ¬ Ess R (Ex (W := W)) (ev R v0) w (g R v0) true := by
  refine ⟨god_x w, fun hess => ?_⟩
  have hent := (hess (zZ R v0 w)).1 (fun _ h => h)
  obtain ⟨t, ht, hsub, htv⟩ := hent v0 hw false trivial (god_z (Reach.refl v0))
  exact hno ⟨t, ht, htv, hsub⟩

end Horn

open Horn in
/-- **(5)** Exact stage-I condition without A1a (A2, T2 only), any frame of any size:
    GodIsEssential holds at `w` in every model iff every successor of `w` has a back witness. -/
theorem essential_back_iff (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop) (g : Pr),
      IsG R ev P g → A2 R Ex ev P → T2 P g →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v, R w v → ∃ u, Reach R v u ∧ R u v ∧ ∀ t, R u t → R w t) := by
  constructor
  · intro hall v hv
    apply Classical.byContradiction
    intro hno
    obtain ⟨hmG, -, hm2, hmT, -⟩ := model (R := R) (v0 := v)
    obtain ⟨hx, hnot⟩ := fails hv hno
    exact hnot (hall Bool (Pr R v) Ex (ev R v) (P R v) (g R v) hmG hm2 hmT true hx)
  · intro hfr D Pr Ex ev P g hg h2 ht x hx
    exact essential_back hg h2 ht hx hfr

open Horn in
/-- **(5')** The same at stage III-noA4 (A1a, A2, T2, A5, the complement and NE in the
    collection), any serial frame of any size. -/
theorem essential_back_iff_III (hser : ∀ u, ∃ t, R u t) (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop)
      (g gc n : Pr), IsG R ev P g → IsCompl ev g gc → IsNE R Ex ev n → A1a ev P →
      A2 R Ex ev P → T2 P g → A5 P n →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v, R w v → ∃ u, Reach R v u ∧ R u v ∧ ∀ t, R u t → R w t) := by
  constructor
  · intro hall v hv
    apply Classical.byContradiction
    intro hno
    obtain ⟨hmG, hmN, hm2, hmT, hm5⟩ := model (R := R) (v0 := v)
    obtain ⟨hmC, hm1⟩ := model_A1a (R := R) (v0 := v) hser
    obtain ⟨hx, hnot⟩ := fails hv hno
    exact hnot (hall Bool (Pr R v) Ex (ev R v) (P R v) (g R v) (gc R v hser) (n R v)
      hmG hmC hmN hm1 hm2 hmT hm5 true hx)
  · intro hfr D Pr Ex ev P g gc n hg _ _ _ h2 ht _ x hx
    exact essential_back hg h2 ht hx hfr

end TheismFormal.AndersonK
