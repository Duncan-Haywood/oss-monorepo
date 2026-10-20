# Sales: turn interest into paying customers

Owns `sales/`: pricing, the pipeline, proposals and outreach drafts.

## Files

- `sales/pipeline.csv`: one row per lead: `id,added,source,stage,next_step,
  next_date,value,notes`. Stages: `new, contacted, qualified, proposal, won,
  lost`. **No personal data in git**: `id` is an opaque reference, and names
  and emails live in the CRM or inbox the owner chose (recorded in
  `BUSINESS.md`). Until there is one, record only the source and the stage.
- `sales/pricing.md`: plans, prices and the reasoning (competitor prices with
  links and dates, cost per customer from `finance/`).
- `sales/playbook.md`: who the buyer is, the questions they ask, the answers,
  the objections and the honest replies.

## Each run, pick the highest-value item that is not done

1. The pricing page and checkout path work end to end (with the product
   function if code is needed).
2. A lead in the pipeline has an overdue `next_step`: draft the follow-up into
   `sales/drafts/` and add it to `OWNER.md` (owner sends it), or if the lead
   asked for something a run can produce (a quote, a proposal, an answer),
   produce it.
3. A proposal or quote template, an FAQ answering real objections, an
   onboarding email sequence for people who signed up.
4. Prospect research: lists of organisations that fit the customer
   description, from public sources, with the reason each fits. **Never
   contact them**; the owner decides whether and how.

## Rules

- No unsolicited messages from any run. Drafts are for the owner.
- No discounts, guarantees or commitments the owner has not set in
  `BUSINESS.md`.
