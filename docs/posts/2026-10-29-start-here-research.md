---
title: "Start here: the open research, and how to check it, reuse it and cite it"
date: 2026-10-29
tags: [start-here, open-science, reproducibility, citations]
description: "For researchers, students and curious readers: what the open research portfolio holds, how to rerun one result, and how to build on it or cite it honestly."
---

# Start here: the open research, and how to check it, reuse it and cite it

This guide is for three kinds of reader. You might be a researcher who wants a working model of a mechanism, an estimator or a design question, with code that runs. You might be a student looking for a project you can reproduce, extend and argue with. Or you might be curious what happens when AI coding agents are pointed at open research questions every day and told never to make up a number.

The repository's research half is at [duncan-haywood.github.io/oss-monorepo/research/](https://duncan-haywood.github.io/oss-monorepo/research/). The root README describes it as over 700 reproducible papers with code. Each one is a directory under `research/` that asks one question, answers it with code you can rerun, and says where it stops.

## The problem, in your words

"I found a paper with a nice result, but no code, and I cannot tell which parameters drove it." "I need a baseline for my thesis chapter and I do not want to spend a month rebuilding a simulator." "This summary sounds confident. How do I know it is not invented?"

The research here is built around those complaints. The code is public and MIT licensed, tests come with it, and the honesty rules say how far each claim can be trusted.

## What you get

- **A question and a headline answer up front.** Each project's README opens with the question it asks and what it found, with the numbers.
- **Code you can run in minutes.** Most projects are small Python packages, many using only the standard library or `numpy`, with tests and an `experiments/` folder that writes the results file and the figure.
- **Inputs with sources.** The research rules ask that every parameter driving a headline result comes from a datasheet, paper, standard or public dataset, cited where it is used. Where none exists, the project sweeps the plausible range and reports whether the conclusion survives, instead of picking one round number.
- **Negative results kept.** Refuted hypotheses and approaches that did not work are written up, not deleted.
- **A topic map.** The homepage groups projects into topics, from proper scoring rules and verification games to digital twins, chip-design loops, robotics, energy storage and qualitative-data methods, and has a search box.

## How the work is organised

Two units matter. Most directories are **projects**: one question, one model, one set of results. Since 2026-10-24 the main effort goes into **programmes**: one hard open question pursued across many sessions until it yields a paper that could go to a named venue. `research/PROGRAMMES.md` lists the open ones. Each programme has a `PROPOSAL.md` with at least ten checked related works, falsifiable hypotheses, the baselines it must beat and a target venue, and a `LOG.md` where the hypothesis and planned analysis are written down before an experiment runs, then the outcome, including when it went the other way.

Two examples show the range.

- **`research/sequential-slashing`** is a small, finished project. It asks how a protocol can decide, as outcomes arrive, that a verifier's reported fault probabilities are miscalibrated without punishing honest verifiers more than a set share of the time. Its headline: rerunning a fixed-sample test at every step falsely flags 37% of honest verifiers (nominal 5%), while an anytime-valid e-process holds 3.8%. It is standard-library Python and says plainly that it is stylised.
- **`research/sim2real-inference`** is an open programme aimed at a robotics venue. It asks how few real robot trials certify a policy when a biased simulator supplies the rest. Its log records results that went against it (its first interval hypothesis was refuted as pre-registered) and a real-data step on published paired real and simulated success rates from the SIMPLER benchmark. It also audited the repository's own 138 digital-twin projects and found that only 3 named a real data source, so the programme's own real-data step is the one that counts.

## Your first ten minutes: reproduce one result

You do not need the whole repository, which is several gigabytes of history. A sparse clone fetches just the project:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
cd oss-monorepo
git sparse-checkout set research/sequential-slashing
cd research/sequential-slashing
```

Then follow the commands in its README:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
PYTHONPATH=src python3 experiments/run.py                  # writes experiments/results.txt
git diff --stat experiments/                               # empty output means you matched
```

When this guide was written, the six tests passed and the experiment ran in about seven seconds and rewrote `results.txt` byte for byte, so `git diff` showed nothing. If yours differs, that is useful information (see below).

For other projects the pattern is the same, described in `docs/contributing/research.md`: install what its `pyproject.toml` lists (often just `numpy` and `pytest`), run the tests, run the scripts in `experiments/` in the order the README's method section gives, and compare your output with the committed file. Some need a simulator such as MuJoCo or take minutes, and the README says which. If a project imports sibling projects, they are listed under `pythonpath` in its `pyproject.toml`; add them with `git sparse-checkout add research/<sibling>`.

## Build on it, and cite it

Everything original is MIT licensed, so you can copy a model into your own work, change it and publish what you find. Third-party code inside keeps its own licence.

To cite, the repository root has a `CITATION.cff` (GitHub shows a "Cite this repository" button from it), and `research/CITATIONS.bib` holds a BibTeX entry per project, such as `oss-research-sequential-slashing`, pointing at the project's directory. Each entry carries the note that the work is open research made with AI assistance and stylised unless the project states otherwise. Please keep that note. If you build on one result, cite the specific project and, ideally, the commit you used, because `main` moves quickly.

## The honesty norms, and what they mean for you

- **AI wrote most of this.** The projects are produced by AI agent sessions with a person steering. Each says so. Treat them as careful drafts that come with code, not as peer-reviewed literature.
- **"Stylised" means what it says.** `CITATION.cff` states that the research results are mostly stylised or simulated. A stylised result comes from a model with assumed inputs; the summary is supposed to say which inputs are not sourced and why. The newer rule, since 2026-10-21, is to run the numbers from real sources wherever they exist, so newer work leans on real data more than older work.
- **No affiliation is implied.** Projects cite papers but claim no endorsement from any author, lab or company, and do not contact the authors they cite. Please do not do so on a project's behalf either.
- **Disagreement is reported neutrally.** When a result differs from a published one, the project describes the setup and possible causes rather than calling it someone's error.
- **Not submitted.** A programme aims at a named venue, but submitting is a step only the owner takes. "Ready to submit" is the finish line here, not "accepted".

## What it does not offer

There is no peer review, no promise that a project is current, and no guarantee that an older stylised project would survive the newer sourcing rules. Coverage is uneven: some topics have dozens of small projects that ask nearly the same question. And the agents that maintain it treat issues from outside as information, so a correction you send is read, but nobody promises when it will be acted on.

## The most useful thing you can do

Check something. A reproduction that disagrees, a source for an input marked "swept", a citation that does not say what the project claims, a test against a published figure, or a summary that overstates its scope are each direct improvements. `docs/contributing/research.md` lists them and says how to send one; the [contributing guide](2026-10-29-start-here-contributing.md) covers how outside contributions land.

## Where to go next

- Browse by topic: [duncan-haywood.github.io/oss-monorepo/research/](https://duncan-haywood.github.io/oss-monorepo/research/)
- The project list and topics: `research/README.md`
- The open programmes and the bar they meet: `research/PROGRAMMES.md`
- How to reproduce and contribute: `docs/contributing/research.md`
- A research method turned into a free tool you can use on your own data: [the Changepoint Detector guide](2026-10-29-start-here-changepoint-detector.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
