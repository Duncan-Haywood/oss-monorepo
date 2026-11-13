import TheismFormal.AndersonFrames
/-!
  E22 (experiments/e22_transient_countermodel/results.md), machine-checked: the converse of E21's
  `essential_a4`, for every serial frame of any size.

  E21 proved that with A4a GodIsEssential holds at `w` whenever every successor of `w` lies on a
  cycle, and found the converse only by search (frames up to 3 worlds).  Here, for ANY serial
  relation `R`, world `w` and successor `v0` of `w` on no cycle, we build a stage-III model
  (A1a, A2, T2, A4a, A5, with the God-like property, its complement and necessary existence all in
  the collection) in which GodIsEssential fails for a God-like individual at `w`.

  The model (prediction H26 in LOG.md, written before this file):
  * individuals `Bool` (`true` is x, `false` is z), both existing at every world;
  * `S t` iff `t` reaches `v0` in zero or more steps;
  * a property is a pair `(p, f)`: x has it at every world iff `p`; z has it at `t` iff `f t` when
    `S t`, and iff `p` otherwise (a block algebra: one block of all x cells and the z cells
    outside `S`, and a singleton for each z cell inside `S`);
  * `P` is rigid: `(p, f)` is positive iff `p`.

  (1) `god_x`: x is God-like everywhere.  (2) `god_z_iff`: z is God-like at `t` iff `S t → t = v0`.
  (3) `model`: the stage-III axioms hold.  (4) `fails`: GodIsEssential fails for x at `w`.
  (5) `essential_a4_iff` / `essential_a4_iff_III`: with seriality, GodIsEssential holds at `w`
      in every stage-II (resp. stage-III) model over `R` iff every successor of `w` lies on a cycle.
-/

namespace TheismFormal.AndersonK

variable {W : Type} {R : W → W → Prop}

/-- Prepend one step to an R* path. -/
theorem Reach.head {a b c : W} (hab : R a b) (h : Reach R b c) : Reach R a c := by
  induction h with
  | refl => exact Reach.tail (Reach.refl a) hab
  | tail _ hcd ih => exact Reach.tail ih hcd

/-- A non-trivial R* path has a first step. -/
theorem Reach.cases_head {a c : W} (h : Reach R a c) : a = c ∨ ∃ b, R a b ∧ Reach R b c := by
  induction h with
  | refl => exact Or.inl rfl
  | @tail b c hab hbc ih =>
    rcases ih with rfl | ⟨b', hab', hb'b⟩
    · exact Or.inr ⟨c, hbc, Reach.refl c⟩
    · exact Or.inr ⟨b', hab', Reach.tail hb'b hbc⟩

namespace Transient

variable (R) (v0 : W)

/-- Properties: `(p, f)`. -/
abbrev Pr (W : Type) := Prop × (W → Prop)

/-- `S t`: `t` reaches `v0`. -/
def S (t : W) : Prop := Reach R t v0

def ev (Y : Pr W) : Bool → W → Prop
  | true, _ => Y.1
  | false, t => (S R v0 t → Y.2 t) ∧ (¬ S R v0 t → Y.1)

def Ex (_ : W) (_ : Bool) : Prop := True
def P (_ : W) (Y : Pr W) : Prop := Y.1
def g : Pr W := (True, fun t => t = v0)
def gc : Pr W := (False, fun t => t ≠ v0)
def n : Pr W := (True, fun _ => True)
/-- The positive property z lacks at `v0`. -/
def zZ : Pr W := (True, fun _ => False)

variable {R v0}

/-- v0 lies on no cycle. -/
def Transient (R : W → W → Prop) (v0 : W) : Prop := ¬ ∃ u, Reach R v0 u ∧ R u v0

/-- If `S t → t = v0` at `u`, no successor of `u` is in `S`. -/
theorem no_S_succ (htr : Transient R v0) {u : W} (hu : S R v0 u → u = v0) {t : W}
    (hut : R u t) : ¬ S R v0 t := by
  intro hst
  have hu0 : u = v0 := hu (Reach.head hut hst)
  subst hu0
  -- t reaches u = v0: the last step into u closes a cycle through u
  cases hst with
  | refl => exact htr ⟨_, Reach.refl _, hut⟩
  | tail hb hbu => exact htr ⟨_, Reach.head hut hb, hbu⟩

/-- **(1)** x is God-like at every world. -/
theorem god_x (hser : ∀ u, ∃ t, R u t) (u : W) : God R (ev R v0) P true u := by
  intro Y
  obtain ⟨t, ht⟩ := hser u
  exact ⟨fun hp _ _ => hp, fun h => h t ht⟩

/-- **(2)** z is God-like at `u` iff `S u → u = v0`. -/
theorem god_z_iff (hser : ∀ u, ∃ t, R u t) (htr : Transient R v0) (u : W) :
    God R (ev R v0) P false u ↔ (S R v0 u → u = v0) := by
  constructor
  · intro hG hSu
    apply Classical.byContradiction
    intro hne
    rcases Reach.cases_head (show Reach R u v0 from hSu) with h | ⟨t, hut, htv⟩
    · exact hne h
    · have := ((hG zZ).1 trivial) t hut
      exact this.1 htv
  · intro hu Y
    obtain ⟨t0, ht0⟩ := hser u
    constructor
    · intro hp t hut
      exact ⟨fun hs => absurd hs (no_S_succ htr hu hut), fun _ => hp⟩
    · intro h
      exact (h t0 ht0).2 (no_S_succ htr hu ht0)

