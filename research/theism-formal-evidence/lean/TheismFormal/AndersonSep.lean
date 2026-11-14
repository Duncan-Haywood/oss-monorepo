import TheismFormal.AndersonHorn
/-!
  E24 (experiments/e24_block_separation/results.md), machine-checked: without A4a, the EXACT
  frame condition for the AFP's GodIsEssential over collections in which every property has a
  complement, block algebras included (E21's setting), for every serial frame of any size.

  E23's countermodel (`AndersonHorn.lean`) is not closed under complement, so over block algebras
  `essential_back` was known exact only up to E21's search; there, 24 of 60 pairs with no back
  witness showed no failure.  The condition that replaces it (prediction H28 in LOG.md, written
  before this file):

  A successor `v` of `w` is *separable* if there are sets of worlds `A ⊇ R(w)` and `S ∌ v` such
  that for every `t` in R*(v): (i) R(t) ⊆ A iff R(t) ⊆ S, and (ii) R(t) misses A iff R(t)
  misses S.

  (1) `essential_nosep`: with A2, T2 and complements, GodIsEssential holds at `w` if no successor
      of `w` is separable (the failing property and its complement give A and S).
  (2) `Sep.model`, `Sep.model_A1a`, `Sep.fails`: for a separable successor, a model whose
      collection is the Boolean algebra of unions of four blocks of cells, satisfying A1a (serial),
      A2, T2, A5, with the God-like property, its complement and NE in it, where GodIsEssential
      fails.
  (3) `essential_sep_iff`, `essential_sep_iff_III`: the exact condition at stages I and III-noA4.
  (4) `not_back_of_sep`: a separable successor has no back witness, so this condition implies
      E23's (and is strictly stronger: E24's search, 36 vs 60 pairs at 3 worlds).
-/

namespace TheismFormal.AndersonK

variable {W : Type} {R : W → W → Prop}

/-- (i) and (ii) at one world `t`. -/
def Cond (R : W → W → Prop) (A S : W → Prop) (t : W) : Prop :=
  ((∀ s, R t s → A s) ↔ (∀ s, R t s → S s)) ∧ ((∀ s, R t s → ¬ A s) ↔ (∀ s, R t s → ¬ S s))

/-- A successor `v` of `w` is separable. -/
def Separable (R : W → W → Prop) (w v : W) : Prop :=
  ∃ A S : W → Prop, (∀ s, R w s → A s) ∧ ¬ S v ∧ ∀ t, Reach R v t → Cond R A S t

theorem reach_head {t u : W} (h : Reach R t u) : u = t ∨ ∃ s, R t s ∧ Reach R s u := by
  induction h with
  | refl => exact Or.inl rfl
  | @tail b c _ hbc ih =>
    rcases ih with rfl | ⟨s, hs, hsb⟩
    · exact Or.inr ⟨c, hbc, Reach.refl c⟩
    · exact Or.inr ⟨s, hs, Reach.tail hsb hbc⟩

theorem reach_cons {t s u : W} (hts : R t s) (h : Reach R s u) : Reach R t u := by
  induction h with
  | refl => exact Reach.tail (Reach.refl t) hts
  | tail _ hbc ih => exact Reach.tail ih hbc

/-- **(4)** A separable successor has no back witness. -/
theorem not_back_of_sep {w v : W} (h : Separable R w v) : ¬ Horn.Back R w v := by
  obtain ⟨A, S, hA, hSv, hT⟩ := h
  rintro ⟨u, hvu, huv, hsub⟩
  exact hSv ((hT u hvu).1.1 (fun s hs => hA s (hsub s hs)) v huv)

section necessity
variable {D Pr : Type} {Ex : W → D → Prop} {ev : Pr → D → W → Prop} {P : W → Pr → Prop}

/-- **(1)** GodIsEssential holds at `w` when no successor of `w` is separable, in any model
    whose properties all have complements. -/
