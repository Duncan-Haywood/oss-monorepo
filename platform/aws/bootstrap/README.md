# bootstrap: the state bucket

Creates the S3 bucket and KMS key that hold every `platform/aws` stack's
OpenTofu state. Applied once on local state, then migrated into itself.

## What it creates (management account, us-east-1)

- `aws_kms_key.state` (alias `alias/oss-monorepo-tfstate`): rotates yearly,
  30-day deletion window.
- `aws_s3_bucket.state`, named `oss-monorepo-tfstate-<account>-us-east-1`:
  versioning, object lock (GOVERNANCE, 30 days by default), SSE-KMS with a
  bucket key, all four Block Public Access settings, ACLs disabled, old
  versions expire after 90 days, `prevent_destroy`.
- A bucket policy that denies non-TLS and TLS < 1.2, denies shortening any
  retention, and (once `organization_id` is set) lets each member-account CI
  role reach only `stacks/<its stack>/`, write only if it is an `-apply`
  role, and read the shared stacks' outputs.

## Why the management account

The bucket has to exist before the `org` stack creates any other account,
and the stacks that run first (bootstrap, org, baseline, github-oidc,
spend-guards) all run in management. Putting it in `shared-infra` would mean
a second migration of every stack's state once that account exists. The cost
of the choice: management holds one non-organizational resource, which AWS's
guidance tolerates for state; access to it is narrower than to anything else
in that account.

## Apply

First time (CI job in the `aws-prod` environment holding the
`gha-oss-monorepo-foundation-apply` role from `cfn/github-oidc-seed.yaml`,
or the owner's Identity Center admin session):

```sh
cd platform/aws/bootstrap
./first-apply.sh            # local state -> apply -> migrate into the bucket
```

After the `org` stack exists, grant member-account roles their prefixes:

```sh
./backend-config.sh bootstrap > backend.hcl
tofu init -backend-config=backend.hcl
tofu apply -var organization_id=$(cd ../org && tofu output -raw organization_id)
```

`first-apply.sh` is safe to re-run: once the state object exists in the
bucket it does a normal apply. If a first run dies after the bucket was made
but before migration, import the bucket and key (`tofu import`) rather than
deleting them.

## What the owner must do

Steps 1-3 of the turnover checklist in `../README.md`: open the account,
launch `cfn/github-oidc-seed.yaml`, create the `aws-prod` environment.
Nothing else here is a console step.

## Verify (no account needed)

```sh
tofu fmt -check -recursive && tofu init -backend=false && tofu validate && tofu test
checkov -d . --framework terraform
cfn-lint cfn/github-oidc-seed.yaml && checkov -f cfn/github-oidc-seed.yaml
```

The tests run against `mock_provider "aws"` and check: Block Public Access
on, KMS encryption, key rotation, versioning and object lock, ACLs off, a
TLS-only policy, every Allow scoped to the organization and to named CI
roles, only apply roles writing, and no public-repository role reaching the
payments state.

Checkov skips, with reasons, are inline on `aws_s3_bucket.state`: access
logging (covered by the organization trail's S3 data events in `baseline`),
event notifications (no consumer), cross-region replication (cost for a
rebuildable, versioned, locked object).
