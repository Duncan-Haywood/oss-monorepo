# 7shifts API format, as read for `import-7shifts.mjs` (2026-11-13)

Where every field the importer relies on comes from. Nothing below needed a 7shifts account; no 7shifts
customer data was read or committed.

## Sources

1. **7shifts' API definition, version 2023-05-01**, as mirrored in the jentic/jentic-public-apis repository
   (`apis/openapi/7shifts.com/7-shifts/2023-05-01/openapi.json`, 1,851,289 bytes, fetched 2026-11-13 from
   raw.githubusercontent.com). developers.7shifts.com itself answered 403 through this session's proxy.
2. **A recorded response of the live API with scrubbed values**: the VCR cassette in hotgluexyz/tap-7shifts
   (`__smoke-tests__/shifts_pagination_test/fixtures/vcr.yaml`, SHA-256
   `e22cd79b5d1ddeaa5b108cea22392895647c8ed979195d1df2a9be6c2b7099c2`, recorded 2026-11-06 by that project).
   Its ids, times and strings were replaced with random values by the recorder; only its shape is evidence.
   Not copied into this repository (no licence file found in that repository).
3. Airbyte's `source-7shifts` connector manifest (ELv2) was read for the endpoint list only.

## What the importer uses

| what | definition (1) | recorded response (2) |
|---|---|---|
| envelope | `{ object: "shifts", data: [...], meta: { cursor: { current, prev, next, count } } }` | same keys; page 1 `next` set, page 2 `next: null` |
| `start`, `end` | "UTC in ISO8601 format" | `1996-03-21T20:52:17Z` style (values random) |
| `open` | "not assigned to any user" | present, boolean |
| `close` | "the shift ends at closing time. If set end is not used" | present, boolean |
| `draft`, `publish_status` | `draft`, `published`, `draft_deleted`, `published_deleted` | present (values scrubbed) |
| `deleted`, `soft_deleted` | booleans | present |
| `attendance_status` | `none`, `sick`, `no_show`, `late` | present (scrubbed) |
| `role_id`, `location_id` | ids into `/roles` and `/locations` | present |
| location `timezone` | "Valid zone info name" | (locations not in the cassette) |
| location `mon_hours_close` ... | closing time per weekday | (not in the cassette) |

The definition spells one field `late_minuets`; the live response has `late_minutes`. The importer reads neither.
List filters used by `fetch7shifts`: `start[gte]`, `start[lte]`, `limit`, `cursor` (all in the definition).

## The recorded response through the importer

296 shifts over two pages (cursor followed, 0 repeated ids). Every one is refused with a reason: the recorder's
random times put ends decades before or after starts (`Shift n: ends at or before its start` / `a day or more after
its start`). Before that guard was added, the same file came through as 294 "shifts" over 110 weeks; the guard is
why. So the cassette confirms the envelope, the field names and the pagination, and says nothing about real times.

## Not checked

A real company's shifts (times, open-shift share, how `close` is used), the roles and locations responses on a live
account, whether the API answers a browser directly (CORS; the page reads saved files, it does not fetch), and how
7shifts issues access tokens. Wanted: one real week's three responses from a restaurant willing to share them.
