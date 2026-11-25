---
title: "A NIST 800-171 SSP template that tells you what an assessor would send back"
date: 2026-11-25
tags: [for-customers, machine-shop-guides, cmmc, nist-800-171, ssp, poam, defense-contractors, compliance]
seo_title: "Free NIST 800-171 SSP template (system security plan builder)"
description: "A free NIST SP 800-171 system security plan template for small shops: fill it in the browser, see what is missing, download the SSP and POA&M."
---

A small shop that handles Controlled Unclassified Information (CUI) for a defense prime has to write a system security plan (SSP). Requirement 3.12.4 of NIST SP 800-171 Rev. 2 asks for it. The DoD Assessment Methodology gives 3.12.4 no points, because without a plan there is nothing to assess: no SSP, no SPRS score. Consultants charge thousands of dollars to write one. Most of the work is the shop describing itself, and only the shop can do that part.

The new [NIST 800-171 SSP template](https://marisstella.app/machine-shop-guides/nist-800-171-ssp-template.html) is a form you fill in, in a browser tab, not a Word file with 110 empty headings.

## What you fill in

**The system.** Purpose, the CUI you handle, the boundary (which people, computers, accounts, cloud services and machines touch CUI), the environment it runs in, the inventory, how a CUI drawing moves from the customer to the spindle to the inspection report, connections to other systems, and users and roles. 3.12.4 names four of these outright: boundaries, environments of operation, how each requirement is implemented, and connections to other systems. The rest is what makes those four readable. The contacts list includes the senior official who will affirm the score.

**Each of the 110 requirements.** A status (met, not met, partially met for MFA and FIPS cryptography, or not applicable), how it is done in your shop, who is responsible, where the evidence is, and who provides it if it isn't you: your managed service provider or your GCC High tenant. Mark something not met and two more fields open, the planned action and a milestone date. Those become the POA&M.

If you already went through the [SPRS score calculator](https://marisstella.app/machine-shop-guides/sprs-score-calculator.html) in the same browser, one button copies those statuses in. Anything you have already written stays as it was.

## What it checks

The page doesn't write implementation statements. It can't know how your shop works, and a plan full of generic sentences is worse than a short true one. What it does is read the plan the way an assessor, or your own affirming official, would, and list what they would send back:

- a 3.12.4 part that isn't described yet: no boundary, no environment, no connections (write "None" if there really are none);
- a requirement marked met with no statement of how, or with nowhere to go and see the evidence;
- not applicable with no reason. 32 CFR 170.24(b) scores a not-applicable objective as met, so the reason has to hold up;
- a gap with no planned action or no date, and milestone or review dates that have already passed.

It also keeps the score with the same arithmetic as the calculator: 110 minus 5, 3 or 1 per gap. It works out the date you expect to reach 110, which a Basic assessment in SPRS asks for, from your latest milestone. If any gap has no milestone, the date stays blank, because a date the plan can't back is one you would be affirming blind.

## What you get

- **The SSP** as one HTML file that prints cleanly and opens in Word or Google Docs, or as Markdown for a wiki.
- **The POA&M** as a CSV with one row per gap, heaviest first: requirement, points, status, the weakness as written, planned action, owner, milestone, provider.
- **A plan file** (JSON) to open next time and keep editing.

Nothing is uploaded. The draft stays in your browser only if you tick the box, and the box is off by default, since an SSP describes your network and a shop PC is often shared. Everything you type is escaped in the downloads, and a test feeds the generator `<script>` and `<img onerror>` in every field to prove it.

## When something does go wrong: the 72-hour clock

An SSP says who handles an incident (3.6.1 and 3.6.2, five points each). DFARS 252.204-7012 says what happens after one, and two of its duties run on a clock. Paragraph (a) defines "rapidly report" as "within 72 hours of discovery of any cyber incident", and the report goes to DoD at dibnet.dod.mil. Paragraph (e) then asks you to keep images of the affected systems and the relevant packet capture data "for at least 90 days from the submission of the cyber incident report". That second clock starts when you file, not when you find the incident, and a shop that reimages a machine first loses what (e) asks it to keep.

The new [DFARS 7012 incident reporting checklist](https://marisstella.app/machine-shop-guides/dfars-7012-incident-reporting.html) works out both dates from the time you discovered the incident and the time you reported it. It lists every step in paragraphs (c) to (m), each with its paragraph: the review, the medium assurance certificate you need before you can file, malware to DC3 and never to the Contracting Officer, the report number a subcontractor gives its prime, and the cloud provider's share. You can keep a timeline as you go and download the record. The clause was read in full from GSA's published DFARS source (version MAY 2024), and a test pins the three quotations on the page to that text. The page doesn't list what DIBNet asks for in the report itself, because that list lives on dibnet.dod.mil, which this session couldn't reach. The page sends you there.

## What it is not

It isn't an assessment, a certification or an SPRS submission. Requirement titles on the page are short paraphrases. The session that built it couldn't reach nist.gov to copy the Rev. 2 text, and NIST's machine-readable catalog covers Rev. 3 only, while CMMC Level 2 is assessed against Rev. 2. So decide each status against the full text of NIST SP 800-171 Rev. 2 and its 800-171A objectives. The page links both.

The template is free and stays free. It is also the first piece of the CMMC and ISO 9001 workspace we are building for the same shops. That workspace keeps the plan, the evidence behind each requirement and the POA&M in one place, with reminders before milestones and review dates and a history of every change. Early access is on the [manufacturing page](https://marisstella.app/industries/manufacturing/).
