# Calendar review on the six public P6 files, 2026-11-23

`bash eval/corpus-fetch.sh DIR && node eval/calendar-review-check.mjs DIR/xer --json eval/calendar-review-2026-11-23.json`
(17 s). Files: the six public XERs `corpus-fetch.sh` names (CCA_R03_dt_24Oct11SC, Expressway_Project,
example_xer_file, hotel-project, sample, terminal-building-airport). Per-plant rows are in the JSON.

## What the files carry, unplanted

| File | Findings |
|---|---|
| terminal-building-airport | FAULT holidays-run-out: "7-Day Workweek(TENDER CALENDAR)", the only calendar in use (66 activities), lists holidays to 2010-12-24; work runs 2012-05 to 2013-02 (2012 missing). What-if: finish 2013-02-27 -> 2013-03-01, 2 working days. 3 unused calendars. |
| sample | FAULT holidays-run-out: "Corporate - Standard Full Time" holidays to 2013-12-25, work in 2021. What-if: 2021-10-07 -> 2021-10-11, 2 working days; 28 open activities later. |
| hotel-project | FAULT hours-per-day: "Standard 5 Day Workweek" holds 9 h days, stores 8 (19 open activities). FAULT holidays-run-out: "HBTF # 2 - all days" holidays to 2010, 29 activities into 2013 (2012-2013 missing); what-if HBTF-2 finish 2014-07-23 -> 2014-07-26, 2 working days. CHECK name-days: "Standard 5 Day Workweek" works 7 days. CHECK no-holidays: "HCRA - Global", 5-day, 1,103 open activities. Hours per Week notes on four calendars, 4 unused. |
| CCA_R03 | Hours per Week notes only (40 stored on 7-day and 6-day calendars of 8 h days). Holidays listed to 2016, past the 2013 finish. |
| Expressway_Project | CHECK every-day: 30 open critical activities on "BEW 7 Day SIL". |
| example_xer_file | none |

## Planted faults

holidays removed, named: 16/16; past-year control quiet: 33/33
hours per day +1, named: 12/12; set to the true hours, quiet: 12/12
renamed for the wrong days, named: 12/12; renamed for the right days, quiet: 12/12
what-if: 23 project finishes; removing the year made 7 early (by 5, 8, 1, 3.3, 3, 7, 7 working days)
  after the what-if, off the real finish by (working days): -1, -1, 0, 6, -1, -4, -3

Holiday-year plants: every year that lists holidays and that the open work on a used calendar covers
by 60 days or more, deleted in turn (exceptions that reduce work, full and part days; P6 writes the
field's line breaks as 0x7F, which the planting regex has to allow, or a part-day exception survives).
Controls: each year before the data date deleted; no new finding of any kind.

## The what-if against the real holidays

Of 23 project finishes in the holiday-year plants, 7 moved early when the year was deleted (5, 8, 1,
3.3, 3, 7, 7 working days). The what-if (the calendar's nearest earlier listed year, else the nearest
later, copied by month and day) then put the finish within a day of the real holidays' finish in 4
(-1, -1, 0, -1) and missed by +6 (example_xer_file 2026, copied from 2025's 19 holidays where 2026 has
8), -4 and -3 (hotel HBTF # 1 2012 and 2013, copied from 2013 and 2014, whose lists differ). One plant that did not
move the finish (hotel HBTF # 1 2014) still shows the what-if 2 days early against the baseline what-if:
the network is not monotone in calendar changes across its two projects; not traced further.

So the what-if is an order-of-magnitude reading ("about two working days"), not a date; the pages say so.

## Open

- A real P6 file whose holiday list was extended after a review, to check the what-if against P6's own reschedule.
- Moving holidays (Easter, Thanksgiving) by rule rather than by date in the what-if.
- The admin "hours per time period" setting is not in an XER, so the hours-per-day finding cannot say which figure P6 used to display days.
