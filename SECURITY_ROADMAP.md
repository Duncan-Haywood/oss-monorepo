# Security Roadmap & Vulnerability Log

> **Automated Security Scanning & Governance Status**
> - **Last Scan Execution**: `2026-07-29 13:09:42 UTC`
> - **CI Pipeline Scanner**: Enabled (`.github/workflows/security-scan.yml`)
> - **Policy Enforcement**: Block PR merges on Critical/High vulnerabilities; track all findings in this roadmap.

---

## Executive Summary & Vulnerability Dashboard

| Severity | Active Issues | Target SLA | Mitigation Priority |
| :--- | :--- | :--- | :--- |
| 🚨 **CRITICAL** | **2** | Immediate (24h) | Block Release |
| ⚠️ **HIGH** | **67** | 7 Days | Sprint Backlog |
| 🟡 **MEDIUM** | **8** | 30 Days | Scheduled Update |
| 🔵 **LOW** | **1** | 90 Days | Maintenance Window |

---

## Active Security Findings & Problem Log

| Component / File | Package / Target | Severity | Range | Issue / Vulnerability | Recommended Fix | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ventures/real-estate-agent-photo-app/research | `@next/eslint-plugin-next` | **HIGH** | 14.0.5-canary.0 - 15.0.0-rc.1 | glob | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `@typescript-eslint/parser` | **HIGH** | 6.16.0 - 7.5.0 | @typescript-eslint/typescript-estree | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `@typescript-eslint/typescript-estree` | **HIGH** | 6.16.0 - 7.5.0 | minimatch | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `brace-expansion` | **HIGH** | <=5.0.7 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `eslint-config-next` | **HIGH** | 14.0.5-canary.0 - 15.0.0-rc.1 | @next/eslint-plugin-next | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `glob` | **HIGH** | 10.2.0 - 10.4.5 | glob CLI: Command injection via -c/--cmd executes matches with shell:true | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `js-yaml` | **HIGH** | 4.0.0 - 4.2.0 | js-yaml: YAML merge-key chains can force quadratic CPU consumption | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `minimatch` | **HIGH** | 9.0.0 - 9.0.6 | minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern, minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments, minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `next` | **HIGH** | 9.3.4-canary.0 - 16.3.0-canary.5 | Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns configuration, Next.js HTTP request deserialization can lead to DoS when using insecure React Server Components, Next.js: HTTP request smuggling in rewrites, Next.js: Unbounded next/image disk cache growth can exhaust storage, Next.js has a Denial of Service with Server Components, Next.js Vulnerable to Denial of Service with Server Components, Next.js's Middleware / Proxy redirects can be cache-poisoned, Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces, Next.js vulnerable to cache poisoning via collisions in React Server Component cache-busting, Next.js has cross-site scripting in beforeInteractive scripts with untrusted input, Next.js has a Denial of Service in the Image Optimization API, Next.js vulnerable to server-side request forgery in applications using WebSocket upgrades, Next.js vulnerable to cache poisoning in React Server Component responses, Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n, Next.js: Denial of Service in App Router using Server Actions, Next.js: Server-Side Request Forgery in Server Actions on custom servers, Next.js: Cache confusion of response bodies for requests with bodies, Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences, Next.js: Unbounded Server Action payload in Edge runtime, Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname, Next.js: Unauthenticated disclosure of internal Server Function endpoints, postcss | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/research | `postcss` | **HIGH** | <=8.5.17 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/pipeline | `sharp` | **HIGH** | <0.35.0 | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | Upgrade sharp@0.35.3 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `@next/eslint-plugin-next` | **HIGH** | 14.0.5-canary.0 - 15.0.0-rc.1 | glob | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `@typescript-eslint/parser` | **HIGH** | 6.16.0 - 7.5.0 | @typescript-eslint/typescript-estree | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `@typescript-eslint/typescript-estree` | **HIGH** | 6.16.0 - 7.5.0 | minimatch | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `brace-expansion` | **HIGH** | <=5.0.7 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `esbuild` | **MODERATE** | <=0.24.2 | esbuild enables any website to send any requests to the development server and read the response | Upgrade wrangler@4.115.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `eslint-config-next` | **HIGH** | 14.0.5-canary.0 - 15.0.0-rc.1 | @next/eslint-plugin-next | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `glob` | **HIGH** | 10.2.0 - 10.4.5 | glob CLI: Command injection via -c/--cmd executes matches with shell:true | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `js-yaml` | **HIGH** | 4.0.0 - 4.2.0 | js-yaml: YAML merge-key chains can force quadratic CPU consumption | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `miniflare` | **MODERATE** | <=0.0.0-fff677e35 || 0.20230628.0 - 0.20230908.0 || 2.0.0-next.1 - 4.20260518.0 | undici, ws | Upgrade wrangler@4.115.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `minimatch` | **HIGH** | 9.0.0 - 9.0.6 | minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern, minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments, minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions | npm audit fix | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `next` | **HIGH** | 9.3.4-canary.0 - 16.3.0-canary.5 | Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns configuration, Next.js HTTP request deserialization can lead to DoS when using insecure React Server Components, Next.js: HTTP request smuggling in rewrites, Next.js: Unbounded next/image disk cache growth can exhaust storage, Next.js has a Denial of Service with Server Components, Next.js Vulnerable to Denial of Service with Server Components, Next.js's Middleware / Proxy redirects can be cache-poisoned, Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces, Next.js vulnerable to cache poisoning via collisions in React Server Component cache-busting, Next.js has cross-site scripting in beforeInteractive scripts with untrusted input, Next.js has a Denial of Service in the Image Optimization API, Next.js vulnerable to server-side request forgery in applications using WebSocket upgrades, Next.js vulnerable to cache poisoning in React Server Component responses, Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n, Next.js: Denial of Service in App Router using Server Actions, Next.js: Server-Side Request Forgery in Server Actions on custom servers, Next.js: Cache confusion of response bodies for requests with bodies, Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences, Next.js: Unbounded Server Action payload in Edge runtime, Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname, Next.js: Unauthenticated disclosure of internal Server Function endpoints, postcss | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `postcss` | **HIGH** | <=8.5.17 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `sharp` | **HIGH** | <0.35.0 | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | Upgrade wrangler@4.115.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `undici` | **HIGH** | <=6.26.0 | Undici has an unbounded decompression chain in HTTP responses on Node.js Fetch API via Content-Encoding leads to resource exhaustion, Undici has an HTTP Request/Response Smuggling issue, Undici has Unbounded Memory Consumption in WebSocket permessage-deflate Decompression, Undici has Unhandled Exception in WebSocket Client Due to Invalid server_max_window_bits Validation, Undici has CRLF Injection in undici via `upgrade` option, undici vulnerable to HTTP header injection via Set-Cookie percent-decoding, undici WebSocket client vulnerable to denial of service via fragment count bypass, undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse, undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching | Upgrade wrangler@4.115.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `wrangler` | **HIGH** | <=4.24.3 | esbuild, miniflare, sharp | Upgrade wrangler@4.115.0 | [ ] Scheduled |
| ventures/real-estate-agent-photo-app/docs-site | `ws` | **HIGH** | 8.0.0 - 8.20.1 | ws: Uninitialized memory disclosure, ws: Memory exhaustion DoS from tiny fragments and data chunks | Upgrade wrangler@4.115.0 | [ ] Scheduled |
| ventures/local-site-studio | `brace-expansion` | **HIGH** | <=5.0.7 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | npm audit fix | [ ] Scheduled |
| ventures/local-site-studio | `next` | **HIGH** | 9.3.4-canary.0 - 16.3.0-preview.7 | Next.js: Middleware / Proxy bypass in App Router applications using Turbopack and single locale, Next.js: Denial of Service in App Router using Server Actions, Next.js: Server-Side Request Forgery in Server Actions on custom servers, Next.js: Cache confusion of response bodies for requests with bodies, Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences, Next.js: Unbounded Server Action payload in Edge runtime, Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname, Next.js: Denial of Service in the Image Optimization API using SVGs, Next.js: Unauthenticated disclosure of internal Server Function endpoints, postcss, sharp | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/local-site-studio | `postcss` | **HIGH** | <=8.5.17 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/local-site-studio | `sharp` | **HIGH** | <0.35.0 | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/quick-pick-survey | `@eslint/config-array` | **HIGH** | <=0.22.0 | minimatch | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/quick-pick-survey | `@eslint/eslintrc` | **HIGH** | 0.0.1 || >=0.1.1 | minimatch | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/quick-pick-survey | `brace-expansion` | **HIGH** | <=5.0.7 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/quick-pick-survey | `eslint` | **HIGH** | 0.12.0 - 2.0.0-rc.1 || 4.1.0 - 10.0.0-rc.2 | @eslint/config-array, @eslint/eslintrc, minimatch | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/quick-pick-survey | `eslint-config-next` | **HIGH** | >=10.2.1-canary.2 | eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react | Upgrade eslint-config-next@12.0.4 | [ ] Scheduled |
| ventures/quick-pick-survey | `eslint-plugin-import` | **HIGH** | >=1.15.0 | minimatch | Upgrade eslint-config-next@12.0.4 | [ ] Scheduled |
| ventures/quick-pick-survey | `eslint-plugin-jsx-a11y` | **HIGH** | >=6.5.0 | minimatch | Upgrade eslint-config-next@12.0.4 | [ ] Scheduled |
| ventures/quick-pick-survey | `eslint-plugin-react` | **HIGH** | >=7.23.0 | minimatch | npm audit fix | [ ] Scheduled |
| ventures/quick-pick-survey | `minimatch` | **HIGH** | 2.0.0 - 10.0.2 | brace-expansion | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `fbjs` | **HIGH** | 0.7.0 - 1.0.0 | isomorphic-fetch | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `form-data` | **CRITICAL** | <=2.5.5 | form-data uses unsafe random function in form-data for choosing boundary, form-data: CRLF injection in form-data via unescaped multipart field names and filenames | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `htmltojsx` | **HIGH** | >=0.2.3-dev | jsdom-no-contextify, react, react-dom, yargs | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `isomorphic-fetch` | **HIGH** | 2.0.0 - 2.2.1 | node-fetch | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `jsdom-no-contextify` | **MODERATE** | * | request | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `next` | **HIGH** | 9.3.4-canary.0 - 16.3.0-preview.7 | Next.js: Denial of Service in App Router using Server Actions, Next.js: Server-Side Request Forgery in Server Actions on custom servers, Next.js: Cache confusion of response bodies for requests with bodies, Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences, Next.js: Unbounded Server Action payload in Edge runtime, Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname, Next.js: Denial of Service in the Image Optimization API using SVGs, Next.js: Unauthenticated disclosure of internal Server Function endpoints, postcss, sharp | npm audit fix | [ ] Scheduled |
| ventures/photo-editing/docs-site | `node-fetch` | **HIGH** | <2.6.7 | node-fetch forwards secure headers to untrusted sites | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `postcss` | **HIGH** | <=8.5.17 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | npm audit fix | [ ] Scheduled |
| ventures/photo-editing/docs-site | `qs` | **MODERATE** | <6.14.1 | qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `react` | **HIGH** | 0.15.0-alpha.1 - 16.4.2 | fbjs | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `react-dom` | **HIGH** | 0.15.0-alpha.1 - 16.4.2 | fbjs, react | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `request` | **CRITICAL** | * | Server-Side Request Forgery in Request, form-data, qs, tough-cookie, uuid | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `sharp` | **HIGH** | <0.35.0 | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | npm audit fix | [ ] Scheduled |
| ventures/photo-editing/docs-site | `tough-cookie` | **MODERATE** | <4.1.3 | tough-cookie Prototype Pollution vulnerability | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `uuid` | **MODERATE** | <11.1.1 | uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `yargs` | **MODERATE** | 4.0.0-alpha1 - 7.0.0-alpha.3 || 7.1.1 | yargs-parser | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/photo-editing/docs-site | `yargs-parser` | **MODERATE** | <=5.0.0 | yargs-parser Vulnerable to Prototype Pollution | Upgrade htmltojsx@0.2.2 | [ ] Scheduled |
| ventures/ai-first-markets | `@eslint/config-array` | **HIGH** | <=0.22.0 | minimatch | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/ai-first-markets | `@eslint/eslintrc` | **HIGH** | 0.0.1 || >=0.1.1 | minimatch | Upgrade @eslint/eslintrc@0.1.0 | [ ] Scheduled |
| ventures/ai-first-markets | `@node-minify/core` | **HIGH** | <=5.3.0 || 8.0.6 || 9.0.1 - 9.0.2 | glob | Upgrade @opennextjs/cloudflare@0.2.1 | [ ] Scheduled |
| ventures/ai-first-markets | `@opennextjs/aws` | **HIGH** | * | @node-minify/core | Upgrade @opennextjs/cloudflare@0.2.1 | [ ] Scheduled |
| ventures/ai-first-markets | `@opennextjs/cloudflare` | **HIGH** | >=0.3.0 | @opennextjs/aws | Upgrade @opennextjs/cloudflare@0.2.1 | [ ] Scheduled |
| ventures/ai-first-markets | `brace-expansion` | **HIGH** | <=5.0.7 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | Upgrade @eslint/eslintrc@0.1.0 | [ ] Scheduled |
| ventures/ai-first-markets | `eslint` | **HIGH** | 0.12.0 - 2.0.0-rc.1 || 4.1.0 - 10.0.0-rc.2 | @eslint/config-array, @eslint/eslintrc, minimatch | Upgrade eslint@10.8.0 | [ ] Scheduled |
| ventures/ai-first-markets | `eslint-config-next` | **HIGH** | >=10.2.1-canary.2 | eslint, eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react | Upgrade eslint-config-next@0.2.4 | [ ] Scheduled |
| ventures/ai-first-markets | `eslint-plugin-import` | **HIGH** | >=1.15.0 | minimatch | Upgrade eslint-config-next@0.2.4 | [ ] Scheduled |
| ventures/ai-first-markets | `eslint-plugin-jsx-a11y` | **HIGH** | >=6.5.0 | minimatch | Upgrade eslint-config-next@0.2.4 | [ ] Scheduled |
| ventures/ai-first-markets | `eslint-plugin-react` | **HIGH** | >=7.23.0 | minimatch | npm audit fix | [ ] Scheduled |
| ventures/ai-first-markets | `glob` | **HIGH** | 4.3.0 - 10.5.0 | minimatch | Upgrade @opennextjs/cloudflare@0.2.1 | [ ] Scheduled |
| ventures/ai-first-markets | `minimatch` | **HIGH** | 2.0.0 - 10.0.2 | brace-expansion | Upgrade @eslint/eslintrc@0.1.0 | [ ] Scheduled |
| ventures/print-atelier | `@next/eslint-plugin-next` | **HIGH** | 14.0.5-canary.0 - 15.0.0-rc.1 | glob | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/print-atelier | `brace-expansion` | **HIGH** | <=5.0.7 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups, brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | npm audit fix | [ ] Scheduled |
| ventures/print-atelier | `esbuild` | **LOW** | 0.27.3 - 0.28.0 | esbuild allows arbitrary file read when running the development server on Windows | npm audit fix | [ ] Scheduled |
| ventures/print-atelier | `eslint-config-next` | **HIGH** | 14.0.5-canary.0 - 15.0.0-rc.1 | @next/eslint-plugin-next | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/print-atelier | `glob` | **HIGH** | 10.2.0 - 10.4.5 | glob CLI: Command injection via -c/--cmd executes matches with shell:true | Upgrade eslint-config-next@16.2.12 | [ ] Scheduled |
| ventures/print-atelier | `js-yaml` | **HIGH** | 4.0.0 - 4.2.0 | js-yaml: YAML merge-key chains can force quadratic CPU consumption | npm audit fix | [ ] Scheduled |
| ventures/print-atelier | `next` | **HIGH** | 9.3.4-canary.0 - 16.3.0-canary.5 | Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns configuration, Next.js HTTP request deserialization can lead to DoS when using insecure React Server Components, Next.js: HTTP request smuggling in rewrites, Next.js: Unbounded next/image disk cache growth can exhaust storage, Next.js has a Denial of Service with Server Components, Next.js Vulnerable to Denial of Service with Server Components, Next.js's Middleware / Proxy redirects can be cache-poisoned, Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces, Next.js vulnerable to cache poisoning via collisions in React Server Component cache-busting, Next.js has cross-site scripting in beforeInteractive scripts with untrusted input, Next.js has a Denial of Service in the Image Optimization API, Next.js vulnerable to server-side request forgery in applications using WebSocket upgrades, Next.js vulnerable to cache poisoning in React Server Component responses, Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n, Next.js: Denial of Service in App Router using Server Actions, Next.js: Server-Side Request Forgery in Server Actions on custom servers, Next.js: Cache confusion of response bodies for requests with bodies, Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences, Next.js: Unbounded Server Action payload in Edge runtime, Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname, Next.js: Unauthenticated disclosure of internal Server Function endpoints, postcss | Upgrade next@16.2.12 | [ ] Scheduled |
| ventures/print-atelier | `postcss` | **HIGH** | <=8.5.17 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output, PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments, PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | Upgrade next@16.2.12 | [ ] Scheduled |

