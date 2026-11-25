# Runbook: move the LLM and email APIs to AWS without downtime

The owner, 2026-11-24: "migrate to aws and run the llm api and the email api
through aws one provider instead of managing multiple accounts ... start
setting up for the switch and when ready to do it without downtime we do the
switch. you don't need me unless u need me for a key you can't get
yourself."

- **LLM:** Anthropic first-party API → **Claude Platform on AWS** (the same
  Messages API and model IDs, SigV4, billed on the AWS invoice through AWS
  Marketplace).
- **Email:** Resend and Cloudflare Email Service → **Amazon SES**.
- The code: [`platform/aws/`](../../platform/aws/README.md). The decision:
  [`docs/reports/2026-11-24-cloud-provider-comparison.md`](../reports/2026-11-24-cloud-provider-comparison.md) §7.

Zero downtime comes from one rule: **the old provider keeps working until
the new one has carried all traffic cleanly for a while.** Every phase can be
undone by flipping a variable back.

## Owner checklist

Only the steps that need a card, an identity, a legal acceptance or admin
rights on GitHub. Everything else is done by agents through pull requests.

1. **Create the AWS account** (card, phone, root MFA). Region: us-east-1.
2. **Open AWS CloudShell** in that account (us-east-1) and paste:
   ```sh
   curl -fsSLO https://raw.githubusercontent.com/Duncan-Haywood/oss-monorepo/main/platform/aws/bootstrap/bootstrap.yaml
   aws cloudformation deploy --stack-name github-bootstrap --template-file bootstrap.yaml --capabilities CAPABILITY_NAMED_IAM
   aws sts get-caller-identity --query Account --output text
   ```
   The last line prints the account ID.
3. **Connect GitHub:** (`/platform/aws/` is already in `.github/CODEOWNERS`,
   so the adversarial gate reviews this tree at its strictest tier.) On your computer run
   `bash platform/aws/github/configure.sh <account-id>` (or, by hand: create
   environments `aws-prod` and `aws-llm` limited to the `main` branch and set
   the repository variable `AWS_ACCOUNT_ID`). The next merge under
   `platform/aws/` builds the Organization. **Do not create an Organization or
   enable IAM Identity Center before that apply** (Identity Center needs the
   Organization, and `stacks/org` creates it). If one already exists,
   `aws organizations describe-organization` prints its `Id`; an agent then
   adds `import { to = aws_organizations_organization.this, id = "<Id>" }`
   to `stacks/org` in a PR before the first apply, so the stack adopts it
   instead of failing.
4. **Your console login** (after the first apply has run): in the AWS
   console open *IAM Identity Center*, click *Enable*, add your user with MFA,
   and set the repository variable `AWS_OWNER_SSO_USER` to its user name.
   AWS has no API for enabling Identity Center, so this one is clicks.
5. **Claude Platform on AWS** (this accepts Anthropic's Commercial Terms and
   starts AWS Marketplace billing): from the Identity Center portal open the
   **apps** account, open *Claude Platform on AWS*, sign up, create a
   workspace in **us-east-1**, and set the repository variable
   `CLAUDE_AWS_WORKSPACE_ID` to its `wrkspc_...` ID. In the Claude Console
   set a monthly workspace spend limit.
6. **SES out of the sandbox**, when an agent reports phase 2's email checks
   green: Actions → *AWS apply* → Run workflow, tick *request SES
   production access*. The use-case text is in
   `.github/workflows/priv-aws-apply.yml`; read it first, it speaks for the
   portfolio.
7. **At the end (phase 5):** close the Anthropic first-party account and the
   Resend account, and delete their keys.

Only if the `dns` job reports a permission error: give the Cloudflare token
in the `cloudflare` environment *Zone → DNS → Edit* on marisstella.app.

## Phase 0: account and bootstrap (owner, steps 1 to 3)

**Check:** `aws cloudformation describe-stacks --stack-name github-bootstrap`
shows `CREATE_COMPLETE`; the *AWS plan* workflow's `plan` job now runs on
PRs and the `org` stack plans.
**Rollback:** delete the stack (the state bucket and key are retained).
Nothing serves traffic.

## Phase 1: CI applies the baseline

The first merge after `AWS_ACCOUNT_ID` is set runs *AWS apply*: `org`
(Organization, accounts, SCPs), `baseline` (org CloudTrail, GuardDuty,
Security Hub FSBP and CIS, Config, Access Analyzer, per-account baseline),
`spend` (budgets, freeze actions, the kill switch in dry run), then `llm`,
`email` and `app-identity`, which are harmless before phase 2.

New accounts can take minutes to accept `OrganizationAccountAccessRole`; if
`baseline` fails on the first run with an assume-role error, re-run the job.

**Checks (an agent runs them with the apply role and records the output in
the PR):**
- `aws organizations list-accounts` lists seven accounts.
- The log-archive bucket receives `cloudtrail/AWSLogs/<org-id>/...` objects.
- `aws guardduty list-members` in the security account lists every account.
- Security Hub (security account) shows FSBP and CIS enabled for every
  account; the standard ARNs in `stacks/baseline/variables.tf` match
  `aws securityhub describe-standards`.
