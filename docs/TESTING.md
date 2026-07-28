# Testing

Two suites. The first needs nothing; the second needs a database.

```bash
npm test                      # unit + component, ~2s, no database, no network
npm run test:watch
npx vitest run src/lib/conjoint.test.ts   # one file

scripts/test-db.sh start      # create, migrate and seed a throwaway Postgres
npm run test:integration      # real route handlers against it
```

**Unit and component** — Vitest, `src/**/*.test.ts(x)`. Most files run in the
node environment against pure functions; the component tests opt into jsdom
with a `// @vitest-environment jsdom` pragma on the first line and drive React
against a stubbed `fetch`.

**Integration** — Vitest, `src/**/*.integration.test.ts`, config in
`vitest.integration.config.ts`. Route handlers are imported and called
directly, with `next/headers` mocked so a test can say which account a call is
signed in as. Files run one at a time because they share one database. Seeded
surveys and items are fixture and are never truncated; everything a session
writes is cleared between tests by `resetData()`.

**The simulation files are the expensive ones.** `pairing.simulation.test.ts`,
`pooling.simulation.test.ts` and `selectionPrior.simulation.test.ts` drive the
real pairing chooser and the real Glicko-2 update over thousands of synthetic
answering sessions, because the numbers in `docs/CONVERGENCE.md`,
`docs/POOLING.md` and the decision records have to come from the shipped code
rather than from a spreadsheet. They are also where the suite's whole runtime
lives, so:

- Every run is seeded. If two metrics are read off the same set of sessions,
  simulate once and read both — re-running per metric produces byte-identical
  answers for three times the cost, which is exactly how the suite came to
  overrun its timeout.
- The unit config sets `testTimeout` to 20s explicitly. Nothing here should
  come close to that; if something does, make the run cheaper rather than
  raising the ceiling.

`scripts/test-db.sh` finds the Postgres server binaries even when only `psql`
is on PATH, and drops to the `postgres` system user when run as root — both of
which are what an agent sandbox looks like. If it cannot find a server it says
what to install. See [decisions/0008](decisions/0008-integration-tests-against-a-real-database.md).

## What is covered

| File | Tests | Guards |
| --- | --- | --- |
| `glicko2.test.ts` | 11 | Rating updates, the volatility solver, monotonicity of the deviation |
| `conjoint.test.ts` | 11 | Coefficient recovery from simulated data, separable and all-tie degenerates, convergence at large n, the line search never stepping downhill |
| `pairing.test.ts` | 10 | Question selection: uncertainty preference, close-rating preference, coverage, recent-repeat avoidance |
| `pairing.simulation.test.ts` | 10 | The whole selection loop against a synthetic respondent: that a realistic answer budget reaches a confidence the couple screen can use, and that the active set only grows. See [CONVERGENCE.md](CONVERGENCE.md) |
| `selectionPrior.simulation.test.ts` | 8 | The other rejected design: cross-perspective priors used *only* to choose questions, which cannot bias an estimate and also cannot help. The oracle run — a prior that knows the truth exactly, and still moves nothing — is the one that closes it. See [decisions/0007](decisions/0007-no-selection-only-cross-perspective-priors.md) |
| `rateLimit.test.ts` | 12 | The anonymous-write throttle: the `>= max` boundary in both directions, the fifteen-minute window, per-IP and per-route scoping, and `x-forwarded-for` parsing |
| `pooling.simulation.test.ts` | 13 | A rejected design, kept measured rather than argued: cross-perspective pooling buys a sevenfold precision gain by turning PARTNER_GUESS into a copy of SELF. Guards the claim so a future session cannot reopen it from intuition. See [POOLING.md](POOLING.md) |
| `tradeoffs.test.ts` | 10 | Every generated financial pair is a genuine non-dominated trade-off |
| `dimensions.test.ts` | 9 | The dimension taxonomy stays consistent with the item catalogue |
| `financialProfiles.test.ts` | 14 | Profile generation stays inside its declared bounds, and a card rebuilt from a stored trial is identical to the one first shown — over 200 seeds at both slot counts |
| `perspective.test.ts` | 7 | The three perspectives parse distinctly and never collapse into each other |
| `sessionStore.test.ts` | 6 | A partial or tampered session bundle is rejected rather than half-used |
| `couples.test.ts` | 37 | Cross-person comparison: percentile positions, the answer-volume trap, overlap floors before a match score |
| `UnifiedRunner.test.tsx` | 8 | The swipe loop: cold start, resume, one question per resume, a half-written bundle, a failed fetch, a thrown fetch, advancing on an answer, and the consent line on the welcome screen |
| `developmentProcess.test.ts` | 13 | The process document stays internally consistent |
| `routeInventory.test.ts` | 3 | [ROUTES.md](ROUTES.md) lists every route that exists, with the right methods — the table is only useful if it is complete |
| `originCheck.test.ts` | 16 | The CSRF rule: a subdomain is not the same origin, the proxy's forwarded host is what a browser is compared against, a non-browser caller is not blocked, and reads are never touched |
| `InsightsView.test.tsx` | 4 | The insight catalogue's contract with the content map |
| `AuthView.test.tsx` | 3 | Signup names what it stores, links the policy, and collects only the three fields it names |
| `api/session/start/route.test.ts` | 3 | The route writes a first name and a perspective and nothing else — the six profile fields the old intro form sent are refused |

