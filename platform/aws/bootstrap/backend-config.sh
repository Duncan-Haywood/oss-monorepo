#!/usr/bin/env bash
# Print the partial backend configuration for a stack under platform/aws/.
#   ./backend-config.sh <stack> [sub/key] > backend.hcl
# The bucket name is derived, not stored: <prefix>-tfstate-<management account>-<region>.
# AWS_MANAGEMENT_ACCOUNT_ID (a GitHub Actions variable in CI) names the account;
# without it the caller's own account is used (right for management-account stacks).
set -euo pipefail
stack="${1:?usage: backend-config.sh <stack> [sub/key]}"
sub="${2:-}"
[[ "$stack" =~ ^[a-z][a-z0-9-]*$ ]] || { echo "bad stack name: $stack" >&2; exit 2; }
[[ -z "$sub" || "$sub" =~ ^[a-z0-9/-]+$ ]] || { echo "bad sub key: $sub" >&2; exit 2; }
prefix="${AWS_STATE_PREFIX:-oss-monorepo}"
region="${AWS_STATE_REGION:-us-east-1}"
account="${AWS_MANAGEMENT_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
[[ "$account" =~ ^[0-9]{12}$ ]] || { echo "bad account id" >&2; exit 2; }
key="stacks/${stack}${sub:+/$sub}/terraform.tfstate"
printf 'bucket = "%s-tfstate-%s-%s"\nkey    = "%s"\nregion = "%s"\n' "$prefix" "$account" "$region" "$key" "$region"
