# Mechanics Lien Deadline Calculator

A free browser calculator for the two dates that decide whether an unpaid
subcontractor or supplier can still file a mechanics lien: the **preliminary
notice** and the **lien filing**. Entirely client-side; nothing is uploaded.

**Live tool:** https://marisstella.app/mechanics-lien-deadline-calculator/

After using this, you can now **see both deadlines, and how many days are
left, from your own first and last day on the job** — which used to mean
reading a lien-service blog's state table and counting days by hand.

## Why this exists

Verified via WebSearch on 2026-09-30 against lien-service and law-firm
explainers that agree with each other for each state:

- **The first clock starts early, and most people learn about it late.**
  California and Arizona: 20 days after first furnishing. Florida: 45 days.
  Washington: 60 days (10 on new single-family residential). Texas counts
  months instead: the 15th day of the 3rd month after the month of unpaid
  work on commercial jobs, the 2nd month on residential.
- **The second clock depends on completion in some states and on your own
  last day in others.** California: 90 days after completion, or 30 after a
  recorded notice of completion. Arizona: 120 days after completion, or 60
  after a recorded notice. Florida and Washington: 90 days after last
  furnishing. Texas: 15th of the 4th (commercial) or 3rd (residential)
  month after the last furnishing month.

Design choice worth knowing: when a rule runs from project completion and you
do not enter it, the tool uses your last furnishing date, which can only be
the same or earlier — the cautious direction for a deadline.

## Statute check, 2026-11-25

The rules were first taken from lien-service and law-firm explainers. On
2026-11-25 each was compared with the statute text on the legislature's site
(Justia's copy for Georgia and Colorado), read through web-search results
limited to those domains, because this cloud session could not load the hosts
directly. Texas, Florida, Arizona, Georgia and Colorado matched as written.
Three things changed:

- **California citation.** A subcontractor's or supplier's lien clock is
  Civ. Code § 8414 (claimants other than a direct contractor), not § 8412
  (direct contractors, whose notice-of-completion window is 60 days). The
  dates were already right.
- **Washington tiers.** RCW 60.04.031(2)(c) exempts a subcontractor who
  contracts directly with the prime contractor from the notice of right to
  claim a lien, except on repair, alteration or remodel of an existing
  owner-occupied single-family home or garage ((3)(b)). The tool had asked
  every tier for a notice.
- **Late notices.** California (§ 8204), Arizona (§ 33-992.01) and Washington
  let a notice be given late; it then protects work from 20 days (60 in
  Washington, 10 on a new single-family home) before it is given. Florida
  makes a late Notice to Owner a complete defense (§ 713.06(2)(a)). A passed
  date now gives the earliest work date a notice served today still covers,
  or says the state treats lateness as fatal.

Each result links the sections it uses (`sources` in `calc.mjs`).

## Try it

Open [`index.html`](index.html), choose a state, enter your first and last
day, and click **Check deadlines**.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies:

- **`lienDeadlines`** — both dates (and, for Texas, `noticeSchedule`: one notice date per month of work), the rule used, weekend flag with the last
  business day before it as the safe date, days remaining against `today`,
  and findings.
- **`formatDate`, `parseDate`, `daysBetween`** — helpers.

## What this does not cover

- Not legal advice; lien rights are lost by missing a deadline.
- First- and second-tier claimants (added 2026-11-16): the tier changes the result only in Georgia, where a Notice to Contractor is owed only by claimants without a contract with the general contractor. Texas lists one notice date per month of unpaid work and applies the post-2022 (HB 2237) rules, the same for every tier; projects whose original contract predates 2022-01-01 follow older rules this tool does not model. Third-tier claimants, laborers' special rules and Texas retainage notices are not modelled. The 2026-11-16 additions come from agreeing secondary sources found by search; the statute hosts were not reachable from the session.
- Seven states only (California, Texas, Florida, Arizona, Washington, Georgia, Colorado). Colorado added 2026-11-10 from law-firm and lien-service explainers that agree on 4 months and a 10-day notice of intent; checked against § 38-22-109 on 2026-11-25 (its labor-only 2-month, bona fide purchaser and extension wrinkles are flagged in the result). Nevada and Oregon were searched the same day and left out: sources conflict on notice-of-completion and notice timing.
- No public-project bond claims, no holidays, no notice content or delivery
  rules, no foreclosure deadlines.
- Point-in-time figures; statutes change.

## Disclaimers

Not legal, tax, or financial advice. It is not a substitute for the current
statute or a qualified construction attorney. Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never changes
what this tool does.

## Privacy

Everything runs in your browser. Dates are **never uploaded**. Anonymous
feature events (`deadlines_checked`, `example_loaded`) are counted in
`localStorage` only; Do Not Track and Global Privacy Control are honoured and
a button turns counting off.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml).
