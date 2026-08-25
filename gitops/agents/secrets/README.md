# Secrets (ciphertext only)

Nothing in this folder is applied by kustomize. Seal these on a laptop
that holds the Sealed Secrets key, then commit the `SealedSecret` YAML
into `gitops/agents/` in a follow-up PR.

Required keys in a Secret named `codex-secrets` (namespace `agents`):

| Key | What |
|---|---|
| `CODEX_ACCESS_TOKEN` | ChatGPT/Codex access token. You mint this. |
| `GH_TOKEN` | GitHub token or app-derived token with contents + PRs, not admin, not ability to push `main`. |

Different identity from Argo's read-only git credentials.

Do not store the Hetzner API token, the SOPS/age private key, or a
kubeconfig in this namespace.
