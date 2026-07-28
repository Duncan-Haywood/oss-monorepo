# The quality bar

The canonical version of the gates and the definition of done lives in
[`src/lib/developmentProcess.ts`](../src/lib/developmentProcess.ts) and is
checked by `src/lib/developmentProcess.test.ts`. This is how to actually run
them, and what each is protecting.

## Run everything

```bash
npm run verify
```

That is `typecheck → lint → test → build`, in the order that fails fastest.
`.github/workflows/ci.yml` runs the same four as separate steps so a failure
names itself.

## CI is not currently running

Every run of that workflow since it was added has failed the same way: about
three seconds, no steps, no downloadable logs, `runner_id: 0`. That is not a
gate failing — it is a job that never started, and it happens identically on
every branch, so it is an Actions/runner availability problem at the repository
or account level rather than anything in the workflow or in a given change.

Two things follow, and the second matters more:

1. **`npm run verify` locally is the entire gate today.** Nothing is checked
   after a push. Treat a green tick from anything other than that command as
   meaning nothing.
2. **Only the account owner can fix it** — enabling Actions for the repository,
   or whatever the billing/runner situation turns out to be. An unattended
   session cannot, and should not report "CI is green" or "CI will catch it".

| Gate | Command | What it is protecting |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Shape drift between the Prisma models, the API responses, and the components reading them — the usual way a rename half-lands |
| Lint | `npm run lint` | React state and effect misuse; leftovers from a partial edit |
| Test | `npm test` | The numerical core, and the contracts between the catalogue, the session bundle and the perspectives |
| Build | `npm run build` | Server/client boundary mistakes and route config errors that only appear when the app is compiled |

## Before deploying

Migrations must match the schema. A schema edit with no migration behind it
builds cleanly and then fails on the first query.

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
```

Exit code 0 means they agree; 2 means there is an un-migrated schema change.
This needs a live database, so it runs in CI against a service container rather
than on every local commit.

## Suppressions

A lint suppression is allowed when the rule is wrong about the specific case.
It must carry its reason on the line above:

```ts
// `load` only sets state after awaiting the fetch, so nothing is set
// synchronously here; the rule can't see through the async boundary.
// eslint-disable-next-line react-hooks/set-state-in-effect
load();
```

A suppression that is papering over a real problem must also appear in
[`IMPROVEMENT-PLAN.md`](../IMPROVEMENT-PLAN.md), so that the debt is counted
rather than hidden. The runner's bootstrap is currently the only one in that
category.

## Definition of done

Read this before saying a change is finished.

- [ ] Every blocking gate passes.
- [ ] A test exists that fails on the old behaviour. Not "a test exists" — a
      test that goes red if you revert the fix. Check by reverting it.
- [ ] No personal data was added to the repo, a seed file, or the client bundle.
- [ ] Nothing merges two perspectives, and no code path lets one person's
      answer move another person's rating.
- [ ] Any new value read from a request body or from storage is narrowed by a
      parser that **rejects**, not coerced to a plausible default.
- [ ] Every document the change made wrong is corrected in the same commit.
- [ ] New failure modes surface to the person as something recoverable — a
      retry, not a dead end — and to the server log as something searchable.

## The one that gets skipped

"A test that fails on the old behaviour" is the check people quietly downgrade
to "a test". They are not the same, and the difference matters more here than
in most codebases, because the bugs in this one do not throw. Two of the fixes
in the fitter looked well-covered by tests that passed identically before and
after; only reverting the fix showed that they proved nothing.

Revert your fix. Watch the test go red. Then put the fix back.
