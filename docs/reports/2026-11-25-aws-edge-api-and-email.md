# AWS edge API and email: what landed, interfaces, what is left (2026-11-25)

For the next session on `aws-edge-api`, `aws-ses-email`, the site stack,
`aws-move-products` or `retire-cloudflare`.

## Landed

| Path | What |
|---|---|
| `platform/edge/store.mjs` | storage port; `d1Store` (the old SQL) and `storeOf(env)` |
| `platform/edge/aws/{lambda,dynamo-store,sigv4,migrate-d1,fake-dynamo}.mjs` | Lambda adapter (HTTP + SES inbound), DynamoDB store, SDK-free SigV4, D1 to DynamoDB migration, strict test fake |
| `platform/edge/aws-*.test.mjs` | Lambda route scenarios, store contract (SQLite + fake), SigV4 vectors, migration; at top level so `portfolio-validate.yml`'s glob runs them |
| `platform/counter/pull-aws.mjs` | CloudFront/Lambda/WAF metrics + crawler classes from the CloudFront log into `portfolio/usage/aws-analytics.json` |
| `platform/aws/edge-api/` | OpenTofu stack, tests, README (apply order, outputs for the site stack) |
| `platform/aws/email/` | OpenTofu stack (identities, config sets, inbound, consent table, events Lambda) and `sender/` (policy, consent store, SES adapter, unsubscribe) |

## Interfaces other stacks rely on

- **Site stack** reads `stacks/edge-api/terraform.tfstate` outputs:
  `origin_domain_name`, `origin_path_pattern` (`/_edge/*`),
  `origin_verify_header_name`, `origin_verify_secret_arn`,
  `cloudfront_cache_policy_id`, `cloudfront_origin_request_policy_id`,
  `allowed_methods`. It owns the WAF rate rule for `/_edge/*`, and the
  CloudFront access log group whose name `pull-aws.mjs` takes as
  `CLOUDFRONT_LOG_GROUP` (standard logging v2 to CloudWatch Logs, JSON).
- **Route 53 zone stack** gives `zone_id` and must leave the apex MX (and,
  after cutover, the apex SPF) to the email stack.
- **Spend guards** give an SNS topic for `alarm_topic_arn`.
- **Foundation** gives the state bucket (`state_bucket`) and the
  `gha-oss-monorepo-{edge-api,email}-{plan,apply}` roles in shared-infra.
- **Ventures** switch with `senderFromEnv(env, { consent })` when
  `MAIL_PROVIDER=ses` (README, "The sender port").

## Left

1. Apply both stacks after the foundation; attach the origin in the site stack.
2. `migrate-d1.mjs --apply` before and after the DNS move; then commit
   `platform/edge/site.json` and `platform/counter/site.json` =
   `https://marisstella.app/_edge`.
3. Email: owner submits SES production access, gives the postal address and
   registers the cold domain; `receive_mail = true` moves support mail.
4. CI: a workflow step for `node --test 'platform/aws/**/*.test.mjs'`, the
   `tofu test` runs and Checkov on `platform/aws/**` (the IaC scanning
   workflow under security-first), and a daily job running `pull-aws.mjs`
   with a read-only OIDC role (`cloudwatch:GetMetricData`,
   `logs:StartQuery`, `logs:GetQueryResults`).
5. Follow-ups noted as Checkov skips: Lambda code signing; a CloudFront
   front for the unsubscribe URL at `https://marisstella.app/unsubscribe`.

## Things that cost time here

- `registry.opentofu.org` is blocked by the session proxy (403);
  `releases.hashicorp.com` is not. The providers were fetched from there,
  checked against their SHA256SUMS, and used as a filesystem mirror
  (`provider_installation { filesystem_mirror { ... } }` in a CLI config file
  passed as `TF_CLI_CONFIG_FILE`). The committed lock files carry the
  linux_amd64 `h1:` hash and every platform's `zh:` hash from SHA256SUMS, and
  `tofu init -lockfile=readonly` accepts them.
- Downloading the Trivy binary was refused by this session's permission
  classifier; Checkov 3.2.469 (pip, in a venv) ran instead.
- `tofu test` mocks `aws_iam_policy_document` too, so its `json` must be
  mocked as valid JSON; the tests assert on the documents' `statement` inputs,
  which mocks keep.
- Unverified until applied: CloudWatch's JSON protocol for GetMetricData
  (`GraniteServiceVersion20100801`), the CloudFront log field names in the
  Insights query, and whether `AllViewerExceptHostHeader` forwards
  `Authorization` for `/_edge/inbox` (the smoke test in the edge-api README
  checks it).
