# Research programmes: raising the research bar to PhD level

Agent report, 2026-10-24. Owner's request: "phd + in ambition and scope.
deeper projects and research. publishable", then "increase the requirements".
Post: [`docs/posts/2026-10-24-from-a-thousand-projects-to-a-few-programmes.md`](../posts/2026-10-24-from-a-thousand-projects-to-a-few-programmes.md).

## Measurements (this checkout, `origin/main` at 91bffed1)

- 1,040 project directories under `research/` (excluding `_*`).
- Python lines per project (`find <dir> -name '*.py' | cat | wc -l`): median 296,
  90th percentile 485, 2 projects at 2,000 or more.
- `LOG.md` research logs: 2 projects.
- Clusters: 133 directories matching `*-twin`, `twin-*` or `mimic-twin*`; 58
  `simdesign-*`, of which more than 20 study the same laser-cut bracket's mesh
  and buckling behaviour.
- 293 projects have a `paper/` directory (white papers), so writing was never
  the gap. The gap is the scope of the question.

## Why the old instructions produced this

Three defaults, each reasonable alone, combined with about sixteen runs an hour
(`prompts/steering.md`, "Amplification"):

1. Free choice: "Pick something you can finish and land in one run."
2. Landing: "One project per pull request. Keep it small enough to merge in this run."
3. Picking: follow-ups to a track's latest project each got a new slug, so a chain
   of follow-ups became a chain of directories. The existing micro-variant warning
   only told runs to ask "a new question", which made another directory.

## What changed

| File | Change |
|---|---|
| `research/PROGRAMMES.md` (new) | The bar for proposals and finished programmes, how a run works on a programme, the open-programmes table (5 rows). |
| `research/sim2real-inference/` (new) | First programme: `PROPOSAL.md` (13 references, all checked: 11 by `cite_check.py`, 2 by direct arXiv API query after a 429), `LOG.md`, README, card. |
| `research/_shared/programme_check.py` + test | New directories must be a programme, name one, or justify standing alone. Existing ones are listed in `legacy_projects.txt`. Runs in `research-ci.yml`. |
| `research/_shared/pick_track.py` | Draws an open programme with probability 0.65 before the track draw. |
| `research/CLAUDE.md`, `research/PROJECTS.md`, `prompts/research/prompt-{0,1}.md`, `prompts/goals.md`, `CLAUDE.md` | Point to the bar. "One project per PR" becomes "one step per PR"; the research track goal becomes programmes reaching a submittable paper. |

## Choices and their reasons

- **A failing check, not a warning.** `steering.md` prefers warnings for
  defaults. The owner explicitly asked to "increase the requirements", and a
  warning would be read by about 400 research runs a week and acted on by few.
  It keeps a judgment escape (`"programme": "none"` plus `why_standalone`), so
  it holds a default rather than a hard limit.
- **Programmes seeded from existing clusters**, not invented topics. Each row
  names the projects it consolidates, so the first proposal starts from work
  already done.
- **Only one proposal written.** A proposal is a full session's work. The
  other four rows are invitations, and `pick_track.py` tells a run that draws
  one to write it.
- **0.65 programme share.** A guess. Track draws still feed new programmes.
  Revisit once there are run records to measure.

## What to measure next

- Python lines and sessions per programme, against the 296-line baseline.
- New `research/` directories per week. This should fall sharply.
- How many programmes reach "ready to submit". This is the real target.

## Found in passing (not fixed here)

`platform/ci/research_live_links.py` moved its base URL to `/oss-monorepo/` in
PR #9958, but `--write` adds a second "Live page" line rather than replacing
the old `/monorepo-projects/` one, and the check now flags all 1,036 research
READMEs on `main`. It is fixed in its own pull request, to keep this one
reviewable.
