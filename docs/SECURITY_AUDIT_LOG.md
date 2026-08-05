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
| **SEC-020** | Low | Application | `ventures/photo-editing/docs-site/src/lib/auth.ts` | `startsWith("/api/health")` exempted sibling paths from the private site's auth | **Fixed** |
| **SEC-021** | Low | Container | `portfolio/marisstella-homepage/.dockerignore` | Container image published `nginx.conf` and `package.json` in its web root | **Fixed (image only — see SEC-022)** |
| **SEC-022** | Low | Infrastructure | `platform/ci/deploy-homepage.sh` | Release ConfigMap published `Dockerfile` to the live web root, and SEC-021's fix did not govern production | **Fixed — pending deploy** |
| **SEC-023** | High | Application | `ventures/real-estate-agent-photo-app/.github/workflows/deploy-docs.yml` | Listing Lens docs answered an unauthenticated `GET` with 200 and the whole site, behind a rendered padlock | **Fixed** |
| **SEC-024** | Medium | Supply Chain | `scripts/security-scan.sh` | A dependency-free package held the audit open, freezing the vulnerability register for two days with no run reporting a failure | **Fixed** |
| **SEC-025** | Medium | Application | `ventures/print-atelier/src/app/api/stripe/webhook/route.ts` | Signed event missing `data` crashed the handler; the resulting 5xx makes Stripe redeliver indefinitely | **Fixed** |
| **SEC-026** | Medium | Application | `ventures/print-atelier/src/lib/stripe-webhook-server.ts` | Webhook signature timestamp tolerance defaulted to `0`, which meant "skip the replay check" | **[x] Fixed** |
| **SEC-027** | High | Supply chain | `.gitea/workflows/security.yml` | The dependency-audit matrix covered 4 of 10 committed lockfiles; the 6 unaudited ones held 32 high-severity advisories | **Coverage fixed; 46 of 47 advisories open** |
| **SEC-028** | High | Supply chain | `scripts/security-scan.sh`, three `package.json` | Unsatisfiable `overrides` made three packages uninstallable, dropping them from the audit; the completeness guard counted only packages it reached, so a one-package scan published `CLEAN` over 23 open HIGH advisories | **Fixed; 23 HIGH restored to the roadmap and open** |

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

### SEC-023 — High — Listing Lens Docs Served the Whole Internal Site Anonymously Behind a Padlock

- **Location**: `ventures/real-estate-agent-photo-app/.github/workflows/deploy-docs.yml`,
  the `apply-access` job; claim rendered by
  `docs-site/src/components/DocsShell.tsx` and `docs-site/src/app/page.tsx`.
- **Impact**: `https://listing-lens-docs.pages.dev/` answered an unauthenticated
  `GET` with **HTTP 200 and the full site**, verified 2026-08-01 by fetching it
  with no credentials from outside the repository. Every page rendered a padlock
  and the words "Cloudflare Access", the homepage stated the site "is gated by
  Cloudflare Access with a single-email allowlist", and the page metadata said
  "protected by Cloudflare Access". None of that was true. Readable by anyone
  with the URL: the internal outreach templates (cold email, DM and in-person
  scripts), the booking-intake and leads process, the concierge pricing
  one-pager, and the owner's personal email address in plain text. The email is
  published deliberately in the customer-facing booking link, so the exposure
  that matters is the internal go-to-market material and the false assurance
  itself — the owner had every on-page reason to believe this was private.
  `public/_headers` sets `X-Robots-Tag: noindex`, which prevents indexing, not
  reading.
- **Root cause**: `docs-site/scripts/setup-cloudflare-access.sh` is correct and
  complete. The job that runs it was gated on
  `if: github.event_name == 'workflow_dispatch'` and declared `needs: deploy`, so
  every push-triggered deploy published the site and skipped the policy
  entirely. `infra/access-policy.json` is a document, not an applied policy. This
  is the [ci-runner-tooling]-class defect one level out: a control that is
  written, reviewed, and version-controlled, and that never executes.
