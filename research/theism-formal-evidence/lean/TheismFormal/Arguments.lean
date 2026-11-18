/-
  The first-order arguments of src/arguments.py, as Lean theorems.  Validity is easy;
  the point of each theorem is that its hypotheses are exactly the premises an
  opponent must deny.  Core Lean 4 only.
-/
namespace TheismFormal

/-- Kalam, stage 1. -/
theorem kalam {D : Type} (Begins Caused : D → Prop) (cosmos : D)
    (p1 : ∀ x, Begins x → Caused x) (p2 : Begins cosmos) : Caused cosmos :=
  p1 cosmos p2

/-- Leibnizian contingency argument. -/
theorem contingency {D : Type} (Exist Explained : D → Prop) (God : Prop) (cosmos : D)
    (p1 : ∀ x, Exist x → Explained x) (p2 : Explained cosmos → God)
    (p3 : Exist cosmos) : God :=
  p2 (p1 cosmos p3)

/-- Mackie's logical problem of evil. -/
theorem logical_evil (God CanPrevent WantsPrevent Evil : Prop)
    (p1 : God → CanPrevent) (p2 : God → WantsPrevent)
    (p3 : CanPrevent ∧ WantsPrevent → ¬ Evil) (p4 : Evil) : ¬ God :=
  fun g => p3 ⟨p1 g, p2 g⟩ p4

/-- Free will defence: with "wants to prevent evil unless there is a morally
    sufficient reason", God, evil and that reason are jointly consistent.  We exhibit
    the model (every atom true except WantsPrevent). -/
theorem free_will_defence_consistent :
    ∃ (God CanPrevent WantsPrevent MSR Evil : Prop),
      (God → CanPrevent) ∧ (God → WantsPrevent ∨ MSR) ∧
      (CanPrevent ∧ WantsPrevent → ¬ Evil) ∧ Evil ∧ MSR ∧ God :=
  ⟨True, True, False, True, True,
    fun _ => trivial, fun _ => Or.inr trivial, fun h => False.elim h.2, trivial, trivial, trivial⟩

/-- Rowe's evidential argument (its deductive core). -/
theorem evidential_evil {D : Type} (Occurs Gratuitous : D → Prop) (God : Prop)
    (p1 : ∃ x, Occurs x ∧ Gratuitous x)
    (p2 : God → ∀ x, Gratuitous x → ¬ Occurs x) : ¬ God := by
  intro g
  obtain ⟨x, hx, gx⟩ := p1
  exact p2 g x gx hx

/-- Schellenberg's hiddenness argument. -/
theorem hiddenness {D : Type} (NonResistant Believes : D → Prop) (God : Prop)
    (p1 : God → ∀ x, NonResistant x → Believes x)
    (p2 : ∃ x, NonResistant x ∧ ¬ Believes x) : ¬ God := by
  intro g
  obtain ⟨x, hn, hb⟩ := p2
  exact hb (p1 g x hn)

/-- Honorius: Vatican I's infallibility, the authority of Constantinople III's
    condemnation, and the claim that Honorius's letter was ex cathedra are jointly
    inconsistent.  Catholic theology denies `exCathedra`; the usual Orthodox reading
    denies `infallible`. -/
theorem honorius {D : Type} (ExCathedra Erred Condemned : D → Prop) (letter : D)
    (infallible : ∀ x, ExCathedra x → ¬ Erred x)
    (councilRight : ∀ x, Condemned x → Erred x)
    (condemned : Condemned letter) (exCathedra : ExCathedra letter) : False :=
  infallible letter exCathedra (councilRight letter condemned)

/-- Florence and the Filioque: conciliar infallibility, Florence's ecumenicity and the
    falsity of the Filioque are jointly inconsistent.  Orthodoxy denies `ecumenical`;
    Catholicism denies `filioqueFalse`. -/
theorem florence {D : Type} (Ecumenical Erred : D → Prop) (Filioque : Prop) (fl : D)
    (conciliar : ∀ x, Ecumenical x → ¬ Erred x) (ecumenical : Ecumenical fl)
    (link : ¬ Filioque → Erred fl) (filioqueFalse : ¬ Filioque) : False :=
  conciliar fl ecumenical (link filioqueFalse)

end TheismFormal
