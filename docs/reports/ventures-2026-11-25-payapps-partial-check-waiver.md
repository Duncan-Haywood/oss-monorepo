---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) asks for the partial check's unconditional waiver, for the money received only

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#89 (from the PayApps
roadmap's "Next": "the unconditional-waiver reminder for a payment received short").

**Why this slice.** PayApps already asked for the unconditional waiver once an application was
paid in full. When a GC pays part of an application, the usual next step is that the GC wants the
unconditional waiver for that check before it releases the next one. Until now PayApps stayed
silent while any balance was owed, so a subcontractor could be waiting on money because of one
missing piece of paper.

**What landed.**

- `waiversToSend` now covers submitted and certified applications that have money received and a
  conditional progress waiver marked sent. It asks for the unconditional **progress** waiver for the
  amount received, less any unconditional progress waivers already sent.
- It never asks for a final waiver while money is owed.
- An unconditional final waiver that was already sent, or a sent waiver with no amount recorded,
  counts as settling it. Utah, whose statute has no unconditional form, is still left out.
- On the pay-app page, the unconditional progress waiver is preselected and its amount is prefilled
  with the money received.
- The cash report and the weekly email count it too. Their wording names the amount received and
  says "never the balance still owed".
- Once the rest is paid, the existing rule asks only for the later check's waiver.

**Gotcha for the next run.** In `services/payapps/bundle.ts`, `paidAmountOf` returns the *expected*
amount (certified, else line 8) for an application that is still open, not the money received. If
you need the money received, use `receivedCents(paymentsOf(b, id))` from `@shared/payments`.

**Next on the waiver line.** California's statutory forms (Civ. Code §§ 8132-8138), once an
official copy can be read, are still the largest gap.
