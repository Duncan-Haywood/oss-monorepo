# Secrets (ciphertext only)

Nothing in this folder is applied by kustomize. Seal these on a laptop
that holds the Sealed Secrets key, then commit the `SealedSecret` YAML
into `gitops/agents/` in a follow-up PR.

Required keys in a Secret named `codex-secrets` (namespace `agents`):

| Key | What |
|---|---|
| `OPENAI_API_KEY` | Project API key on a **separate** OpenAI org from your main ChatGPT login. That org has a dashboard **hard** monthly spend limit. Not an Admin API key (Admin can raise the cap). |
| `GH_TOKEN` | Fine-grained PAT: this repo, contents + PRs, no admin, cannot push `main`. Different identity from Argo's read-only deploy key. |

Optional: `CODEX_ACCESS_TOKEN` (ChatGPT device-auth). Do not use your
main Plus/Pro login — that has no euro hard stop and shares the
personal 5-hour / weekly quota. Prefer `OPENAI_API_KEY`.

Do not store a Hetzner token (Read or Write), an OpenAI Admin key, the
SOPS/age private key, or a kubeconfig in this namespace.
