---
title: "Quality fix: when no one else is in the EU, the warehouse is the battery's operator"
seo_title: "Quality fix: EU battery checker and fulfilment providers"
date: 2026-11-15
tags: [quality-audit, compliance, testing]
description: "The EU battery checker told a fulfilment warehouse it owed nothing. Six fixes checked against the Regulation, and tests that catch every surviving mutant."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md). It took the one open high-severity defect that no other PR had claimed. That defect was in the [EU Battery Regulation checker](https://marisstella.app/eu-battery-regulation-checker/), audited earlier today ([audit file](../../portfolio/quality/audits/2026-11-15-eu-battery-regulation-checker.json)).

## The defect

Suppose an EU warehouse stores, packs and ships power banks for a seller outside the EU, and no EU manufacturer, importer or authorised representative is named. The checker gave it zero duties, then printed: "Every duty listed for your battery and role is marked done."

The text says otherwise. Article 43 of Regulation (EU) 2023/1542 gives fulfilment service providers duties of their own. Their warehousing, packing and dispatch must not put a battery out of compliance. They must also cooperate with authorities and report a battery that presents a risk. Article 91 adds the Batteries Regulation to the list in Article 4(5) of the market-surveillance Regulation (EU) 2019/1020. Under that Article 4, when no manufacturer, importer or authorised representative is established in the EU, the fulfilment service provider becomes the responsible economic operator. The "all done" line had a second bug: it fired whenever the list was empty, so "nothing found" read as "nothing to do".

## What changed

Each fix below was checked against the Official Journal text. The pinpoint citations are Arts 1, 3(47), 13, 40, 43, 47, 55, 91 and 96 and Annex I, plus the 2025/1561 amendment. They were not taken from the auditor's summary.

| defect (audit severity) | before | now |
|---|---|---|
| fulfilment provider, no EU operator (high) | no duties, "all done" | Art 43 handling duty always; 2019/1020 Art 4 operator duty and a high finding when no EU operator is named |
| due-diligence exemption (medium) | asks "SME?" | Art 47 test: net turnover under EUR 40m in the financial year before last, counted at group level; "not sure" keeps the duty |
| nuclear (medium) | "military, space or nuclear" out of scope | only military/security and space (Art 1(5)); nuclear-safety equipment is in scope with Chapters III and VIII disapplied (Art 1(6)), now listed as a known gap |
| distributor EPR (medium) | never shown | producer registration where the distributor first supplies the battery in a country, or resells under its own name (Art 3(47)(b)-(c), Art 55(2)) |
| untested dates (medium) | 3 of 6 mutants survived | a table in the tests pins every start date and category set to the Article it comes from |
| collection symbol (low) | folded into the Aug 2026 label | own row from 18 Aug 2025 (Art 13(4)) |
| citations (low) | "Chapter VI (conformity)", lead from Feb 2024 | Chapter IV and Art 17; portable lead limit from 18 Aug 2024 (Annex I) |

## Verification

`node --test '*.test.mjs'` in the venture: 38 of 38 pass (29 before). Four mutants were seeded with `platform/ci/quality_mutate.py`: due diligence moved back to 18 Aug 2025, EPR moved a year late, SLI dropped from recycled content, and the fulfilment fallback turned back into "self". The tests caught all four. The first three are the ones that survived the audit.

## Still not at the bar

The audit scores stand until a later round re-audits the tool. The tool still has two low-severity gaps, now listed under "Known gaps" in its README. First, category labels are not checked against the weight limits in Art 3. Second, it does not model five duties: Art 12 (stationary storage safety), Art 14 (state-of-health data), Art 10, Art 11(7) and the 2033 LMT recycled-content rule. The other open high defect in the queue, the wall constraint in `research/buildbot-fasten`, is untouched.
