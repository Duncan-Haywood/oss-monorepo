#!/usr/bin/env bash
# The GitHub side of the AWS setup, as code. Run once, by someone with admin
# rights on the repository, after bootstrap/bootstrap.yaml has run:
#
#   bash platform/aws/github/configure.sh <aws-account-id> [region] [account-mode]
#
# region defaults to us-east-2; account-mode is organization (default) or
# single, the same value as the bootstrap's AccountMode
# (docs/runbooks/cutover-run-day.md, step 0).
#
# It:
#   * creates the `aws-prod` and `aws-llm` environments and limits both to the
#     `main` branch: github-apply and github-llm-gate trust these environment
#     names, so this limit is what keeps other branches from assuming them;
#   * creates `cutover-plan` and `cutover` (priv-cutover.yml), both main only;
#     `cutover` also requires the repository owner's approval before its job
#     starts (the plan job's summary shows what the run will do). Neither holds
#     a secret: the cutover reads its short-lived tokens from AWS Secrets Manager;
#   * sets the repository variables AWS_ACCOUNT_ID, AWS_REGION and
#     AWS_ACCOUNT_MODE; AWS_ACCOUNT_ID turns on priv-aws-plan.yml and
#     priv-aws-apply.yml.
#
# Idempotent. Needs `gh` logged in with repo admin (gh auth status). Account
# IDs are not secrets, so these are variables, not secrets.
set -euo pipefail

account="${1:?usage: configure.sh <aws-account-id> [region] [organization|single]}"
region="${2:-us-east-2}"
mode="${3:-organization}"
repo="${GITHUB_REPOSITORY:-Duncan-Haywood/oss-monorepo}"

[[ "$account" =~ ^[0-9]{12}$ ]] || { echo "account id must be 12 digits" >&2; exit 1; }
[[ "$mode" = organization || "$mode" = single ]] || { echo "account mode must be organization or single" >&2; exit 1; }

owner_id="$(gh api "users/${repo%%/*}" --jq .id)"

for env in aws-prod aws-llm cutover-plan cutover; do
  reviewers='[]'
  if [ "$env" = cutover ]; then reviewers="[{\"type\":\"User\",\"id\":${owner_id}}]"; fi
  gh api -X PUT "repos/${repo}/environments/${env}" --input - >/dev/null <<JSON
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true},"reviewers":${reviewers}}
JSON
  if ! gh api "repos/${repo}/environments/${env}/deployment-branch-policies" \
      --jq '.branch_policies[].name' | grep -qx main; then
    gh api -X POST "repos/${repo}/environments/${env}/deployment-branch-policies" \
      -f name=main -f type=branch >/dev/null
  fi
  echo "environment ${env}: main only$([ "$env" = cutover ] && echo ', owner approval required')"
done

gh variable set AWS_ACCOUNT_ID --repo "$repo" --body "$account"
gh variable set AWS_REGION --repo "$repo" --body "$region"
gh variable set AWS_ACCOUNT_MODE --repo "$repo" --body "$mode"
echo "variables AWS_ACCOUNT_ID, AWS_REGION and AWS_ACCOUNT_MODE (${mode}) set; the next push to main under platform/aws/ applies."
