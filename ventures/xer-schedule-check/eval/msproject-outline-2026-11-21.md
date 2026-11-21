# Activity codes as Microsoft Project outline codes, 2026-11-21

**What changed.** `msproject.mjs` wrote P6 activity codes into Project's
spare text fields (`eval/msproject-codes-2026-11-21.md`). A text field holds
one flat string per task, so P6's code tree (Area A > Room 001) and every
value's description were lost or squeezed into the cell ("CON -
Construction"), and only 29 text fields are shared with text UDFs. With
`--outline-codes` (CLI) or the box on the page, the 10 most assigned code
types become Project's **Outline Code1..10**. Each gets its own lookup table
holding the type's whole P6 dictionary: every value, used or not, in P6's
tree order (seq_num, then code), with its parent and description. A
Project user then sees the hierarchy in the lookup dialog, picks values from
P6's list, and groups by the code with a roll-up per level. The other code
types stay text fields, as before. `mspdi.mjs` reads outline codes back as
activity codes with their parents and descriptions, and `p6xer.mjs` keeps
that tree when it writes the XER.

The previous run left outline codes out because "their MSPDI form (lookup
tables, masks) is the part of the schema readers disagree on most". This run
took the form from MPXJ itself: a lookup table built in MPXJ 16.10 and
written with its `MSPDIWriter` gives the `<OutlineCodes>` block, the
`<Ltuid>` link from the field definition and Project 2003's task form
`<OutlineCode><FieldID/><ValueID/></OutlineCode>`. MPXJ's reader also takes
Project 2007's form, an `<ExtendedAttribute>` with the value's path and
`<ValueGUID>`, and reads the path text from it. Both forms are written,
as the calendars already are, and each was checked alone.

Choices, each with its reason:

- **Opt-in.** The file has not been opened in Microsoft Project itself. Text
  fields stay the default until someone with Project confirms the lookup
  tables load.
- **Ten fields, most assigned first.** Project has ten task outline codes.
  P6's order breaks ties and orders the fields, as for text fields.
- **The whole dictionary.** Unused values go in the lookup table too, so a
  Project user can assign a value P6 has but no activity used yet.
- **A separator no code contains.** A task's value is its path, codes from
  the top level joined by the mask's separator. A type takes the first of
  `. - + /` (the characters Project's code mask offers) that none of its codes
  contains, so the path splits back into its levels. On the public files
  every type takes "." except Classification on the airport file, whose
  codes ("P.C For Footings") contain dots; it takes "-".
- **Fixed GUIDs.** Each lookup table and value GUID comes from a hash of the
  project, the code type and the code ID, so the same XER always writes the
  same XML.
- **Loops are cut.** A value whose parent chain loops (possible in a hand-made
  or damaged XER) becomes a top-level value and is named in the warnings.

## Method

`eval/msproject-outline.mjs` writes each XER with `mspdiText(xer, {
outlineCodes: true })`, reads the XML back with `parseMspdi`, and checks every
lookup value (same code, same parent chain, same description) and every
outline-code assignment of the project's activities (same code type by alias,
same code, same path up P6's own tree, same description). It repeats the
reading on three cut-down copies of the XML: only the 2003 task form, only
the 2007 form, and the 2007 form with the GUIDs removed (found by path
alone). The text-field code types beside them are counted back too.
`eval/msproject-outline-mpxj.py` reads the XML with MPXJ 16.10.0 and dumps
each Outline Code field's alias, lookup table (value, description, parent
value) and every task's value by activity ID. `--mpxj` compares that with what
was written. The MPXJ reading was also run on the 2003-only and 2007-only
copies.

Data: the four public XER files that carry activity codes, from the six in
`eval/cpm-vs-p6-2026-11-19.md` (Expressway and sample.xer carry none).

```
node eval/msproject-outline.mjs <xer files> --xml-dir D
python eval/msproject-outline-mpxj.py D/<file>.xml D/<file>.outline.json   # each file
node eval/msproject-outline.mjs <xer files> --mpxj D --json eval/msproject-outline-2026-11-21.json
```

## Results

| File | Outline codes | Lookup values (back the same) | Assignments | Same code, path = P6's tree, description | 2003 form alone | 2007 form alone | By path alone | MPXJ aliases | MPXJ lookup values | MPXJ task values (both forms; 2003 alone; 2007 alone) |
|---|---|---|---|---|---|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC.xer | 10 | 373 (373) | 160,893 | 160,893 | 160,893 | 160,893 | 160,893 | 10/10 | 373/373 | 160,893 each |
| example_xer_file.xer | 3 | 3 (3) | 436 | 436 | 436 | 436 | 436 | 3/3 | 3/3 | 436 each |
| hotel-project.xer | 5 | 46 (46) | 18,020 | 18,020 | 18,020 | 18,020 | 18,020 | 5/5 | 46/46 | 18,020 each |
| terminal-building-airport.xer | 1 | 12 (12) | 51 | 51 | 51 | 51 | 51 | 1/1 | 12/12 | 51 each |
| **Total** | 19 | **434 (434)** | **179,400** | **179,400** | 179,400 | 179,400 | 179,400 | 19/19 | 434/434 | **179,400/179,400** |

On CCA the 27 code types left over go to the text fields: 23 fit beside the
text UDFs and read back 97,765 of 97,765; 293 assignments in 4 types are
named, not written. Before, with text fields only, CCA carried 24 code types
and named 3,541 assignments. Outline codes carry 33 of its 37 types.

Only one public code type is a real tree: CCA's "CCAD SSCF", 66 values three
levels deep. Its paths read back as P6's chain on every activity.

**Through to P6 again.** XER, then Project XML with outline codes, then
`p6XerText`, then `parseXer`: every outline-code assignment on the four files
lands on a code with the same chain of codes as in the source XER (179,400
of 179,400). Before this change `p6xer.mjs` rebuilt trees only from dotted
text values, so it would have flattened an outline code's parents.

Unit tests (`outline.test.mjs`, 10) plant what the public files lack: a leaf
code used under two parents, an unused value, a code holding the
separator, a parent loop and a self-parent, a value missing from the lookup
table (read as a flat code and named), more than ten code types, a name shared
by an outline code and a text field, and the trip back to XER. With the
reader's parent link removed, 4 of the 10 fail.

## Not checked

- **Microsoft Project itself.** MPXJ is an independent reader and its writer
  is the source of the form, but nobody opened these files in Project. The
  open question is whether Project wants both task forms or only one.
- Enterprise outline codes and code masks with fixed lengths: Project
  features P6 has no counterpart for, so nothing writes them.
