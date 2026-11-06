---
title: "A staff member named =HYPERLINK(...) should not run in your roster spreadsheet"
seo_title: "CSV formula injection in shift roster exports"
date: 2026-11-06
tags: [shift-roster-builder, security]
description: "The shift roster builder's roster and hours CSVs now defuse names and labels that start with =, +, - or @, and still load back for carry-over and change checks."
---

Staff names and shift labels are free text, and imports from other schedulers bring in whatever the source held. A name like `=HYPERLINK("http://...","Ann")` would run as a formula when a manager opened the roster CSV in Excel or Sheets.

`rosterCsv` and `hoursCsv` now write cells through one function that prefixes such values with an apostrophe (the hours export also quoted only commas before, not quotes or line breaks). The roster CSV is read back for "carry over last week", rest-premium and schedule-change checks, so both readers strip that apostrophe again and a defused name still matches the person.

A new test builds a roster with `=` and `+` names, checks no data cell starts as a formula, and checks the names read back clean. Made-up data only.
