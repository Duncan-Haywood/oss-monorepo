# Improvement plan

The live backlog. Individual items hang off the workstreams in
[`src/lib/developmentProcess.ts`](src/lib/developmentProcess.ts); the process
they go through is [`developmentprocess.tsx`](developmentprocess.tsx).

Priorities mean what [`docs/QUALITY-BAR.md`](docs/QUALITY-BAR.md) says they
mean:

- **P0** — the data or the people in it are at risk. Nothing else ships first.
- **P1** — it will mislead someone or break in ordinary use.
- **P2** — a promise the app makes but does not keep yet.
- **P3** — polish. Real, but nobody is harmed by waiting.

---

## Open

### P0 → resolved by migration — Forty-two parallel pull requests, none merged — *one merge closes all of them*

**Resolved.** This item describes a standalone `quick-pick-survey` repository
that predates this monorepo. Commit `4935cc7` ("Merge quick-pick-survey into
ventures/") folded that repo's final consolidated state into
`monorepo-projects` as a single commit, which is why `src/lib/participantAccess.ts`,
`src/lib/originCheck.ts` and the rest of the fixes described below are already
present in the tree. The standalone repo's own `main` (stuck at `b887731`) and
its 42-PR queue no longer exist as a separate thing to merge or drain — they
were superseded by the migration itself, not by an account-owner decision on
the old repo. This monorepo has its own, much smaller, open-PR situation,
tracked in `portfolio/ledger/` and `CLAUDE.md` at the repo root, not here.
Left the rest of this write-up below unedited as the historical record the
file's own "Closed" section philosophy asks for — the dispositions in
`docs/PULL-REQUEST-BACKLOG.md` and the lessons in `docs/UNATTENDED-SESSIONS.md`
are still accurate about what happened, just no longer about a live decision.

**Original write-up, kept for the record:**

**This branch is the forty-third, and it extends the forty-second rather than
starting beside it.** Every commit below #42's head is carried forward
unchanged, so merging this one branch still closes the entire queue. The count
has now gone 9 → 12 → 15 → 19 → 21 → 23 → 25 → 27 → 29 → 33 → 37 → 41 → 42
across thirteen write-ups of this item; the notification each session sent did
not change it, and neither will a fourteenth. Merging or pausing the schedule
are the only two things that do.

`main` has now been at `b887731` for two days, and the work stacked above it
includes a per-participant privacy fix, the perspective bugs that emptied the
blind-spots comparison, and every test in the repo written since — 262 of them.
None of it is running anywhere.

**This session checked the merge candidate before adding to it**, which is the
habit the previous one established after finding the tip red. All four blocking
gates — typecheck, lint, test, build — pass on `989a8c7`, the head of #42, and
pass again on this branch's own head. Whoever merges is merging something that
has been run.

**The queue is no longer only a waste — it is now a place where a real fix can
be lost.** #35 was sitting in it with an unauthenticated read of any
account-linked participant's full ranking, found and fixed by nobody else, and
it was on track to be closed as "process docs plus small fixes" on the strength
of a title that looks like thirty others. Its finding is carried onto this
branch, with tests, and gone further; see
[`docs/PULL-REQUEST-BACKLOG.md`](docs/PULL-REQUEST-BACKLOG.md). The lesson is
recorded there: containment can be computed from the commit graph, but "does
this branch have something no other branch has" cannot, and needs the diff
read.

**What the previous session did differently:** it did not add a fix. It ran the
blocking gates on the tip everything is stacked on and found them red — see the
item below — which is the one thing thirty-three write-ups of "merge this" had
not checked.

**The queue had grown two heads.** Two sessions fired minutes apart, both
extended the same seven commits, and each added one commit: #25 (the pooling
measurement) and #24 (the last route try/catch gap). Each was a valid
continuation; neither could see the other; the result was two eight-commit
lineages and two pull requests where one would do.

This branch is their merge. It conflicted in exactly two files — this document
and `docs/UNATTENDED-SESSIONS.md`, i.e. two sessions writing up the same problem
in the same place — and both sides were kept.

**Every one of the open pull requests is closeable by merging this one branch.**
Dispositions, computed from the commit graph rather than the titles, are in
[`docs/PULL-REQUEST-BACKLOG.md`](docs/PULL-REQUEST-BACKLOG.md). Nothing in the
queue is lost by closing it: the ancestors close by containment, and the rest
were checked file-by-file for anything this branch does not already have.

The consolidation chain is #12 ⊂ #14 ⊂ #17 ⊂ #21 ⊂ #22 ⊂ {#24, #25} ⊂ #27 ⊂ #28
⊂ #30 ⊂ here. #26 and #29 forked from the stale base after the dispositions were
computed; both were checked file-by-file and three tests were taken from #29
rather than closed with it. #31, #32 and #33 forked from it too and were checked
the same way: between them they re-derive the conjoint line-search fix twice,
the `session/start` rate limit twice, the font fix, and a fourth process
document, all of which are already here with tests. #32 is the closest call —
it reaches independently for the same within-person standardisation this
branch's `compareRankings` uses — and it stops short of the multiplicity
correction, so it would still show a couple ordering noise. Nothing distinct
remains in any of the three.

