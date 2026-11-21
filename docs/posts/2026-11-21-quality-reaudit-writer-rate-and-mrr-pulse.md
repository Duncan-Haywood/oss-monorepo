---
title: "Re-audit: two fix PRs that mostly wrote things down, and a per-word vs flat-fee claim that can't be true"
seo_title: "Per-word rate vs flat fee: does research time change which pays more?"
date: 2026-11-21
tags: [quality-audit, evaluation, testing, freelance]
description: "Fix PRs got credit for 19 defects in a writer's rate calculator and a Stripe MRR dashboard. One of them closed a single defect and the other closed two cosmetic ones. Later PRs did the rest, and for one job, research hours never change which offer pays more."
---

The [freelance writer rate calculator](https://marisstella.app/freelance-writer-rate-calculator/) compares a per-word rate with a flat fee for the same piece of writing, turning each into an effective hourly rate once research and revision hours are counted. The [2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-freelance-writer-rate-calculator.json) found seven real defects, plus one about a source file that the deploy step fixes. PR #15342 followed, and the tracker counted every defect as fixed. Today's [re-audit](../../portfolio/quality/audits/2026-11-21-freelance-writer-rate-calculator.json) checked each one against the code on `main`.

## What the fix closed: 1 of 7

- **Closed:** the finding that advised a flat fee right next to a verdict saying the per-word rate paid more ($0.50/word against $400 for a 1,500-word piece, with 4 hours of research).
- **Half closed:** `money()` now pins `en-US` and prints `$0.10` rather than `$0.1`, but a solved rate of $0.0125/word still printed as `$0.01/word`, 20% too low.
- **Only written down:** the headline overclaim, a blank writing speed that silently dropped all writing time ($50/h shown with no warning), two seeded mutations that survived all 42 tests, overstated source wording, and no self-employment-tax view. All five went into the README's "Known gaps" and nowhere else.

The scores came out the same as on 2026-11-13 (claims 1, five dimensions at 2, completeness 3), so the product still doesn't meet the bar.

## The claim that can't be true

The page promised to show "which one actually pays more, not just which headline number looks bigger", and its FAQ said heavy research makes a flat fee "usually pay a higher effective hourly rate than an equivalent per-word rate". For one job, both offers are fixed sums divided by the same hours. The bigger total always has the bigger hourly rate. Across a grid of 144 jobs (three lengths, four rates, three fees, four research loads) the verdict matched the bigger total 144 times out of 144.

The hours do tell a writer two useful things: how far below their target each offer falls, and what price would hit it. The real difference between per-word and flat pricing is who carries the risk. A per-word rate pays more when the piece runs long. A flat fee pays the same however many extra revision rounds the client asks for. The page now says that.

## What changed

The PR that carries this post fixes five of the six open defects, each with a test that fails on the old code:

- the headline and FAQ copy, with a test that rechecks the 144-job grid and that the old sentences are gone;
- a blank writing speed now asks for it and shows no hourly figures;
- solved per-word rates print with up to four decimals (`$0.0125/word`);
- a row showing the hourly rate after US self-employment tax (IRS Schedule SE: 15.3% on 92.35% of net, so the example's $55.56/h is $47.71/h before income tax);
- the ghostwriting premium is now attributed to the single 213-writer survey it comes from, and the entry-level flag is no longer called a consensus.

48 tests pass. The two mutants that survived both audits, plus two new ones, now fail the suite. Still open: length overrun, out-of-scope revision rounds and kill fees aren't modelled, and neither is income tax. Under the programme's rules this round's scores stay as they were, and a later re-audit will score the fixes.

## The second subject: MRR Pulse

[MRR Pulse](https://marisstella.app/mrr-pulse/) is a self-hosted, read-only Stripe dashboard for monthly recurring revenue, churn and net revenue retention. The [2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-mrr-pulse.json) found twelve defects and recorded PR #15653 as the fix. That PR changed a caption, a clone command and the README. Eight later red-team PRs did the real work. The [re-audit](../../portfolio/quality/audits/2026-11-21-mrr-pulse.json) found **5 closed, 5 partly closed, 2 open**. Tests went from 62 to 119. The scores didn't change (correctness, claims and verification 2), so it doesn't meet the bar.

- **Closed by later PRs:** yen and other zero-decimal currencies shown 100 times too small (PR #17099); CSV churn dated at the cancel request instead of the end (PR #16179); coupons missed when Stripe returns only discount ids (PR #17855).
- **Still open, and the worst:** logo churn, the Customers tile and every MRR movement count subscriptions, not customers. A customer who swaps a 5,000 plan for an 8,000 one by cancelling and re-subscribing shows 100% logo churn and 0% NRR, not 160%. The README says so; the page doesn't.
- **Still open:** a downgrade and re-upgrade within one month is booked as 2,000 of contraction plus 2,000 of expansion instead of netting to zero.

An agent did this re-audit. I re-ran its script and reproduced five of its checks (the add-on churn, the plan swap, the tiered 0, the intra-month swing and the stale README line) before accepting the file.

This PR fixes four small things in MRR Pulse, each with a test:

- Tiered (graduated or volume) prices no longer add 0 to MRR without a word. Stripe can't expand price tiers in a subscription list (they sit five levels deep; the API allows four), so MRR still leaves them out, but the dashboard now says how many live items it left out.
- Sub-cent prices are read from `unit_amount_decimal`.
- The browser demo labels NRR as monthly.
- A seeded bug in the quick ratio's reactivation term used to survive every test. A new test now catches it.

It also removes a stale README gap and a stale chart comment. 123 tests pass.

Not tax or financial advice. The calculator works from the hours and prices you enter.
