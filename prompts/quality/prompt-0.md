# Quality track, prompt 0

An independent audit of the repository's own work: of what it attempts, what
is finished, correct and at the level a senior professional in that field
would sign off on. The master prompt (`prompt.md`) routes about 5% of runs
here (`routing.json` weight 0.05; the owner, 2026-11-07: "a category in the
blog for measuring objective quality of the work of this repo in general like
correctness and quality. On the things it attempts what is actually getting
finished and accomplished to a high senior expert professional level or
higher. This should be ongoing and very thorough"). The goals and guardrails
in [`prompts/goals.md`](../goals.md) bind every version of this prompt.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

## What to do

The programme, the rubric and the procedure are in
[`portfolio/quality/README.md`](../../portfolio/quality/README.md). Read all of
it; it is short. Then:

1. `python3 platform/ci/quality_audit.py sample` draws today's subjects
   (seeded by the date: one flagship in rotation, two ventures, two research
   projects, one platform directory). Take the draw as it comes. If an open
   `quality:` PR already audits a subject you drew, use `--seed <date>-b`
   (the README, "One round", explains why seeds and flagships repeat).
2. Audit each subject against the seven dimensions. The audits are
   independent, so one agent per subject in parallel is a good fit; give
   each the README and the subject, and have it write its own
   `portfolio/quality/audits/<date>-<subject>.json`. Read every file they
   write and spot-check at least one claimed recomputation yourself before
   you accept it: the auditors are the same kind of agent that wrote the work.
3. `python3 platform/ci/quality_audit.py validate`, then
   `summary --md` for the scoreboard.
4. Fix what is small and safe in its own commit (a wrong constant, an
   unbacked claim, a missing disclaimer), with a test that would have caught
   it, and list the PR in that audit's `fix_prs`. Large defects go in the
   subject's ROADMAP or README "Known gaps" with the audit file linked. Do not
   raise a score for a fix in the same round; a later round re-audits.
5. Write the round's post: `docs/posts/<date>-quality-audit-round-<n>.md`,
   tagged `quality-audit` (the blog files it under "Quality audits"). Lead
   with the number (how many of the sampled subjects met the bar, with the
   interval), then each subject's verdict and its worst defect, then what
   changed since the last round. Say plainly what is not at the bar. No
   praise the evidence does not carry.

## The bar for this track's own work

- Every score above 1 rests on a command that was run; reading code alone
  caps `correctness` at 2.
- A finding a reader cannot check from the audit file is not a finding.
- Never soften a score to spare a project, and never inflate one because the
  work was hard. "Score the gap, not the effort."

Record the run with `--track quality`. Its `notes` must carry the seed, the
subjects, the share meeting the bar and the fix PRs, so the review track can
tell whether this share of runs pays for itself.
