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

### P0 — Twenty-five parallel pull requests, none merged — *one merge closes all of them*

**The queue had grown two heads.** Two sessions fired minutes apart, both
extended the same seven commits, and each added one commit: #25 (the pooling
measurement) and #24 (the last route try/catch gap). Each was a valid
continuation; neither could see the other; the result was two eight-commit
lineages and two pull requests where one would do.

This branch is their merge. It conflicted in exactly two files — this document
and `docs/UNATTENDED-SESSIONS.md`, i.e. two sessions writing up the same problem
in the same place — and both sides were kept.

**Every one of the twenty-five open pull requests is now closeable by merging
this one branch.** Dispositions, computed from the commit graph rather than the
titles, are in [`docs/PULL-REQUEST-BACKLOG.md`](docs/PULL-REQUEST-BACKLOG.md).
Nothing in the queue is lost by closing it: the eight that are ancestors close
by containment, and the rest were checked file-by-file for anything this branch
does not already have.

The consolidation chain is #12 ⊂ #14 ⊂ #17 ⊂ #21 ⊂ #22 ⊂ {#24, #25} ⊂ here.

**Nothing merges without the account owner**, and until it does, every scheduled
run adds a pull request without moving the project. The count has gone
9 → 12 → 15 → 19 → 21 → 23 → 25 across seven write-ups of this same item. Each
of those sessions sent a notification; the notification is not the missing
piece either.

The open question is not technical, and it is now the *only* thing blocking this
project: **whether this task should keep firing while nothing it produces can
land.** Two answers are both fine — merge this branch and let the schedule
continue, or pause the schedule — and one is not: leaving it firing into a queue
nobody drains. See [`docs/UNATTENDED-SESSIONS.md`](docs/UNATTENDED-SESSIONS.md).

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

### P1 — `trials/next` creates a Trial row on every page load

A trial is recorded as "shown" before it has been displayed for any length of
time, so the abandonment metric is currently measuring refreshes and crawlers
rather than people giving up.

**Fix:** only count a trial as shown once it has been on screen briefly, or
reconcile against `msToAnswer` when reading the metric. ~2 hours.

### P1 — Decide what to do with six dead columns on `Participant`

`lastName`, `email`, `sex`, `age`, `ethnicity` and `countryOfResidence` are no
longer written by anything and no longer accepted by `session/start`, but the
columns still exist and may hold values entered on the intro form before it was
removed. Dropping a column drops its contents, so this is the account owner's
call rather than a migration's side effect.

**Fix:** check whether any row is non-null in any of the six; if not, drop them
and remove them from the admin export. If so, decide first. ~1 hour once the
answer is known. See [`docs/DATA-COLLECTION.md`](docs/DATA-COLLECTION.md).

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

**Not verified against a database.** The other five routes are covered by the
same reasoning but not by a test each; `trials/next` was picked as the one
carrying real branching logic worth a regression test, not a formality.

### P2 — No integration tests

The transactional answer path and the participant reuse in `session/start` are
verified by hand against a local Postgres. That does not survive the next edit.
This is the largest coverage gap; see [`docs/TESTING.md`](docs/TESTING.md).

**Fix:** a Vitest project with a Postgres service and a migrate-and-seed
fixture. ~4 hours.

### P1 — The actionable half of the couple screen is gated past where anyone reaches

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

**Not verified against a database.** No Postgres in this sandbox — the
statistics are covered by seeded simulation and the component by jsdom tests,
but nobody has seen the new empty states on a real screen with real data.

### P2 — Blind spots now has data, but no human has read it

`PARTNER_GUESS` was silently recorded as `PARTNER` until recently, so the
blind-spots comparison — the sharpest thing the app produces — had nothing
behind it. It does now: verified end to end with two linked accounts, 38 shared
items, five aligned and five diverged rows.

**Fix:** what remains is judgement, not code. Someone has to read real output
and say whether it is worth showing.

### P2 — CSRF/origin check on the mutating routes

Low impact today (no session worth stealing on the anonymous routes) but a free
amplifier for anything else, and the auth routes now do carry a session cookie.

**Fix:** an origin check in the shared route wrapper. ~1 hour.

### P3 — Contrast and a real screen-reader pass

Several small grey labels still sit near the WCAG AA floor on light
backgrounds. Roles, values and announcements are in place, but nothing here
has been driven with an actual screen reader — only read in the markup.

### P3 — `SurveyRunner` drops the email field that `UnifiedRunner` collects

---

## Auth roadmap

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
