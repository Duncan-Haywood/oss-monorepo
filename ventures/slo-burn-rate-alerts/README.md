# SLO Burn-Rate Alerts

From an SLO to Prometheus alert rules that can actually fire — error budget,
multi-window multi-burn-rate thresholds (Google SRE Workbook method), detection
time per alert, and lint, before the pager teaches you the hard way.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/slo-burn-rate-alerts/

```
node cli.mjs plan --slo 99.9 --rps 40
node cli.mjs plan --slo 99.95 --period 28 --json
node cli.mjs rules --slo 99.9 --name api \
  --errors 'http_requests_total{job="api",code=~"5.."}' \
  --total  'http_requests_total{job="api"}' > slo-api.rules.yml
```

| finding | level | meaning |
| --- | --- | --- |
| `unreachable-threshold` | error | burn rate x allowed error ratio >= 100%: the alert can never fire (e.g. 14.4x on a 90% SLO) |
| `low-traffic` | warn | at your `--rps` the short window expects under one failing request at the threshold |
| `extreme-target` | warn | the allowed downtime is smaller than SLI measurement error |

`plan` exits 1 on an error (or any warning with `--fail-on warn`); 2 on bad input.
`rules` emits seven recording rules and four alerts (2 page, 2 ticket).

## What it is not

Arithmetic on the numbers you type. It does not contact Prometheus, cannot see
your traffic shape or SLI quality, and generated rules must be reviewed and run
through `promtool check rules` before use. Not reliability advice.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) computes locally and never uploads what you type.

## Licence

MIT.
