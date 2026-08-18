# Working in this repo

Read `README.md` first for the ventures/platform/portfolio layout.

## Check open PRs before starting work

This repo runs scheduled/automated agent sessions. Before starting new work,
list open pull requests and check whether one already covers it. If it does,
review, extend, or consolidate that PR instead of opening a duplicate — do
not re-derive the same change from scratch.

This matters more here than in most repos: by 2026-08-18, twelve open PRs had
accumulated with nothing merged into `main` since 2026-08-08. At least eight
of them were near-duplicates of each other — independent scheduled runs each
discovering "ventures are missing `VENTURE.yaml`" and opening their own PR to
fill it, unaware the others existed. Two more PRs correctly flagged the
backlog as the real problem but themselves joined the same unmerged pile
instead of fixing it. That is wasted agent spend against the portfolio's own
goal of profitable output, not useful parallelism.

If you find the open-PR backlog is large and growing, the most valuable
thing a session can do is consolidate: pick the strongest existing PR(s),
merge in anything unique from the others, verify the result (run the actual
tests, don't just trust the diff), and close the rest with a comment pointing
to the consolidated PR. Merging the consolidated PR into `main` is still a
call for a human — call it out clearly so the merge decision is not itself
lost in the backlog.

## Ledger discipline

Per `portfolio/ledger/README.md`: record outcomes in the monthly ledger file
even when the outcome is "nothing shipped" or "found wasted spend." That
signal is what the portfolio router (`portfolio/router/README.md`) will
eventually use to allocate effort, so it only works if it's honest.
