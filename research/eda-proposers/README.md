# eda-proposers: six search methods compared at equal budgets on a logged chip-design space (second milestone of track 7)

Why it seemed worth doing: `eda-harness` can score any candidate design, but the track's question is which *proposer* finds good designs with the fewest expensive evaluations. This compares random search, a grid, simulated annealing, a genetic algorithm, NSGA-II and a TPE-style Bayesian method at equal evaluation budgets, by Pareto hypervolume over 100 seeds. Produced with AI assistance (Claude). **Stylised and preliminary:** one 80-design space from one toy accelerator, generic-gate counts, no place and route. Nothing here is a claim about real chips or about these methods on large spaces.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-proposers/

**Builds on.** `research/eda-harness` (its committed evaluation log supplies 40 of the 80 designs) and `research/chip-accel` (generator and Yosys flow). Methods: simulated annealing (Kirkpatrick, Gelatt and Vecchi, 1983, *Science* 220:671), NSGA-II (Deb, Pratap, Agarwal and Meyarivan, 2002, *IEEE Trans. Evolutionary Computation* 6(2):182), TPE (Bergstra, Bardenet, Bengio and Kégl, 2011, *NeurIPS*, "Algorithms for Hyper-Parameter Optimization"), random-weight Chebyshev scalarisation as in ParEGO (Knowles, 2006, *IEEE Trans. Evolutionary Computation* 10(1):50), hypervolume as a quality indicator (Zitzler and Thiele, 1999, *IEEE Trans. Evolutionary Computation* 3(4):257). Equal-budget reporting follows the caution in Cheng, Kahng, Kundu, Wang and Wang (2023), ISPD, <https://doi.org/10.1145/3569052.3578926>. The six implementations are small and written here from the textbook descriptions, not the reference libraries (Optuna, pymoo), so results speak for these implementations only. No lab's work is built on and no affiliation is implied.

## Method
- **Space** (`src/eda_proposers/table.py`): lanes p = 1..8, weight width wb = 4..8, ABC script in {`abc -g`, `abc -fast -g`}: 80 designs. The 40 `abc -g` rows are read from `eda-harness/experiments/eval_log.jsonl` (all passed its lint, bit-exact RTL and gate-netlist checks). The 40 `-fast` rows reuse the same Verilog (so RTL correctness carries over) and only re-run Yosys synthesis; their gate-level simulation was **not** repeated. The table is stored in `experiments/table.jsonl` with the Yosys version.
- **Objectives**, all minimised: Yosys cell count, cycles per inference, and 1 − held-out accuracy of the quantised network (400 points of the toy task). Normalised to [0, 1] over the table; reference point (1.1, 1.1, 1.1).
- **Metric**: exact hypervolume of the found non-dominated set divided by the hypervolume of the true front (12 of 80 designs). 1.0 means the whole front was found.
- **Equal budget**: B means B *distinct* designs evaluated; a proposer is not charged for repeating one. Evaluating a design is a table lookup, which is what the harness would return, so 100 seeds cost seconds.
- **Proposers** (`proposers.py`): random (effectively without replacement); grid (lexicographic, the harness's own order); simulated annealing on a Chebyshev scalarisation with weights redrawn every 6 proposals; a steady-state GA (population 8) on the same scalarisation; NSGA-II survivor selection (rank, crowding) over everything seen; TPE for categorical variables on a Chebyshev scalarisation with fresh random weights per proposal (8 random starts, good set 25%, 24 candidates). Hyperparameters were set once and **not tuned**.

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy matplotlib
cd research/eda-proposers
PYTHONPATH=src:../chip-accel/src python -m unittest discover -s tests   # 10 tests, under 1 s
PYTHONPATH=src:../chip-accel/src python experiments/run.py              # about 1 min with table.jsonl present; rebuilds it if absent
```

## Results (from `experiments/results.txt`; figure `experiments/hv_curves.png`)
Mean fraction of the true-front hypervolume found, 100 seeds (grid: one deterministic run):

| budget | random | grid | annealing | genetic | NSGA-II | TPE |
|---|---|---|---|---|---|---|
| 8 | 0.815 | 0.098 | 0.721 | 0.814 | 0.815 | 0.815 |
| 16 | 0.891 | 0.664 | 0.852 | 0.885 | 0.891 | 0.917 |
| 30 | 0.943 | 0.749 | 0.928 | 0.955 | 0.959 | 0.980 |
| 40 | 0.965 | 0.926 | 0.961 | 0.979 | 0.985 | 0.990 |

- At budget 16 TPE is ahead of random by +0.026 (better in 72% of paired seeds); at budget 30 and 40 NSGA-II, the GA and TPE are all ahead of random with non-overlapping 95% bootstrap intervals at 30 (TPE 0.977 to 0.983 against random 0.938 to 0.948). Annealing is *behind* random at every budget up to 30 (−0.039 at 16).
- NSGA-II and the GA match random at small budgets because all three draw their first `population` designs identically from the same seed; the table's identical 4- and 8-budget values are that, not a coincidence of quality.
- The grid is poor because lexicographic order walks p = 1 first and only reaches the front's other lanes late. A stride or space-filling grid would do better; this is the order the harness ships.
- The true front is entirely `abc -g` designs with wb 4 to 6 and p in {1, 2, 4, 8}. `abc -fast` made every design larger in cells (ratio 1.09 to 1.78, median 1.39) in this table, so for this family the flow option is a dominated choice and the search effectively has a hidden constraint a proposer can learn.

## Limitations
- **The space is tiny.** With 80 designs, random search at budget 40 has already seen half of it and reaches 0.965. Gaps between methods are small in absolute terms and could change on larger spaces, noisy objectives or real place-and-route costs. This is a first benchmark on a table, not a ranking of the methods.
- Hyperparameters untuned for every method; annealing's weak showing may reflect the cooling schedule and neighbourhood, not the method.
- Only evaluations are counted, not proposer compute or the (very different) cost per rung of the fidelity ladder; that is `eda-fidelity`.
- Objectives are generic-gate counts, cycle counts and one toy-task accuracy; no silicon measurement, no sign-off numbers.
- The `-fast` rows lack a gate-level simulation check.

## Next steps
Add `eda-flowtune` dimensions (ABC pass sequences, placement settings) to enlarge the space; tune each proposer's hyperparameters fairly; repeat on a second design family (`chip-systolic`) to test transfer.

## Outside dependencies
Yosys (apt); NumPy, matplotlib (pip); `eda-harness` and `chip-accel` in this repository. All code original, MIT.
