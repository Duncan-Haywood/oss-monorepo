# Owner to confirm

Things the trust documents depend on that the repository cannot show: account settings, dashboards,
who has access, what actually runs. None of them is stated as fact anywhere in `docs/trust/` or on a
trust page. Each one shows as **Being confirmed** (`owner_to_confirm`) until you check it.

How to close an item: check it, tick it, write the date and what you saw (e.g. "2026-12-01: MFA on,
TOTP + passkey"). If an item turns out **false**, do not tick it: change the claim to `not_in_place` in
the product profile (`packages/trust-page/src/profiles/`) and fix the policy text. Then flip the
profile claim's status to `in_place` (or `partial`) in the same PR as the tick.

Every item here is something an agent cannot do from the repository. Nothing in this list has been
submitted anywhere.

## 1. Your accounts (every product)

Access control policy §2 says every account below has MFA. That sentence is a promise until these
are ticked.

- [ ] **GitHub** (`duncan-haywood`): two-factor on; recovery codes stored offline. Note the method.
- [ ] **Cloudflare**: two-factor on for the login; list who else is a member of the account (expected: nobody).
- [ ] **Anthropic Console**: MFA or SSO on; workspace spend limit set (`docs/security/secrets-inventory.yaml` asks for one).
- [ ] **Paddle**: two-factor on; who else has access.
- [ ] **Resend** (if still used): two-factor on, or the account closed (`apps/grants/docs/EMAIL.md`, "Switching over", step 5).
- [ ] **Google Cloud** (OAuth client, if Google sign-in is on): two-factor on.
- [ ] **Domain registrar** for `marisstella.app`: two-factor on, registrar lock on, auto-renew on.
- [ ] **Email account** that receives password resets for all of the above: two-factor on.
- [ ] **Password manager** in use for every credential that is not in GitHub secrets.

## 2. Devices

- [ ] Laptop(s) used to administer the above: full-disk encryption on, screen lock on, OS updates
  automatic, a supported OS version.
- [ ] Phone used for MFA: passcode on, OS updates automatic.
- [ ] Laptop: OS firewall on; anti-malware on with automatic updates (built-in is fine); autorun of removable media off (CIS 4.5, 10.1–10.3).
- [ ] Browser: a supported, auto-updating browser (CIS 9.1).
- [ ] No production credentials stored in plain files on the laptop (Wrangler login is fine; `.dev.vars` holds local values only).

## 3. Who has access

- [ ] GitHub `duncan-haywood/private-monorepo`: list of collaborators and their roles (expected: owner only, plus the Claude GitHub App).
- [ ] GitHub Apps / OAuth apps with access to the repository: list and keep only what is used.
- [ ] Cloudflare API tokens: list them; each has an expiry and only the `DEPLOY.md` permissions; no Global API Key stored (`secrets-inventory.yaml`, `CLOUDFLARE_API_KEY` / `CF_API_KEY` entries).
- [ ] Which of the six Cloudflare token spellings in GitHub secrets actually holds the value; delete the rest (`secrets-inventory.yaml`).
- [ ] `PLATFORM_ADMIN_EMAILS` in production lists only you.

## 4. GitHub repository settings (change management, secure development)

- [ ] Branch protection or a ruleset on `main`: pull request required; `grants-ci` / `seller-books-ci` required to pass; force-push and deletion blocked. (Change management policy §2 depends on this; until ticked the trust pages say "being confirmed".)
- [ ] Whether you allow agents to merge their own PRs (the current practice) and under what condition (checks green). Write it down in change-management.md §3 if it differs.
- [ ] GitHub `production` environment: required reviewers or a wait timer? (`grants-deploy.yml` runs in it; `DEPLOY.md` says "after approval if the environment requires it".)
- [ ] Secret scanning and push protection on for the repository (GitHub settings ▸ Code security).
- [ ] Dependabot alerts on (settings only; this PR adds no Dependabot config file).

## 5. Cloudflare settings and what actually runs

- [ ] Cloudflare plan is **Workers Paid** (D1 Time Travel 30 days depends on it; `apps/grants/docs/RUNBOOK.md` §12).
- [ ] Region of D1 `grant-autopilot` and R2 `grant-autopilot-files` (dashboard shows the location). Nothing in `wrangler.jsonc` pins one.
- [ ] `grants-backup` runs are green and their summary shows `uploaded` and `retention` (needs the two Cloudflare secrets; otherwise the job skips with a notice).
- [ ] A dedicated backup bucket (`GRANTS_BACKUP_BUCKET`) with the 45-day lifecycle rule, or the decision to keep backups in `grant-autopilot-files` (RUNBOOK §12 recommends the dedicated bucket).
- [ ] The monthly restore drill has been run at least once; date and result in the incident log.
- [ ] Turnstile on in production (`TURNSTILE_SECRET_KEY` set).
- [ ] Cloudflare Access configured for `/api/admin` (`CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` set); Access login method has MFA.
- [ ] `EMAIL_PROVIDER` value in production and whether `RESEND_API_KEY` is still set (decides whether Resend is a live subprocessor).
- [ ] Google sign-in on or off in production (`GOOGLE_CLIENT_ID` set?).
- [ ] Workers Logs retention on your plan (RUNBOOK §9 marks "7 days" as unverified).
- [ ] Notifications: Cloudflare usage/billing alerts and Workers error alerts go to an inbox you read (`apps/grants/docs/MONITORING.md`, "Cloudflare-native monitoring to enable").

## 6. Provider pages (before any provider link goes on a trust page)

The research step could not open these pages (network policy). For each: open it, check what it says
and **what it covers** (a search summary suggested Cloudflare's SOC 2 scope may not include every
product; check that Workers, D1 and R2 are in scope before saying anything about them), then set
`trustUrlCheckedOn` in `packages/trust-page/src/subprocessors.ts`. Never write that a provider's report
covers our products.

- [ ] Cloudflare trust hub: https://www.cloudflare.com/trust-hub/
- [ ] Cloudflare D1 data security (encryption at rest): https://developers.cloudflare.com/d1/platform/data-security/
- [ ] Cloudflare R2 data security: https://developers.cloudflare.com/r2/reference/data-security/
- [ ] Anthropic trust center: https://trust.anthropic.com/; commercial terms on training: https://www.anthropic.com/legal/commercial-terms; API data retention period (not found).
- [ ] Paddle: https://www.paddle.com/legal/soc-2-compliance (do not say "PCI Level 1"; a search result said SAQ A).
- [ ] Resend: https://resend.com/docs/knowledge-base/downloading-documents; DPA https://resend.com/legal/dpa
- [ ] GitHub: https://github.com/security
- [ ] Each provider's DPA is accepted for the account (Cloudflare, Anthropic, Paddle, Resend, GitHub). Usually click-through in the dashboard or incorporated in the terms; note the date and version.

## 7. Contacts and legal

- [ ] **Security contact address** (e.g. `security@marisstella.app` via Email Routing) that you read. Until it exists, `securityContact` stays `null`, no `security.txt` is generated, and the vulnerability disclosure policy has no address. Then set it in each profile.
- [ ] Customer contact email (both `privacy.md` and `data-use.md` say "to be confirmed before launch").
- [ ] **DPA template** (`docs/trust/dpa/`) reviewed by a lawyer before anyone signs it. Choices for the lawyer are listed at the top of that file.
- [ ] Privacy policy and data use policy reviewed by counsel (both are marked "Draft").
- [ ] Breach-notice duties checked with counsel for the states and countries you have customers in (RUNBOOK §9 marks the New Mexico rule "[verify with counsel]").
- [ ] Cyber insurance: yes/no.
- [ ] Whether ProPublica / Grants.gov search terms built from an org's profile count as sharing customer data (subprocessors.md, "Public data sources").

## 8. CSA STAR Level 1 decision

- [ ] Read the CSA terms on the CAIQ download page and confirm the current CAIQ version and the STAR Registry submission rules and fee (docs/trust/caiq/README.md lists what could not be verified).
- [ ] Decide whether to submit. Nothing has been submitted.

## Per product

### `grants` (Grant Autopilot, live)

Status `owner_to_confirm` in `packages/trust-page/src/profiles/grants.ts`:

- [ ] Storage region (section 5).
- [ ] Encryption at rest by Cloudflare: scope confirmed from Cloudflare's docs (section 6).
- [ ] Cloudflare Access on the admin console and Turnstile on sign-in (section 5).
- [ ] D1 Time Travel available (Workers Paid; section 5).
- [ ] Nightly backup runs green; restore drill run (section 5).
- [ ] Branch protection / required checks on `main` (section 4).

### `seller-books` (not yet live)

Status `owner_to_confirm` in `packages/trust-page/src/profiles/seller-books.ts`:

- [ ] Storage region, decided at launch.
- [ ] Encryption at rest scope (section 6).
- [ ] D1 Time Travel on the launch plan.

Before launch (not owner checks, but blockers for an honest page): there is no export / delete-org
endpoint, no email verification and no backup job. The profile says so (`not_in_place`).
