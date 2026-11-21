# Activity codes in the Microsoft Project XML, 2026-11-21

**What changed.** `msproject.mjs` used to drop every P6 activity code
assignment when it wrote an XER as Microsoft Project XML, and only counted
them in the warnings. Activity codes are how P6 users group and filter a
schedule (Phase, Area, Responsibility, Trade), so a Project user who received
the file lost the views the scheduler built. Now each code type the project's
activities use becomes one of Project's spare task text fields, Text2 to
Text30, renamed (`Alias`) to the code type's name, and each activity's field
holds its code. `mspdi.mjs` reads task text fields back as activity codes, so
a converted file, and any Project file with custom text columns, groups by
them in the Gantt and the review.

Choices, each with its reason:

- **Text fields, not outline codes.** Outline codes carry P6's hierarchy and
  descriptions, but their MSPDI form (lookup tables, masks) is the part of the
  schema readers disagree on most, and this file was not opened in Project
  itself. Text fields are read by every MSPDI reader checked (this tool and
  MPXJ) and group and filter the same way in Project.
- **The leaf code, as P6 shows it in the column**, unless a code type uses
  the same leaf code under two parents. Then it writes the whole path
  (`parent.child`). Leaf codes alone would have merged distinct values in
  Project: 3 of the 29 code types written for the CCA file repeat a leaf
  under different parents (4 of its 39 types; 174 values share a leaf). The
  first run of this eval compared leaf codes only and passed, so it missed
  the merge. It was found while checking descriptions, and the eval now also
  checks that no two P6 values land on one Project value.
- **Descriptions on request** (`--code-names` on the CLI, a box on the page):
  the field holds `code - description`. The reader splits that form back when
  no code in the field carries two different descriptions. A value with no
  description is written as the bare code, so the split rule allows those
  (the first rule needed every value split and failed on CCA, 222,629 of
  257,110).
- **29 fields.** Text1 holds the activity ID. A file with more code types
  keeps the 29 with the most assignments (P6's order breaks ties) and names
  the rest with their counts.
- **Field names.** Brackets become parentheses, because Project formulas name
  fields in brackets. Two code types with the same name get their type id
  appended. The reader skips a text field holding a different value on every
  task (more than 20 tasks), since that is a note column, not a code. It also
  skips the Text1 named "Activity ID".

## Method

`eval/msproject-codes.mjs` writes each XER with `mspdiText`, reads the XML
back with `parseMspdi`, and checks every activity code assignment of the
project's activities: same code type (by the field's alias), same code (the
leaf, or the path for a type that needs it) and, with `--code-names`, same
description (trimmed, as MSPDI values are read). It counts any P6 value that
lands on two Project values (split) or two P6 values that land on one
(merged). `--xml-dir` saves the XML. `eval/msproject-codes-mpxj.py` reads it
with MPXJ 16.10.0 (an independent open-source reader) and dumps every text
field by alias and activity ID. `--mpxj` compares that with what was meant to
be written: the alias of every field and the value of every cell.

Data: the four public XER files that carry activity codes, from the six in
`eval/cpm-vs-p6-2026-11-19.md` (Expressway and sample.xer carry none).

```
node eval/msproject-codes.mjs <xer files> --xml-dir D
python eval/msproject-codes-mpxj.py D/<file>.xml D/<file>.mpxj.json   # each file
node eval/msproject-codes.mjs <xer files> --mpxj D --json eval/msproject-codes-2026-11-21.json
node eval/msproject-codes.mjs <xer files> --code-names
```

## Results

| File | Code types in file | Text fields written | Assignments written | Read back, same code | With descriptions | Merged / split | MPXJ aliases | MPXJ values | Left out (past 29) |
|---|---|---|---|---|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC.xer | 39 (37 used) | 29 | 257,535 | 257,535 | 257,535 | 0 / 0 | 29/29 | 257,535/257,535 | 1,416 in 8 types |
| example_xer_file.xer | 3 | 3 | 436 | 436 | 436 | 0 / 0 | 3/3 | 436/436 | 0 |
| hotel-project.xer | 5 | 5 | 18,020 | 18,020 | 18,020 | 0 / 0 | 5/5 | 18,020/18,020 | 0 |
| terminal-building-airport.xer | 1 | 1 | 51 | 51 | 51 | 0 / 0 | 1/1 | 51/51 | 0 |
| **Total** | 48 (46 used) | 38 | **276,042** | **276,042** | **276,042** | 0 / 0 | 38/38 | 276,042/276,042 | 1,416 |

MPXJ read no text value that was not meant to be written (276,042 values in
all). Every field ID msproject.mjs uses for Text2 to Text30 therefore lands
on the text field it names: MPXJ maps field IDs to fields from Microsoft's
own table, and all 29 CCA aliases landed. The round trip of everything else
is unchanged (`eval/msproject-check.mjs` on the six files: 21,422 of 21,422
activities intact, 54,843 of 54,843 links, schedule equal on 19,818 of 19,822
under Project's rules, as on 2026-11-21 before this change).

Seen on the way: one CCA description ends in a space ("Temporary "), and the
MSPDI value comes back trimmed (64 assignments). The comparison trims too,
because Project shows the two the same.

## Not checked

- Opened in Microsoft Project itself. MPXJ and this tool's reader are the two
  readers checked; Project is a paid program no session holds.
- Group-by in Project on the converted file (expected from the text fields,
  not seen).
- Outline codes (the hierarchy as Project's own tree), and UDFs as Number,
  Date and Flag fields: both are next.
