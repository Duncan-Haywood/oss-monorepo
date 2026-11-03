# Research instructions

`research/` is the open research portfolio: one directory per project, MIT licensed
(`research/LICENSE`). The standing brief is the research track of the prompt system:
[`prompts/research/`](../prompts/research/), routed by the master prompt (`prompt.md`), with
the goals and research guardrails in [`prompts/goals.md`](../prompts/goals.md). The root `CLAUDE.md`
is about the product portfolio under `ventures/`; its session gate, usage tracking,
disclaimers and venture rules do not apply to work that stays inside `research/`.
Its public-repository rules and its landing rules ("Every session lands its own work":
open the PR, merge it yourself, run `unlanded_work.py`) do.

**Aim at PhD level and beyond** (owner, 2026-10-24: "phd + in ambition and scope. deeper
projects and research. publishable ... look at deeper harder more impactful problems", and
"increase the requirements"). The unit of work is a **programme**: one hard, open question
pursued across sessions until it yields a paper ready for a named venue. A run advances an open
programme by default, or opens one with a proposal to the bar; steps go inside the programme
rather than into new slugs. The bar, the open programmes and how a run picks one are in
[`PROGRAMMES.md`](PROGRAMMES.md); `research/_shared/programme_check.py` (research CI) holds new
directories to it. The tracks in [`PROJECTS.md`](PROJECTS.md) say which areas programmes come from.

