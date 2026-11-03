# Risk register

First assessment 2026-11-03. Reassess yearly and when a new system or data
type arrives. SOC 2: CC3.1–CC3.4. Likelihood and impact are 1 (low) to 3
(high); score is their product.

| ID | Risk | L | I | Score | Treatment | Owner | Status |
|---|---|---|---|---|---|---|---|
| R1 | An agent (bad prompt, poisoned input, leaked token) changes the rules for every later agent or exfiltrates secrets | 2 | 3 | 6 | Mitigate: CODEOWNERS on the control plane, the ruleset, Environments for secrets (`docs/security/agent-hardening.md`) | Owner | Partly done; ruleset and secret moves are owner steps |
| R2 | A secret leaks into the public repository or a log | 2 | 3 | 6 | Mitigate: secret scans (`compliance_scan.py`, `actions-secret-leak-check`), push protection, rotate on leak | Owner | Push protection not evidenced |
| R3 | A defective or malicious change merges without a human reviewer | 2 | 2 | 4 | **Accept** for product code (owner, "Ship without review ceremony"); mitigate with CI, bot cross-review and fixing forward | Owner | Accepted 2026-11-03 pending owner sign-off |
| R4 | The owner's account is taken over (GitHub, Cloudflare, email) | 1 | 3 | 3 | Mitigate: MFA, password manager (`access-control.md`) | Owner | Not evidenced |
| R5 | Personal data in the inbox is exposed (token leak, Worker bug) | 1 | 3 | 3 | Mitigate: token-gated reads with a constant-time compare, 404 when unset, 90-day retention, never committed | Agents | Done |
| R6 | A published package is tampered with (supply chain) | 1 | 3 | 3 | Mitigate: pinned actions (`pinned-actions-check-ci.yml`), publish only from `main` in the `publish` Environment, provenance where the registry offers it | Agents/owner | Partly done |
| R7 | A tool gives wrong advice someone relies on | 2 | 2 | 4 | Mitigate: disclaimers enforced by `platform/pages/check.mjs`, tests, published assumptions | Agents | Done |
| R8 | Privacy copy says something the code does not do | 1 | 2 | 2 | Mitigate: copy generated from the same switches as the code (`platform/pages/build.mjs`), `platform/privacy/` tests | Agents | Done |
| R9 | The site goes down (Cloudflare free-plan limit, account problem) | 2 | 1 | 2 | Accept (no SLA) and mitigate with the GitHub Pages fallback (`business-continuity.md`) | Agents | Done |
| R10 | A free CI or hosting quota is exhausted, or an unattended job spends money | 2 | 2 | 4 | Mitigate: no paid unattended jobs without owner approval; schedules off by default (`actions-schedule-check-ci.yml`) | Agents | Done |
| R11 | Fork PRs or strangers' text steer an agent (prompt injection) | 2 | 2 | 4 | Mitigate: fork PRs never run or merged; inbox and feedback screened and treated as data (`platform/edge/read-inbox.mjs`) | Agents | Done |
