# Release lag

Every other control in this repository asks whether the work is good. None of
them asked whether it ever shipped.

`scripts/ci/release_lag.py` measures the gap between what is committed and what
is deployed, holds it to `platform/release-lag-policy.yaml`, and fails closed.
`tests/test_release_lag.py` runs it as a repository contract.

## What it measures

A commit is **shipped** when it is an ancestor of the deployment ref —
`origin/main`, the ref `.gitea/workflows/*` deploy production from. Everything
committed and not reachable from it is inventory: real engineering effort with,
by definition, zero effect on any customer.

```bash
python3 scripts/ci/release_lag.py --report
```

Reported: unshipped commit count across local branches, the age of the oldest
unshipped commit (worst-case DORA lead time for changes), the per-branch
breakdown so a stalled branch is named, and the affected components split into
those with a live production URL and those without. That split is the point —
a venture nobody can reach yet accruing commits is untidy, while a live service
accruing them means customers are running old code.

## Why a ratchet, and not a threshold

`target` is what good looks like. `acknowledged` is at most one entry raising
the limits to what is true today, carrying an owner, an issue, a reason and an
expiry — the shape `platform/exception-register.yaml` uses for suppressions.

Unlike `count` there, these limits are not exact. The number moves with every
commit anyone makes, and a baseline rewritten hourly is a baseline nobody
reads. Each limit therefore carries a `slack`, and the audit fails in both
directions:

* above the effective limit — the backlog grew past what was reviewed
* more than `slack` below it — the acknowledgement is stale, lower it
* inside `target` while an acknowledgement exists — delete it, the target binds
* expired, or `expires` more than 180 days out

It fails closed on a deployment ref that does not resolve, a directory that is
not a git repository, a missing or malformed policy, an acknowledgement missing
a field, and an `extra_components` path that no longer exists. An audit that
cannot see `origin/main` knows nothing about what shipped, and "nothing is
wrong" is not the honest report of that state.

Mutation-checked sixteen ways: each guard above was disabled in turn and the
suite failed each time. One mutation initially survived — dropping the
completeness check on acknowledgement fields still failed, but through the
per-field type checks behind it, so the test was passing on someone else's
guard. It now asserts the error names the missing field.

## What it deliberately does not do

It does not push, merge, or open a change. Shipping is an outward action with a
production deploy on the other end, and it is the repository owner's call — in
particular, it is not a call the automated runs that created the backlog can
make for themselves. This measures the cost and names it; a human decides.

## RL-001 — the backlog recorded on 2026-08-02

`origin/main` was at `a4b8f23` from 2026-07-31 14:48. The audit measured **108
unshipped commits** across 29 local branches, the oldest 2 days old.

Production serves `origin/main`. Confirmed by byte-comparison rather than
inference: live `https://marisstella.dev/app.js` returned 5806 bytes,
byte-identical to `origin/main`, while `HEAD` had 6310. The homepage's five
2026-08-01 fixes — two `target="_blank"` links missing `rel="noopener"`,
keyboard focus lost when a venture brief closed, a decorative glyph missing
`aria-hidden`, and every brief list item drawing a second bullet — were not on
the page a visitor loaded, a day after they were written and recorded as fixed.

Live services running code older than `HEAD`, as measured:

| Service | Unshipped | Production |
| --- | --- | --- |
| `quick-pick-survey` | 19 commits | `https://pairwise.marisstella.dev` |
| `real-estate-agent-photo-app` | 4 commits | `https://listing-lens-docs.pages.dev` |
| `retail-pilot-intel` | 4 commits | `https://retail-pilot-intel.pages.dev` |
| `marisstella-homepage` | 2 commits | `https://marisstella.dev` |

The remaining commits touch components with no production URL, so they are
backlog rather than customer-visible staleness: `platform/ci` (22),
`ai-first-markets` (8), `print-atelier` (8), `local-site-studio` (6),
`photo-editing` (4), `ai-engineering-academy` (3), and three others with two
each.

The consequence worth stating plainly: a `Fixed` row in
[the security audit log](SECURITY_AUDIT_LOG.md) does not imply the live service
is fixed. `git merge-base --is-ancestor <commit> origin/main` is the check that
settles it.

### Drain plan

Owner: duncan. The acknowledgement expires **2026-09-13**.

1. **Decide what ships.** 29 branches is not 29 changes; several are supersets
   of each other, and `agent/ship-integration-2026-08-02` already merges a
   dozen. Start from the integration branches rather than the leaves.
2. **Run the full verification on the integrated result**, not on each branch —
   `bash scripts/verify-all.sh`. The branches were verified individually
   against different bases.
3. **Open one pull request per coherent change** so the Gitea protection rules
   recorded in [the roadmap](ENGINEERING-ROADMAP.md) actually apply. `main`
   blocks direct pushes, so this is the only route in any case.
4. **Confirm the deploy landed**, per service, by the same byte-comparison used
   above rather than by a green workflow. The homepage in particular is served
   from a ConfigMap assembled by `platform/ci/deploy-homepage.sh --from-file`,
   not from the container image, so an image rebuild is not evidence that the
   page changed.
5. **Re-run the audit** and lower or delete RL-001.

### Making it not recur

The backlog is a symptom: scheduled runs commit to a fresh `agent/*` branch and
nothing closes the loop. Two follow-ups, neither done:

* Run this audit at the end of each scheduled run and surface the number, so a
  run that adds to the pile says so in its own report.
* Give the roadmap's DORA scorecard item its remaining three measures —
  deployment frequency, change-failure rate, and time to restore. Lead time is
  the one implemented here, and it is the one that was silently unbounded.
