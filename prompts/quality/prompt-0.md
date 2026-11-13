# Quality track, prompt 0

An independent audit of the repository's own work: of what it attempts, what
is finished, correct and at the level a senior professional in that field
would sign off on. The master prompt (`prompt.md`) routes about 20% of runs
here (`routing.json` weight 0.20). The owner, 2026-11-07: "a category in the
blog for measuring objective quality of the work of this repo in general like
correctness and quality. On the things it attempts what is actually getting
finished and accomplished to a high senior expert professional level or
higher. This should be ongoing and very thorough." And 2026-11-10: "direct a
lot more work to quality audits. more detail in it. and also reflections on
what parts of the process seem to make the quality drop off and suggested
fixes to the process. ongoing thing full repo quality reviews. detailed
metrics on quality and correctness." The goals and guardrails in
[`prompts/goals.md`](../goals.md) bind every version of this prompt.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

## What to do

The programme, rubric, schema, taxonomy and modes are in
[`portfolio/quality/README.md`](../../portfolio/quality/README.md). Read all
of it. Then run `python3 platform/ci/quality_audit.py mode`. It names
today's mode, and you do that one.

### `sample` and `census`: audit subjects

1. Draw the subjects with `sample` (the stratified random round) or
   `census --n 6` (never-audited subjects first, so the whole repository gets
   covered over time; set `"drawn_by": "census"`). If an open `quality:` PR
   already audits a subject you drew, use `--seed <date>-b`.
2. Audit each subject against the seven dimensions, with the detailed fields
   the README requires (`checks`, `mutations`, and a category, origin and
   `where` on each defect). The audits are independent, so running one agent
   per subject in parallel fits. Give each agent the README and its subject,
   and have it write `portfolio/quality/audits/<date>-<subject>.json`. Read
   every file they write, and recompute at least one of their checks yourself
   before you accept it: the auditors are the same kind of agent that wrote
   the work.
3. Run `validate`, then `summary --md` and `metrics --md`.
4. Fix what is small and safe, each fix in its own commit with a test that
   would have caught it, and list the PR in that audit's `fix_prs`. Put
   large defects in the subject's ROADMAP or README "Known gaps" with the
   audit file linked. Do not raise a score for a fix made in the same round.
5. Write the round's post, `docs/posts/<date>-quality-audit-round-<n>.md`,
   tagged `quality-audit`. Lead with the number (how many sampled subjects
   met the bar, with the interval; for a census round, say it is not a random
   sample), then each subject's verdict and worst defect, then what changed
   since the last round.

### `fix`: work the queue

`queue --severity high` (then `medium`) lists the open defects, worst first.
Take as many as the session allows, starting at the top. For each one, fix
it, add the test or check that would have caught it, and add the PR to the
audit's `fix_prs`. Then re-audit the subject in a new audit file with
`"drawn_by": "fix"`, so the trend shows whether the fix held. If a defect is
wrong (for example, the served page is fine), note that in a new audit file;
never edit the old one. The post says how many defects were closed and which
ones remain.

### `reflect`: where quality drops off

Read `metrics --md`, the latest reflection in `portfolio/quality/reflections/`
and the process docs that the worst defect categories point to. Write
`reflections/<date>-<slug>.md` covering:

- what each earlier fix did to its metric;
- where in the process quality is lost now, ranked by evidence;
- for each place, a process fix and the metric it should move, with its
  current value.

Ship the fixes you can (tooling, a check, a template). File the rest in
`prompts/process/backlog/`. Changes under `.github/CODEOWNERS` paths go in
their own small PR. Also write a blog post.

## The bar for this track's own work

- Every score above 1 rests on a command that was run; reading code alone
  caps `correctness` at 2.
- A finding a reader cannot check from the audit file is not a finding. Check
  the served page before filing a defect about deployed URLs.
- Never soften a score to spare a project, and never inflate one because the
  work was hard. "Score the gap, not the effort."

Record the run with `--track quality`. Its `notes` must carry the mode, the
seed, the subjects, the share meeting the bar, the defects closed and the fix
PRs, so the review track can tell whether this share of runs pays for itself.
