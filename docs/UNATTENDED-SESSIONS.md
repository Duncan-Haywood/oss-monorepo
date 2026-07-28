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

## Twenty-three: describing a queue is not draining one

The count is twenty-three. This is the sixth session to write up the same P0.

The five before it each described the pile accurately and each added to it. The
description was never the missing thing — the account owner does not need to be
told there are twenty-three pull requests, they need to know which of them can
be closed without reading. That is computable and nobody had computed it:

```bash
git merge-base --is-ancestor origin/claude/<branch> HEAD
```

Six of the twenty-three are ancestors of this branch, so merging it closes them
and nothing is lost. Sixteen are superseded. One had a genuinely distinct
artifact — the decision records — which is now imported here rather than closed
along with it. The result is [PULL-REQUEST-BACKLOG.md](PULL-REQUEST-BACKLOG.md),
and draining the queue is a mechanical job rather than a research one.

The general form: **when a run's contribution would be a sixth description of a
known problem, look for the part of that problem that is computable.** A
disposition is worth more than a diagnosis, and unlike a diagnosis it does not
need the reader to already be paying attention.

The other half of this session was a simulation that *closed* a backlog item
rather than adding one — pooling across perspectives, open for several sessions
as "the largest untaken win", now measured and rejected with the numbers written
down ([POOLING.md](POOLING.md)). That is the other thing an unattended run is
unusually good at: a question nobody has bothered to measure stays open forever
by default, and closing one permanently is worth more than another attempt at
the top of the list. Note which way it went — the idea was good, the
implementation works, and it still had to be rejected. A simulation is only
worth running if you would publish the result that says no.

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

## Twenty-five: the two heads were one merge apart

The two sections above were written by two sessions that fired within minutes
of each other, extended the same seven commits, and each added one commit on
top. Neither was wrong. Neither could see the other. The result was two heads,
eight commits each, differing by a single commit apiece — and two pull requests
where one would do.

This session's first action, before any code, was `git merge-base`. The two
heads merged with conflicts in exactly two files, both of them *this document
and the backlog* — two sessions describing the same problem in the same place,
which is the most benign conflict a repository can have. Ten minutes of work
collapsed two lineages into one and took the closeable count from six to
twenty-five.

The rule this adds to the one above: **when a run finds a sibling that extends
the same base, merge it rather than reviewing it.** The previous session read
#23 and correctly concluded there was nothing to take from it; that is the right
move for a branch forked from a stale base. It is the wrong move for a branch
forked from *your own* base, because there the merge is nearly free and leaving
it unmerged means the account owner has to make a judgement call that a
three-way merge would have made for them.

The generalisation, and the reason this belongs in a document rather than a PR
body: an unattended run's output is not just its diff, it is the *number of
decisions it leaves for a human*. Twenty-five open pull requests is twenty-five
decisions. One is one. A run that produces a smaller diff and fewer open
questions has done more work than a run that produces a larger diff and more.

## Twenty-nine: a fix that landed on one of two twins

