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

key_repo="$(new_repo private-key)"
printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\nnot-real\n' >"$key_repo/notes.txt"
git -C "$key_repo" add notes.txt
if run_scan "$key_repo"; then
  printf 'expected private-key material to fail\n' >&2
  exit 1
fi
grep -q 'Private-key material detected' "$key_repo/report.md"

# The merge-marker detector, which had no case here until 2026-08-08 — and on
# that day an unresolved conflict was committed to `main` in
# `platform/ci/test/security-audit-log-integrity.test.mjs`, where it sat for six
# commits. The scanner would have caught it; nothing on the path that merge took
# ran the scanner. The runner registration is the other half of that fix, in
# `scripts/test-ci.sh`. This half is so that the detector cannot rot unnoticed
# before the next one.
#
# The fixture is the real shape: a `.mjs` file whose two sides each define the
# same function, which is what makes this failure so quiet — the file looks like
# code, and the duplicate-definition scan reports it as a *different* defect.
conflict_repo="$(new_repo merge-conflict)"
cat >"$conflict_repo/module.mjs" <<'CONFLICTED'
export function shared() {
<<<<<<< HEAD
  return 'ours';
=======
  return 'theirs';
>>>>>>> agent/some-branch
}
CONFLICTED
git -C "$conflict_repo" add module.mjs
if run_scan "$conflict_repo"; then
  printf 'expected an unresolved merge marker to fail\n' >&2
  exit 1
fi
grep -q 'Unresolved merge marker' "$conflict_repo/report.md"

# A detector that fires on everything is not a detector. `=======` is a marker
# only on its own line: an inline run of equals signs, a short rule, and the
# words that name the markers in prose must all pass, or the first document that
# explains this control turns its own gate red and invites someone to delete it.
marker_prose_repo="$(new_repo merge-marker-prose)"
cat >"$marker_prose_repo/NOTES.md" <<'PROSE'
Resolve a conflict by deleting the <<<<<<< and >>>>>>> lines.
| a ======= b |
====
PROSE
git -C "$marker_prose_repo" add NOTES.md
if ! run_scan "$marker_prose_repo"; then
  printf 'merge-marker detector fired on prose that contains no marker:\n' >&2
  cat "$marker_prose_repo/report.md" >&2
  exit 1
fi

printf 'repository policy scanner tests passed\n'
