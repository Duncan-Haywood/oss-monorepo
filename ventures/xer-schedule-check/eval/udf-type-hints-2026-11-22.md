# Text UDFs on the round trip P6 → Project XML → P6, 2026-11-22

**Question.** A P6 file sent to a Microsoft Project user and back (XER →
Project XML with `msproject.mjs`, → XER with `p6xer.mjs`) returned every
activity UDF value, but not always as the same kind of field. Project has
one Number type and its Text fields read back as activity codes, so:

- a decimal UDF (`FT_FLOAT_2_DECIMALS`) that happens to hold only whole
  numbers came back as an integer UDF (six of CCA's, 6,070 values,
  `eval/p6xer-udfs-2026-11-21.md`);
- every text UDF came back as an activity code (27,809 CCA values, 1,041
  Expressway values), so in P6 a free-text column such as "change id" or
  "EAM Contact Person" turned into a code dictionary.

PR #18190 (`eval/udf-types-from-2026-11-22.md`, landed minutes before this
one) fixed the first: given the original XER (`typesFrom`, CLI
`--types-from`, a file box on the page), number and date UDFs take their P6
type back by title. This run started on the same item in parallel. It is
rebased onto #18190's API and adds the second fix, text UDFs.

## What changed

- `mspdi.mjs`: `parseMspdi(text, { textUdf })`. `textUdf(title)` true means
  a task Text field is read as a text UDF (`FT_TEXT`, every value kept, even
  when every value differs, where the code reading skips the field), not as
  an activity code.
- `p6xer.mjs`: `udfTyper(typesFrom)` now also builds that predicate from the
  original's activity text UDFs. Titles are matched as `msproject.mjs` writes
  them: `[ ]` made `( )`, cut to 50 characters, a repeated title's
  ` (UDF n)` removed, case ignored. A title that is also one of the
  original's activity code types is left as a code. The warning and
  `counts.typesFromXer.textFields` say how many fields were read this way.

## Data

The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md` (fetched for the
check, not committed). Two have activity UDFs: CCA (P6 6.0, 32 UDFs, 41,729
values) and Expressway (P6 7.0, 4 UDFs, 1,864 values). The other four have
none; they were run to see that nothing else changes.

## Results

`node eval/udf-type-hints.mjs <dir of the six XERs> --json eval/udf-type-hints-2026-11-22.json`
(this tool's reader; values matched by activity ID, title and value, then
P6's type compared):

| | no XER | with the original XER (this run) |
|---|---|---|
| CCA values Project carried (numeric, cost, date, text) | 40,983 | 40,983 |
| ... back as UDFs | 13,174 | **40,983** |
| ... back with P6's own type | 7,104 | **40,983** |
| ... text UDF values turned into activity codes | 27,809 | 0 |
| Expressway values carried | 1,864 | 1,864 |
| ... back with P6's own type | 823 | **1,864** |
| Real activity code assignments back (6 files) | 273,917 of 277,458 | 273,917 of 277,458 |
| Extra UDF values | 0 | 0 |
| P6 import problems (`p6Problems`) | 0 | 0 |

Total: **42,847 of 42,847** values back with P6's own type, against 7,927
with no XER and 13,997 with #18190's number and date types alone (the 28,850
text values were still codes).
By type in CCA: 10,621 decimal, 2,371 integer, 182 finish date, 27,809 text.
The real code count is the same both ways; the 3,541 not back are the code
types `msproject.mjs` has no Text field left for (known, `NEXT.md`). With the
text UDFs out of the code tables, CCA's XER has 24 code types instead of 29.

CCA's other 746 text values (UDFs "name", "Y_id", "YC_id") were not written
to Project at all: codes and text UDFs share Project's 29 spare Text fields
by fill, and they lost. That is unchanged.

**MPXJ 16.10, independent reader** (`python eval/p6xer-udfs-mpxj.py --text
<original> <returned> ...`, both XERs read by MPXJ's P6 reader, fields
matched by title, MPXJ's own data type per field):

| | no hint | with the original XER |
|---|---|---|
| Values read back the same | 13,997 of 43,593 | 42,847 of 43,593 |
| Fields with the same data type | 12 of 18 | 26 of 26 |
| Values in fields with the same data type | 7,927 | 42,847 |

(`eval/udf-type-hints-mpxj-plain-2026-11-22.json`,
`eval/udf-type-hints-mpxj-hinted-2026-11-22.json`; the 746 are the unwritten
CCA text values above.)

Unit tests: `p6xer.test.mjs` ("with the original XER (typesFrom), text UDFs
come back as text UDFs ..."): a text UDF next to decimal, integer and
resource UDFs, the warning and count, and a text UDF titled as a code type
staying a code. `udf-types-from.test.mjs` (#18190's) now also expects
`textFields: 0` where there is no text UDF.

## Limits

- The hint needs the original XER. A Project file with no P6 origin has no
  types to restore, and gets the guesses as before.
- Matching is by title: a UDF renamed in Project (its Alias changed) loses
  its hint and falls back to the guess (a text UDF then reads as a code).
- Not imported into P6 itself (no seat); the types are P6's own
  `logical_data_type` values, read back here and by MPXJ.
- Still open: an in-file marker that survives a save in Project, for when
  the original XER is not to hand; needs a Project install to test.
