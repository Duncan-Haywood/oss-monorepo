# E19: the AFP formalisation of Anderson's variant, and which frame conditions it uses

**Question.** Do the programme's results on Anderson's emendation of Gödel's argument (E11 to E16)
agree with the published machine-checked formalisation? And which of S5's three frame conditions
(reflexive, symmetric, transitive) does each step of the argument actually use?

**Baseline.** D. Fuenmayor and C. Benzmüller, *Types, Tableaus and Gödel's God in Isabelle/HOL*,
Archive of Formal Proofs, 2017 (https://www.isa-afp.org/entries/Types_Tableaus_and_Goedels_God.html),
theory `AndersonProof.thy` (243 lines), read on 2026-11-12 from the AFP's GitHub mirror
(`isabelle-prover/mirror-afp-devel`, `thys/Types_Tableaus_and_Goedels_God/AndersonProof.thy`).
It follows Fitting's *Types, Tableaus, and Gödel's God* (Kluwer 2002), pp. 169 to 171, and
Anderson (1990). Its Part I (T1, T3) is proved in modal logic K; Part II adds A4a and the S5
conditions (refl, tran, symm) and proves A4b, rigidity of P, GodIsEssential,
GodExistenceImpliesNecExistence, possExistenceImpliesNecEx, T4 and GodNecExists. It reports modal
collapse countersatisfiable (Nitpick) and checks with Nitpick that each stage has a model.

**Definitions, as in the file.** Properties are intensions (cell sets over world × individual);
G^A x iff for every Y, P Y iff □(Y x); entailment is actualist, X ⇒ Y iff □∀ᴱz (X z → Y z);
A1a: P ¬X → ¬P X (Anderson's half of Scott's axiom); A2: P X and X ⇒ Y give P Y; T2: P G^A;
A4a: P X → □P X; essence E^A Y x iff for every Z, □(Z x) iff Y ⇒ Z; NE^A x iff every essence of
x is necessarily instantiated by an existent; A5: P NE^A. These are E12's definitions, here read
in any frame, with possibly empty domains and with P allowed to vary between worlds.

## Method

`run.py` enumerates finite models exactly. A frame is an accessibility relation, a domain per world
(empty allowed) and a partition of the cells (full semantics = singletons, otherwise a coarse
algebra). By A1a and A2, P at a world w is fixed by its members' traces on the existing cells of w's
successors and is an intersecting up-set of those traces. At a world where some x is God-like,
P equals {Y : Y contains x's successor cells}. So each world is either godly (P one of those) or
godless; the pattern fixes G, and godless worlds range over every intersecting up-set (1, 2, 4,
12, 81, 2,646 of them on 0 to 5 trace blocks) that contains G's trace (and NE's, with A5). Stages
with A4a are enumerated model by model; stages without it are counted per pattern. Every statement
is then checked from its definition at every world.

Sizes (worlds × individuals): every relation at 1×1–5, 2×1–3, 3×1 and 3×2; reflexive transitive
relations at 4×1; equivalence relations at 5×1; full semantics only at 4×1 (every relation) and
2×4. That is 8,112,532 frames. 435 frames are skipped because a godless world there has 6 trace
blocks (1,422,564 candidates). The frames give 1,952,588 stage-I models, 735,109 stage-II,
477,291 stage-III and 1,478,138 III-noA4 (I + A5). The run took 28.5 minutes. The full table, failures / models per frame class,
is in [table.md](table.md), and `results.json` has every count and the first countermodel of each
statement in each class.

## Results

H23 (LOG.md, written before any code) held in parts (a) to (d). In (e), one guess was wrong.

| H23 | claim | outcome |
|---|---|---|
| (a) | every AFP theorem holds in every model of its stage in S5, full and coarse | **held.** 0 failures in S5 for all 9 statements and T4 |
| (b) | every stage has a model; modal collapse has a stage-III S5 countermodel of 2 worlds × 1 individual | **held.** All stages have 1×1 models; collapse's smallest S5 countermodel is 2×1 (B&F 2020's size) |
| (c) | stage I forces seriality; P is an intersecting up-set of traces, principal at godly worlds | **held** for seriality: 0 non-serial worlds in 1,952,588 stage-I models. The up-set and principal-filter parts are what the enumeration is built on (argued in `run.py`'s docstring; a test re-checks candidates against A1a and A2 from the definitions), so the search does not test them independently |
| (d) | with one equivalence class and non-empty domains, the stage-II and stage-III models are exactly E12's, frame by frame | **held.** Counts equal E12's formula on all 17,742 such frames, for both stages |
| (e) | T1, T3 need no frame condition; A4b and rigidity need symmetry; GodIsEssential holds in reflexive frames and fails in some non-reflexive one; GodExistenceImpliesNecExistence holds in reflexive frames | **held** for all of these |

Frame conditions, stage III (failures / models; K = no condition, T = reflexive, KB = symmetric,
K4 = transitive, B, S4, S5 as usual; stage I forces seriality, so the KB4 frames that have models
are S5 frames):

| statement | K | T | KB | K4 | B | S4 | S5 |
|---|---|---|---|---|---|---|---|
| T3: God possibly exists | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| A4b, rigidPred | 10,068 | 4,404 | 0 | 57,296 | 0 | 43,528 | 0 |
| GodIsEssential | 648 | 0 | 0 | 1,512 | 0 | 0 | 0 |
| GodExistenceImpliesNecExistence | 0 | 0 | 0 | 1,164 | 0 | 0 | 0 |
| possExistenceImpliesNecEx, GodNecExists, T4 | 49,998 | 7,252 | 0 | 71,232 | 0 | 96,036 | 0 |
| no world has an empty domain | 28,575 | 2,468 | 0 | 56,797 | 0 | 33,230 | 0 |
| models | 102,360 | 18,880 | 10,690 | 178,022 | 603 | 136,466 | 30,270 |

**The open question: symmetry is what the conclusion needs.** GodNecExists (God necessarily exists),
possExistenceImpliesNecEx and T4 hold in every model on a symmetric frame (KB, B, S5) and fail in every other
class tested (K, T, K4, S4). They also hold without A4a (III-noA4: 0 failures in 31,575 KB,
1,480 B and 30,270 S5 models). The smallest failure is in S4 under full semantics: 2 worlds,
1 individual, world 0 sees both worlds, world 1 sees only itself, the individual exists only at
world 1. God possibly exists at world 0 but not necessarily: the step ◇□p → □p fails without
symmetry. The AFP's proof uses symmetry and transitivity for that step (`using symm tran`).
Transitivity is not needed once the axioms are in place, nor is reflexivity.

**Not predicted.**
- **GodIsEssential holds in symmetric frames without reflexivity, and without A4a.** The AFP's
  proof uses reflexivity. In a symmetric frame, a God-like individual at a world w sees is God-like
  at w, which gives the same conclusion (Lean, `essential_symm`).
- **GodIsEssential's failures are all in coarse algebras.** In K and K4 it fails in 792 + 2,304
  stage-II models, every one a coarse algebra; the smallest has 3 worlds, 2 individuals and
  3 blocks. Under full semantics it has no failure at these sizes. That is search-only; we have no proof.
- **GodExistenceImpliesNecExistence fails only in K4, coarse algebras** (1,164 models). It
  holds in all 102,360 K models.
- **Non-empty domains.** As in E18, the file never states it. In a symmetric frame no world of a
  stage-III model has an empty domain (Lean, `domain_nonempty_symm`). In the other classes some do.

## Proofs (Lean 4, `lean/TheismFormal/AndersonK.lean`)

The statements take any accessibility relation, any domains and any Henkin-style collection
of properties (a type `Pr` with an extension map). Full semantics and every block algebra are
instances. The only requirement is that G, its complement and NE are properties, which T2, A1a and A5 presuppose.

- `t3`: A1a, A2, T2 give an accessible world with an existing God-like individual (any frame).
- `essential_refl`: GodIsEssential in reflexive frames from A2, T2, A4a (the AFP's own proof).
- `essential_symm`: GodIsEssential in symmetric frames from A2 and T2 alone.
- `nec_exists_symm`: in symmetric frames A1a, A2, T2, A5 give GodNecExists at every world. No
  reflexivity, transitivity or A4a.
- `domain_nonempty_symm`: in symmetric frames those axioms leave no empty world.
- `a4b_symm`, `rigid_symm`: the file's A4b and rigidPred from A4a and symmetry.

No `sorry`, no warnings. `essential_refl`, `essential_symm`, `a4b_symm` and `rigid_symm` use no
axioms. `t3`, `nec_exists_symm` and `domain_nonempty_symm` use Lean's standard three (`t3` argues
by contradiction). Build log: [lean_build.txt](lean_build.txt).

## Reading

Our encoding reproduces every claim of the reference formalisation of Anderson's variant.
On the frames where the two overlap, its S5 models are exactly E12's. The new point is about
frame conditions. The published proof assumes S5, but the argument's conclusion needs only a
symmetric accessibility relation (system B without reflexivity, KB; stage I already forces
seriality), and it needs neither A4a nor reflexivity. Without symmetry it fails even in S4. For
the debate this sharpens a known point: the controversial modal premise in the modal ontological
argument is the B axiom (what is actual is necessarily possible), the same one H2 found for
the Hartshorne–Plantinga argument (E1).

## Limits

Finite models up to the sizes above. The full-semantics observation about GodIsEssential is
search-only. The countermodels are certified by the definition-level search, not in Lean.
Anderson's paper and Fitting's book were not read directly; the definitions are the AFP's.
These are results about a formal argument's logic, not about whether God exists.
