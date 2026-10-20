# How much of this repository's research is a repeatable experiment, and how much is made up?

An audit of the 761 projects under `research/`, run on 2026-10-20 by an AI agent (Claude) at
the owner's request. It asks two different questions, because "made up" can mean two different
things:

1. **Are the reported numbers real?** That is, does the code produce them, and does it produce them again when re-run?
2. **Are the inputs real?** That is, do the numbers start from measurements of the world, or from parameters the author chose?

The short answer: **we found no fabricated result, and nearly every experiment that ran to the end
gave its committed numbers again. But most of the research is computation on assumed inputs,
not measurement.** Each project is a repeatable experiment on a stated model. Few are empirical
studies of the world, and the READMEs say so.

Blog post: [`docs/posts/2026-10-20-is-ai-written-research-real-a-reproducibility-audit.md`](../../docs/posts/2026-10-20-is-ai-written-research-real-a-reproducibility-audit.md).
Earlier sampled audit this builds on: [`research/swe-audit`](../swe-audit/).

## Results

| question | evidence | result |
|---|---|---|
| Does the code produce the headline number? | 40 random projects, one headline number each, checked by hand against the committed results file ([`handlabel-2026-10-20.md`](handlabel-2026-10-20.md)) | **40 of 40 match** (95% Wilson interval 91% to 100%). 0 fabrication concerns; 4 secondary sentences summarise the results file loosely |
| Can README numbers be found in committed output? | every number with 3+ significant digits in the results sections of 761 READMEs (11,985 numbers), searched in the project's own committed output files | **10,518 (88%) found**. Against another project's files the chance rate is **5%** (shuffle control, 3 draws: 4.5%, 5.1%, 5.4%) |
| Does re-running give the same numbers? | `swe-audit`'s two seeded samples (92 projects) plus this audit (32 projects, 2 overlapping); a fresh copy of `main`, `PYTHONPATH=src python3 experiments/run.py`, output compared with the committed `results.txt` | **102 of 103 distinct projects that finished gave the same numbers** (Wilson 95% to 100%). The 1 exception, `ambient-bandit`, is environment-dependent (below) |
| Where do the inputs come from? | the same 40 random projects, labelled by hand | **math 17, assumed parameters 14, real tool 5, repo data 2, cited parameters 2, external dataset 0** |
| Do the tests pass? | `pytest` on 231 projects (the run stopped there; see action items) | **220 pass**, 4 fail, 3 missing a package, 1 timed out, 3 have no collected tests |

### 1. The numbers are produced by the code

- **Hand check, 40 random projects** (seed 20261020). Every headline number matched its committed results file, sometimes after rounding or recomputing a mean from the rows. Four secondary sentences paraphrase the file loosely. For example, `ambient-pipeline` says "50 to 63 ms" where the rows give 46 to 75 ms. One project (`simdesign-robustmove`) quotes two exploratory runs that are in no file, and labels them so.
- **Census, 761 READMEs.** 368 of the 550 READMEs with at least 5 specific numbers have 90% or more of them in their own output files, and 21 have under 50%. The misses are mostly derived values (ratios, differences), integers rounded from a decimal (488 for 487.8), or outputs in a format the scan skips. Seven projects have no committed output at all, so none of their README numbers can be checked without re-running:
  - `decentralized-verification-markets`, `market-routing`, `property-elicitation-verification` and `wagering-modular-experts` are the earliest projects, which print to stdout.
  - `house-open-design` writes `report.md`, a format the scan skips.
  - `selfrep-repairpay` rounds to integers.
  - `marriage-divorce-evidence` keeps its outputs outside `experiments/`.

### 2. They come back when re-run

- **This audit re-ran 32 projects.** 23 came from an alphabetical pass that was stopped early, and 9 from a seeded random order (seed 20261020, `--siblings`). One more, `ambient-bandit`, ran three times by hand.
  - **16 reproduced byte for byte.** Two of those, `abstention-scoring` and `accel-codesign`, were also in `swe-audit`.
  - **9 errors before any comparison**, all setup steps rather than wrong numbers:
    - 5 `accel-*` projects need a PDK fetched first (`sh fetch_pdk.sh pdk`).
    - 2 need a feature file passed as an argument (`accel-kws`, `accel-kwssparse`).
    - 2 need an FPGA tool that is not installed (`accel-fpga`, `accel-planefpga`).
  - **6 timeouts** (`accel-lutwide`, `accel-nsgatune`, `accel-plane`, `eda-verify`, `eiv-twin`, `watchdog-twin`; 600 s alphabetical, 120 s random) and **1 missing tool** (`verilator` for `chip-rtl-probe`). These are inconclusive.
