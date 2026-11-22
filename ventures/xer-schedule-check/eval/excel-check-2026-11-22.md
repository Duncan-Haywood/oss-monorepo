# XER to Excel workbook, checked on six public P6 files (2026-11-22)

What: `excel.mjs` writes an XER as an .xlsx (Activities, Relationships, WBS,
Resources, Assignments, Expenses, Calendars, Activity codes, and with `--raw`
every XER table). This note checks that the workbook says what the XER says.

How: `eval/excel-check.py` is a separate reader in Python. It shares no code
with the tool: it parses each XER with its own reader (P6's documented rules:
`""` is one quote, a quoted multi-line last value runs on, Windows-1252 as
browsers decode it) and opens the workbook with openpyxl, then compares cell by
cell: every activity's ID, name, status, the eight stored dates (early, late,
actual, planned start and finish) to the minute, original and remaining
duration and total and free float against hours / the activity calendar's
hours per day (within 0.005 day: the workbook rounds to 0.01), every activity
code column, every activity UDF (text, number, date), the predecessors each
Predecessors cell names, every relationship (ends, type, lag hours), every
resource assignment (activity, budgeted units and cost), and every value of
every raw `XER <table>` sheet.

Reproduce:

    bash eval/corpus-fetch.sh /tmp/xer-corpus
    for f in /tmp/xer-corpus/xer/*.xer; do node cli.mjs "$f" --excel "${f%.xer}.xlsx" --raw; done
    python3 -m venv /tmp/xv && /tmp/xv/bin/pip install openpyxl
    /tmp/xv/bin/python eval/excel-check.py /tmp/xer-corpus/xer/*.xer

Result (openpyxl 3.1, Node 22):

| File | Activities | Values checked | Equal | Raw table cells |
|---|---:|---:|---:|---:|
| CCA_R03_dt_24Oct11SC.xer (P6 hospital, 30 MB) | 16,146 | 5,163,480 | 5,163,480 | 4,520,340 |
| Expressway_Project.xer | 823 | 288,243 | 288,243 | 268,577 |
| example_xer_file.xer | 435 | 130,228 | 130,228 | 120,571 |
| hotel-project.xer | 4,236 | 641,836 | 641,836 | 546,152 |
| sample.xer | 52 | 5,167 | 5,167 | 4,262 |
| terminal-building-airport.xer | 66 | 10,809 | 10,809 | 9,537 |
| **Total** | **21,758** | **6,239,763** | **6,239,763** | 5,469,439 |

The first run found differences, all in the checker, none in the workbook:
Python's `round` rounds halves to even (33.625 days to 33.62, JavaScript to
33.63), so the checker now compares against the unrounded value; its first
Windows-1252 decode replaced the five unassigned bytes where browsers keep them
(U+0081, Expressway's OBS names); and it read P6 Web's quoted multi-line
calendar data as separate lines.

Float Agrees (P6's stored total float against the recomputed one): 14,268 of
14,270 open activities on the hospital file (the 2 sit behind the lag
lengthened after P6's last run, eval/cpm-vs-p6-2026-11-19.md), and every open
activity that has stored float on the other five (823/823, 404/404,
4,217/4,217, 42/42, 66/66; 19 of the hotel file's open activities store no float).

Size and time (with `--raw`): hospital 27.5 MB in 16 s; the others 0.04 to
3.5 MB in under 2 s. Without `--raw` the hospital workbook is 9.4 MB.

Not checked: opening in desktop Excel or LibreOffice (neither is installed
here). openpyxl, which is strict about the package parts, reads every
workbook with no warning. Next: a person opening one in Excel; whether P6's
"days" setting (fixed hours per day instead of the calendar's) should be an option.
