# P6 resource notes as Microsoft Project resource notes, and back, 2026-11-21

**Question.** P6 keeps a free-text note on each resource (`RSRC.rsrc_notes`,
rich text from P6's editor: "rate per union agreement", "foreman's phone",
"hire from depot B"). Project has a plain-text Notes field on each resource.
Until today the XER to Project XML converter (`msproject.mjs`) dropped every
resource note, and the Project XML to XER converter (`p6xer.mjs`) wrote
`rsrc_notes` empty, with no warning either way. Do the notes now go across
and come back on the same resource with the same text?

## What was built

- XER to Project XML: each written resource's `rsrc_notes` is read with
  `memoText` (the notebook reader of `notebook.mjs`: P6 desktop DHTML with
  0x7F line breaks, P6 Web HTML, or plain text) and written as the
  resource's `<Notes>`, after `<CalendarUID>` and before any
  `<ExtendedAttribute>`, as Project's schema orders them. P6's empty editor
  shell (`<HTML><BODY></BODY></HTML>`) reads as no note and writes nothing.
  A warning counts the notes written.
- Project XML to XER: a work or material resource's `<Notes>` becomes
  `rsrc_notes` in the HTML P6 Web writes (`memoHtml`: one `<P>` per line, no
  tab or line break in the value, so the XER row stays on one line). A cost
  resource becomes P6 expenses, which hold no notes, so its note is counted
  as not carried in the warnings instead of vanishing.
- The seeded memo generator moved out of `eval/notebooks-check.mjs` into
  `eval/memo-plant.mjs` so both checks share it; the notebook check gives
  the same JSON byte for byte after the move.

## Data

- The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md`. Their projects
  write 469 resources. Three have a non-empty `rsrc_notes`: two on CCA (one
  a full P6 desktop DHTML document with no body text, one an empty shell)
  and one empty shell on the hotel file. None holds any text, so the real
  P6 side checks only that shells write no note.
- Planted: up to 100 written resources per file given a note from the same
  generator as the notebook check (P6 desktop DHTML 40%, P6 Web HTML 35%,
  plain text 25%; bold, italics, lists, `<BR>`, entities, `&#9;` tabs, quotes
  doubled in the XER, accented letters), 241 notes on five files (the 20.12
  sample has no resources). The files go through `xerText` and `parseXer`
  first, so quoting and the 0x7F bytes survive a real file.
- Every resource note in MPXJ's MSPDI test corpus (github.com/joniles/mpxj,
  `junit/data`): 17 notes in 8 files saved by Project 2002 to 2019,
  including one with blank lines and a bulleted list, and CDATA sections.
  None is on a cost resource.

Commands:

```
node eval/resource-notes-check.mjs --xer <six XERs> --plant 100 --mspdi <mpxj>/junit/data --write <out> --json eval/resource-notes-2026-11-21.json
python eval/resource-notes-mpxj.py <out> --mspdi <mpxj>/junit/data --json eval/resource-notes-mpxj-2026-11-21.json   (pip install mpxj jpype1; MPXJ 16.10.0)
```

## Results

| Check | Result |
|---|---|
| Real P6 resource notes with text | 0 of 469 written resources (3 empty shells, none written as a note) |
| Planted notes in the Project XML, read as the generator meant | 241 / 241 |
| Planted notes back in the XER on the same resource ID, same text | 241 / 241 |
| Notes added that were not in the source | 0 (XML and XER) |
| Project resource notes (MPXJ corpus) in the XER, same text | 17 / 17 |
| ... and back in Project XML, of those whose resource has an assignment | 6 / 6 |
| P6 import problems (`p6Problems`) in the XERs written | 0 |

**MPXJ, an independent reader.** MPXJ read the original XER, our Project XML
and the XER written back; it matches resources by name, so the 241 planted
notes are 199 resources with a unique name.

- Same words in the Project XML and in the XER written back: **197 of 199**.
  The 2 others are planted plain-text notes that start with a quote mark:
  MPXJ reads the leading `""` of the original value as the opening of a
  quoted field and drops a quote, the same reading the notebook check found.
  That is MPXJ reading the original, not our output.
- Same lines: 180 of 199. MPXJ reads a plain-text note's 0x7F line breaks as
  spaces; ours keeps them as lines, and once written as `<P>` MPXJ shows
  them as lines too. Which P6 itself shows is not known.
- Project's 17 resource notes as MPXJ reads them from the source XML and
  from our XER: **17 of 17** the same words and the same lines.

**Before this change** every resource note was dropped in both directions
with no warning.

## Limits

- 11 of the 17 Project notes do not come back to Project XML after the trip
  to XER, because their resources have no assignment, and `msproject.mjs`
  writes only the resources a project's activities use (a P6 file's resource
  dictionary is often shared by many projects: CCA's 119 resources, 105
  used). This is the converter's existing rule, not a notes rule; it is
  listed in NEXT.md.
- No public P6 file has a resource note with text, so the P6 side rests on
  the planted set, built from what P6 desktop and P6 Web write in notebooks
  (the same editor).
- The text goes across, the formatting does not (Project's XML notes are
  plain text).
- Not opened in Microsoft Project or imported into P6. Whether P6's import
  takes `rsrc_notes` when the resource already exists in the target
  database is untested.
- The generator gave two Expressway resources the same planted note (its
  shuffle comparator reuses the stream); each is matched by its own
  resource ID, so it does not change a count.
