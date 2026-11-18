import TheismFormal.Fitting
/-
  E18 (experiments/e18_afp_crosscheck/results.md), machine-checked: Fitting's variant in modal
  logic K, the logic of Fuenmayor & Benzmüller's AFP formalisation (FittingProof.thy), with or
  without A4a, over any block algebra and any (varying, possibly empty) domains.

  `R w v` is accessibility; `Pw w` is the positive set at world `w`.  At a world `w` every
  axiom and definition of Fitting's variant quantifies over the worlds `w` sees, so it is
  E17's S5 condition (`Fitting.lean`) with the worlds replaced by the successors of `w`:
  `ExR R Ex w`, an existence predicate on the subtype `{v // R w v}`.  The results below are
  therefore corollaries of E17's `de_dicto`.

  (1) `afp_de_re_K`: without A4, in K, AFP's `GodNecExists_v2` (de re: at every accessible world
      some existent is in the actual extension of G) holds at every world where the axioms hold.
  (2) `afp_de_dicto_K_A4`: with A4a, AFP's `GodNecExists_v1` (de dicto: at every accessible world
      some existent is God-like there) holds in K.
  (3) `cm_dedicto_noA4`: without A4 the de dicto reading fails in K: two worlds and two
      individuals, full semantics, as E18's search found.
-/

namespace TheismFormal.AFP

open TheismFormal.Fitting

variable {W D K : Type}

/-- Existence restricted to the worlds `w` sees. -/
def ExR (R : W → W → Prop) (Ex : W → D → Prop) (w : W) : {v // R w v} → D → Prop :=
  fun v => Ex v.1

/-- Fitting's axioms A1a, A1b, A2, T2, A5 at world `w`, read in K. -/
def AxAt (R : W → W → Prop) (blk : D → K) (Ex : W → D → Prop)
    (Pw : W → (K → Prop) → Prop) (w : W) : Prop :=
  A1a (Pw w) ∧ A1b (Pw w) ∧ A2 blk (ExR R Ex w) (Pw w) ∧ T2 blk (Pw w) ∧
    A5 blk (ExR R Ex w) (Pw w)

/-- A4a: a property positive at `w` is positive at every world `w` sees. -/
def A4a (R : W → W → Prop) (Pw : W → (K → Prop) → Prop) : Prop :=
  ∀ w v, R w v → ∀ f, Pw w f → Pw v f

/-- **(1) AFP's de re conclusion holds in K without A4.** -/
theorem afp_de_re_K {R : W → W → Prop} {blk : D → K} {Ex : W → D → Prop}
    {Pw : W → (K → Prop) → Prop} {w : W} (h : AxAt R blk Ex Pw w) :
    ∀ v, R w v → ∃ y, Ex v y ∧ God blk (Pw w) y := by
  obtain ⟨h1a, h1b, h2, ht, h5⟩ := h
  intro v hv
  exact de_dicto h1a h1b h2 ht h5 ⟨v, hv⟩

/-- With A4a and A1 at both worlds, an accessible world has the same positive set. -/
theorem pos_back {R : W → W → Prop} {Pw : W → (K → Prop) → Prop} (h4 : A4a R Pw)
    {w v : W} (hv : R w v) (h1b : A1b (Pw w)) (h1a : A1a (Pw v)) (f : K → Prop)
    (hf : Pw v f) : Pw w f :=
  Classical.byContradiction fun hn => h1a f (h4 w v hv _ (h1b f hn)) hf

/-- **(2) AFP's de dicto conclusion holds in K with A4a.** -/
theorem afp_de_dicto_K_A4 {R : W → W → Prop} {blk : D → K} {Ex : W → D → Prop}
    {Pw : W → (K → Prop) → Prop} (h4 : A4a R Pw) (hax : ∀ u, AxAt R blk Ex Pw u) (w : W) :
    ∀ v, R w v → ∃ y, Ex v y ∧ God blk (Pw v) y := by
  intro v hv
  obtain ⟨y, hy, hg⟩ := afp_de_re_K (hax w) v hv
  exact ⟨y, hy, fun f hf => hg f (pos_back h4 hv (hax w).2.1 (hax v).1 f hf)⟩

/-- **(3) Without A4 the de dicto reading fails in K.**  Two worlds that see each other and not
    themselves; two individuals, full semantics; individual `v` exists only at world `v`.  At
    world `w` the positive set is "contains `!w`" (the one individual existing at the world `w`
    sees), so every world satisfies all five axioms, yet at world `false` the God-like individual
    of the accessible world `true` (namely `false`) does not exist there. -/
theorem cm_dedicto_noA4 :
    let R : Bool → Bool → Prop := fun w v => v = !w
    let blk : Bool → Bool := id
    let Ex : Bool → Bool → Prop := fun v y => y = v
    let Pw : Bool → (Bool → Prop) → Prop := fun w f => f (!w)
    (∀ w, AxAt R blk Ex Pw w) ∧
      ¬ (∀ v, R false v → ∃ y, Ex v y ∧ God blk (Pw v) y) := by
  intro R blk Ex Pw
  refine ⟨fun w => ?_, ?_⟩
  · have hv : R w (!w) := rfl
    exact (model_a5_iff (⟨!w, hv⟩ : {v // R w v}) blk (ExR R Ex w) (Pw w)).2
      ⟨!w, fun v => ⟨v.1, rfl, by
        show v.1 = !w
        exact v.2⟩, fun _ => Iff.rfl⟩
  · intro h
    obtain ⟨y, hy, hg⟩ := h true rfl
    have h1 : y = true := hy
    have h2 : y = false := hg (fun k => k = false) rfl
    exact Bool.noConfusion (h1.symm.trans h2)

end TheismFormal.AFP