- **Fix**: `apply-access` now runs on every event and runs **before** `deploy`,
  so a publish cannot outrun its gate. A new `verify-access` job then re-requests
  the deployed site with no credentials and fails the release if the content
  comes back (`docs-site/scripts/verify-access-gate.sh`). `docs-site`'s
  `pages:deploy` script chains the same verification, because it bypasses the
  workflow and would otherwise reopen exactly this hole. The on-page claim now
  names the control and the check that earns it rather than asserting a state
  the page cannot observe, and says plainly that until a deploy has passed the
  check the contents should be treated as public.
- **Evidence**: `verify-access-gate.sh` run against the live hostname
  **fails today**, reproducing the finding rather than describing it.
  `docs-site/scripts/verify-access-gate.test.sh` drives all five branches
  against a local stub origin — redirect-to-Access and content-free 403 pass;
  200-with-content, redirect-to-a-non-Access-host, and a 403 that still serves
  the body all fail — so the check is proven to be capable of passing and is not
  a permanent deploy block. Chained into the pipeline package's `npm test`,
  which is the only gate the CI catalog runs for this venture. ShellCheck and
  actionlint clean; full venture suite green.
- **Residual risk**: **the site is still public as of this entry.** Nothing here
  turns the gate on — that needs `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` with Zero Trust edit rights present in the repository
  secrets, and a deploy to run. Until then the new job fails the deploy, which
  is the correct direction but does not retract what is already published.
  Separately, the verifier probes only `/`; a future per-path Access policy
  would need per-path probes.

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

### SEC-025 — Medium — Malformed Signed Stripe Event Crashed the Webhook
- **Location**: `ventures/print-atelier/src/app/api/stripe/webhook/route.ts`
- **Impact**: SEC-019 guarded this route's `GET` diagnostic. The `POST` — the
  path money actually arrives on — is guarded by signature verification instead,
  and that part was correct. What was missing came after it: the handler read
  `event.data.object` with no shape check, so a correctly signed event without
  `data`, or a signed body that is an array, string, number or `null`, raised a
  `TypeError` and returned 500. Stripe retries 5xx, so one malformed event would
  be redelivered on Stripe's retry schedule instead of being rejected once. Only
  Stripe can trigger this, which is what holds it to Medium.
- **Fix**: An explicit `isWebhookEventShape` check between JSON parsing and first
  dereference, returning 400 for a shape the handler cannot process.
- **Evidence**: 9 new tests in `ventures/print-atelier/tests/stripe-webhook-route.test.ts`.
  This route had no route-level test of any kind — only
  `verifyStripeWebhookSignature` was tested as a pure function, which cannot
  observe a status code. The two shape tests fail against the pre-fix handler.
  The other seven cover authenticity at the route layer — missing header, forged
  signature, wrong secret, a valid signature replayed over a tampered payload,
  and an unset secret — and passed before the change, so they are regression
  cover for a path that previously had none. Full venture verify green:
  `tsc --noEmit`, `next lint`, 278 tests, `next build`.

### SEC-026 — Medium — Stripe Webhook Replay Check Was Off By Default
- **Location**: `ventures/print-atelier/src/lib/stripe-webhook-server.ts:7,28`
- **Impact**: `verifyStripeWebhookSignature` parses the `t=` timestamp and uses
  it to rebuild the signed payload. Stripe's own tolerance window is what stops
  a captured webhook being replayable; without it, an intercepted request stays
  valid forever. Given the handler records orders and queues Gelato/Printful
  fulfillment, a replayed `payment_intent.succeeded` could re-queue fulfillment
  for an order already shipped.
- **Correction to the original entry (2026-08-05)**: as first written, this
  entry said the timestamp was "never compared against the current time". That
  stopped being true when a `maxAgeSeconds` parameter was added, and the entry
  was not revisited — so the register described a defect the code no longer had
  while the defect it *did* have went unrecorded. The parameter's default was
  `0` and the body read `if (maxAgeSeconds > 0 && ...)`, so the check existed
  but was **off unless a call site opted in**. The single call site
  (`src/app/api/stripe/webhook/route.ts`) passed `300`, so the deployed path was
  never actually replayable; the exposure was that the fail-open sat in the
  signature of the function authenticating the money path, where any new call
  site or a dropped argument would have disabled it with every line still
  reading as correct.
