# Agent work queue

Each `*.yaml` file here is a job the governor may start. Argo syncs them
into a ConfigMap. The governor does **not** keep eight Codex processes
hot; it creates at most `maxConcurrent` Jobs (1 on the cpx22).

`open-pr-repair-merge.yaml` (7), `branch-pr-drain.yaml` (6),
`deploy-cicd-readiness.yaml` (5), `marketing-distribution.yaml` (4),
`seo-discoverability-audit.yaml` (3), and
`product-feature-improvement.yaml` (2) are the real, enabled items — the
same priority order they're named in. Finish work that is already open
first, then the branches that never got a PR, then the delivery path, then
getting the thing in front of people, then metadata and content, then
general feature work; raise or disable an item in git to change that order.

`marketing-distribution` was added on 2026-08-31 and everything above it
shifted up by one to make room. It covers the gap between "the page is
well-formed for a crawler that found it" — which is
`seo-discoverability-audit`'s job, and which now reports full coverage on
both of its backlogs — and "anyone finds the site at all", which nothing
owned. For a brand-new domain those are different problems on different
clocks: rankings take months, an embeddable widget or a comparison page
earns a link the week it ships. It sits *below* `deploy-cicd-readiness`
because a distribution asset for a site nobody can reach yet is worth less
than the path that makes it reachable.

Its prompt is deliberately fenced, and `test_governor.py` pins the fence:
no publishing outward, no claim that is not true, and an asset that deploys
rather than a campaign document. Building the asset is an agent's; putting
the portfolio's name somewhere public is the owner's.

`open-pr-repair-merge` sits first, because the items around it leave a hole
between them: every one of them *ends* by opening a pull
request, and three actively steer around PRs that already exist —
`branch-pr-drain` takes only branches "not already covered by an open pull
request", and `product-feature-improvement` and `seo-discoverability-audit`
each skip a venture that already has one. Nothing reviewed, repaired or
merged an open PR. That is fine while every run merges its own work and
fine while the queue is empty, and it fails the first time a run's
verification does not come out clean: that PR is left open, no item will
ever pick it up again, and the backlog grows by one per tick from then on.
A fleet that only opens PRs has no drain.

`pick_item` scores each enabled item
`(priority + 1) / ((runs + 1) * (noops + 1))` and takes the highest, where
`runs` is how many Jobs that item has been started for in the current 5-hour
window and `noops` is how many finished runs in a row that item changed
nothing. So the top item opens every window, and over a window the six run in
roughly `8:7:6:5:4:3` — priority sets *how often*, not *instead of*.

It did not always. Until 2026-08-30 this was `sorted(key=(-priority, id))[0]`:
the single highest-priority item, every tick, forever. `branch-pr-drain` took
100% of the quota and the other three were unreachable — not deprioritised,
unreachable, until someone hand-edited priorities in git. That was defensible
while the PR/branch backlog was the bottleneck. It stopped being defensible
the day the backlog drained: the repo hit zero open PRs with every one of
~180 unmerged branches superseded, so the top item had nothing left to do and
would still have spent the whole budget re-triaging an empty queue. A queue
whose lower items can never run is a queue with one item in it.

## The `noops` term: an item whose work has run out

Rotation fixed starvation but not waste. Weighting by priority alone assumes
every item always has work, and on 2026-08-31 two of the five provably did
not — the repo had **zero open PRs** and every branch with unique commits was
already merged, so `open-pr-repair-merge` and `branch-pr-drain` had nothing to
find. Between them that is `13/25`ths of the weight, so more than half of a
ChatGPT plan's included quota would go to Jobs that clone the repo, boot
Codex, confirm there is nothing to do, and exit.

So a run that finishes cleanly and changes nothing now says so. `worker.sh`
writes `codex-noop` to `/dev/termination-log`; Kubernetes surfaces that as the
container's `terminated.message`, which is the field the governor already
reads for limit errors. The Job still reports **Succeeded** — an empty run is a
correct outcome, not a failure, and `kubectl get jobs` should not claim
otherwise.

The governor counts consecutive empty runs per item in `noops_by_item` and
divides the score by `noops + 1`. An item that keeps coming up empty fades and
hands its share to items that still deliver.

Three properties keep this from becoming its own trap:

- **The first productive run clears the counter outright.** Nothing is
  disabled and no priority is edited in git — an empty item is quiet, not gone.
- **The fade is capped** at `MAX_NOOP_DAMPING` (10), so a fully damped item
  still surfaces occasionally. That is what lets it discover its work came
  back; an item damped to zero could never find out.
- **It survives the window rollover.** `runs_by_item` restarts every window on
  purpose, but "this item has had nothing to do for six runs" is a fact about
  the repository, not about the window. Re-buying that discovery with a Codex
  Job every five hours is the exact waste being removed. `prune_noops` drops
  ids the queue no longer has, which is what bounds the dict instead.

A run cut off by a quota limit is never counted as empty: it says nothing
about whether the item has work, and the limit cooldown already handles it.
Neither is a `delivery: agent` run, whose prompt owns the push and legitimately
leaves this script an unchanged tree.

`deploy-cicd-readiness` sits third on purpose, behind `open-pr-repair-merge`
and `branch-pr-drain` (this used to say "second", from before
`open-pr-repair-merge` was added above it). The portfolio has 169 finished
tools and no public URL, so the delivery path is worth more per run than
another metadata pass — but its remaining *owner* steps (a sealed clone
token, `CI_RUNNER`, the governor flip) are not agent-actionable and are
already queued. (A fourth step, an ACME contact, stopped being one on
2026-08-30 — an ACME account contact is optional, so the issuers ship
without one instead of with a placeholder.) That item covers only the code
half, and says so. Enabling an item here does
not spend anything by itself: the governor stays a no-op until an owner
seals `codex-secrets` and flips `governor/policy.json` `enabled: true` and
`governor/cronjob.yaml` `suspend: false` (decision-queue item
`agent-runner-subscription-login`, #2000). These files are what run the
moment that flip happens.

A file is skipped when `enabled: false`, or when it is missing `id` /
`repo` / `prompt`.

## `delivery`

Who pushes the branch and opens the PR.

- `harness` (the default, and what you get if the key is absent) — the agent
  edits the working tree and exits; `worker.sh` folds everything into one
  commit on `agent/codex/<id>-<timestamp>`, pushes it, and opens the PR. The
  agent must not push or open a PR itself, and the run fails if it wandered off
  the branch the worker created.
- `agent` — the item's own prompt owns delivery, and `worker.sh` opens nothing.
  Use this for anything that touches more than one branch, or that is supposed
  to merge its own PR: a single folded commit cannot express either, and under
  `harness` the two would race and produce a duplicate PR.

All six real items are `agent`. Five of them tell the agent to open a PR and
merge it under this repo's no-review-gate rule for product PRs;
`open-pr-repair-merge` pushes to a branch it did not create and merges someone
else's PR, which a single folded commit cannot express either.

## The mandate

`workers/mandate.md` is prepended to every prompt here. It carries the standing
part — build real product value, finish existing work before starting new work,
verify locally because CI here lies, and the floor of things a run may never do.
A file in this directory only needs to describe its own task.

Agents may open a PR that adds an item. They must not be able to merge
it, and they must not receive a kubeconfig.

After a 429 the governor holds until `cooldownOnLimitSeconds`. Flip
`enabled: false` on the policy ConfigMap (and keep the CronJob
`suspend: true`) to stop spending the personal Codex quota.
