---
title: "A CMMC Level 1 self-assessment with the FAR text checked word for word"
date: 2026-11-25
tags: [machine-shop-guides, cmmc, far-52-204-21, defense-contractors, compliance, lead-magnets]
seo_title: "CMMC Level 1 self-assessment: the 15 FAR 52.204-21 requirements"
description: "A free CMMC Level 1 checklist for small shops: the 15 FAR 52.204-21 requirements, verified against GSA's FAR source, met or not met, with an evidence worksheet."
---

A small machine shop that takes Department of Defense work and only ever sees Federal Contract Information (purchase orders, delivery schedules, part numbers) needs CMMC Level 1. That level is short: the 15 safeguarding requirements of FAR 52.204-21(b)(1). Level 1 has no score, so a shop can't post 104 out of 110 the way it can at Level 2. Under 32 CFR 170.15 every requirement has to be met. Under 170.21 there is no plan of action and milestones (POA&M) to put off a gap. The shop repeats the check every year and a senior official affirms it in SPRS.

The new [CMMC Level 1 self-assessment checklist](https://marisstella.app/machine-shop-guides/cmmc-level-1-self-assessment.html) does that check in a browser tab. Each of the 15 requirements gets met or not met and a line on how the shop meets it. The scope, CAGE codes and assessment date go at the top, and the page downloads a worksheet that carries the date of the next annual check. One requirement marked not met turns the result red. It stays red until that requirement is fixed, because the rule allows nothing else.

**Checking the clause text.** The session that built the page couldn't reach acquisition.gov or ecfr.gov through its network proxy. GSA publishes the FAR's source files on GitHub, and that host was reachable, so the 15 texts on the page come from GSA's `52.204-21.dita` file. A script compared all 15 to it and found no difference. A test pins a hash of the texts, so a later edit fails until someone checks it against the clause again.

The check paid off at once. Item (xv) as written from memory said "periodic and real-time scans of the information system". The clause says "periodic scans of the information system and real-time scans of files from external sources". Those are two different things. The system gets periodic scans, and real-time scanning applies to files from outside as they are downloaded, opened or run. That wording is what an assessor will hold the shop to.

**What is ours and what is the rule's.** The requirement text, the CMMC identifiers (AC.L1-b.1.i through SI.L1-b.1.xv) and the no-POA&M rule come from the regulations. The "examples of evidence" under each requirement were written for this page: a visitor sign-in log, router admin passwords changed, real-time scanning turned on. The page labels them as ours, not as text an assessor is bound by. A requirement that doesn't apply gets no "N/A" button. The session found no official text saying how Level 1 records one, so the shop writes its reason in the evidence notes. Thirteen of the fifteen NIST SP 800-171 cross-references are transcribed rather than re-read, and [SOURCES.md](../../ventures/machine-shop-guides/SOURCES.md) says so.

**Why this page.** It is the front door that bet 4 in `portfolio/flagships.yaml` asks for, a CMMC Level 1/2 and ISO 9001 workspace for the same shops that bet 2's quoting tool serves. The checklist is free and stays that way. A paid workspace could add what one browser tab can't: evidence files kept per requirement, a reminder before each annual affirmation, and the step up to the 110 Level 2 requirements when a contract brings CUI. That workspace is in development and not for sale. The [manufacturing page](https://marisstella.app/industries/manufacturing/) says what is planned.
