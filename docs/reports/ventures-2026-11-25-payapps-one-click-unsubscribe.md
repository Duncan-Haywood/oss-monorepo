---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): one-click unsubscribe for the weekly "money to chase" email

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#77 (merged).

**What landed.** This was the first item under "Must do before a public launch" in the payapps
ROADMAP, and it is now done. Every weekly cash-report email carries a signed "Stop this weekly
email" link to `/unsubscribe`, which works without signing in. It also carries the RFC 2369/8058
headers `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, so Gmail,
Outlook and Apple Mail show their own unsubscribe button.

**Why it mattered.** Before this, a member could only turn the email off from the signed-in Cash
page. A recurring email with no working unsubscribe link carries CAN-SPAM risk and gets marked as
spam. Spam reports hurt deliverability for the whole sending domain, including the
password-reset and verification mail that sign-up depends on.

**Choices to keep.**

- The token is an HMAC-SHA256 under `AUTH_SECRET` over a version label plus the company and member
  ids (`apps/payapps/src/worker/lib/unsubscribe-token.ts`). It is checked with
  `crypto.subtle.verify`, which compares in constant time. There is no table and no expiry, because
  RFC 8058 asks that the link keep working. A link can only stop one member's email for one
  company.
- `GET` only reads, because mail scanners and link previews open links. `POST` unsubscribes, and
  both the mail app's one-click and the page's button send it. The POST ignores the form body
  (`List-Unsubscribe=One-Click`) and takes its parameters from the query string. A bad token
  returns 404.
- The email port now passes extra headers to Cloudflare's `send_email` binding, but only the two
  names in `ALLOWED_HEADERS`, each value cut to one line. Any other name throws an error, so the
  port cannot be used for header injection.
- When `AUTH_SECRET` is missing or shorter than 32 characters (local dev), the email has no link
  and keeps the old "turn it off on the Cash page" footer.
- `/unsubscribe` is exempt from the legal-acceptance gate in `layout.tsx`, so the link works even
  for a signed-in member who has not accepted the current terms.

**Verification.** The private `payapps-ci.yml` has no runner, so its steps were run locally:
typecheck and biome are clean and the build passes. Unit tests: 245/245 in the full suite, plus
the 2 new page tests run on their own. Worker tests: 172/172, including a new end-to-end digest
test (headers present, GET changes nothing, forged, altered and missing tokens return 404, a
form-encoded POST with no session works, a second POST is harmless, the other member still gets
the email) and a header-allowlist test for the email port.

**Next.** The rest of "Weekly email, part 2": a choice of weekday, and a draft follow-up email to
the GC for each past-due application. The other launch must-dos (deploy, Paddle, Intuit, legal
review) are owner steps.

**Gotcha for the next run.** A remote branch named `claude/payapps-digest-unsubscribe` already
existed in private-monorepo, holding one stale commit from an earlier run. Pick a distinctive
branch name, or check with `git ls-remote` first.