### Against a real database

| File | Tests | Guards |
| --- | --- | --- |
| `api/trials/trials.integration.test.ts` | 10 | The swipe loop: an answer moves both items and stores the snapshot undo replays, a resent answer is acknowledged and applied once, two submits racing on one trial apply once, one participant's answers never touch another's ratings, undo restores exactly, and a reload returns the pending question instead of minting a row |
| `api/session/session.integration.test.ts` | 8 | Participant creation and reuse: switching perspective and back lands on the same rows, the six removed profile fields cannot be written, the per-IP throttle counts and exempts accounts, and the status fan-out stays capped |
| `api/couple/couple.integration.test.ts` | 9 | The couple screen: an invite is claimable exactly once under a race, no raw answer or participant id crosses between two people, and the actionable sections stay shut while the data is thin and open when it is not |
| `api/couple/earned.integration.test.ts` | 2 | The couple screen on ratings that were *earned* rather than planted: two linked accounts answer through the real trial routes, and the actionable sections open on a session someone would sit through — plus the one-sided case, where the screen names the partner who has not answered. The measurement it prints is what `docs/CONVERGENCE.md` quotes |
| `api/financial-trials/financial.integration.test.ts` | 15 | The financial and conjoined loop: every card is a real non-dominated trade-off, a reload returns the pending question rather than minting a row, an answer applies once under a race and once on a retry, the refit runs on the first answer and then on a throttle, and a conjoined card's identity weight comes from the answerer's own ratings — two people who rated the same item oppositely fit opposite signs |

## What is not covered, and why it matters

- **The admin portal.** Login, rate limiting and the CSV export have no test
  at any level. Four routes, one of them exporting every answer in the database
  as a CSV, and the only thing that has ever checked them is someone using the
  portal. **This is now the largest gap** — the financial routes, which held
  the title, are covered.
- **`feedback` and `report`.** The two remaining routes that write on a POST
  with no test. Both require an account, which is why they rank below the admin
  portal rather than above it.
- **Real blind-spots output.** The comparison is exercised end to end with
  planted rankings, but no human has read what two real accounts with three
  perspectives filled in actually produces. That is a judgement call, not a
  coverage gap.
- **The runner against a real server.** `UnifiedRunner.test.tsx` drives the
  real component, but every response is stubbed. It proves the component reacts
  correctly to a shape; it cannot prove the server sends that shape.

`api/session/start/route.test.ts` stays even though the integration suite now
covers the same route, and it is worth understanding why: it `vi.mock`s Prisma
and asserts on the payload the route *hands* it. For "this route writes
something it should not" that is strictly better than an integration test,
because a column that was never written and a column written as null look
identical in psql. The two suites prove different things about the same code.

## How to write one here

**Prefer a property over an example.** The numerical modules all take an
injectable RNG for exactly this reason. "The deviation shrinks as answers
accumulate" survives a refactor; "after these four answers the rating is
1523.7" does not.

**Name the regression in the test.** Not `it("handles perspectives")` but a
comment saying what used to happen:

> `/api/session/start` used to narrow with
> `body.perspective === "SELF" ? "SELF" : "PARTNER"`, so every session started
> as "what I think my partner wants" was recorded as "what I want in a
> partner".

Six months later that comment is the only thing that stops someone "cleaning
up" the parser.

**Verify the test actually fails.** Revert the fix, run the test, watch it go
red, put the fix back. A test that passes before and after proves nothing, and
this is easier to get wrong than it sounds — see
[QUALITY-BAR.md](QUALITY-BAR.md).

**Cover the degenerate input.** The fitter's real-world failures are all
edge-shaped: no data, all ties, perfectly separable, one huge outlier. Simulated
well-behaved data will not find them.

**Plant the state when the state is not what you are testing.** The couple
tests write `ParticipantItemRating` rows directly at a chosen deviation rather
than answering the several hundred questions it would take to earn one. What
those tests are for is the route, the privacy boundary and the confidence gate;
how fast a deviation actually falls is measured in
`pairing.simulation.test.ts`, and mixing the two would make both slow and
neither clear.

## Writing an integration test

```ts
vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { POST as start } from "./start/route";
import { createAccount, jsonRequest, resetData, signInAs } from "@/test/integration/db";

beforeEach(async () => { await resetData(); });
```

`signInAs(userId)` issues a real `UserSession` row and puts its token in the
mocked cookie jar, so `getSessionUser()` resolves the way it does in
production. `jsonRequest(url, body, headers)` builds the POST the handler
expects. `createParticipant(slug)` and `surveyIdBySlug(slug)` read the seeded
content.

## Manual verification, when a change touches the database

Most of what used to be on this list is now in the integration suite. What is
left is the part a test cannot do: looking at the screen. Setup is in the
[README](../README.md); the short version is `scripts/test-db.sh start`,
`npm run build`, `npm start`.

Worth checking by hand after any change to session or participant handling:

- Starting with each of the three perspectives records that perspective.
- An unrecognised perspective falls back rather than being accepted.
- For a signed-in account, switching perspective and back returns the **same**
  participant ids, and no new rows appear.
- `/api/auth/me` reports the perspective most recently switched to, and hands
  back participants only from that perspective.
