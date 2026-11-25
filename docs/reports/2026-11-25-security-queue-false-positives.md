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

## Third pass, same day (queue scanned at `5f857bb81c00`, read on `main` at `578f7f19a`)

Every flagged file below was unchanged between the scanned commit and `main`, so the line numbers hold.

- **Fixed in this pass (they close on the next completed scan):**
  - `js/incomplete-sanitization` #849 (`platform/agents/tools.mjs:170`). `commentFor` built a regex from an
    export's name escaping only `$`. Names reach it from the tool index, which are JS identifiers, so no
    other metacharacter could occur in practice, but the escape now covers every regex metacharacter and a
    test pins that `a.b` and `a(b` match literally.
  - `js/incomplete-sanitization` #65 (`ventures/pay-app-guides/template.test.mjs:62`). The test escaped only
    `.` in fixed row labels; it now escapes every metacharacter. Same assertions, same result (the
    LibreOffice recalculation test ran and passed).
- **False positives, by design (dismiss as "won't fix" or "used in tests"):**
  - `js/incomplete-sanitization` #741 (`shopify-to-woocommerce-converter/converter.mjs:69`). `\,` is
    WooCommerce's own escape for a comma inside an attribute value list; its importer replaces `\,` before
    splitting and has no backslash escape, so escaping `\` too would put stray backslashes into the store.
    The only mis-split is an option value that itself ends in a backslash, which Shopify variants do not use.
  - `js/xss-through-dom` #960 (`quick-pick-survey/site/rank.html:461`). The image `src` comes from
    `picture()`, which returns only `blob:` URLs the viewer's own file picker made (line 271).
  - `js/xss-through-dom` #968 (`shed-designer/hoa-page.mjs:59`). `packetHtml` passes the perspective image
    through `esc` (`hoa.mjs:529`); the value is a canvas snapshot or a manifest path.
  - `js/xss-through-dom` #969 (`silence-cutter/index.html:258`). `a.href` is `URL.createObjectURL` of a
    Blob the page built; it is a download link.
  - `js/incomplete-url-substring-sanitization` #1049 and #1050 (`platform/pages/check.mjs:1466`,
    `custom-domain.test.mjs:151`). `includes('https://example.invalid')` looks for a leftover build
    placeholder in our own output, not for a trusted host.
  - `js/disabling-certificate-validation` #1086 (`status-keeper/certs.mjs:12`). The probe must read the
    certificate of a server whose certificate is expired or broken, which is what it reports; it sends
    nothing over the connection and records `socket.authorized` and the authorisation error.
  - `js/redos` #1181 to #1203 (`regex-redos-check/*.test.mjs`) and #1208
    (`devsec-toolkit/tests/fixtures/vulnerable-repo/src/validate.js`). These are the deliberately
    vulnerable regexes the ReDoS checker and the devsec scanner are tested against; they never run on
    untrusted input.
  - `js/incomplete-sanitization` #862 (`research/marriage-divorce-evidence/.../use-data-app.js:315`).
    Replaces the one `..` in a range filter value (`"1990..2000"`) for display. Paused research.
- **Claimed by another session (not touched):** #274, #275, #574, #997 have `security-fix/` branches.

With this pass every alert in the 48-alert queue has been read. What remains needs the owner to press
"dismiss" on the code-scanning page, or a CodeQL config that excludes test fixtures from these rules
(control-plane change, its own PR).
