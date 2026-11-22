import TheismFormal.AndersonSep
/-!
  E31 (experiments/e31_sat_lean/results.md), machine-checked: the CNF that E30's `encode`
  (experiments/e30_sat/run.py) builds is satisfiable exactly when `v` is a separable successor
  of `w` (E24's condition), for every frame given by successor lists, of any size.
  Prediction H35 is in LOG.md, written before this file.

  The frame is `succ : W → List W`, with R t y := y ∈ succ t (`Rel succ`).  Variables are
  `a x`, `s x` ([x ∈ A], [x ∈ S]) and, per world t, `p t` ("R(t) ⊆ A and R(t) ⊆ S") and
  `q t` ("R(t) misses A and misses S").  `Enc succ w v` lists the clauses of `encode`, one
  constructor per line of the Python; T = R*(v) is kept as reachability.

  (a) `witness`: any model gives the separation A = {x : a x} ∪ R(w), S = {x : s x}; no
      hypothesis on the frame.
  (b) `sat_of_sep`: if w R v and v is separable, the clauses are satisfiable.
  (c) `sat_iff`: for w R v, satisfiable iff separable.
  (d) `need_succ`: without w R v, (b) fails (v sees only itself, w sees nothing).
  Added after the prediction: `sep_of_not_succ`, every non-successor is separable.
-/

namespace TheismFormal.AndersonK.SAT

inductive Var (W : Type) where
  | a : W → Var W
  | s : W → Var W
  | p : W → Var W
  | q : W → Var W

inductive Lit (W : Type) where
  | pos : Var W → Lit W
  | neg : Var W → Lit W

variable {W : Type}

def Lit.eval (σ : Var W → Prop) : Lit W → Prop
  | .pos x => σ x
  | .neg x => ¬ σ x

/-- A clause holds when one of its literals does. -/
def Holds (σ : Var W → Prop) (c : List (Lit W)) : Prop := ∃ l ∈ c, l.eval σ

/-- The frame of a list of successors. -/
def Rel (succ : W → List W) (t y : W) : Prop := y ∈ succ t

/-- The clauses of E30's `encode(R, w, v)`. -/
inductive Enc (succ : W → List W) (w v : W) : List (Lit W) → Prop
  | av : Enc succ w v [.pos (.a v)]
  | sv : Enc succ w v [.neg (.s v)]
  | aw {x} : x ∈ succ w → Reach (Rel succ) v x → Enc succ w v [.pos (.a x)]
  | pa {t y} : Reach (Rel succ) v t → succ t ≠ [] → y ∈ succ t →
      Enc succ w v [.neg (.p t), .pos (.a y)]
  | ps {t y} : Reach (Rel succ) v t → succ t ≠ [] → y ∈ succ t →
      Enc succ w v [.neg (.p t), .pos (.s y)]
  | qa {t y} : Reach (Rel succ) v t → succ t ≠ [] → y ∈ succ t →
      Enc succ w v [.neg (.q t), .neg (.a y)]
  | qs {t y} : Reach (Rel succ) v t → succ t ≠ [] → y ∈ succ t →
      Enc succ w v [.neg (.q t), .neg (.s y)]
  | pA {t} : Reach (Rel succ) v t → succ t ≠ [] →
      Enc succ w v (.pos (.p t) :: (succ t).map (fun y => .neg (.a y)))
  | pS {t} : Reach (Rel succ) v t → succ t ≠ [] →
      Enc succ w v (.pos (.p t) :: (succ t).map (fun y => .neg (.s y)))
  | qA {t} : Reach (Rel succ) v t → succ t ≠ [] →
      Enc succ w v (.pos (.q t) :: (succ t).map (fun y => .pos (.a y)))
  | qS {t} : Reach (Rel succ) v t → succ t ≠ [] →
      Enc succ w v (.pos (.q t) :: (succ t).map (fun y => .pos (.s y)))

/-- The clauses have a model. -/
def Sat (succ : W → List W) (w v : W) : Prop :=
  ∃ σ : Var W → Prop, ∀ c, Enc succ w v c → Holds σ c

variable {succ : W → List W} {w v : W}

theorem unit {σ : Var W → Prop} {l : Lit W} (h : Holds σ [l]) : l.eval σ := by
  obtain ⟨l', hl', hv⟩ := h
  rw [List.mem_singleton] at hl'
  exact hl' ▸ hv

theorem two {σ : Var W → Prop} {l m : Lit W} (h : Holds σ [l, m]) : l.eval σ ∨ m.eval σ := by
  obtain ⟨l', hl', hv⟩ := h
  simp only [List.mem_cons, List.mem_singleton, List.not_mem_nil, or_false] at hl'
  rcases hl' with rfl | rfl
  · exact Or.inl hv
  · exact Or.inr hv

/-- A long clause `x ∨ ⋁_{y ∈ succ t} f y` holds iff `x` or some `f y` does. -/
theorem long {σ : Var W → Prop} {l : Lit W} {f : W → Lit W} {t : W}
    (h : Holds σ (l :: (succ t).map f)) : l.eval σ ∨ ∃ y ∈ succ t, (f y).eval σ := by
  obtain ⟨l', hl', hv⟩ := h
  rcases List.mem_cons.1 hl' with rfl | hm
  · exact Or.inl hv
  · obtain ⟨y, hy, rfl⟩ := List.mem_map.1 hm
    exact Or.inr ⟨y, hy, hv⟩

theorem long_of {σ : Var W → Prop} {l : Lit W} {f : W → Lit W} {t : W}
    (h : l.eval σ ∨ ∃ y ∈ succ t, (f y).eval σ) : Holds σ (l :: (succ t).map f) := by
  rcases h with h | ⟨y, hy, h⟩
  · exact ⟨l, List.mem_cons_self _ _, h⟩
  · exact ⟨f y, List.mem_cons_of_mem _ (List.mem_map_of_mem f hy), h⟩

/-- **(a)** Every model of the clauses is a separation of `v` from `w`. -/
theorem witness {σ : Var W → Prop} (hσ : ∀ c, Enc succ w v c → Holds σ c) :
    (∀ x, Rel succ w x → (σ (.a x) ∨ Rel succ w x)) ∧ ¬ σ (.s v) ∧
    ∀ t, Reach (Rel succ) v t →
      Cond (Rel succ) (fun x => σ (.a x) ∨ Rel succ w x) (fun x => σ (.s x)) t := by
  refine ⟨fun x hx => Or.inr hx, unit (hσ _ .sv), fun t ht => ?_⟩
  -- On R(t) ⊆ T, membership in A is the variable a.
  have hAy : ∀ y, y ∈ succ t → ((σ (.a y) ∨ Rel succ w y) ↔ σ (.a y)) := fun y hy =>
    ⟨fun h => h.elim id (fun hw => unit (hσ _ (.aw hw (Reach.tail ht hy)))), Or.inl⟩
  cases hl : succ t with
  | nil =>
    have hnil : ∀ y, ¬ Rel succ t y := fun y hy => by
      simp only [Rel, hl, List.not_mem_nil] at hy
    exact ⟨⟨fun _ y hy => absurd hy (hnil y), fun _ y hy => absurd hy (hnil y)⟩,
           ⟨fun _ y hy => absurd hy (hnil y), fun _ y hy => absurd hy (hnil y)⟩⟩
  | cons y0 ys =>
  have hne : succ t ≠ [] := fun h => List.noConfusion (hl.symm.trans h)
  have pa := fun {y} (hy : y ∈ succ t) => two (hσ _ (.pa ht hne hy))
  have ps := fun {y} (hy : y ∈ succ t) => two (hσ _ (.ps ht hne hy))
  have qa := fun {y} (hy : y ∈ succ t) => two (hσ _ (.qa ht hne hy))
  have qs := fun {y} (hy : y ∈ succ t) => two (hσ _ (.qs ht hne hy))
  have pA := long (hσ _ (.pA ht hne))
  have pS := long (hσ _ (.pS ht hne))
  have qA := long (hσ _ (.qA ht hne))
  have qS := long (hσ _ (.qS ht hne))
  simp only [Lit.eval] at pa ps qa qs pA pS qA qS
  refine ⟨⟨fun hall y hy => ?_, fun hall y hy => ?_⟩, ⟨fun hnone y hy => ?_, fun hnone y hy => ?_⟩⟩
  · -- all in A ⇒ P t ⇒ all in S
    have hP : σ (.p t) := pA.resolve_right
      (fun ⟨z, hz, hna⟩ => hna ((hAy z hz).1 (hall z hz)))
    exact (ps hy).resolve_left (fun hn => hn hP)
  · have hP : σ (.p t) := pS.resolve_right (fun ⟨z, hz, hns⟩ => hns (hall z hz))
    exact Or.inl ((pa hy).resolve_left (fun hn => hn hP))
  · have hQ : σ (.q t) := qA.resolve_right
      (fun ⟨z, hz, ha⟩ => hnone z hz (Or.inl ha))
    exact (qs hy).resolve_left (fun hn => hn hQ)
  · have hQ : σ (.q t) := qS.resolve_right (fun ⟨z, hz, hs⟩ => hnone z hz hs)
    exact fun hA => ((qa hy).resolve_left (fun hn => hn hQ)) ((hAy y hy).1 hA)

theorem sep_of_sat (h : Sat succ w v) : Separable (Rel succ) w v := by
  obtain ⟨σ, hσ⟩ := h
  obtain ⟨hA, hS, hT⟩ := witness hσ
  exact ⟨_, _, fun x hx => (hA x hx), hS, hT⟩

/-- **(b)** A separation of a successor gives a model of the clauses. -/
theorem sat_of_sep (hwv : Rel succ w v) (h : Separable (Rel succ) w v) : Sat succ w v := by
  classical
  obtain ⟨A, S, hA, hSv, hT⟩ := h
  refine ⟨fun
    | .a x => A x
    | .s x => S x
    | .p t => ∀ y ∈ succ t, A y
    | .q t => ∀ y ∈ succ t, ¬ A y, fun c hc => ?_⟩
  cases hc with
  | av => exact ⟨_, List.mem_singleton_self _, hA v hwv⟩
  | sv => exact ⟨_, List.mem_singleton_self _, hSv⟩
  | aw hx _ => exact ⟨_, List.mem_singleton_self _, hA _ hx⟩
  | @pa t y _ _ hy =>
    by_cases hP : ∀ y ∈ succ t, A y
    · exact ⟨_, List.mem_cons_of_mem _ (List.mem_singleton_self _), hP y hy⟩
    · exact ⟨_, List.mem_cons_self _ _, hP⟩
  | @ps t y ht _ hy =>
    by_cases hP : ∀ y ∈ succ t, A y
    · exact ⟨_, List.mem_cons_of_mem _ (List.mem_singleton_self _), (hT t ht).1.1 hP y hy⟩
    · exact ⟨_, List.mem_cons_self _ _, hP⟩
  | @qa t y _ _ hy =>
    by_cases hQ : ∀ y ∈ succ t, ¬ A y
    · exact ⟨_, List.mem_cons_of_mem _ (List.mem_singleton_self _), hQ y hy⟩
    · exact ⟨_, List.mem_cons_self _ _, hQ⟩
  | @qs t y ht _ hy =>
    by_cases hQ : ∀ y ∈ succ t, ¬ A y
    · exact ⟨_, List.mem_cons_of_mem _ (List.mem_singleton_self _), (hT t ht).2.1 hQ y hy⟩
    · exact ⟨_, List.mem_cons_self _ _, hQ⟩
  | @pA t _ _ =>
    apply long_of
    by_cases hP : ∀ y ∈ succ t, A y
    · exact Or.inl hP
    · exact Or.inr (Classical.byContradiction fun hn =>
        hP fun y hy => Classical.byContradiction fun hy' => hn ⟨y, hy, hy'⟩)
  | @pS t ht _ =>
    apply long_of
    by_cases hS : ∀ y ∈ succ t, S y
    · exact Or.inl ((hT t ht).1.2 hS)
    · exact Or.inr (Classical.byContradiction fun hn =>
        hS fun y hy => Classical.byContradiction fun hy' => hn ⟨y, hy, hy'⟩)
  | @qA t _ _ =>
    apply long_of
    by_cases hQ : ∀ y ∈ succ t, ¬ A y
    · exact Or.inl hQ
    · exact Or.inr (Classical.byContradiction fun hn =>
        hQ fun y hy hAy => hn ⟨y, hy, hAy⟩)
  | @qS t ht _ =>
    apply long_of
    by_cases hS : ∀ y ∈ succ t, ¬ S y
    · exact Or.inl ((hT t ht).2.2 hS)
    · exact Or.inr (Classical.byContradiction fun hn =>
        hS fun y hy hSy => hn ⟨y, hy, hSy⟩)

/-- **(c)** For a successor `v` of `w`, the clauses are satisfiable iff `v` is separable. -/
theorem sat_iff (hwv : Rel succ w v) : Sat succ w v ↔ Separable (Rel succ) w v :=
  ⟨sep_of_sat, sat_of_sep hwv⟩

/-- **(d)** The hypothesis w R v is needed: on worlds `false` (= w, no successors) and
    `true` (= v, sees only itself), v is separable but the clauses have no model. -/
def succ2 : Bool → List Bool
  | false => []
  | true => [true]

theorem need_succ : Separable (Rel succ2) false true ∧ ¬ Sat succ2 false true := by
  have hv : Reach (Rel succ2) true true := Reach.refl _
  have hne : succ2 true ≠ [] := fun h => List.noConfusion h
  have hmem : true ∈ succ2 true := List.mem_singleton_self _
  refine ⟨⟨fun _ => False, fun _ => False, fun x hx => ?_, id, fun t _ => ?_⟩, ?_⟩
  · simp only [Rel, succ2, List.not_mem_nil] at hx
  · exact ⟨Iff.rfl, Iff.rfl⟩
  · rintro ⟨σ, hσ⟩
    have ha : σ (.a true) := unit (hσ _ .av)
    have hs : ¬ σ (.s true) := unit (hσ _ .sv)
    have hP := long (hσ _ (.pA hv hne))
    simp only [Lit.eval, succ2, List.mem_singleton, exists_eq_left] at hP
    have hP' : σ (.p true) := hP.resolve_right (fun hn => hn ha)
    have h2 := two (hσ _ (.ps hv hne hmem))
    simp only [Lit.eval] at h2
    exact hs (h2.resolve_left (fun hn => hn hP'))

/-- Added after the prediction: for a non-successor, separability is trivial (A = S = R(w)),
    on any frame.  So the definition only says something for successors, which is how E24 to
    E30 use it, and (d) is an instance. -/
theorem sep_of_not_succ {W : Type} {R : W → W → Prop} {w v : W} (h : ¬ R w v) :
    Separable R w v :=
  ⟨R w, R w, fun _ hs => hs, h, fun _ _ => ⟨Iff.rfl, Iff.rfl⟩⟩

end TheismFormal.AndersonK.SAT
