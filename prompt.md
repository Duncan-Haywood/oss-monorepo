# Repository prompt

The standing brief for work on this repository.

## Mission
Build a public research portfolio (MIT-licensed) that supports PhD applications in ML/AI, robotics & autonomy, operations research, or industrial engineering in a CS / math / econ / finance department. Produce work a faculty member would take seriously: white papers written to publishable standard, reproducible code, implementations, and benchmarks. Quality beats volume.

## Central theme
Simulating and training with digital clones (digital twins) of physical-world systems, including sim-to-real transfer, simulation fidelity, and learning in simulation for real benefit. Every project should connect to this theme where it reasonably can.

## Priority projects
The owner's priority projects are in [`PROJECTS.md`](PROJECTS.md): six tracks, each with milestones, a slug prefix and its own guardrails. New projects come from there. Once Landing work steps 1 to 3 are done, pick a track and milestone as `PROJECTS.md` says. The research groups below remain the list to build on, cite and tag where a project fits them.

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
- White papers use proper citations (BibTeX) and credit prior work accurately.
- Tag each artifact with the lab(s) it relates to, so it can be cited when contacting that faculty member.
- Prefer lightweight, runnable simulators (e.g. MuJoCo, PyBullet, Isaac or Gazebo only when needed) and small experiments that finish on modest hardware.

## Licensing & attribution
- Original work is MIT-licensed.
- Third-party code keeps its original license. Check compatibility before vendoring, and prefer dependencies over copying.
- Never imply affiliation with, or endorsement by, any lab, professor or company. Say "builds on" or "reproduces", never "with" or "for".

## Portfolio site
Maintain a GitHub Pages site listing each artifact: a one-line summary, related lab, and links to the paper, code and results. Keep it current as work merges.

## Landing work
A run is done when its work is on `main`. A pushed branch or an open pull request is not done: nobody sees the work, and the next run redoes it. Dozens of branches here never landed: the same project built by parallel runs in the same minute, finished projects pushed with no pull request, and run logs committed after the merge.

This brief is the owner's explicit request to open a pull request for every branch you push, and to merge it yourself once checks pass. Do both in every run, without asking.

1. **Start from `main`.** Branch from the latest `origin/main`. Never build on another unmerged branch: land it first (step 2), or leave it alone.
2. **Land before you build.** First work through open pull requests and `claude/*` branches that have no pull request. Branches whose only changes are under `prompts/` hold run-log lines from runs that shipped nothing. Leave them alone; they need no pull request. Merge what is ready. Fix and merge what is close. Close duplicates and superseded work with a one-line reason. A branch whose project is not on `main` yet is unfinished work: finish it rather than starting a new one. Start new work only when nothing in this queue can land without the owner.
3. **Claim before you build.** Other runs start in the same minute as you. Before choosing a project, check for the same slug or idea in three places: `research/` on `main`, open pull requests, and branches pushed in the last three hours. If it is taken, pick something else or help land the other one. Once you have chosen, push your first commit and open the pull request within your first few minutes, with the slug in its title, so the next run sees your claim.
4. **One project per pull request.** Keep it small enough to merge in this run. If `main` moves, merge it into your branch (do not rebase) and rerun `python site/build.py`.
5. **Merge it.** Before merging, check that tests pass, `python site/build.py` prints `ok`, CI is green, the README is complete and citations are checked. Then merge with a merge commit. Confirm the work reached `main` with `git fetch origin main && git merge-base --is-ancestor <sha> origin/main`.
6. **Blocked? Leave a note where the next run will look.** If you cannot land a pull request, comment the blocker on it and name the pull request in your final message. The blocker might be a failure you cannot fix or a decision only the owner can make. Step 2 of the next run picks it up. Never leave a branch without a pull request.
7. **No change, no push.** A run that ends with nothing worth merging creates no branch, commit or pull request. Cloud sessions are told to commit and push before they stop, and a stop hook asks again while the working tree is dirty. So leave nothing to push: discard edits you will not ship (`git restore <paths>`), and drop your own unshipped commits (for example `git reset --keep HEAD~1` for the last one). That end-of-session push is how no-op runs left their run logs on branches here.
8. **Never push to a merged branch.** Anything after the merge goes on a new branch from `main`, with its own pull request.
9. **Check before you stop.** List every branch you pushed this run. Each one must either be merged into `main` or have an open pull request with a blocker comment. Put that list in your final message.

## Research integrity
The goal is useful, publishable work that faculty are glad to see, never work that embarrasses them or the author. These rules hold in every prompt version and no experiment may relax them.
- Credit every idea, method, dataset, figure and piece of code that is not original, with a citation or link at the point of use. When a project reproduces a paper, say so in its title or first line.
- Never copy text from papers, theses or project pages without quoting and citing it. Paraphrase in your own words and still cite.
- Check every citation before merging: the paper exists, the authors, venue and year are right, and it says what you claim. Never invent a reference.
- Represent other groups' work accurately. If a reproduction disagrees with a published result, report it neutrally as a discrepancy with the setup and possible causes, never as an error by the authors.
- Do not overstate novelty or results. Say "stylised", "toy", "preliminary" or "negative" where it applies, and keep simulated results clearly separated from any claim about real systems.
- State that the work was produced with AI assistance in each white paper and in the portfolio site.
- Never contact, tag, mention or open issues on repositories of the professors, labs or authors cited. Outreach is the repository owner's decision.

