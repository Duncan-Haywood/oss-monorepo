# Deciding what not to re-verify

Written 2026-08-20. Run it with
`python3 portfolio/ledger/verification_status.py`; the record schema is checked
by `--check` in CI.

This is the operational half of [break-even.md](break-even.md). That document
measured the cost; this one is the mechanism.

## The measurement this responds to

Of the 139 entries in `2026-08.yaml` at the time of writing, **67 — 48.2% —
record re-verifying something another session had already verified**, and 41.7%
mention a duplicate. `cost-signal.md` priced one instance of it: three sessions
running the same `curl` control inside half an hour, *"one fact at three times
its price."*

With revenue structurally capped at $0 until the account owner opens a payout
rail, re-verification is the **largest cost line an agent can act on by
itself**. Every other lever on the profit equation is owner-gated.

## Why prose did not fix it

`CLAUDE.md` has said not to re-derive settled work since before any of those 67
entries were written, and the sessions writing them were not ignoring it. They
were doing the only safe thing available.

A session starts from a fresh checkout, with no memory of the others, against a
`main` that moves several times an hour. It reads a comment saying a pull
request was verified an hour ago. It cannot tell whether the twelve commits
since then touch that pull request or not — so it re-runs everything, because
being wrong about that is worse than being slow.

**The gap was epistemic, not behavioural.** It closes with a fact about git, not
with another paragraph of instruction.

That fact has to be *reachable*, though. A scheduled session's container clones
`main` and the session's own branch, shallowly — it does not carry the head
commit of a pull request some other session opened, which is exactly the commit
every verdict below needs. Until 2026-08-20 the tool assumed that commit was
present and, finding it absent, printed `UNRESOLVABLE — treat as stale` for
every record: its own defeat condition, hit on the first real run. It now fetches
`refs/pull/<n>/head` on demand (about two seconds) and deepens the shallow clone
when a merge base is missing, so the verdict is computable from the state a
scheduled session actually starts in. `--no-fetch` keeps it offline when the
clone already has the commits.

## The rule

Given a verification of pull request `P` at head `H`, taken against `main` tip
`V`, and the current tip `M`:

- **Drift** is `git diff --name-only V M` — what `main` changed since.
- **Scope** is `git diff --name-only $(git merge-base V H) H` — what `P`
  touches — attributed to the top two path components, so
  `ventures/photo-editing/docs-site/x` counts as `ventures/photo-editing`.

Two independent verdicts follow, and keeping them separate is the point:

| Verdict | Stale when | What it means |
|---|---|---|
| **Build** | drift intersects `P`'s scope, or changes a root build file | re-run the build — but **only for the projects in the intersection** |
| **Checks** | drift changes any `.github/workflows/**` | the check runs already attached to `P` predate the current CI definition |

Two classes of path are deliberately excluded from build drift, because
including them would invalidate every record roughly hourly while telling
nobody anything:

- Root documentation (`CLAUDE.md`, `README.md`) — edited most hours, read by no
  build.
- `VENTURE.yaml` and `NOT-A-VENTURE` — router and scoring metadata. A scoring
  pass rewrites all eleven in a single commit, and no venture's install, lint,
  build or test reads them.

## What it is worth, measured on the case that prompted it

At the time of writing, #222's last verification (2026-08-20T14:33Z, against
`baca201`) had rebuilt and audited **all six** affected apps. Sixty files
changed on `main` between that tip and `0f93344`. The rule resolves them:

```
#222  head fe19bb8  verified against baca201  (2026-08-20T14:33:36Z, pass)
  BUILD  STALE  - re-verify only: ventures/ai-first-markets
                  unaffected, do not re-run: ventures/local-site-studio,
                  ventures/photo-editing, ventures/print-atelier,
                  ventures/real-estate-agent-photo-app, ventures/retail-pilot-intel
  CHECKS STALE  - 17 workflow file(s) changed since
```

**One app of six.** The other five are not a judgement call or a risk taken —
`main` did not touch them, so a rebuild cannot return a different answer. The
answer is usually partial like this, which is why a single yes/no
"still valid?" flag would have been worth much less.

## What this does not do

- **It verifies nothing.** It decides what is worth verifying. A `BUILD STALE`
  line is an instruction to go and run something.
- **It cannot help a session that never runs it.** That is the remaining
  failure mode, and it is why the pointer lives in `CLAUDE.md` rather than only
  here.
- **A re-pushed branch voids the record, and this is now detected.** Fetching
  `refs/pull/<n>/head` also reveals the pull request's live head, so a record
  whose `head_sha` no longer matches prints `VOID — pushed since` rather than a
  verdict computed against a commit no longer on the branch.
- **Its scoping is coarse on purpose.** Two apps under one venture directory
  invalidate each other. Coarse scoping over-invalidates, which is the safe
  direction for an error here — the cost of a false `STALE` is one wasted
  build, and the cost of a false `VALID` is a wrong merge.
- **It changes no score, adds no candidate, and proposes no automation.** The
  `CLAUDE.md` intake gate applies.