- The kill switch's dry run (`stacks/spend/README.md`) logs the right
  actions for the sandbox account; then set `AWS_KILL_SWITCH_LIVE=true`.
- No `AccessDenied` from the region-deny SCP for a global service in
  CloudTrail.

**Rollback:** revert the PR; `tofu apply` puts the previous state back.
Accounts are `prevent_destroy` and are never closed by CI.

## Phase 2: providers ready (owner steps 4 to 6, agents for the rest)

**Email**
- The `dns` job of *AWS apply* writes the DKIM CNAMEs, the MAIL FROM MX and
  SPF on `bounce.` subdomains, and `_dmarc` only if no DMARC record exists.
  It never edits a record it did not create, so Cloudflare Email Routing
  (support@, hello@) is untouched: the apex MX and SPF are not changed.
- **Check:** `aws sesv2 get-email-identity --email-identity marisstella.app`
  in the apps account shows `VerifiedForSendingStatus: true`, DKIM
  `SUCCESS` and MAIL FROM `SUCCESS`; the records match what the SES console
  shows for the identity.
- **Check:** from the apps account, send to SES's mailbox simulator
  (`success@simulator.amazonses.com`, `bounce@simulator.amazonses.com`,
  `complaint@simulator.amazonses.com`) with configuration set
  `transactional`; the bounce and complaint events arrive in the
  `ses-events` SQS queue.
- Agents build the SES adapter behind each product's existing email port
  (`EMAIL_PROVIDER=ses`), reading `ses-events` into the product's
  suppression table and checking it before every send. When that is merged
  and tested, the owner ticks step 6. Production access is per account and
  region; until it is granted SES sends only to verified addresses.

**LLM**
- After owner step 5, the next apply scopes `claude-platform-invoke` to the
  workspace. Outbound web identity federation is already on (`stacks/llm`).
- **Check:** a job assuming `github-llm-gate` (environment `aws-llm`)
  sends one Messages request with `model: claude-opus-5-5` to
  `https://aws-external-anthropic.us-east-1.api.aws/v1/messages` with the
  `anthropic-workspace-id` header and gets HTTP 200. A 403 names the
  missing IAM action or a wrong workspace ID.
- Agents add the `aws` provider to the products' LLM clients
  (`platform/llm/byok.mjs` and Grant Autopilot's `ctx.llm`), using the
  Anthropic SDK's `AnthropicAws` client where it runs, else SigV4 signing.

**Rollback:** nothing uses the new providers yet; there is nothing to undo.

## Phase 3: shadow, then canary

Products read two variables and fail over automatically:

| Variable | Values | On error from the new provider |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` (today), `aws` | retry the same request on `anthropic` (first-party key still present) |
| `EMAIL_PROVIDER` | `resend` / `cloudflare` (today), `ses` | send through the previous provider |
| `LLM_AWS_PERCENT`, `EMAIL_SES_PERCENT` | 0 to 100 | share of requests that try the new provider first |

Failover triggers on network errors, HTTP 5xx, 429 and 403 (a 403 from
Claude Platform on AWS means IAM or workspace trouble, not a bad request);
4xx request errors are returned as they are, since the old provider would
reject them too. Every failover is logged with the provider, status and
request ID so the rate can be counted.

Steps: deploy with `aws`/`ses` at 0% (shadow: code present, unused) →
10% → 50% → 100%, at least a day each, moving on only if:
- LLM: failover rate under 1% and no rise in error rate or p95 latency
  against the first-party baseline;
- email: delivery events normal, bounce and complaint rates well inside the
  limits the SES console shows under *Reputation metrics*, and no
  suppression miss (a send to a suppressed address).

Claude Platform on AWS is a separate Anthropic organization: rate limits,
prompt caches, Files, batches and Managed Agents objects do not carry over
from the first-party organization (platform.claude.com, "Claude Platform on
AWS", read 2026-11-24). Products that keep files or batches there re-create
them on the new side before their share moves.

**Rollback:** set the percentage to 0 or the provider back. Old keys are
still in place, so this is instant.

## Phase 4: flip the defaults

Set `LLM_PROVIDER=aws` and `EMAIL_PROVIDER=ses` at 100% everywhere, with
failover still pointing at the old providers. Keep both old accounts open.

**Check:** a full week with failover count at or near zero, no SES review
notice, AWS budgets under their thresholds.
**Rollback:** flip the variables back.

## Phase 5: retire the old providers

After 14 clean days at 100%:

1. Agents remove the failover paths and the `anthropic`/`resend`/`cloudflare`
   email code from the products, in one PR each.
2. Agents delete `ANTHROPIC_API_KEY` and `RESEND_API_KEY` from GitHub
   secrets and Worker secrets (`wrangler secret delete`), and the
   Cloudflare Email Service sending setup.
3. Owner step 7: close the Anthropic first-party organization's billing and
   the Resend account.
4. When the products themselves run on AWS (task `aws-move-products`),
   delete `platform/aws/stacks/app-identity` and
   `.github/workflows/priv-aws-worker-secret-sync.yml`: the apps then use the
   `app-llm` role and no IAM user is left.

**Rollback** after step 3 means re-opening an account and restoring keys, so
step 3 waits until steps 1 and 2 have run clean for a week.
