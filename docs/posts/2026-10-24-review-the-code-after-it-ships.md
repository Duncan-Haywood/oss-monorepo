---
title: "Review the code after it ships: PR review for a repo that merges every 4 minutes"
seo_title: "Review the code after it ships"
date: 2026-10-24
description: "320 PRs a day, merged 22 seconds after opening, none reviewed. We audited 16 after merge, found bugs in 10, and showed why waiting strands branches."
tags: [ai-agents, code-review, process, experiment]
---

# Review the code after it ships

*An experiment on our own repository, with the numbers.*

This repository is written mostly by short-lived AI coding sessions. Each one
gets a task, does it, opens a pull request, checks it, and merges it. Then
the session ends. Between 19 and 24 October 2026, 1,429 pull requests merged,
about 320 a day, or one every four and a half minutes. The median PR merged
**22 seconds** after it was opened.

The owner asked a fair question: can we get code review into this without
killing that pace, and without a pile of dead branches? This post is what we
found.

## Nobody was reviewing anything

Two review systems were meant to be running. Neither was.

Every merged PR had a review from GitHub Copilot. We read the newest 300.
All 300 said the same thing: *"Copilot was unable to review this pull request
because the user who requested the review has insufficient remaining
quota."* No comments on any line of code. Some of these "reviews" landed
after the merge anyway.

The second system is a set of reviewer bots, one per AI tool that works on
the repo. Each was meant to approve the others' PRs. Their jobs run on every
PR and skip, because the credentials they need were never added. They also
start about seven minutes after a typical PR has already merged. Even
working, they would be reviewing history.

So the real starting point was zero review, at full speed.

## Why "wait for a reviewer" doesn't fit

Classic review is blocking: the PR waits until someone approves it. That
needs the author still around when the reviewer shows up. If the reviewer
asks for changes, someone has to make them.

Here the author is a session that will end soon. If the review arrives after
the session has gone and says "please fix this", nobody is left to fix it.
The PR sits open, its branch goes stale, and the next session can't easily
tell whether it is live work or abandoned work. Do that a few dozen times a
day and you have the dead-branch problem.

We wrote a small simulation to put numbers on this. It is about 200 lines,
and the parameters come from the measurements here. At today's volume, with
reviewer sessions arriving about every half hour and authors willing to wait
15 minutes, blocking review stranded about **85 PRs a day**. It also left a
growing queue of PRs never reviewed at all, because the reviewers couldn't
keep up. The stranding went away only when a reviewer appeared every seven
minutes and every author was willing to sit idle for up to an hour. That
means paying for a lot of waiting.

## So we reviewed after the merge instead

If waiting is the problem, don't wait. Let work merge as it does now, then
review what landed, and fix anything wrong in a new change. The reviewer owns
the fix, so nobody has to chase a departed author.

To see whether that finds anything, we picked **16 merged PRs at random**
from the week. Four independent AI reviewers each took four. They were told
to check every suspected problem against the current code, to run things
rather than just read them, to try to disprove each finding before reporting
it, and that "found nothing" was a perfectly good answer.

The results:

- **10 of the 16 PRs had at least one real defect** still in the code.
- **None was serious.** All 11 findings were low severity by the reviewers'
  own rating. Two in a bookkeeping tool we would call medium: one silently
  dropped a bank transaction with an unreadable amount, and one told
  marketplace sellers a tax form was certain to arrive when it often isn't.
- **None of the 16 would have been blocked** by a reviewer before merging.
- Each review took about a minute of wall time and roughly 27,000 tokens.

Then we fixed them: 10 of the 11 findings, each with a test that fails on the
old code and passes on the new. The eleventh is a carpentry question (should
a stud sit under the joint at a gable's peak?), so we noted it rather than
guess.

## What kind of bugs these were

The pattern was consistent. Almost every finding came from **running
something**, not from reading the diff:

- **An input the tests didn't try.** A bank file format with double slashes.
  A wall 224 inches long instead of the 240 in the test, which puts a stud
  right on the roof peak, where it came out 3/8 inch short.
- **A test that didn't test its own name.** One test claimed to check
  compatibility with old data but ran the new code twice. Deleting the code
  it was guarding left it passing.
- **Words that disagreed with the numbers.** A research summary described a
  rule as "after two rejections" when the code resets after one. A product
  page described the wrong Kubernetes setting.
- **Two tools in the same repo that disagreed.** A tool that writes SEPA
  payment files produced references that the repo's own SEPA checker warns
  about.

These are small and local. A bug like that costs about the same to fix the
day after it merged as the minute before. That is why reviewing after the
merge loses little here.

The riskier PRs (payments, tax, banking code) had defects most often: 5 of
6, against 4 of 9 for other code. Sixteen is a small sample, but it is a
reason to read the risky ones first.

## The system we landed

1. **Keep merging when checks pass.** Throughput doesn't change.
2. **Review after the merge, riskiest first.** A small script lists merged
   PRs nobody has audited yet, ranked by what they touch: CI and security
   plumbing first, then money, tax and legal code, then other code, then
   docs. A session with spare budget reviews a few, fixes what it finds in
   its own PR, and records the audit as one small file per PR. Two sessions
   auditing at once never collide.
3. **For the riskiest changes, review before merging, in the same
   session.** The author starts a fresh reviewer on its own diff and waits
   the minute it takes. The reviewer finishes before the author leaves, so
   it can't strand anything.

What we're not doing is holding PRs open for a reviewer who may arrive after
the author has gone.

## What we don't know

Sixteen PRs is a small sample. "10 of 16" fits a true rate anywhere from
about two fifths to four fifths (a 95% interval of 39 to 82%). We also don't know what the reviewers
*missed*: there's no answer key, and they come from the same model family as
the authors, so they may share blind spots. The simulation is a model with
stated assumptions, not a forecast.

What we do know: before this, nothing was reading the code. Now there's a
queue, a habit, ten fixes on `main`, and a way to measure how much of each
week someone has read.

*The data scripts, the simulation, the full findings table and the agent
write-up are in the repository under `docs/reports/`. This post was written
with AI assistance (Claude).*
