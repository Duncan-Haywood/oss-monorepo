# Contributing to the research

Each project is one directory, `research/<slug>/`, that asks one question,
answers it with code you can re-run, and states its limits. They are read at
`https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/`, grouped by topic.
[`research/PROJECTS.md`](../../research/PROJECTS.md) lists the tracks and
milestones the projects belong to.

The projects are written with AI assistance (each says so), which is exactly
why an outside reader checking them is valuable.

## How a project is laid out

Example: [`research/buildbot-nailseq/`](../../research/buildbot-nailseq/).

| Path | What it is |
|---|---|
| `README.md` | The question, the headline results, the method, and a table of every input with its source, or "swept" when no source was found |
| `project.json` | The title and summary shown on the research homepage |
| `src/<package>/` | The model, as an importable Python package |
| `tests/` | `pytest` tests of the model, often against an analytic case or a published figure |
| `experiments/` | Scripts that produce the results (`results.json`, `results.txt`) and the figure |
| `pyproject.toml` | Dependencies (often only `numpy`; optional extras such as `mujoco` or `matplotlib`) and, under `pythonpath`, the sibling projects it builds on |

## Reproduce a result

```bash
cd research/buildbot-nailseq
python3 -m pip install numpy pytest     # plus whatever pyproject.toml lists
python3 -m pytest -q                    # the model's tests
```

Then run the scripts in `experiments/` in the order the README's "Method"
section describes, and compare your `results.txt` with the committed one.
Some experiments need an optional extra (a simulator) or take minutes; the
README says which. If you used a sparse clone, also add the sibling projects
named in `pyproject.toml` (`git sparse-checkout add research/<sibling>`).

## Contributions that help most

- **A reproduction that disagrees.** Open an issue with your environment,
  the command, and the numbers you got against the committed ones. Different
  library versions, seeds and platforms are all useful to know about.
- **A source for an input marked "swept" or assumed.** The README's input
  table says which figures have no source. A datasheet, paper, standard or
  public dataset that pins one down is a direct improvement; say whether it
  changes the conclusion.
- **A wrong or missing citation.** Every citation is supposed to exist, have
  the right authors, venue and year, and say what the project claims it says.
  If one does not, that is a bug.
- **A check against a published result or an analytic case**, as a test.
- **Scope that is overstated.** If a summary claims more than the model
  supports, say where.

## The rules research follows

They are in [`prompts/goals.md`](../../prompts/goals.md), "Research
guardrails", and apply to your contribution too. In short:

- Every input that drives a headline result comes from a cited source, a
  public dataset, a measurement, or a run of real code. Where none exists, the
  project sweeps the plausible range and reports how the conclusion moves,
  rather than picking a round number.
- Credit every idea, method, dataset and piece of code at the point of use.
  Never copy text from a paper without quoting and citing it.
- When a result disagrees with a published one, report it neutrally as a
  discrepancy with the setup and possible causes, not as the authors' error.
- No implied affiliation with, or endorsement by, any lab, professor or
  company. Projects are not to contact the authors they cite; please don't do
  it on the project's behalf either.
- Original work is MIT; third-party code keeps its license.

## If you change a project in a PR

Keep the README's headline, `project.json` summary and the committed results
in step with what the code now produces: re-run the experiments and commit
their output, never edit numbers by hand. Then, from the repository root:

```bash
python3 research/_homepage/build.py        # must print ok
python3 platform/ci/check_md_links.py research/<slug>/README.md
```

`.github/workflows/research-ci.yml` runs the same homepage build on every
pull request that touches `research/`.
