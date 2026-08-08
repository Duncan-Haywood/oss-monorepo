# Security Roadmap & Vulnerability Log

> **Automated Security Scanning & Governance Status**
> - **Last Scan Execution**: `2026-08-08 11:18:46 UTC`
> - **CI Pipeline Scanner**: Enabled (`.gitea/workflows/security.yml`)
> - **Audit Coverage**: 12 package(s) audited. A scan that cannot
>   audit every package refuses to rewrite this file, so a clean dashboard always
>   means a complete scan rather than a failed one.
> - **Policy Enforcement**: Block PR merges on Critical/High vulnerabilities; track all findings in this roadmap.

---

## Executive Summary & Vulnerability Dashboard

| Severity | Active Issues | Target SLA | Mitigation Priority |
| :--- | :--- | :--- | :--- |
| 🚨 **CRITICAL** | **0** | Immediate (24h) | Block Release |
| ⚠️ **HIGH** | **23** | 7 Days | Sprint Backlog |
| 🟡 **MEDIUM** | **6** | 30 Days | Scheduled Update |
| 🔵 **LOW** | **2** | 90 Days | Maintenance Window |

---

## Active Security Findings & Problem Log

| Component / File | Package / Target | Severity | Range | Issue / Vulnerability | Recommended Fix | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ventures/ai-first-markets | `brace-expansion` | **HIGH** | <=1.1.17 || 2.0.0 - 2.1.3 || 4.0.0 - 5.0.8 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation, brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation, brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | npm audit fix | [ ] Scheduled |
| ventures/ai-first-markets | `js-yaml` | **HIGH** | 4.0.0 - 4.3.0 | JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported | npm audit fix | [ ] Scheduled |
| ventures/ai-first-markets | `nanoid` | **HIGH** | <3.3.17 | nanoid: custom generators can loop indefinitely when size is zero | npm audit fix | [ ] Scheduled |
| ventures/local-site-studio | `js-yaml` | **HIGH** | 4.0.0 - 4.3.0 | JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported | npm audit fix | [ ] Scheduled |
| ventures/local-site-studio | `nanoid` | **HIGH** | <3.3.17 | nanoid: custom generators can loop indefinitely when size is zero | npm audit fix | [ ] Scheduled |
| ventures/print-atelier | `esbuild` | **LOW** | 0.27.3 - 0.28.0 | esbuild allows arbitrary file read when running the development server on Windows | npm audit fix | [ ] Scheduled |
| ventures/quick-pick-survey | `brace-expansion` | **HIGH** | >=4.0.0 <5.0.9 || <1.1.18 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation, brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | npm audit fix | [ ] Scheduled |
| ventures/quick-pick-survey | `js-yaml` | **HIGH** | 4.0.0 - 4.3.0 | JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported | npm audit fix | [ ] Scheduled |
| ventures/quick-pick-survey | `nanoid` | **HIGH** | <3.3.17 | nanoid: custom generators can loop indefinitely when size is zero | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `next` | **MODERATE** | 9.3.4-canary.0 - 16.3.0-preview.10 | postcss | Upgrade next@16.3.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `postcss` | **HIGH** | <=8.5.22 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure, PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset | Upgrade next@16.3.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `next` | **MODERATE** | 9.3.4-canary.0 - 16.3.0-preview.10 | postcss | Upgrade next@16.3.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `postcss` | **HIGH** | <=8.5.22 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure, PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset | Upgrade next@16.3.0 | [ ] Scheduled |
| ventures/retail-pilot-intel | `esbuild` | **LOW** | >=0.27.3 <0.28.1 | esbuild allows arbitrary file read when running the development server on Windows | Upgrade esbuild to >=0.28.1 | [ ] Scheduled |
| ventures/retail-pilot-intel | `brace-expansion` | **HIGH** | <1.1.16 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups | Upgrade brace-expansion to >=1.1.16 | [ ] Scheduled |
| ventures/retail-pilot-intel | `brace-expansion` | **HIGH** | >=3.0.0 <5.0.7 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups | Upgrade brace-expansion to >=5.0.7 | [ ] Scheduled |
| ventures/retail-pilot-intel | `js-yaml` | **HIGH** | >=4.0.0 <4.3.0 | js-yaml: YAML merge-key chains can force quadratic CPU consumption | Upgrade js-yaml to >=4.3.0 | [ ] Scheduled |
| ventures/retail-pilot-intel | `react-router` | **MODERATE** | >=6.0.0 <7.18.0 | React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass) | Upgrade react-router to >=7.18.0 | [ ] Scheduled |
| ventures/retail-pilot-intel | `react-router` | **MODERATE** | >=7.11.0 <7.18.0 | React Router: RSCErrorHandler Missing Protocol Validation (XSS) | Upgrade react-router to >=7.18.0 | [ ] Scheduled |
| ventures/retail-pilot-intel | `react-router` | **MODERATE** | >=6.4.0 <7.18.0 | React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration | Upgrade react-router to >=7.18.0 | [ ] Scheduled |
| ventures/retail-pilot-intel | `react-router` | **HIGH** | >=7.0.0 <7.18.0 | React Router: Unauthenticated Denial of Service via Inefficient Route Matching | Upgrade react-router to >=7.18.0 | [ ] Scheduled |
| ventures/retail-pilot-intel | `postcss` | **HIGH** | <=8.5.17 | PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | Upgrade postcss to >=8.5.18 | [ ] Scheduled |
| ventures/retail-pilot-intel | `brace-expansion` | **HIGH** | <1.1.17 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | Upgrade brace-expansion to >=1.1.17 | [ ] Scheduled |
| ventures/retail-pilot-intel | `brace-expansion` | **HIGH** | >=4.0.0 <5.0.8 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | Upgrade brace-expansion to >=5.0.8 | [ ] Scheduled |
| ventures/retail-pilot-intel | `postcss` | **MODERATE** | <=8.5.22 | PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset | Upgrade postcss to >=8.5.23 | [ ] Scheduled |
| ventures/retail-pilot-intel | `brace-expansion` | **HIGH** | >=4.0.0 <5.0.9 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | Upgrade brace-expansion to >=5.0.9 | [ ] Scheduled |
| ventures/retail-pilot-intel | `brace-expansion` | **HIGH** | <1.1.18 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | Upgrade brace-expansion to >=1.1.18 | [ ] Scheduled |
| ventures/retail-pilot-intel | `js-yaml` | **HIGH** | >=4.0.0 <4.3.1 | JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported | Upgrade js-yaml to >=4.3.1 | [ ] Scheduled |
| ventures/retail-pilot-intel | `react-router` | **HIGH** | >=7.12.0 <7.18.2 | React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response | Upgrade react-router to >=7.18.2 | [ ] Scheduled |
| ventures/retail-pilot-intel | `nanoid` | **HIGH** | <3.3.16 | nanoid: non-secure generators can loop indefinitely with negative size | Upgrade nanoid to >=3.3.16 | [ ] Scheduled |
| ventures/retail-pilot-intel | `nanoid` | **HIGH** | <3.3.17 | nanoid: custom generators can loop indefinitely when size is zero | Upgrade nanoid to >=3.3.17 | [ ] Scheduled |

