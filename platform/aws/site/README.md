# `site`: marisstella.app on S3 + CloudFront

The public site moved off Cloudflare's two free Workers onto one private S3
bucket behind one CloudFront distribution, in the `shared-infra` account
(owner decision 2026-11-24,
[`docs/reports/2026-11-24-cloud-provider-comparison.md`](../../../docs/reports/2026-11-24-cloud-provider-comparison.md) §7).
Nothing here is applied yet: there is no AWS account. The stack is written
to be applied from CI once the owner's account steps are done.

The resources live in [`../modules/static-site/`](../modules/static-site/);
this directory wires them for marisstella.app and holds the publisher.

## What replaces what

| Cloudflare today | AWS |
|---|---|
| Two Workers (`router.mjs` + `shard/`), split by `split.mjs` to stay under 20,000 files each; share cards packed (`cardpack.mjs`) | One bucket, one distribution. S3 has no file limit: nothing is split or packed |
| `html_handling = "auto-trailing-slash"`: `/a/` serves `a/index.html`, `/a/b` serves `a/b.html`, `/a` and `*.html` redirect (307) | `publish.mjs` uploads `a/b.html` under key `a/b` and a stub at `a` for each directory; `viewer-request.js` maps `/a/` to `a/index.html` and redirects `.html` spellings; `viewer-response.js` turns a stub into the 307 to `/a/` |
| `not_found_handling = "404-page"` | CloudFront custom error responses: 403 and 404 → `/404.html` with status 404 |
| `_headers` from `security-headers.mjs` (HSTS 1 year, nosniff, referrer policy) | A response-headers policy with the same three headers, overriding the origin |
| `router.mjs` `APP_DIRS`: `/grants/*` to the grant-autopilot Worker | `app_origins = { grants = { domain_name = "..." } }`: an ordered cache behaviour per app, no caching, every viewer header but Host forwarded |
| grant-autopilot's own `grants.marisstella.app` 301 to `/grants/` | `host_redirects["grants.marisstella.app"] = "/grants"`, in `viewer-request.js` |
| nothing (`www` is NXDOMAIN) | `www.marisstella.app` 301 to the apex |
| Cloudflare's network-level DDoS protection | CloudFront + Shield Standard, WAF with AWS IP reputation, common rule set, known bad inputs (Log4j) and a per-IP rate rule (2,000 per 5 minutes) |
| `wrangler deploy` in `priv-portfolio-pages.yml` | [`deploy/publish.mjs`](deploy/publish.mjs): uploads only changed files (ETag = MD5), deletes removed ones, invalidates `/*`; the job draft is [`ci/deploy-aws.job.yml`](ci/deploy-aws.job.yml) |

The workers.dev address's `Refresh` header is not reproduced: that address
belongs to Cloudflare and goes away with it (`retire-cloudflare`).

## Apply order

1. **Owner, once (AWS forces these):** create the management account, root
   MFA, a card, IAM Identity Center. The foundation and bootstrap stacks
   (other agents) then create the accounts, the state bucket, the GitHub
   OIDC provider and the `gha-oss-monorepo-site-{plan,apply}` roles.
2. **`dns` stack** ([`../dns/README.md`](../dns/README.md)). It creates the
   hosted zone; this stack looks it up by name.
3. **This stack, phase 1** (`enable_custom_domains = false`, the default):
   bucket, distribution on its `*.cloudfront.net` address, WAF, functions,
   the publisher role. Inputs:
   - `deploy_role_arn`: `gha-oss-monorepo-site-apply` in `shared-infra`;
   - `allowed_account_ids`: `["<shared-infra id>"]`;
   - `github_oidc_provider_arn`: the foundation stack's output.
