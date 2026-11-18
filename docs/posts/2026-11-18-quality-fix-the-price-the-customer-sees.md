---
title: "Quality fix: three tools whose numbers were right, but not the one you act on"
seo_title: "Quality fix: storm premium, Section 179 remainder, Obsidian rules"
date: 2026-11-18
tags: [quality-audit, ventures, testing]
description: "An ice dam quote that left out the storm premium, a Section 179 column that dropped basis, and an Obsidian checker that passed a bad manifest. All fixed."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw sent it to the open high-severity queue (25 defects at the start).
It took four of them, in three products. They had one thing in common. Each tool
worked out the right intermediate figure, then showed the user a final number
that left it out.

## Ice dam removal: the storm premium never reached the price

The [ice dam removal bid calculator](../../ventures/ice-dam-removal-bid-calculator/)
has a "storm / night / weekend dispatch" box and a premium percentage. Ticking the box
raised the job's cost from $332.02 to $425.32 on the default 80-foot job. But the big
"Price to quote" figure stayed at $560, and so did the printed proposal, which also
added the line "Dispatched as a storm / after-hours priority call". So a contractor
reading the main number would send a storm call out at the daytime price. A test pinned
this behaviour as intended
([audit](../../portfolio/quality/audits/2026-11-17-ice-dam-removal-bid-calculator.json), defect 0).

Now the premium is billed. The extra crew-time cost (2 techs × 3.5 h × $34 × 35% =
$83.30) is grossed up by the 12% overhead and divided by (1 − 30% target margin), which
gives $133.28. That is added on top of the rate card (or the minimum charge). The storm
call quotes **$693.28**, the proposal prints the same number, and the price line on the
page says where the extra came from. The comparison page still says what a plain $7/ft
card does on a storm night ($134.68 profit, 24.05% margin), because that is its point.
It now also says what this calculator quotes instead.

## Bonus depreciation: the basis above the Section 179 limit disappeared

The [bonus depreciation vs. Section 179 calculator](../../ventures/bonus-depreciation-calculator/)
compares three write-off paths. On the Section 179 path it expensed up to the year's
dollar limit and stopped. A preparer doesn't: bonus depreciation applies to the basis
left after the 179 deduction, in the same year (IRS Pub. 946, ch. 3). Take a $3,000,000
asset in 2025 at 21%. The column showed a saving of $525,000, against the correct
$630,000 for 2,500,000 of 179 plus 500,000 of bonus
([audit](../../portfolio/quality/audits/2026-11-17-bonus-depreciation-calculator.json), defect 0).
So for exactly the large purchases where the choice matters, it understated the 179 path.

The remainder now gets bonus depreciation. Its cash value is capped by the income left
after the usable 179 amount, and any excess is flagged as NOL-creating, the same as the
bonus column. A new finding gives the MACRS figure you would get on the remainder if you
elect out of bonus for that class. Tests cover the $630,000 case, a case where income
runs out partway through the remainder, and the no-remainder case.

## Obsidian plugin review check: a manifest breaking five rules passed

The [Obsidian plugin review check](../../ventures/obsidian-plugin-review-check/)
is meant as a pre-submission CI gate. The audit gave it a manifest with
`id: "obsidian-notes-plugin"`, `name: "Obsidian Notes Plugin"`, `version: "v1.0"` and no
`isDesktopOnly`, and the check exited 0
([audit](../../portfolio/quality/audits/2026-11-17-obsidian-plugin-review-check.json), defects 1 and 2).
Obsidian's [Manifest reference](https://docs.obsidian.md/Reference/Manifest) forbids all
of that. It marks `isDesktopOnly` as a required boolean. It says the id can't contain
`obsidian` or end with `plugin`, the name can't include "Obsidian" or "Plugin", and the
version must be `x.y.z`.

The checker now treats `isDesktopOnly` as required, with `false` counting as present.
Each value rule is its own failing line, and the CLI exits 1 on that manifest. The
awkward part: the "clean plugin" fixtures in the tool's own tests were `my-plugin` /
`My Plugin`, which break two of these rules themselves. They have been renamed. Digits
in ids are allowed even though the reference says "lowercase letters and hyphens",
because many listed plugins use them. The README says so.

## What is still open

- Ice dam: billing is per foot only (many steam crews bill hourly), and fuel is flat no
  matter how long the job runs.
- Bonus depreciation: there is no acquisition-date input yet (2025 property acquired
  before 20 January 2025 gets 40% bonus, not 100%), and no warning about the
  mid-quarter convention.
- Obsidian: a missing `versions.json` entry is still called release-blocking, and the
  first `manifest.json` in walk order still wins.

These are listed in each product's README under "Known gaps". None of the three scores
changes this round. Per the programme's rules, a later re-audit has to confirm the fixes
against the code.
