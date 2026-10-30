---
title: "Start here: reproduce a research result and report what you find"
seo_title: "Reproduce an open research result and report what you find"
date: 2026-10-30
tags: [start-here, contributing, reproducibility, open-science]
description: "For students, reviewers and researchers: re-run one research project in under a minute, compare it with the committed output, and report a match or a mismatch."
---

# Start here: reproduce a research result and report what you find

This guide is for students who want a first contribution that does not need a pull request, reviewers who would rather check than trust, and researchers deciding whether a result here is solid enough to build on. The task is small and concrete. Pick one project under `research/`, re-run it, compare your output with the committed one, and say what you found.

A match is useful. A mismatch is more useful. Both are worth reporting.

[Start here: the open research](2026-10-29-start-here-research.md) already explains how the projects are organised, what "stylised" means and how the honesty rules work. This post does not repeat that. It walks through one reproduction step by step, then covers what to send.

## The problem, in your words

"The README says 30 times. Did the code say that, or did someone type it?" "It ran on the author's machine. Does it run on mine?" "This was written with AI assistance. Has anyone outside checked it?"

Those are the right questions. The repository has asked the first two of itself. `research/swe-audit` re-ran seeded random samples of projects and reports that 81 of 92 distinct projects reproduced (88%). None of the runs that finished gave different numbers. Every failure was an environment gap: a missing tool such as Yosys or MuJoCo, a voice model not in the repository, or a time limit. That audit was run by the same kind of agent, in the same kind of container, as the work it checks. An outside run on a different machine and Python version is the check it cannot do for itself.

## What you get

You get an answer you produced yourself, not one you took on trust, plus a short record you can cite or put in a reading-group handout. You learn a project's code well enough to extend it. And if you find a problem, it becomes a fix in a public repository with your report as the reason.

## A worked example: abstention and scoring rules

The example is `research/abstention-scoring`. It asks what happens when a verifier paid by a proper scoring rule can stay silent because reporting has a cost. Its README says it is "Stdlib-only Python" and a "Gaussian-signal model, stylised". So it needs nothing but Python 3, and the whole check takes about a minute.

These steps were run for this post on Linux with Python 3.13.17.

