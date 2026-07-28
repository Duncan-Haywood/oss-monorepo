# The open pull requests, and what to do with each

Thirty-three scheduled sessions have opened thirty-three pull requests against
`main`. **None has been merged.** `main` is still at `b887731`.

**Every one of them is closeable by merging this single branch.** Eleven are
ancestors of it and close by containment; the other twenty-two were checked
file-by-file, and the artifacts that were genuinely distinct and uncarried — a
test for the rate limiter, the invite-code tests, and a contract test on the
actionable categories — have been written here rather than left in branches
nobody will merge. There is no longer anything in the queue that this branch
does not have.

[UNATTENDED-SESSIONS.md](UNATTENDED-SESSIONS.md) records why this happened and
what changed in response — the branch rule now holds, and sessions extend the
consolidation instead of forking beside it. That fixed the part a scheduled
session controls. It did not fix this, because only the account owner can
merge, and until something does, every further run adds a pull request without
moving the project.

What was missing was not another description of the pile. It was a disposition
for each item, computed rather than guessed, so draining the queue is a
mechanical job rather than a research one. That is this document.

## How the dispositions were computed

Not from the titles, which are nearly identical and misleading. For each
branch:

```bash
git merge-base --is-ancestor origin/claude/<branch> <this branch>   # contained?
git diff --name-only main...origin/claude/<branch>                  # what it touches
```

A branch that is an ancestor of the consolidation is **contained**: every
commit on it is already here, so merging this branch merges it too, and
closing it loses nothing. That is a fact about the commit graph, not a
judgement about the work.

One false positive is worth knowing about: `git diff --name-only main...X`
lists deleted files alongside added ones, so `src/app/api/participants/route.ts`
shows up as "unique" on contained branches. It is not — it is a file this
branch deletes.

## Disposition

### Contained in this branch — close, nothing is lost

| PR | Branch | What it contributed |
| --- | --- | --- |
| #6 | `kind-ptolemy-psy8to` | The perspective bugs: `PARTNER_GUESS` recorded as `PARTNER`, progress reset on switching |
| #12 | `kind-ptolemy-99oocw` | Consolidated the distinct work from #1–#9; cross-person percentile comparison; the duplicate-question bug |
| #14 | `kind-ptolemy-q6be5c` | `coupleReadiness` — the couple screen says what it is waiting for |
| #17 | `kind-ptolemy-fyyehh` | Stopped collecting the six fields no screen asks for; privacy policy corrected |
| #21 | `kind-ptolemy-2deutw` | Confidence filtering in `compareRankings`; `docs/STATISTICAL-INTEGRITY.md` |
| #22 | `kind-ptolemy-q4tje6` | Progressive broadening; `docs/CONVERGENCE.md`; the pairing simulation |
| #24 | `keen-gates-9o7vfd` | The last route-level `try`/`catch` gap, with a regression test |
| #25 | `kind-ptolemy-2lb265` | Cross-perspective pooling measured and rejected; `docs/POOLING.md`; this document |
| #27 | `kind-ptolemy-uvl60j` | The merge of #24 and #25, plus the selection-prior measurement |
| #28 | `kind-ptolemy-wmhgvs` | Integration tests against a real Postgres, and the pending-question fix on `trials/next` they exposed |
| #30 | `kind-ptolemy-nq502g` | The same pending-question fix on `financial-trials/next`, its twin; `docs/ROUTES.md` and the route inventory test |

Merging this branch closes all eleven.

**#24 and #25 are the two heads this branch merged.** They fired within minutes
of each other, extended the same seven commits, and each added one on top —
neither could see the other. They conflicted only in `IMPROVEMENT-PLAN.md` and
`UNATTENDED-SESSIONS.md`, where both were describing this same problem, and both
sides were kept. A sibling that extends your own base should be merged, not
reviewed; see [UNATTENDED-SESSIONS.md](UNATTENDED-SESSIONS.md).

### Superseded — close, but read the note first

Eighteen branches, each a single commit off `b887731`, most of them adding a
`DEVELOPMENT-PROCESS.md` and a rewritten `IMPROVEMENT-PLAN.md`. They are the
duplicate-work episode itself. This branch carries the same material as
`developmentprocess.tsx` plus `docs/`, kept current across nine commits.

| PR | Branch | Unique artifact | Note |
| --- | --- | --- | --- |
| #1 | `kind-ptolemy-hbxvow` | `docs/{debt-register,product-goals,statistical-integrity}.md` | Same three documents this branch has under `docs/`, written independently |
| #2 | `elegant-bardeen-a4fw3d` | `DEVELOPMENT-PROCESS.md`, a `SessionStartAttempt` migration | Rate limiting landed here as `AnonRequestLog` instead |
| #3 | `keen-gates-qdx3r6` | `DEVELOPMENT-PROCESS.md` | — |
| #4 | `keen-gates-9mg37u` | `ARCHITECTURE.md`, **`src/lib/rateLimit.test.ts`** | The test is a genuine gap here — see below |
| #5 | `elegant-bardeen-gr00of` | `localSession.ts`, `useLocalStorageRaw.ts` | Same job as `clientStore.ts`/`sessionStore.ts` here |
| #7 | `keen-gates-a48f3x` | `DEVELOPMENT-PROCESS.md` | — |
| #9 | `elegant-bardeen-8yym7d` | `developmentprocess.md`, an `AnonRequestLog` migration | — |
| #10 | `elegant-bardeen-escg1v` | `DEVELOPMENT-PROCESS.md` | — |
| #11 | `keen-gates-js92yc` | `DEVELOPMENT-PROCESS.md`, a `RateLimitEvent` migration | Third independent design for the same rate limit |
| #13 | `elegant-bardeen-6wdc2r` | `CONTRIBUTING.md` | Covered by `developmentprocess.tsx`; not imported, to avoid a fourth restatement |
| #15 | `keen-gates-1kz7ps` | `DEVELOPMENT-PROCESS.md` | — |
| #16 | `keen-gates-4bygkf` | `DEVELOPMENT-PROCESS.md` | — |
| #18 | `keen-gates-u52gi6` | `DEVELOPMENT-PROCESS.md` | — |
| #19 | `kind-ptolemy-uzyxcf` | ADRs, `CONTRIBUTING.md`, `sessionBundle.ts` | Its own PR body says it is superseded by #17 |
| #20 | `keen-gates-vo8m6v` | `DEVELOPMENT-PROCESS.md` | — |
| #23 | `keen-gates-st08i6` | `DEVELOPMENT-PROCESS.md` | — |
| #26 | `keen-gates-2y9gvg` | `DEVELOPMENT-PROCESS.md`, `couples.test.ts` | Thirteen tests, all of them properties this branch's thirty-seven already assert |
| #29 | `kind-ptolemy-3ksdss` | `docs/{architecture,product-goals,testing}.md`, `couples.test.ts` | Its couples fixes were independently made here and gone further; **three of its tests were distinct and have been taken** — see below |