4. **Publish and verify on the CloudFront address.** Paste
   [`ci/deploy-aws.job.yml`](ci/deploy-aws.job.yml) into
   `priv-portfolio-pages.yml` (control plane: the owner's PR), set the four
   repository variables it lists from this stack's outputs, and create the
   `aws-prod` environment limited to `main`. Every merge then publishes to
   both hosts. The job runs `verify-live.sh` and `check_site_fresh.py
   --url` against `https://<distribution_domain_name>/`.
5. **Phase 2:** set `enable_custom_domains = true`. The certificate's DNS
   validation records go into Route 53, which is not authoritative yet, so
   also add them to Cloudflare DNS: apply with
   `-target=module.site.aws_acm_certificate.site`, read
   `certificate_validation_records`, add those CNAMEs in Cloudflare, then
   apply in full (the validation waits up to 75 minutes). CloudFront then
   answers for marisstella.app too, while DNS still points at Cloudflare.
6. **Cutover:** the nameserver change in [`../dns/README.md`](../dns/README.md),
   then switch `AWS_SITE_VERIFY_URL` to `https://marisstella.app/`.

## Cost (us-east-1 list prices, checked 2026-11-24 from memory of AWS's pages; confirm on the pricing pages before applying)

| Item | Monthly |
|---|---|
| WAF: web ACL $5 + 4 rules × $1 + $0.60 per million requests | ≈ $9.60 at 1M requests |
| CloudFront: always-free tier covers 1 TB out and 10M requests | $0 at today's traffic |
| CloudFront Functions: 2 per request, 2M free then $0.10 per million | ≈ $0 – $0.50 |
| S3: ≈ 2 GB stored, a few thousand PUTs per deploy (changed files only) | < $1 |
| CloudWatch Logs for WAF (1 year retention) | cents at this traffic |
| **Total** | **≈ $10–12** |

Cloudflare's free plan cost $0 and could not bill; AWS can. The `aws-spend-guards`
task puts budgets and a kill switch on the account. The WAF is most of the
bill: it is the security baseline's requirement (§7), so it stays.

## Checks

```sh
node --test platform/aws/modules/static-site/functions/functions.test.mjs  # CloudFront Functions
node --test platform/aws/site/deploy/publish.test.mjs                      # publish plan, layout, guards
node --test platform/aws/site/deploy/emulate.test.mjs                      # verify-live.sh + check_site_fresh.py against the AWS serving path
cd platform/aws/site && tofu init -backend=false && tofu validate && tofu test
cd platform/aws/modules/static-site && tofu init -backend=false && tofu test
```

To look at a real build the way CloudFront will serve it:

```sh
node platform/pages/build.mjs --out=platform/pages/dist
node platform/aws/site/deploy/emulate.mjs --dir platform/pages/dist --port 8787
bash platform/pages/verify-live.sh http://127.0.0.1:8787/
```

`publish.mjs --dry-run` against the real bucket prints what a deploy would
change without changing it.

## Rolling back a deploy

The bucket is versioned and keeps overwritten or deleted versions for 30
days. Rebuild and publish the previous commit (the simple path), or restore
the previous versions with `aws s3api list-object-versions` and invalidate
`/*`. Rolling the whole site back to Cloudflare is the DNS rollback in
[`../dns/README.md`](../dns/README.md).

## Scanner baseline

Checkov 3 (`checkov -d platform/aws --framework terraform`) passes with
these checks skipped in place, each with its reason in a `checkov:skip`
comment beside the resource:

| Check | Why it is skipped |
|---|---|
| CKV_AWS_145 (S3 KMS) | Public web content. SSE-S3 keeps the ETag equal to the MD5, which is how the publisher uploads only changed files; with SSE-KMS every deploy would re-upload ≈ 40,000 files (≈ $50 a month in PUTs) |
| CKV_AWS_18 (S3 access logs) | Reads are logged at CloudFront (`access_log_bucket_domain`) and in the WAF log; writes are CloudTrail data events in the organisation trail |
| CKV_AWS_144 (replication) | The bucket holds a build CI can recreate from git; versioning covers rollback |
| CKV2_AWS_62 (event notifications) | Nothing consumes them |
| CKV_AWS_158 (log group KMS) | CloudWatch's own encryption unless `logs_kms_key_arn` names the security stack's key |
| CKV_AWS_259 (HSTS) | HSTS is on; `includeSubDomains` and `preload` are deliberately off (hard to undo) |
| CKV_AWS_174 (TLS 1.2) | TLSv1.2_2021 on the custom domain; the phase-1 default certificate cannot be set higher |
| CKV_AWS_310 (origin failover) | One S3 origin |
| CKV_AWS_374 (geo restriction) | A public site |
| CKV2_AWS_47 (Log4j AMR) | The rule group is attached; Checkov does not follow it through the module |

No Content-Security-Policy and no frame protection, as on Cloudflare: the
tools are embedded on other sites (`platform/pages/embed.mjs`) and a CSP
needs an inventory of inline scripts first.

## Outputs other stacks and workflows read

`bucket_name`, `distribution_id`, `distribution_arn`,
`distribution_domain_name`, `distribution_hosted_zone_id`,
`certificate_validation_records`, `web_acl_arn`, `publisher_role_arn`
(state key `stacks/site/terraform.tfstate`).
