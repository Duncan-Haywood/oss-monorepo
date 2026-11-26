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
   If sign-up offers a Free or a Paid plan, pick Paid: the Organization and
   budget actions need the full set of services. Then, still as root
   (about 5 minutes; both are root-only, so they cannot be code):
   - Account → *IAM user and role access to Billing information* →
     Activate, so your Identity Center login (step 4) can see the bill.
   - Billing: if the console offers *Spending limits* (AWS's per-project
     cap, in limited rollout for new accounts since September 2026), set
     one a little above the sum of `monthly_limits_usd` in
     `platform/aws/stacks/spend/variables.tf`. If it is not offered, skip
     it: `stacks/spend` (anomaly alerts, budgets, the freeze SCP, the kill
     switch) does not depend on it.
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
   the repository variable `AWS_ACCOUNT_ID`). Also set the repository
   variable `AWS_BUDGET_ALERT_EMAIL` to where spend alerts should go, then
   click the confirmation link AWS emails after the first apply: without it
   budget and anomaly alerts reach only the SNS topic. (The stack marks the
   address sensitive, so plans and applies do not print it.) The next merge under
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
8. **Move DNS to Route 53** (optional full-exit track only: the default
   [Cloudflare move](#the-cloudflare-move-one-approved-run) keeps DNS on
   Cloudflare and needs none of this step; independent of the LLM and email phases; when
   an agent's PR says `zone_diff.py` prints zero differences and the site
   and edge API serve from AWS). The steps, in
   [`platform/aws/stacks/dns/README.md`](../../platform/aws/stacks/dns/README.md),
   that are yours: give a Cloudflare token with *Zone → Zone → Read* and
   *Zone → DNS → Read* on marisstella.app for the export (its step 1),
   lower TTLs a day ahead (step 4), check DNSSEC and the registrar (step 6:
   **Cloudflare Registrar cannot point at other nameservers**, so transfer
   the domain first, and turn DNSSEC off before moving), then change the
   nameservers (step 7). Only the account holder can mint the token or
   log in to the registrar; a transfer is a paid order in your name.
9. **Retire Cloudflare** (after the `retire-cloudflare` task's PR has
   merged and the nameservers have pointed at Route 53 for a week):
   revoke every Cloudflare API token, delete the `CLOUDFLARE_*` secrets and
   the `cloudflare` environment in GitHub, delete the Workers, cancel
   Workers Paid or any other subscription, then remove the zone and close
   (or leave empty) the account. These are billing actions in your name.
10. **Make the merge gate required** (any time; it matters most before
    the first apply, because merging to main is what applies): with an
    admin token, apply the branch ruleset, which makes six checks required
    on `main` (among them `adversarial-gate`, `security-scan` and
    `risk-review`):
    `gh api -X PUT repos/Duncan-Haywood/oss-monorepo/rulesets/26239454 --input .github/rulesets/main.json`.
    Read [`.github/rulesets/README.md`](../../.github/rulesets/README.md)
    first: it says when to apply it (after agents have their own
    non-admin identities) and how to check it took. Only a repository
    admin can change rulesets, and agents must not hold that power.

Only if the `dns` job reports a permission error: give the Cloudflare token
in the `cloudflare` environment *Zone → DNS → Edit* on marisstella.app.

## The Cloudflare move (one approved run)

The owner, 2026-11-26: "i give full access tokens and it runs once then
expire the tokens", "it's a quick switch over", "secrets etc gets managed in
aws not in gh". The apps and the site move from Cloudflare Workers to AWS in
one owner-approved run of `.github/workflows/priv-cutover.yml`; DNS stays
on Cloudflare (its records are repointed), email keeps its current sender
until SES production access is granted, and any failure rolls back on its
own. Design, stages and checks:
[`platform/aws/cutover/README.md`](../../platform/aws/cutover/README.md).

**Before the day (agents, through PRs; no owner time):** owner steps 1 to 3
above are done, and `github/configure.sh` has been re-run once so the
`cutover-plan` and `cutover` environments exist (the second with you as
required reviewer). The next apply creates the cutover roles
(`stacks/cutover-access`). The site has published to CloudFront for at
least a day (`stacks/site` README, step 4), each app's AWS stack is applied
and its `/healthz` answers, and every paid app that moves has its
`platform/aws/cutover/apps.d/` file. An agent says so in a PR; that is your
cue.

**On the day (about 15 minutes of yours, spread over a morning):**

1. **Make the token** (Cloudflare dashboard → My Profile → API Tokens →
   Create Token → Custom token). Permissions: *Zone → Zone → Read*,
   *Zone → DNS → Edit*, *Zone → Zone WAF → Edit* (the write freeze),
   *Zone → Workers Routes → Read*, *Zone → Email Routing Rules → Read*,
   *Account → Workers Scripts → Edit*, *Account → D1 → Edit*,
   *Account → Workers R2 Storage → Read*, *Account → Cloudflare Pages → Read*,
   *Account → Account Analytics → Read*. Zone resources: *Specific zone →
   marisstella.app*; account resources: your account. **TTL: end date
   tomorrow** (the run refuses a token with no end date, or more than 72 h
   left). If a name differs in the dashboard, pick the closest: the export
   lists anything it could not read rather than failing.
2. **Put it in AWS, not GitHub** (AWS CloudShell, management account,
   us-east-1; `read -rs` keeps it out of the screen and the history):
   ```sh
   read -rs CF && aws secretsmanager create-secret --name cutover/cloudflare-api-token --secret-string "$CF" >/dev/null && unset CF && echo stored
   ```
   Only if an `apps.d` file has a `paddle` block: a Paddle API key with
   notification-settings and simulations permissions (an expiry if
   Paddle's dashboard offers one; otherwise revoke it after the run):
   ```sh
   read -rs PK && aws secretsmanager create-secret --name cutover/paddle-api-key --secret-string "{\"api_key\":\"$PK\",\"environment\":\"live\"}" >/dev/null && unset PK && echo stored
   ```
3. **Run 1, the export** (GitHub → Actions → *Cutover (Cloudflare to AWS)*
   → Run workflow → stages `export`). No approval: it is read-only. An
   agent commits its `cloudflare-export` artifact in a PR and merges it
   once the adopt plan is imports only (usually under an hour).
4. **Run 2, the move**, when that PR has merged: Run workflow → stages
   `prepare switch verify`. Read the *plan* job's summary (what will
   change, app by app), then approve the `cutover` deployment. The run
   takes 15 to 60 minutes (longer only while an ACM certificate waits for
   validation) and deletes the secrets from AWS at the end. Its summary
   says what moved, or what failed and that it was rolled back.

If Run 2 stops, nothing is left half-moved: the failed app is back on
Cloudflare (verify failures put every app back). Make a new token (step 1
and 2; the old secret was deleted), and run `prepare switch verify` again:
it resumes. `rollback` puts everything back by hand at any time until
retire.

**Seven days later (about 10 minutes):** an agent's PR lists in
`platform/aws/cutover/retire.json` the Workers, D1 databases and R2 buckets
that nothing serves any more. Repeat steps 1 and 2 (the same permissions,
with *D1* and *Workers R2 Storage* at *Edit*), then Run workflow → stages
`retire`, approve. It deletes only what that file lists and only if no D1
table changed since its copy. Then cancel Workers Paid, if no Worker is
left (a billing action in your name).

**Calendar, default path:**

| When | Who | What |
|---|---|---|
| any day before | agents | AWS stacks applied, site on CloudFront for 1 day, app health green, `apps.d` complete |
| day 0, morning | owner, 10 min | steps 1 to 3 |
| day 0, within an hour | agent | export PR merged |
| day 0, afternoon | owner, 5 min | step 4 (read the plan summary, approve) |
| when AWS grants SES production access | owner, 1 click | runbook step 6; apps then flip `EMAIL_PROVIDER` (phases 3, 4) on their own clock |
| day 7 | owner, 10 min | retire run |

**Optional: the full exit from Cloudflare** (DNS to Route 53, inbound mail
to SES). External clocks set the pace, so it is a calendar, not a run:

| When | Who | What, and what happens in between |
|---|---|---|
| day −14 | owner | start the registrar transfer of marisstella.app off Cloudflare Registrar (a paid order; it only allows Cloudflare's nameservers). Takes up to 5 to 7 days; a transfer keeps the nameservers, so nothing changes meanwhile |
| day −14 | owner, 1 click | SES production access (step 6) if not already granted; agents ramp SES sending 10% → 50% → 100% over at least 3 days (phase 3), watching bounce and complaint rates |
| day −7 | agents | `stacks/email-ops` inbound ready; `stacks/dns` applied from `cf_export.py`'s records; `route53_track: true` in `apps.json`; `zone_diff.py` zero |
| day −2 | owner | DNSSEC off in Cloudflare if on (`dig +short DS marisstella.app`), then wait for the DS record to leave the registry plus its TTL |
| day −1 | cutover run | lower TTLs (prepare does it for records above 300 s); inbound MX to SES through `extra_records` |
| day 0 | owner | nameservers to Route 53's four (`stacks/dns` README, step 7) |
| day 0 to +2 | agents | verify against public resolvers; Cloudflare's copy stays as the rollback |
| day +7 | owner | retire the zone and close (or empty) the Cloudflare account |

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
