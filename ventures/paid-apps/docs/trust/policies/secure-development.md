# Secure development policy

| | |
| --- | --- |
| Applies to | All code in this repository, written by the owner or by AI agents |
| Owner | The company owner |
| Reviewed | 2026-11-24 · next review by 2027-05-24 |

The binding engineering rules are in the root `CLAUDE.md` and each app's `docs/ARCHITECTURE.md`;
agents load them automatically. This policy lists the security-relevant ones and the gaps.

## 1. Rules every change follows

- **Tenant safety**: every query on a tenant table filters by `c.var.tenant.orgId`; R2 keys start with
  `orgs/{orgId}/`; each router has a cross-tenant test (CLAUDE.md).
- **No secrets in code** or in `wrangler.jsonc` `vars`; secrets go to GitHub/Worker secrets and are
  listed in `docs/security/secrets-inventory.yaml`.
- **No customer content in logs**, queue messages or audit metadata (`apps/grants/docs/DATA_POLICY.md`).
- **Security headers** on every response: CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, and an Origin
  check on state-changing requests (`apps/grants/src/worker/middleware/security.ts`; same in
  seller-books).
- **Untrusted input**: request size limits and schema validation (`middleware/request-limits.ts`,
  `validate`), rate limits on auth, LLM, upload and newsletter endpoints (`wrangler.jsonc`
  `ratelimits`), SSRF guards on outbound URLs (`assertSafeUrl`, `docs/INTEGRATIONS.md`).
- **LLM safety**: all calls go through `ctx.llm` with a purpose; drafts may assert only facts from the
  fact base, checked by an independent grounding verifier (`apps/grants/docs/adr/0004`, `0005`);
  per-org and global spend caps and a kill switch (`docs/OPERATIONS.md`).
- **No new dependencies** without the owner's say-so (CLAUDE.md). Installs use `--frozen-lockfile`.
- **TypeScript strict, no `any`** (Biome `noExplicitAny: error`, root `biome.json`).

## 2. Checks that run

On every PR (`.github/workflows/grants-ci.yml`, `seller-books-ci.yml`): Biome lint, typecheck, unit
tests, worker integration tests in workerd with fake externals, build, migration drift check, fake-LLM
evals, Playwright e2e. CI jobs get `contents: read` and no secrets.

## 3. Gaps (on the trust pages as "not in place")

| Gap | Plan |
| --- | --- |
| No automated dependency vulnerability scanning | Turn on Dependabot alerts (a setting, no code); consider `pnpm audit` in CI |
| No secret scanning in CI | Turn on GitHub secret scanning and push protection (setting) |
| GitHub Actions pinned by tag (`@v4`), not by commit SHA | Pin to SHAs in a workflow PR |
| No customer MFA | Better Auth two-factor plugin: a product decision |
| No external penetration test | Not planned until revenue justifies it; the vulnerability disclosure policy invites reports |

## 4. Agents

- Agents get the repository and the network the owner allows; no production credentials.
- In the shared checkout, agents do not commit, push, stash or reset; in their own sessions they commit
  only their own files to their task branch (CLAUDE.md).
- Agents' PRs go through the same checks as the owner's. Security-sensitive changes (change management
  policy §3) also get the owner's own read.