**Nothing merges without the account owner**, and until it does, every scheduled
run adds a pull request without moving the project. Each of those sessions sent
a notification; the notification is not the missing piece either.

The open question is not technical, and it is now the *only* thing blocking this
project: **whether this task should keep firing while nothing it produces can
land.** Two answers are both fine — merge this branch and let the schedule
continue, or pause the schedule — and one is not: leaving it firing into a queue
nobody drains. See [`docs/UNATTENDED-SESSIONS.md`](docs/UNATTENDED-SESSIONS.md).

### P1 → resolved on this branch — three screens had no way back from a dropped request

Every screen in this app loads its data over one `fetch` on mount, from a
phone, over a connection that drops. What each one did when that failed had
been decided six separate times, and nothing put the six side by side. Reading
them into one table — [`docs/SCREENS.md`](docs/SCREENS.md) — found three with
no recovery at all:

- **The admin portal set an error that no branch rendered.** A 500 on
  `admin/overview` fell through to `Loading…` and stayed there. It is the
  account owner's only window onto the data, and it has no navigation, so a
  hard refresh was the only way out.
- **The same screen never caught a rejected fetch**, so being offline meant
  `Checking…` for as long as the tab was open, with an unhandled promise
  rejection behind it.
- **The couple and insights screens offered a link back to the cards.** Not a
  dead end, but not recovery either: somebody who came to read the comparison
  has to make the whole trip again. Both retry in place now.

All four screens are covered by tests that drive the real component
(`AdminView.test.tsx`, `ProfileView.test.tsx`, and additions to
`CoupleView.test.tsx` and `InsightsView.test.tsx` — 31 cases). The three
recovery fixes were each checked by reverting the fix and watching the test go
red. `screenInventory.test.ts` fails if `SCREENS.md` and `src/components` ever
disagree, the way `routeInventory.test.ts` does for the routes.

### P1 → resolved on this branch — a signed-in person could be recorded as "Anonymous"

The profile screen sent `user?.firstName ?? "Anonymous"` with a perspective
switch, and `user` arrives from `/api/auth/me` some time after the first paint.
Tapping a mode before it landed sent "Anonymous" — which sticks on the
Participant row created for a mode that person had not used before, shows in
the admin table from then on, and comes back at them as "Thank you, Anonymous"
at the end of the round. The stored session bundle already holds the name they
started under, so it is used first now.

### P2 → resolved on this branch — the root-layout boundary discarded its error

`global-error.tsx` took the `error` argument and dropped it, while the
route-level boundary beside it logged every error it caught. The one failure
that takes down every screen at once was the one failure that left no signal.
Taken from #38/#40/#41, which each found it independently.

### P3 → resolved on this branch — a dead progress bar

`src/components/ProgressBar.tsx` was imported by nothing. It also predated the
accessibility pass, so it carried no `role="progressbar"` — meaning the next
person to reach for "the progress bar we already have" would have copied the
version without it. Deleted; the two live progress bars are in `CoupleView`
and the runner.

### P1 → resolved on this branch — the branch being held up for merge did not pass its own blocking gate

`npm test` failed on the tip of the consolidation. Not intermittently in
principle: `selectionPrior.simulation.test.ts` ran 5.1–5.5 seconds against
vitest's 5-second default and timed out, on a fast machine with nothing else
running. The test arrived in #27, two sessions extended the branch after that,
and no write-up mentions a red gate — so the "verified locally" claim was
carried forward rather than re-made, which is the same failure mode as
`decisions/0004`'s "no database is reachable here", two branches later.

The test is a measurement sweep, not a slow assertion: for each of three
correlations × two budgets it simulated the same 15 seeds three times over —
once per metric it reported — even though every run is seeded and therefore
identical. It now simulates once per cell and reads all three metrics off the
same runs. **5.1s → 1.7s, and the six printed rows are unchanged**, which is
the check that matters: the numbers `decisions/0007` is written from must not
move.

`vitest.config.ts` also carries an explicit `testTimeout` now, at 20s. The
default was never chosen for this suite; a limit a simulation lands within 2%
of on the fastest machine available is a limit that fails everywhere else, and
the first person it fails is someone who changed nothing. The cost reduction is
what buys the headroom — the timeout only stops a busy box from being reported
as a regression. Written up as a principle (`gates-need-headroom`) and a
definition-of-done check, because the general form of this bites again.

### P1 — CI has never run, and the docs said it had

`.github/workflows/ci.yml` was added several branches ago and every run of it
since — thirteen, across nine branches — has failed in two to thirteen seconds with no
steps, no downloadable logs and `runner_id: 0`. That is a job that never
started, identically on every branch, so it is Actions/runner availability at
the repository or account level rather than anything in a change.

Meanwhile the README, the quality bar and the process document all stated that
CI ran the four gates on every push. It never has. Every "verified in CI" claim
in this repo's history should be read as "verified by whoever ran
`npm run verify` locally, if they did".

Confirmed again this session against the API: thirteen runs, thirteen failures,
including the run against this branch's own tip (#22's head commit), and the
`verify` job on it reports `runner_id: 0`, `runner_name: ""`, and
`started_at` equal to `created_at`. No machine was ever assigned. On a private
repository that is almost always exhausted Actions minutes or Actions disabled
by repository/organisation policy — not a workflow error.

