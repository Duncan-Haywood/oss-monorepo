# P6 notebooks as Microsoft Project notes, and back, 2026-11-21

**Question.** P6 keeps an activity's notes as notebook entries: one per
notebook topic (MEMOTYPE: "Description", "Delays", "Anticipated Problems"),
each an HTML fragment, in TASKMEMO (WBSMEMO for a WBS node). Project has one
plain-text Notes field per task. Until today both converters dropped every
entry and counted it ("not carried: 87 notebook entries"). A planner who sends
a P6 file through Project loses the reasons behind dates: the delay notes, the
clause references, the owner's comments. Can the notes go across and come
back on the same activity, under the same topic, with the same text?

## What was built

- `notebook.mjs`: `memoText` reads an entry as text. It handles P6 desktop's
  DHTML editor output, with every line break stored as two 0x7F bytes and a
  `<HEAD>` block, P6 Web's `<HTML><BODY><P>` and plain text. Paragraphs, `<BR>`
  and list items each go on their own line, entities are decoded and markup
  dropped. `memoHtml` writes an entry the way P6 Web does: one `<P>` per line,
  and no tab or line break in the value, so the XER row stays on one line.
- XER to Project XML (`msproject.mjs`): each task's notes hold its entries in
  MEMOTYPE order, each under its topic in brackets:

  ```
  [Description]
  Pour after the cube results.

  [Delays]
  Rain 12-14 March.
  ```

  A WBS node's entries go on its summary task and the project node's on the
  project summary task (Project's project notes). The note this tool already
  wrote on level of effort activities now sits under `[Converted from P6]`,
  and the reader drops that section on the way back.
- Project XML to XER (`mspdi.mjs`, `p6xer.mjs`): a note in that form comes
  back as one entry per topic. Any other note, a Project planner's own,
  becomes one entry under the topic "Notes". MEMOTYPE gets one row per topic,
  with seq_num chosen to agree with the topic order in every note. A body line
  that looks like a heading (`[see RFI 12]` after a blank line) is written
  indented one space, so it stays inside its entry.
- Found along the way: the Project-to-P6 converter saved its XER as UTF-8,
  but P6 and MPXJ read an XER in the Windows code page. MPXJ read "façade" in
  our output as "faÃ§ade", so the bug hit task names as much as notes. The
  file is now saved in Windows-1252 (`xerBytes` in `xer.mjs`). If a character
  does not fit, as with Cyrillic names, it is saved as UTF-8 with a warning.

## Data

- The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md`. Two have
  notebooks. Expressway (P6 7.0) has 86 activity entries and 1 on the
  project's WBS node, all under "Description": mostly short plain-text tags
  ("G1", "Team 2") and one DHTML entry ("Submitted as clause 14"). The 24.12
  example file has 1 entry under "Anticipated Problems". These 88 are every
  real notebook entry we could find.
- Planted: 200 activities and 20 WBS nodes per file (fewer where a file is
  smaller), each given 1 to 3 entries under 5 topics, 2,006 entries in all.
  A seeded generator mixes the three forms (desktop DHTML 40%, Web HTML 35%,
  plain text 25%). The entries include bold and italics, lists, `<BR>`,
  `&amp;`/`&lt;`/`&#176;`/`&nbsp;`, `&#9;` tabs, quotes (doubled in the XER),
  accented letters, an en dash and lines like `[see RFI 30]` after a blank
  line. The generator also writes the text a reader should see, so the
  reader itself is checked. The files go through `xerText` and `parseXer`
  first, so quoting and the 0x7F bytes survive a real file.
- Every task note in MPXJ's MSPDI test corpus (github.com/joniles/mpxj,
  `junit/data`): 5 notes in 3 files saved by Project, one of them on the
  project summary task. Small, but these are the only real ones.

Commands:

```
node eval/notebooks-check.mjs --xer <six XERs> --plant 200 --mspdi <mpxj>/junit/data --write <out> --json eval/notebooks-2026-11-21.json
python eval/notebooks-mpxj.py <out> --json eval/notebooks-mpxj-2026-11-21.json   (pip install mpxj jpype1; MPXJ 16.10.0)
```

## Results

| Check | Result |
|---|---|
| Real entries in the Project XML notes, under their topic, same text | 88 / 88 |
| Real entries back in the XER on the same activity ID / WBS node, same topic, same text | 88 / 88 |
| Planted entries read as the generator meant (`memoText`) | 2,006 / 2,006 |
| Planted entries back in the XER as meant | 2,006 / 2,006 |
| Activities and nodes with 2+ topics whose topic order (MEMOTYPE seq_num) is kept | 700 / 700 |
| Entries added that were not in the source | 0 |
| P6 import problems (`p6Problems`) in the XERs written | 0 on 8 files |
| Project task notes to XER and back to Project XML unchanged | 5 / 5 |

**MPXJ, an independent reader.** MPXJ read the original XER, our Project XML
and the XER written back. It does not cover every file. On the four-project
hotel file it opens a different project from the one converted, and 3 CCA
and terminal WBS names are shared by several nodes, which the by-name match
cannot tell apart. That leaves 894 activities and nodes with 1,713 topic
entries:

- In the XER written back, MPXJ reads the same words as in the original for
  **1,702 of 1,713** entries. Of the 11 others, 2 are the Expressway
  project-node entry, which MPXJ shows on no task in either file. The other 9
  are planted plain-text entries that start with a quote mark: MPXJ reads the
  leading `""` of the original value as the opening of a quoted field and
  drops a quote. That is MPXJ reading the original, not our output.
- Same lines, not just the same words: 1,538 of 1,713. MPXJ reads an entry
  with no markup as HTML, so its 0x7F line breaks become spaces. Ours keeps
  them as lines, and once they are written as `<P>` MPXJ shows them as lines
  too. Which reading P6 itself shows for a multi-line plain entry is not
  known. Every real plain entry we have is one line.
- In the Project XML, MPXJ finds the notes with every `[Topic]` heading on
  889 of 894 owners. The 5 others are the 2 project-node entries and the 3
  shared WBS names above.

**Before this change** all 88 real entries were dropped in both directions,
and the 5 Project notes were dropped on the way to P6.

## Limits

- The text goes across, the formatting does not. Bold, colours, fonts and
  tables are lost, because Project's XML notes are plain text. A table's
  cells come across separated by spaces.
- Not opened in Microsoft Project or imported into P6. We have no seat for
  either. The XML element order follows Project's schema (Notes before
  ExtendedAttribute). The XER tables use the fields P6 7.0 and 24.12 write
  (MEMOTYPE, TASKMEMO, WBSMEMO, from the two public files).
- Whether P6's import matches a notebook topic by name to an existing one,
  or adds a new one, is untested.
- A Project planner's note whose first line is a bracketed word on its own
  (`[TBC]`) is read as a topic named TBC.
- There are few real notebooks: 88 entries, almost all one-word tags. The
  planted set covers forms the real files do not have, from what P6 desktop
  and P6 Web are seen to write.