---

## Security Hardening Roadmap & Action Items

### Phase 1: High-Priority Baseline Hardening (Current Sprint)
- [x] Enforce least-privilege permissions (`permissions: contents: read`) across all GitHub Actions workflows.
- [x] Configure non-root unprivileged container users in application Dockerfiles.
- [x] Harden `.gitignore` to prevent credential, token, and SSH/TLS private key accidental check-ins.
- [x] Implement automated CI security scanning workflow (`.github/workflows/security-scan.yml`).

### Phase 2: Dependency & Infrastructure Remediation (Short-Term)
- [ ] Remediate high/critical dependency vulnerabilities reported in package audit logs using `npm audit fix`.
- [ ] Enforce automated secret scanning with Gitleaks / Trivy in pre-commit hooks and PR builds.
- [ ] Implement automated Trivy IaC static analysis for Terraform (`platform/terraform`) and K8s (`platform/k8s`).

### Phase 3: Advanced Governance & Monitoring (Medium-Term)
- [ ] Enable GitHub Dependabot automated security update pull requests.
- [ ] Configure dynamic application security testing (DAST) for staging environment endpoints.
- [ ] Establish periodic automated dependency license compliance and vulnerability reports.

---

*Note: This file is automatically generated and updated by `scripts/security-scan.sh` and `.github/workflows/security-scan.yml`.*