The count is twenty-nine. Four sessions since the last section; two of them
(#26, #29) reforked from the stale base, two extended the consolidation. The
rule holds most of the time and nothing merges either way — none of which is
new, and none of which is the reason this section exists.

`trials/next` and `financial-trials/next` are twins: the same job, one for the
item survey and one for the financial one. Two sessions ago, `trials/next` was
fixed to hand back the question already on screen instead of creating a row on
every call — the bug that made the abandonment metric count refreshes, back
buttons and crawlers, and let an unauthenticated caller write rows in a loop.
The fix did not reach the twin. Six sessions have read this code since.

Why it survived is the interesting part, because it was not carelessness. The
financial card's text is generated by closures inside `sampleSlot` that do not
survive the write to the database, so the row genuinely could not be
re-displayed as it stood — and "this route can't do that" is a load-bearing
constraint that nobody restated, tested or wrote down. It was true of the code
as written and false of the problem: the attributes that differ between the two
sides *are* the slots that were sampled, so the card is reconstructible from
what was stored. Forty lines, `describeProfiles`, now the single renderer for
both the generated card and the replayed one, so the two cannot drift.

This is the same failure as "no database is reachable from here", one level
down. That one was an inherited claim in a document. This one was an inherited
claim in the *shape of the code* — nobody wrote it down, so nobody checked it,
and it propagated by being obeyed. Both are cheap to test and neither was
tested for six sessions.

Two rules follow, and the second is the general one:

**A fix applied to one of two twin routes is an open bug with a known
solution.** Before closing out a fix, grep for the other place that does the
same job. The cost is one search; the alternative is what happened here.

**A difficulty nobody has stated is a difficulty nobody has checked.** When
code is shaped as though something is impossible, the impossibility is a claim
inherited from whoever wrote it, and it deserves the same five minutes as any
other inherited claim. The tell is a comment that explains *what* the code does
where you expected one explaining why it could not do the obvious thing.

The durable answer to "which routes differ in a way one of them shouldn't" is
not vigilance, it is a list: [ROUTES.md](ROUTES.md) puts every route in one
table with what guards it, what it writes and what tests it, and
`routeInventory.test.ts` fails if the table and the filesystem disagree. A
property one twin has and the other doesn't is now a gap in a column instead of
something you have to already suspect.

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

**Recommending a close is a review, and it costs what a review costs.** The
dispositions in [PULL-REQUEST-BACKLOG.md](PULL-REQUEST-BACKLOG.md) started as a
way to make draining the queue mechanical, and for *containment* they are
exactly that — an ancestor is an ancestor, and `git merge-base` settles it. The
trap is that the same table also carries "nothing distinct here", which no
command can establish. That line has to come from reading the diff.

It went wrong on the thirty-fifth pull request. Its title reads like thirty
others, its body leads with the same re-audited plan and process document, and
three consecutive sessions filed it under duplicate. Inside it was an
unauthenticated read of any account-linked participant's full ranking — the
single most sensitive thing this app holds — found by nobody else. One more
close-as-duplicate and it would have gone.

So: **a branch that is not an ancestor gets its diff read before anything says
"close it".** There are only ever two or three of those. Reading them is an
hour; the alternative is that the queue becomes a place where the one real
finding is the thing most likely to be lost, because it arrives dressed as the
noise.

## What only a person can do

An unattended session cannot merge, cannot deploy, and should not close
somebody else's pull request. It also cannot *look* at the app: there is no
browser pointed at a running server, so how a screen actually reads — whether
the blind-spots output is worth showing at all — is not something a scheduled
run can settle.

It can, however, run the database. That was assumed impossible for several
sessions and was not: PostgreSQL 16 is installed in the sandbox, with the
server binaries off `PATH` and `initdb` refusing to run as root, which is why
`which pg_ctl` came back empty and nobody looked further. `scripts/test-db.sh
start` handles both. Anything that was going to be written up as "not verified
against a database" should be checked first — see
[decisions/0008](decisions/0008-integration-tests-against-a-real-database.md).

The wider lesson is worth more than the database: **an environment declared
impossible, by a session that could not check, propagated into four documents
and a decision record before anyone ran `ls`.** Constraints inherited from an
earlier session's write-up are claims, not facts. Test the cheap ones.

Say plainly what was and was not exercised. "Not run against a database" is
useful; a test plan that implies otherwise is worse than no test plan, because
it gets believed.

## The gate is the substitute for looking

Since a session cannot look at the app, the gates are the whole of what it can
honestly claim: `npm run verify` for everything, and
`npm run test:integration` when the change touches a route, a query or the
schema. That is also why the runner has behavioural tests driving the real
component against a stubbed `fetch` (`src/components/UnifiedRunner.test.tsx`)
rather than none: it is the only way a change to the swipe loop can be checked
by something that cannot swipe.

A test that passes against both the old and the new code proves nothing. Run it
against the old behaviour once and watch it fail — that check takes a minute and
is the difference between a regression test and a comment.

**And run the gate on the branch you are describing, not on the change you
made.** The thirty-fourth session ran `npm run verify` on the tip before adding
anything to it and found `npm test` red — a simulation overrunning the default
timeout by 2%. The test arrived in #27 and two sessions extended it after that,
each describing the branch as ready to merge; whatever any of them ran, nobody
ran the blocking suite on the head they were handing over. It is the same shape as "no database is reachable here"
(`decisions/0004`), and the same rule closes both: **a claim you inherited is
not a claim you checked, and the cheap ones are one command away.**
