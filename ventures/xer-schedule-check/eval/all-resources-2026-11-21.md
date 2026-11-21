# Resources with no assignment, XER to Project XML and back, 2026-11-21

**Question.** The XER to Project XML converter (`msproject.mjs`) writes only
the resources the project's activities use. A Project file often holds
resources with no assignment yet (a tower crane booked for later, a crew on
the bench), and `p6xer.mjs` writes every one of them into the XER's RSRC
table, so on a Project -> XER -> Project trip they, their notes and their
calendars vanished on the way back, with no warning
(`eval/resource-notes-2026-11-21.md`: 11 of 17 Project resource notes did not
come back). A real P6 export also carries resources no activity of the
exported project uses. Does an opt-in "every resource" mode bring them back,
without changing anything else?

## What was built

- `mspdiText(xer, { allResources: true })` (`--all-resources` on the CLI, a
  box under "Open this P6 schedule in Microsoft Project" on the page) writes
  every RSRC row, assigned or not, with its calendar, notes and resource
  UDFs as for an assigned one. Assignments do not change.
- The default stays "only the resources the project uses" (what P6 shows in
  the project's assignments), but it now says what it left out: a warning
  counts the resources with no assignment and names the option. Before, they
  were dropped silently. `counts.resourcesLeftOut` and
  `counts.unassignedResources` give the numbers.

## Data

- The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md` (fetched with
  raw.githubusercontent.com at the commits listed there, not committed).
- Every MSPDI file in MPXJ's test corpus (github.com/joniles/mpxj @ 8c7f83c,
  `junit/data`) with a work or material resource: 66 files, saved by Project
  2002 to 2019 and other tools.

```
node eval/all-resources-check.mjs --xer <six XERs> --mspdi <mpxj>/junit/data --json eval/all-resources-2026-11-21.json
```

## Results

| Check | Default | `allResources` |
|---|---|---|
| Real P6 files: RSRC rows written (of 502) | 469 (33 left out, now with a warning) | 502 |
| ... back in the XER after Project XML, same resource ID, name and type | - | 502 / 502 |
| ... assignment count changed | - | 0 of 6 files |
| Project corpus: work/material resources back in Project XML after the XER (of 890 in 66 files) | 408 | **890** |
| Project resource notes back on the same resource, same text (of 17) | 6 | **17** |
| P6 import problems (`p6Problems`) in the XERs written | 0 | 0 |

All 890 Project resources reach the XER either way; the loss was on the way
back. On the real files the 33 unassigned resources are spread over four of
them (CCA 14, Expressway 13, hotel 5, airport 1); on two of them the extra
resources bring a resource calendar the default did not write (hotel 8 -> 9
calendars, airport 1 -> 2).

No public P6 file has a resource note with text, so the real-file note rows
are 0 of 0; the planted-note checks of `eval/resource-notes-2026-11-21.md`
are unchanged: the default's XML is what it was (only a warning is added),
and on a file whose resources are all assigned `allResources` writes the
same XML byte for byte (`resource-notes.test.mjs`).

## Not checked

- Opening the XML in Microsoft Project itself.
- P6's resource hierarchy (`parent_rsrc_id`): Project has none, so a parent
  resource with no assignment comes across as a flat resource of its own.
