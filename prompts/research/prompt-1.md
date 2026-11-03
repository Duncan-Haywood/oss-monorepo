# Research track, prompt 1

The research sub-prompt. The master prompt (`prompt.md`) routes runs here. Work stays
inside `research/` and follows [`research/CLAUDE.md`](../../research/CLAUDE.md). The goals
and the research guardrails (integrity, licensing and attribution) are in
[`prompts/goals.md`](../goals.md); they bind every version of this prompt.

## Mission
Build a public research portfolio (MIT-licensed) that supports PhD applications in ML/AI, robotics & autonomy, operations research, or industrial engineering in a CS / math / econ / finance department. Produce work a faculty member would take seriously: white papers written to publishable standard, reproducible code, implementations, and benchmarks. Quality beats volume.

**Aim at PhD level and beyond** (owner, 2026-10-24). Pick deeper, harder, more impactful problems: questions a strong PhD chapter or a peer-reviewed paper would answer, pursued across sessions as a **programme** ([`research/PROGRAMMES.md`](../../research/PROGRAMMES.md)). Step-by-step work is fine; each step serves a question of that size. By default a run advances an open programme (`python3 research/_shared/pick_track.py` draws one) or opens one with a proposal that meets the bar: checked related work, a narrow novelty claim, falsifiable hypotheses, state-of-the-art baselines, real data and a named target venue. Since 2026-11-01 the aim is PhD+ with **deep-tech applications** (chips, robotics and autonomy, sensing, energy, construction, heavy equipment): a main-track or field-journal target, theory checked on real data or industrial-grade open tools, and an artefact a practitioner can adopt (`prompts/goals.md`, "Direction: research at PhD+ level, aimed at deep tech").

## Central theme
Simulating and training with digital clones (digital twins) of physical-world systems, including sim-to-real transfer, simulation fidelity, and learning in simulation for real benefit. Every project should connect to this theme where it reasonably can.

## Priority projects
The owner's priority projects are in [`research/PROJECTS.md`](../../research/PROJECTS.md): twenty-one tracks, each with milestones, a slug prefix and its own guardrails. They are the areas research programmes come from (`research/PROGRAMMES.md`). Once Landing work steps 1 to 3 are done, draw a programme or track as `PROJECTS.md` says. The research groups below remain the list to build on, cite and tag where a project fits them.

**Free choice, about 5% of effort.** About one run in twenty skips the tracks and works on whatever the agent finds most interesting, Google "20% time" style; `research/PROJECTS.md` (Picking work, step 1) says how the draw works. The rules, integrity standards and landing steps are unchanged, and so is the quality bar.

## Research groups to build on
Read their recent papers, code and project pages. Implement, reproduce, extend, and follow up the implications of their work.

Robotics & autonomy (priority):
- ARPG, Christoffer Heckman (CS): https://arpg.colorado.edu/
  Perception, SLAM, radar/lidar, field and subterranean robotics, vision-language navigation, generative 3D occupancy and scene synthesis.
  Directions: generative digital twins of environments, sensor simulation (especially radar), sim-to-real for perception, multi-robot mapping in simulation.
- CAIRO Lab, Bradley Hayes (CS): https://cairo-lab.com/
  Task and motion planning, learning from demonstration, explainable AI, human-robot collaboration.
  Directions: learning from demonstration inside digital twins, explainable planners evaluated in simulation, simulated human models for training collaborative robots.
- HIRO Group, Alessandro Roncone (CS): https://hiro-group.ronc.one/
  Embodied intelligence, social intelligence, robots in chemistry labs.
  Directions: digital twins of lab and manipulation workcells, embodied learning in simulation, sim-to-real for manipulation.
- Autonomous Systems IRT: https://www.colorado.edu/irt/autonomous-systems/
- RECUV (unmanned vehicles): https://www.colorado.edu/recuv/
  Directions: UAV and field-robot simulation, targeted observation of severe weather, safe autonomy with verification.

## Output standards
- Each artifact lives in its own directory with a README covering motivation, which group's work it builds on (with citations), method, how to reproduce, results, limitations, and next steps.
- Never fabricate results. Report only what the code actually produced. Mark anything preliminary or negative as such.
- Run the numbers rather than assume them: source every parameter that drives a result (datasheet, paper, dataset or a real run) and cite it; sweep a range where none exists. "Stylised" discloses what cannot be measured, it is not a substitute for looking (`research/CLAUDE.md`).
- White papers use proper citations (BibTeX) and credit prior work accurately.
- Tag each artifact with the lab(s) it relates to, so it can be cited when contacting that faculty member.
- Prefer lightweight, runnable simulators (e.g. MuJoCo, PyBullet, Isaac or Gazebo only when needed). Each session's experiment should finish on modest hardware; the programme's scope should not be limited by that.
- Compare against the strongest published methods, not only a random or grid baseline, and report seeds, intervals and the tests used.

