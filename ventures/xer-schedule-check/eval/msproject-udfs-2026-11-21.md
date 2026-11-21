# Activity user-defined fields in the Microsoft Project XML, 2026-11-21

**What changed.** `msproject.mjs` used to drop every activity user-defined
field (UDF) when it wrote an XER as Microsoft Project XML, and only counted
them. Schedulers keep real work in UDFs: change order numbers, claimed
percentages, access dates, old activity IDs, three-point durations for risk.
On the public CCA file that was 41,729 values on 32 activity UDFs. Now:

| P6 UDF type | Project field | Value as written |
|---|---|---|
| Integer, decimal (FT_INT, FT_FLOAT, FT_FLOAT_2_DECIMALS) | Number1..20 | the number |
| Cost (FT_MONEY) | Cost1..10 | hundredths (1234.56 is written 123456, as MPXJ writes a cost field) |
| Start date, finish date (FT_START_DATE, FT_END_DATE) | Date1..10 | date and time |
| Text (FT_TEXT) | the Text fields left after activity codes | the text (255 characters at most) |
| Indicator (FT_STATICTYPE), code UDFs | none | counted in the warnings |

Each field is renamed (`Alias`) to the UDF's title, so a Project user sees
"Change Order #" or "Claimed This Month" as a column and can group, filter and
sort on it. P6 has no yes/no UDF type, so Project's Flag fields are not used.
The field ids (PjField) were taken from MPXJ 16.10's `FieldTypeHelper`, not
from memory. Resource and WBS UDFs are not written (Project's resource fields
are another set; next).

`mspdi.mjs` reads Number, Cost and Date fields back as activity UDFs
(UDFTYPE, UDFVALUE): whole numbers as integer UDFs, others as decimals.
Text fields are read as activity codes, as before. A side effect: a Project
file's own Number fields named like "Optimistic Duration" now feed the risk
run's ranges the way a P6 file's numeric UDFs do (unit test "UDF ranges
round-trip").

**Codes and text UDFs share the 29 Text fields.** Text1 holds the activity
ID, which leaves 29. When code types and text UDFs together need more, the
ones that fill the most activities get a field, and a code type wins a tie.
Before this change codes always went first. On CCA (37 code types, 15 text
UDFs) the old order would have left out all 28,555 text UDF values, including
"change id" on 15,548 activities, to keep code types on 425 activities. With
the shared ranking 24 code types and 5 text UDFs are written. 3,541 code
assignments and 746 UDF values are left out, against 29,971 if codes always
went first. Each one is named in the warnings.

## Method

`eval/msproject-udfs.mjs` writes each XER with `mspdiText` and reads the XML
back with `parseMspdi`. For every activity UDF value of the project's
activities it checks the same title and value: numbers within 1e-9, costs
after the hundredths, dates to the minute, and text UDFs through the text
field read back as an activity code. `--xml-dir` saves the XML.
`eval/msproject-udfs-mpxj.py` reads that XML with MPXJ 16.10.0, an
independent open-source reader, and dumps every aliased Number, Cost, Date
and Text field by activity ID. `--mpxj` checks each field's alias and each
cell against what was meant to be written.

Data: the six public XER files in `eval/cpm-vs-p6-2026-11-19.md`. Two of them
carry activity UDFs: CCA (P6 6.0) and Expressway (P6 7.0). example_xer_file
has only resource UDFs, and the other three have none. None of them has a
cost or start-date UDF, so `eval/msproject-udfs-planted.mjs` writes a planted
file from the example schedule. It has two cost UDFs (one with negative
values), a start-date UDF, a finish-date UDF, an integer UDF and a decimal
UDF: 124 values on 22 activities.

```
node eval/msproject-udfs-planted.mjs D             # D/msproject-udfs-planted.xer
node eval/msproject-udfs.mjs D --xml-dir X         # D holds the XER files
python eval/msproject-udfs-mpxj.py X/<f>.xml X/<f>.udf.json   # each file
node eval/msproject-udfs.mjs D --mpxj X --json eval/msproject-udfs-2026-11-21.json
```

## Results

| File | Number back | Date back | Cost back | Text back | Left out | MPXJ aliases | MPXJ cells |
|---|---|---|---|---|---|---|---|
| CCA | 12,992 / 12,992 | 182 / 182 | - | 27,809 / 27,809 | 746 text values (10 UDFs) | 22 / 22 | 40,983 / 40,983 |
| Expressway | 823 / 823 | - | - | 1,041 / 1,041 | 0 | 4 / 4 | 1,864 / 1,864 |
| planted | 44 / 44 | 44 / 44 | 36 / 36 | - | 0 | 6 / 6 | 124 / 124 |
| **Total** | **13,859** | **226** | **36** | **28,850** | 746 | **32 / 32** | **42,971 / 42,971** |

Every UDF value written reads back the same through this tool's reader and
through MPXJ, which finds every value under the field and alias meant. The
746 values left out are the 10 least-filled text UDFs on CCA. All 15 numeric
and 2 date UDFs on CCA fit (15 of the 20 Number fields).

Activity codes on CCA under the shared ranking (`node eval/msproject-codes.mjs`):
24 text fields, 255,410 of 255,410 code assignments back, 0 merged, 0 split.
3,541 assignments in 13 code types are left out; the old order left out 1,416
in 8. The other three files with codes are unchanged (hotel 18,020,
example 436, terminal 51; none has text UDFs).

Nothing else moved (`node eval/msproject-check.mjs`, all six files): 21,422
of 21,422 activities intact, 54,843 of 54,843 links kept, schedule equal under
Project's rules on 19,818 of 19,822, the same as in
`eval/msproject-check-2026-11-21.md`. CCA's XML is larger with 41,000 more
cells, and its run took 6.9 s here against 3.3 s there.

**Not checked:** the file was not opened in Microsoft Project itself. Cost
values in hundredths follow MPXJ's writer and reader, which agree with each
other, but no Project-saved file with a cost custom field was at hand to
confirm the form. The Date UDF subtype (start or finish) is not kept on the
way back: dates read back as start-date UDFs.
