# Improvement plan

Status as of this review: the survey flow works end-to-end locally (5 surveys, Glicko-2 +
conjoint models both self-tested, swipe UI, adaptive question selection). What follows is
everything between "works on my laptop" and "trustworthy enough to send to Seti and rely on
the numbers."

Ordered by importance. P0 = do before sharing the link with anyone.

---

## P0 — Blocking. The data is not trustworthy until these are fixed.

### 1. Ratings are global and anyone can move them
**What:** `Item.rating` is a single shared value per item, not per-person. Every answer from
any visitor mutates the same numbers. The link is public with no auth, so one person with
curl (or a bored stranger, or a crawler) can drive every ranking to whatever they want in
seconds, and the UI will then display that corrupted ranking at ~100% confidence.

**Why it matters most:** this defeats the entire purpose. You want *Seti's* preferences. Right
now the schema cannot express "Seti's ranking" — it only has "the ranking," mixed across
everyone who ever opened the URL. Even with zero malice, if you open it to try it yourself,
your taps and hers are now the same dataset with no way to separate them.

**Fix:** move rating state per-participant. Add a `ParticipantItemRating` table keyed by
(participantId, itemId) and compute rankings per person. The per-trial before/after snapshots
already stored on `Trial` mean nothing is lost historically. Roughly a half-day of work,
including a migration and updating the two `next`/`answer` routes.

