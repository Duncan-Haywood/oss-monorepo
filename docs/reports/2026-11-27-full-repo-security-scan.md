---
kind: note
subjects: [security]
---
# Full-repository security scan: first reading, 2026-11-27

For the next session that takes `scan-repo-baseline` (`portfolio/work/tasks.yaml`).

## What changed

The `security-scan` check only ever scanned the files a PR changes, so whatever
the pinned scanners would flag on code already on `main` reached no queue
(`sec-codeowners-scan-gate`, "Left: a scheduled full-repo run"). Now:

- `platform/security/scan.py repo --sarif FILE` writes the blocking findings
  (at or above each tool's `block_at`, not accepted in `baseline.yaml`) as
  SARIF 2.1.0, one run per tool with its own category, so a tool's alerts close
  when a later upload stops reporting them. gitleaks messages are redacted at
  the parser; a test checks that no secret text reaches the SARIF.
- `.github/workflows/priv-security-scan-repo.yml` runs it in a read-only job
  and uploads the SARIF from a second job that holds `security-events: write`
  and runs no repository code. The hourly queue (`priv-security-alert-queue.yml`)
  already mirrors every code-scanning alert to `security-alerts`, whatever the
  tool, so the alerts reach sessions with no queue change.
- `platform/ci/security_alerts.py` words a scanner alert's file for its source:
  "re-check against the next full-repo scan" instead of "CodeQL re-scans", and
  a false positive goes in `baseline.yaml` (the scanner then stops reporting it
  and the alert closes itself) rather than waiting for the owner to dismiss it.

## Why it is manual only

`prompt.md` step 0 sends every session to the top alert before any other
work. The first reading, taken here with gitleaks v8.30.1 and semgrep 1.184.0
over the clone at `c1001841c` (checkov did not install on this container's
Python; trivy, zizmor and osv-scanner were not run), found:

| tool | blocking | files |
|---|---|---|
| gitleaks | 97 (generic-api-key 76, aws-access-token 13, jwt 7, private-key 1) | 54 |
| semgrep (local rules) | 24 (js-child-process-dynamic 17, py-shell-injection 4, js-eval-dynamic 2, js-tls-verify-off 1) | 20 |

Spot checks, by opening the line (most findings were judged by path only):
the AWS keys in `terraform-plan-secret-exposure-check`'s tests are synthetic
(`AKIA` followed by `ABCDEFGHIJKLMNOP`, `...WNEWNEW1`, `...DOLDOLD1`), and
`liability-audit`'s and the sample page's are AWS's documented `EXAMPLE` key;
`platform/pages/build.mjs:246` is the IndexNow key, public by design (it is
served at `/<key>.txt`); `platform/aws/modules/static-site/main.tf:236` is
a curve name for a signing key, not a secret; `research/energy-practical/.../data.py:17`
is a battery data-sheet row. The rest sit in test files, sample pages and
statistical engines (`instrumental-variables`, `meta-analysis`), so most will
be false positives too, but none has been cleared yet: the triage still opens
each one. Uploaded as they are, they would rank critical, above CodeQL's
alerts, and hold the fleet on false positives for a day or more. So the
schedule waits for the baseline.

Reproduce (about 7 minutes in a cloud session):

```
python3 -I platform/security/scan.py install --tools-dir /tmp/t --tools gitleaks,semgrep
python3 -I platform/security/scan.py repo --root . --tools-dir /tmp/t --tools gitleaks,semgrep --out /tmp/s --sarif /tmp/s/scan.sarif
```

Run it in a fresh clone or delete `__pycache__/` first: gitleaks also reads
untracked `.pyc` files (5 extra hits here, not counted above).

## The findings (tool, file, rules, lines)

| tool | file | rules | lines |
|---|---|---|---|
| gitleaks | `docs/reports/assets/ai-default-languages/raw.jsonl` | generic-api-key ×2 | 75,364 |
| gitleaks | `platform/aws/modules/static-site/main.tf` | generic-api-key | 236 |
| gitleaks | `platform/billing/billing.test.mjs` | generic-api-key ×2 | 24,292 |
| gitleaks | `platform/ci/cloudflare_mint/mint.test.mjs` | generic-api-key | 238 |
| gitleaks | `platform/pages/build.mjs` | generic-api-key | 246 |
| gitleaks | `portfolio/quality/audits/2026-11-13-jwt-security-check.json` | jwt ×2 | 43,52 |
| gitleaks | `portfolio/research/free-listing-demand/results-cross-registry-2026-08-19.json` | jwt | 3247 |
| gitleaks | `research/energy-practical/src/energy_practical/data.py` | generic-api-key | 17 |
| gitleaks | `research/marriage-divorce-evidence/report-app/protected-runtime.json` | generic-api-key | 53 |
| gitleaks | `research/marriage-divorce-evidence/reproducibility/nlsy97_cohabitation_to_marriage/train_models.py` | generic-api-key | 277 |
| gitleaks | `ventures/3pl-quote-normalizer/compare.html` | generic-api-key | 50 |
| gitleaks | `ventures/3pl-quote-normalizer/inbound.html` | generic-api-key | 147 |
| gitleaks | `ventures/ai-bookkeeper/rapidocr-web.mjs` | generic-api-key | 46 |
| gitleaks | `ventures/babysitting-business-kit/intake.test.mjs` | generic-api-key | 10 |
| gitleaks | `ventures/babysitting-business-kit/invoices.test.mjs` | generic-api-key | 11 |
| gitleaks | `ventures/capture-recapture/engine.mjs` | generic-api-key ×3 | 15,33,39 |
| gitleaks | `ventures/cert-chain-check/scan.test.mjs` | private-key | 15 |
| gitleaks | `ventures/changepoint-detector/matomo-metrics.test.mjs` | generic-api-key | 22 |
| gitleaks | `ventures/changepoint-detector/mixpanel-metrics.test.mjs` | generic-api-key | 23 |
| gitleaks | `ventures/changepoint-detector/plausible-metrics.test.mjs` | generic-api-key | 23 |
| gitleaks | `ventures/changepoint-detector/umami-metrics.test.mjs` | generic-api-key | 24 |
| gitleaks | `ventures/churn-radar/server.test.mjs` | generic-api-key | 9 |
| gitleaks | `ventures/deal-keeper/ai.test.mjs` | generic-api-key ×2 | 52,54 |
| gitleaks | `ventures/deal-keeper/connectors.test.mjs` | generic-api-key ×2 | 8,62 |
| gitleaks | `ventures/deal-keeper/import.test.mjs` | generic-api-key ×3 | 24,27,29 |
| gitleaks | `ventures/deal-keeper/server.test.mjs` | generic-api-key | 9 |
| gitleaks | `ventures/dotenv-exposure-check/index.html` | generic-api-key | 170 |
| gitleaks | `ventures/dotenv-exposure-check/probe.test.mjs` | generic-api-key | 26 |
| gitleaks | `ventures/email-auth-check/analyze.test.mjs` | generic-api-key | 13 |
| gitleaks | `ventures/email-auth-check/lookup.test.mjs` | generic-api-key | 87 |
| gitleaks | `ventures/gage-rr/engine.mjs` | generic-api-key ×2 | 12,30 |
| gitleaks | `ventures/heckman-selection/engine.mjs` | generic-api-key ×3 | 40,51,62 |
| gitleaks | `ventures/ig-media-pipeline/tests/test_outputs.py` | generic-api-key | 42 |
| gitleaks | `ventures/instrumental-variables/engine.mjs` | generic-api-key ×7 | 26,48,59,70,92,103,114 |
| gitleaks | `ventures/jwt-security-check/calc.test.mjs` | jwt | 338 |
| gitleaks | `ventures/jwt-security-check/index.html` | jwt | 117 |
| gitleaks | `ventures/liability-audit/audit.test.mjs` | aws-access-token | 31 |
| gitleaks | `ventures/local-site-studio/src/app/api/commerce/checkout/route.test.ts` | generic-api-key ×2 | 487,494 |
| gitleaks | `ventures/local-site-studio/src/app/api/stripe/checkout/route.test.ts` | generic-api-key ×3 | 742,1005,1013 |
| gitleaks | `ventures/local-site-studio/src/lib/checkout/organic-attribution.test.ts` | generic-api-key ×2 | 78,79 |
| gitleaks | `ventures/local-site-studio/src/lib/email/resend-env-readiness.test.ts` | generic-api-key | 67 |
| gitleaks | `ventures/local-site-studio/src/lib/payments/checkout-price-line-items.test.ts` | generic-api-key | 63 |
| gitleaks | `ventures/meta-analysis/engine.mjs` | generic-api-key ×6 | 11,12,13,15,18,19 |
| gitleaks | `ventures/meter-keeper/sdk.test.mjs` | generic-api-key | 8 |
| gitleaks | `ventures/meter-keeper/server.test.mjs` | generic-api-key | 7 |
| gitleaks | `ventures/pql-radar/server.test.mjs` | generic-api-key | 9 |
| gitleaks | `ventures/sales-agent/authcheck.test.mjs` | generic-api-key | 45 |
| gitleaks | `ventures/scale-reliability/engine.mjs` | generic-api-key ×3 | 7,8,14 |
| gitleaks | `ventures/species-diversity/engine.mjs` | generic-api-key ×3 | 22,46,58 |
| gitleaks | `ventures/spray-foam-bid-calculator/index.html` | generic-api-key | 407 |
| gitleaks | `ventures/status-keeper/server.test.mjs` | generic-api-key ×2 | 10,72 |
| gitleaks | `ventures/terraform-plan-secret-exposure-check/cli.test.mjs` | aws-access-token ×2 | 21,57 |
| gitleaks | `ventures/terraform-plan-secret-exposure-check/engine.test.mjs` | jwt ×2, aws-access-token ×9 | 100,246,13,24,32,39,50,79,123,164,254 |
| gitleaks | `ventures/terraform-plan-secret-exposure-check/index.html` | aws-access-token | 184 |
| semgrep | `platform/ci/check_blank_inputs.js` | js-child-process-dynamic | 8 |
| semgrep | `platform/ci/check_button_clicks.js` | js-child-process-dynamic | 12 |
| semgrep | `platform/ci/check_enter_reload.mjs` | js-child-process-dynamic, js-eval-dynamic ×2 | 75,98,99 |
| semgrep | `platform/ci/check_html_injection.js` | js-child-process-dynamic | 38 |
| semgrep | `platform/ci/check_input_edges.js` | js-child-process-dynamic | 10 |
| semgrep | `platform/ci/check_page_runtime.js` | js-child-process-dynamic | 7 |
| semgrep | `platform/ci/check_select_keys.js` | js-child-process-dynamic | 9 |
| semgrep | `platform/ci/check_textarea_edges.js` | js-child-process-dynamic | 30 |
| semgrep | `platform/ci/check_thousands_input.mjs` | js-child-process-dynamic | 47 |
| semgrep | `platform/ci/run_workflow_locally.py` | py-shell-injection | 1679 |
| semgrep | `platform/ci/runner_probe.py` | py-shell-injection | 48 |
| semgrep | `research/_audit/repro_audit.py` | py-shell-injection | 147 |
| semgrep | `research/verified-dse/experiments/rc_corner/run.py` | py-shell-injection | 125 |
| semgrep | `ventures/babysitting-business-kit/activities.mjs` | js-child-process-dynamic | 247 |
| semgrep | `ventures/einvoice-preflight/plain/fontoxpath.esm.js` | js-child-process-dynamic | 1 |
| semgrep | `ventures/k8s-deprecated-api-check/engine.mjs` | js-child-process-dynamic | 252 |
| semgrep | `ventures/local-site-studio/src/lib/db/sqlite-schema.ts` | js-child-process-dynamic | 191 |
| semgrep | `ventures/photo-nutrition-agent/self-host/store.mjs` | js-child-process-dynamic ×2 | 487,525 |
| semgrep | `ventures/retail-pilot-intel/packages/analytics/src/db.ts` | js-child-process-dynamic | 44 |
| semgrep | `ventures/status-keeper/certs.mjs` | js-tls-verify-off | 12 |
| semgrep | `ventures/xer-schedule-check/eval/p6xer-resource-ids.mjs` | js-child-process-dynamic | 8 |

## Progress, 2026-11-28: semgrep

Re-read with semgrep 1.184.0 over `main` at `407cb271c` plus PR #19952. That PR fixes
11 of the 24 by running the command with an argument list (`execFileSync` /
`subprocess.run`), same output: the seven `platform/ci/check_*.js` page checkers,
`check_enter_reload.mjs:75`, `check_thousands_input.mjs`,
`ventures/xer-schedule-check/eval/p6xer-resource-ids.mjs` and
`research/verified-dse/experiments/rc_corner/run.py`. The scan then reports 13,
each opened and judged a false positive or by design; they go in `baseline.yaml`
in a PR of their own (the gate reads main's copy), with these reasons:

| file:line | rule | why it stays |
|---|---|---|
| `platform/ci/check_enter_reload.mjs:98,99` | js-eval-dynamic | `new Function` rebuilds this file's own two helpers (`selfAction.toString()`, `fillValue.toString()`) inside `page.evaluate`; no outside input |
| `platform/ci/run_workflow_locally.py:1679` | py-shell-injection | runs a workflow step's `run:` script, which is shell by definition (the job the tool emulates) |
| `platform/ci/runner_probe.py:48` | py-shell-injection | `_sh()` is only called with three literal strings (`lscpu`, the GPU pipe, `node --version`) |
| `research/_audit/repro_audit.py:147` | py-shell-injection | runs the commands in the repository's own research READMEs, as the audit's job; paused track |
| `ventures/babysitting-business-kit/activities.mjs:247`, `ventures/k8s-deprecated-api-check/engine.mjs:252` | js-child-process-dynamic | `RegExp.prototype.exec` on a template string, not `child_process` |
| `ventures/einvoice-preflight/plain/fontoxpath.esm.js:1` | js-child-process-dynamic | vendored minified fontoxpath bundle; no `child_process` in a browser bundle |
| `ventures/local-site-studio/src/lib/db/sqlite-schema.ts:191`, `ventures/photo-nutrition-agent/self-host/store.mjs:487,525`, `ventures/retail-pilot-intel/packages/analytics/src/db.ts:44` | js-child-process-dynamic | SQLite `db.exec` (SQL, not a shell); the interpolated table and column names are literals at every call site |
| `ventures/status-keeper/certs.mjs:12` | js-tls-verify-off | a certificate monitor must complete the handshake with a bad certificate to report it; it reads `socket.authorized` and fails the check unless the monitor says `strict: false`, and sends nothing over the socket |

The gitleaks 97 were triaged on 2026-11-28: every line opened, none a live
credential, each accepted in `baseline.yaml` with its line fingerprint and the
reason (what the string is: a placeholder, a synthetic AWS id, a published
example token, a DKIM public key, a citation key, a hash). Editing one of those
lines changes its fingerprint, so the next full-repo reading flags it again to
be re-checked. Left for this task: one
`workflow_dispatch` run for checkov, trivy, zizmor and osv, then the schedule.
