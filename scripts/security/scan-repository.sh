#!/usr/bin/env bash
# shellcheck disable=SC2016 # Markdown backticks are intentional literal output.
set -euo pipefail

report_path="${1:-security-scan-report.md}"
failures=0

record_failure() {
  failures=$((failures + 1))
  printf -- '- [ ] **%s:** `%s`\n' "$1" "$2" >>"$report_path"
}

{
  printf '# Repository security policy scan\n\n'
  printf 'Commit: `%s`\n\n' "${GITHUB_SHA:-$(git rev-parse HEAD)}"
  printf '## Blocking findings\n\n'
} >"$report_path"

while IFS= read -r path; do
  case "$path" in
    *.env.example|*.tfvars.example) ;;
    .env|.env.*|*/.env|*/.env.*|*.tfstate|*.tfstate.*|*.tfvars|*/id_rsa|*/id_ed25519|*.pem|*.p12|*.key)
      record_failure "Sensitive file is tracked" "$path"
      ;;
  esac
done < <(git ls-files)

private_key_matches="$(
  git grep -IlE -- \
    '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' \
    -- . ':(exclude)*.lock' ':(exclude)*.svg' 2>/dev/null || true
)"
while IFS= read -r path; do
  [[ -z "$path" ]] || record_failure "Private-key material detected" "$path"
done <<<"$private_key_matches"

conflict_matches="$(
  git grep -IlE -- '^(<<<<<<< |=======|>>>>>>> )' -- . 2>/dev/null || true
)"
while IFS= read -r path; do
  [[ -z "$path" ]] || record_failure "Unresolved merge marker" "$path"
done <<<"$conflict_matches"

terraform_password_matches="$(
  git grep -IlE -- \
    '^[[:space:]]*(adminPassword|password|users)[[:space:]]*=[[:space:]]*"[^"]+"' \
    -- '*.tf' 2>/dev/null || true
)"
while IFS= read -r path; do
  [[ -z "$path" ]] || record_failure "Hard-coded Terraform credential detected" "$path"
done <<<"$terraform_password_matches"

{
  printf '\n## Controls checked\n\n'
  printf -- '- Tracked environment, Terraform state/variables, private-key, and certificate files\n'
  printf -- '- Private-key block markers in tracked content\n'
  printf -- '- Literal passwords and htpasswd entries in Terraform configuration\n'
  printf -- '- Unresolved merge-conflict markers\n'
  printf '\n## Result\n\n'
  if ((failures == 0)); then
    printf 'PASS — no blocking repository-policy findings.\n'
  else
    printf 'FAIL — %d blocking finding(s). Remove the material from the commit, rotate any exposed credential, and follow the history-remediation procedure in `SECURITY.md`.\n' "$failures"
  fi
} >>"$report_path"

cat "$report_path"
((failures == 0))
