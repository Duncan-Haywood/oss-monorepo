---
title: "Quality fix: a canceled Grant Autopilot plan now stops redrafts too"
seo_title: "Grant writing software: what a canceled plan still does"
date: 2026-11-27
tags: [quality-audit, grant-autopilot, for-customers, grants, nonprofits]
description: "Grant Autopilot checked billing only on a first draft. Redrafts now need a live plan too, and the seller-books audit fixes are on the record."
---

If you use grant writing software, you'll want to know what happens to your
drafts when your plan ends. In Grant Autopilot the answer had a gap until
today, and the
[quality audit of 2026-11-26](../../portfolio/quality/audits/2026-11-26-grants.json)
found it.

## The gap

Every plan includes a set number of new application drafts a month. A draft
takes several model calls: the requirements are read, each section is written
with citations to your own documents, and every claim is checked against
those documents. Asking for a redraft of the whole application, or of one
section, runs the same drafting model again. It doesn't count against your
monthly drafts, because it's still the same application.

Billing was checked only when an application was first drafted. A redraft
skipped that check. So once a subscription was canceled, or a failed payment
ran past its 7-day grace period, the organisation could still redraft its
existing applications, as often as it liked. A paying customer never saw a
difference. But the model work was unmetered for accounts that had stopped
paying, and the 40% margin floor in the cost model held only for accounts that
used it the way a paying customer would.

## What changed

Every redraft now checks the subscription first: the regenerate button for a
whole application or for one section, the automatic redraft after a reviewer
asks for changes, and the redraft after you answer a "needs info" question. A
canceled or lapsed plan gets the same "update billing" message a new
draft already got. Active, trialing and comp plans redraft as before, and
past-due plans keep the 7-day grace period. Editing a section by hand doesn't
call the model, so it isn't gated.

A reviewer's change request on a lapsed plan leaves the application in
"changes requested", with the billing message shown on it, so the request
isn't lost.

## How it is tested

Two new tests run the real entitlement check against a canceled subscription:
a full regenerate and a section regenerate both return 402, and neither calls
the drafter. A third test covers the reviewer path. A billing test checks that
a Starter plan which has used all its monthly drafts can still redraft while
active, and can't once it's canceled or past due. With the two new checks taken
back out of the code, the two pipeline tests fail. That's the test the audit
asked for and didn't find.

## Also recorded today

The [seller-books audit of the same day](../../portfolio/quality/audits/2026-11-26-seller-books.json)
had two high-severity defects in how marketplace orders were matched to
inventory. An order for two items took only one, and a sale could be matched to
an item bought after it. Both had already been fixed the same afternoon
(private PR 367, which added `units.ts` and an end-to-end test using the audit's
own eBay probe), along with the Schedule C unlinked-sales warning (PR 375),
mileage priced at the IRS rate for each trip's date (PR 401) and returned items
going back into stock (PR 385). None of those fixes had been recorded on the
audit, so the fix queue still listed the subject as open. Seven of its nine
defects are now marked fixed. Two are still open: there's no 1099-K
reconciliation beside Schedule C line 1, and eBay's `--` placeholder is stored
as an order number. A later round re-audits both products. This one doesn't
change any scores.

Grant Autopilot drafts are a starting point for your own review, not legal,
tax or funding advice. A funder's own notice of funding opportunity is the
authority on what it requires.
