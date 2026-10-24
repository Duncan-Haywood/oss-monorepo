<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Read the process before changing anything

[`developmentprocess.tsx`](developmentprocess.tsx) is the front door: the goals, the principles, the loop a change goes through, the gates, and what "done" means. It is typed data in `src/lib/developmentProcess.ts`, guarded by a test, so it cannot drift from what is actually enforced.

Long-form companions:

- [`docs/PRODUCT-GOALS.md`](docs/PRODUCT-GOALS.md) — what the app is for, and what it deliberately is not
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the measurement works, and where the risk is
- [`docs/QUALITY-BAR.md`](docs/QUALITY-BAR.md) — the gates and the definition of done
- [`docs/TESTING.md`](docs/TESTING.md) — what is covered, what is not, how to add
- [`IMPROVEMENT-PLAN.md`](IMPROVEMENT-PLAN.md) — the live backlog

# Before you say a change is finished

```bash
npm run verify   # typecheck → lint → test → build
```

Three things get skipped most often, and each has cost real correctness here:

1. **Narrow untrusted input with a parser that rejects.** Reject an unknown value rather than coercing it to a plausible default — coercion is how one of the three perspectives was silently recorded as another for every session that used it.
2. **Prove the test fails on the old behaviour.** Revert your fix, watch it go red, put it back. A test that passes before and after proves nothing, and the bugs in this codebase do not throw.
3. **Fix the docs the change made wrong, in the same commit.** A stale plan is worse than no plan, because it gets trusted.
<!-- END:nextjs-agent-rules -->