**PhD+, with deep-tech applications** (owner, 2026-11-01: "move the research into phd+ level
with applications in deep tech applications"). New effort goes to programmes whose answer an
engineer in chips, robotics and autonomy, sensing, energy, construction or heavy equipment would
act on, aimed at a main-track venue or the field's journal, with theory checked on real data or
industrial-grade open tools and an artefact a practitioner can adopt. What that means and what
it does not: `prompts/goals.md`, "Direction: research at PhD+ level, aimed at deep tech".

**SEO is a top priority here too** (owner, 2026-10-16; `prompts/goals.md`). A
project's `README.md` and its page should open with the question it answers and
its headline result in the words a searcher would use, and link to each other.
Honest results still come first: never overstate a finding to rank.

**Research work lands here.** `research/` is a peer of `ventures/`, not a copy of anything.
It was merged in from `oss-research-monorepo` with its full history (`git log -- research/<slug>`
shows each project's original commits), and the mirror that kept the two in step was retired at
cutover on 2026-10-16. That repository is read-only history: build, edit and land research
here, in this repository's pull requests.

## Every run ships something useful

Set by the owner on 2026-10-15. A run that ends without doing anything useful
has wasted the compute budget. Every run lands at least one thing of real value
on `main`, such as a research result, a new or improved project, an open-source
tool, or a write-up that uses real data to tell the owner something new. "Nothing
to do", a blocked milestone, an empty track, or finding that your task already
landed means looking wider, not stopping. Advance a programme in `PROGRAMMES.md` (a
proof, a stronger baseline, a real-data check, a paper section), and if none
fits, open a new one with a proposal. It can be academic or industry research, an
open-source tool, a product, marketing, or anything else. Restated blockers and
re-verifying unchanged work do not count. The research integrity rules still
apply: never fabricate a result to have something to ship.

## Run the numbers; don't stylise them

Set by the owner on 2026-10-21: "fabricated results portrayed as stylised is
stupid and lazy. I can't imagine a reason not to run the numbers oneself ...
generally a bad practice. research and cite and build and test." By then 664 of
the 825 homepage summaries called themselves "Stylised", many because "every
parameter is a round figure I chose" or "an assumed placeholder". Labelling an
invented input is honest; inventing it when the real figure was findable is
the problem. So, by default:

- **Research:** take each parameter that drives a headline result from a
  datasheet, paper, standard or public dataset, and cite it at the point of use
  (a `params` table with a source column works well).
- **Build and measure:** where a number can be produced by running real code
  (a simulator, a solver, a benchmark, a profiler), run it rather than assume it.
- **Test:** check the results against a published figure or an analytic case
  before you report them.
- **When nothing exists,** sweep the plausible range and report whether the
  conclusion survives, instead of picking one figure.

"Stylised" stays as a disclosure for what genuinely cannot be measured, never as
the plan. A summary that says "Stylised" also says which inputs are not from a
source and why.

**Cloud sessions: data hosts and long jobs.** Data hosts often 403 through the
egress proxy, and foreground calls time out at 120 s. Probe a host before
planning on it, start multi-minute jobs with `run_in_background`, and for a
dataset that lives in a public GitHub repo, attach it with `add_repo` and read
it from there. Details: [`.github/prompts/cloud-session.md`](../.github/prompts/cloud-session.md),
"Outbound hosts" and "Long commands".

**Parallel simulator runs.** `wntr`'s `run_sim` writes `temp.*` files in the
cwd, so `multiprocessing` over EPANET runs collides: pass a distinct
`file_prefix` per process.

## Keep the research homepage up to date

The research homepage is generated by `research/_homepage/build.py` and published at
`/research/` on the repository's GitHub Pages site, alongside the product catalogue
(`platform/pages/publish-branch.sh` and `.github/workflows/portfolio-pages.yml` build it).
Nothing under `_homepage/` is published directly; the build writes
`research/_homepage/_site/index.html` (gitignored).

Sources:
- `_homepage/projects.json` — themes (id, name, blurb), the `featured` slugs, and per project:
  `slug`, `title` (a question the project answers), `summary` (the abstract, HTML).
- `research/README.md` — each project's bullet is reused as the card's one-line lede.
- `research/<slug>/` — test counts are the `def test_` functions in its `test*.py` files.
- `research/<slug>/LOG.md` (optional) — an ongoing project's research log: `## <date> · <title>` entries, newest first, with bullets. The project page shows it under "Research log" and the homepage lists every project that has one.
- `_homepage/template.html` — layout, styles and search script. `_homepage/project.html` — the per-project home page (`_site/<slug>/index.html`); it shows the first image under the project's `experiments/` if there is one, a breadcrumb through its theme, previous/next and six more projects from the same theme. `_homepage/topic.html` — one page per theme (`_site/topics/<id>/index.html`) listing its projects; a project's theme is where a reader browsing for it will look, so pick it with care.

Directories under `research/` whose names start with `_` or `.` are not projects.

Whenever you add, rename or remove a project under `research/`, or change its headline
results, in the same commit:

1. Update its bullet in `research/README.md`: ``- [`research/<name>`](<name>) — one-line summary.`` (for a project with a `lede` in its `project.json`, edit the `lede` and run `python3 platform/ci/research_live_links.py --write` (step 4); the bullet is generated, `build.py` has no such flag).
2. **New project:** write its card as `research/<name>/project.json` (`theme` = a theme id from `projects.json`, plus `title`, `summary` and `lede`, the one-line README bullet text); it is appended to that theme and touches no shared file, so concurrent research PRs do not conflict (`_homepage/registry.py`). Existing projects keep their entry in `_homepage/projects.json`; edit it there, appended to the `projects` list of the theme (an item of top-level `themes`) it fits best; entries carry no theme key:
   ```json
   {"slug": "<name>", "title": "Question the project answers?",
    "summary": "Plain-language abstract with the key quantitative results and the model's main limitations, naming any input that is assumed rather than sourced."}
   ```
   The summary is HTML: use entities for maths (`&minus;`, `&radic;`, `&times;`, `<sub>`, `<sup>`, `<em>`).
   No need to write the test count; the build adds it. Add a new theme only if several projects
   need it, and give it a `--t-<id>` colour in both the light and dark blocks of `_homepage/template.html`.
3. Run `python3 research/_homepage/build.py` and make sure it prints `ok`. It fails if any
   `research/` project is missing from `projects.json` or `README.md`, or if either lists one
   that no longer exists. `.github/workflows/research-ci.yml` runs the same build on every
   pull request that touches `research/`. Open `research/_homepage/_site/index.html` to preview.
4. Run `python3 platform/ci/research_live_links.py --write` (a project README needs a `**Live page:**` line) and `python3 platform/ci/check_md_links.py` (README links to figures or files not yet generated fail it). Both fail a PR in CI.

Tests and figures may need packages the image lacks, and plain `python3` may lack what another
interpreter on the box (e.g. `/usr/bin/python3.13`) has. Stdlib-only projects need nothing; for the rest,
from the repo root, `PY=$(python3 platform/ci/pyenv.py pytest numpy matplotlib)`, then use `"$PY"` instead of
`python3` (it returns at once when an interpreter already imports everything; stdout is only the
interpreter path, and it can differ from the default `python3`).
First use can build a venv and install packages: 20s to over 2 minutes (5 reports of a 120s foreground timeout), install chatter on stderr. Run it with `run_in_background` and read its stdout when it exits. The same goes for any `run.py` or experiment that may pass 2 minutes (foreground calls time out at 120s).
The clone is shallow (about 50 commits). If you need history (claim checks, "what changed since", git-based studies), start `git fetch --unshallow origin main` with `run_in_background` at the beginning; it took 2 to 15 minutes and up to ~5 GB in recent runs (`prompts/runs/*.json` friction), so avoid blocking on it. Content reads (`git show origin/main:<path>`) work without it.
Two more traps from run friction: multiprocess GP/BLAS experiments need `OMP_NUM_THREADS=1` (one run lost 30 min to oversubscription), and check `python3 -c 'import torch'` before asking `pyenv.py` for torch (the system python often has it; a `pyenv.py ... torch` call pulled CUDA wheels for 35+ min in one run). When no interpreter has `torch`, run `PY=$(python3 platform/ci/pyenv.py torch numpy)` in the background (since 2026-10-28 it installs the CPU wheel from download.pytorch.org, about 2 min when that host is reachable; three runs on 2026-10-30 found the proxy refusing it, so expect 18 to 25 min and keep other work going meanwhile; a plain `pip install torch` pulls PyPI's ~3 GB CUDA build, 25 to 35 min; `PYENV_TORCH_CUDA=1` opts out). Never use torch in the foreground until the job prints DONE. Wait on a background job with `python3 platform/ci/wait_for.py out.log` (end the command with `; echo DONE`, since pip prints no marker; or `--until "<cmd>"` for a job with no marker): the hooks block `sleep` and `pgrep -f`.
EDA/chip projects also need `yosys` and `iverilog`, which the image lacks:
`apt-get update -qq && apt-get install -y yosys iverilog` (about a minute; checked 2026-10-18).
Papers need `pdflatex`, also absent: `apt-get update -qq && apt-get install -y texlive-latex-recommended texlive-fonts-recommended` (about 10 min, so start it with `run_in_background` at the beginning; install fails without the `update` first; 2 reports 2026-10-26).

A new `experiments/figure.py` that draws a line plot from `results.txt` should import
`research/_shared/linefig.py` (`table`, `write_lines`; stdlib only, example:
`research/workcell-twin/experiments/figure.py`) instead of copying its ~80-line plotting function again.
