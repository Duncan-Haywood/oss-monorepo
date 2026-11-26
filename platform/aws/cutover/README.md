# platform/aws/cutover: Cloudflare -> AWS in one approved run

The owner, 2026-11-26: "get everyyyything in tf or similar and i give full
access tokens and it runs once then expire the tokens. I think that's the
move." Then, the same day: "i think it's a quick switch over", and "secrets
etc gets managed in aws not in gh". This directory is that pipeline. The
owner's part is a token, two paste-ins in CloudShell and two clicks in
GitHub; the steps and the calendar are in
[`docs/runbooks/aws-cutover.md`](../../../docs/runbooks/aws-cutover.md),
"The Cloudflare move". Nothing here has run against a real account: there is
no AWS account yet.

| Piece | What it is |
|---|---|
| `cutover.py` | The orchestrator: stages, run state, rollback. Standard library only |
| `apps.json`, `apps.d/*.json` | What moves, in order (below) |
| `retire.json` | What the retire stage may delete, filled in by a PR after the cool-off |
| `fakes.py`, `fixtures/` | In-memory Cloudflare, AWS, Paddle, HTTP and OpenTofu for dry runs |
| `test_cutover.py` | 42 tests: the happy path, every rollback, resume, plan mode, secrets |
| `canon_vectors.json` | The copy checksum's test vectors, shared with the Lambda side |
| [`../stacks/cloudflare/`](../stacks/cloudflare/README.md) | The Cloudflare account as OpenTofu: the export's generated config plus `switch.tf` |
| [`../stacks/cutover-access/`](../stacks/cutover-access/) | The two GitHub roles and the member-account roles |
| [`../stacks/saas-starter/runtime/src/data-copy.mjs`](../stacks/saas-starter/runtime/src/data-copy.mjs) | The Postgres half of the D1 copy, inside db-admin |
| [`.github/workflows/priv-cutover.yml`](../../../.github/workflows/priv-cutover.yml) | Manual only; a read-only plan job, then the owner-approved run job |

## The default path, and why it is the default

