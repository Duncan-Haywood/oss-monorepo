# Agent work queue

Each `*.yaml` file here is a job the governor may start. Argo syncs them
into a ConfigMap. The governor does **not** keep eight Codex processes
hot; it creates at most `maxConcurrent` Jobs (1 on the cpx22).

`branch-pr-drain.yaml`, `seo-discoverability-audit.yaml`, and
`product-feature-improvement.yaml` are the real, enabled items — the same
priority order they're named in, since `pick_item` always starts the
single highest-`priority` enabled item and does not round-robin. Drain the
PR/branch backlog first, then metadata, then general feature work; raise
or disable an item in git to change that order. Enabling an item here does
not spend anything by itself: the governor stays a no-op until an owner
seals `codex-secrets` and flips `governor/policy.json` `enabled: true` and
`governor/cronjob.yaml` `suspend: false` (decision-queue item
`agent-runner-subscription-login`, #2000). These files are what run the
moment that flip happens.

A file is skipped when `enabled: false`, or when it is missing `id` /
`repo` / `prompt`.

Agents may open a PR that adds an item. They must not be able to merge
it, and they must not receive a kubeconfig.

After a 429 the governor holds until `cooldownOnLimitSeconds`. Flip
`enabled: false` on the policy ConfigMap (and keep the CronJob
`suspend: true`) to stop spending the personal Codex quota.
