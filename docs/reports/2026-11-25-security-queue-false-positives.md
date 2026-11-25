---
kind: note
date: 2026-11-25
topics: [security-alerts]
---
# Security queue: alerts checked and found false or already fixed (2026-11-25)

For the next run that opens `origin/security-alerts:QUEUE.md`, and for the owner, who is the only one who
can dismiss an alert on the code-scanning page. Each line below was checked against `main` at
`9aaa8d207` by reading the flagged code. None of them needs a code change. Changing code only to quiet
CodeQL would add risk, and for `platform/security/risk_review.py` it would mean editing a gate file.

The queue had 1,186 alerts. About 700 are regex-sanitisation rules (`js/bad-tag-filter`,
`js/incomplete-multi-character-sanitization`, `js/incomplete-sanitization`) that fire in test files
(`proposal.test.mjs` 122, `page.test.mjs` 390 across the three rules). Those tests strip tags to
compare text, so no untrusted HTML ever reaches a browser. A real reduction would be excluding test
files from those three rules in the CodeQL config. That is a control-plane change for its own PR,
judged by the adversarial gate, and is not made here.

## False positives (dismiss as "false positive")

| Alert | Rule | Where | Why it is safe |
| --- | --- | --- | --- |
| #7, #42, #43 | py/clear-text-storage / logging | `platform/security/risk_review.py:451-458` | `result["secrets"]` holds only `{path, kind}` (the pattern's name), built at line 382. The matched text is never stored, printed or written to the step summary. CodeQL is keying on the variable name. |
| #12 | py/clear-text-logging | `platform/ci/secrets_inventory.py:261` | Prints the count of secret names read by workflows and problem descriptions. Secret names, not values. |
| #34 | py/clear-text-logging | `ventures/einvoice-preflight/.../cli.py:853` | Prints the invoice preflight report to stdout, which is the CLI's purpose. No credential flows into it. |
| #38, #39 | py/clear-text-logging | `portfolio/monetization/monetization.py:323,331` | Prints validation errors and the model plan table from `models.yaml`. No keys. |
| #68–#91 and the other `usage.mjs` | js/clear-text-storage | `ventures/*/usage.mjs:52` | localStorage holds whole-number counts per fixed event name. `countsOnly()` drops anything else (comment at line 40 of each file). Only the key's name sounds sensitive. |
| #113, #114 | js/insufficient-password-hash | `ventures/photo-nutrition-agent/self-host/auth.mjs:12-13` | SHA-256 is used only to look up the server's own 256-bit random tokens. The owner password and client secrets use scrypt (`hashClientSecret`, line 30). |
| #949 | js/xss | `ventures/tree-service-bid-calculator/index.html:406` | Every interpolated value goes through `escapeHtml` (all five characters, line 367) or comes from fixed preset lists. |
| #950 | js/xss | `ventures/janitorial-bid-calculator/index.html:794` | Same pattern, with `escapeHtml` from `area-name.mjs:23`. |
| #951 | js/reflected-xss | `ventures/quick-pick-survey/.../ranking/route.ts:151` | `resultsReportHtml` escapes every brand field. The logo must be https or an image data URI, the colour passes `hexColour`, and the route sits behind the admin key and `reportGate`. |
| #952 | js/reflected-xss | `ventures/sales-agent/self-host/agent.mjs:307` | The only reflected value is the admin's own token, passed only after `safeEq` matches it and then `encodeURIComponent`-encoded in links. |
| #995, #996 | js/prototype-polluting-assignment | `ventures/help-keeper/kb.mjs:77` | The key is `normalizeQuery(q)`, letters and digits only (`[\p{L}\p{N}]+`), so `__proto__` becomes `proto`; access also checks `Object.hasOwn`. |

## Already fixed on main (they close on the next completed scan)

- The 27 `js/tainted-format-string` alerts in `ventures/local-site-studio` (`src/lib/db.ts`,
  `src/app/dashboard/leads/actions.ts`, `src/lib/email/resend.ts:228`). Every flagged line now passes
  a constant format string with `%s` and the value as an argument.

## Not checked this run

Everything else in the queue, including the 84 `js/path-injection` alerts. Most are in local CI and eval
scripts that take a path from their own argv (`platform/ci/check_*.mjs`,
`ventures/wall-framing-takeoff/eval-*.mjs`), so they are likely false positives, but nobody has read them yet.

