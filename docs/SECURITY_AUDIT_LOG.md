# Monorepo Security Audit & Findings Log

## Executive Summary

This log records all identified application, infrastructure, container, and CI security vulnerabilities across the monorepo. Every issue is assigned a unique identifier (`SEC-xxx`), assessed for severity and impact, and tracked until resolution or added to the active roadmap.

---

## Audit Findings Matrix

| ID | Severity | Scope | Component / Path | Description | Status |
| --- | --- | --- | --- | --- | --- |
| **SEC-001** | High | Application | `src/app/api/auth/reset-password/route.ts` | Password-reset token race condition allowed concurrent reuse | **Fixed** |
| **SEC-002** | Medium | Application | `src/app/api/auth/signup/route.ts` | Unbounded account creation enabled automated rate-limit bypass | **Fixed** |
| **SEC-003** | Medium | Application | `next.config.ts` | Missing browser security headers (CSP, HSTS, X-Frame-Options, etc.) | **Fixed** |
| **SEC-004** | Low | Application | `src/lib/auth.ts`, `src/lib/adminAuth.ts` | Session cookies lacked `__Host-` prefix protection | **Fixed** |
| **SEC-005** | High | Application | `src/app/api/trials/*` | Account-owned rankings writable by arbitrary participant ID | **Fixed** |
| **SEC-006** | Medium | Application | `src/proxy.ts`, `src/lib/http.ts` | Unbounded declared request bodies allowed memory consumption | **Fixed** |
| **SEC-007** | Medium | Application | `src/proxy.ts` | Sensitive API responses not explicitly non-cacheable | **Fixed** |
| **SEC-008** | Medium | Application | `src/lib/http.ts` | Raw IP addresses retained in rate-limiter tables | **Fixed** |
| **SEC-009** | Medium | Application | `src/lib/auth.ts` | Unlimited long-lived user session accumulation | **Fixed** |
| **SEC-010** | Low | Application | `src/lib/adminAuth.ts` | Excessively long admin session lifetime (12h -> 4h) | **Fixed** |
| **SEC-011** | High | CI / Automation | `.gitea/workflows/` | Absence of automated security scanning pipeline in CI | **Fixed** |
| **SEC-012** | High | Infrastructure | `platform/terraform/pairwise_db.tf` | Hardcoded database password in deployment environment variables | **Fixed** |
| **SEC-013** | Medium | Infrastructure | `platform/terraform/firewall.tf` | K3s API port 6443 publicly accessible without IP restriction | **Mitigated / Scheduled** |
| **SEC-014** | Medium | Container | `portfolio/marisstella-homepage/Dockerfile` | Root execution in static container image | **Fixed** |
| **SEC-015** | Medium | CI / Security | `.gitea/workflows/*.yml` | Workflows running without top-level restrictive permissions | **Fixed** |
| **SEC-016** | Low | Supply Chain | `ventures/*/package.json` | Dependency vulnerability auditing not enforced on PRs | **Fixed** |
| **SEC-017** | **Critical** | Supply Chain | `ventures/photo-editing/docs-site` | Abandoned `htmltojsx` pulled in `request` (SSRF) and `form-data` (CRLF injection) | **Fixed** |
| **SEC-018** | High | Application | `ventures/print-atelier/src/app/api/credentials/vercel-pull` | Unauthenticated disclosure of configured partner credential state | **Fixed** |
| **SEC-019** | **Critical** | Application | `ventures/print-atelier/src/app/api/*` | Six operator API handlers served anonymous callers; one writes live ad catalogs | **Fixed** |
| **SEC-020** | Low | Application | `ventures/photo-editing/docs-site/src/lib/auth.ts` | Public-path prefix exempted the paths beside it, not only its children | **Fixed** |
| **SEC-021** | Low | Container | `portfolio/marisstella-homepage/.dockerignore` | Container build context published `nginx.conf` and `package.json` into the image web root | **Fixed (not the live exposure — see SEC-022)** |
| **SEC-022** | Low | Infrastructure | `platform/ci/deploy-homepage.sh` | The production ConfigMap published `Dockerfile` to the public web root; `/Dockerfile` served 200 | **Fixed, awaiting deploy** |
| **SEC-023** | High | Supply chain | `.gitea/workflows/security.yml` | The dependency-audit matrix covered 4 of 10 committed lockfiles; the 6 unaudited ones held 32 high-severity advisories | **Coverage fixed; 46 of 47 advisories open** |

