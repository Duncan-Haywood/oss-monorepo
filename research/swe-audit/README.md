# Do the portfolio's committed results reproduce when the code is re-run?

Milestone 2 (`swe-audit`) of track 10, the software-engineering loop, **first pass**. Track 10's metric is valuable, correct projects per unit of compute, and correctness needs an estimate of how often a merged project's numbers are wrong. This project measures the cheapest slice of that: does re-running a project's experiment give its committed output? It does **not** check citations, claims or code quality. Produced with AI assistance (Claude). No language model is used in the measurement.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-audit/

## Result

A seeded random sample of 40 of the 386 projects that ship both `experiments/run.py` and `experiments/results.txt` (seed 20261015) was re-run, one clean copy each, with a 300 s limit and four jobs in parallel. Full table: `experiments/results.txt`.

| outcome | projects |
|---|---|
| byte-identical to the committed `results.txt` | 34 |
| differs in one timing line only | 2 (`garment-nesting`, `garment-markercost`) |
| timed out at 300 s | 3 (`ambient-drvalid`, `simdesign-fidelity`, `simdesign-llm`) |
| could not run here | 1 (`ambient-pipeline`: needs `/tmp/amb/models/voice.onnx.json`, a voice model not in the repository) |

- **Reproduced: 36 of 40 = 90%, 95% Wilson interval 77% to 96%.** Of the 36 that finished, 34 were byte-identical (95% interval 82% to 98%).
- **No sampled project that finished gave different numbers.** The four others are inconclusive, not failures. Re-running the timeouts alone and without parallel load would settle three of them.
- **Not independent of the environment.** The first pass, with fewer packages installed and no access to sibling projects, reproduced only 26 of 40. Nine of those failures were missing Python packages, or a README-documented `PYTHONPATH` into a sibling project (for example `garment-markercost` needs `../garment-nesting/src`); the harness now links all sibling projects. A project that needs `scikit-fem`, `mujoco`, `scikit-learn` or `psutil` fails in a bare container, and not every README lists them.
- **README numbers.** Of 713 decimal numbers in 35 sampled READMEs, 604 (85%) appear verbatim in a committed results file. The remainder are derived values (ratios, differences), rounded differently, or prose, so this is a traceability measure, not an error rate. Per-project shares are in `experiments/results.txt`.

## Second sample (2026-10-15)

A second seeded sample of 60 projects (seed 20261016, 600 s limit, the scientific packages installed, `python3 experiments/run.py 60 20261016 600`) is in `experiments/results2.txt`. 8 projects are in both samples, so the two together cover 92 distinct projects; for those 8 the table below uses the second run.

| outcome (92 distinct projects) | projects |
|---|---|
| byte-identical | 79 |
| differs in one timing line only | 2 |
| timed out | 5 (`ambient-drvalid`, `simdesign-dfm`, `simdesign-fidelity`, `simdesign-llm`, `simdesign-patchsearch`) |
| could not run here | 6 (`yosys` missing: `chip-ppa-script`, `chip-systolic-p32`; `mujoco` missing: `robofab-insert`, `robofab-slipcrit`, `robofab-sliprate`; the `piper` voice model: `ambient-pipeline`) |

- **Second sample alone:** 51 of 60 reproduced (85%, 95% Wilson 74% to 92%); all 51 that finished were byte-identical.
- **Pooled, 92 distinct projects:** 81 reproduced = 88% (Wilson 80% to 93%). Of the 81 that finished, none gave different numbers (Wilson 95% to 100% for "no differences"). Still, no project in either sample ran to completion and gave a different answer.
- **Every non-reproduction is an environment gap, not a changed number.** Missing tools (Yosys, MuJoCo, a voice model) and run time over the limit account for all 11. Four of the five timeouts are `simdesign-*` finite-element studies and one is `ambient-drvalid`, whose README says about 50 minutes.
- **README traceability, second sample:** 731 of 925 decimals (79%) appear verbatim in a committed results file over 58 READMEs, against 85% in the first sample. Same caveat: derived values and prose are counted as misses.

## Serial re-run of the five timeouts (2026-10-16)

The five projects that timed out in the two samples were re-run one at a time, no other load, with a 2,400 s limit (`python3 experiments/rerun_timeouts.py 2400 <slugs>`; output in `experiments/results3.txt`, and `experiments/results4.txt` for `simdesign-llm`).

| project | outcome | wall time |
|---|---|---|
| `simdesign-fidelity` | differs in timing lines only (13 lines) | 304 s |
| `simdesign-llm` | byte-identical | 1,333 s |
| `simdesign-dfm` | byte-identical | 518 s |
| `simdesign-patchsearch` | differs in one timing line only | 1,504 s |
| `ambient-drvalid` | byte-identical | 324 s |

