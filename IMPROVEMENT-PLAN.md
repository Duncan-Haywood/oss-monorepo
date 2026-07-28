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

### P1 — Anonymous row creation is unbounded

`session/start` inserts one participant per survey with no rate limit and no
dedupe for a signed-out visitor. A loop against the public URL fills the table.
Signed-in accounts now reuse their participants, so this only affects anonymous
sessions.

**Fix:** rate-limit by IP. The pattern in `adminAuth.ts` generalises. ~2 hours.

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

Seven of the twenty-four route handlers have no `try`/`catch`, so a database
error surfaces as an unhandled rejection with nothing searchable in the log:
`auth/me`, `auth/logout`, `admin/logout`, `participants`,
`financial-trials/next`, `trials/next`, `surveys/[slug]`.

**Fix:** one wrapper used consistently, one structured log line per failure.
~2 hours.

### P2 — No integration tests

The transactional answer path and the participant reuse in `session/start` are
verified by hand against a local Postgres. That does not survive the next edit.
This is the largest coverage gap; see [`docs/TESTING.md`](docs/TESTING.md).

**Fix:** a Vitest project with a Postgres service and a migrate-and-seed
fixture. ~4 hours.

### P2 — The runner has no tests and mirrors storage into state

`UnifiedRunner` is the core loop and is untested. Its bootstrap still copies
localStorage into component state inside an effect — the two remaining
`react-hooks/set-state-in-effect` suppressions in the codebase are both there.

**Fix:** move it onto `useSessionBundle` the way `ProfileView` and
`InsightsView` already are, deriving `phase` and the domain list from the store
rather than mirroring them. Do it with a jsdom test in place, not before.
~4 hours.

### P2 — Blind spots has never been seen with real data

`PARTNER_GUESS` was silently recorded as `PARTNER` until recently, so the
blind-spots comparison — the sharpest thing the app produces — has never had
anything behind it. The code path is exercised; the output is not.

**Fix:** two accounts, three perspectives each, and an actual look at what comes
out. Not a code change until then.

### P2 — CSRF/origin check on the mutating routes

Low impact today (no session worth stealing on the anonymous routes) but a free
amplifier for anything else, and the auth routes now do carry a session cookie.

**Fix:** an origin check in the shared route wrapper. ~1 hour.

### P3 — Accessibility

- Progress bars have no `role="progressbar"` or aria values.
- Errors are not announced (`aria-live`).
- The Persian copy has no `lang`/`dir="rtl"`, so screen readers apply English
  phonetics to it.
- Celebration emoji are not `aria-hidden`.
- No `prefers-reduced-motion` opt-out for the flying cards.

### P3 — Contrast

Four spots fail WCAG AA; the worst is the small grey topic line at about 2.6:1.

### P3 — Fonts

Geist is loaded and then overridden by a hard-coded Arial in `globals.css` —
two font files downloaded and used nowhere.

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
- **No tests.** 89 across the numerical core and the client contracts.
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
