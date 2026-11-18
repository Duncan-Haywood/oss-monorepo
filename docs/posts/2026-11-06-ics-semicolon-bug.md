---
title: "A one-character bug in a calendar file generator"
seo_title: "Escaping semicolons in .ics files: an RFC 5545 bug and its fix"
date: 2026-11-06
tags: [sales-agent, calendar, testing]
description: "The open-source sales agent writes a tentative .ics file when a prospect proposes a time. A semicolon in a name was not escaped."
---

The sales agent reads a proposed meeting time from an interested reply and writes a tentative calendar file. Its escape helper had `.replace(/;/g, "\;")`. In JavaScript `"\;"` is just `";"`, so the replace did nothing and a name like "Ruiz; Dana" or a company "A;B" went into the SUMMARY line unescaped. RFC 5545 requires `\;` there, and calendar apps may split or drop the field.

The fix is `"\;"`, with a regression test that checks semicolons and commas are both escaped. The sales-agent suite passes (202 tests). It only affects names and companies that contain a semicolon, which is rare but real in CRM exports.
