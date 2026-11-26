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
#   * pins the OIDC subject template of this repository and private-monorepo
#     (below, --oidc-sub);
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
# It also sets and checks both repositories' OIDC subject template (any run,
# and on its own with --oidc-sub):
#
#   bash platform/aws/github/configure.sh --oidc-sub
#
# The claim keys are pinned to ["repo","context"], so the subject ends in the
# usual :pull_request / :environment:<env> / :ref:<ref> context. Which prefix
# GitHub puts before it is not set by the keys: while the repository reads
# use_immutable_subject: true, GitHub writes repo:<owner>@<owner-id>/<name>@<repo-id>,
# otherwise repo:<owner>/<name> (runs 45905276526 and 45906725339 were refused
# for that before the trusts accepted the ID form). The script reads the
# setting back, prints sub_claim_prefix, and fails unless it is one of the two
# forms the trusts accept for that repository.
# docs/reports/2026-11-26-github-oidc-subject-form.md.
#
# Idempotent. Needs `gh` logged in with repo admin (gh auth status). Account
# IDs are not secrets, so these are variables, not secrets.
set -euo pipefail

# The claim keys; the trusts' contexts (pull_request, environment:<env>,
# ref:refs/heads/main) need exactly these.
OIDC_SUB_KEYS='["repo","context"]'

pin_oidc_sub() {
  local r="$1" owner_id repo_id name_form id_form got default keys immutable prefix
  gh api -X PUT "repos/${r}/actions/oidc/customization/sub" --input - >/dev/null <<JSON
{"use_default":false,"include_claim_keys":${OIDC_SUB_KEYS}}
JSON
  owner_id="$(gh api "users/${r%%/*}" --jq .id)"
  repo_id="$(gh api "repos/${r}" --jq .id)"
  name_form="repo:${r}"
  id_form="repo:${r%%/*}@${owner_id}/${r#*/}@${repo_id}"
  got="$(gh api "repos/${r}/actions/oidc/customization/sub" \
    --jq '"\(.use_default) \(.include_claim_keys // [] | tojson) \(.use_immutable_subject // false) \(.sub_claim_prefix // "")"')"
  read -r default keys immutable prefix <<<"$got"
  echo "${r}: use_default=${default} include_claim_keys=${keys} use_immutable_subject=${immutable} sub_claim_prefix=${prefix:-(none)}"
  [ "$default" = false ] && [ "$keys" = "$OIDC_SUB_KEYS" ] || {
    echo "${r}: expected use_default=false and include_claim_keys=${OIDC_SUB_KEYS}" >&2; return 1; }
  # No prefix in the reply: GitHub's name form, unless immutable subjects are on.
  if [ -z "$prefix" ]; then
    [ "$immutable" = true ] && { echo "${r}: immutable subjects are on but no sub_claim_prefix was returned; check the subject in CloudTrail" >&2; return 1; }
    prefix="$name_form"
  fi
  case "$prefix" in
    "$id_form") echo "${r}: sub = ${id_form}:<context> (ID form)" ;;
    "$name_form") echo "${r}: sub = ${name_form}:<context> (name form)" ;;
    *) echo "${r}: sub_claim_prefix ${prefix} is neither ${name_form} nor ${id_form}; the AWS trusts will refuse its tokens" >&2; return 1 ;;
  esac
}

pin_oidc_sub_all() {
  pin_oidc_sub "${GITHUB_REPOSITORY:-Duncan-Haywood/oss-monorepo}"
  # stacks/github-oidc's payments roles trust private-monorepo.
  pin_oidc_sub "${PRIVATE_REPOSITORY:-Duncan-Haywood/private-monorepo}"
}

case "${1:-}" in
  --oidc-sub)
    pin_oidc_sub_all
    exit 0
    ;;
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
    [[ "$role" =~ ^arn:aws:iam::[0-9]{12}:role/(github|ci)/github-llm-gate$ ]] || { echo "expected the github-llm-gate role ARN (stacks/llm output)" >&2; exit 1; }
    repo="${GITHUB_REPOSITORY:-Duncan-Haywood/oss-monorepo}"
    gh variable set ADVERSARIAL_REVIEW_AWS_ROLE_ARN --repo "$repo" --body "$role"
    gh variable set CLAUDE_AWS_WORKSPACE_ID --repo "$repo" --body "$workspace"
    echo "adversarial-llm uses ${role} from its next run."
    exit 0
    ;;
esac

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

pin_oidc_sub_all

gh variable set AWS_ACCOUNT_ID --repo "$repo" --body "$account"
gh variable set AWS_REGION --repo "$repo" --body "$region"
gh variable set AWS_ACCOUNT_MODE --repo "$repo" --body "$mode"
echo "variables AWS_ACCOUNT_ID, AWS_REGION and AWS_ACCOUNT_MODE (${mode}) set; the next push to main under platform/aws/ applies."