---

## Detailed Findings & Remediation

### SEC-001 — High — Password-Reset Token Race
- **Location**: `src/app/api/auth/reset-password/route.ts`
- **Impact**: Two concurrent requests could both accept one single-use token and set different passwords.
- **Fix**: Atomically claim the unused, unexpired token with a conditional `updateMany`; only the successful claimant changes the password.

### SEC-002 — Medium — Unbounded Account Creation
- **Location**: `src/app/api/auth/signup/route.ts`
- **Impact**: Automated callers could create unbounded account and session rows.
- **Fix**: Limit successful account creation to eight per IP per 15-minute window via database rate limiter.

### SEC-003 — Medium — Missing Browser Hardening Baseline
- **Location**: `next.config.ts`
- **Impact**: Browser lacked application-defined clickjacking, MIME-sniffing, referrer, or permissions restrictions.
- **Fix**: Implemented CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Strict-Transport-Security`.

### SEC-004 — Low — Session Cookies Lacked Host-Prefix Protection
- **Location**: `src/lib/auth.ts`, `src/lib/adminAuth.ts`
- **Impact**: Sibling subdomains could shadow broadly scoped cookies.
- **Fix**: Adopted `__Host-` prefix for production session cookies with `Secure`, `SameSite=Lax`, and `Path=/`.

### SEC-005 — High — Account-Owned Rankings Writable by Participant ID
- **Location**: `src/app/api/trials/*`, `src/app/api/financial-trials/*`
- **Impact**: Unauthenticated caller possessing an opaque participant ID could mutate rankings.
- **Fix**: Enforce caller account ownership checks on all trial mutation endpoints.

### SEC-006 — Medium — Unbounded Declared Request Bodies
- **Location**: `src/proxy.ts`, `src/lib/http.ts`
- **Impact**: Oversized payload buffer attacks could cause high memory overhead.
- **Fix**: Enforce strict 64 KiB payload size limit in proxy middleware prior to JSON parsing.

### SEC-007 — Medium — Sensitive API Responses Not Non-Cacheable
- **Location**: `src/proxy.ts`
- **Impact**: Sensitive user insights or account state could be cached by intermediary proxies.
- **Fix**: Inject `Cache-Control: private, no-store, max-age=0` on all API responses.

### SEC-008 — Medium — Raw IP Addresses Retained in Limiter Tables
- **Location**: `src/lib/http.ts`
- **Impact**: Database exports exposed raw network IP addresses.
- **Fix**: Store HMAC-SHA256 hashed IP identifiers using `RATE_LIMIT_SECRET` and auto-prune stale rows.

### SEC-009 — Medium — Unlimited Long-Lived User Sessions
- **Location**: `src/lib/auth.ts`
- **Impact**: Repeated logins accumulated active session tokens indefinitely.
- **Fix**: Cap max active sessions per account to 10 and reduce max lifetime to 30 days.

### SEC-010 — Low — Excessive Admin Session Lifetime
- **Location**: `src/lib/adminAuth.ts`
- **Fix**: Reduced signed admin token validity from 12 hours to 4 hours.

### SEC-011 — High — Missing CI Security Scanning Pipeline
- **Location**: `.gitea/workflows/security-scan.yml`
- **Impact**: Vulnerabilities, exposed secrets, or IaC misconfigurations could be introduced undetected.
- **Fix**: Configured automated daily and PR security scans covering secrets (Trivy), dependencies (`npm audit`), container images, and IaC manifests.

### SEC-012 — High — Plaintext DB Passwords in Deployment Manifests
- **Location**: `platform/terraform/pairwise_db.tf`
- **Impact**: Raw database credentials exposed in plain text inside deployment specs.
- **Fix**: Migrated database credentials into a dedicated Kubernetes `Secret` resource (`pairwise_db_secret`) referenced via `secretKeyRef`.

### SEC-013 — Medium — Unrestricted Public Access to K3s API Server
- **Location**: `platform/terraform/firewall.tf`
- **Impact**: Port 6443 accessible from `0.0.0.0/0`.
- **Status**: Mitigated via mandatory TLS client certificate authentication; scheduled for IP whitelisting / VPN restriction on the roadmap.

### SEC-014 — Medium — Container Root User Execution
- **Location**: `portfolio/marisstella-homepage/Dockerfile`
- **Impact**: Nginx container running as root user (UID 0).
- **Fix**: Migrated to `nginxinc/nginx-unprivileged:alpine` running explicitly as UID 101.

### SEC-015 — Medium — Unconstrained CI Workflow Permissions
- **Location**: `.gitea/workflows/*.yml`
- **Impact**: Default Gitea Actions token permissions could allow write access if compromised.
- **Fix**: Enforced top-level `permissions: contents: read` across all workflow definitions.

### SEC-016 — Low — Dependency Vulnerability Audit Gate
- **Location**: `ventures/*/package.json`
- **Fix**: Added automated `npm audit` execution to the CI security scan workflow.

### SEC-017 — Critical — Abandoned Build Dependency Carrying Two Critical Advisories
- **Location**: `ventures/photo-editing/docs-site/scripts/build-docs.mjs`
- **Impact**: The documentation build converted repository HTML and Markdown to
  TSX using `htmltojsx@0.3.0` (last published 2016). Through
  `jsdom-no-contextify` it carried both of the repository's outstanding CRITICAL
  findings — `request` (server-side request forgery; deprecated upstream with no
  fixed version) and `form-data` (CRLF injection via unescaped multipart field
  names) — plus React 15 and yargs 4 inside a React 19 project. Exposure was
  build-time rather than served to users, but the packages were unfixable in
  place: the scanner's suggested "upgrade to htmltojsx@0.2.2" is a downgrade.
- **Fix**: Replaced the dependency with `scripts/html-to-jsx.mjs`, a
  behaviour-preserving port of htmltojsx's traversal onto `parse5` (maintained,
  spec-compliant). React 15's attribute mapping is frozen into the module as a
  literal table so no React internals are needed at build time. Removal drops
  139 transitive packages; parse5 adds two.
- **Evidence**: All 11 generated doc pages plus the manifest regenerate
  byte-for-byte identical from an empty `src/generated`; 42 differential
  fixtures covering behaviour the doc corpus does not exercise (pre whitespace,
  curly braces, comments, textarea/style hoisting, script stripping, multi-root
  wrapping, SVG camelCasing, entity and nbsp escaping) convert identically under
  both implementations; `next build` prerenders all 11 pages and `tsc --noEmit`
  is clean. `npm audit` for the package reports 0 critical, down from 2.
- **Regression protection**: 26 converter contract tests and a drift test
  asserting the committed `src/generated` still matches a fresh build. The
  package was previously invisible to CI — `photo-editing` is registered as a
  Python component, so its nested Node package was never verified — and is now a
  registered catalog entry. The catalog contract test additionally fails when
  any git-tracked package under `ventures/` defines a `test` script that no
  entry runs.

### SEC-018 — High — Unauthenticated Credential-State Disclosure in print-atelier
- **Location**: `ventures/print-atelier/src/app/api/credentials/vercel-pull/route.ts`
- **Impact**: Both methods were reachable without any authorization and read the
  live process environment. `POST` returned `vaultSummary` verbatim, and every
  configured key in it carried `maskedValue` from `maskSecretValue`, which
  preserves a recognizable prefix and the last four characters. Against a
  configured host an anonymous caller therefore learned the `sk_live_` vs
  `sk_test_` mode and four real characters of `STRIPE_SECRET_KEY`, the same for
  `META_ACCESS_TOKEN`, `PINTEREST_ACCESS_TOKEN`, `PRINTFUL_API_KEY` and
  `GELATO_API_KEY`, and a complete inventory of which partner integrations are
  live. `POST` also accepted arbitrary `envOverrides` merged over the real
  environment, and swallowed malformed JSON into `{}` so a garbage payload
  reported success.
- **Exposure**: Not live. `print-atelier` is `stage: prototype` with
  `links.production: null`, so this was found and fixed before any deploy. No
  UI called the route, so gating it broke nothing.
- **Fix**: Added `src/lib/api-auth.ts`, a fail-closed operator guard —
  `Authorization: Bearer <PRINT_ATELIER_OPS_TOKEN>`, compared as SHA-256 digests
  so neither value nor length leaks through timing. An unset token refuses every
  request (503) rather than defaulting to open; this deliberately diverges from
  `local-site-studio`'s `requireOperatorAuth`, which treats an unset password as
  demo mode. Added `withoutMaskedValues` so masked key material never crosses the
  network boundary even for authorized callers, and replaced the swallow-all body
  parsing with explicit validation of `envOverrides` and `environment`.
- **Evidence**: 18 new tests in `ventures/print-atelier/tests/api-auth.test.ts`
  and `tests/credentials-route.test.ts`; 10 of the 11 route tests fail against
  the pre-fix handler. Full venture verify green — `tsc --noEmit`, `next lint`,
  235 tests, `next build`.
- **Residual risk at the time**: the API half of this is now closed by SEC-019,
  which guards the remaining six handlers. The page half is not: the operator
  pages `/admin-portal`, `/ops`, `/investor`, `/sales-portal`, `/marketing-portal`,
  `/payout-simulator`, `/ad-sync-health` and `/partner-setup` are still publicly
  routable, and gating them needs a session-based operator login rather than a
  bearer token — a product decision, tracked as a blocker for this venture's
  first deploy.

### SEC-019 — Critical — Six Operator API Handlers Served Anonymous Callers

- **Location**: `ventures/print-atelier/src/app/api/ad-catalog/sync`,
  `/fulfillment/submissions`, `/retargeting/events`, `/payouts/reconciliation`,
  `/stripe/checkout` (GET), `/stripe/webhook` (GET)
- **Impact**: `src/lib/api-auth.ts`, added under SEC-018, documents itself as
  protecting the routes that report configured credentials, reconcile payouts and
  "trigger outbound syncs that spend real ad budget". It was wired into one route.
  The most severe of the six is `POST /api/ad-catalog/sync`: it authenticates to
  Meta Commerce, Google Merchant Center and Pinterest with the server's own
  credentials and rewrites the product catalog those ad accounts sell from, so any
  anonymous caller could trigger a write against the operator's live ad accounts.
  Its `baseUrl` query parameter was passed through unvalidated into the `link` and
  `imageLink` of every pushed product, which turns that write into catalog
  poisoning — an attacker could point the operator's paid ad inventory at a domain
  they control. The other five disclosed per-artist payout amounts and Connect
  account attribution, Printful/Gelato order records, cart values and session ids,
  and which Stripe/Printful/Gelato secrets are configured.
- **Fix**: `requireOperator` on all six. `baseUrl` is parsed and must be an
  absolute `http(s)` URL, rejected before any outbound sync runs. `stripe/checkout`
  POST and PUT stay public — a buyer has no operator token — and `stripe/webhook`
  POST keeps its signature check, the stronger control there.
- **Evidence**: `tests/operator-route-authorization.test.ts` asserts the refusals,
  the fail-closed 503, that a denial body carries no catalog or order state, and
  five rejected `baseUrl` values; each assertion fails against the pre-fix handler.
  `tests/api-route-guard-contract.test.ts` enumerates every handler under
  `src/app/api` and fails unless it is guarded or listed as public with a stated
  reason — that contract is what found four of the six. Full venture verify green:
  `tsc --noEmit`, `next lint`, 263 tests, `next build`.
- **Process note**: the four found by the contract rather than by reading were all
  in files nobody flagged. The pattern this closes is not "someone forgot a guard"
  but "adding a route never prompted anyone to decide", which is why the fix
  includes the contract and not only the guards.
- **Residual risk**: the operator pages listed under SEC-018 remain publicly
  routable, and a browser has no way to present a bearer token, so an operator
  cannot read their own dashboards until a session mechanism exists. The panels
  now say so explicitly instead of rendering zeros.

### SEC-020 — Low — Public-Path Prefix Exempted the Paths Beside It in docs-site

- **Location**: `ventures/photo-editing/docs-site/src/lib/auth.ts`, `isPublicPath`
- **Impact**: the ShootFlow documentation site is private by design — its
  middleware matches every path and demands a password session, token session,
  bearer token or basic auth. The single exit is `isPublicPath`, and one of its
  clauses was `pathname.startsWith("/api/health")`. A `startsWith` prefix with no
  trailing separator matches siblings as well as children, so `/api/healthz`,
  `/api/health-internal` and `/api/health/secrets` were all exempt from
  authentication. Rated Low because only `/api/health` exists today, and it
  returns a fixed ok flag and the service name — nothing was exposed. What was
  wrong is the rule, not the current route list: the next handler named anything
  like `health` would have shipped public, and no test would have said so. The
  same clause shape guards `/api/auth/` and `/_next/`, both of which correctly
  end in `/`.
- **Fix**: the clause is now `pathname === "/api/health"`. Behaviour for the real
  route is unchanged.
- **Evidence**: `src/lib/routeAuthPosture.test.ts`. `no public prefix opens a
  path it does not name` fails against the pre-fix rule — it is what found this
  — and `a path that merely starts like a public one is still refused` asserts
  the seven concrete paths, with a paired test that `/login`, `/api/auth/login`,
  `/api/health`, `/robots.txt` and `/favicon.ico` stay reachable so the fix
  cannot pass by closing everything. Full venture verify green: `tsc --noEmit`,
  40 tests, `next build`.
- **Process note**: this venture had no test of any kind under `src` before now.
  The contract that found it is the SEC-019 guard-contract shape adapted to a
  venture that guards in middleware rather than in handlers: it imports the real
  `isPublicPath` rather than restating it, so it cannot drift, and it fails when
  `isPublicPath` grows a clause shape it cannot evaluate rather than passing over
  a rule it no longer describes.
- **Residual risk**: none for this rule. The `!isAuthConfigured()` branch in the
  middleware still serves the whole site when neither `DOCS_SITE_PASSWORD` nor
  `DOCS_SITE_TOKEN` is set, which is deliberate for local development and fails
  closed with a 503 in production. Nothing tests that production branch.

---

### SEC-021 — Low — The Homepage Container Published Its Own Configuration

- **Component**: `portfolio/marisstella-homepage` (production, Kubernetes).
- **Found**: 2026-08-01, while replacing the venture's no-op CI gates.
- **Issue**: the `Dockerfile` does `COPY . /usr/share/nginx/html`, and the
  `.dockerignore` excluded `Dockerfile*`, `node_modules`, dotfiles and key
  material but not `nginx.conf` or `package.json`. nginx denies only paths
  matching `/\.`, so both were fetchable from the public site: `/nginx.conf`
  served the full server configuration including the Content-Security-Policy
  and the unprivileged-user temp paths, and `/package.json` served the
  toolchain. Rated Low because neither contains a secret and the CSP is sent on
  every response anyway — what it gives an attacker is a free, exact read of the
  server's rules rather than having to probe for them.
- **Fix**: `.dockerignore` now also excludes `nginx.conf`, `package.json`,
  `package-lock.json`, `test/` and `*.png`. The build context, not nginx, is the
  right place for this: an exclusion in the server config would have to be kept
  in step with every new file.
- **Evidence**: `test/markup-contract.test.mjs`, `the container does not publish
  its own build and config files`, which asserts the Dockerfile still copies the
  whole context and then requires each entry by name. Mutation-checked by
  removing each of the five entries in turn; every removal fails that test and
  no other.
- **Residual risk**: the exclusion list is enumerated rather than derived, so a
  future config file added beside these would ship public until someone adds it.
  An allow-list `COPY` of the three served files would close that properly and
  is the better fix if this site grows past three files.
- **Process note**: this venture is the reason
  `platform/ci/test/gate-substance.test.mjs` exists. Its three declared gates
  were `node -e 'console.log("... verified")'`, so the CI engine reported the
  component PASSED without checking anything, and had done so for as long as it
  existed. Nothing found this because nothing was looking: every control asks
  whether a gate is declared and reachable, and this one was both.
- **Correction, 2026-08-02**: the impact recorded above is wrong, and the fix
  addresses an artifact production does not serve. Probed with no credentials:
  `/nginx.conf` and `/package.json` both answer **404**, and always did.
  Production serves the site from a ConfigMap built by
  `platform/ci/deploy-homepage.sh`, not from the container image, so
  `.dockerignore` cannot narrow the public web root. The real exposure was
  `/Dockerfile`, which answered **200** — see SEC-022. This entry was reasoned
  from the `Dockerfile` and mutation-checked five ways against the build
  context, and every one of those checks was measuring the wrong artifact. The
  `.dockerignore` change remains correct for anyone who builds the image; it
  was simply never the control that governs marisstella.dev.

---

### SEC-022 — Low — The Production ConfigMap Published the Build Recipe

- **Location**: `platform/ci/deploy-homepage.sh`, the `--from-file` list.
- **Found**: 2026-08-02, by probing the live URL while checking whether
  SEC-021's fix had reached production.
- **Impact**: `https://marisstella.dev/Dockerfile` answered 200 with the full
  build recipe: the `nginx:alpine` base, the `COPY nginx.conf
  /etc/nginx/nginx.conf` line, the `chown` of the web root and cache paths, the
  `USER nginx` drop and the listening port. Rated Low because it holds no
  secret — what it gives an attacker is an exact, free read of how the service
  is built and run instead of having to probe for it. The disclosed `COPY`
  line also names a file that is *not* published, which is itself a map.
