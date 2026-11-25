#!/usr/bin/env bash
# The GitHub side of the AWS setup, as code. Run once, by someone with admin
# rights on the repository, after bootstrap/bootstrap.yaml has run:
#
#   bash platform/aws/github/configure.sh <aws-account-id> [region]
#
# It:
#   * creates the `aws-prod` and `aws-llm` environments and limits both to the
#     `main` branch: github-apply and github-llm-gate trust these environment
#     names, so this limit is what keeps other branches from assuming them;
#   * sets the repository variables AWS_ACCOUNT_ID and AWS_REGION, which turn
#     on priv-aws-plan.yml and priv-aws-apply.yml.
#
# Idempotent. Needs `gh` logged in with repo admin (gh auth status). Account
# IDs are not secrets, so these are variables, not secrets.
set -euo pipefail

account="${1:?usage: configure.sh <aws-account-id> [region]}"
region="${2:-us-east-1}"
repo="${GITHUB_REPOSITORY:-Duncan-Haywood/oss-monorepo}"

[[ "$account" =~ ^[0-9]{12}$ ]] || { echo "account id must be 12 digits" >&2; exit 1; }

for env in aws-prod aws-llm; do
  gh api -X PUT "repos/${repo}/environments/${env}" \
    -F 'deployment_branch_policy[protected_branches]=false' \
    -F 'deployment_branch_policy[custom_branch_policies]=true' >/dev/null
  if ! gh api "repos/${repo}/environments/${env}/deployment-branch-policies" \
      --jq '.branch_policies[].name' | grep -qx main; then
    gh api -X POST "repos/${repo}/environments/${env}/deployment-branch-policies" \
      -f name=main -f type=branch >/dev/null
  fi
  echo "environment ${env}: main only"
done

gh variable set AWS_ACCOUNT_ID --repo "$repo" --body "$account"
gh variable set AWS_REGION --repo "$repo" --body "$region"
echo "variables AWS_ACCOUNT_ID and AWS_REGION set; the next push to main under platform/aws/ applies."