- **Fix**: `STRIPE_WEBHOOK_MAX_AGE_SECONDS = 300` (Stripe's documented
  tolerance, and the value the route already used — nothing was widened or
  narrowed) is now both the default and the ceiling. Omitting the argument
  yields the safe value. A caller may narrow the window; a caller may not widen
  it and cannot switch it off — `0`, negatives, `NaN`, `Infinity` and any value
  above the ceiling are refused before the header is parsed, so an out-of-range
  tolerance rejects deliveries rather than accepting replays.
- **Evidence**: 5 new tests in `ventures/print-atelier/tests/stripe-webhook.test.ts`.
  Mutation-verified: restoring `maxAgeSeconds = 0` and the `maxAgeSeconds > 0 &&`
  bypass fails 3 of them (an hour-old genuine signature is accepted), while the
  14 pre-existing tests in that file and all 10 route-level tests in
  `stripe-webhook-route.test.ts` stay green under the same mutation — which is
  why the defect survived SEC-023's route-level test pass. The pre-existing
  "validates Stripe signature headers" case had in fact *pinned* the fail-open:
  it asserted `true` for a March-2024 timestamp with the tolerance argument
  omitted, which is only correct if the age check is disabled.
- **Not watched by cap_ratchet**: `scripts/ci/cap_ratchet.py` supports
  `python-constant` and `yaml-path` watches only, so a TypeScript constant under
  `ventures/` cannot be enrolled. The stand-in is the "the accepted replay
  window is bounded" test in the venture's own suite, which fails if the
  constant is raised above 300. It is a bound, not a history-backed ratchet.

### SEC-024 — Medium — The Vulnerability Register Silently Froze for Two Days
- **Location**: `scripts/security-scan.sh:43-57` (`audit_node_package`)
- **Impact**: `SECURITY_ROADMAP.md` is the release gate, and it stopped being
  written on 2026-07-31 without any run reporting a security failure. The
  scanner requires a lockfile from every directory holding a `package.json`,
  records a missing one as an audit gap, and the completeness guard then refuses
  to rewrite the roadmap. `portfolio/marisstella-homepage` acquired a
  `package.json` when its real test suite landed (`c3287b2`); it declares no
  dependencies at all — its only script runs `node:test` over the standard
  library — so it has no lockfile and can never produce a finding, yet it held
  every subsequent scan open. The failure is quiet in the direction that
  matters: the roadmap keeps showing the *last* good scan, so it reads as
  current rather than as absent.
- **Consequence, measured 2026-08-02**: the committed register recorded 2
  Critical and 67 High. A completed scan of the same tree finds 0 Critical and
  47 High. Both criticals were `form-data` and `request` reached through
  `htmltojsx` in `ventures/photo-editing/docs-site`; that dependency has since
  been removed, so the register was reporting two blocking criticals that no
  longer existed, against a stated policy of blocking releases on Critical and
  High findings.
- **Fix**: A package declaring no dependencies in any of the six dependency
  fields is audited as having nothing to audit, rather than recorded as a gap.
  The decision is read from the committed `package.json` alone and never from
  environment state, so it cannot be reached by a run that failed to install,
  lost the registry, or was sandboxed — which is what separates it from the
  offline branch beside it, where exactly that erasure was the recorded
  regression. Declaring a single dependency re-arms the lockfile requirement and
  the real audit; an unparseable manifest falls through to the normal path and
  is still treated as unaudited.
- **Evidence**: 4 new cases in `scripts/security/test-security-scan.sh` covering
  the exemption, its scoping to the package that earns it, a malformed manifest,
  and a `devDependencies`-only package. Mutation-checked four ways — reverting
  the exemption, treating an unparseable manifest as dependency-free, ignoring
  `devDependencies`, and suppressing the lockfile gap repo-wide each fail the
  intended case and no other. Against the real tree the scan now audits 11
  packages where it audited 10, and the roadmap rewrites.
- **Status**: Fixed. The register itself is regenerated by the next scan; it is
  a generated file and is not hand-corrected here.

### SEC-027 — High — The Dependency Audit Covered Four Lockfiles of Ten

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

### SEC-021 — Medium — Rate Limits Keyed on a Client-Controlled Header, and the Anonymous Surface Behind Them

- **Location**: `ventures/local-site-studio/src/lib/security/rate-limit.ts:109`
  and `src/lib/auth/operator.ts` (`requireOperatorAuth`);
  `ventures/quick-pick-survey/src/lib/http.ts` (`getClientIp`).