- **`swe-audit` (2026-10-15 to 10-17)** re-ran 92 projects: 88 reproduced and none gave different numbers.
- **Pooled:** 103 distinct projects finished. 102 gave the committed numbers, byte for byte or differing only in a timing or tool-version line.
- **The one difference: `ambient-bandit`.** Three runs in this container (numpy 2.5.3) agree with each other. All three differ from the committed file, but only on the five Thompson-sampling rows. `rng.multivariate_normal` with a fixed seed draws different samples on a different numpy/LAPACK build. Every greedy and epsilon-greedy row is identical, and the README's conclusions still hold: with an informed prior, greedy reaches 90% of the oracle in 22.5 h and Thompson in 31.5 h (32.5 h committed). The uninformed-Thompson mean moves from −24.1 to −30.6, inside its ±22.9 spread over seeds. So the numbers are seeded and repeatable on one machine, but not bit-for-bit portable.

### 3. But most inputs are chosen, not measured

The hand-labelled sample is the honest estimate (the definitions are in [`handlabel-2026-10-20.md`](handlabel-2026-10-20.md)):

| input basis | of 40 | share (95% Wilson) | what it means |
|---|---|---|---|
| math | 17 | 42% (29% to 58%) | a theoretical property checked numerically, e.g. when a scoring rule stays proper |
| assumed parameters | 14 | 35% (22% to 50%) | a simulation whose costs, rates or distributions the author picked |
| real tool | 5 | 12% (5% to 26%) | a measurement of a real program on designed inputs: Yosys/ABC gate counts, MuJoCo, gcc struct sizes, speech models |
| repo data | 2 | 5% (1% to 17%) | this repository's own records (`swe-*`) |
| cited parameters | 2 | 5% (1% to 17%) | a model fed with published figures (EIA electricity prices) |
| external dataset | 0 | 0% (0% to 9%) | a result computed from real-world measured data |

