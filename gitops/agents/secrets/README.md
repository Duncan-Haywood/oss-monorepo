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
does not bill. The worker prints an `auth mode:` line naming the budget on
every run, so no tick is ambiguous about whose it spent.

**How that tie is actually decided (fixed 2026-09-02).** Until then this
paragraph was a claim about which `if` branch `worker.sh` took, and the test
behind it compared the two branches' positions in the file. Taking a branch in
bash does nothing to the environment, though, and `codex exec` inherits it — so
a Secret carrying both handed the CLI a live `OPENAI_API_KEY` on a run that had
just announced itself as the plan's. Which credential the CLI prefers there is
not something this repo controls, and the failure is silent in the direction
that costs money. `worker.sh` now `unset`s the metered key on the plan route
and says so in the log, which makes the preference above true by construction
rather than by hope. `test_worker_run.py` asserts it against the environment
the stub CLI is actually handed, in both directions — the key must be gone on
the plan route and still present when it is the only credential sealed.

Note that `seal-owner-secrets.sh` writes one credential at a time, so its own
output never reaches this state. `codex-token.template.yaml` carries both keys
and the manual `kubeseal` path below is over that template, which is how a
Secret with both gets made.

One consequence worth knowing: a credential cached on the `codex-home` volume
no longer outranks a freshly sealed `OPENAI_API_KEY`. The volume is a cache and
the Secret is your current intent, so switching from the plan to a metered key
now takes effect on the next tick instead of being shadowed by the old login
until it expired.

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

**Wired on the governor side 2026-09-02.** Until then only the worker knew
that: `governor.py` branched on 42 and on the no-op marker and read 43 as an
ordinary crash, so the CronJob went on firing every five minutes and each Job
`apt-get`ed `gh` and `npm install -g`ed the Codex CLI on the 4 GB cpx22 before
discovering the same dead credential — around 288 of them a day, none of which
could ever succeed, because no amount of retrying re-runs `codex login` on
your laptop. That mattered most on this page's *plan* route: an
`OPENAI_API_KEY` is static, but `CODEX_AUTH_JSON` is the one Codex rotates on
use, so a wedged credential is its ordinary failure mode rather than a
hypothetical.

Now the worker also writes a `codex-auth-rejected:` marker to
`/dev/termination-log` (so `kubectl describe job` states the reason after the
Job's logs have been TTL'd away), and the governor holds the queue for
`cooldownOnAuthFailureSeconds` — 6 h in `policy.json`, deliberately longer than
the 1 h limit cooldown, because the limit clears itself and this does not.

It is a cooldown, not a latch. The governor's Role grants no access to
`codex-secrets`, so it cannot watch for your re-seal, and widening it to watch
a credential it must never read would be a bad trade. Instead the hold simply
expires: re-run `codex login`, re-seal, and the first Job after the sleep
re-seeds the volume from the new fingerprint on its own. Nothing to flip.

## Not in this namespace

Do not store a Hetzner token (Read or Write), an OpenAI Admin key, the
SOPS/age private key, or a kubeconfig here.
