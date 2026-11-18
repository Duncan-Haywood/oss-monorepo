---
title: "A team called =HYPERLINK(...) should not run in your league's spreadsheet"
seo_title: "CSV formula injection in league schedule exports"
date: 2026-11-06
tags: [league-schedule-generator, security]
description: "The multi-division league scheduler's CSV exports now defuse team and division names that start with =, +, - or @, as the single-division export already did."
---

Team names come from a sign-up form, so anyone can type `=HYPERLINK("http://...","Hawks")` as one. When an organiser opens the schedule CSV in Excel or Sheets, that cell runs as a formula.

The single-division export already guarded against this. The multi-division exports (schedule, season grid, standings) had their own quoting and did not. They now share the same cell writer, which prefixes such cells with an apostrophe. A new test builds a league with `=`, `+` and `@` names and checks that no cell in the schedule or grid CSV starts as a formula. The standings test and the 89 division tests pass.

Not changed: the coach availability sheet, because it is read back by the loader and an apostrophe would break the round trip. Checked on made-up leagues only.
