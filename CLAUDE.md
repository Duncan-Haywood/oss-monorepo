# Working in this repo

Read `README.md` first for the ventures/platform/portfolio layout.

## Check open PRs before starting work

This repo runs scheduled/automated agent sessions, often several per hour,
each starting from a fresh checkout with no memory of the others. Before
starting new work, list open pull requests and recent commits and check
whether one already covers it. If it does, review, extend, or consolidate
that PR instead of opening a duplicate — do not re-derive the same change
from scratch.

This matters more here than in most repos: on 2026-08-18, roughly two dozen
PRs accumulated within a few hours, a large fraction near-duplicates of each
other — independent scheduled runs each discovering the same gap (missing
`VENTURE.yaml`, missing liability scoring on business candidates, an
unreviewed automation workflow) and opening its own PR, unaware the others
existed. Several sessions correctly *flagged* the backlog as the real
problem but then joined the same unmerged pile instead of fixing it — noticing
the pattern did not by itself stop it. That is wasted agent spend against the
portfolio's own goal of profitable output, not useful parallelism.

If you find the open-PR backlog is large and growing, the most valuable
thing a session can do is consolidate: pick the strongest existing PR(s),
merge in anything unique from the others, verify the result (run the actual
tests, don't just trust the diff or the title), and close the rest with a
comment pointing to the consolidated PR. Merging into `main` is still a call
for the human account owner — call it out clearly in the PR body so the
decision doesn't itself get lost in the backlog.

## Automation that writes or spends unattended

Anything that runs unattended, can push commits or open PRs, and consumes
paid API budget (agent fleets, scheduled workflows with third-party GitHub
Actions, cron-triggered jobs) is a deliberate, human-reviewed decision, not
something a session should add or re-enable on its own judgment. If you
think one would help, propose it in a PR and say so plainly — don't ship it
straight to `main`.

## Ledger discipline

Per `portfolio/ledger/README.md`: record outcomes in the monthly ledger file
even when the outcome is "nothing shipped" or "found wasted spend." That
signal is what the portfolio router (`portfolio/router/README.md`) uses to
allocate effort, so it only works if it's honest.

The duplicate-PR pattern above recurs one layer up, at the ledger itself: on
2026-08-19 six scheduled sessions each independently re-verified the same PR
and opened their own ledger-only PR within a ten-minute window, and even
after that was consolidated, further sessions (including concurrent runs of
this very session) kept re-doing the identical verification and drafting
near-identical entries within the same hour — because each was working from
a `main` that was already stale by the time it looked. Before drafting a new
entry, `git fetch origin main` and read the most recent entry/entries against
the *current* remote tip, not the tip you started from. If the latest entry
already covers your findings (same PR verified, same blocker re-confirmed, no
new development) and is less than a few hours old, do not add another one —
that repeats the exact waste this section exists to prevent. Only add a new
entry when you have something the latest one doesn't: a new PR, a changed
finding, or an action you actually took.
