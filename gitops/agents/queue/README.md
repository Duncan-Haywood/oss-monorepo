# Agent work queue

Each `*.yaml` file here is a job the governor may start. Argo syncs them
into a ConfigMap. The governor does **not** keep eight Codex processes
hot; it creates at most `maxConcurrent` Jobs (1 on the cpx22).

`branch-pr-drain.yaml` (5), `deploy-cicd-readiness.yaml` (4),
`seo-discoverability-audit.yaml` (3), and
`product-feature-improvement.yaml` (2) are the real, enabled items — the
same priority order they're named in, since `pick_item` always starts the
single highest-`priority` enabled item and does not round-robin. Drain the
PR/branch backlog first, then the delivery path, then metadata and
content, then general feature work; raise or disable an item in git to
change that order.

`deploy-cicd-readiness` sits second on purpose. The portfolio has 164
finished tools and no public URL, so the delivery path is worth more per
run than another metadata pass — but its remaining *owner* steps (a sealed
clone token, an ACME contact, `CI_RUNNER`, the governor flip) are not
agent-actionable and are already queued. That item covers only the code
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

All three real items are `agent`, because all three tell the agent to open a PR
and merge it under this repo's no-review-gate rule for product PRs.

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
