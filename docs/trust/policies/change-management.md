# Change management policy

| | |
| --- | --- |
| Applies to | Code, configuration and infrastructure of every product in this repository |
| Owner | The company owner |
| Reviewed | 2026-11-24 · next review by 2027-05-24 |

Most changes are written by AI coding agents and reviewed through automated checks. This policy is
designed around that.

## 1. Everything is code

- Application code, Worker configuration (`apps/*/wrangler.jsonc`), database migrations
  (`apps/*/migrations/`), CI/CD (`.github/workflows/`) and the email sending domain
  (`apps/grants/email-sending.json`) are in the repository.
- Dashboard-only changes (DNS, Access policies, plan, tokens) are written down in the relevant doc in
  the same week (`apps/grants/docs/DEPLOY.md`, `AUTH.md`).

## 2. How a change reaches production

1. A branch and a **pull request**. Agents work on their own branch; in the shared checkout they do
   not commit at all (CLAUDE.md).
2. **Automated checks** on the PR: `grants-ci.yml` (Biome, typecheck, unit tests, worker integration
   tests in workerd, build, fake-LLM evals, migration drift check, e2e), `seller-books-ci.yml`. Tests
   are required for new logic, including a cross-tenant test per router (CLAUDE.md).
3. **Merge to `main`.** *Branch protection requiring the checks: OWNER-CONFIRM.md §4.*
4. **Deploy**: `grants-deploy.yml` runs on push to `main`; it re-runs lint, typecheck and tests
   unless the owner chooses the quick or hotfix lane by hand (`workflow_dispatch` inputs
   `skip_checks` / `hotfix`), applies D1 migrations, deploys, syncs secrets and smoke-tests
   `/api/health`. Deploys never run concurrently and are never cancelled half-way.

## 3. Who approves

- The owner approves by merging, or by delegating the merge to the agent that opened the PR when its
  checks are green (current practice; *owner to record any further condition: OWNER-CONFIRM.md §4*).
- Changes to authentication, tenancy, billing, deletion, secrets or CI permissions get the owner's own
  read before merge, not only green checks.
- Run `/security-review` or `/code-review` on PRs that touch those areas.

## 4. Database changes

Migrations must be additive and backward compatible (expand, deploy, contract later), because a
Worker rollback does not roll back D1 (`apps/grants/docs/DEPLOY.md`, "Rollback"). Take a Time Travel
bookmark before a risky migration (RUNBOOK §6).

## 5. Emergency changes

The hotfix lane skips checks to ship in about a minute. Use it only to stop an incident. Open a normal
PR with tests for the same change within one working day, and note the hotfix in the incident record.

## 6. Rollback

`wrangler rollback <version-id>` swaps code and vars back (DEPLOY.md, "Rollback"). The lasting fix is a
revert PR through the normal pipeline. Do not roll back to a version from before a secret rotation
(RUNBOOK §8).
