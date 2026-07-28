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

### P0 — Nine parallel pull requests, none merged

Nine scheduled sessions opened nine branches off `b887731` within ninety
minutes, each rediscovering the same lint errors and the same conjoint bug.
This branch consolidates the five distinct fixes among them; the other nine
PRs are now superseded and want closing. Only the account owner can merge or
close, so this stays open until they do.

See [`docs/UNATTENDED-SESSIONS.md`](docs/UNATTENDED-SESSIONS.md) for the
standing rule that stops it recurring: read the open PRs before starting.

### P1 — `trials/next` creates a Trial row on every page load

A trial is recorded as "shown" before it has been displayed for any length of
time, so the abandonment metric is currently measuring refreshes and crawlers
rather than people giving up.

**Fix:** only count a trial as shown once it has been on screen briefly, or
reconcile against `msToAnswer` when reading the metric. ~2 hours.

### P1 — No consent notice where data is actually collected

The intro form asks for name, email, sex, age and ethnicity — two of those are
special-category data — and says only that the details let answers be told
apart. The privacy policy exists but is linked from the profile screen, which
someone who never signs in will not see. Goal 5 is "safe to hand to someone you
love", and this is the gap in it.

**Fix:** one line above the form saying what is collected and why, linking the
privacy policy, and drop any field that is not actually used for anything.
~1 hour.

### P2 — Not every route handles its own failures

Six of the remaining route handlers have no `try`/`catch`, so a database error
surfaces as an unhandled rejection with nothing searchable in the log:
`auth/me`, `auth/logout`, `admin/logout`, `financial-trials/next`,
`trials/next`, `surveys/[slug]`.

**Fix:** one wrapper used consistently, one structured log line per failure.
~2 hours.

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

1. `CoupleView` renders those sections only when non-empty, so they vanish with
   no explanation. Someone who answered ninety questions sees a comparison with
   its most useful half silently missing. It should say what it is waiting for,
   the way the overall-match line already does.
2. Nothing tells either partner how much further they have to go, so there is no
   reason to keep answering toward it.

**Fix:** a locked state naming the gap, and a progress signal against it.
~2 hours. Do not fix this by lowering the threshold.

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
- **No tests.** 114 across the numerical core, the couples comparison, the
  client contracts, and the swipe loop itself.
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