- **Cause**: the deploy script builds the release ConfigMap from four explicit
  `--from-file` entries and nginx mounts it as the web root. That list — not
  the image, and not `.dockerignore` — is the public surface of the site, and
  it named `Dockerfile` alongside the three real assets. Nothing consumed that
  key. The venture's own mutation-checked test asserted the `.dockerignore`
  exclusions, so removing the defect would not have failed a single test.
- **Fix**: `Dockerfile` removed from both the `--from-file` list and the
  preflight file check, and the list annotated as the public web root it is.
- **Evidence**: `platform/ci/test/homepage-release-surface.test.mjs`. The
  published set must equal the three served assets, no key may match a
  build/config file shape, the preflight and published lists must agree, and
  every published key must exist on disk. It fails against the pre-fix script,
  which is what confirmed the defect, and was mutation-checked five ways:
  `Dockerfile` restored to the ConfigMap, restored to the preflight alone,
  `nginx.conf` published, a served asset dropped, and a published file that
  does not exist. `platform/ci` 62 tests pass; homepage 27 pass.
- **Residual risk**: **the fix is not live.** It takes effect on the next
  homepage deploy, and `origin/main` was 2 days behind when this was written.
  `/Dockerfile` still answers 200 until then. This is the gap
  `scripts/ci/release_lag.py` and `platform/release-lag-budget.yaml` now
  measure — a Fixed row in this table is a claim about the repository, not
  about the running service. `git merge-base --is-ancestor <commit> origin/main`
  is the check that settles it.
