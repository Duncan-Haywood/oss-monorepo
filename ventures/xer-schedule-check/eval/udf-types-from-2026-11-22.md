# UDF types kept through Microsoft Project with the original XER, 2026-11-22

**Question.** Microsoft Project has one kind of Number custom field. A P6
decimal UDF (`FT_FLOAT`, `FT_FLOAT_2_DECIMALS`) that holds only whole numbers
goes into a Number field and comes back from Project XML as an integer UDF
(`FT_INT`): nothing in the Project file says it was decimal. On the public
CCA file that is six UDFs and 6,070 values (`eval/finish-udfs-2026-11-22.md`,
"the remaining 6,070"). It matters after the import: P6 refuses a 37.5 typed
into an integer UDF, and four of the six are percent-complete fields
("RENZ % COMPLETE", "PERCENT COMPLETE", "July2011 Target% Complete", "U%").
The same gap hits a finish-date UDF past Project's ten Finish fields, which
`msproject.mjs` has to put in a Date field and so comes back a start date.

Can the round trip keep P6's own types, with no Project seat to test a
hidden marker in the Project file?

## What changed

Nothing written into the Project file: there is no field we could check
Project keeps on save. Instead the person converting back usually holds the
XER the Project file was made from (they sent it to Project in the first
place, or the owner did). Given it, `p6xer.mjs` takes each UDF's type from it:

- `p6XerText(xml, { typesFrom })` (an XER's text or parsed tables), CLI
  `node cli.mjs file.xml --to-p6 out.xer --types-from original.xer`, and on
  the page an optional "original XER" file box beside the P6 download.
- Titles match as `msproject.mjs` writes them (square brackets as round
  ones, case and outer spaces ignored), within the subject area: activity
  (TASK), WBS (PROJWBS) and resource (RSRC) UDFs.
- Only like for like: a number type for a number field (integer or decimal),
  a date type for a date field (start or finish). Text and cost are never
  changed; a title of another kind is ignored.
- An integer type is not taken where a value is no longer whole (someone
  typed 37.5 in Project): the UDF stays decimal and the warning names it.
- A warning says how many fields matched, how many changed type and how
  many values that covers; `counts.typesFromXer` holds the same numbers.

## Data

The six public P6 files of `eval/cpm-vs-p6-2026-11-19.md` (sparse clones of
the four repositories, 2026-11-22, read for measurement, not copied here).

## Results

`node eval/p6xer-check.mjs --xer <dir>` against `... --xer <dir> --types-from-original --json eval/udf-types-from-2026-11-22.json`
(the XER is written as Project XML by `msproject.mjs`, back to an XER by
`p6xer.mjs`, and compared with the original by activity ID):

| | without the original | with it |
|---|---|---|
| CCA activity UDF values back, same title and value | 13,174 / 13,174 | 13,174 / 13,174 |
| ... with P6's own type | 7,104 / 13,174 | **13,174 / 13,174** |
| Expressway values with P6's type | 823 / 823 | 823 / 823 |
| P6 import problems (`p6Problems`), six files | 0 | 0 |
| links, codes, activity fields, schedule | unchanged | unchanged |

The six CCA fields that change type, all `FT_INT` without the original and
`FT_FLOAT_2_DECIMALS` with it (values): user_number8 (761), user_number7
(761), RENZ % COMPLETE (2,074), PERCENT COMPLETE (164), July2011 Target%
Complete (1,872), U% (438): 6,070 values. 17 fields matched by title, none
left unmatched. The CLI prints:

    user-defined field types from the original XER: 17 field(s) matched by title, 6 given the original's type (6070 value(s); ...)

Unit tests (`udf-types-from.test.mjs`): decimal-holding-whole-numbers back
as decimal for activity and resource UDFs, with the original as text or as
parsed tables; the eleventh finish-date UDF (spilled into a Date field) back
as a finish date; the not-whole guard; a title of another kind or another
subject area left alone.

## Limits

- It needs the original XER. A Project file with no XER behind it has no
  P6 type to recover; there the rule stays "whole numbers as integer UDFs".
- A UDF renamed in Project (its column alias changed) no longer matches.
- Not imported into P6 itself (no P6 seat here); the types are checked
  against the original file's UDFTYPE rows and P6's import rules as
  `p6Problems` encodes them.
