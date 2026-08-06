# Repository security policy scan

Commit: `c626411e09879c08fd824c63a0a807a8439fdf1e`

## Blocking findings

- [ ] **Unresolved merge marker:** `ventures/quick-pick-survey/src/lib/ogCardFields.test.ts`

## Controls checked

- Tracked environment, Terraform state/variables, private-key, and certificate files
- Private-key block markers in tracked content
- Literal passwords and htpasswd entries in Terraform configuration
- Unresolved merge-conflict markers

## Result

FAIL — 1 blocking finding(s). Remove the material from the commit, rotate any exposed credential, and follow the history-remediation procedure in `SECURITY.md`.
