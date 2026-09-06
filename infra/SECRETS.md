# Where the secrets live

**Short version.** Keep them in a directory of mode-600 files on the machine
that runs your agents, read them with `bootstrap/scripts/load-secrets.sh`, and
keep an age-encrypted copy in `infra/secrets/` so a fresh checkout is one key
away from working. GitHub Actions keeps only the secrets that a workflow is
the sole consumer of.

```
bootstrap/scripts/load-secrets.sh --put HETZNERSSHKEY < ~/.ssh/id_ed25519
bootstrap/scripts/load-secrets.sh --put ARGOCD_REPO_TOKEN   # paste, then Ctrl-D
bootstrap/scripts/load-secrets.sh                           # what is present, no values

bootstrap/scripts/load-secrets.sh --exec -- \
  env CONFIRM=restore-cluster WITH_CODEX_HOST=1 WITH_GITHUB_RUNNER_HOST=1 \
  bootstrap/restore-cluster.sh
```

That last command is the whole deploy. It needs no Actions runner, no k3s, and
no second paste.

## Why Actions was the wrong store

An Actions secret is readable by exactly one thing: a runner. Runners here are
metered and the allowance is spent — `portfolio/ledger/infra_state.yaml`
records `github-actions-runners: down`, held across four independent dispatches
on 2026-09-05, with the ceiling expected to reset on 2026-10-01.

So the credentials became unreachable at the same moment, and for the same
reason, as the thing they were meant to unblock. "The secret is in Actions"
reads like the secret is *stored*; it is closer to being *deposited with a
service that is currently closed*.

The sharp version of that is the SSH key. `bootstrap/restore-cluster.sh` is the
entire cluster recovery and it runs from any laptop — the boxes have answered
on `:22` throughout the outage (`Outage triage` run 33889983086). The one thing
standing between this repository and a served catalogue was never compute. It
was that the key to the machines that were up lived only in the system that was
down. And because nothing off-runner could read it, nobody could see that the
secret has held a **public** key since it was first pasted (run 33884253173) —
a fact that cost a workflow dispatch to discover and now costs one local
command:

```
$ bootstrap/scripts/load-secrets.sh
SECRET                 SOURCE       NOTE
HETZNERSSHKEY          file         PUBLIC key — cannot open a session; store the private half
```

## Why not Vault / 1Password / Doppler / Infisical

Measured 2026-09-06 from a Claude Code web session, which is where these
automations run:

| host | result |
|---|---|
| `api.github.com` | 200 |
| `vault.example.com` | `403 to CONNECT` |
| `api.1password.com` | `403 to CONNECT` |
| `api.doppler.com` | `403 to CONNECT` |
| `app.infisical.com` | `403 to CONNECT` |
| `api.hetzner.cloud` | `403 to CONNECT` |

