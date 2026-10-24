# Post-merge review: read what landed, fix forward

Work here merges a median 22 seconds after its PR opens, and nothing reads it
first: on 2026-10-24 all 300 of the newest merged PRs had a Copilot "review"
that said its quota was spent, and the cross-review App jobs skip because the
App secrets were never set. A blocking review would hold those PRs open past
the end of the session that wrote them, and a PR whose author has left is how
branches pile up. So the review happens after the merge. The evidence is in
[`docs/reports/2026-10-24-pr-review-without-dead-branches.md`](../../docs/reports/2026-10-24-pr-review-without-dead-branches.md):
16 randomly sampled merged PRs, 10 with a real defect still on `main`, none
that a reviewer would have blocked.

This is a guideline for a session with budget to spare, or for one asked to
review. It is not a gate on landing your own work. Land that first.

## 1. Pick what to read

```bash
python3 platform/ci/post_merge_review.py queue --hours 48 --k 5
```

This lists unaudited merged PRs, high risk first (CI and trust boundaries,
then money, tax, legal and payment paths, then code, then docs), oldest first
within a tier. Each line has the curl that prints the diff. Skip a PR you
authored in this session, since a second read by the author is not the point.

## 2. Review it independently

The yield came from running things, not from reading diffs. Review against
current `main`, not the PR's head, so you only report what is still wrong:

- re-derive one number or formula the PR states, and run its tests;
- try an input the fixtures don't cover (a different length, a real-world
  separator, the other file format the reader accepts);
- check that a README's prose matches its own `results.txt`;
- where a sibling tool exists, use it as an oracle (generator against
  validator, CLI against page);
- for a test named after a guarantee, delete the guarded branch in a scratch
  copy and see whether the test notices.

Try to refute each finding before you keep it. "Nothing found" is a result.
Record it, because coverage is part of what is measured. Reviewing in a
subagent keeps the diffs out of your context. Give it the PR numbers and these
steps, not your guess about what is wrong.

## 3. Fix forward, in your own PR

Put the fixes for everything you confirmed in one PR of yours, each with a
test that fails on the old code. Open it, verify it and merge it like any
other (`land-your-work.md`). Don't reopen, revert or comment on the original
PR; its session is gone. A finding you can't fix (a judgment call, an owner
question, an external fact you can't check from here) goes in the audit note
and the PR body.

## 4. Record the audit

```bash
python3 platform/ci/post_merge_review.py record <pr> --findings <n> \
    --severity <none|low|medium|high> --fix-pr <your pr> --note "<one line>"
```

This writes one file per audited PR under `platform/ci/post_merge_reviews/`,
so concurrent sessions never conflict on a shared ledger line. Commit them in
the fix PR. `coverage --hours 168` reports the share of merged PRs audited
and how many audits found something.

## Before you merge: in-session review

When your own diff touches the high tier (a workflow, `platform/ci/agent_review/`,
the edge worker, or a page or engine that states money, tax or legal
facts), run an independent reviewer on it before you merge, in this session.
A fresh-context subagent given only the diff and step 2's checklist took
about a minute and ~27k tokens per PR in the experiment. Because it finishes
while you are still here, it cannot strand the branch. Don't wait for an
asynchronous reviewer that may arrive after you have left.