1. **DNS stays on Cloudflare.** The switch repoints Cloudflare's own records
   at the AWS endpoints (DNS-only CNAMEs to CloudFront or API Gateway;
   Cloudflare flattens the apex). No registrar transfer, no nameserver
   change, no DNSSEC dance: those take days and are owner-only, and
   rollback is one more apply rather than a nameserver change bounded by the
   parent zone's TTL. Moving the zone to Route 53 is the optional
   [full-exit track](#the-optional-full-exit-track).
2. **Email keeps its current sender.** SES production access is a review by
   AWS with no fixed duration; the apps flip `EMAIL_PROVIDER` when it is
   granted (runbook phases 3 and 4), so it never blocks this run. MX and
   Email Routing are untouched (they are in the generated config, and the
   zero-diff checks prove it).
3. **Data**: per app, a short write freeze, a copy, and a count and checksum
   check, then DNS. Today no app has D1 data of ours
   (`docs/reports/2026-11-25-aws-move-products.md`) and there are no paying
   customers, so the freeze lasts seconds; the paid apps that bring D1
   databases add `data` to their `apps.d` file.
4. **Rollback is automatic.** Any failure in an app's switch puts that app
   back; any failure in verify puts every switched app back.

## Stages

Every stage is idempotent. The run state (`cloudflare/cutover-state.json` in
the management account's state bucket) records each finished step, so a
re-run continues where the last stopped. It holds IDs, counts, checksums
and timestamps, never a secret or a row.

| Stage | What it does | Stops (and changes nothing) if |
|---|---|---|
| `export` | Inventories the account (zone, DNS, Workers custom domains and routes, Worker names and binding *types*, Email Routing, R2, D1, Pages, Web Analytics, zone rulesets, the token's expiry); writes `inventory.generated.json` and `imports.generated.tf`; `tofu plan -generate-config-out` writes `resources.generated.tf`. Uploaded as an artifact for a PR | the token has no expiry or expires in more than 72 h; a moved hostname has several address records |
| `prepare` | Proves the account still matches the export; adopts everything into state (a plan that is imports only, then an apply that only writes state); proves `tofu plan` is empty; per app finds the AWS endpoint from AWS itself (CloudFront alias, API Gateway domain), writes missing ACM validation CNAMEs and waits for issue, checks the AWS endpoint's health, lowers TTLs above 300 s, dry-runs the data copy (tables and columns exist in Postgres and are empty), checks the Paddle receiver refuses an unsigned event; reports the SES identity | any of those fails |
| `switch` | Per app, in order: freeze (a Cloudflare custom rule blocking non-GET/HEAD/OPTIONS for the app's hosts) -> copy D1 to Postgres through db-admin -> recount and checksum both sides -> repoint the Paddle notification setting -> `tofu apply` of the switch resources only -> wait until the hostnames answer 200 from AWS -> unfreeze | the TTL wait has not passed; on any later failure the app is rolled back |
| `verify` | Every switched app's health from AWS; a sitemap crawl (up to 100 URLs per host, each 200 from AWS) for apps with `crawl`; a full `tofu plan` is empty; SES identity verified and a send to the mailbox simulator accepted (or "not verified yet", which is not a failure); a Paddle simulated event reaches AWS with a 2xx; with `route53_track`, `zone_diff.py` prints zero | on failure every switched app is rolled back |
| `rollback` | By hand: freeze, DNS back, Paddle back, report rows written on AWS since the copy (to reconcile by hand), unfreeze | |
| `retire` | After `cooloff_days` (7): deletes what `retire.json` lists, only if the plan's deletions are exactly those addresses, no listed Worker still has a route or custom domain, every host points at AWS, and no D1 table has changed since its copy | any check fails |
| `delete-secrets` | `ForceDeleteWithoutRecovery` on `cutover/cloudflare-api-token` and `cutover/paddle-api-key`; the workflow runs it after every run job unless told to keep them | |

The agent-run path (the owner's 1-hour credential window, run by a session rather than the
workflow): `--credentials environment` (Cloudflare through the session's network secret, AWS
from `aws login`), `--apply` (switch then verify), `--verify`, `--rollback`, `--budget-minutes`
(stops before an app that would not fit, default 60) and `--report <file>`. Owner steps, the
session's rules and its network: [`docs/runbooks/cutover-run-day.md`](../../../docs/runbooks/cutover-run-day.md).

`--plan` runs any stage read-only (every client refuses writes; the plan
role could not write anyway). The workflow's plan job does this and posts
the result as the job summary, so the owner sees what will change before
approving the run job.

Dry run, no network, the whole pipeline over the fixtures:

```sh
python3 -I platform/aws/cutover/cutover.py --fixtures platform/aws/cutover/fixtures --state /tmp/c/state.json --plan prepare switch verify
python3 -m pytest platform/aws/cutover -q
```

## The app list

`apps.json` then `apps.d/*.json` (one file per product line; how to add one:
[`apps.d/README.md`](apps.d/README.md)). Each app: `name`, `hosts`,
`aws.kind` (`cloudfront` | `apigateway`) and `aws.account` (`shared-infra` |
`apps`), `health` (a path that answers 200), `freeze`, `data`
(`d1_database`, `product`, `exclude_tables`, `replace_existing`), `paddle`
(`notification_setting_id`, `aws_destination`, `webhook_secret`,
`test_event`), `crawl`. Today: the site (apex and www), the grants redirect,
and the four products on the SaaS starter. The paid apps moving in from
`private-monorepo` add their own files; nothing else changes.

## Security model

What could go wrong, and what stops it:

- **The Cloudflare token is the crown jewel.** It lives only in AWS Secrets
  Manager (`cutover/*`, management account), created by the owner in
  CloudShell, never in GitHub. `export` and `prepare` refuse a token
  without an expiry or with more than 72 h left. The run job deletes it at
  the end. Inside a run it reaches only this process and the `tofu`
  subprocess's environment, and is registered with `::add-mask::` (a line
  GitHub's runner consumes, not shows). Tests check that no token, key,
  secret binding value or customer row reaches the log, the summary or the
  state.
- **Who can read it.** `github-cutover-plan` (environment `cutover-plan`)
  and `github-cutover` (environment `cutover`, owner approval), each
  trusting exactly one environment subject of this repository; both
  environments are limited to `main` (`github/configure.sh`), and both jobs
  also check `github.ref`. A fork or another branch gets neither. Neither
  role can read any other secret, write any other state key, invoke any
  Lambda but db-admin (the run role only), send mail to anyone but SES's
  simulator, or change IAM (`stacks/cutover-access`, with tests).
- **What runs with it.** `tofu`, the `aws` CLI and `cutover.py`, all under
  `/platform/aws/` (owner-owned in `.github/CODEOWNERS`, so a change is
  reviewed at the adversarial gate's strictest tier); `python3 -I`, standard
  library only, nothing installed.
- **What the code may point DNS at.** `switch.tf` accepts only
  `*.cloudfront.net` and `*.amazonaws.com` targets and only hostnames the
  export inventoried; the targets come from AWS's own answer for the alias,
  not from config. A test refuses anything else.
- **State holds no secret.** Workers scripts (secret bindings, code), Pages
  projects (environment variables) and API tokens are inventoried by name,
  never imported; `github-plan` and the plan role read this state.
- **The data copy.** Postgres is private; the copy goes through the
  existing db-admin Lambda, which accepts only plain identifiers, takes
  values as parameters, refuses the maintenance databases, and refuses to
  copy over a non-empty table unless the run state says it started that
  copy (or the app's config says the rows are seeds).
- **What is not protected.** Whoever can approve the `cutover` environment
  and holds a live token can move DNS; that is the owner, by design. A
  merged change to these files is applied by the next run, so the gate's
  review of `/platform/aws/` is what stands between a bad PR and the token.

### Later option, documented not built: deploys inside AWS CodeBuild

GitHub would hold no credentials and no OIDC trust at all: a CodeBuild
project (source GitHub through an AWS CodeConnections connection, which is
one console authorisation by the owner) runs `cutover.py` with its own
service role, a CodePipeline manual-approval action replaces the
`cutover` environment's reviewer, and logs land in CloudWatch. Costs: a
connection to set up by hand, per-minute build charges, and a second CI
system to read. Worth it when the deploy pipelines move to AWS too.

## The optional full-exit track

Leave Cloudflare entirely (DNS to Route 53, Email Routing to SES inbound).
Days, not hours, because of clocks the code cannot shorten; the calendar is
in the runbook. In short: transfer the domain off Cloudflare Registrar
(which only allows Cloudflare's nameservers) first; move inbound mail to
SES (`stacks/email-ops`) and warm up sending; apply `stacks/dns` from
`cf_export.py`'s records; set `route53_track: true` so verify runs
`zone_diff.py`; turn DNSSEC off; change the nameservers; retire the zone.

## Facts, and how sure each is

Checked here, 2026-11-26:

- Cloudflare provider 5.29.0 (`cloudflare/cloudflare`, release zip SHA256
  checked against its `SHA256SUMS`): every resource and attribute used, from
  `tofu providers schema -json`; import ID formats (`<zone_id>/<dns_record_id>`,
  `<account_id>/<domain_id>`, `<zone_id>/<route_id>`,
  `<account_id>/<bucket_name>/<jurisdiction>`, `<account_id>/<database_id>`,
  `<zone_id>/<rule_identifier>`, `<account_id>/<site_id>`) from the
  provider binary's own error strings.
- `switch.tf`: `tofu validate` and 8 `tofu test` runs (mocked provider).
  `stacks/cutover-access`: validate and 4 test runs. OpenTofu 1.13.10.
- The D1 copy: a real Postgres 16 round trip (import in two batches, bytea
  from D1's byte arrays, bigserial, sequence moved past the copy, refusal to
  overwrite, replace), and the checksum equal on both sides
  (`canon_vectors.json`, asserted in Node and Python).

Not verified (no account, and these APIs could not be reached from here);
the first plan job will show any of them wrong before anything changes:

- Cloudflare API shapes: `/user/tokens/verify` returning `expires_on`; the
  rulesets entrypoint and `ref` on custom rules (the freeze); D1 `/query`
  allowing `PRAGMA table_info`; Workers `.../settings` listing bindings.
- Which token permissions each read needs (the export lists anything it
  could not read instead of failing).
- `-generate-config-out` for provider v5 often emits attributes that need
  hand edits; `prepare` refuses until the adopt plan is imports only.
- Paddle: `PATCH /notification-settings/{id}` keeping the endpoint secret;
  the simulations API's run and event shapes. Try it with a sandbox key
  first (`"environment": "sandbox"` in the secret).
- That `ses:Recipients` conditions SESv2 `SendEmail` as it does v1.
- The OpenTofu registry's lock hashes for the Cloudflare provider: the AWS
  plan workflow's lock check prints the right file if this one differs.
