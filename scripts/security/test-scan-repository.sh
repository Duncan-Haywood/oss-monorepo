#!/usr/bin/env bash
set -euo pipefail

scanner="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scan-repository.sh"
export GIT_CONFIG_GLOBAL=/dev/null
test_root="$(mktemp -d "${TMPDIR:-/tmp}/repository-policy-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

new_repo() {
  local name="$1"
  local path="$test_root/$name"
  mkdir -p "$path"
  git -C "$path" init -q
  git -C "$path" config user.email "ci@example.invalid"
  git -C "$path" config user.name "CI"
  printf '%s\n' "$path"
}

run_scan() {
  local path="$1"
  if ! git -C "$path" rev-parse --verify HEAD >/dev/null 2>&1; then
    git -C "$path" commit -q -m "policy scanner fixture"
  fi
  (
    cd "$path"
    "$scanner" "$path/report.md" >/dev/null
  )
}

clean_repo="$(new_repo clean)"
printf 'safe\n' >"$clean_repo/README.md"
git -C "$clean_repo" add README.md
run_scan "$clean_repo"

env_repo="$(new_repo tracked-env)"
printf 'TOKEN=not-a-real-secret\n' >"$env_repo/.env"
git -C "$env_repo" add .env
if run_scan "$env_repo"; then
  printf 'expected tracked .env to fail\n' >&2
  exit 1
fi
grep -q 'Sensitive file is tracked' "$env_repo/report.md"

terraform_repo="$(new_repo terraform-password)"
printf 'password = "not-a-real-password"\n' >"$terraform_repo/main.tf"
git -C "$terraform_repo" add main.tf
if run_scan "$terraform_repo"; then
  printf 'expected a literal Terraform password to fail\n' >&2
  exit 1
fi
grep -q 'Hard-coded Terraform credential detected' "$terraform_repo/report.md"

grafana_repo="$(new_repo terraform-admin-password)"
printf 'adminPassword = "not-a-real-password"\n' >"$grafana_repo/monitoring.tf"
git -C "$grafana_repo" add monitoring.tf
if run_scan "$grafana_repo"; then
  printf 'expected a literal Terraform admin password to fail\n' >&2
  exit 1
fi
grep -q 'Hard-coded Terraform credential detected' "$grafana_repo/report.md"

variable_repo="$(new_repo terraform-variable)"
printf 'password = var.database_password\n' >"$variable_repo/main.tf"
git -C "$variable_repo" add main.tf
run_scan "$variable_repo"

printf 'repository policy scanner tests passed\n'