- **All five reproduced; none gave different numbers.** They had only run out of time under four parallel jobs. Pooled over the 92 distinct projects, **86 reproduced = 93% (95% Wilson 86% to 97%)**, and none of the 86 that finished gave different numbers. The remaining 6 are still environment gaps (Yosys for `chip-ppa-script` and `chip-systolic-p32`, MuJoCo for three `robofab-*`, and the `ambient-pipeline` voice model); the MuJoCo projects were not re-run here.
- A first attempt at `simdesign-llm` in this pass failed with `No module named 'cma'`: the package was missing from the auditing container, not from the project (its README lists `cma`). `results4.txt` is the re-run after installing it; `results3.txt` still shows that first, failed line.
- Wall times are from one container and shift with load; `ambient-drvalid` ran in 324 s here against a README estimate of about 50 minutes.

## MuJoCo projects re-run (2026-10-17)

The three projects that could not run in the samples because `mujoco` was missing were re-run serially with `mujoco` 3.16.0 installed (`python3 experiments/rerun_timeouts.py 1200 robofab-insert robofab-slipcrit robofab-sliprate`; output in `experiments/results5.txt`).

| project | outcome | wall time |
|---|---|---|
| `robofab-slipcrit` | byte-identical | 56 s |
| `robofab-sliprate` | differs in one line: the committed file records `MuJoCo 3.15.0`, the re-run `MuJoCo 3.16.0`. Every number is identical (checked with `diff`). | 10 s |
| `robofab-insert` | timed out at 1,200 s, inconclusive | 1,200 s |

- **No MuJoCo project gave different numbers.** The one `differs` is a version banner, which the harness's timing heuristic does not recognise; it is the first non-timing diff the audit has seen, and it is a tool-version stamp, not a changed result. Treat a version line as benign when classifying.
- The same 92 distinct projects now stand at 88 reproduced numerically (96%, Wilson 89% to 99%); `robofab-insert` (timeout), the two Yosys projects and `ambient-pipeline` remain unresolved. Still no project has finished and given different numbers.

## Method

`src/swe_audit/audit.py`. Candidates are projects with both files. For each sampled project, the harness copies it to a temporary directory next to symlinks to its siblings, sets `PYTHONPATH` to its own `src` then every sibling's `src`, runs `python3 experiments/run.py` and compares the rewritten `results.txt` with the committed one. Classes: `identical`; `timing-only` (every differing line mentions time or seconds); `differs`; `timeout`; `tool-missing` (import or file error); `crashed`. Rates use Wilson (1927) intervals, as in `swe-ledger`. Nothing in the repository is written.

## Reproduce
```bash
pip install numpy scipy matplotlib scikit-learn psutil scikit-fem mujoco shapely
cd research/swe-audit
PYTHONPATH=src python3 -m unittest discover -s tests   # 6 tests, under a second
python3 experiments/run.py 40 20261015                 # about 10 minutes on 4 cores; rewrites experiments/results.txt
python3 experiments/run.py 60 20261016 600 > experiments/results2.txt   # second sample, about 20 minutes on 4 cores
```
Wall times in `results.txt` depend on load, and the timeouts in particular may differ on another machine.

## Limitations
- 92 distinct projects in two samples, one container. The second sample ran with more packages than the first, so the two rates are not strictly comparable.
- (First sample:) 40 projects. The sample is dominated by older projects without a track prefix (20 of the 40, mostly pure-Python `*-twin` studies), so the rate says little about the compiled-tool projects (Yosys, OpenROAD, Verilator), which cannot run here and are not candidates unless they ship `run.py` and `results.txt` and run without those tools.
- Matching output shows the code is deterministic and unchanged, not that the model or the conclusion is right. A project can reproduce perfectly and still be wrong.
- Projects without `run.py` or `results.txt` are not audited. Citations, the README claims beyond the 85% traceability count, and the CI-failure counts that `swe-ledger` flagged are not checked.
- The timing heuristic can hide a real change on a line that mentions time.

## Next steps
Re-run `robofab-insert` alone with a limit above 1,200 s, and make the harness ignore tool-version banner lines. Add a citation check (does the paper exist, are authors, venue and year right) on a smaller random sample, which needs web access this container lacks. Report defect rates by track and model once the sample reaches about 100 and the model per project is recoverable from `Co-Authored-By` trailers. Fix the READMEs that omit a needed package.

## Builds on
Wilson (1927), "Probable inference, the law of succession, and statistical inference", *JASA* 22(158): 209&ndash;212, for the interval. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Owner steps
None.

## Outside dependencies
Python 3 standard library for the harness; the audited projects bring their own (numpy, scipy, scikit-learn, scikit-fem, mujoco and others). A model file for `ambient-pipeline` is not in the repository.

MIT.
