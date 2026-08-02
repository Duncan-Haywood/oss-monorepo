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
- **Correction, 2026-08-02**: the fix above hardens the container image and does
  not change what production serves. See SEC-022.

### SEC-022 — Low — Production Published Its Build Recipe, And SEC-021 Did Not Bind

- **Component**: `platform/ci/deploy-homepage.sh` → `marisstella-homepage-files`
  ConfigMap, `web-services/web-portal-web-service` (production, Kubernetes).
- **Found**: 2026-08-02, while checking whether SEC-021's fix had shipped.
- **Issue**: two things, and the second is the one that matters.
  `deploy-homepage.sh` builds the release ConfigMap with four `--from-file`
  entries — `index.html`, `style.css`, `app.js` and **`Dockerfile`** — and the
  Deployment mounts that ConfigMap at `/usr/share/nginx/html` with no `items:`
  selector. Every key is therefore a file on the public site, and
  `https://marisstella.dev/Dockerfile` returned the repository's Dockerfile
  byte-for-byte (230 bytes, `content-type: application/octet-stream`, verified
  live). Rated Low on the same reasoning as SEC-021: it holds no secret, and
  what it gives away is the server's construction rather than access to it.
  The `Dockerfile` key has been in the release set since `8c9b8c8` introduced
  the ConfigMap deploy on 2026-07-31, with no stated reason; the preflight loop
  listed it as a required release file, so it read as deliberate.
- **Why SEC-021's fix does not cover this**: the ConfigMap mount *shadows* the
  image's web root. Nothing baked into the image at `/usr/share/nginx/html` is
  ever served, so `.dockerignore` — and
  `portfolio/marisstella-homepage/test/markup-contract.test.mjs`, which holds
  it — cannot govern the deployed file set. Both remain correct for anyone
  running the image directly and are kept. The live evidence is that
  `/nginx.conf` and `/package.json` return 404 in production not because
  `.dockerignore` excludes them but because this script never published them,
  while `/Dockerfile`, which `.dockerignore` *did* exclude, was served anyway.
  A remediation was recorded against the artifact that was easiest to reason
  about rather than the one production serves.
- **Fix**: `Dockerfile` removed from both the publish list and the preflight
  loop in `platform/ci/deploy-homepage.sh`.
- **Evidence**: `platform/ci/test/homepage-release-surface.test.mjs`, six tests
  that read the publish list out of the deploy script and allow-list it: a key
  must have a servable extension, must be named rather than swept in by a bare
  `--from-file=<dir>`, must resolve to a file in the repository, must include
  the three the site cannot render without, and must match the script's own
  preflight list. Mutation-checked seven ways — republishing `Dockerfile`,
  adding `nginx.conf`, switching to a directory publish, dropping `app.js`,
  publishing a missing file, removing the publish list entirely, and drifting
  the preflight list — each fails its intended test and no other. It runs in
  `scripts/test-ci.sh` with the rest of `platform/ci/test/`.
- **Residual risk**: the live ConfigMap still holds the `Dockerfile` key; the
  fix takes effect on the next homepage deploy, which requires the branch to
  reach `origin/main`. Until then the file is still served. The allow-list is
  by extension, so a servable-looking file with sensitive content would pass —
  this control bounds the file *type*, not its contents.
- **Process note**: the homepage Deployment and ConfigMap are created
  imperatively by this script and have no desired state in the repository,
  against the GitOps requirement in `AGENTS.md`. That is why the mount's
  missing `items:` selector — the thing that makes every key public — is
  visible only from the cluster.

---

## Operational Security Checklist

- [x] All workflows include `permissions: contents: read` top-level block.
- [x] Secrets scanned and verified clean of exposed tokens.
- [x] Database credentials managed via Kubernetes Secrets.
- [x] Security headers and CSP active on all public web endpoints.
- [x] Dependency vulnerabilities scanned and logged.
