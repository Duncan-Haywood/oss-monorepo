---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): follow-up email drafts to the GC

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#79 (merged).

**What landed.** This is the roadmap item "Weekly email, part 2: a draft follow-up email to the GC
per past-due application". The Cash and retainage page now has a "Follow-up emails to the GC" card.
It lists every past-due or paid-short application, and applications not yet due when asked. Each
gets an editable draft with Copy and "Open in my email" (`mailto:` with no recipient). There are
four drafts, picked by the cash report's own rules:

- **status:** not yet due; checks the GC has it and asks what is missing.
- **reminder:** past due (with no terms set, over 30 days old).
- **second:** over 30 days past due; asks for a release date.
- **balance:** paid short; names what came in and the balance, and asks what the balance is held
  for.

The draft is signed with the user's name and company from `/api/me`.

**Why a buyer cares.** The cash report already says which money is late. The chore the contractor
actually puts off is writing to the GC. Siteline and PayAppHub sell on getting paid faster, so a
correct, polite, specific email in one click is the "faster" part.

**Choices to keep.**

- No LLM and nothing sent. The draft states only the figures the report already shows. It never
  mentions an attachment, a lien right, interest or a legal step, and a test checks this. Sending
  from PayApps would need a GC contact field and would raise deliverability and spam exposure. That
  is listed as next on the roadmap ("a GC accounts-payable contact on the job").
- The drafting is pure, in `src/shared/follow-up-email.ts`. `OutstandingApp` gains `periodTo`
  (the period billed, used in the text).
- The second-request threshold is 30 days past due (`SECOND_NOTICE_DAYS`). With no pay terms, the
  report's 30-days-old rule stands in for the due date.

**Side fix: an unsubscribe token flake.** The full worker suite failed once in `digest.test.ts`.
The test "altered" the HMAC token by setting its last character to `A`, which changed nothing
whenever the token already ended in `A` (1 run in 16). The 43rd base64url character also has two
spare bits that `atob` drops, so four spellings verified as the same signature. Verification now
accepts only the canonical spelling. A unit test (`src/worker/lib/unsubscribe-token.test.ts`) fails
without the fix.

**Verification.** The `payapps-ci.yml` steps were run locally, because the private CI has no
runner: biome ci 0 errors, typecheck clean, unit 264/264, worker 173/173, build, provision 4/4 and
no migration drift. The output summary is in the PR body. No browser screenshot was taken; the
component tests render the panel and click through it.

**Note for the next run.** `add_repo` (push) and one `git clone --depth 1` worked the first time
in this session, in under a minute.