theorem essential_nosep {g : Pr} (hg : IsG R ev P g) (h2 : A2 R Ex ev P) (ht : T2 P g)
    (hcomp : ∀ X : Pr, ∃ Xc, IsCompl ev X Xc) {x : D} {w : W} (hx : God R ev P x w)
    (hfr : ∀ v, R w v → ¬ Separable R w v) : Ess R Ex ev w g x := by
  refine (essential_iff hg h2 ht hx).2 ?_
  intro v hv z _ hgz Z hZ
  apply Classical.byContradiction
  intro hzZ
  apply hfr v hv
  refine ⟨fun s => ev Z x s, fun s => ev Z z s, fun s hs => (hx Z).1 hZ s hs, hzZ, ?_⟩
  intro t hvt
  have hxt : God R ev P x t := god_reach hg ht (god_succ hg ht hx hv) hvt
  have hzt : God R ev P z t := god_reach hg ht hgz hvt
  obtain ⟨Zc, hc⟩ := hcomp Z
  have hcz := (hxt Zc).symm.trans (hzt Zc)
  refine ⟨(hxt Z).symm.trans (hzt Z), ⟨fun h s hs => ?_, fun h s hs => ?_⟩⟩
  · exact (hc z s).1 (hcz.1 (fun s' hs' => (hc x s').2 (h s' hs')) s hs)
  · exact (hc x s).1 (hcz.2 (fun s' hs' => (hc z s').2 (h s' hs')) s hs)

end necessity

namespace Sep

variable (R) (A S : W → Prop)

/-- z will be God-like exactly where every reachable world satisfies (i) and (ii). -/
def G (t : W) : Prop := ∀ u, Reach R t u → Cond R A S u

def inB : Bool → W → Prop
  | true, t => A t
  | false, t => S t

def inG : Bool → W → Prop
  | true, _ => True
  | false, t => G R A S t

/-- A set of cells is a union of the four blocks (classes by membership in B and in g). -/
def Resp (Y : Bool → W → Prop) : Prop :=
  ∀ y t y' t', (inB A S y t ↔ inB A S y' t') → (inG R A S y t ↔ inG R A S y' t') →
    (Y y t ↔ Y y' t')

def Pr : Type := {Y : Bool → W → Prop // Resp R A S Y}

def ev (Y : Pr R A S) (y : Bool) (t : W) : Prop := Y.1 y t
def Ex (_ : W) (_ : Bool) : Prop := True
def P (t : W) (Y : Pr R A S) : Prop := ∀ s, R t s → Y.1 true s

/-- The collection is closed under complement (it is a block algebra). -/
def compl (Y : Pr R A S) : Pr R A S :=
  ⟨fun y t => ¬ Y.1 y t, fun y t y' t' hB hG' =>
    ⟨fun h1 h2 => h1 ((Y.2 y t y' t' hB hG').2 h2),
     fun h1 h2 => h1 ((Y.2 y t y' t' hB hG').1 h2)⟩⟩

theorem compl_closed (Y : Pr R A S) : IsCompl (ev R A S) Y (compl R A S Y) :=
  fun _ _ => Iff.rfl

def Bp : Pr R A S := ⟨inB A S, fun _ _ _ _ hB _ => hB⟩
def g : Pr R A S := ⟨inG R A S, fun _ _ _ _ _ hG' => hG'⟩
def gc : Pr R A S := compl R A S (g R A S)
def n : Pr R A S := ⟨fun _ _ => True, fun _ _ _ _ _ _ => Iff.rfl⟩

variable {R A S}

theorem G_succ {t s : W} (hG : G R A S t) (hs : R t s) : G R A S s :=
  fun u hu => hG u (reach_cons hs hu)

theorem god_x (u : W) : God R (ev R A S) (P R A S) true u := fun _ => Iff.rfl

theorem god_z_of_G {t : W} (hG : G R A S t) : God R (ev R A S) (P R A S) false t := by
  intro Y
  have hC := hG t (Reach.refl t)
  have hsuc : ∀ s, R t s → G R A S s := fun s hs => G_succ hG hs
  constructor
  · intro h s hs
    by_cases hS : S s
    · have : ∃ s', R t s' ∧ A s' := Classical.byContradiction fun hn =>
        hC.2.1 (fun s' hs' hA => hn ⟨s', hs', hA⟩) s hs hS
      obtain ⟨s', hs', hA⟩ := this
      exact (Y.2 true s' false s ⟨fun _ => hS, fun _ => hA⟩
        ⟨fun _ => hsuc s hs, fun _ => trivial⟩).1 (h s' hs')
    · have : ∃ s', R t s' ∧ ¬ A s' := Classical.byContradiction fun hn =>
        hS (hC.1.1 (fun s' hs' => Classical.byContradiction fun hA => hn ⟨s', hs', hA⟩) s hs)
      obtain ⟨s', hs', hA⟩ := this
      exact (Y.2 true s' false s ⟨fun h' => absurd h' hA, fun h' => absurd h' hS⟩
        ⟨fun _ => hsuc s hs, fun _ => trivial⟩).1 (h s' hs')
  · intro h s hs
    by_cases hA : A s
    · have : ∃ s', R t s' ∧ S s' := Classical.byContradiction fun hn =>
        hC.2.2 (fun s' hs' hS => hn ⟨s', hs', hS⟩) s hs hA
      obtain ⟨s', hs', hS⟩ := this
      exact (Y.2 false s' true s ⟨fun _ => hA, fun _ => hS⟩
        ⟨fun _ => trivial, fun _ => hsuc s' hs'⟩).1 (h s' hs')
    · have : ∃ s', R t s' ∧ ¬ S s' := Classical.byContradiction fun hn =>
        hA (hC.1.2 (fun s' hs' => Classical.byContradiction fun hS => hn ⟨s', hs', hS⟩) s hs)
      obtain ⟨s', hs', hS⟩ := this
      exact (Y.2 false s' true s ⟨fun h' => absurd h' hS, fun h' => absurd h' hA⟩
        ⟨fun _ => trivial, fun _ => hsuc s' hs'⟩).1 (h s' hs')

theorem G_of_god_z {t : W} (hz : God R (ev R A S) (P R A S) false t) : G R A S t := by
  have hsucc : ∀ s, R t s → G R A S s :=
    (hz (g R A S)).1 (fun _ _ => trivial)
  have hC : Cond R A S t := ⟨hz (Bp R A S), hz (compl R A S (Bp R A S))⟩
  intro u hu
  rcases reach_head hu with rfl | ⟨s, hs, hsu⟩
  · exact hC
  · exact hsucc s hs u hsu

/-- z is God-like exactly on `G`. -/
theorem god_z_iff (t : W) : God R (ev R A S) (P R A S) false t ↔ G R A S t :=
  ⟨G_of_god_z, god_z_of_G⟩

/-- **(2)** `g` is the God-like property, NE is every cell, and A2, T2, A5 hold; any frame. -/
theorem model :
    IsG R (ev R A S) (P R A S) (g R A S) ∧
    (∀ X : Pr R A S, ∃ Xc, IsCompl (ev R A S) X Xc) ∧
    IsNE R (Ex (W := W)) (ev R A S) (n R A S) ∧
    A2 R (Ex (W := W)) (ev R A S) (P R A S) ∧ T2 (P R A S) (g R A S) ∧
    A5 (P R A S) (n R A S) := by
  refine ⟨?_, fun X => ⟨compl R A S X, compl_closed R A S X⟩, ?_, ?_, ?_, ?_⟩
  · intro y v
    cases y with
    | false => exact (god_z_iff v).symm
    | true => exact ⟨fun _ => god_x v, fun _ => trivial⟩
  · intro y v
    refine ⟨fun _ => ?_, fun _ => trivial⟩
    intro Y hess t ht
    exact ⟨y, trivial, ((hess Y).2 (fun _ _ _ _ h => h)) t ht⟩
  · intro u X Y hX hent s hs
    exact hent s hs true trivial (hX s hs)
  · intro _ _ _; trivial
  · intro _ _ _; trivial

/-- With seriality, A1a. -/
theorem model_A1a (hser : ∀ u, ∃ t, R u t) : A1a (ev R A S) (P R A S) := by
  intro w X Xc hc hXc hX
  obtain ⟨s, hs⟩ := hser w
  exact ((hc true s).1 (hXc s hs)) (hX s hs)

/-- **(2')** GodIsEssential fails for x at `w` when its successor `v` is separable by `A`, `S`. -/
theorem fails {w v : W} (hw : R w v) (hA : ∀ s, R w s → A s) (hSv : ¬ S v)
    (hT : ∀ t, Reach R v t → Cond R A S t) :
    God R (ev R A S) (P R A S) true w ∧
      ¬ Ess R (Ex (W := W)) (ev R A S) w (g R A S) true := by
  refine ⟨god_x w, fun hess => ?_⟩
  have hent := (hess (Bp R A S)).1 (fun s hs => hA s hs)
  exact hSv (hent v hw false trivial (show G R A S v from hT))

end Sep

open Sep in
/-- **(3)** Exact stage-I condition over complement-closed collections (A2, T2), any frame:
    GodIsEssential holds at `w` in every such model iff no successor of `w` is separable. -/
theorem essential_sep_iff (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop) (g : Pr),
      IsG R ev P g → A2 R Ex ev P → T2 P g → (∀ X : Pr, ∃ Xc, IsCompl ev X Xc) →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v, R w v → ¬ Separable R w v) := by
  constructor
  · rintro hall v hv ⟨A, S, hA, hSv, hT⟩
    obtain ⟨hmG, hmC, -, hm2, hmT, -⟩ := model (R := R) (A := A) (S := S)
    obtain ⟨hx, hnot⟩ := fails hv hA hSv hT
    exact hnot (hall Bool (Sep.Pr R A S) Sep.Ex (Sep.ev R A S) (Sep.P R A S) (Sep.g R A S)
      hmG hm2 hmT hmC true hx)
  · intro hfr D Pr Ex ev P g hg h2 ht hc x hx
    exact essential_nosep hg h2 ht hc hx hfr

open Sep in
/-- **(3')** The same at stage III-noA4 (A1a, A2, T2, A5, complements, NE), serial frames. -/
theorem essential_sep_iff_III (hser : ∀ u, ∃ t, R u t) (w : W) :
    (∀ (D Pr : Type) (Ex : W → D → Prop) (ev : Pr → D → W → Prop) (P : W → Pr → Prop)
      (g n : Pr), IsG R ev P g → (∀ X : Pr, ∃ Xc, IsCompl ev X Xc) → IsNE R Ex ev n →
      A1a ev P → A2 R Ex ev P → T2 P g → A5 P n →
      ∀ x, God R ev P x w → Ess R Ex ev w g x) ↔
    (∀ v, R w v → ¬ Separable R w v) := by
  constructor
  · rintro hall v hv ⟨A, S, hA, hSv, hT⟩
    obtain ⟨hmG, hmC, hmN, hm2, hmT, hm5⟩ := model (R := R) (A := A) (S := S)
    obtain ⟨hx, hnot⟩ := fails hv hA hSv hT
    exact hnot (hall Bool (Sep.Pr R A S) Sep.Ex (Sep.ev R A S) (Sep.P R A S) (Sep.g R A S)
      (Sep.n R A S) hmG hmC hmN (model_A1a hser) hm2 hmT hm5 true hx)
  · intro hfr D Pr Ex ev P g n hg hc _ _ h2 ht _ x hx
    exact essential_nosep hg h2 ht hc hx hfr

end TheismFormal.AndersonK
