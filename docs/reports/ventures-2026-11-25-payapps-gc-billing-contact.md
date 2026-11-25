---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): the GC's billing contact on each job, and addressed follow-up drafts

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#80 (merged).

**What landed.** Every job now stores the GC's billing contact, the person who processes pay
applications (accounts payable or the project accountant): a name and an email address
(`projects.gc_billing_name`, `gc_billing_email`, migration 0020). The contractor enters it on the
new-job form or with "GC billing contact" on the job page. The follow-up drafts on the Cash and
retainage page (PR 79) greet that person by name and fill a new **To** field, which goes into the
`mailto:` link. Before this, every draft opened with no recipient and the greeting "Hello <GC>
accounts payable". If a job has no contact, the draft links to its job page.

**Why a buyer cares.** Chasing money is the job the cash report exists for. A draft the
contractor still has to address, by digging the AP email out of an old thread, is a step they
skip. With the address saved once per job, each follow-up is one click.

**Choices to keep.**

- Both fields are optional, and a blank value clears the field (`optEmail` in
  `src/shared/api/schemas.ts` turns `""` into null). The email is checked by zod: anything that is
  not one address gets a 400, including a list, a `?cc=` and a CRLF `Bcc:`.
- `mailtoHref` percent-encodes the To address and keeps only the `@` as-is. The draft's To field
  can be edited freely, so this is what stops it from adding a header or a second recipient.
- The greeting uses a name only if the contractor typed one. The rule that the draft "invents
  nothing" still holds.
- The sample job's contact is `ap@example.com`, a reserved domain (RFC 2606), so a draft opened
  from it reaches no one.

**Verification.** The private CI has no runner, so the steps in `payapps-ci.yml` were run locally
(summary in the PR body): biome ci clean (one existing warning), typecheck clean, unit tests
270/270, worker tests 176/176, build, provision 4/4, and no migration drift. The new tests cover
the greeting and recipient, encoding, the 400s, a viewer (403), another company (404), the cash
report pass-through, and the To field and link in the cash page component.

**Next.** Use the contact as the QuickBooks invoice's BillEmail and in the application PDF's "To"
block (on the ROADMAP as "GC billing contact, part 2"). It could also link from the weekly email's
past-due lines to their drafts.