### Taken from a superseded branch rather than lost

Two sessions independently decided the repo needed decision records, and they
were right — nothing else here captures *why* an obvious simplification was
rejected. Closing those branches without taking the artifact would have thrown
away the one genuinely distinct thing in the pile.

Imported from **#8** (`kind-ptolemy-e2albp`), with the claims that had gone
stale corrected:

- `docs/decisions/` — the ADR set, 0001–0005, plus template and README.
  `npm run check` became `npm run verify`; 0004's "CI runs on GitHub Actions"
  now says the workflow has never started a runner; "every API route is
  uncovered" now excepts `session/start`.
- `.github/pull_request_template.md`, same corrections.

#19 has a competing ADR set covering roughly the same five decisions. #8's was
taken because its numbering and content are a superset. **#8 and #19 should
still be closed** — their remaining content is duplicate.

### Taken from #26 and #29, which fired after the list above was computed

Both forked from the stale base rather than extending the consolidation, and
both re-derived work this branch already had — with three exceptions, now
written here:

- **`generateInviteCode` had no test at all.** Three added: the code is two
  four-character groups, it never emits `O`/`0`/`I`/`1` (a couple types this in
  from a text message, which is the entire reason the alphabet is not A–Z0–9),
  and 5,000 draws collide zero times.
- **`ACTIONABLE_CATEGORIES` was not checked against the survey content.**
  Rename `Behaviour` in `surveyData.ts` and nothing breaks: no type fails, no
  test throws, and the most useful half of the couple screen quietly empties
  forever. #29 saw that and wrote the contract test; it is here now.

Everything else in the two branches is duplicate. **Close both.**

### #31, #32 and #33 — checked file-by-file, nothing distinct

Three more sessions fired after that, all from the stale base, and between them
they re-derived the conjoint line-search fix twice, the `session/start` rate
limit twice, the Arial-over-Geist font fix, and a fourth independent
development-process document. Each of those exists here already, with a test:

| PR | Branch | What it re-derived | Where it already is |
| --- | --- | --- | --- |
| #31 | `keen-gates-g7q3tw` | Conjoint fit stepping downhill; `SessionStartAttempt` rate limit | `conjoint.ts:230` with a regression test; `AnonRequestLog` + `rateLimit.test.ts` |
| #32 | `kind-ptolemy-h8lt5e` | `standardizePair` — z-scores both partners over their shared items before comparing | `couples.ts:409` `standardize`, plus a significance threshold corrected for the number of items examined, which #32 does not have |
| #33 | `keen-gates-evbsij` | Same conjoint fix, same rate limit, a `DEVELOPMENT-PROCESS.md` | As #31, plus `developmentprocess.tsx` |

#32 is the closest call of the three and still a close: it identifies the same
real problem this branch's `compareRankings` was rewritten for — two people's
Glicko ratings are not on one scale, so subtracting them measures who swiped
more — and solves it the same way, but stops at the z-score. It does not carry
the multiplicity correction, so at its `MIN_MEANINGFUL_SD` of 0.25 a couple
would still be shown ordering noise across dozens of simultaneous comparisons
as findings about their relationship. **Close it.**

## The one real gap this left — now closed

**`src/lib/rateLimit.ts` had no test.** #4 wrote one, but against a different
rate-limit design (`RateLimitEvent`, not the `AnonRequestLog` table this branch
uses), so it did not port across. It was the only thing in twenty-five pull
requests that was both distinct and not carried here.

Written fresh as `src/lib/rateLimit.test.ts`: twelve tests over a Prisma stub,
covering the `>= max` boundary in both directions, the fifteen-minute window,
per-IP and per-route scoping, and `x-forwarded-for` parsing. Mutation-checked
rather than assumed — flipping `>=` to `>` fails exactly one test, the one
named for that boundary.

With that written, **nothing distinct remains in the queue.** Closing the other
seventeen loses nothing at all.

## What to actually do

1. Merge this branch. That closes #6, #12, #14, #17, #21, #22, #24, #25, #27
   and #28 by containment.
2. Close the other nineteen with a one-line comment pointing here. Nothing
   distinct is left in any of them.
3. Decide whether this task should keep firing while nothing it produces can
   land. That is the question underneath all of the above, and it is the only
   one a scheduled session cannot answer for itself.
