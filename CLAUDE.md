# Working in this repo

Read `README.md` first for the ventures/platform/portfolio layout.

## Check open PRs before starting work

This repo runs scheduled/automated agent sessions. Before starting new work,
list open pull requests and check whether one already covers it. If it does,
review or extend that PR instead of opening a duplicate — do not re-derive
the same change from scratch.

This matters more here than in most repos: as of 2026-08-18, ten open PRs had
accumulated with nothing merged into `main` since 2026-08-08, several of them
near-duplicates of each other (independent scheduled runs all discovering the
same "ventures are missing `VENTURE.yaml`" gap and each opening its own PR to
fill it, unaware the others existed). That is wasted agent spend against the
portfolio's own goal of profitable output, not useful parallelism.

If you find the open-PR backlog is large and growing rather than shrinking,
that is itself the most valuable finding for a session to report — say so
plainly rather than adding another PR to the pile. The fix needs a human
decision (which of several near-duplicate PRs to merge, whether the scheduler
needs a concurrency guard) that an agent session should surface, not make
unilaterally.

## Ledger discipline

Per `portfolio/ledger/README.md`: record outcomes in the monthly ledger file
even when the outcome is "nothing shipped" or "found wasted spend." That
signal is what the portfolio router (`portfolio/router/README.md`) will
eventually use to allocate effort, so it only works if it's honest.
