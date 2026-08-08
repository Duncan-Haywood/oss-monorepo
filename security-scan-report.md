# Repository security policy scan

Commit: `5f311624b6c7d4a04914ff4eb4e9f85717db9c8f`

## Blocking findings

- [ ] **Unresolved merge marker:** `platform/k8s/apps/quick-pick-survey/deployment.yaml`
- [ ] **Unresolved merge marker:** `ventures/quick-pick-survey/src/lib/ogCardFields.test.ts`

## Controls checked

- Tracked environment, Terraform state/variables, private-key, and certificate files
- Private-key block markers in tracked content
- Literal passwords and htpasswd entries in Terraform configuration
- Unresolved merge-conflict markers

## Result

FAIL — 2 blocking finding(s). Remove the material from the commit, rotate any exposed credential, and follow the history-remediation procedure in `SECURITY.md`.
