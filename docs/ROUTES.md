# Every API route, and what guards it

One table, one row per route handler, so that a property some routes have and
others don't is visible as a gap in a column rather than as a thing you would
have to already suspect.

That is not a hypothetical failure mode here. `trials/next` and
`financial-trials/next` are twins — same job, same shape, one for the item
survey and one for the financial one. The fix that stopped `trials/next`
minting a row on every page load, which is what made the abandonment metric
count refreshes and crawlers, landed on one of them and not the other. Six
sessions read this code afterwards without noticing, because nothing anywhere
put the two routes side by side. This table does.

**`src/lib/routeInventory.test.ts` fails if this file and `src/app/api` ever
disagree** — a new route with no row, or a row for a route that no longer
exists. It cannot check that the *contents* of a row are true, so the columns
are facts you can confirm by opening the file.

## Columns

- **Auth** — what the handler requires before it does anything.
  `session` is `getSessionUser`, `admin` is the admin cookie, `none` means the
  route is reachable by anyone with the URL.
- **Writes** — whether an unauthenticated or ordinary call can create rows.
  This is the column that decides whether a route needs a rate limit.
- **Limit** — what bounds that writing.
- **Tested** — `unit` is a mocked Prisma, `integration` is a real database.

Every route in the table is behind the origin check in `src/proxy.ts` for
`POST`/`PUT`/`PATCH`/`DELETE`; see `src/lib/originCheck.ts` for what that does
and does not claim. It is not listed per row because it applies to all of them
without exception, and a column that reads `yes` twenty-three times is a column
that stops being read.

## The table

| Route | Method | Auth | Writes | Limit | Tested |
| --- | --- | --- | --- | --- | --- |
| `admin/export` | GET | admin | no | — | — |
| `admin/login` | POST | none | `AdminLoginAttempt` | per-IP attempts | — |
| `admin/logout` | POST | admin | no | — | — |
| `admin/overview` | GET | admin | no | — | — |
| `admin/report` | POST | admin | `UserReport` | admin-only | — |
| `auth/login` | POST | none | `UserSession` | per-email and per-IP | — |
| `auth/logout` | POST | session | no | — | — |
| `auth/me` | GET | session | no | — | unit |
| `auth/signup` | POST | none | `User`, `UserSession` | per-IP | unit |
| `couple/compare` | GET | session | no | — | integration |
| `couple/create` | POST | session | `Couple` | one couple per user | integration |
| `couple/join` | POST | session | no | claimable once, conditionally | integration |
| `feedback` | POST | session | `InsightFeedback` | account required | — |
| `financial-trials/answer` | POST | none | no | claims its own trial once | integration |
| `financial-trials/next` | POST | none | `FinancialTrial` | pending row reused for 30 min | integration |
| `insights` | POST | none | `GeneratedInsight` | gated on data readiness | unit |
| `report` | POST | session | `UserReport` | account required | — |
| `session/start` | POST | optional session | `Participant` | per-IP, accounts exempt | unit + integration |
| `session/status` | POST | none | no | fan-out capped at 20 ids | integration |
| `surveys/[slug]` | GET | none | no | — | — |
| `trials/answer` | POST | none | no | claims its own trial once | integration |
| `trials/next` | POST | none | `Trial` | pending row reused for 30 min | unit + integration |
| `trials/undo` | POST | none | no | replays a stored snapshot | integration |

## What the gaps say

Reading down the columns rather than across the rows:

- **`none` in the Auth column is the app's design, not an oversight.** Someone
  can answer questions before making an account — that is the whole onboarding.
  It does mean every one of those routes has to be safe for a stranger to call
  in a loop, which is what the Limit column is for. A new `none` row with an
  empty Limit is a bug being introduced.
- **The admin portal has no automated coverage at all.** Four routes, one of
  them exporting every answer in the database as CSV, and the only thing that
  has ever checked them is someone using the portal. That is now the largest
  coverage gap in the repo — the financial routes, which held the title before,
  are covered as of this table.
- **`feedback` and `report` are the two untested writing routes behind an
  account.** Lower risk than the admin ones, but they do write on a POST.