## Portfolio site
The research homepage lists each artifact: a one-line summary, related lab, and links to the paper, code and results. It is published at `/research/` on the repository's GitHub Pages site and built by `research/_homepage/build.py`; `research/CLAUDE.md` says how to keep it current. Update it in the same pull request as the work.

## Landing work
A run is done when its work is on `main`. A pushed branch or an open pull request is not done: nobody sees the work, and the next run redoes it. When the research portfolio was its own repository, dozens of branches never landed: the same project built by parallel runs in the same minute, finished projects pushed with no pull request, and run records committed after the merge.

The repository-wide protocol is [`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md): open the pull request after your first push and merge it yourself. For research work, also:

1. **Start from `main`.** Branch from the latest `origin/main`. Avoid building on another unmerged branch: land it first (step 2), or leave it alone.
2. **Land before you build.** First work through open pull requests and branches that touch `research/` and have not landed. Branches whose only changes are under `prompts/runs/` hold records from runs that shipped nothing; leave them alone. Merge what is ready, fix and merge what is close, and close duplicates and superseded work with a one-line reason. A branch whose project is not on `main` yet is unfinished work: finish it rather than starting a new one.
3. **Claim before you build.** Other runs start in the same minute as you. Before choosing a project, check for the same slug or idea in three places: `research/` on `main` (run `git fetch origin main` first and run `python3 platform/ci/research_idea_dupe.py <keywords of your idea>`, which greps every project's one-line description and slug on `origin/main`, exit 1 if one hits all keywords; the session checkout can be days stale, and one run duplicated a project that way), open pull requests, and branches pushed in the last three hours. If it is taken, pick something else or help land the other one. For a programme draw, `pick_track.py` prints a `CLAIM CHECK` of commits that touched it on `origin/main` in the last 6 hours (a sibling's merged PR no open-PR search shows). Once you have chosen, push your first commit and open the pull request within your first few minutes, with `research/<slug>` in its title, so the next run sees your claim. For a step longer than an hour (training, sweeps), re-run `pick_track.py`'s `CLAIM CHECK` for your programme just before you merge: a sibling can land the same milestone while you run, and merging `main` in then costs less than a duplicate.
4. **One step per pull request.** The programme spans many sessions; each pull request lands one step of it (a result, a proof, a baseline, a paper section), small enough to merge in this run. If `main` moves, merge it into your branch (rather than rebasing) and rerun `python3 research/_homepage/build.py`.
5. **Merge it.** Before merging, check that the project's tests pass, `python3 research/_homepage/build.py` prints `ok`, CI is green, the README is complete and every citation is checked (`python3 research/_shared/cite_check.py research/<slug>/README.md` looks up each DOI and arXiv id; open the rest). After a long run (training, sweeps), first `git fetch origin main && git log origin/main --since='<run start>' --format='%h %s' -- research/<slug>`: three runs in a day found a sibling had landed the same milestone meanwhile, and merging `main` in then means relabelling your step, not redoing it. Confirm the work reached `main` with `git fetch origin main && git merge-base --is-ancestor <sha> origin/main`.
6. **Blocked? Leave a note where the next run will look.** If you cannot land a pull request, comment the blocker on it and name the pull request in your final message. Avoid leaving a branch without a pull request: nobody else will see it.
7. **No change, no push.** A run that ends with nothing worth merging creates no branch, commit or pull request, and no run record in git. Discard edits you will not ship (`git restore <paths>`) and drop your own unshipped commits (for example `git reset --keep HEAD~1`), so the end-of-session push has nothing to push.
8. **Leave merged branches alone.** Anything after the merge goes on a new branch from `main`, with its own pull request.

## One repository
Research lands here, in `research/`, as a peer of `ventures/`. The portfolio's original repository, `Duncan-Haywood/oss-research-monorepo`, was merged in with its history intact (`git log -- research/<slug>` shows each project's original commits) and cut over on 2026-10-16; it is archived, read-only history, so push and open pull requests here instead. Its run log already sits under `prompts/runs/` here; record new runs here like any other track.

Keep every project self-contained under `research/<slug>/`, and use relative paths rather than this repository's name, URL or root paths.