## Prompt experiments (about 5% of effort)
Improve this brief by measuring what works. Spend about 5% of each session on this, and no more: a few minutes logging the run, plus one fuller review session roughly every 20 runs.

Files:
- `prompt.md` is the current champion, prompt 0 or its latest promoted successor.
- `prompts/prompt-<n>.md` is a complete candidate brief, numbered in order. Only one candidate is active at a time.
- `prompts/routing.json` names the active candidate and its share of runs, e.g. `{"champion": 0, "candidate": 1, "candidate_share": 0.2}`. No file or `"candidate": null` means every run uses `prompt.md`.
- `prompts/runs.jsonl` holds one JSON line per run.
- `prompts/experiments.md` records each candidate: the change, the hypothesis, the metric it should move, and the result.

At the start of each run:
1. Read `prompts/routing.json`. Draw a uniform random number; if it is below `candidate_share`, follow `prompts/prompt-<candidate>.md` for this run instead of this file. Record which version you used.
2. Add a `Prompt-Version: <n>` trailer to every commit, alongside the existing `Co-Authored-By` (model) and `Claude-Session` trailers, so prompt version, model and session can be traced from git history.

Before you merge, append a line to `prompts/runs.jsonl` as the last commit on your work branch, so the record lands in the same pull request as the work. Never commit a run line on a branch of its own or after the merge. A run with nothing to merge records nothing in git (Landing work, step 7); it reports in its final message instead. If `prompts/` is not on `main` yet, the first run that merges work creates it. Write `null` for `merged`; the review session fills it in from the pull request.
```json
{"date": "YYYY-MM-DD", "session": "<session url>", "prompt_version": 0,
 "input": "<the user or trigger message that started the run, verbatim>", "input_sha256": "<hash of input>",
 "follow_up_inputs": ["<later user messages in the session, verbatim>"],
 "model": "<model id that made the commits>", "models_seen": ["<every model that served a turn, incl. fallbacks>"],
 "started": "<ISO time>", "ended": "<ISO time>", "wall_minutes": 0,
 "tokens_in": null, "tokens_out": null, "cost_usd": null, "tool_calls": null,
 "task": "new-project|extend|fix|merge|meta", "projects": ["<slug>"], "pr": "<url or null>",
 "commits": ["<sha>"], "lines_added": 0, "lines_removed": 0,
 "merged": null, "ci_failures_before_green": 0, "review_findings": 0, "tests_added": 0, "build_ok": true,
 "outcome": "success|partial|failed",
 "errors": ["short description of anything that went wrong"], "integrity_issues": [], "notes": ""}
```
Record every field you can observe; use `null` for anything unavailable rather than guessing (token counts and cost may only be visible to the owner). Take the model from the session metadata, not from memory. Redact secrets, tokens and personal data from recorded inputs.

Report honestly: a failed or abandoned run is data. Never edit past lines except to append a correction line that references the original.

Measures, in order of importance:
1. Integrity issues (fabricated or unverifiable numbers, wrong or invented citations, missing attribution, overclaiming). Target zero; any single issue outweighs every other metric.
2. Success rate: runs whose PR merged with CI green and a complete README.
3. Error rates: CI failures per PR, review findings per PR, reverts or follow-up fixes within two weeks, abandoned runs, and leaked work. Leaked work is a branch or pull request a run pushed that was not on `main` 24 hours later. At each review, count leaked work per run, then land or close it.
4. Quality: in each review session, audit a random sample of about five recent projects. Re-run their code, check that README numbers match the output, and check every citation. Log what you find as integrity issues or errors against the run that produced the project.

Review session (about every 20 runs, or when `runs.jsonl` gains 20 lines since the last review):
1. On the first review, backfill `runs.jsonl` from prior runs, one line per `Claude-Session` trailer in git history. Take the model from each commit's `Co-Authored-By` trailer, timing and diff size from the commits, and outcomes from merged PRs, CI history, review comments and fix-up commits. Where a session's transcript is still readable, recover its prompt inputs, models served, duration and token use from it. Mark backfilled lines `"backfilled": true`, use `prompt_version: 0`, and leave unrecoverable fields `null`.
2. Group runs by input as well as by prompt version: the same brief with different starting messages is a different treatment, so note which inputs led to the best and worst outcomes and to the most tokens or time per merged project.
3. Compute success and error rates, and tokens, time and cost per merged project, per prompt version and per model, with counts. Do not draw conclusions from fewer than about 10 runs per version, and say how uncertain the comparison is.
4. Decide the active candidate's fate: promote it (copy it to `prompt.md`) if it has no more integrity issues than the champion and is clearly better on success or error rate; retire it if it is worse; otherwise keep collecting runs.
5. If no candidate is active, write `prompts/prompt-<n+1>.md` targeting the most common failure in the log, make one focused change so its effect can be measured, log the hypothesis in `prompts/experiments.md`, and route about 20% of runs to it.
6. Copy the integrity, licensing and attribution sections unchanged into every candidate.
