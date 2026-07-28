# Working on this repo unattended

Most changes here are made by scheduled agent sessions with nobody watching.
That is a different situation from a person at a keyboard, and the difference
is worth writing down, because ignoring it has already cost this project more
work than any bug in it.

## What went wrong

On 2026-07-28, nine scheduled sessions fired in the space of ninety minutes.
Each one cloned the repo, found `IMPROVEMENT-PLAN.md`, noticed it was stale,
and did the obvious thing. The result was nine branches off the same commit
(`b887731`) and nine open pull requests:

| PR | Development-process doc | Rewrote the plan | Fixed the conjoint line search | Fixed the lint errors |
| --- | --- | --- | --- | --- |
| #1 | yes | yes | — | yes |
| #2 | yes | yes | — | yes |
| #3 | yes | yes | yes | yes |
| #4 | yes | yes | yes | — |
| #5 | yes | yes | — | yes |
| #6 | yes | yes | yes | yes |
| #7 | yes | yes | yes | — |
| #8 | yes | yes | — | yes |
| #9 | yes | yes | yes | yes |

Nine descriptions of the same seven `react-hooks/set-state-in-effect` errors.
Nine explanations of the same backtracking line search accepting a worse point.
Between them, five distinct real bugs — and because none of it merged, the
tenth session would have started from `b887731` and found all of them again.

None of those sessions did anything wrong by its own lights. Each read the
plan, picked the top item, fixed it, tested it, and opened a well-described
PR. The failure is only visible from outside any one of them.

## What happened next, which matters more

Two further sessions fired after that was written. #10 and #11 were already in
flight and landed as two more parallel branches off `b887731`, taking the count
to twelve. #12 consolidated #1–#9 onto one branch and added the rules below.

Then the thirteenth session — the one writing this — followed those rules:
read the open PRs first, found #12 already did what it was about to do, and
built on it instead of beside it. That worked. But it also found the thing the
original write-up had wrong.

**The rules above stop duplicate work. They do not make anything merge.** #12
was correct, green, and consolidated, and it sat unmerged exactly like the nine
it replaced, because the constraint was never branch hygiene — it is that only
the account owner can merge, and nobody had told them. Twelve well-described
pull requests are not twelve times the signal of one; past about three they
read as a backlog to deal with later.

So the count is the finding, and it goes to a person, not into a PR body where
it waits for the same attention that is already the bottleneck. That is why
this session sent a notification before writing any code.

Three sessions later the count is fifteen. The branch rule has held — #14
extended #12, and the session writing this line extended #14 rather than
opening a sixteenth — so the duplicate work has stopped. Nothing has merged.
Both of those are worth recording, because they say different things: the part
an unattended session controls is fixed, and the part it does not control is
unchanged, and no amount of further sessions changes the second one. When the
only thing a run can add is a better description of a queue nobody has drained,
the useful output is the notification and a short session.

## Twenty-one, and what a run is still good for

The count is twenty-one. The rule has now held five times running. Nothing has
merged.

The session writing this notified first, then went looking for something a run
*can* finish alone — and found one, which is the useful correction to the
paragraph above. "Send the notification and stop" is right when the only
remaining contribution is another description of a known bug. It is not right
as a general policy, because it had gone unnoticed for twenty-one sessions that
the app's central promise was arithmetically unreachable: spread evenly, 220
items need ~1,100 answers before any of them is usable, so every confidence
gate on the couple screen was gated on something that never happens.

That was found by simulating the real loop, not by reading it. Twenty-one
sessions had read this code. The general lesson is narrower than "keep working"
and broader than "stop": **a run with no access to the app should look for the
questions a simulation can answer**, because those are exactly the questions a
person with the app in front of them will not think to ask, and they do not
need a database, a browser, or a merge to be worth doing.

## Twenty-three, and the rule holding under load

Two sessions fired within minutes of #22 and reforked from the stale
pre-consolidation base instead of reading the open PRs first (#23, and one
that landed nothing new). The session writing this extended #22 anyway,
read #23, and found it added nothing #22 didn't already have — logged in
`IMPROVEMENT-PLAN.md` rather than repeated here. The rule about extending
the strongest branch holds even when it's raced; it just means occasionally
reviewing a sibling branch and confirming there's nothing to take from it.

This session's own contribution was small on purpose: the last route-level
try/catch gap, regression-tested. Not every run needs to be the one that
finds the next `CONVERGENCE.md`-sized result — closing a small, real,
already-scoped item is still landing work, and this branch does not compete
with anything open.

## What a deletion leaves behind

The consolidation deleted the intro form, which was right — it collected sex,
age and ethnicity for no screen. What it did not do is finish the deletion. The
route went on accepting all six fields. The privacy policy went on describing
them as "optional profile details you choose to enter", to people who could not
enter them.

Nothing leaked, because nothing was sent. But the app's public claim about its
own data handling was false for as long as it took someone to check, and it was
only checked because a later session went looking for a form the backlog said
existed.

Deleting a feature is the case where "correct every document this makes wrong"
is easiest to skip, because a deletion feels like it removes obligations rather
than creating them. It creates one for every place the feature was described.
An unattended session should be especially careful here: it cannot open the app
and notice that a page describes something that is not there.

## When there is already a consolidation

Extend it — branch from its head, add work it does not have, and say in your PR
that it contains the other branch. Do not open a second consolidation of the
same branches; two competing merges of nine PRs is strictly worse than one,
and it costs the reviewer the one thing in shortest supply.

If your only available contribution would be a third description of a bug two
open PRs already describe, the honest output is a notification and a short
session, not a thirteenth branch. Volume is not progress here.

## What to do instead

**Read the open pull requests before writing anything.** `list_pull_requests`
with `state: "open"` costs one call. If a PR already fixes what you were about
to fix, you have learned that in thirty seconds instead of two hours.

**Prefer extending a branch to starting one.** Merging an existing branch into
yours keeps its history and its tests, and it means the reviewer has one thing
to read instead of two. Consolidating several branches is more valuable than
adding a good one — the pile is the problem, not the quality of any item in it.

**Say what you did not take, and why.** A consolidation that silently drops
somebody's work looks identical to one that reviewed and rejected it. Name the
branches you merged and the ones you passed over.

**Notify when the pile is the finding.** Nine unmerged PRs is not something a
session should quietly work around; it is the thing the person needs to know,
because only they can merge. Send it as soon as you see it, not at the end.

## What only a person can do

An unattended session cannot merge, cannot deploy, and should not close
somebody else's pull request. It also cannot see the app: there is no Postgres
in the sandbox and no browser pointed at a running server, so nothing that
depends on a real database is verified by anything a scheduled run produces.

Say so plainly. "Not run against a database" is useful; a test plan that
implies otherwise is worse than no test plan, because it gets believed.

## The gate is the substitute for looking

Since a session cannot look at the app, `npm run verify` is the whole of what
it can honestly claim. That is why the runner has behavioural tests driving the
real component against a stubbed `fetch` (`src/components/UnifiedRunner.test.tsx`)
rather than none: it is the only way a change to the swipe loop can be checked
by something that cannot swipe.

A test that passes against both the old and the new code proves nothing. Run it
against the old behaviour once and watch it fail — that check takes a minute and
is the difference between a regression test and a comment.