/-- **(3)** The model satisfies stage III: the God-like property, its complement and necessary
    existence are in the collection, and A1a, A2, T2, A4a, A5 hold. -/
theorem model (hser : ∀ u, ∃ t, R u t) (htr : Transient R v0) :
    IsG R (ev R v0) P (g v0) ∧ IsCompl (ev R v0) (g v0) (gc v0) ∧
    IsNE R (Ex (W := W)) (ev R v0) (n (W := W)) ∧ A1a (ev R v0) P ∧
    A2 R (Ex (W := W)) (ev R v0) P ∧ T2 P (g v0) ∧ A4a R P ∧ A5 P (n (W := W)) := by
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · intro y v
    cases y
    · rw [god_z_iff hser htr v]
      exact ⟨fun h => h.1, fun h => ⟨h, fun _ => trivial⟩⟩
    · exact ⟨fun _ => god_x hser v, fun _ => trivial⟩
  · intro z v
    cases z
    · show ((S R v0 v → v ≠ v0) ∧ (¬ S R v0 v → False)) ↔
          ¬ ((S R v0 v → v = v0) ∧ (¬ S R v0 v → True))
      constructor
      · rintro ⟨h1, h2⟩ ⟨h3, _⟩
        exact Classical.byCases (fun hs : S R v0 v => h1 hs (h3 hs)) (fun hs => h2 hs)
      · intro h
        refine ⟨fun hs he => h ⟨fun _ => he, fun _ => trivial⟩, fun hs => h ⟨fun h' => absurd h' hs,
          fun _ => trivial⟩⟩
    · exact ⟨fun h => h.elim, fun h => h trivial⟩
  · intro y v
    refine ⟨fun _ => ?_, fun _ => ?_⟩
    · intro Y hess t ht
      have hall := ((hess Y).2 (fun _ _ _ _ h => h)) t ht
      exact ⟨y, trivial, hall⟩
    · cases y
      · exact ⟨fun _ => trivial, fun _ => trivial⟩
      · trivial
  · intro w X Xc hc hXc hX
    exact ((hc true w).1 hXc) hX
  · intro u X Y hX hent
    obtain ⟨t, ht⟩ := hser u
    exact hent t ht true trivial hX
  · intro _; trivial
  · intro _ _ _ _ h; exact h
  · intro _; trivial

/-- **(4)** GodIsEssential fails for x at any `w` that sees `v0`. -/
theorem fails (hser : ∀ u, ∃ t, R u t) {w : W} (hw : R w v0) :
    God R (ev R v0) P true w ∧ ¬ Ess R (Ex (W := W)) (ev R v0) w (g v0) true := by
  refine ⟨god_x hser w, fun hess => ?_⟩
  have hent := (hess zZ).1 (fun _ _ => trivial)
  have hgz : ev R v0 (g v0) false v0 := ⟨fun _ => rfl, fun _ => trivial⟩
  exact (hent v0 hw false trivial hgz).1 (Reach.refl v0)

end Transient

open Transient in
/-- **(5)** Exact characterisation with A4a (stage II), any serial frame of any size:
    GodIsEssential holds at `w` in every model iff every successor of `w` lies on a cycle. -/
theorem essential_a4_iff (hser : ∀ u, ∃ t, R u t) (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop) (g : Pr),
      IsG R ev P g → A2 R Ex ev P → T2 P g → A4a R P →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v, R w v → ∃ u, Reach R v u ∧ R u v) := by
  constructor
  · intro hall v hv
    apply Classical.byContradiction
    intro htr
    obtain ⟨hmG, -, -, -, hm2, hmT, hm4, -⟩ := model (v0 := v) hser htr
    obtain ⟨hx, hnot⟩ := fails hser hv
    exact hnot (hall Bool (Pr W) Ex (ev R v) P (g v) hmG hm2 hmT hm4 true hx)
  · intro hcyc D Pr Ex ev P g hg h2 ht h4 x hx
    exact essential_a4 hg h2 ht h4 hx hcyc

open Transient in
/-- **(5')** The same at stage III (A1a, A5, the complement and NE in the collection too). -/
theorem essential_a4_iff_III (hser : ∀ u, ∃ t, R u t) (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop)
      (g gc n : Pr), IsG R ev P g → IsCompl ev g gc → IsNE R Ex ev n → A1a ev P →
      A2 R Ex ev P → T2 P g → A4a R P → A5 P n →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v, R w v → ∃ u, Reach R v u ∧ R u v) := by
  constructor
  · intro hall v hv
    apply Classical.byContradiction
    intro htr
    obtain ⟨hmG, hmC, hmN, hm1, hm2, hmT, hm4, hm5⟩ := model (v0 := v) hser htr
    obtain ⟨hx, hnot⟩ := fails hser hv
    exact hnot (hall Bool (Pr W) Ex (ev R v) P (g v) (gc v) n hmG hmC hmN hm1 hm2 hmT hm4 hm5
      true hx)
  · intro hcyc D Pr Ex ev P g gc n hg _ _ _ h2 ht h4 _ x hx
    exact essential_a4 hg h2 ht h4 hx hcyc

end TheismFormal.AndersonK
