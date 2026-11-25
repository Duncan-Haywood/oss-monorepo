#!/usr/bin/env bash
# The one-time bootstrap: create the state bucket on local state, then move
# that state into the bucket it just created. Safe to re-run: once the
# bucket holds stacks/bootstrap/terraform.tfstate it only does a normal apply.
# Runs in CI (aws-prod environment, seed role from cfn/github-oidc-seed.yaml)
# or from the owner's Identity Center admin session.
set -euo pipefail
cd "$(dirname "$0")"
account="$(aws sts get-caller-identity --query Account --output text)"
export AWS_MANAGEMENT_ACCOUNT_ID="$account"
./backend-config.sh bootstrap > backend.hcl
bucket="$(sed -n 's/^bucket = "\(.*\)"$/\1/p' backend.hcl)"

if aws s3api head-object --bucket "$bucket" --key stacks/bootstrap/terraform.tfstate >/dev/null 2>&1; then
  echo "state already migrated; normal apply"
  rm -f bootstrap_override.tf
  tofu init -input=false -backend-config=backend.hcl
  tofu apply -input=false -auto-approve -var "expected_account_id=$account" "$@"
  exit 0
fi

cp bootstrap_override.tf.example bootstrap_override.tf
tofu init -input=false
tofu apply -input=false -auto-approve -var "expected_account_id=$account" "$@"
rm -f bootstrap_override.tf
tofu init -input=false -migrate-state -force-copy -backend-config=backend.hcl
aws s3api head-object --bucket "$bucket" --key stacks/bootstrap/terraform.tfstate >/dev/null
rm -f bootstrap.tfstate bootstrap.tfstate.backup
echo "bootstrap state now in s3://$bucket/stacks/bootstrap/terraform.tfstate"
