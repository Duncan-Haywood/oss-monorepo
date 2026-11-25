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

## Third pass, same day (queue scanned at `5f857bb81c00`, checked on main at `20071c007`)

The first unclaimed alerts after the ones above. Each flagged line was read on `main`.

- **Fixed in this pass (they close on the next completed scan):**
  - #849 `js/incomplete-sanitization`, `platform/agents/tools.mjs:170`. `commentFor` escaped only `$` before building
    a regex from an export name. It now escapes every regex metacharacter. Low impact (names are JS identifiers and
    an `includes()` prefilter ran first), but the escape is now complete; test added in `tools.test.mjs`.
  - #65 `js/incomplete-sanitization`, `ventures/pay-app-guides/template.test.mjs:62`. Same rule in a test: the label
    escape now covers every metacharacter, not just `.`.
- **False positives (dismiss):**
  - #960 `js/xss-through-dom`, `quick-pick-survey/site/rank.html:461`. `picture()` returns only `blob:` URLs that
    `addPicture` made with `URL.createObjectURL`, and the value is assigned to `img.src`, not markup.
  - #969 `js/xss-through-dom`, `silence-cutter/index.html:258`. `a.href = URL.createObjectURL(blob)`: always a `blob:` URL.
  - #968 `js/xss-through-dom`, `shed-designer/hoa-page.mjs:59`. `packetHtml` passes every text field through `esc`, and
    colours come from `hex()` of numeric RGB tables, so the `#d=` link cannot inject markup. (The SVG builders it calls
    were not re-audited line by line.)
  - #741 `js/incomplete-sanitization`, `shopify-to-woocommerce-converter/converter.mjs:69`. `\,` is WooCommerce's own
    escape for a comma inside an attribute value (`explode_values` replaces `\,` before splitting); its parser has no
    backslash escape, so also doubling backslashes would corrupt values on import.
  - #1049 `js/incomplete-url-substring-sanitization`, `platform/pages/check.mjs` (now ~line 1470). `text.includes(PLACEHOLDER_ORIGIN)`
    is a build check that the placeholder origin never ships in a page, not a URL allow-list.
  - #1086 `js/disabling-certificate-validation`, `status-keeper/certs.mjs:12`. The probe must read expired or untrusted
    certificates to report on them; it records `socket.authorized` and `checkTls` fails the check when strict (the default).
  - #1181–#1203 `js/redos`, `regex-redos-check/*.test.mjs`, and #1208 in `devsec-toolkit/tests/fixtures/vulnerable-repo/`:
    deliberately vulnerable patterns that a ReDoS checker's tests and fixtures exist to detect.
  - #862 `js/incomplete-sanitization`, `research/marriage-divorce-evidence/report-app/src/use-data-app.js:315`.
    `replace("..", " – ")` turns a range filter like `2010..2020` into display text that React renders escaped; it is
    formatting, not sanitisation.
- **Claimed elsewhere:** #274, #275, #574, #997 have `security-fix/` branches.
- After this pass, every alert in the queue at `5f857bb81c00` has been read; the queue is empty of actionable work
  apart from the claimed branches and the owner's dismissals.
