# Security queue

Open code-scanning alerts, most severe then oldest first. Generated hourly by
`.github/workflows/priv-security-alert-queue.yml` from `platform/ci/security_alerts.py`;
do not edit by hand. Take the first one whose claim branch
(`security-fix/code-scanning-<n>`) does not exist; its file says how.

Triaged already: alerts in `platform/security/codeql-triage.json` are listed apart, at the end; `docs/reports/*security-queue*.md` on main has earlier runs' notes. A false positive you find goes in the JSON file with its reason (only the owner can dismiss alerts).

Scanned commit: `991a8c4b2cde` (the commit most open alerts were last seen on). Fixes merged after it are still listed until CodeQL finishes on a newer main: `git diff --stat 991a8c4b2cde origin/main -- <path>` before fixing (each alert file says how).

- [high] #1444 `js/incomplete-url-substring-sanitization` in `ventures/payapps/packages/billing/src/paddle-key.test.ts:101`: alerts/1444.md
- [high] #1445 `js/incomplete-url-substring-sanitization` in `ventures/payapps/packages/billing/src/paddle.test.ts:252`: alerts/1445.md
- [high] #1446 `js/incomplete-multi-character-sanitization` in `ventures/payapps/apps/payapps/src/shared/ca-ecpr.ts:446`: alerts/1446.md
- [high] #1447 `js/incomplete-multi-character-sanitization` in `ventures/payapps/apps/payapps-site/src/site/seo.ts:120`: alerts/1447.md
- [high] #1448 `js/incomplete-multi-character-sanitization` in `ventures/payapps/apps/payapps-site/src/site/seo.ts:120`: alerts/1448.md
- [high] #1479 `js/xss-through-dom` in `ventures/seller-books/apps/seller-books/src/client/routes/org.tsx:198`: alerts/1479.md
- [high] #1480 `js/incomplete-url-substring-sanitization` in `ventures/seller-books/apps/seller-books-site/test/site.test.mjs:246`: alerts/1480.md
- [high] #1481 `js/incomplete-url-substring-sanitization` in `ventures/seller-books/apps/seller-books-site/test/site.test.mjs:274`: alerts/1481.md
- [high] #1482 `js/incomplete-url-substring-sanitization` in `ventures/seller-books/apps/seller-books-site/test/site.test.mjs:275`: alerts/1482.md
- [high] #1483 `js/incomplete-url-substring-sanitization` in `ventures/seller-books/apps/seller-books-site/test/site.test.mjs:337`: alerts/1483.md
- [high] #1484 `js/incomplete-url-substring-sanitization` in `ventures/seller-books/apps/seller-books-site/test/site.test.mjs:338`: alerts/1484.md
- [medium] #1478 `js/client-side-unvalidated-url-redirection` in `ventures/seller-books/apps/seller-books/src/client/routes/account.tsx:315`: alerts/1478.md

## Triaged, awaiting dismissal

Read and judged false positives (`platform/security/codeql-triage.json`): not work
for a session. The owner dismisses each on its alert page.

- [high] #7 `py/clear-text-storage-sensitive-data` in `platform/security/risk_review.py:546`: alerts/7.md
- [high] #12 `py/clear-text-logging-sensitive-data` in `platform/ci/secrets_inventory.py:261`: alerts/12.md
- [high] #34 `py/clear-text-logging-sensitive-data` in `ventures/einvoice-preflight/src/einvoice_preflight/cli.py:853`: alerts/34.md
- [high] #38 `py/clear-text-logging-sensitive-data` in `portfolio/monetization/monetization.py:325`: alerts/38.md
- [high] #39 `py/clear-text-logging-sensitive-data` in `portfolio/monetization/monetization.py:333`: alerts/39.md
- [high] #42 `py/clear-text-logging-sensitive-data` in `platform/security/risk_review.py:540`: alerts/42.md
- [high] #43 `py/clear-text-logging-sensitive-data` in `platform/security/risk_review.py:547`: alerts/43.md
- [high] #104 `js/regex-injection` in `platform/ci/copy_drift.mjs:189`: alerts/104.md
- [high] #105 `js/regex-injection` in `platform/ci/copy_drift.mjs:190`: alerts/105.md
- [high] #106 `js/regex-injection` in `ventures/dxf-nesting/dxf.mjs:174`: alerts/106.md
- [high] #741 `js/incomplete-sanitization` in `ventures/shopify-to-woocommerce-converter/converter.mjs:69`: alerts/741.md
- [high] #960 `js/xss-through-dom` in `ventures/quick-pick-survey/site/rank.html:461`: alerts/960.md
- [high] #968 `js/xss-through-dom` in `ventures/shed-designer/hoa-page.mjs:59`: alerts/968.md
- [high] #969 `js/xss-through-dom` in `ventures/silence-cutter/index.html:258`: alerts/969.md
- [high] #1049 `js/incomplete-url-substring-sanitization` in `platform/pages/check.mjs:1499`: alerts/1049.md
- [high] #1050 `js/incomplete-url-substring-sanitization` in `platform/pages/custom-domain.test.mjs:161`: alerts/1050.md
- [high] #1086 `js/disabling-certificate-validation` in `ventures/status-keeper/certs.mjs:12`: alerts/1086.md
- [high] #1181 `js/redos` in `ventures/regex-redos-check/cli.test.mjs:81`: alerts/1181.md
- [high] #1182 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1182.md
- [high] #1183 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1183.md
- [high] #1184 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1184.md
- [high] #1185 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1185.md
- [high] #1186 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1186.md
- [high] #1187 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1187.md
- [high] #1188 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1188.md
- [high] #1189 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1189.md
- [high] #1190 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:16`: alerts/1190.md
- [high] #1191 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:16`: alerts/1191.md
- [high] #1192 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:16`: alerts/1192.md
- [high] #1193 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:16`: alerts/1193.md
- [high] #1194 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:45`: alerts/1194.md
- [high] #1195 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:143`: alerts/1195.md
- [high] #1196 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:143`: alerts/1196.md
- [high] #1197 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:143`: alerts/1197.md
- [high] #1198 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:157`: alerts/1198.md
- [high] #1199 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:157`: alerts/1199.md
- [high] #1200 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:157`: alerts/1200.md
- [high] #1201 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:157`: alerts/1201.md
- [high] #1202 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:167`: alerts/1202.md
- [high] #1203 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:181`: alerts/1203.md
- [high] #1208 `js/redos` in `ventures/devsec-toolkit/tests/fixtures/vulnerable-repo/src/validate.js:1`: alerts/1208.md
- [high] #1434 `py/clear-text-logging-sensitive-data` in `portfolio/smb/cbp_counts.py:150`: alerts/1434.md