**Fix:** only the account owner can do it — check Settings → Actions and the
billing page, then re-run one of the failed workflows and confirm it produces
steps. The docs now say CI is not running; that correction should be reverted
once it is.

### P1 → resolved on this branch — `trials/next` created a Trial row on every page load

A trial was recorded as "shown" on every call, so the abandonment metric — the
count of shown-but-unanswered rows — was measuring refreshes, back-buttons and
crawlers rather than people giving up.

**Fixed.** The endpoint now hands back the participant's pending question if it
was shown within the last 30 minutes, instead of minting a new row. Past that
window the old row is left alone (someone who closed the tab and came back
tomorrow genuinely did abandon that question) and a fresh pair is chosen. Two
integration tests cover both halves; the first fails against the old route.

**What it does not fix:** two *concurrent* calls can still both find no pending
row and create two. The duplicate-fetch path that used to do that on every
resume is gone (the runner picks its domain outside the effect), so what
remains is a genuine double-tap rather than a structural bug.

### P1 → resolved on this branch — `financial-trials/next` created a row on every page load

The same bug as the one fixed on `trials/next` two branches ago, on its twin,
untouched. Every call — a refresh, a back button, a crawler — minted a
`FinancialTrial` row, so the abandonment metric counted reloads, and an
unauthenticated caller could write rows in a loop.

It survived because it looked impossible rather than because it was missed: the
financial card's text came from closures that did not survive the write, so the
stored row could not be shown again. That was true of the code and false of the
problem. `describeProfiles` reconstructs the card from the two stored profiles
— the attributes that differ between the sides *are* the slots that were
sampled — and is now the single renderer for both the generated card and the
replayed one, so a reloaded question is identical down to the order of its
lines. Round-tripped over 200 seeds at both slot counts.

The general version of this is written up in
[`docs/UNATTENDED-SESSIONS.md`](docs/UNATTENDED-SESSIONS.md), and the durable
fix for "which routes differ in a way one of them shouldn't" is
[`docs/ROUTES.md`](docs/ROUTES.md): every route in one table, guarded by
`routeInventory.test.ts` so it cannot fall behind the code.

### P1 — Decide what to do with six dead columns on `Participant`

`lastName`, `email`, `sex`, `age`, `ethnicity` and `countryOfResidence` are no
longer written by anything and no longer accepted by `session/start`, but the
columns still exist and may hold values entered on the intro form before it was
removed. Dropping a column drops its contents, so this is the account owner's
call rather than a migration's side effect.

**Fix:** check whether any row is non-null in any of the six; if not, drop them
and remove them from the admin export. If so, decide first. ~1 hour once the
answer is known. See [`docs/DATA-COLLECTION.md`](docs/DATA-COLLECTION.md).

### P0 → resolved on this branch — Anyone holding a participant id could read that person's ranking

`POST /api/insights` and `POST /api/session/status` took a map of participant
ids straight from the request body and answered with what that participant had
told the app — a full item ranking in the first case, per-survey progress in
the second. Neither asked who was calling.

The app's central promise, in [`docs/DATA-COLLECTION.md`](docs/DATA-COLLECTION.md)
and held on the couple route by `couple.integration.test.ts`, is that a partner
sees aggregate comparisons and never an individual answer. That promise was
worth exactly the secrecy of a cuid sitting in localStorage — and the two
people this app is built for are the two most likely to share a phone, a
browser profile, or a screen. Copy the id once, read the ranking forever.

**Fixed** in `src/lib/participantAccess.ts`, one rule rather than two inlined
checks: a participant attached to an account is readable only by that account.
An **anonymous** participant stays readable by whoever holds its id, and that
is deliberate — there is no account to check against, the id is the only thing
identifying that session, and requiring a sign-in would lock people out of
their own answers before they make one, which is the whole onboarding. An id
that is not the caller's is skipped rather than refused, because the client
sends whatever is in its storage and one stale id should not blank the screen.

Seven tests in `access.integration.test.ts`; three fail against the old code,
four pass either way and exist to stop the fix being taken too far.

**Found by #35**, which is the part worth remembering: it was the one branch in
thirty-seven with something no other branch had, and it was on track to be
closed unread.

### P1 → resolved on this branch — Two anonymous, unbounded, free-text write routes recorded as account-only

[`docs/ROUTES.md`](docs/ROUTES.md) listed `feedback` and `report` as `session`
in the Auth column and "account required" in the Limit column, and ranked them
below the admin portal *on that basis*. Neither has ever required an account:
both call `getSessionUser()`, both accept `null`, both write the row anyway. So
they were unauthenticated writes of up to 1000 and 4000 characters of free
text, one row above a bullet point in the same file saying that a route with no
auth and no limit is a bug being introduced.

Being anonymous is right — the feedback widget is shown to someone answering
signed out, and a person who hits a bug before making an account is exactly who
needs to report it. What was missing was the bound.

`report` did have a guard, which is the more instructive half: it counted
recent rows matching the caller's own `userAgent` **and** `path`, both taken
straight off the request, so varying the user-agent string reset the count to
zero every call. Its comment said "per IP". It had never been per IP, and a
populated cell in the Limit column reads as a limit.

Both now use the same per-IP limiter as every other anonymous write, accounts
exempt, budgets separate per route. Fifteen tests in
`writes.integration.test.ts`; the user-agent one fails against the old code.

