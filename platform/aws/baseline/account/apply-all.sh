#!/usr/bin/env bash
# Apply (or, with PLAN=1, plan) the account baseline in every account and
# allowed region. Runs as gha-oss-monorepo-foundation-apply in management,
# after the baseline stack; chains into OrganizationAccountAccessRole in
# each member account.
set -euo pipefail
cd "$(dirname "$0")"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

mgmt="${AWS_MANAGEMENT_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
export AWS_MANAGEMENT_ACCOUNT_ID="$mgmt"
bucket="oss-monorepo-tfstate-${mgmt}-us-east-1"
read_out() { aws s3 cp "s3://$bucket/stacks/$1/terraform.tfstate" - | jq -r ".outputs.$2.value"; }

accounts_json="$(aws s3 cp "s3://$bucket/stacks/org/terraform.tfstate" - | jq -c '.outputs.account_ids.value')"
config_bucket="$(read_out baseline log_archive_bucket_name)"
config_key="$(read_out baseline log_archive_kms_key_arn)"

for name in $(jq -r 'keys[]' <<<"$accounts_json"); do
  id="$(jq -r --arg n "$name" '.[$n]' <<<"$accounts_json")"
  role=""
  [[ "$name" == management ]] || role="arn:aws:iam::${id}:role/OrganizationAccountAccessRole"
  for region in us-east-1 us-west-2; do
    echo "::group::baseline-account $name $region"
    rm -rf .terraform
    ../../bootstrap/backend-config.sh baseline-account "$name/$region" > backend.hcl
    tofu init -input=false -reconfigure -backend-config=backend.hcl
    args=(-input=false -var "account_name=$name" -var "account_id=$id" -var "region=$region"
          -var "config_bucket_name=$config_bucket" -var "config_kms_key_arn=$config_key")
    [[ -n "$role" ]] && args+=(-var "deploy_role_arn=$role")
    if [[ "${PLAN:-0}" == 1 ]]; then tofu plan -lock=false "${args[@]}"; else tofu apply -auto-approve "${args[@]}"; fi
    echo "::endgroup::"
  done
done
