# Access control policy

| | |
| --- | --- |
| Applies to | Maris Stella Labs LLC: every product in this repository and the accounts that run them |
| Owner | The company owner (the only employee) |
| Reviewed | 2026-11-24 · next review by 2027-05-24, or when someone gets access |

The company has one person. Work is also done by AI coding agents (Claude Code sessions) that the
owner starts. This policy is written for that, not for a team.

## 1. Who can access what

| Who | Production data | Infrastructure accounts | Source code |
| --- | --- | --- | --- |
| Owner | Only for support the customer asked for, security, or legal duties (§4) | Yes | Yes |
| AI agents (cloud sessions) | **No.** Sessions get the repository and the network the owner allows; no production credentials are given to them | No | Read/write through the GitHub App, scoped to this repository |
| GitHub Actions workflows | Deploy, migrations, nightly backup, monitoring: only through the secrets listed in `docs/security/secrets-inventory.yaml`, only in the jobs that need them | Through scoped API tokens | Read (`contents: read`) |
| Customers | Their own organization's data, by role | No | No |

Evidence: workflow permissions in `.github/workflows/*.yml` (`permissions:` blocks, secrets passed only
to the step that calls Cloudflare in `grants-backup.yml`); secret inventory in
`docs/security/secrets-inventory.yaml`.

## 2. Accounts

- Every infrastructure account (GitHub, Cloudflare, Anthropic, Paddle, email provider, domain
  registrar, the email inbox that receives their resets) has **MFA on**. *(Owner to confirm:
  OWNER-CONFIRM.md §1.)*
- No shared logins. API access uses tokens, not passwords, each scoped to what it does
  (`apps/grants/docs/DEPLOY.md`, "API token") and with an expiry where the provider allows one.
- No Global API Key for Cloudflare (`secrets-inventory.yaml`, owner action on `CLOUDFLARE_API_KEY`).
- Credentials live in GitHub secrets, Worker secrets or a password manager. Never in the repository
  (CLAUDE.md, root `.gitignore`), never in chat or tickets.

## 3. Customer access inside the products

- Tenant isolation: every query on a tenant table filters by the caller's organization
  (`c.var.tenant.orgId`); R2 keys start with `orgs/{orgId}/`; Vectorize uses one namespace per org
  (CLAUDE.md, `apps/grants/docs/DATA_POLICY.md`). Each router has a cross-tenant test
  (`apps/grants/test/worker/tenant.test.ts`, `apps/seller-books/test/worker/books.test.ts`).
- Roles per organization: grants `owner, admin, editor, reviewer, viewer`
  (`apps/grants/src/shared/enums.ts`); seller-books `owner, admin, editor, viewer`.
- Passwords: minimum 10 characters, PBKDF2-SHA-256 with 100,000 iterations and a random salt
  (`src/worker/services/auth/password.ts` in both apps). Sessions last 14 days.
- Grants requires a verified email in production (`requiresEmailVerification`,
  `apps/grants/src/worker/services/auth/auth.ts`). Seller Books does not yet.
- **No MFA for customer accounts yet** in either product. Said so on the trust pages.

## 4. Staff access to customer data

- Default: none. The owner looks at a customer's data only (a) when the customer asks for help with
  a specific problem, (b) to investigate a security incident, or (c) when the law requires it
  (`apps/grants/docs/legal/data-use.md`, "Who can see your data").
- Use the narrowest tool: a single SQL query by id, not a full export. Full dumps only for a restore
  drill or an incident, kept outside the repository and deleted afterwards
  (`apps/grants/docs/RUNBOOK.md` §12, rules).
- The grants admin console (`/api/admin/*`) requires a platform admin email
  (`PLATFORM_ADMIN_EMAILS`) and, when configured, Cloudflare Access in front
  (`apps/grants/docs/AUTH.md`). *(Whether Access is configured: OWNER-CONFIRM.md §5.)*
- Consequential actions write the `audit_log` (grants).

## 5. Joining, leaving, reviewing

- Adding a person or contractor: give the narrowest role, MFA required, record it in
  OWNER-CONFIRM.md §3. Remove access the day the work ends.
- Every six months: list GitHub collaborators and apps, Cloudflare members and tokens, Paddle and
  Anthropic users; remove what is not used. Rotate anything that was shared.
- A leaked or suspected credential: follow the incident response policy and
  `apps/grants/docs/RUNBOOK.md` §8 (rotation steps per secret).