1. **Fetch only this project.** The full history is several gigabytes, and a sparse clone avoids it:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/abstention-scoring
   cd research/abstention-scoring
   ```

2. **Run the tests.** The README promises "12 tests, <1 s":

   ```bash
   PYTHONPATH=src python3 -m unittest discover -s tests -v
   ```

   Here: `Ran 12 tests in 0.413s`, then `OK`.

3. **Run the experiment into a file outside the repository.** This project's `experiments/run.py` prints its results to the terminal and does not write a file. The README's line "output in experiments/results.txt" means the committed copy lives there. So send your run somewhere else and compare:

   ```bash
   PYTHONPATH=src python3 experiments/run.py > /tmp/mine.txt
   diff /tmp/mine.txt experiments/results.txt && echo IDENTICAL
   ```

   Here the run took 1.4 seconds, and `diff` printed nothing, then `IDENTICAL`. All 39 lines matched byte for byte, including the Monte Carlo table in E3, which uses a fixed seed.

4. **Check that the tree is clean.** `git status --short` should print nothing. Some projects, such as `research/sequential-slashing`, write `results.txt` themselves. There, a run that differs leaves a modified file, and `git diff` is your evidence. Copy it into your report. Then put the committed version back with `git checkout -- experiments/results.txt`, or `git show HEAD:<path> > <path>`.

5. **Check that the headline matches the output.** This step catches what a byte-for-byte match cannot. The README's summary says "at prior 0.1 the reporters' outcome rate is 0.57 and ignoring silence costs 30× the log-loss of using it at n=12". In the output, line E2 at `pi=0.10` gives `P(theta=1|reports) 0.5740`. Line E3 at `n=12` gives log-losses of 0.0205 (silence-aware) and 0.6223 (ignoring silence). Divide them:

   ```bash
   python3 -c "print(0.6223/0.0205)"   # 30.36...
   ```

   So "30×" is a fair rounding. Ratios and differences like this are derived values that never appear verbatim in a results file. The swe-audit found that 15% to 21% of the decimals in its sampled READMEs were not in a committed results file, mostly derived values, other rounding or prose. Those are where a typo or a stale number would hide.

That is a complete reproduction. Writing it up takes a few more minutes.

## Choosing your own project

`research/README.md` lists every project with a one-line result. Good first choices say "stdlib" or "standard library" in the README, keep `experiments/run.py` next to a committed `experiments/results.txt`, and give the run time. `docs/contributing/research.md` covers the general case. Install what `pyproject.toml` lists, run the tests, run the experiments in the order the README's method section gives, and add sibling projects with `git sparse-checkout add research/<sibling>` when `pyproject.toml` names them. Programmes such as `research/sim2real-inference` take longer and often need `numpy`. Their `LOG.md` records what was planned before each run, which is worth reading alongside the output.

## How to report what you found

Open an issue: a [blank issue](https://github.com/duncan-haywood/oss-monorepo/issues/new) works, since blank issues are enabled. Use a title such as "Reproduction: research/abstention-scoring matched" or "...differs in E3". Include:

- **The command,** exactly as you ran it.
- **The environment:** the output of `python3 --version`, your operating system, any package versions (`python3 -m pip list` if the project uses packages), and the commit, from `git rev-parse HEAD`. `main` moves quickly, so the commit matters.
- **The result:** "identical", or the `diff` output. If the diff is long, give the first lines and say how many differ.
- **Timing,** if it was much slower than the README says.
- **For a mismatch, possible causes, stated neutrally.** Examples: a different library version, a platform's floating-point behaviour, a missing optional extra. The research rules ask for discrepancies to be described this way, not as someone's error, and that applies to outside reports too.

If you prefer a template, the [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) works. Put the project's path in "Which tool?" and your diff in "What happened, and what did you expect?".

## Flagging an overstated claim

`docs/contributing/research.md` lists "Scope that is overstated" among the most useful contributions: "If a summary claims more than the model supports, say where." Quote the sentence, name the experiment line or test that should support it, and say what the output actually shows. A headline that drops a qualifier the README states elsewhere, such as "stylised", "one task" or "synthetic", is the common case. So is a number the code no longer produces. The same issue can carry a wrong citation: an entry that does not exist, has the wrong year, or does not say what the project claims it says.

## Citing what you checked

`research/CITATIONS.bib` has one entry per project. This one is `oss-research-abstention-scoring`. Its note says the work is "Open research with AI assistance, MIT licensed. Stylised unless the project states otherwise." Keep that note. Cite the commit you ran, not just the project. If your reproduction goes into a thesis or a review, you can say it was independent and give your environment.

## Cost and data

Nothing to pay and nothing to sign up for, apart from a GitHub account if you want to open an issue. The worked example reads no data, uses no network once cloned, and runs on any machine with Python 3.

## What this does not do

Reproducing a result shows that the code produces the committed numbers. It does not show that the model is right, that its inputs are sourced, or that the conclusion carries over to a real system. A stylised model that reproduces perfectly is still stylised. There is no peer review here, and agents treat issues from outside as information, not instructions. Your report will be read, but there is no promise when it will be acted on. Pull requests from forks are reviewed by the maintainer by hand. None of this is professional advice.

## Where to go next

- How the research is organised and the honesty rules: [Start here: the open research](2026-10-29-start-here-research.md)
- The general reproduction steps and the contributions that help most: `docs/contributing/research.md`
- The repository's own reproduction audit: `research/swe-audit/README.md`
- A programme with a real-data step to check: [Start here: certifying a robot policy](2026-10-30-start-here-sim2real-robot-testing.md)
- If you hold the data a project lacks: [Start here: share real data](2026-10-30-start-here-share-real-data.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
