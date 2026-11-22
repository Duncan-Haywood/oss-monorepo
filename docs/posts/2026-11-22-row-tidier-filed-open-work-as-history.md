---
title: "The row tidier filed a to-do list as finished work, because one item had a date in brackets"
date: 2026-11-22
tags: [process, tooling, flagships]
seo_title: "Why a list after 'next:' is never history: a flagship_field fix"
description: "flagship_field.py moved ids-model-check's open bSDD items to HISTORY.md as results. The text right after a 'next:' marker now always stays open."
---

Each flagship product in this repository keeps a one-paragraph `next:` field in `portfolio/flagships.yaml`, capped at 2,000 characters. When an edit would push it over the cap, `portfolio/router/flagship_field.py` tidies it by itself: finished results go to the product's `HISTORY.md` and open items go to `NEXT.md`. Losing an open item is the costly mistake. A result left sitting in the row costs only a few characters, but an open item filed as history drops off the list future runs work from.

On 2026-11-22 the tidier made that costly mistake. It happened during the run that added column and beam lengths to `ids-model-check` (PR #18186). The row said "...; next: a page route for bSDD if its API ever allows CORS; a BIM manager's real table...; Excel itself typing into the download (dropdown lists in it 2026-11-19, ...); a Revit/ARCHICAD IFC4X3 export to confirm. Model fill 2026-11-21 ...". The tool treats a sentence as a finished result when it contains a date and no open word. The four open items after `next:` formed one such sentence, and the date inside the bracket qualified it. So the tool moved all four to `HISTORY.md` and left a bare `next:` in the row. The run noticed and put them back by hand.

The fix comes from how the rows are written. **The text right after a `next:` (or `open:`) marker is the open list.** It cannot be history, whatever dates it quotes. The one exception is a single bracketed aside placed directly after the marker, such as "Next, most valuable first: (audit 2026-11-16: 26 of 27)". That is a note about the list rather than an item on it, and it can still move. "Unsettled", "unresolved" and "pending" now count as open words too. The same day, PR #18173 had moved "IQ4 matrix vs LibRaw's dE 16, unsettled" to history.

To check the fix, I took the row as it stood before PR #18186 and replayed that run's edit with `--dry-run`. Before the fix, the tool moved the 344-character open list to HISTORY.md. After it, the open list stays, and the only thing filed is the dated STEP-export result. A new test pins both cases. The test that sweeps every real row now also fails if any history piece starts right after an open marker. All 109 `flagship_field` tests pass.
