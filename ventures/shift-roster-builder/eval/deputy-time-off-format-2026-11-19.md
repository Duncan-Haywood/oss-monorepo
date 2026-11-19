# Deputy's unavailability and leave rows, from Deputy's own guides (2026-11-19)

**Why.** `portfolio/flagships.yaml` listed "Deputy availability from its API" as buildable for shift-roster-builder:
staff and wages came in by API (`import-deputy-staff.mjs`, earlier the same day), but who cannot work when did not.

**Source.** Unlike the two earlier Deputy readers, Deputy's developer site answered from this session. Its markdown
pages (fetched as `<page>.md`, listed in `https://developer.deputy.com/llms.txt`):

- `docs/setting-an-employees-availability.md`, "Setting an Employees Unavailability" (updated 2025-11-10): a sample
  response row `{ Id, Employee, Type, MaxDateRecurringGenerated, StartTime, EndTime, Date, Comment, Schedule, Creator,
  Created, Modified, StartTimeLocalized, EndTimeLocalized }` and a table of what each field means. `Type` 0 = one off,
  1 = recurring; `MaxDateRecurringGenerated` = how far Deputy has generated the rows of a recurring pattern ("Deputy
  does not add infinite records for future unavailability"); `StartTime`/`EndTime` Unix time; `Date` the first date
  with the timezone offset; `Schedule` the id of the recurrence schedule.
- `reference/searchemployeeavailability-1.md`: the V1 resource OpenAPI schema for EmployeeAvailability (the same
  fields; `StartTime`, `EndTime` integers).
- `docs/leave.md`, "Leave": `Employee`, `Company`, `LeaveRule`, `DateStart`, `DateEnd` (dates), `Days`, `Status`
  (0 awaiting approval, 1 approved, 2 declined, 3 cancelled, 4 date only approved, 5 pay approved), `TotalHours` and
  others. The MIT communityds/deputy-api-wrapper `src/Model/Leave.php` also lists an `allDay` boolean and `start`/`end`
  integers, whose meaning is not documented; they are not read beyond `AllDay` false (blocks the whole day, noted).

| Read | As |
| --- | --- |
| EmployeeAvailability row in the planned weeks | dated `off:` entries, split at local midnight |
| Leave, Status 1, 4 or 5 | whole days `DateStart`..`DateEnd` |
| Leave, Status 0 | counted in a note, not applied |
| Leave, Status 2 or 3 | ignored |

**Not claimed.** No Deputy account, token or real response was used. The QUERY search on `StartTime` (`ge`/`le`) and on
`DateEnd`/`DateStart` with date strings follows the search syntax the roster fetch already uses; whether Deputy compares
`Leave.DateEnd` to a `YYYY-MM-DD` string as a date is not checked against a live install (the import's own window
filter decides either way, so a wider answer costs nothing but rows).
