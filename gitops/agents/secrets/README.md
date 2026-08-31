# Secrets (ciphertext only)

Nothing in this folder is applied by kustomize. Seal these on a laptop
that holds the Sealed Secrets key, then commit the `SealedSecret` YAML
into `gitops/agents/` in a follow-up PR.

`./bootstrap/scripts/seal-owner-secrets.sh agents` does that, and offers
the two credentials below as a choice rather than leaving you to edit the
template around whichever one you picked. Read "Which one to seal" first —
that decision is the owner's, and the script only records it.

Seal with `kubeseal --format yaml --controller-namespace sealed-secrets
--controller-name sealed-secrets < codex-token.template.yaml >
codex-token.sealed.yaml`. The `--controller-name` flag is required: kubeseal
defaults to looking up a Service named `sealed-secrets-controller`, but
`../../apps/sealed-secrets.yaml` deploys the chart as an Argo Application
named `sealed-secrets` with no `releaseName` override, so the controller's
actual Service in this cluster is named `sealed-secrets`. Omitting the flag
fails before anything is sealed.

Required in a Secret named `codex-secrets` (namespace `agents`): `GH_TOKEN`,
and **one** of the two Codex credentials.

| Key | What |
|---|---|
| `GH_TOKEN` | Fine-grained PAT: this repo, contents + PRs, no admin, cannot push `main`. Different identity from Argo's read-only deploy key. |
| `OPENAI_API_KEY` | Project API key on a **separate** OpenAI org from your main ChatGPT login. That org has a dashboard **hard** monthly spend limit. Not an Admin API key (Admin can raise the cap). |
| `CODEX_AUTH_JSON` | The whole contents of `~/.codex/auth.json` after `codex login`. Spends a ChatGPT plan's included usage instead of billing per token. |

Seal both credentials and the subscription wins, because it is the one that
does not bill. The worker prints which mode it authenticated in on every run,
so no tick is ambiguous about whose budget it spent.

## Which one to seal

This is a real trade-off and the checklist is right that it is the owner's to
make, not an agent's to infer.

- **`OPENAI_API_KEY`** is what `infra/OWNER_CHECKLIST.md` walks through, and its
  argument stands: a separate org with an enforced monthly limit means the
  worst case is a known number of euros, and a 429 from
  `organization_spend_limit_exceeded` is a signal the governor already
  understands (worker exit 42).
- **`CODEX_AUTH_JSON`** is the "use the built-in quota" shape: a tick costs
  nothing extra because the plan is already paid for. The checklist's warning
  about it is also still true — a plan has **no euro hard stop**, and its
  5-hour and weekly windows are shared with whoever is logged into that
  account. Signing in with the owner's day-to-day ChatGPT login means the fleet
  competes with their interactive use for the same quota. A separate plan seat
  avoids that; `policy.json`'s `reserveForInteractive` and
  `weeklyBudgetFraction` are what soften it if you do share one.

**Changed 2026-08-29.** Previously this file listed `CODEX_ACCESS_TOKEN` as an
optional extra and said "Prefer `OPENAI_API_KEY`". The subscription route was
never actually wired: the CLI reads a whole `auth.json` from `$CODEX_HOME` and
has no environment variable for a plan token, so the worker's check on
`CODEX_ACCESS_TOKEN` proved a variable was set and nothing more — a
subscription-only Secret failed at the first API call. `CODEX_AUTH_JSON` is
that route, working. The API-key path is unchanged and still supported; the
preference language is gone because both are now real options.

## Minting `CODEX_AUTH_JSON`

```
codex login                       # opens a browser
cat ~/.codex/auth.json            # one line of JSON — this is the value
```

If `~/.codex/auth.json` does not exist after logging in, the CLI stored the
credential in the OS keychain instead. Put `cli_auth_credentials_store = "file"`
in `~/.codex/config.toml` and log in again; the worker sets the same key on the
cluster side so the CLI reads the file it is given.

## Where the credential lives at runtime

The worker writes `auth.json` onto the `codex-home` PVC
(`gitops/agents/codex-home.yaml`) rather than into the pod's filesystem. Codex
rotates the credential on use, and a Job that re-seeded from this Secret every
time would keep presenting an already-spent refresh token.

The Secret still wins when it changes: the worker fingerprints the sealed value
and re-seeds whenever that fingerprint differs from what the volume was seeded
with. So re-running `codex login` and re-sealing is always the way to recover a
wedged credential, and doing it when nothing is wrong is harmless.

A rejected credential exits **43**, distinct from the **42** a quota limit
exits with. Backing off for an hour does not fix an expired login, and the two
should not be read as the same event.

## Not in this namespace

Do not store a Hetzner token (Read or Write), an OpenAI Admin key, the
SOPS/age private key, or a kubeconfig here.