- **About three quarters (31 of 40, Wilson 62% to 88%) start from no measurement of the world.** Math results are not "made up": a proof checked by computation is as real as it gets. But results on assumed parameters show what a stated model implies, not how the world behaves.
- **External data is rare.** In the whole tree only 18 projects have a `data/` directory, and 77 commit 20 KB or more of data files. Examples of genuinely empirical work: `marriage-divorce-evidence` (43,336 NSFG first marriages), `energy-mix` (ENTSO-E/OPSD 2019 hourly series, though assumed costs drive its answer), `house-energyprices` (EIA prices) and the `swe-*` track (this repository's own history).
- **The assumptions are disclosed.** 38 of the 40 say plainly that inputs are assumed or stylised, nearly always in the first paragraph. The two that don't, `forgetting-audit` and `topk-routing`, are analytic. Across the census, 660 READMEs use words like "stylised", "assumed" or "synthetic", 518 have a Limitations section, and 505 carry an AI-assistance note.
- **The keyword census is cruder than the hand labels.** It puts 652 projects in "assumed" and 109 in "measured" or "mixed", because it cannot tell math from assumption or a cited figure from a measurement. Use the hand sample for rates and the census (`input_basis` in `audit.json`) only to find candidates.

### 4. Tests

There are 6,197 test functions in 760 of 761 projects, and **`research-ci.yml` runs none of them** (it only builds the homepage). This audit ran `pytest` on 231 projects before stopping:
- **220 passed.**
- **4 failed:**
  - `appeal-panels`: `assertLess(0.91, 0.91)`, a float-equality edge case.
  - `chip-rtl-loop` and `chip-rtl-probe`: need `verilator`.
  - `forgetting-audit`: a collection error.
- **3 missing a package:** `codesign-agri`, `codesign-forcefresh`, `eda-harness`.
- **1 timed out at 300 s:** `free-c2stexact`.

## For agents

- **Data.** [`audit.json`](audit.json) has one row per project: `outcome`, `input_basis`, `claim_numbers`, `claim_traced`, `tests`, `first_diff`, `stderr`. `summary` holds the totals. The raw passes are the `*-2026-10-20.jsonl` files next to it.
- **Outcomes.** `exact`, `numeric` (every number within 1%) and `timing` (only wall-clock or tool-version lines differ) count as reproduced. `differs` means the committed numbers are not what the code prints now. `error`, `timeout`, `missing-dep`, `no-runner` and `not-run` are inconclusive, never failures of the research.
- **`input_basis: assumed` does not mean fabricated.** It means the README's own words say the inputs were chosen. Do not cite a stylised project as an empirical finding about the world, and do not retire one for being stylised.
- **When you write a project:**
  - commit its output;
  - print numbers the way the README quotes them;
  - prefer seeded generators whose draws do not depend on the BLAS build (`rng.normal` with a Cholesky factor you compute yourself, rather than `rng.multivariate_normal`);
  - list every non-stdlib package and sibling `src` path in the Reproduce block.

Commands (stdlib only; `run` needs a disposable worktree because most `run.py` scripts rewrite `results.txt`):

```bash
git worktree add /tmp/tree origin/main
python3 research/_audit/repro_audit.py run --tree /tmp/tree --out runs.jsonl --jobs 4 --timeout 600 --seed 20261020 --siblings
python3 research/_audit/repro_audit.py run --tree /tmp/tree --out readme.jsonl --readme --siblings --only <slugs>   # use the README's own commands
python3 research/_audit/repro_audit.py tests --out tests.jsonl --jobs 2
python3 research/_audit/repro_audit.py scan --out scan.jsonl
python3 research/_audit/repro_audit.py report --runs runs.jsonl readme.jsonl --scan scan.jsonl --tests tests.jsonl --out research/_audit/audit.json
python3 -m pytest -q research/_audit/test_repro_audit.py   # 12 tests
```

`run` appends to `--out` and skips slugs already in it, so a stopped run resumes where it left off.
Installed for this audit: numpy, scipy, matplotlib, scikit-learn, scikit-fem, shapely, mujoco 3.16.0, yosys, iverilog.

## Action items for a later run

This session stopped before the census finished. Step-by-step instructions for the next agent are in [`NEXT.md`](NEXT.md). What is left, roughly in order of value:

1. **Finish the re-run census.** 728 projects are `not-run`. Resume with the `run` command above (same seed, 600 s, `--siblings`), appending to `runs-random-2026-10-20.jsonl`. The estimate is 3 to 5 hours on 4 cores, longest for `accel-*`, `chip-*`, `eda-*` and `simdesign-*`. Then rebuild `audit.json` and update the numbers here and in the post.
2. **Clear the 9 setup errors:**
   - run `sh fetch_pdk.sh pdk` in `accel-pdkprice` and `accel-ihpprice`, and in `accel-gatedprice`, whose error message points at a `fetch_pdk.sh` it does not have;
   - re-run the other accel projects with `--readme` so the feature-file arguments are passed;
   - install `yowasp-yosys`/`yowasp-nextpnr-ice40`, or the native tools, for `accel-fpga` and `accel-planefpga`.
3. **Re-run the 6 timeouts serially** with 2,400 s, as `swe-audit` did, and install `verilator` for `chip-rtl-probe`.
4. **Run the remaining 530 test suites**, and fix the 4 failures:
   - give `appeal-panels` a tolerance;
   - make `chip-rtl-*` skip without `verilator`;
   - fix `forgetting-audit`'s collection error.
5. **Run research tests in CI.** Adding a `pytest` job for changed projects to `.github/workflows/research-ci.yml` would catch breakage that nothing catches now.
6. **`ambient-bandit`:** replace `multivariate_normal` with an explicit Cholesky draw, or record the numpy version in `results.txt`, then regenerate it.
7. **Commit outputs** for the projects whose README numbers cannot be traced. The earliest four can redirect their stdout to `experiments/results.txt`.
8. **Second rater.** Have a second agent or a person label the same 40 projects blind, so the input-basis shares have an agreement figure. Label 40 more for tighter intervals.

## Limitations

- **Coverage.** Re-runs cover 103 of 761 projects, and the tests cover 231, mostly the start of the alphabet. The 9 random-order re-runs are an unbiased but tiny sample; the alphabetical ones are not random. The pooled reproduction rate leans on `swe-audit`'s seeded samples, which drew only from projects with the standard `run.py`/`results.txt` layout.
- **"Reproduced" means the same code, run again, prints the same thing.** It does not mean the model is right, the code is bug-free, or a different implementation would agree.
- **The number trace is a lower bound on traceability, not an error rate.** It misses derived values and integer rounding by design, to keep the chance rate near 5%.
- **One rater.** The hand labels are a single AI reviewer's. The main session spot-checked two rows against the files.
- **The auditor is the same kind of agent that wrote the research.** Nothing here has been reviewed by a person.
