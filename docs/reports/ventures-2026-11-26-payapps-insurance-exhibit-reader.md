---
kind: milestone
date: 2026-11-26
---
# PayApps: insurance requirements read from the subcontract's exhibit (insurance certificates, part 6)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`), ROADMAP Next #8,
claimed as `claim/payapps/insurance-exhibit-pdf`. Private PR 298 (merged).

## What landed

- `src/shared/insurance-exhibit.ts`: a pure, deterministic reader with no LLM. It takes the
  exhibit's lines (from `pdf/text` via `linesFromPdfText`, or pasted text), joins wrapped
  paragraphs, splits them into sentences and walks the coverage mentions and dollar amounts in
  order. The coverage most recently named owns the amounts after it. Labels are read before the
  amount when one ends right at it (table lines) and after it otherwise (prose). Ignore-labels
  cover products-completed ops, P&AI, medical expense, each employee, deductibles/SIR and
  contract-size thresholds. Endorsements go to the coverages their sentence names, to every
  liability coverage on "all policies" (WC only when named, and only the waiver), or to the current
  block. A negated endorsement is noted and left unticked. "Combination of primary and umbrella"
  sets `umbrellaCounts`.
- The UI is in `components/insurance-requirements.tsx`: `ExhibitReader` sits in the edit form, and
  `mergeExhibitRows` lays the result over the rows. Nothing is stored; the existing PUT saves.

## Limits, on purpose

- The fixtures are written by us in common exhibit shapes. No real GC exhibit was available, so
  the reader is untested on real documents. Part 7 in the ROADMAP is checking it on real exhibits
  once customers share them.
- Exhibits that set limits by contract size: the first amount is kept and a note names the other.
  Picking by the job's contract sum is the next step.
- Two-column PDF layouts may interleave lines. The quote shown with each value is the guard.

## For the next run

Tests: `src/shared/insurance-exhibit.test.ts` and `test/unit/insurance-requirements-ui.test.tsx`.
To extend the vocabulary, add to `KIND_PATTERNS`, `LABELS` or `ENDORSEMENT_PATTERNS`, and add a
fixture sentence with each change.