## Second pass, same day (queue scanned before `f67c21c96`)

Checked by reading `main` at `f67c21c96`. No code change was needed.

- **Already fixed on main; they close on the next completed scan:**
  - `js/regex-injection`: #99 (`redis-conf-check/scan.mjs`), #100 and #101 (`regex-redos-check/engine.mjs`, which now uses `escapeRegExp`), and #102 and #103 (`ids-model-check/eval/*`, which now uses a plain `endsWith` suffix test).
  - `js/unvalidated-dynamic-method-call`: #107 (`shed-designer/hoa-page.mjs`, which now checks `Object.hasOwn(PRESETS, key)`).
  - `js/biased-cryptographic-random`: #95 (`quick-pick-survey/src/lib/couples.ts`, which now uses `randomInt`).
  - `js/double-escaping`: #115 to #118. Each decoder now decodes `&amp;` last, and `sales-agent/mime.mjs` strips tags until the text stops changing. The flagged line numbers no longer match the code, so these files changed after the scan.
- **False positives, by design (dismiss as "used in tests" or "won't fix"):**
  - `js/regex-injection` #104 and #105 (`platform/ci/copy_drift.mjs:189-190`). `--name` and `--skip` are regex flags typed by whoever runs the local CI script.
  - `js/regex-injection` #106 (`dxf-nesting/dxf.mjs:174`). "Ignore layers matching" is a regex the user types into their own browser tab or CLI, and no one else's input reaches it.
- **Still unchecked:** the remaining `js/double-escaping` alerts, #119 onward. Most of them are in `*.test.mjs` files, and the same reasoning as the test-file note above applies.

## Third pass: the verdicts are now a file the queue reads

A third session read the top of the queue and re-checked #7, #12, #34, #38, #39, #42, #43 and
#104–#106 from scratch before it found this note. The two passes above were prose. The queue
generator could not read them, so it kept offering the same alerts first. PR #18809 (another
session's work, landed with this pass) added **`platform/security/codeql-triage.json`**.
`platform/ci/security_alerts.py` moves an open alert that matches an entry on number, rule and
path into a "Triaged, awaiting dismissal" section of `QUEUE.md`. The alert stays open and listed,
and only the owner can dismiss it on GitHub. An entry stops applying if the finding moves, and
the PR-level `codeql gate` jobs never read the file. This pass added 14 entries: every alert in the
two passes above that is still in the queue, plus the ones below. A verdict of "intended
behaviour" starts its reason with those words.

New in this pass, checked against `main` at `de2adc485`:

| Alert | Rule | Where | Verdict |
| --- | --- | --- | --- |
| #741 | js/incomplete-sanitization | `shopify-to-woocommerce-converter/converter.mjs:69` | False positive. `esc()` writes `\,` for commas, which is WooCommerce's list-cell format. The importer has no backslash escape, so doubling backslashes would corrupt values. |
| #960 | js/xss-through-dom | `quick-pick-survey/site/rank.html:461` | False positive. The sink is an `<img>.src`, which cannot run script. |
| #968 | js/xss-through-dom | `shed-designer/hoa-page.mjs:59` | False positive. `packetHtml` escapes every string from the `#d=` design, and colours go through `hex()`. A probe with an `<img onerror>` payload in every string field found it only entity-escaped. |
| #969 | js/xss-through-dom | `silence-cutter/index.html:258` | False positive. The href is the page's own `blob:` URL. |
| #1086 | js/disabling-certificate-validation | `status-keeper/certs.mjs:12` | Intended. An expiry monitor has to read untrusted certificates to report them. Strict mode (the default) fails on `socket.authorized === false`, at line 33. |

The verdicts from the first two passes for alerts no longer in the queue (#68–#91, #113, #114,
#949–#952, #995, #996) are not in the file. Add them if they come back.

Still unchecked in the queue: #1049 and #1050 (`js/incomplete-url-substring-sanitization`, in
`platform/pages`), and the `js/redos` alerts in `regex-redos-check/*.test.mjs` and the
`devsec-toolkit` vulnerable-repo fixture. Those two are probably deliberate test inputs, but
nobody has confirmed it yet.
