# Deputy's roster API, as two open-source clients show it (2026-11-17)

**Why.** `--import-shifts` already read a real Deputy timesheet CSV (README "Two real schedule exports"), but
an owner leaving Deputy had to export a file first. 7shifts, When I Work and Square are read from their APIs;
Deputy was not, because "Deputy's API docs were not reachable from the session" (README, 2026-11-16).

**Probed 2026-11-17 from the cloud session:** developer.deputy.com and www.deputy.com/api-doc gave no answer
(connection failed, `000`). GitHub did: two client libraries that call Deputy's resource API.

| Source | Licence | What it gives |
| --- | --- | --- |
| communityds/deputy-api-wrapper (`src/Schema/Registry.php`, `src/Model/Roster.php`, `src/Model/OperationalUnit.php`, `src/Query.php`, `tests/Adapter/MockClient.php`) | MIT | Roster `StartTime`/`EndTime` typed `UnixTimestamp`; the Roster and OperationalUnit property lists; QUERY bodies `{search, join, assoc, sort, start, max}` paged by `start` until a short page; two mock Roster responses with `Date`, `StartTimeLocalized`, `EndTimeLocalized` (ISO 8601 with `+10:30`), `Mealbreak`, `Published`, `Open`, `Employee`, `OperationalUnit`; OperationalUnit responses with `OperationalUnitName`, `Company`, `CompanyName`; base `https://<domain>/api/v1/`; header `Authorization: OAuth <token>` |
| google/deputy-api-python-client (`deputy/deputy.py`, `deputy/deputy_test.py`) | Apache-2.0 | `POST resource/Roster/QUERY` with `join: ['EmployeeObject']`; "all results from the API are hard-capped at 500 upstream"; search types `eq`, `ne`, `le`, `ge`, `in`, `is`; headers `Authorization: OAuth`, `dp-meta-option: none`; endpoint form `https://<hostname>.<country_code>.deputy.com/api/v1/`; a roster fixture with `OperationalUnitObject.OperationalUnitName` |

No code was copied: `import-deputy.mjs` is written fresh from these field names. One fixture in
`import-deputy.test.mjs` restates the wrapper's mock `ROSTER_NEW` field values (MIT, credited in the test).

**Consistency check on the wrapper's mock:** `StartTime` 1514759400 is 2017-12-31T22:30Z, which is 09:00 at
+10:30 on 1 Jan 2018, the same as its `StartTimeLocalized`; `EndTime` 1514766600 is 11:00 the same way. The
reader gives `Mon, 9:00, 11:00` from either the localized fields or, with them removed, the Unix times and the
offset of `Date`. The other mock (`ROSTER_FIRST`, 1489962600) is 09:00 at +10:30 on 20 Mar 2017, matching its `Date`.

**How it reads (`import-deputy.mjs`):**

- Wall clock: `StartTimeLocalized` first (its digits are the site's clock); else the Unix time in `--tz`;
  else the Unix time at the offset of the roster's own `Date` (an hour off only for a shift that starts after a
  daylight-saving change on its own day); else UTC with a note.
- Role = the area (`OperationalUnitName`, from a joined `OperationalUnitObject` or the OperationalUnit response),
  matching how the CSV reader takes Deputy's `Area Name`. Location = the area's company (`CompanyName`, or the
  Company response by id). `--location` takes the name or the company id.
- `Open: true` or `Employee: 0` counts as a needed shift; `Published: false` is a draft (`--no-drafts` drops it);
  a repeated `Id` across files counts once; an end at or before the start, or a day or more after it, is skipped;
  `{ error: ... }` is reported.
- `fetchDeputy` sends the token only to a `*.deputy.com` install, as `Authorization: OAuth`, and asks for
  rosters starting from a day before `--from` to two days after `--to` (`StartTime` `ge`/`le` Unix seconds),
  joined to `OperationalUnitObject`, then areas and companies; `within()` keeps the wall-clock dates.

**Checked:** `node --test import-deputy.test.mjs` (10 tests: localized and Unix-only times, `--tz`, the wrapper's
mock, open and draft rosters, two locations by name and id, joined area names, overnight and damaged rows,
repeats, an error answer, telling the JSON from Square's and When I Work's, the install-address guard, the fetch's
headers, bodies and paging against a stub). A headless-Chromium upload of a saved rosters JSON and areas JSON on
the page filled the shifts box (`Mon, 7:00, 15:00, 2, , floor` / `Mon, 15:00, 23:00, 1, , kitchen`), no page errors.

**Not claimed:** no Deputy account, token or real response was used. The field names come from third-party
clients, not Deputy's reference (unreachable here), so a field Deputy has renamed since would be missed; whether
the `le`/`ge` search on `StartTime` takes Unix seconds is what Google's client does, not something checked
against a live install. `Mealbreak` is not read (a needed shift is start to end), leave is a separate resource
and is not read, and staff and wages still come in by CSV.