### P1 → resolved on this branch — Free text from a stranger, into the admin's spreadsheet

The admin CSV export escaped quotes, commas and newlines, and nothing else. A
cell whose text begins with `=`, `+`, `-` or `@` is evaluated as a formula by
Excel, LibreOffice and Sheets rather than displayed, and the `note` and
`message` columns come from the two anonymous routes above. `=HYPERLINK(…)` in
a bug report arrives as a working link in the account owner's spreadsheet.

Leading formula characters in **string** values are now prefixed with an
apostrophe, which those readers treat as "this cell is text" and do not
display. Numbers are left alone, so a negative figure still exports as one —
which is the reason the guard cannot simply be applied to every cell. A bare
`\r` now forces quoting too.

### P2 → resolved on this branch — The admin portal had no test at any level

Four routes, one of them serialising every answer, every rating and every
free-text note in the database into a CSV, and the only thing that had ever
checked any of it was somebody using the portal and it looking right. It was
the largest coverage gap in the repo by the repo's own reckoning.

`admin.integration.test.ts`, 40 tests, against a real database. The three
things "it looked right" cannot distinguish:

- **The door.** `verifySessionToken` is hand-rolled, and its payload *is* the
  expiry — so a token is a deadline the holder would otherwise be able to edit.
  A forged, an expired, an extended and a wrongly-signed token are each
  refused, and a signature of the wrong length returns 401 rather than an
  uncaught `timingSafeEqual` throw (two of the routes check the cookie outside
  their `try`).
- **The throttle.** Eight failures lock an IP out; the *correct* key is still
  refused while it is locked, which is the property that makes it a lockout
  rather than a speed bump; the lockout is per-IP, expires with the window, and
  successes do not count toward it.
- **What comes out.** Quoting round-trips a comma, a quote and a newline; a
  formula is neutralised; a negative number is not; all five tables serialise.

Also fixed while writing it: `admin/report` returned 500 for an id that no
longer exists, so an admin clicking "Mark done" on a report another tab had
already cleared could not tell that from the database being down. It is a 404
now.

### P2 → resolved on this branch — Not every route handles its own failures

Six route handlers had no `try`/`catch` — `auth/me`, `auth/logout`,
`admin/logout`, `financial-trials/next`, `trials/next`, `surveys/[slug]` — so a
database error surfaced as an unhandled rejection with nothing searchable in
the log. Each now catches, logs with `console.error("<route> failed", err)` —
the pattern the other seventeen routes already used, kept rather than adding a
wrapper abstraction for six call sites — and returns a JSON 500 instead of
throwing past the handler.

**Regression-tested**, not just added: `trials/next/route.test.ts` mocks
`prisma.participant.findUnique` to throw and asserts a 500 JSON response. Run
against the unfixed route it fails — `POST` rejects instead of resolving,
which is what the unhandled-rejection bug looked like from the caller's side.

**Since verified against a database too** — `trials/next` is now driven end to
end in `trials.integration.test.ts`. The other five routes are covered by the
same reasoning but not by a test each.

### P2 → resolved on this branch — No integration tests, because "there is no database"

The premise was wrong, and it had been repeated in four documents and a
decision record. **PostgreSQL 16 is installed in the agent sandbox.** Two
things hid it: only the client is on `PATH` (the server binaries live in
`/usr/lib/postgresql/16/bin`), and sessions run as root, which `initdb`
refuses. Both are a few lines of shell.

**Done:** `scripts/test-db.sh start` creates, migrates and seeds a throwaway
cluster — same command on a laptop and in a sandbox — and
`npm run test:integration` runs the real route handlers against it. 27 tests
across the three paths the product rests on:

| Suite | Covers |
| --- | --- |
| `trials.integration.test.ts` | An answer moves both items and stores the snapshot undo replays; a resent answer applies once; two submits racing on one trial apply once; one participant's answers never reach another's ratings; undo restores exactly; a reload returns the pending question |
| `session.integration.test.ts` | Switching perspective and back lands on the same participant rows; the six removed profile fields cannot be written; the per-IP throttle counts rows and exempts accounts; the status fan-out stays capped at 20 |
| `couple.integration.test.ts` | An invite is claimable exactly once under a race; no raw answer or participant id crosses between two people; the actionable sections stay shut on thin data and open on good data |

Those concurrency and isolation claims are exactly what a mocked Prisma client
cannot check — a mock can prove the handler *called* `updateMany` with a
`result: null` guard, only a database can prove the second caller loses.

CI runs the same suite against its existing Postgres service. `npm run verify`
deliberately does not: a gate that needs setup is a gate people route around.
See [`decisions/0008`](docs/decisions/0008-integration-tests-against-a-real-database.md).

**Now also covered on this branch:** the financial and conjoined routes, in
`financial.integration.test.ts` — 15 tests over the real handlers, including
that a conjoined card's identity weight comes from the answerer's own ratings
(two people who rated the same item in opposite directions fit opposite signs,
which pooled ratings could not produce).

**And since:** the admin portal, the two free-text writers, and the
participant-ownership rule, in `admin.integration.test.ts`,
`writes.integration.test.ts` and `access.integration.test.ts`. Every route in
[`docs/ROUTES.md`](docs/ROUTES.md) now has a test; the `Tested` column has no
empty cells left, and 106 of the tests run against a real Postgres.