- **What is actually new here**: not the individual weaknesses — the repository
  already documents both. `rate-limit.ts:18` says the client key "derives from
  x-forwarded-for / x-real-ip, which a client can spoof", and
  `marketing/generate/route.ts:47` says in as many words that when the password
  is unset "requireOperatorAuth returns ok for every caller — without a
  limiter". What nobody had written down is what they compose into, and that
  nothing bounds the composition. Each comment describes its own limitation and
  stops at the edge of its own file. Found while writing the route auth-posture
  contracts, which is the second time that exercise has surfaced something
  reading the code did not (see SEC-019, SEC-020).
- **Impact, local-site-studio**: `POST /api/marketing/generate` calls the
  Anthropic API once per request — a billed call, with the caller controlling
  the prompt content. Two things stand between it and the open internet.
  `requireOperatorAuth` returns `{ ok: true }` to everyone when
  `OPERATOR_DASHBOARD_PASSWORD` is unset, which is the documented open-demo
  default; and `checkRateLimit` buckets on the leftmost `x-forwarded-for`
  entry, which the client supplies, so rotating one header yields a fresh
  bucket per value. On a deployment where the platform does not overwrite that
  header, the effective limit is unbounded. The exposure is a metered spend on
  the operator's own API key rather than a data breach, which is why this is
  Medium and not High — but it is the one finding in this log with a direct,
  continuous cost to the portfolio's budget, and the portfolio has no
  per-venture spend meter that would show it happening
  (`portfolio/ledger/README.md`). `POST /api/stripe/bootstrap-prices` sits
  behind the same fail-open auth, with `ALLOW_STRIPE_BOOTSTRAP=1` as its only
  other gate; a boolean env flag carries no caller identity. Mitigating: its
  response returns price IDs only, never `STRIPE_SECRET_KEY`, and the operation
  is additive.
- **Impact, quick-pick-survey**: the same leftmost-entry keying defeats every
  anonymous limit on the only venture serving live production traffic —
  including the per-IP brake on `POST /api/admin/login`, which is a brute-force
  control on the admin key rather than a convenience limit. **This half is
  conditional and unresolved**: `http.ts` documents a Vercel assumption, and
  behind Vercel the leftmost entry genuinely is the real client, so the code is
  correct there. The repository also ships `scripts/nginx-lb.conf`, whose
  `proxy_add_x_forwarded_for` appends rather than replaces, leaving an
  attacker-supplied value leftmost. Which of the two fronts
  `pairwise.marisstella.dev` is a deployment fact not recorded in the
  repository. Determining that is the first remediation step, not a code
  change.
- **Fix**: none applied, deliberately. The correct fix is to count trusted
  proxies and index from the right, and the correct count is exactly the
  off-repo fact above — guessing it either leaves the bypass open or collapses
  every caller into one bucket and breaks rate limiting outright. Recorded
  rather than corrected, consistent with how this repository treats controls
  whose inputs it cannot yet observe.
- **Evidence**: `ventures/quick-pick-survey/src/lib/routeAuthPosture.test.ts`
  now declares all 32 handlers, of which 15 are `public` and 9 are
  `capability` — 24 handlers reachable without a session, which is the surface
  these limits are the only brake on. That count is held exact by
  `platform/route-posture-registry.yaml`.
- **Residual risk, recorded not fixed**: three anonymous endpoints on the live
  venture carry no bound at all beyond the limits above.
  `POST /api/trials/undo` **deletes** the most recent answer for a participant
  id and is the one destructive write in the capability set with no rate limit
  on it; the capability itself is a `cuid()`, which is time-ordered rather than
  a CSPRNG token. `GET /api/og/couple-card` renders attacker-supplied text into
  a branded image served from the production domain, uncapped and
  unauthenticated — a phishing asset with the site's authority and an image
  rendering sink. `GET /api/health` returns `RELEASE_REVISION`, disclosing the
  deployed commit; minor, and easily gated. None of these are regressions; they
  are the honest reading of what `public` and `capability` mean on that
  surface, which is what the contract was written to make visible.

---

### SEC-028 — High — A Security Edit Switched The Security Scan Off

- **Discovered**: 2026-08-05, investigating why `scripts/test-ci.sh` and the
  verification pipeline were red on `main` at its own gates.
