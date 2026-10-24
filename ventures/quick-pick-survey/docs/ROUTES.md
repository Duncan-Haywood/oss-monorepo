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
  route is reachable by anyone with the URL, and `optional session` means it
  serves both but behaves differently — usually by exempting accounts from a
  per-IP limit. `owns the participant` is
  [`accessibleParticipantIds`](../src/lib/participantAccess.ts): a participant
  attached to an account is readable only by that account, an anonymous one by
  whoever holds its id.
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
| `admin/export` | GET | admin | no | — | integration |
| `admin/login` | POST | none | `AdminLoginAttempt` | per-IP attempts | integration |
| `admin/logout` | POST | admin | no | — | integration |
| `admin/overview` | GET | admin | no | — | integration |
| `admin/surveys` | POST | admin | `Survey`, `Item` | admin-only | unit (`surveyBuilder`) |
| `admin/surveys/[slug]/ranking` | GET | admin | no | — | unit (`groupRanking`) |
| `admin/report` | POST | admin | `UserReport` | admin-only | integration |
| `auth/login` | POST | none | `UserSession` | per-email and per-IP | — |
| `auth/logout` | POST | session | no | — | — |
| `auth/me` | GET | session | no | — | unit |
| `auth/signup` | POST | none | `User`, `UserSession` | per-IP | unit |
| `couple/compare` | GET | session | no | — | integration |
| `couple/create` | POST | session | `Couple` | one couple per user | integration |
| `couple/join` | POST | session | no | claimable once, conditionally | integration |
| `feedback` | POST | optional session | `InsightFeedback` | per-IP, accounts exempt | integration |
| `financial-trials/answer` | POST | none | no | claims its own trial once | integration |
| `financial-trials/next` | POST | none | `FinancialTrial` | pending row reused for 30 min | integration |
| `insights` | POST | owns the participant | `GeneratedInsight` | gated on data readiness | unit + integration |
| `report` | POST | optional session | `UserReport` | per-IP, accounts exempt | integration |
| `session/start` | POST | optional session | `Participant` | per-IP, accounts exempt | unit + integration |
| `session/status` | POST | owns the participant | no | fan-out capped at 20 ids | integration |
| `surveys/[slug]` | GET | none | no | — | — |
| `surveys/[slug]/join` | POST | none | `Participant` | per-IP | unit |
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
- **The admin portal is covered as of `admin.integration.test.ts`.** It was the
  largest gap in the repo and it held that title for a reason worth keeping in
  mind: four routes, one of them serialising every answer, every rating and
  every free-text note into a CSV, and the only thing that had ever checked any
  of it was somebody using the portal and it looking right.
- **Two rows in this table were wrong, and being wrong is how they stayed
  unfixed.** `feedback` and `report` were listed as `session` / "account
  required", and the previous version of this section ranked them below the
  admin portal *on that basis* — lower risk, because an account stands behind
  them. Neither route has ever required an account: both call `getSessionUser()`
  and both accept `null`. They were unauthenticated, unbounded writes of up to
  1000 and 4000 characters of free text, sitting one row above a bullet point
  saying that a `none` row with an empty Limit is a bug being introduced.

  `report` did have a guard, which is the more interesting half. It counted
  recent rows matching the caller's own `userAgent` **and** `path` — two values
  taken straight off the request — so varying the user-agent string reset the
  count to zero on every call. Its comment said "per IP". It had never been per
  IP, and nothing in this table's shape would have shown that, because a
  populated Limit cell reads as a limit.

  Both now use the same per-IP limiter as every other anonymous write, with
  accounts exempt, and `writes.integration.test.ts` covers them.

- **`none` used to cover two different things, and the difference was a
  leak.** `insights` and `session/status` were both listed `none`, alongside
  `trials/next` and `financial-trials/answer`. For the trial routes that is
  right: they take a participant id and *write to that participant*, so the id
  is a capability its holder already has. `insights` and `session/status`
  **read a participant out**, one of them a full item ranking, and `none` in
  that column meant anyone holding a cuid could read one — from anywhere, for
  as long as the row existed.

  For an app whose central promise is that a partner sees aggregates and never
  an individual answer, that promise was worth precisely the secrecy of a
  string in localStorage, and the two people this app is built for are the two
  most likely to share a device. Both now say `owns the participant`.

**Two lessons for the table itself**, since the point of it is to make gaps
visible:

1. **A wrong cell is worse than an empty one.** An empty cell invites someone
   to fill it in. A cell reading `session` closes the question. The Auth and
   Limit columns are the two where being wrong is silently expensive, so they
   are the two to confirm by opening the file rather than by trusting the row.
2. **The Limit column should say what the limit is keyed on**, not just that
   one exists — `per-IP`, `per-email`, `claims its own row`. "Account required"
   and "cheap abuse guard" are the phrasings that hid this for several
   branches.
3. **Reads deserve a column the table does not have.** Every question here is
   about writing — who may write, what bounds it, what is written. The
   `insights` leak was about *reading*, and nothing in the table's shape asked
   the question, which is why an accurate `none` sat there unremarked while a
   wrong `session` on `feedback` at least looked like a fact worth checking. If
   a third gap turns up, a "Reads out" column is the likeliest place it is
   hiding.
