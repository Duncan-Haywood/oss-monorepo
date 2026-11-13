# When I Work API format, as read for `import-wheniwork.mjs` (2026-11-13)

Where every field the importer relies on comes from. Nothing below needed a When I Work account; no When I Work
customer data was read or committed.

## Sources

1. **When I Work's published API definition**: `https://apidocs.wheniwork.com/external/monolith/docs-master.json`,
   OpenAPI 3.1.0, info version 1.0.0, 421,263 bytes, SHA-256
   `c83a58975483319956cfb5df4a2f2cb7cf0ddddebf07f4ff6559ada6cb5cdfe8`, fetched 2026-11-13. It is the file the
   Redoc page at `apidocs.wheniwork.com/external/index.html` loads (repo `monolith`, branch `master`).
2. **Their login service definition**: `https://apidocs.wheniwork.com/external/login/docs-master.json`, 12,555 bytes,
   SHA-256 `351cfa4c2b161420ea486e09814fb4649378cbd3170ccb2c8cdc137c1eefe8ee`, read for how a token is obtained only.
3. Homebase's API docs (`app.joinhomebase.com/api/public/docs`) answered 401 without an account: not read.

Neither file is copied into this repository; only field names and short quoted descriptions are used.

## What the importer uses

| what | definition (1) |
|---|---|
| server | `https://api.wheniwork.com` |
| auth | security scheme `W-Token`, HTTP bearer (JWT). Token from `POST https://api.login.wheniwork.com/login` with header `W-Key: <developer key>` and email/password; `W-UserId: <user id>` sets the workplace when a person belongs to several |
| `GET /2/shifts` response | `{ shifts: [...], repeating_shifts: [...], shiftchains: [...] }` |
| query used | `start`, `end` (date-time), `unpublished` ("Requires supervisor rights"), `include_open`, `include_allopen`, `deleted` ("include a list of shift IDs (\"deleted_ids\") that were deleted during the passed time window"), `all_locations`. No cursor or page parameter is defined; `limit` exists |
| `start_time`, `end_time` | `format: date-time`, example `"Mon, 08 May 2023 08:30:00 -0600"` (RFC 2822 with offset); a break example writes `9:30:00` with one hour digit |
| `user_id` | "The user assigned to the shift. Set to `0` for an Open Shift." |
| `is_open`, `published` | booleans |
| `position_id`, `location_id` | ids into `/2/positions` (`{ positions: [{ id, name, ... }] }`) and `/2/locations` (`{ locations: [{ id, name, is_deleted, ... }] }`) |
| `break_time` | "Length of the unpaid breaks for the shift in hours" (not used: the shift lines take the span) |
| rate limits | "Typical responses will be 403 level client side errors when encountering these limits" |

## Not established

- No recorded live response was found or used, so whether real responses side-load positions or locations, or
  what a real `deleted_ids` looks like, is not observed.
- Whether `start_time` ever arrives in ISO 8601 rather than RFC 2822: the reader accepts both (locations'
  `created_at` example is ISO 8601), so either works.
