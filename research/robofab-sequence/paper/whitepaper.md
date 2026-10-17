# How much of an assembly-order search survives a better checker? A stylised study on a printed gearbox

*Produced with AI assistance (Claude). Stylised, simulation-only study; see Limitations.*

## Abstract

We plan the assembly order of a twelve-part printed gearbox by exact dynamic programming over subsets, and check each candidate order at three levels of fidelity: collision-free straight-line insertion (L0), plus quasi-static support (L1), plus a print-tolerance gap (L2). Of 11! = 39,916,800 orderings of the non-base parts, 4,227,168 (10.6%) pass L0 and 30,760 (0.077%) pass L1; the order with the fewest insertion-direction changes at L0 is infeasible at L1. A greedy assembly-by-disassembly order is feasible but needs 4 direction changes against an optimum of 1. One order written by the session agent before the checker was run passes all levels with 2 changes. All results are for a hand-written axis-aligned checker, not a physics engine.

## 1. Setting and related work

Assembly sequence planning asks for an order of part insertions that is geometrically and physically possible. Recent work includes ASAP (Tian et al., 2024), which plans sequences with physical feasibility; our checker is a much simpler, from-scratch construction and does not reproduce it. Language models have been used to write robot programs (Liang et al., 2023); here the session agent proposes one order, which a fixed checker then scores. A physics engine such as MuJoCo (Todorov et al., 2012) is the natural next validator. The work relates to task-and-motion planning (CAIRO Lab, University of Colorado Boulder) and workcell twins (HIRO Group); it is not affiliated with either.

## 2. Model

Parts are unions of axis-aligned boxes. Part p may join placed set S along d if its sweep from the final pose to infinity along d meets no positive volume of S (touching faces slide; tolerance tol blocks gaps smaller than tol across the motion). A placed set is stable if each non-base part has support patches below it (within a 1 mm settle gap) and its centre of mass lies over their bounding rectangle. Cost is the number of changes of insertion direction along an order. A dynamic programme over 2^11 subsets with the last direction as extra state counts valid orders and minimises cost exactly; unit tests compare against memo-free enumeration.

## 3. Results

All from `research/robofab-sequence/experiments/results.txt`. L0 admits 4,227,168 orders, L1 and L2 (0.2 mm) admit 30,760; L1 rejects 99.3% of L0-valid orders, mostly because they leave parts floating. The L0-optimal order (1 direction change) fails L1 because a collar is placed before its shaft. L1's optimum is also 1 change. Greedy disassembly gives 4 changes, a random walk over valid steps 3.46 on average (2000 walks), the session-agent order 2. Sampling 100,000 random permutations gives a valid fraction of 0.00071 against the exact 0.00077. A tolerance sweep gives zero valid orders once tol exceeds the smallest modelled bore clearance (0.5 mm), and a support-gap sweep gives zero valid orders below 1 mm, the modelled shaft-to-floor gap; both thresholds are consequences of the chosen dimensions.

## 4. Limitations

Boxes only; single-part axis-aligned moves; no grippers, subassemblies, friction or fits; a support rule that can accept states a physics engine rejects; one product with chosen dimensions; one session-agent attempt. The comparison is between levels of one hand-written checker, so it shows that a stricter checker prunes the space sharply, not how any real arm or printed part behaves.

## References

See `refs.bib` (Tian et al. 2024; Liang et al. 2023; Todorov et al. 2012). DOIs were copied from the repository's `PROJECTS.md`, where they were checked on 2026-10-12; author lists are abbreviated ("and others") and should be completed from the published records before submission.
