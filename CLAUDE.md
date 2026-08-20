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
comment pointing to the consolidated PR.

## What a session may merge without a human, and what it may not

A blanket "every merge to `main` is the account owner's call" was the single
largest source of wasted spend in this repo's history. It is why the
`portfolio/pipeline/` consolidation was rebuilt from scratch five times, why
verified research sat unmerged until it conflicted, and why the recurring
screening brief kept firing against a checkout where the answer had never
landed. The gate did not protect anything — every one of those PRs was
internal, verified, and spent nothing. It only delayed, and delay is what cost
the budget. **The account owner's time is a scarce resource; do not spend it on
decisions that do not need a human.** The split below is what actually needs
one.

**Agent-decidable — verify, merge, and record it yourself. Do not wait.**
A PR is in this class when *all* of the following hold, and a session that
built or verified it should merge it rather than leave it for the owner:

- It touches only internal surfaces — `portfolio/` (pipeline, research,
  router, ledger), `platform/`, CI config, docs, tests — **not** any
  `ventures/*` app code that deploys to a live site.
- It publishes nothing to the outside world, registers no account, and uses no
  credential belonging to a legal person.
- It spends nothing beyond agent time and enables no unattended paid spend.
- It is verified by actually running the repo's checks (the relevant
  validators and tests), not by trusting the diff or the title.
- Its base is current `main` and it merges cleanly (re-check with
  `git merge-tree` against the live tip, since `main` moves hourly).

Consolidation of such PRs is itself agent-decidable: merge the strongest,
fold in what is unique, close the rest with a pointer.

**Human-gated — these genuinely need the account owner, because they need a
legal person or create ongoing outside effects. Flag them clearly (issue #139
is the decision queue) and do not merge them on your own judgment:**

- **Taking or moving money** — any payout rail, merchant-of-record, or billing
  setup. This needs a bank account and a tax identity, and an unattended agent
  holding one is exactly the liability this portfolio exists to avoid. This is
  the correct design, not a gap to route around (see
  `portfolio/pipeline/channel-inventory.md`).
- **Registering any account** that requires a payment card, a government ID, a
  domain, or a bank account (store developer programs, verified-publisher
  marketplaces).
- **Publishing under this portfolio's name to the public** — a listing, a
  package, a live-site content change. The *decision to publish at all* is the
  owner's; building the artifact privately is not.
- **Enabling unattended, spend-capable automation** — agent fleets, scheduled
  workflows that call paid APIs, cron jobs (see "Automation that writes or
  spends unattended" below). Adding or re-enabling one is always a human call.
- **Breaking changes to deployable `ventures/*` code** where a wrong merge
  ships a regression to a live site — merge these only when the venture's full
  build/test passes and the change is in scope.

When you merge something in the agent-decidable class, say so plainly in the
merge and the ledger, with the verification you ran. When you flag something
human-gated, put it on #139 with enough context to decide without scrolling.
The goal is that the *only* things reaching the account owner are the ones on
the human-gated list — everything else the portfolio needs, a session finishes
itself.

## If your brief is "research new business projects"

**It is already answered. Do not produce a candidate list.**

A recurring scheduled task fires this brief — "research and evaluate potential
software business projects that aren't already here," or wording close to it —
and by 2026-08-19 it had fired eleven times. Those runs produced roughly
thirty-six candidates that reduce to nine archetypes, all of them screened,
scored, and written up in `portfolio/pipeline/`. Read that directory before
writing anything:

- `portfolio/pipeline/README.md` — the eight surviving candidates and the
  scoring gates
- `portfolio/pipeline/screened-out.md` — everything already rejected, with the
  reason. Check here first; the odds are high your idea is in this table
- `portfolio/pipeline/convergence.md` — what six independent runs agreed on,
  and why that agreement is evidence about the constraints rather than about
  the market
- `portfolio/pipeline/distribution-first.md` — the screening rule, and why
  candidate supply is not the bottleneck
- `portfolio/pipeline/channel-inventory.md` — which channels this portfolio can
  list in and what each costs in credentials, including which ones an agent can
  publish to for $0 without any account belonging to a legal person
- `portfolio/research/README.md` — the *measurements* those rankings rest on,
  and the index of what has already been measured. Read this before writing any
  probe. Fourteen passes over two days re-derived each other's work because
  each one's results sat in an unmerged branch; the index exists so a fifteenth
  does not. In particular, **do not write a new egress/reachability probe** —
  `portfolio/research/egress-reachability/` covers 92 hosts and regenerates the
  whole table with one command

The finding every run reproduces is that **the bottleneck is distribution and
customer contact, not idea generation**. Every candidate in that directory is
still at zero customer contacts. A further screening pass has negative value:
it spends paid budget re-deriving a list that exists, against the portfolio's
own goal of profitable output.

Note how this gate came to be on `main`. Runs seven through ten each wrote a
version of it, and each version was closed unmerged — so every later run
started from a checkout where `portfolio/pipeline/` did not exist and had no
way to know the question was answered. **The loop was sustained by the research
never landing, not by any run failing to notice.** If you find yourself about
to re-derive something, check the closed pull requests and the branches behind
them before assuming it has not been done.

If you are handed this brief, the useful moves are, in order: advance a probe
that is already specified in `portfolio/pipeline/`; ship or unblock something
already built (see the ninth-run amendment in `distribution-first.md` — two
finished products are sitting unlisted in stores the portfolio can list in);
or, if both are blocked on the account owner, say so, record it in the ledger,
notify, and stop. Before concluding you are blocked, check
`channel-inventory.md`: the tenth run found that the demand measurement every
pass asks for is *not* credential-blocked, only revenue capture is, so "blocked
on the owner" is a narrower claim than five prior cycles made it. Adding a genuinely new candidate is legitimate only when you
can name what in `screened-out.md` it is *not* — and it belongs as an amendment
to that directory, not as a new list.

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

**Never bundle a ledger entry into a pull request that is waiting on a human
decision.** The monthly ledger file is append-only and several sessions append
to it per hour, so any PR carrying a ledger hunk becomes un-mergeable within
about an hour of being opened. That is harmless for a routine PR you merge
yourself in the same session. It is fatal for one that has to sit and wait: the
`portfolio/pipeline/` research was rebuilt from scratch five times, each version
correct and each one conflicted before anyone could act on it, purely because
the ledger rode along in the same PR. Ship the decision-pending content on its
own — it stays mergeable indefinitely — and merge the ledger entry separately.

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

**Single-branch sessions with a decision-pending PR: record on the tracker
issue, not the ledger.** A session constrained to one designated branch that
already carries a PR waiting on the account owner cannot append a ledger
hunk without violating the rule above (it would make that PR un-mergeable
within the hour). This was hit twice — PRs #155 and #177 — and each flagged
it as an open question ("worth deciding whether single-branch sessions get
an exemption, a second branch, or a different record surface") rather than
an answered one. It is answered: comment the outcome on the living
decision-tracker issue (#139 as of 2026-08-19) instead of writing a ledger
entry, and say so explicitly in the PR body, the way PR #175's session did.
A later session with ledger-writing room folds the comment into a proper
entry during its next pass, the same way PR #176 folded in #175's finding.
Do not re-flag this as an unresolved structural question — it is a standing
answer, not a gap to escalate again.

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