**Still uncovered:** the page components. `AdminView` is 380 lines of React
that nothing drives, and six of the eight pages have no test. The routes they
call are covered; which of them each screen calls, with what, and what it does
with a 401 mid-session, are not. Below that sits the thing no suite can reach —
somebody reading what two real accounts actually produce.

### P2 — The premise that was wrong for four documents

Worth keeping separate from the fix, because the failure was not technical.
"No database is reachable here" was written by a session that could not check,
became `decisions/0004`, and was then quoted by `TESTING.md`, `QUALITY-BAR.md`,
`UNATTENDED-SESSIONS.md` and the pull request template. Every subsequent
session inherited it as a fact and designed around it.

**What to do about it:** constraints inherited from an earlier write-up are
claims. When one is cheap to test — one `ls`, one command — test it before
building on it. Written into
[`docs/UNATTENDED-SESSIONS.md`](docs/UNATTENDED-SESSIONS.md).

### P1 → largely answered on this branch — The actionable half of the couple screen is gated past where anyone reaches

**Answered end to end this session, and the answer is better than the estimate
below.** `src/app/api/couple/earned.integration.test.ts` links two accounts and
has them answer the behaviours survey through the real `trials/next` and
`trials/answer` handlers against a real database — nothing planted — then reads
`/api/couple/compare`:

| Answers each | Items under rd 200 | make them happy | shared | matters more to them |
| --- | --- | --- | --- | --- |
| 30 | 5 / 16 | 6 | 0 | 0 |
| 50 | 15 / 16 | 6 | 3 | 5 |
| 70 | 16 / 16 | 6 | 0 | 5 |

So the actionable half opens at roughly **fifty answers each on a 16-item
survey**, not the several hundred the paragraph below inferred from the 41- and
220-item surveys. The gate was never the problem on the small surveys; the
combined survey was. Two further findings are in
[`docs/CONVERGENCE.md`](docs/CONVERGENCE.md): "something to do for them" is full
at 30 answers, long before anything that compares the two people, and the shared
list held three rows at 50 answers that more answers deleted — a confidence gate
catching exactly what it exists to catch.

**What is left of this item:** the combined survey, which is what a couple is
actually pointed at, and which the simulation still puts at ~34 usable items
after 300 answers. The original write-up follows.

Measured, not guessed. Two accounts were driven through all three perspectives
against a local Postgres — roughly 90 and 60 answers respectively — and then
`/api/couple/compare` was read:

| Section | Rows |
| --- | --- |
| `fit` / `theirFit` / `mirror` / `blindSpots` | 5 aligned + 5 diverged each, overlap 37–52 |
| `makeThemHappy` / `makeYouHappy` / `shared` / `mattersMoreToThem` | **0** |

The four empty ones all require `rd < 200`, and `strengthScores` additionally
needs eight items past that floor before it will compare two people at all.
After ~90 answers the *lowest* deviation any item reached was 170, with exactly
one item under 200 across all three perspectives. So the sections a couple would
actually act on need answer counts in the high hundreds.

The threshold is not wrong — advising someone confidently off four swipes is the
failure mode this project exists to avoid. Two things are wrong around it:

**Done on an earlier branch.** `coupleReadiness` reports, per section, whether
it is ready and how far each partner is toward the floor; the four sections now
always render, showing either their rows or a locked state that names who is
still answering and a progress bar toward the threshold. A section with enough
data but nothing above the bar says so, which is a different fact from "keep
going". The threshold was not lowered.

**Done on this branch, and it makes the gap larger, not smaller.** The top row
of that table was the more urgent problem: those four sections were *not* gated
on confidence at all, so the half of the screen that looked healthy was the half
with no floor under it. See the next item. The measured answer is that the
comparisons need roughly `rd < 100–150` before they carry signal, which is
further out than the `rd < 200` the other four ask for.

So the question underneath is now sharper and is the top open product call:
**every useful thing on this screen needs a precision the app does not reach in
a session anyone will sit through.** The honest options are a shorter path to
confidence — more informative pairing early on, fewer items, or pooling
evidence across the three perspectives — or a smaller promise up front. Loosening
the gates instead would restore a screen that was full and wrong.

**Partly answered on this branch — see the next item.** Pair selection now
deepens a core set before broadening, which takes the combined survey from zero
usable items at any budget to roughly 34 under `rd < 150` after 300 answers.
That makes the screen reachable. It does not make it a ranking of 220 items,
and the remaining options above are still the remaining options.

### P1 — Reaching a usable confidence, measured rather than assumed

An item needs eight to twelve comparisons before its deviation falls far enough
to show; each answer supplies two item-appearances. Spread evenly, a survey of N
items needs ~5N answers before *any* of it is usable — and the coverage term in
`selectNextPair` was spreading them evenly across all 220 items of the combined
survey. That is ~1,100 answers, so the gates on the couple screen were
unreachable by construction rather than by accident.

Measured with `pairing.simulation.test.ts`, which drives the real pairing and
the real Glicko-2 update against a synthetic respondent, and is calibrated
against two real accounts (lowest rd 170 live at ~90 answers on the 41-item
survey; 159 in simulation). Medians over nine seeds:

