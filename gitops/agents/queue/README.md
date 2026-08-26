# Agent work queue

Each `*.yaml` file here is a job the governor may start. Argo syncs them
into a ConfigMap. The governor does **not** keep eight Codex processes
hot; it creates at most `maxConcurrent` Jobs (1 on the cpx22).

A file is skipped when `enabled: false`, or when it is missing `id` /
`repo` / `prompt`.

Agents may open a PR that adds an item. They must not be able to merge
it, and they must not receive a kubeconfig.

After a 429 the governor holds until `cooldownOnLimitSeconds`. Flip
`enabled: false` on the policy ConfigMap (and keep the CronJob
`suspend: true`) to stop spending the personal Codex quota.
