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
# Two later steps, each run once when the apply summary says it is ready:
#
#   bash platform/aws/github/configure.sh --private-ci
#       private-monorepo's jobs move to the AWS CodeBuild runners
#       (stacks/ci-runners) once its GitHub connection reads AVAILABLE.
#       Undo: gh variable delete CODEBUILD_RUNNER --repo Duncan-Haywood/private-monorepo
#
#   bash platform/aws/github/configure.sh --llm-gate <github-llm-gate-role-arn> <claude-workspace-id>
#       turns on the adversarial gate's LLM review (Claude Platform on AWS,
#       AWS billing) and scopes stacks/llm to that workspace.
#
# Idempotent. Needs `gh` logged in with repo admin (gh auth status). Account
# IDs are not secrets, so these are variables, not secrets.
set -euo pipefail

case "${1:-}" in
  --private-ci)
    private="${PRIVATE_REPOSITORY:-Duncan-Haywood/private-monorepo}"
    gh variable set CODEBUILD_RUNNER --repo "$private" --body "private-monorepo-ci"
    gh variable set CODEBUILD_RUNNER_DOCKER --repo "$private" --body "private-monorepo-ci-docker"
    echo "${private}: jobs run on the AWS CodeBuild runners from their next run."
    exit 0
    ;;
  --llm-gate)
    role="${2:?usage: configure.sh --llm-gate <role-arn> <workspace-id>}"
    workspace="${3:?usage: configure.sh --llm-gate <role-arn> <workspace-id>}"
    [[ "$role" =~ ^arn:aws:iam::[0-9]{12}:role/github/github-llm-gate$ ]] || { echo "expected the github-llm-gate role ARN (stacks/llm output)" >&2; exit 1; }
    repo="${GITHUB_REPOSITORY:-Duncan-Haywood/oss-monorepo}"
    gh variable set ADVERSARIAL_REVIEW_AWS_ROLE_ARN --repo "$repo" --body "$role"
    gh variable set CLAUDE_AWS_WORKSPACE_ID --repo "$repo" --body "$workspace"
    echo "adversarial-llm uses ${role} from its next run."
    exit 0
    ;;
esac

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