The session's egress proxy allows GitHub, the package registries and the
Anthropic API, and refuses everything else at the gateway. A hosted secret
manager would put the credentials somewhere the automation *cannot reach* —
the same failure as Actions, with a subscription attached. Read
`/root/.ccr/README.md` in a session and re-run
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` before assuming this changed.

A local directory needs no egress at all, which is why it is the answer.

## What each of your four surfaces can actually do

Worth being precise, because "give the agents the secrets" does not make every
agent able to deploy:

| surface | reads the store? | can it reach the boxes? |
|---|---|---|
| Cursor, on your machine | yes, directly | **yes** — this is the deployer |
| Claude Code, local CLI | yes, directly | **yes** |
| Claude Code on the web | only via `infra/secrets/*.age` + the age key in the environment's variables | **no** — `:22` is blocked and there is no `ssh` binary (measured 2026-09-06) |
| GitHub Actions | its own secrets | yes, when a runner exists |

So the web sessions are for building, reviewing and merging; the deploy is
driven from Cursor or the local CLI. That limit is the egress policy, not the
secret store, and no choice of store lifts it.

For a web session that needs a credential anyway (a wider `GH_TOKEN`, say), put
it in the environment's variables at claude.ai/code rather than in the
repository — see https://code.claude.com/docs/en/claude-code-on-the-web. The
one worth putting there is the **age identity**, because it turns the committed
`infra/secrets/*.age` files into a working store in any fresh session.

## What the store holds

Six credentials, and the reason each is here rather than in Actions is that
something *off* a runner needs it. The authoritative list is
[`infra/secrets/registry.tsv`](secrets/registry.tsv) — this table is prose for
it, and a test asserts they name the same set.

| secret | gates |
|---|---|
| `HETZNERSSHKEY` | SSH to both boxes: the cluster restore, the host-mode site, every runner-free route |
| `ARGOCD_REPO_TOKEN` | Argo CD cloning this private repo. Skip it and the restore succeeds with the site still dark |
| `GH_TOKEN` | the agents identity — opening PRs, reading CI, the Codex worker |
| `HCLOUD_TOKEN` | `preflight.sh`, `make discover`, `tofu plan`. Read-only by policy; never store a write token here |
| `RUNNER_TOKEN` | registering the host-mode Actions runner (`gitops/ci/host`) — the unmetered CI that makes the next starvation window a non-event |
| `OPENAI_API_KEY` | the Codex worker's dev capacity (`gitops/agents/host`) |

The last two are the ones worth taking while you already hold the SSH key:
between them they rebuild the two schedulers that died with the cluster, and
neither depends on Actions minutes afterwards.

## The three sources, in order

`load-secrets.sh` resolves each name against, first hit wins:

1. **the process environment** — so CI and one-off overrides keep working
   unchanged;
2. **`$SECRETS_DIR/<NAME>`**, default `~/.config/marisstella/secrets/<NAME>`,
   one file per secret, mode 600 in a mode-700 directory;
3. **`infra/secrets/<NAME>.age`**, committed, opened with the identity at
   `$AGE_IDENTITY_FILE` (default `~/.config/sops/age/keys.txt`, the path
   `bootstrap/scripts/gen-age-key.sh` already writes and the one sops reads).

One file per secret rather than a single `.env`: an SSH private key is
multi-line, and every `.env` parser handles that with escaping rules that the
next tool spells differently. A file holds bytes.

(3) is optional. The store works with (2) alone; the encrypted copies exist so
a second machine, or a fresh clone, is one `age` identity away from being able
to deploy — rather than a re-paste of six credentials away.

### Getting a secret in

```
bootstrap/scripts/load-secrets.sh --put HETZNERSSHKEY < ~/.ssh/id_ed25519
bootstrap/scripts/load-secrets.sh --put GH_TOKEN         # paste, Ctrl-D
```

Reads stdin, never argv, so the value does not land in your shell history or in
`ps`. `--put` prints back what it thinks it stored ("private key, 7 lines"),
which is where a pasted public key gets caught.

### Getting a secret out

- `--check` (the default) — a table of name, source and shape. **No values**,
  so it is safe to run in a shared session or paste into an issue.
- `--get NAME` — one value on stdout, for a script that wants exactly one.
- `--export` — `export NAME=…` lines for `eval`. Convenient and leaky: the
  values stay in that shell for as long as it lives.
- `--exec -- <command>` — **prefer this.** The secrets land in one child
  process and nowhere else. It also starts a throwaway `ssh-agent` holding
  `HETZNERSSHKEY` and kills it on exit, so `restore-cluster.sh` authenticates
  without touching your own agent or `~/.ssh`.

### Keeping the encrypted copy current

```
bootstrap/scripts/gen-age-key.sh                       # once, on your machine
grep '^# public key:' ~/.config/sops/age/keys.txt      # paste into recipients.txt
bootstrap/scripts/load-secrets.sh --encrypt HETZNERSSHKEY
```

`*.age` is ASCII-armored so it diffs as text. The private half of the age key
stays on your machine: `infra/OWNER_CHECKLIST.md` already rules that an age
private key must not become an Actions secret, and that rule holds here.

Adding a recipient means re-running `--encrypt` for each secret — age fixes the
recipient set at encryption time. Removing one is **not** a revocation: anyone
who held the old file can still open it, so a removal means rotating the
underlying credential.

## What stays in Actions

The reviewer GitHub Apps, `CLOUDFLARE_API_TOKEN`, the Vercel trio,
`DOCS_PASSCODE`. Nothing off-runner consumes them, so moving them here would
widen what one laptop's compromise costs and buy nothing.

`HETZNERSSHKEY` and `ARGOCDREPOTOKEN` are worth keeping in *both* places once
the private key is rotated, so the recovery is repeatable from a dispatch when
runners return. Actions stops being the only copy — that is the change — rather
than stopping being a copy.

## If you are adding a secret

Add the row to [`infra/secrets/registry.tsv`](secrets/registry.tsv) and a line
to this file in the same commit. `gitops/tests/test_load_secrets.py` asserts the
two agree, because the thing that actually goes wrong with a secrets inventory
is not that it is wrong on the day it is written.
