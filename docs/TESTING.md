# Testing

```bash
npm test          # once
npm run test:watch
npx vitest run src/lib/conjoint.test.ts   # one file
```

Vitest, node environment, `src/**/*.test.ts(x)`. No database and no network:
every test here runs against pure functions.

## What is covered

| File | Tests | Guards |
| --- | --- | --- |
| `glicko2.test.ts` | 11 | Rating updates, the volatility solver, monotonicity of the deviation |
| `conjoint.test.ts` | 11 | Coefficient recovery from simulated data, separable and all-tie degenerates, convergence at large n, the line search never stepping downhill |
| `pairing.test.ts` | 10 | Question selection: uncertainty preference, close-rating preference, coverage, recent-repeat avoidance |
| `tradeoffs.test.ts` | 10 | Every generated financial pair is a genuine non-dominated trade-off |
| `dimensions.test.ts` | 9 | The dimension taxonomy stays consistent with the item catalogue |
| `financialProfiles.test.ts` | 9 | Profile generation stays inside its declared bounds |
| `perspective.test.ts` | 7 | The three perspectives parse distinctly and never collapse into each other |
| `sessionStore.test.ts` | 6 | A partial or tampered session bundle is rejected rather than half-used |
| `developmentProcess.test.ts` | 12 | The process document stays internally consistent |
| `InsightsView.test.tsx` | 4 | The insight catalogue's contract with the content map |

## What is not covered, and why it matters

- **The API routes.** No integration harness exists. The transactional
  claim-then-apply in `trials/answer` and the participant reuse in
  `session/start` are verified by hand against a local Postgres, which does not
  survive a future edit. This is the largest gap.
- **The runner component.** `UnifiedRunner` is the core loop and has no test at
  all. jsdom is installed but nothing is configured to use it.
- **Anything requiring two linked accounts.** The couple comparison is only
  exercised through its pure helpers in `couples.ts`, not end to end.

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

## Manual verification, when a change touches the database

There is no automated integration layer yet, so a route change is checked
against a local Postgres by hand. Setup is in the [README](../README.md); the
short version is `prisma migrate deploy`, `prisma db seed`, `npm run build`,
`npm start`, then drive the routes with `curl` and inspect the rows with `psql`.

Worth checking after any change to session or participant handling:

- Starting with each of the three perspectives records that perspective.
- An unrecognised perspective falls back rather than being accepted.
- For a signed-in account, switching perspective and back returns the **same**
  participant ids, and no new rows appear.
- `/api/auth/me` reports the perspective most recently switched to, and hands
  back participants only from that perspective.
