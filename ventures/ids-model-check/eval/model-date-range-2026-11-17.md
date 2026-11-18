# IDS editor: "Use the model's range" on dates, times and durations (2026-11-17)

**Question.** Since #16740 the editor offers **Use the model's range** on a
number row when a model is open, and since earlier today date, time and
duration rows have a **between** mode (`eval/date-ranges-2026-11-17.md`). But
the model's range was only offered for numbers: on an IFCDATE row such as
Pset_Warranty.WarrantyStartDate the author had to read the dates the model
holds and type the earliest and latest by hand, and the inventory listed only
the 50 commonest values, so with more than 50 different dates the earliest
and latest might not even be on screen. Can the editor offer the range a
model's dates actually span, and does a requirement built from it pass that
model?

**What landed:**

- `inventory.mjs`: each value tally (attributes and properties) also keeps
  `tkind`, `tmin`, `tmax`: the ISO form every value has (`date`, `dateTime`,
  `time`, `duration`, via `temporal.mjs`) and the earliest and latest value,
  over **every** value the model holds, not the 50 listed or the 500 tracked.
  One value in another form (a label "TBC" in a date property, a date-time
  among dates) sets `tkind: "mixed"` and no range is kept, because no range
  would pass that object.
- `editor.mjs`: `mergeTally` merges them across classes (a door's and a
  window's dates), and `modelValueOffer(mp, kind, enumVals, temporal)`
  returns `tmin`/`tmax` when the row's type (`temporalType`) has the same form
  as the model's values. No outward rounding: IDS compares temporal bounds as
  values, not with the numeric tolerance, and ids.mjs and the offer order them
  with the same `temporalKey`.
- `editor.html`: the "In the model" note on a date, time or duration row says
  "They run from 2021-08-13 to 2026-12-30." and shows **Use the model's
  range** next to (not instead of) "Allow exactly these values", since for
  dates a range is usually what an author means. A mixed property says why
  there is no range. The click is counted as `editor_model_range`. After the
  click, the row's existing IfcTester note offers **Write as a pattern**.

## Measured

`node --test inventory.test.mjs` (two new tests) on a model of the sample
house plus 600 doors (more values than the inventory lists or tracks), start
dates spread over 2021 to 2026 with one door moved 400 days earlier, and
warranty periods P1Y to P4Y with one P4Y6M:

| Check | Result |
| --- | --- |
| earliest / latest start date, inventory vs. every door's value read apart | 2021-08-13 / 2026-12-30 both |
| periods | P1Y to P4Y6M (one door), one-of offer kept as well |
| IDS built from both ranges, checked here against the model | pass (all 600 doors) |
| the same with one door a day past the latest | fail |
| range merged over doors and windows | latest is the window's 2031-02-03 |
| one window's start written as IFCLABEL('TBC') | `mixed`, no range offered (doors alone still offered theirs) |
| applicability count of the range on a 12-door model | 12 of 12 |

`node eval/model-date-range.mjs` (Playwright, Chromium; output in
`eval/model-date-range.txt`) drives the page itself: opens an IDS asking for
WarrantyStartDate (IFCDATE) and WarrantyPeriod (IFCDURATION) on doors, opens
the 600-door model, clicks **Use the model's range** on both rows, downloads
the .ids: it holds `xs:date` 2021-08-13 to 2026-12-30 and `xs:duration` P1Y
to P4Y6M, passes the model in this checker and fails it with one door a day
late. Then **Write as a pattern** on the date row: a 129-character pattern
that also passes the model and fails the late door. No page errors.

**Not measured:** IfcTester on these files. The date range is the case
`eval/date-ranges-2026-11-17.md` measured (IfcTester 0.9.0 fails every
object on a date range; the pattern versions agreed 10 of 10), and the row
says so. Real exports: none of the public models at hand
holds a date. The six HHS Office and Schultz Residence exports
(`opensourceBIM/IFC-files` at `cb96c50`, the files of
`eval/model-values-2026-11-17.md`) are IFC2X3, which has no IFCDATE, and none
of their property labels holds a date-shaped string (searched for
`d-d-d`, `d/d/d` and `d.d.d` labels: only OmniClass numbers match);
buildingSMART's Simple-Scene models and xBIM's test files hold no IFCDATE,
IFCDATETIME, IFCTIME or IFCDURATION value either. A real IFC4 export with
warranty, handover or inspection dates is the next check.

Full suite after the change: `node --test *.test.mjs`, 166 of 166 pass.
