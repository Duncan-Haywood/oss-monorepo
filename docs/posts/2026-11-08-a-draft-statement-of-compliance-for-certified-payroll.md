---
title: "A draft Statement of Compliance for the certified payroll worksheet"
date: 2026-11-08
tags: [construction, payroll, certified-payroll-calculator]
description: "The WH-347 worksheet now writes a draft Statement of Compliance from the week it just checked, listing underpayments as exceptions."
---

The certified payroll worksheet filled the WH-347 columns and checked each worker against the wage determination, but left the back page, the signed Statement of Compliance, entirely to the user. It now drafts one under the report.

`buildCompliance` reads the finished report. It names any apprentices or trainees, says whether fringe went to plans, cash or both, and lists every worker paid below the determination as an exception with the dollar shortfall. `readyToSign` is true only when there are no exceptions and the report itself raised no flags.

Limits: the text is a paraphrase of what the signer certifies, not DOL's wording, and the page says so; the user copies the signed version from the official form or their agency. Apprentice registration, plan qualification and which determination applies are still not checked. The tests use the made-up sample week and one hand-built clean week; no real payroll has been run through it.