| Survey | Answers | before, rd<200 | after | before, rd<150 | after |
| --- | --- | --- | --- | --- | --- |
| combined (220) | 90 | 0 | **22** | 0 | **4** |
| combined (220) | 300 | 26 | **57** | 0 | **34** |
| professions (91) | 300 | 81 | **58** | 13 | **35** |

**Done on this branch:** progressive broadening — only the first
`activeSetSize` items are eligible for pairing, starting at a core of 14 and
growing with answers. Surveys of 21 items or fewer are exempt, since their whole
set already finishes.

**What it cost, stated plainly:** the `professions | 300` row shows items under
rd 200 falling from 81 to 58. Breadth of weak estimates was exchanged for depth
of usable ones. Since nothing on the couple screen is shown at rd 200, that is
the right trade, but it is a trade.

**Pooling is now measured and closed.** It was the top of this list for several
sessions. It delivers what it promised — items under rd 150 go from 3–4 to
28–29 at 90 answers per perspective — and it delivers it by shrinking
PARTNER_GUESS onto SELF: correlation 0.97–0.99 against a true 0.37. That is the
egocentric bias the blind-spots screen exists to detect, manufactured by the
estimator and then reported as a finding about the couple. The `tau` that was
supposed to prevent this collapses toward zero at exactly the budget where the
shrinkage is strongest. Written up in [`docs/POOLING.md`](docs/POOLING.md), with
the implementation kept unimported in `src/lib/pooling.ts` so the decision can be
re-argued against a real estimator. See
[`decisions/0006`](docs/decisions/0006-no-pooling-across-perspectives.md).

**Selection-only pooling is now measured and closed too.** It was the last of
the three, and the one nothing above refuted: a pair chosen on prior data
leaves the likelihood alone, so it cannot bias an estimate. It also cannot
help. Across correlations 0.37–0.85 and budgets of 90 and 300, items reaching
rd 150 move by at most one either way. The run that settles it is an *oracle*
prior that knows the truth exactly — two items out of 41, against progressive
broadening's 0 → 34. So the closeness term has almost no leverage over how fast
deviation falls; deviation is set by how many comparisons an item gets, which
the coverage term and `activeSetSize` decide. Kept unwired in
`src/lib/pairing.ts` with the measurement in
`src/lib/selectionPrior.simulation.test.ts`; see
[`decisions/0007`](docs/decisions/0007-no-selection-only-cross-perspective-priors.md).

**So this is now a product decision, not an engineering one.** Every route to
making the couple screen reachable by asking *better* questions has been
measured and closed. The two that remain are asking *fewer* questions — shrink
the combined survey, a superset of the other six — or promising less up front by
saying what 60 answers buys before someone starts. Both need the account owner.
See [`docs/CONVERGENCE.md`](docs/CONVERGENCE.md).

### P1 → resolved on this branch — The comparison screen reported its own noise as findings

`compareRankings` feeds `fit`, `theirFit`, `mirror` and `blindSpots` — the four
sections that *did* render — and it applied no confidence filter whatsoever.
`rankingFor` hands it every item with `rd < 349`, so an item shown once, whose
rating is very nearly a coin flip, was given a hard rank position and printed as
a finding about the couple.

Two consequences, both measured by simulating two people with **identical**
preferences at the deviations the app actually reaches (`rd ≈ 280`):

- **The "Overall match" percentage was attenuated to about 14% of its true
  value.** Attenuation by measurement error does not make a correlation noisy
  and centred, it shrinks it toward zero — so a couple who wanted exactly the
  same things scored 0.14 and a couple who wanted opposite things scored −0.18.
  Rendered as a percentage, every couple was told roughly "50% match" no matter
  what was true.
- **The difference list was sorted by the largest rank gap**, and the largest
  gaps are where the error bars are widest, so it selected the least-measured
  items by construction. 100% of simulated screens showed five phantom
  differences between two people who agreed on everything.

**Fixed.** `reliabilityOf` computes what fraction of a ranking's spread is real
preference (`1 - mean(rd²)/var(observed)`); the headline figure is withheld
below 0.5. Rows are kept only where the two standardized positions differ by
more than their combined standard error, at a Bonferroni-corrected threshold so
the 5% false-positive budget is spent per *screen* rather than per row. Over
1000 simulated identical couples that takes phantom rows from 5.0 per screen to
0.04, while two genuinely opposed people are still detected on 97% of screens
once `rd` reaches 100. Empty lists now say what they are waiting for rather than
vanishing. Written up in
[`docs/STATISTICAL-INTEGRITY.md`](docs/STATISTICAL-INTEGRITY.md).

**Since verified against a database, up to a point.**
`couple.integration.test.ts` drives `/api/couple/compare` with planted
rankings and asserts that the four actionable sections stay shut on thin data
and open on good data, and that the readiness object names who it is waiting
on. What still nobody has done is *look* at the resulting screen with real
answers behind it — a browser, not a test.

### P2 — Blind spots now has data, but no human has read it

`PARTNER_GUESS` was silently recorded as `PARTNER` until recently, so the
blind-spots comparison — the sharpest thing the app produces — had nothing
behind it. It does now: verified end to end with two linked accounts, 38 shared
items, five aligned and five diverged rows.