**Cheaper interim option:** keep global state but gate the whole app behind a secret link
token, so only someone with the URL can write. Weaker (still can't separate two people) but
an hour of work.

### 2. Her name, email, age, sex, and ethnicity are hard-coded in the source
**What:** `DEFAULT_INTRO` in both runner components contains real PII, committed to the repo
and shipped in the client JS bundle. Anyone who opens the public page and hits devtools has
it. There's also no `noindex`, so a search engine can index a page displaying her name.

**Why it matters:** it's a real person's personal data (including two special-category fields,
ethnicity and sex) published to anyone who visits, with no consent notice anywhere in the app.

**Fix:** move the prefill behind a URL parameter or a signed invite link instead of a source
constant — `?for=<token>` resolves server-side to the prefill. Add `robots: noindex`. Add one
line of consent copy above the form. ~1 hour.

### 3. Double-submit and lost-update races on ratings
**What:** `trials/answer` reads item ratings *outside* the transaction and writes absolute
values back, so two concurrent answers on the same item silently discard one update. The
"already answered" check is also check-then-act, so a retry can apply the same answer twice.

**Fix:** `updateMany({ where: { id, result: null } })` and bail if `count === 0`; move the item
reads inside the transaction. ~1 hour.

### 4. One-line denial of service on `/api/session/status`
**What:** it accepts an arbitrary, uncapped map of participant IDs and fires a `Promise.all` of
DB queries over all of them. A 5 MB request body means hundreds of thousands of concurrent
queries and the site goes down. It also accepts non-string values, which crash the route.

**Fix:** cap the map at ~20 entries, validate every value is a string, before touching the DB.
15 minutes.

---

## P1 — Will break or mislead you in normal use.

### 5. The model refit gets slower forever
`refitSurvey()` runs on *every* financial answer and re-fits from the entire history:
~3,500–4,700 full passes over every stored trial, synchronously, inside the request. At 500
trials that's millions of row-evaluations blocking the answer. Answer latency climbs linearly
until it times out. Also, the convergence tolerance is absolute, so past a certain N it can
never converge and always burns all 60 iterations.

**Fix:** refit on a threshold (every N answers) or in the background rather than every answer;
switch to a relative gradient tolerance. Also a real bug in the line search: if 20 halvings all
fail it assigns the worse point anyway instead of keeping the current one. ~2–3 hours.

### 6. Two dead-end error states
- If a "next question" fetch fails, the UI shows an error over a permanent "Loading next…"
  with no retry — hard refresh is the only escape.
- If an answer submit fails *after* the server committed it, retrying returns 409 forever.
  Permanently wedged.

Both are very likely to happen in real use on a phone with flaky signal.
**Fix:** retry affordance, and treat 409 as "already recorded, move on." ~1 hour.

### 7. The progress/confidence numbers are wrong per-person
Confidence is computed survey-wide, not per participant, so a second visitor sees someone
else's progress as their own. Falls out of fix #1.

### 8. Missing indexes and full-history scans in hot paths
Five composite indexes are missing for queries that run on every single question
(`(participantId, answeredAt)`, `(participantId, shownAt)`, `(participantId, result)`, etc).
Separately, `trials/next` loads *every* prior trial for the participant on each question just
to count and then discard all but the last 10 — O(n²) over a session.
**Fix:** add the indexes; add `take` limits and let the DB do the counting. ~1–2 hours.

### 9. Unbounded anonymous row creation
`session/start` inserts 5 rows per call with no rate limit or dedupe. `trials/next` creates a
Trial row on *every page load* before any answer — which also means the drop-rate metric you
asked for is currently measuring refreshes and bots, not abandonment.
**Fix:** rate-limit by IP (the pattern already written in `adminAuth.ts` generalizes); only
count a trial as "shown" once it's actually been displayed for a moment. ~2 hours.

---

## Auth roadmap

Email + password is built (bcrypt, hashed session tokens in HTTP-only cookies,
per-email and per-IP rate limiting). The remaining methods each need setup only you
can do, listed in the order I'd add them:

1. **Google OAuth** — you create a Google Cloud project, configure the OAuth consent
   screen, and hand me a client ID + secret; redirect URI must point at the final
   deployed domain. Cheapest big win: most users have a Google account and it removes
   password friction entirely. ~3 hours once credentials exist.
2. **Passwordless email magic links** — needs an email service (Resend is the easiest;
   free tier is fine) plus DNS records if you want to send from your own domain.
   Also unlocks password reset, which the current password login lacks. ~4 hours.
3. **Sign in with Apple** — Apple Developer Program ($99/yr), a Services ID, a private
   key, and domain verification. Worth it mainly if this becomes a real iOS app, where
   Apple requires it alongside other social logins. ~4 hours after enrolment.
4. **Optional TOTP 2FA** — pure JS (`otpauth` + `qrcode`), no external service, no cost.
   Opt-in from settings, with single-use recovery codes. ~3 hours, can be done anytime.

Account linking matters here: whichever methods get added should attach to the same
`User` row by verified email, so signing in with Google and with a password lands you
in the same account rather than silently creating a duplicate.

## P2 — Missing pieces you've already asked for.

### 10. The admin portal does not exist
The route directories are empty. `adminAuth.ts` (login, session tokens, rate limiting) is
written and tested-by-eye but imported by nothing; `AdminLoginAttempt` is never written to;
`ADMIN_KEY` guards nothing. **There is currently no way to read the results except psql.**
~3–4 hours for login + rankings view + CSV export.

### 11. The results/insights page does not exist
`UnifiedRunner` links to `/r/{token}`, that route doesn't exist (hard 404), and nothing ever
issues a token. The link is inert dead code today. This is also the thing that makes the survey
worth continuing for her — per your own point, there has to be a real payoff. ~4 hours.

### 12. No tests
~800 lines of pure numerical code (Glicko-2, the conjoint fitter, pairing, trade-off
generation) with zero automated tests. All four modules take an injectable RNG — they were
written to be testable. A sign error in the volatility solver would be invisible. I've verified
each by hand once; that doesn't survive future edits. ~3 hours for meaningful coverage.

### 13. No error boundaries, no logging, no monitoring
Not one `try/catch` in any of the 8 API routes; no `error.tsx` anywhere. When something breaks
in production you get a blank screen and no signal that it happened. ~2 hours.

---

## P3 — Polish.

- **Accessibility:** progress bars have no `role="progressbar"`/aria values; errors aren't
  announced (`aria-live`); the Persian text has no `lang`/`dir="rtl"` so screen readers apply
  English phonetics; celebration emoji aren't `aria-hidden`; no `prefers-reduced-motion` opt-out
  for the flying cards.
- **Contrast:** four spots fail WCAG AA, worst is the small grey topic line at ~2.6:1.
- **4 eslint errors** (`set-state-in-effect`) — all the same root cause, localStorage read in an
  effect mirrored into state. The `loading` phase exists only to paper over it.
- **Deployment gap:** the build script never runs `prisma migrate deploy`, so a deploy can build
  against a schema the database doesn't have.
- **README** is still create-next-app boilerplate — no env vars documented, no setup steps.
- Loaded Geist fonts are overridden by a hard-coded Arial in `globals.css` — two fonts
  downloaded and used nowhere.
- `SurveyRunner` silently drops the email field that `UnifiedRunner` collects.
- No CSRF/origin check on the mutating routes (low impact — no session to steal — but it's a
  free amplifier for #1).
- Everything is still one uncommitted working tree on top of the initial commit.

---

## Suggested sequence

1. **Before sending her the link at all:** #1, #2, #3, #4 (~1 day).
2. **Before relying on the numbers:** #5, #6, #7, #8, #9 (~1 day).
3. **To make it worth her time and readable by you:** #10, #11 (~1 day).
4. **To keep it working:** #12, #13, then P3 polish.

The single highest-value item is **#1** — without it, the ranking is not "Seti's ranking," and
that's the whole deliverable.
