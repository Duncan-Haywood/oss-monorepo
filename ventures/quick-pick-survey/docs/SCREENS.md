# Every screen, and what it does when the request fails

The front-end counterpart to [ROUTES.md](ROUTES.md), and for the same reason:
one row per screen, so a property some screens have and others don't shows up
as a gap in a column instead of as something you would have to already
suspect.

That is not hypothetical here either. Every one of these screens loads its
data over one `fetch` on mount, from a phone, over a connection that drops.
The recovery each one offered had been decided six separate times, by whoever
wrote that screen, with nothing putting the six side by side. Reading them
into a column found three that had no recovery at all:

- **`AdminView` set an error message that no branch rendered.** A failed
  overview fell through to `Loading…` and stayed there. The account owner's
  only window onto the data, with a hard refresh as the only way out.
- **`AdminView` did not catch a rejected fetch at all**, so offline meant
  `Checking…` forever, plus an unhandled promise rejection.
- **`CoupleView` and `InsightsView` offered a link back to the cards**, which
  is not what someone who came to read the comparison wants. Both retry in
  place now.

**`src/lib/screenInventory.test.ts` fails if this file and `src/components`
ever disagree** — a new component with no row, or a row for a component that
no longer exists. As with ROUTES.md it cannot check that the *contents* of a
row are true; those are facts you confirm by opening the file.

## Columns

- **Calls** — every endpoint the screen talks to. Blank means it renders what
  it is given and fetches nothing.
- **On failure** — what someone sees when a call fails or the connection
  drops. `retry in place` means a control that reissues the request without
  navigating away.
- **On 401** — what it does when the session has gone. This is a different
  answer from a failure: retrying a 401 forever is not recovery, and leaving
  data on screen after one implies it is current.
- **Tested** — a `.test.tsx` beside it that drives the real component against
  a stubbed `fetch`.

## The table

| Screen | Page | Calls | On failure | On 401 | Tested |
| --- | --- | --- | --- | --- | --- |
| `AdminView` | `/admin` | `admin/overview`, `admin/login`, `admin/logout`, `admin/report` | error + retry in place | sign-in form, and the numbers are dropped | yes |
| `AuthView` | `/login` | `auth/login`, `auth/signup` | inline error, form stays filled | — | yes |
| `BottomNav` | layout | — | — | — | no |
| `CardViews` | via `UnifiedRunner` | — | — | — | via the runner |
| `CategoryIcon` | via `CardViews` | — | — | — | no |
| `Celebration` | via `UnifiedRunner` | — | — | — | no |
| `CoupleView` | `/couple` | `couple/compare`, `couple/create`, `couple/join` | error + retry in place | sign-in prompt | yes |
| `FeedbackWidget` | via `InsightsView` | `feedback` | swallowed on purpose — see below | swallowed | no |
| `InsightsView` | `/insights` | `insights` | error + retry in place | same as any failure | yes |
| `SurveyBuilder` | via `AdminView` | `admin/surveys`, `admin/surveys/[slug]/ranking` | server messages listed, form stays filled | — (the admin screen handles it) | yes |
| `SurveyRespondent` | `/s/[slug]` | `surveys/[slug]`, `surveys/[slug]/join`, `trials/next`, `trials/answer` | a failed answer keeps the pair and says so; a failed start offers Try again | — | yes |
| `ProfileView` | `/profile` | `auth/me`, `session/start`, `auth/logout` | inline error, stored session untouched | reads as signed out | yes |
| `ReportWidget` | layout | `report` | inline error, message kept | — | no |
| `UnifiedRunner` | `/app` | `auth/me`, `session/status`, `session/start`, `trials/next`, `trials/answer`, `trials/undo`, and the two financial twins | error + Retry; a 409 on an answer is "already recorded", not a failure | falls back to the anonymous session | yes |

`FeedbackWidget` is the one deliberate blank. It posts a thumbs-up, a thumbs-
down or a one-line note and shows the acknowledgement optimistically; a failed
send is never surfaced. Interrupting someone to tell them their 👍 did not
save costs more than the datapoint is worth. It is in this column as
`swallowed on purpose` rather than left empty so that nobody has to rediscover
that it was a decision.

## What this table cannot tell you

- **Whether the screen is any good.** These rows are about failure and
  identity, not about whether the couple screen says something worth reading.
  That is [PRODUCT-GOALS.md](PRODUCT-GOALS.md), and ultimately somebody
  looking at it with two real accounts behind it.
- **What it looks like.** Nothing here has been driven in a browser. Every
  test in the `Tested` column runs against jsdom with a stubbed `fetch`: it
  proves the screen reacts correctly to a response shape, never that the shape
  is what the server sends, and never that the result is legible.
- **The three presentational components with no coverage.**
  `CategoryIcon` is a large lookup table of glyphs, `Celebration` is an
  animation, `BottomNav` is four links. They render or they don't, and a
  failure in one is visible the moment anybody opens the app — which is the
  argument for spending the next test elsewhere, not an argument that they are
  covered.
