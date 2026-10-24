# Terraform Plan Cost Estimate

A free, offline tool that reads a Terraform *structured* plan
(`terraform show -json`) and answers one question before you apply it:
**roughly what does this add to, or take off, the monthly AWS bill?**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/terraform-plan-cost-estimate/

After using this, you can put a monthly dollar figure on a Terraform change
in under a minute, with no signup, no API key and no upload, which used to
mean installing a cost tool or building the change in the AWS pricing
calculator by hand.

- A **monthly cost delta** for every create, update, replace and delete, with
  the before and after cost of each resource and what it is made of.
- The **top cost drivers** of the plan.
- A **budget threshold**: `--max-delta` makes the CLI exit 1 when the estimated
  delta is above a number you set, so it can gate CI between plan and apply.
- An honest **unpriced list**. A resource the table cannot price is listed with
  the reason, never counted as zero, and the summary says the figure is not the
  full change.

**What it is not:** a quote, a billing tool, a live-pricing service, or a
multi-cloud product. For those, use [Infracost](https://www.infracost.io/);
see [the comparison page](vs-infracost.html) for when each is the right answer.

## Estimate, not a quote

Prices come from a **small bundled table of rounded us-east-1 on-demand list
prices**, dated `2026-10-03` (`PRICE_TABLE_DATE` in `engine.mjs`, printed in
every report). Be clear about its limits:

- It was **not fetched live** and **not verified line by line** against AWS's
  price list. Compare a real plan's total with the AWS Pricing Calculator
  before relying on it.
- The `--region` option applies one **rough multiplier per region** on top of
  us-east-1. Real regional differences vary per service and instance family.
- It does not know your discounts, savings plans, reserved instances, spot
  usage, free tier, taxes or credits.
- **Usage-based charges are not estimated**: data transfer, NAT data
  processing, S3 storage and requests, Lambda invocations, log ingestion,
  on-demand DynamoDB, snapshots. They are named in the report where they apply.
  NAT gateway data processing in particular often dominates the hourly fee.

## What is priced

| Priced from the table | Named as usage-based, not estimated |
|---|---|
| `aws_instance` (plus root and extra EBS volumes), `aws_ebs_volume` | `aws_s3_bucket`, `aws_lambda_function` |
| `aws_db_instance`, `aws_rds_cluster_instance` | `aws_cloudwatch_log_group`, `aws_sqs_queue`, `aws_sns_topic` |
| `aws_nat_gateway`, `aws_lb` / `aws_alb`, `aws_elb`, `aws_eip` | `aws_kinesis_stream`, `aws_cloudfront_distribution` |
| `aws_eks_cluster`, `aws_eks_node_group` | `aws_api_gateway_rest_api`, `aws_apigatewayv2_api` |
| `aws_elasticache_cluster`, `aws_elasticache_replication_group` | `aws_secretsmanager_secret`, `aws_kms_key`, `aws_route53_zone` |
| `aws_dynamodb_table` (provisioned; on-demand is usage-based) | |
| `aws_cloudwatch_metric_alarm`, `aws_cloudwatch_dashboard` | |

Resource types with no direct charge (IAM, security groups, VPC plumbing and
similar) are counted, not hidden. **Everything else is listed as unpriced.**
`aws_autoscaling_group` is deliberately unpriced: its cost depends on a launch
template and an instance count the plan does not resolve.

## Try it without installing anything

[`index.html`](index.html) reads a plan you load or paste entirely in the
browser. No fetch happens from the page, so nothing you load leaves your
device, which matters because a plan describes your whole infrastructure.

## Quickstart (CLI)

Zero dependencies, one engine file, Node 18+. Reads only the file you name; no
network call, ever.

```sh
terraform plan -out=tfplan && terraform show -json tfplan > plan.json
node cli.mjs estimate plan.json                           # report only
node cli.mjs estimate plan.json --max-delta 200           # exit 1 if it adds more than $200/month
node cli.mjs estimate plan.json --region eu-west-1 --json
```

In CI, between plan and apply:

```yaml
- name: Cost gate
  run: |
    terraform show -json tfplan > plan.json
    node cli.mjs estimate plan.json --max-delta 200
```

Exit codes: `0` within budget (or no budget set), `1` the estimated monthly
delta is above `--max-delta`, `2` the file or an option could not be used.
Resources the table could not price are excluded from the number the gate
sees; the output says so when that happened.

## Disclaimers

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, billing or engineering advice,
and it does not replace the provider's pricing pages, the AWS Pricing
Calculator, or a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run
it yourself.

**Not affiliated with HashiCorp, Terraform, OpenTofu, Amazon Web Services or
Infracost.** Terraform is a trademark of HashiCorp, AWS of Amazon.com, Inc., and
Infracost of its owner; they are named only to describe what this tool reads
and what it is compared to.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. Your plan is never uploaded, and there are no
accounts, tracking cookies or analytics vendor. The page counts anonymous
feature events (`estimate_run`, `example_loaded`, `file_loaded`) in
`localStorage` only, never transmitted and never tied to your plan; Do Not
Track and Global Privacy Control are honoured, and a button turns it off. The
CLI records nothing and makes no network call.

## Related

[Terraform Plan Blast Radius Check](../terraform-plan-blast-radius-check/)
reads the same file for a different question: what the apply destroys or
replaces. Neither subsumes the other.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

Fixtures live in `fixtures/`. To update prices, edit the tables at the top of
`engine.mjs`, bump `PRICE_TABLE_DATE`, and fix the tests that pin dollar
amounts; they are hand-computed from the table so a wrong table fails loudly.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Engine, CLI and page are
built and tested. The price table has not been verified against the live AWS
price list and no user has touched it yet.