- **Process note**: the generalizable lesson is SEC-021's, not this entry's. A
  remediation must be verified against the artifact production actually serves,
  and for anything with a URL that means probing the URL. Ten seconds of `curl`
  found both the exposure and the fact that the previous fix had addressed two
  paths that were never reachable.

### SEC-023 — High — The Dependency Audit Covered Four Lockfiles of Ten

- **Discovered**: 2026-08-02, reviewing which committed lockfiles CI audits.
- **Impact**: `.gitea/workflows/security.yml` has run a `dependency-audit` job
  for as long as it has existed, and its matrix has always been a hand-written
  list of four ventures. The repository tracks **ten** Node lockfiles. The six
  omitted ones had never been audited by anything, and measuring them found
  **32 high-severity advisories**:

  | Package | High | Never audited |
  | --- | --- | --- |
  | `ventures/real-estate-agent-photo-app/docs-site` | 14 | yes |
  | `ventures/real-estate-agent-photo-app/research` | 10 | yes |
  | `ventures/local-site-studio` | 4 | yes |
  | `ventures/photo-editing/docs-site` | 3 | yes |
  | `ventures/real-estate-agent-photo-app/pipeline` | 1 | yes |
  | `ventures/ai-engineering-academy/site` | 0 | yes |
  | `ventures/retail-pilot-intel` | 8 | no — in the matrix, failing |
  | `ventures/print-atelier` | 7 | no — in the matrix, failing |
  | `ventures/ai-first-markets` | 0 | no |
  | `ventures/quick-pick-survey` | 0 | no |

  The most serious single advisory is in `local-site-studio`: a Next.js
  **middleware / proxy bypass in App Router applications**. That venture's
  `src/proxy.ts` gates only `/dashboard` and leaves every `/api` handler to
  call `requireOperatorAuth()` itself, with no deny-by-default behind it — so a
  proxy-bypass advisory lands on the one venture whose guard has no second
  layer. Its lockfile pins a version the advisory covers.