- **Impact**: `SECURITY_ROADMAP.md` — the file the merge policy reads — was
  published at 12:59 UTC declaring `1 package(s) audited`, `HIGH: 0`, and a
  single row: `All Components | None | CLEAN | No active vulnerability findings
  detected`. A complete scan of the same tree measures **23 HIGH, 4 MEDIUM,
  2 LOW across 12 packages**. For the period the file stood, the repository's
  security dashboard asserted a clean bill of health it had no evidence for,
  and the recorded findings from SEC-023 and SEC-027 had been erased from it.

- **Two independent causes, and neither one alone is sufficient:**

  1. **The `overrides` blocks were unsatisfiable.** `2fdcf837` ("complete stash
     convergence and clean uncommitted work") added an `overrides` block to
     three manifests and regenerated none of their lockfiles. Each pinned a
     package the same manifest depends on *directly* — `next`,
     `eslint-config-next`, `postcss`. npm's rule is that an override on a direct
     dependency must match that dependency's spec character for character, so
     npm refused to build a tree at all. Note `postcss: "^8.5.18"` over a direct
     `"^8"` violates it while being a strict subset. `npm ci` reports this as
     `EUSAGE ... package.json and package-lock.json are not in sync`, which
     names the wrong file entirely, and the audit skips any package it cannot
     install. Three of twelve packages left the scan silently.

  2. **The completeness guard had no denominator.** It refused to rewrite the
     roadmap when a package landed in `AUDIT_GAPS_TMP` or when `AUDITED_COUNT`
     was 0 — both conditions on packages the walk had *reached*. Discovery was
     `find ventures portfolio platform ... 2>/dev/null`, so an absent root
     contributes no packages, no gap and no message. "Every package audited"
     therefore meant "every package we happened to find", and one package found,
     one package audited, satisfied it.

  The file's own header states the opposite guarantee: *"a scan that cannot
  audit every package refuses to rewrite this file, so a clean dashboard always
  means a complete scan rather than a failed one."* That sentence was true of
  the intent and false of the code.

- **Remediation**:
  - `next` and `eslint-config-next` removed from `overrides` — they are direct
    dependencies and an override is the wrong mechanism there — and `postcss`
    aligned to `^8.5.18` in both blocks so override and dependency agree. No
    override was dropped for convenience; the deferred semver-major `next` bump
    from SEC-023 stays deferred and still wants a test suite first.
  - The four lockfiles regenerated. **The security overrides had never once
    applied**: postcss 8.4.31 → 8.5.25, sharp 0.34.5 → 0.35.3, glob → 10.5.0,
    brace-expansion → 2.1.4, undici → 6.28.0, ws → 8.21.2.
  - Discovery now requires each scan root to exist, propagates the walk's exit
    status instead of discarding its stderr, and reconciles what the walk
    reached against the manifests `git ls-files` reports under the same roots.
    A tree that is not a git work tree is itself a gap, because the expected set
    cannot be established and the walk cannot be checked against anything.
  - `platform/ci/test/npm-manifest-integrity.test.mjs` holds all 18 tracked
    manifests and 11 lockfile pairs to npm's override rule and to lockfile-root
    agreement, statically, with no npm and no network.

- **Note on the numbers.** The roadmap moving from `HIGH: 0` to `HIGH: 23` is
  the scan recovering its sight, not a regression. It lands well below the 46
  SEC-023 last measured honestly, because the postcss and sharp overrides
  finally bite. Do not read the rise as new debt or the earlier 0 as a better
  posture.

- **What this says about the class.** The three fixture cases added to
  `scripts/security/test-security-scan.sh` matter less than why they were
  missing: neither fixture builder created `platform/`, so all ten existing
  cases had been running against a scan with an absent root, invisibly, for as
  long as the suite existed. The suite was reproducing the defect it was written
  to catch. A control's fixtures are part of the control.

- **Status**: **Fixed**. The 23 HIGH are restored to the roadmap and remain
  open; they are tracked debt, not resolved.

---

## Operational Security Checklist

- [x] All workflows include `permissions: contents: read` top-level block.
- [x] Secrets scanned and verified clean of exposed tokens.
- [x] Database credentials managed via Kubernetes Secrets.
- [x] Security headers and CSP active on all public web endpoints.
- [x] Dependency vulnerabilities scanned and logged.
