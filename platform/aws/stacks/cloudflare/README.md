# stacks/cloudflare: the Cloudflare account as OpenTofu

The owner, 2026-11-26: "get everyyyything in tf or similar". This stack is
the marisstella.app Cloudflare account as code, so that the move to AWS is a
plan and an apply, and so that what is left on Cloudflare afterwards is
code too. It is planned and applied only by the cutover
([`../../cutover/README.md`](../../cutover/README.md)), with a short-lived
token from AWS Secrets Manager; the AWS plan and apply workflows only
validate and test it (they hold no Cloudflare token).

| File | Who writes it |
|---|---|
| `inventory.generated.json` | the cutover's `export` stage (a placeholder until the first export) |
| `imports.generated.tf` | `export`: one `import` block per adoptable resource |
| `resources.generated.tf` | `export`'s `tofu plan -generate-config-out`, then hand fixes until the adopt plan is imports only |
| `switch.tf` | by hand: the hostnames the cutover moves, cloudflare or aws per `var.targets` |
| `tests/switch.tftest.hcl` | by hand: 8 runs over a fixture inventory |

Adopted: the zone, DNS records, Workers routes and custom domains, Email
Routing settings, rules and catch-all, R2 buckets, D1 databases, Web
Analytics sites, zone rulesets. Not adopted, on purpose (their state would
hold secrets, and the plan roles read state): Workers scripts, Pages
projects, API tokens. Zone settings are left as they are.

State: the management account's bucket, key `cloudflare/terraform.tfstate`
(`stacks/cutover-access` grants the cutover roles that prefix only).

The first export lands as a PR from an agent: download the
`cloudflare-export` artifact of the export run, commit the three generated
files, run `tofu fmt`, and let the cutover's plan job (stage `prepare`) show
whether the adopt plan is imports only; fix `resources.generated.tf` until
it is.
