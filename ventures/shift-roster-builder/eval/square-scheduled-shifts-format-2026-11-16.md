# Square scheduled shifts API format, as read for `import-square.mjs` (2026-11-16)

Where every field the importer relies on comes from. Nothing below needed a Square account; no Square customer
data was read or committed.

## Source

Square's published API definition: `https://raw.githubusercontent.com/square/connect-api-specification/master/api.json`
(OpenAPI, info version 2.0, 3,273,134 bytes, SHA-256
`8f65460732e19d7445f7a34d8a9df09163db45273df5176a1cc794890ef591fb`, fetched 2026-11-16). Square's developer site
(developer.squareup.com) was not reachable from the session; the APIs-guru copy of the same definition
(`APIs/squareup.com/2.0/openapi.yaml`) is older and has no scheduled-shifts endpoints, so it was not used.
The file is not copied into this repository; only field names and short quoted descriptions are used.

## What the importer uses

| what | definition |
|---|---|
| server | `https://connect.squareup.com` (sandbox `https://connect.squareupsandbox.com`) |
| auth | OAuth2 bearer; extra header `Square-Version`, schema default `2026-09-16` |
| `POST /v2/labor/scheduled-shifts/search` | `x-release-status: BETA`; permission `TIMECARDS_READ`; body `SearchScheduledShiftsRequest { query: { filter, sort }, limit (1-50, default 50), cursor }`; response `{ scheduled_shifts: [...], cursor, errors }`, "Either `scheduled_shifts` or `errors` is present" |
| filter used | `workday: { date_range: { start_date, end_date }, match_scheduled_shifts_by: "INTERSECTION" }` ("All shifts that start between the start and end workdays (inclusive)"); `default_timezone` only needed when a location has no zone. Not used: `location_ids`, `assignment_status`, `scheduled_shift_statuses` (with neither status filter, draft and published shifts both come back) |
| `ScheduledShift` | `id`, `draft_shift_details` ("The latest draft shift details ... This field is always present"), `published_shift_details` ("present only if the shift was published"), `version`, `created_at`, `updated_at` |
| `ScheduledShiftDetails` | `team_member_id`, `location_id`, `job_id`, `start_at` / `end_at` ("RFC 3339 format in the time zone + offset of the shift location ... seconds are truncated"), `notes`, `is_deleted` ("If set to `true` when the shift is published, the entire scheduled shift ... is deleted" once published), `timezone` ("The time zone of the shift location ... provided for convenience") |
| `GET /v2/team-members/jobs` | `x-release-status: BETA`; permission `EMPLOYEES_READ`; `cursor` query parameter; response `{ jobs: [{ id, title, is_tip_eligible, ... }], cursor }`, up to 100 a page |
| `GET /v2/locations` | `PUBLIC`; permission `MERCHANT_PROFILE_READ`; response `{ locations: [{ id, name, timezone, status, ... }] }` |

## Choices the definition leaves open

- **Which version of a shift counts.** Default: the published details when present (what staff were shown), else the
  draft (a shift never published, counted as planned unless `--no-drafts`). `--square-latest` reads every shift's
  latest draft. A published shift whose draft has `is_deleted: true` is still posted, so it counts and a note says so.
- **Unassigned shifts.** No `team_member_id` means nobody is on it; the definition's `assignment_status: UNASSIGNED`
  filter names such shifts. They are needed, so they count.
- **Times without an offset.** The definition promises the location's offset; a `Z` time is moved to the details'
  `timezone` (or the location's) and, with neither, read as UTC with a note.
