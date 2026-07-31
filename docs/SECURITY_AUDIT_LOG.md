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

---

## Operational Security Checklist

- [x] All workflows include `permissions: contents: read` top-level block.
- [x] Secrets scanned and verified clean of exposed tokens.
- [x] Database credentials managed via Kubernetes Secrets.
- [x] Security headers and CSP active on all public web endpoints.
- [x] Dependency vulnerabilities scanned and logged.