- **Cause**: two separate failures, and the second is the worse one. The matrix
  was a list rather than a scan, so it covered what somebody had typed and not
  what existed, and nothing measured the ratio. Then the two audited ventures
  that *do* fail — print-atelier at 7 and retail-pilot-intel at 8 — have been
  failing into a job no branch protection requires, because required status
  checks are still unconfigured (see the roadmap's Gitea protection item). A
  red cell nothing blocks on is indistinguishable from a green one.
- **Fix**: the matrix now lists all ten committed lockfiles. Coverage is the
  part that is fixed; **the 47 advisories themselves are open**, and are
  deliberately not remediated in the same change — the available fixes are
  semver-major bumps of Next.js, `eslint-config-next`, `wrangler` and `sharp`
  across five ventures, which is a set of upgrades that needs each venture's
  suite run behind it rather than a lockfile rewrite done in passing.
- **Evidence**: `platform/ci/test/dependency-audit-coverage.test.mjs`. It scans
  git for committed lockfiles and fails when one is neither in the matrix nor a
  registered, owned, expiring, counted exception; it fails on a matrix entry
  whose directory has no lockfile, on an entry whose `manager` does not match
  the committed lockfile — `npm audit` in a pnpm workspace reports success
  without reading anything — on an audit command carrying `|| true`, on a
  missing `--audit-level`, on `continue-on-error`, and on `fail-fast: true`,
  which would let one venture's advisories cancel every other venture's audit.
  It does **not** run `npm audit` itself: advisory counts change when a CVE is
  published against an unchanged lockfile, so asserting them would fail on days
  nobody committed anything and would need the network to run at all.
  Mutation-checked thirteen ways; `platform/ci` 66 tests, 9 new, all passing
  except two that already fail at `HEAD` for an unrelated catalog defect.
- **Partial remediation, 2026-08-02**: the two ventures whose fixes were not
  semver-major were upgraded and verified, taking the repository from 47 high
  to **46**. The headline number barely moves and that is the wrong thing to
  read — what left is the directly exploitable half:

  | Venture | next | High before → after | Direct Next.js CVEs resolved |
  | --- | --- | --- | --- |
  | `local-site-studio` | 16.2.9 → 16.2.12 | 4 → 3 | middleware/proxy bypass, DoS |
  | `photo-editing/docs-site` | 15.2.4 → 15.5.22 | 3 → 3 | SSRF, DoS in Server Actions |

  In both, `next` is now flagged **only transitively**, through `postcss` and
  `sharp`; it carries no CVE of its own. `docs-site`'s count is unchanged
  because the transitive row remains, which is exactly why a count is a poor
  proxy for posture and the advisory bodies have to be read.
  Verified: `local-site-studio` `npm ci` clean, 125 files / 1214 tests passing,
  `next build` green; `docs-site` 40 tests passing, `next build` green. The
  exact pin style on `next` was preserved in both.
- **Residual risk**: 46 advisories remain and are now visible. The residue in
  the two remediated ventures is `postcss` (<=8.5.17, XSS and arbitrary file
  read) and `sharp` (<0.35.0, four libvips CVEs), both pulled in by Next.js
  itself; npm's only proposed fix is a **downgrade to next@9.3.3**, so no
  forward fix exists and these wait on an upstream Next.js release. The
  remaining 40 sit in `real-estate-agent-photo-app` (25 across three packages,
  two of which have **no test script at all**, so an upgrade there has nothing
  to verify it), `print-atelier` (7) and `retail-pilot-intel` (8). Those need
  semver-major bumps of `eslint-config-next`, `wrangler` and `sharp` behind a
  suite each venture does not yet have. Tracked on the roadmap's SCA item with
  the per-venture counts above as the baseline to ratchet down.
- **Process note**: this is the same shape as the homepage gate in SEC-021 and
  the route-posture work — a control that was *declared* and *reachable* and
  still covered a minority of its subject, because its subject was a list
  somebody maintained by hand. The generalizable half is never the list; it is
  the scan that makes the list fail when reality outgrows it.

---

## Operational Security Checklist

- [x] All workflows include `permissions: contents: read` top-level block.
- [x] Secrets scanned and verified clean of exposed tokens.
- [x] Database credentials managed via Kubernetes Secrets.
- [x] Security headers and CSP active on all public web endpoints.
- [x] Dependency vulnerabilities scanned and logged.