---

## Security Hardening Roadmap & Action Items

### Phase 1: High-Priority Baseline Hardening (Current Sprint)
- [x] Enforce least-privilege permissions (`permissions: contents: read`) across all Gitea Actions workflows.
- [x] Configure non-root unprivileged container users in application Dockerfiles.
- [x] Harden `.gitignore` to prevent credential, token, and SSH/TLS private key accidental check-ins.
- [x] Implement automated CI security scanning workflow (`.gitea/workflows/security.yml`).

### Phase 2: Dependency & Infrastructure Remediation (Short-Term)
- [ ] Remediate high/critical dependency vulnerabilities reported in package audit logs using `npm audit fix`.
- [ ] Extend the blocking `dependency-audit` matrix in `.gitea/workflows/security.yml` to every package this scan audits; it currently gates four of 12.
- [ ] Enforce automated secret scanning with Gitleaks / Trivy in pre-commit hooks and PR builds.
- [ ] Implement automated Trivy IaC static analysis for Terraform (`platform/terraform`) and K8s (`platform/k8s`).

### Phase 3: Advanced Governance & Monitoring (Medium-Term)
- [ ] Enable Renovate automated security update pull requests.
- [ ] Configure dynamic application security testing (DAST) for staging environment endpoints.
- [ ] Establish periodic automated dependency license compliance and vulnerability reports.

---

*Note: This file is automatically generated and updated by `scripts/security-scan.sh` and `.gitea/workflows/security.yml`.*