**Fix:** what remains is judgement, not code. Someone has to read real output
and say whether it is worth showing.

### P2 → resolved on this branch — CSRF/origin check on the mutating routes

A signed-in user opening another page, whose JavaScript posts to
`/api/couple/join` or `/api/trials/answer`, would have had that request carry
their session cookie and be indistinguishable from a real one. Nothing here is
worth *reading* — but it is worth writing to: burning a couple's invite code,
planting answers into a partner's ranking, or firing the anonymous session
endpoint from real users' browsers, which is the one route with no account
behind it to throttle against.

**Done** in `src/proxy.ts` (Next 16's renamed Middleware), so the rule is in one
file rather than eighteen handlers where the nineteenth would be missing it.
`src/lib/originCheck.ts` holds the decision and 16 tests hold it in place. Two
choices worth knowing about: a request with **no** `Origin` is allowed, because
browsers always send it on POST, so its absence means a non-browser caller —
curl, the admin export, the integration suite — which cannot be a CSRF vector;
and `Sec-Fetch-Site: cross-site` is rejected on its own, which closes the gap
that would otherwise open by simply omitting the header.

**Not** claimed to be authorisation. It says the request came from our own
pages; who is making it is still `getSessionUser`'s job.

### P3 → contrast resolved on this branch; the screen-reader pass still needs a person

"Several small grey labels still sit near the WCAG AA floor" was the estimate
this item carried for several sessions, made by eye. Computed, it was seventy-two
elements below the floor, and the estimate was wrong in the direction that
estimates made by eye always are: **thirty of them were the same 2.58:1 grey**,
and each one looked fine next to the labels around it because those were the
same wrong grey. That is the whole argument for `contrastAudit.test.ts` — it
reads every class list in the app, resolves each colour against the palette
Tailwind actually ships (v4 defines it in oklch, so the check converts through
OKLab rather than trusting a hand-copied hex table), and fails below 4.5:1.

What it found, beyond the grey:

- **Error text at 3.81:1.** `text-red-500` on white, on nine screens. The one
  piece of text on the page that exists because something has gone wrong was
  among the hardest to read.
- **Twelve elements below the floor in dark mode only**, because a colour with
  no `dark:` counterpart renders in *both* schemes. Anything darkened for the
  light scheme has to be lightened for the dark one, and half the fix would
  have quietly broken the other half.
- **A hairline miss at 4.48:1** on the perspective pill, which no eye would
  have caught and no eye should have to.

Every one is fixed, in both schemes, and the audit fails the build if a new one
appears. The exemption list has one entry — the decorative category art, which
is `aria-hidden` and always beside its own text label — and a test that fails if
an exemption stops matching anything, so an excuse cannot outlive the element it
excused.

**Still needs a person:** a real screen-reader pass, keyboard-only completion,
focus visibility, and whether the amber/emerald split on the couple screen
carries meaning that the text alone does not. None of those can be settled by
reading class strings. All of them are listed, unclaimed, in
[`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md).

---

## Auth roadmap

**Current priority:** the survey app that already exists should be on a
public URL before more auth providers. Google / magic-link / Apple each
need a deployed domain anyway. Portfolio rule:
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) "Current priority".

Email + password is built: bcrypt, hashed session tokens in HTTP-only cookies,
per-email and per-IP rate limiting. The rest each need setup only the account
owner can do, in the order worth adding them:

1. **Google OAuth** — needs a Google Cloud project, a configured consent
   screen, and a client ID + secret; the redirect URI must point at the final
   deployed domain. Cheapest big win: removes password friction entirely.
   ~3 hours once credentials exist.
2. **Passwordless email magic links** — needs an email service (Resend's free
   tier is enough) plus DNS records to send from your own domain. Also unlocks
   password reset, which the current password login lacks. ~4 hours.
3. **Sign in with Apple** — Apple Developer Program ($99/yr), a Services ID, a
   private key, domain verification. Worth it mainly if this becomes a real iOS
   app, where Apple requires it alongside other social logins. ~4 hours after
   enrolment.
4. **Optional TOTP 2FA** — pure JS (`otpauth` + `qrcode`), no external service,
   no cost. Opt-in from settings, with single-use recovery codes. ~3 hours.

Account linking matters: every method should attach to the same `User` row by
verified email, so signing in with Google and with a password lands in one
account rather than silently creating two.

---

## Closed

Kept so the plan can be trusted as a record rather than re-litigated.

- **Ratings were global.** Now per participant via `ParticipantItemRating`; one
  person's answers cannot move another's ranking.
- **Real PII hard-coded in the runner components.** Removed; the intro form
  starts blank and the app is `noindex` app-wide.
- **No consent notice where data is collected, and a privacy policy that
  described a form that no longer existed.** The intro form was deleted in the
  consolidation, but `session/start` went on parsing and storing `lastName`,
  `email`, `sex`, `age`, `ethnicity` and `countryOfResidence` — an
  unauthenticated endpoint accepting special-category data for no screen — and
  the policy went on telling people those were "optional profile details you
  choose to enter". The route refuses all six now, guarded by its own test; the
  policy says what is actually true; and both real collection points (signup,
  and starting to answer signed out) name what they store and link the policy.
  The inventory lives in [`docs/DATA-COLLECTION.md`](docs/DATA-COLLECTION.md).
- **Lost-update and double-submit races on ratings.** `trials/answer` now
  claims the trial with `updateMany({ where: { result: null } })` inside the
  transaction and reads item ratings inside it too. A repeat answer returns
  `alreadyAnswered` rather than a permanent 409.
- **Uncapped fan-out on `/api/session/status`.** Capped at 20 entries with every
  value type-checked before any query runs.
- **Refit on every financial answer.** Now every `REFIT_EVERY` answers, or on an
  explicit force after an undo.
- **Absolute convergence tolerance in the conjoint fitter.** Now scaled per
  observation, so `converged` does not turn false purely because someone
  answered more questions.
- **Line search assigned a worse point after exhausting its halvings.** It now
  stops instead of stepping downhill and reporting the result as a maximum.
- **Missing composite indexes on hot paths.** Added, including
  `(userId, perspective, lastSeenAt)` for account resume.
- **Dead-end error states.** Retry affordance on a failed fetch; a 409 on an
  already-recorded answer is treated as success.
- **No admin portal, no results page.** Both exist: login, rankings, CSV export,
  and the insights and couple screens.
- **No tests.** 135 across the numerical core, the couples comparison, the
  client contracts, the swipe loop itself, and one API route.
- **No error boundaries.** `error.tsx`, `global-error.tsx` and `not-found.tsx`
  are in place.
- **`PARTNER_GUESS` collapsed into `PARTNER`.** `session/start` narrowed the
  value with a two-way ternary, so every session started as "what I think my
  partner wants" was recorded as "what I want in a partner" — polluting that
  person's own ranking and leaving the blind-spots comparison with no data it
  could ever be built from. Perspectives are now declared once and parsed by a
  rejecting parser.
- **Switching perspective silently reset progress.** A signed-in account now
  reuses the participants it already has for that perspective instead of
  creating a new set, which is what the profile screen always claimed happened.
- **`/api/auth/me` mixed perspectives on resume.** It took the most recent
  participant per survey regardless of perspective, so a fresh device could
  resume "in a partner" for one domain and "what they want" for the next, under
  one progress bar. It now resolves the perspective first and returns only that
  one's participants.
- **The account-resume path reset every progress bar to zero.** It now hydrates
  the counters the same way the localStorage path does.
- **No CI.** `.github/workflows/ci.yml` runs typecheck, lint, test, build, and a
  migration-parity check on every push and pull request.
- **Comparing two people on incomparable scales.** The couple screen subtracted
  one partner's raw Glicko rating from the other's. Ratings are per respondent,
  so their spread tracks how much someone answered rather than how much they
  care — "this matters much more to them" was reporting whoever had swiped more,
  and two people who agreed on everything were still shown a list of
  differences. Cross-person comparisons now go through within-person percentile
  positions. Spearman's rho also needed a real overlap before being shown as a
  match percentage; at three shared items it can only come out as ±1 or ±0.5.
- **A duplicate question on every resume.** The runner picked its opening domain
  inside the fetch effect, so setting it re-ran the effect and fired a second
  `POST /api/trials/next` before the first returned. That endpoint creates a row
  per call, so every resume burned a question, silently skipped it, and inflated
  the abandonment metric. The domain is now chosen when the session is opened,
  which is a pure derivation, not an effect.
- **A dropped connection wedged the session.** A next-question fetch that *threw*
  rather than returning non-ok left an unhandled rejection and no error state,
  so the screen sat on "Loading next…" with no Retry. On a phone that is the
  common case. A response with no trial id had the same effect and is now
  treated as a failure too.
- **The welcome screen flashed in front of returning visitors.** "Haven't read
  storage yet" and "nothing stored" were the same state; they are now distinct.
- **The unreachable name-entry form.** Nothing set that phase. It collected name,
  email, sex, age and ethnicity with no route in — deleted, along with the
  unused `/api/participants` route, which duplicated `session/start` with the
  same unbounded-write gap.
- **Anonymous row creation was unbounded.** `session/start` is rate limited per
  IP against an `AnonRequestLog` table — counted in the database, since an
  in-process counter resets on every serverless cold start. Signed-in callers
  are exempt; they reuse their participants rather than creating new ones.
- **The lint suppressions in the runner.** All gone: storage is read through
  `useSyncExternalStore`, and nothing sets state synchronously from an effect.
- **Accessibility basics.** `role="progressbar"` with values, `role="alert"` on
  the error line, `lang="fa"`/`dir="rtl"` on the Persian copy, `aria-hidden` on
  decorative emoji, and `prefers-reduced-motion` honoured by the card and
  celebration animations.
- **Geist loaded and then overridden by a hard-coded Arial.** The body font now
  uses the variable the layout sets.
- **`SurveyRunner` drops the email field that `UnifiedRunner` collects.** No
  `SurveyRunner` component exists anywhere in this monorepo, in the tree or in
  git history — only `UnifiedRunner` was ever committed here. `UnifiedRunner`
  collects no email; the string "no name, no email" is copy describing what it
  does *not* ask for. The item names a component from the pre-migration
  standalone repo's old intro form (see "The unreachable name-entry form",
  above), and nothing in the current codebase corresponds to it.
