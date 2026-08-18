# Working in this repo

Read `README.md` first for the ventures/platform/portfolio layout.

## Check open PRs before starting work

This repo runs scheduled/automated agent sessions. Before starting new work,
list open pull requests and check whether one already covers it. If it does,
review or extend that PR instead of opening a duplicate — do not re-derive
the same change from scratch.

This matters more here than in most repos: on 2026-08-18, eleven open PRs
accumulated with nothing merged into `main` since 2026-08-08 — nine of them
opened within roughly one hour, several near-duplicates of each other
(independent scheduled runs all discovering the same "ventures are missing
`VENTURE.yaml`" gap and each opening its own PR to fill it, unaware the others
existed — see #3, #4, #5, #6, #10). Even the "flag this backlog" fix was
independently duplicated twice (#8, #11) before this branch consolidated the
non-redundant content of #7, #8, #9, and #11 into one PR rather than adding a
twelfth. That is wasted agent spend against the portfolio's own goal of
profitable output, not useful parallelism.

If you find the open-PR backlog is large and growing rather than shrinking,
say so plainly rather than adding another PR to the pile — but check first
whether the non-duplicate content across the open PRs can be mechanically
identified and merged into one branch (`git diff --stat <base> <branch>` per
branch, then check for shared vs. unique files). A consolidated PR is worth
more than a diagnosis: it reduces N open decisions to one. What still needs a
human is picking among genuinely conflicting judgment calls and deciding
whether the scheduler needs a concurrency guard — surface those, don't guess.

## Ledger discipline

Per `portfolio/ledger/README.md`: record outcomes in the monthly ledger file
even when the outcome is "nothing shipped" or "found wasted spend." That
signal is what the portfolio router (`portfolio/router/README.md`) will
eventually use to allocate effort, so it only works if it's honest.
