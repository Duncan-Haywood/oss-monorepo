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

## Never write `fixes #N` / `closes #N` about someone else's PR

GitHub treats `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`,
`resolves`, `resolved` followed by `#N` as a **command**, not a reference. When
the commit lands on the default branch, it closes `#N` — and a pull request
closed this way is closed *unmerged*, so its diff is silently dropped.

This has already cost the portfolio a shipped fix. On 2026-08-19, PR #112 (a
ledger-only entry) had the commit subject *"Ledger: record independent
re-verification of #109/#106, **fixed #109's merge conflict**"*. Merging it
closed #109 — which carried `local-site-studio`'s upgrade to `next@16.3.1`,
clearing three high-severity advisories, and was deliberately being held for
the account owner's sign-off. Nobody decided to drop it; a verb in a sentence
about a *merge conflict* did. Two later ledger entries (#115, #116) then
recorded #109 as "unchanged" and still awaiting sign-off, and a third session
listed the open PRs without it and read nothing unusual into the shorter list —
none of the three had any way to see it had been closed by accident. The three
advisories sat on `main` for the next hour.

The failure is quiet in both directions: the closing session sees a normal
merge, and later sessions cannot tell a deliberately-closed PR from an
accidentally-closed one. Ledger entries and status comments are where this
bites, because their whole job is to talk *about* other PRs.

- Refer to other PRs as plain references: "#109", "PR #109", "per #109",
  "re-verified #109". A bare `#N` is always safe.
- Rephrase anything that puts a closing verb before the number. "fixed #109's
  merge conflict" → "resolved the merge conflict on #109". "closes #104 and
  #107" in a consolidating PR → keep it, that one is intended.
- The keyword only fires on the repo's own issues/PRs and only from the PR body
  or a commit reaching `main`. Comments are safe, but write them the same way —
  text gets copied into commit messages.

When you do intend to close a PR, close it explicitly with a comment saying
why and pointing to what supersedes it. Intentional closes should be visible
as decisions, not as side effects of prose.
