---
kind: note
topics: [security-alerts, ci]
date: 2026-11-24
---
# The CodeQL backlog on main, cleared in one day

Date: 2026-11-24. Owner request: "put 40 agents on patching the vulnerabilities ... there is no
reason why they should be open more than one day". PR: Duncan-Haywood/oss-monorepo PR 18676.

## Numbers

| Scan (CodeQL 2.27.6, default code-scanning suites, JS/TS + Python, PR 18529's config) | Findings |
|---|---|
| `main` at aa5b14493 | 1,231 (1,173 JS/TS, 58 Python) in 741 files |
| after round 1 (40 agents) and round 2 | 111 |
| after round 3 (6 agents, each confirmed with CodeQL on a small DB) | 40 |

The remainder is listed in "Left open, with reasons" below. Each one needs the owner to dismiss
it as a false positive in the Security tab once CodeQL runs on main (PR 18529).

## How the work was split

- One full local scan, then findings grouped by file into 40 buckets, no file in two buckets,
  contiguous by path. A bucket's agent owned only its files.
- Synced copies were given to one owner and fixed at the source:
  `platform/proposal/proposal.test.mjs` (121 vendored copies, `adopt.mjs --sync`) and the 25
  `usage.mjs` copies.
- A shared brief with fix recipes per rule kept the 40 agents' fixes consistent
  (`stripScripts`/`stripTags` loops, full regex escaping, `&amp;` decoded last, resolved-path guards).
- 20 agents at a time (the session's subagent limit); a new bucket started as each one finished.
- After round 1, a full re-scan showed which fixes CodeQL did not recognise; round 3 fixed those
  with CodeQL run on a small database of just the changed files, before and after.

## Shapes CodeQL 2.27.6 recognises (use these in new code)

- **Path guards:** `const p = path.resolve(ROOT, "." + path.sep + rel); if (!p.startsWith(ROOT + path.sep)) -> 403`,
  inline in the handler, with the root case mapped to `index.html` *before* the guard, and checked
  again after any later reassignment of `p`. Or a `path.relative` check
  (`r === ".." || r.startsWith(".." + path.sep) || path.isAbsolute(r)`).
  Not recognised: `p !== ROOT && !p.startsWith(...)` (either order), or a guard inside a helper.
- **Tag stripping:** an inline `do { prev = s; s = s.replace(RE, "") } while (s !== prev)` around a
  single replace. Not recognised: a generic `untilStable(fn)` helper, or several chained replaces in one loop.
- **Regex from data:** escape every metacharacter (`/[.*+?^${}()|[\]\\]/g`), or better, don't build
  a RegExp: use `includes()`, or match a fixed pattern and compare the captured group.
- **DOM sinks:** escape `& < > " '` at the `innerHTML` interpolation, or use `textContent`.

## Not done here, on purpose

- No suppression comments, config excludes or skipped tests.
- A round-3 fix that rebuilt an IBAN country code letter by letter only to break CodeQL's taint
  tracking was reverted: that is a suppression by another name. The finding is reported as a
  false positive instead.
- `platform/agents/tools.mjs` (1 finding, full regex escaping) is a CODEOWNERS path. Its fix waits
  for a separate PR the owner approves, so it does not hold this one up.

## Real vulnerabilities fixed (not just scanner noise)

- Stored XSS: the shared proposal template's currency label (121 ventures), saved state in
  clothing-design-studio, URL-hash restore in tree-service-bid-calculator, about a dozen
  import/report pages building `innerHTML` from user-entered values.
- Reflected XSS: quick-pick-survey report colour parameter, sales-agent self-host admin token.
- Path traversal in about 40 local test, eval and preview servers.
- Prototype pollution: help-keeper search counters (a search for "constructor"), fit.js mergeFolds.
- oidc-trust-policy-check: a look-alike host passed as GitHub's OIDC issuer.
- Weak hashing: retail-pilot-intel passcode gate (now PBKDF2-SHA256, 600k iterations, both sides),
  photo-nutrition-agent client secrets (now scrypt, SHA-256 hashes upgraded on login, tested).
- ReDoS: redis-conf-check glob matching (a crafted glob took over 120 s), jwt-verification-misuse-check.

## Left open, with reasons

| Findings | Where | Why it stays |
|---|---|---|
| 23 `js/redos` | `ventures/regex-redos-check/engine.test.mjs`, `cli.test.mjs` | Deliberately catastrophic patterns: the tests prove the ReDoS detector flags them. They only run inside a `vm` with a hard timeout. |
| 1 `js/redos` | `ventures/devsec-toolkit/tests/fixtures/vulnerable-repo/` | An intentionally vulnerable fixture the toolkit's checks must fire on. |
| 3 `js/regex-injection` | `platform/ci/copy_drift.mjs` (2), `ventures/dxf-nesting/dxf.mjs` | Documented CLI options that take a regex (`--name`, `--skip`, `--skip-layers`); the only source is the operator's own argv. |
| 1 `js/disabling-certificate-validation` | `ventures/status-keeper/certs.mjs` | The probe must read expired or untrusted certificates to report them; it records `socket.authorized` and strict mode still fails them. |
| 1 `js/incomplete-sanitization` | `ventures/shopify-to-woocommerce-converter/converter.mjs` | WooCommerce's CSV importer has no backslash escape; escaping `\` would corrupt imported values. |
| 2 `js/incomplete-url-substring-sanitization` | `platform/pages/check.mjs`, `custom-domain.test.mjs` | A content scan for a leftover placeholder origin anywhere in built pages, not URL validation. |
| 3 `js/xss-through-dom` | `quick-pick-survey/site/rank.html`, `shed-designer/hoa-page.mjs`, `silence-cutter/index.html` | A `blob:` image src, an SVG built only from clamped numbers, and a download link's `blob:` href. |
| 4 `py/clear-text-logging` | `einvoice-preflight/.../cli.py`, `platform/ci/secrets_inventory.py`, `portfolio/monetization/monetization.py` (2) | Name heuristics: the CLI prints only an IBAN's two-letter country code (tests assert the number never appears); the inventory logs secret *names* and refuses values; "billing" is a billing *model*. A rewrite whose only purpose is to break taint tracking was tried and reverted. |
| 1 `js/incomplete-sanitization` | `research/marriage-divorce-evidence/report-app/src/use-data-app.js` | Display formatting of a date range, in a protected runtime file whose hash is pinned by `protected-runtime.json`. |
| 1 `js/incomplete-sanitization` | `platform/agents/tools.mjs` | Fixed (full regex escaping), but a CODEOWNERS path: it lands in its own owner-approved PR. |

Five findings that arrived with same-day merges from `main` (`cloudflare_mint/mint.mjs`, `einvoice-preflight/rules/rules.test.mjs`, `machine-shop-guides/page.test.mjs`) were fixed in this PR as well.

## Policy

The owner's rule, 2026-11-24: no CodeQL finding stays open more than one day, at any severity.
New findings are fixed in the PR that introduces them; the gate only holds the merge while the fix
lands. The 2/14/45/90-day table in PR 18529's draft
`docs/security/policies/vulnerability-management.md` is superseded by this and should be replaced
when that PR merges. The fastest path to keep main clean is merging PR 18529, which turns on
CodeQL for every PR and main and fills the `security-alerts` queue.

## Follow-up, 2026-11-25: the queue lags this PR

The first analysis of `main` to complete (run 11, commit e98ec5cbb) started before this PR merged,
so at 01:58 UTC the `security-alerts` queue listed 1,244 open alerts, nearly all already fixed
here (checked by hand: tree-service-bid-calculator, quick-pick-survey report, photo-nutrition-agent
hashing). A push-to-main analysis takes about an hour and newer pushes queue behind it, so the
queue always trails merges. `platform/ci/security_alerts.py` now writes the scanned commit at the
top of QUEUE.md and in each alert file, with the `git log <sha>..origin/main -- <path>` check, so a
session can see that an entry is stale instead of redoing a fix.
