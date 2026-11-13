# E22: with A4a, GodIsEssential fails exactly where a world sees a transient world, at any size

**Question.** E21 proved that in Anderson's variant of Gödel's argument, as the AFP formalises it
(Fuenmayor & Benzmüller, AFP 2017, `AndersonProof.thy`), GodIsEssential holds at a world w with
rigid positivity (A4a) whenever every successor of w lies on a cycle (`essential_a4`). It found
the converse only by search, on frames up to 3 worlds. This step asks whether the converse holds
for every serial frame, of any size.

**Prediction.** H26 in `LOG.md`, written and committed before the Lean file and this script.

## Method

- **Lean 4** (`lean/TheismFormal/AndersonTransient.lean`, core library only, no `sorry`, no
  warnings; `lean_build.txt`). Definitions are `AndersonK.lean`'s (E19). For any serial relation
  R, world w and successor v0 of w on no cycle, the file builds one model:
  - two individuals, x and z, both existing at every world;
  - S = the worlds that reach v0 in zero or more steps;
  - a property is a pair (p, f): x has it at every world iff p; z has it at t iff f(t) when t is
    in S, and iff p otherwise. In E19's terms this is a block algebra: one block holding every
    x cell and every z cell outside S, and a singleton block for each z cell in S;
  - P is the same at every world: (p, f) is positive iff p.
- **Independent check** (`run.py`). It builds the same model as an E19 `Frame`, using E19's search
  code unchanged, and checks H26 (a) to (e) from E19's own definitions. It covers every serial
  relation up to 4 worlds and a seeded sample of sparse serial relations (each edge with
  probability 0.3) at 5, 6 and 8 worlds. Each relation is tried with every (w, v0) pair where v0
  is transient. It runs in 13 s.

## Results

| H26 | claim | outcome |
|---|---|---|
| (a) | x is God-like at every world | **proved** (`Transient.god_x`) |
| (b) | z is God-like at t iff t is outside S or t = v0 | **proved** (`Transient.god_z_iff`) |
| (c) | the God-like property, its complement and Anderson's NE are in the collection | **proved** (`Transient.model`) |
| (d) | A1a, A2, T2, A4a and A5 hold (a stage-III model) | **proved** (`Transient.model`) |
| (e) | GodIsEssential fails for x at w | **proved** (`Transient.fails`, axiom-free) |
| — | exact characterisation at stage II and stage III, every serial frame | **proved** (`essential_a4_iff`, `essential_a4_iff_III`) |

The characterisation, for any serial R and any world w:

> GodIsEssential holds at w in every model of A1a, A2, T2 and A4a (with or without A5) over R
> **iff** every world w sees lies on a cycle (some world reachable from it sees it).

The "if" half is E21's `essential_a4`. The "only if" half is this step's model. Seriality is
needed only because a non-serial frame has no model at all (E19).

Independent check in E19's semantics (`table.md`, `results.json`):

| worlds | serial relations | with a transient successor | (w, v0) pairs | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|---|---|---|
| 1 (all) | 1 | 0 | 0 | held | held | held | held | held |
| 2 (all) | 9 | 0 | 0 | held | held | held | held | held |
| 3 (all) | 343 | 24 | 24 | held | held | held | held | held |
| 4 (all) | 50,625 | 3,696 | 4,896 | held | held | held | held | held |
| 5 (sample 5000) | 5,000 | 1,164 | 1,938 | held | held | held | held | held |
| 6 (sample 5000) | 5,000 | 1,071 | 2,054 | held | held | held | held | held |
| 8 (sample 2000) | 2,000 | 267 | 590 | held | held | held | held | held |

The 24 transient pairs at 3 worlds are E21's 24 failing (relation, world) pairs with A4a, the
same count. As a negative control, when v0 lies on a cycle (2 → 0, 0 → {0, 1}, 1 → 1) the same
construction fails (b) and (e), as it should; the test suite checks this.

**What went wrong on the way.** The first full run reported 581 failures at 5 worlds. The cause
was a bug in the harness, not the model: a generator expression bound the world count late, so
the "5-world" sample was drawn with 6 worlds and checked as if it had 5. The fix builds each
sample eagerly. The run above is the fixed one, and nothing else changed.

**Reading.** In the setting of the AFP's proof (rigid positivity), whether a frame can break
GodIsEssential at w now has an exact answer at every size: it can if and only if w sees a
"transient" world, one that never leads back to itself. Two individuals, constant domains and
rigid positivity are enough to break it there. The model is also a stage-III model, so A5
(necessary existence is positive) does not block it. With total domains every individual has
Anderson's necessary existence everywhere. The AFP's reflexivity assumption is far stronger than
the step needs.

## Limits

- The characterisation is for stages II and III (with A4a). Without A4a (stage I) the exact
  condition is still open; E21 showed it depends on the property algebra, not on R alone.
- The countermodel uses a coarse algebra. Under full semantics GodIsEssential holds in every
  frame (E20, `essential_any`), so the failure is a fact about Henkin-style collections.
- As in E19 to E21, the semantics is the AFP file's as we read it, not Anderson (1990) directly.

Reproduce: `python3 research/theism-formal-evidence/experiments/e22_transient_countermodel/run.py`
(13 s; `--quick` under 1 s) and `bash research/theism-formal-evidence/lean/build.sh`.
