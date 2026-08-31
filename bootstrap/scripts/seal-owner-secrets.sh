#!/usr/bin/env bash
# Seal the three owner-held secrets that are the only thing between this
# repository and a running portfolio. Run it on YOUR laptop, with a kubeconfig
# for the hel1 cluster and `kubeseal` installed.
#
#   ./bootstrap/scripts/seal-owner-secrets.sh            # all three, in order
#   ./bootstrap/scripts/seal-owner-secrets.sh site       # just one
#   ./bootstrap/scripts/seal-owner-secrets.sh --dry-run  # preflight only
#
# Why this exists
# ---------------
# The three seals were documented across six files (infra/OWNER_CHECKLIST.md,
# gitops/README.md, gitops/ci/README.md, gitops/agents/secrets/README.md and
# two *.template.yaml headers) plus fourteen decision-queue rows. None of that
# was wrong; it was just never assembled into something you could run. The
# information was not the bottleneck.
#
# It is also safer than the procedure it replaces. Every template header says
# "replace CHANGE_ME, seal it, commit the sealed output" and then has to warn
# you never to commit the file you just edited. This script never writes a
# plaintext token anywhere: values are read with echo off, base64-encoded in a
# shell variable, piped into kubeseal on stdin, and the sealed output is
# checked for the plaintext before it is written. Nothing lands on disk in the
# clear and nothing appears in `ps` (printf is a builtin, so no token is ever
# an argv).
#
# It does not merge, push, or apply anything. It writes SealedSecret files and
# adds them to the right kustomization; Argo does the rest on your next push.
set -euo pipefail

REPO_SLUG="Duncan-Haywood/monorepo-projects"
CONTROLLER_NS="sealed-secrets"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DRY_RUN=0
PROBE=1
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-probe) PROBE=0 ;;
    site|ci|agents) TARGETS+=("$arg") ;;
    all) TARGETS=(site ci agents) ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg (want: site | ci | agents | all | --dry-run | --no-probe)" >&2; exit 2 ;;
  esac
done
[[ ${#TARGETS[@]} -eq 0 ]] && TARGETS=(site ci agents)

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
ok()   { printf '  + %s\n' "$*"; }

# ---------------------------------------------------------------- preflight

step "Preflight"

# Collect every missing tool before reporting. Exiting on the first one costs
# the owner a round trip per prerequisite -- install kubectl, re-run, discover
# kubeseal, re-run -- and the owner is the scarce resource this whole script
# exists to spend less of. One list, one install, one re-run.
MISSING=()
for tool in kubectl kubeseal base64; do
  command -v "$tool" >/dev/null 2>&1 || MISSING+=("$tool")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  for tool in "${MISSING[@]}"; do
    warn "missing: $tool"
    case "$tool" in
      kubectl)  warn "    https://kubernetes.io/docs/tasks/tools/" ;;
      kubeseal) warn "    https://github.com/bitnami-labs/sealed-secrets/releases" ;;
    esac
  done
  warn "install the above and re-run. Nothing was sealed."
  exit 1
fi
ok "kubectl, kubeseal, base64 present"

if ! kubectl version -o json >/dev/null 2>&1; then
  warn "kubectl cannot reach a cluster. Point KUBECONFIG at the hel1 cluster first."
  exit 1
fi
ok "cluster reachable as $(kubectl config current-context)"

# The documented footgun, solved by detection rather than by remembering.
# kubeseal defaults to a Service named "sealed-secrets-controller"; this
# cluster's is named "sealed-secrets", because gitops/apps/sealed-secrets.yaml
# deploys the chart as an Argo Application of that name with no releaseName
# override and Helm's release name becomes the Service name. Omitting
# --controller-name 404s before anything is sealed. Rather than restate that,
# ask the cluster which Service actually exists.
CONTROLLER_NAME="$(
  kubectl -n "$CONTROLLER_NS" get svc -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null \
    | grep -E '^sealed-secrets' | head -1 || true
)"
if [[ -z "$CONTROLLER_NAME" ]]; then
  warn "no sealed-secrets Service found in namespace '$CONTROLLER_NS'."
  warn "Is the sealed-secrets Argo Application synced? kubectl -n $CONTROLLER_NS get svc"
  exit 1
fi
ok "sealed-secrets controller: svc/$CONTROLLER_NAME in $CONTROLLER_NS"

if [[ $DRY_RUN -eq 1 ]]; then
  say ""
  say "Dry run: preflight passed, nothing sealed. Re-run without --dry-run."
  exit 0
fi

# ------------------------------------------------------------------ helpers

# Read a secret value with the terminal echo off. Never echoed, never logged.
read_secret() {
  local __var="$1" prompt="$2" value=""
  printf '  %s: ' "$prompt" >&2
  read -rs value
  printf '\n' >&2
  [[ -n "$value" ]] || { warn "empty value — nothing sealed"; return 1; }
  printf -v "$__var" '%s' "$value"
}

b64() { printf '%s' "$1" | base64 | tr -d '\n'; }

# The raw values the current seal is handling, so seal_to's guard can check the
# ciphertext for both the encoded and the unencoded form. Each seal_* function
# sets this immediately before calling seal_to, and seal_to clears it after.
SEAL_PLAINTEXT=()

# Ask GitHub whether the token can actually do the one thing its pod needs.
# This is the difference between finding out now and finding out from a
# CrashLoopBackOff after the next Argo sync.
probe_can_read_repo() {
  local token="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO_SLUG" 2>/dev/null || echo 000)"
  [[ "$code" == "200" ]]
}

probe_can_mint_runner_token() {
  # Exactly the call gitops/ci/runner-entrypoint.sh makes at pod start. The
  # registration token it returns is short-lived and goes unused here.
  local token="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO_SLUG/actions/runners/registration-token" 2>/dev/null || echo 000)"
  [[ "$code" == "201" ]]
}

# Build a Secret manifest in memory, seal it, and write only the ciphertext.
# $1 name  $2 namespace  $3 output path  $4.. key=b64value pairs
seal_to() {
  local name="$1" ns="$2" out="$3"; shift 3
  local manifest sealed pair

  manifest="apiVersion: v1
kind: Secret
metadata:
  name: $name
  namespace: $ns
type: Opaque
data:"
  for pair in "$@"; do
    manifest+="
  ${pair%%=*}: ${pair#*=}"
  done

  sealed="$(printf '%s\n' "$manifest" | kubeseal --format yaml \
    --controller-namespace "$CONTROLLER_NS" \
    --controller-name "$CONTROLLER_NAME")" || {
      warn "kubeseal failed — nothing written"
      return 1
    }

  # Belt and braces: a SealedSecret that still contains the secret would mean
  # kubeseal did not encrypt, and committing it would leak the token.
  #
  # Both forms are checked. The base64 is what the manifest actually carries,
  # so a kubeseal that echoed its input leaks that; but "did not encrypt" is
  # not the only shape this can take -- a wrapper that decoded the manifest,
  # or a future --raw mode, would leak the token itself and sail past a check
  # that only knew the encoded form. The guard is here for the case nobody
  # predicted, so it should not assume which one it is looking at.
  for pair in "$@"; do
    if printf '%s' "$sealed" | grep -qF -- "${pair#*=}"; then
      warn "sealed output still contains the encoded value — refusing to write $out"
      return 1
    fi
  done
  for secret in ${SEAL_PLAINTEXT[@]+"${SEAL_PLAINTEXT[@]}"}; do
    if printf '%s' "$sealed" | grep -qF -- "$secret"; then
      warn "sealed output still contains the plaintext value — refusing to write $out"
      return 1
    fi
  done

  mkdir -p "$(dirname "$out")"
  printf '%s\n' "$sealed" > "$out"
  SEAL_PLAINTEXT=()
  ok "wrote $(realpath --relative-to="$ROOT" "$out")"
}

# Add a resources entry to a kustomization without disturbing its comments.
# Line-based on purpose: parsing and re-dumping the YAML would drop the
# explanatory comments these files carry, which are load-bearing for the next
# reader.
kustomize_add() {
  local kfile="$1" entry="$2"
  if grep -qF -- "- $entry" "$kfile"; then
    ok "$entry already in $(basename "$(dirname "$kfile")")/kustomization.yaml"
    return 0
  fi
  command -v python3 >/dev/null 2>&1 || {
    warn "python3 not found — add this line yourself under resources: in $kfile"
    warn "  - $entry"
    return 0
  }
  python3 - "$kfile" "$entry" <<'PY'
import sys

path, entry = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines()

in_resources, last = False, None
for i, line in enumerate(lines):
    if line.startswith("resources:"):
        in_resources = True
        last = i
        continue
    if in_resources:
        if line.startswith((" ", "\t")) and line.lstrip().startswith("- "):
            last = i
        elif line and not line[0].isspace() and not line.lstrip().startswith("#"):
            break

if last is None:
    sys.exit("no resources: block in %s" % path)

lines.insert(last + 1, "  - %s" % entry)
open(path, "w").write("\n".join(lines) + "\n")
PY
  ok "added '- $entry' to $(basename "$(dirname "$kfile")")/kustomization.yaml"
}

# -------------------------------------------------------------------- seals

seal_site() {
  step "1/3  Public product site — tools.marisstella.dev"
  say "  Serves 164 finished tools. The site pod's 'fetch' init container"
  say "  clones this private repo, so it cannot be anonymous."
  say ""
  say "  Mint: https://github.com/settings/personal-access-tokens/new"
  say "    Repository access : only $REPO_SLUG"
  say "    Permissions       : Contents -> Read-only, and nothing else"
  say ""
  local token
  read_secret token "Fine-grained PAT (Contents: Read-only)" || return 1

  if [[ $PROBE -eq 1 ]]; then
    if probe_can_read_repo "$token"; then
      ok "token can read $REPO_SLUG"
    else
      warn "token could NOT read $REPO_SLUG — the clone would fail. Not sealing."
      return 1
    fi
  fi

  SEAL_PLAINTEXT=("$token")
  seal_to portfolio-site-repo prod \
    "$ROOT/gitops/prod/secrets/portfolio-repo-token.sealed.yaml" \
    "token=$(b64 "$token")" || return 1
  kustomize_add "$ROOT/gitops/prod/kustomization.yaml" \
    "secrets/portfolio-repo-token.sealed.yaml"
}

seal_ci() {
  step "2/3  Self-hosted Actions runners — restores CI"
  say "  Every workflow here has died in 3-6 seconds with runner_id: 0 since"
  say "  2026-08-26: metered GitHub-hosted minutes, never a real failure."
  say "  Self-hosted runners are not metered."
  say ""
  say "  Mint: https://github.com/settings/personal-access-tokens/new"
  say "    Repository access : only $REPO_SLUG"
  say "    Permissions       : Administration -> Read and write"
  say "  (the narrowest permission that can mint a runner registration token)"
  say ""
  local token
  read_secret token "Fine-grained PAT (Administration: Read and write)" || return 1

  if [[ $PROBE -eq 1 ]]; then
    if probe_can_mint_runner_token "$token"; then
      ok "token can mint a runner registration token"
    else
      warn "token could NOT mint a registration token — the runner pods would"
      warn "CrashLoopBackOff on 'Could not read a registration token'. Not sealing."
      return 1
    fi
  fi

  SEAL_PLAINTEXT=("$token")
  seal_to actions-runner-secrets ci \
    "$ROOT/gitops/ci/secrets/actions-runner-token.sealed.yaml" \
    "RUNNER_TOKEN=$(b64 "$token")" || return 1
  kustomize_add "$ROOT/gitops/ci/kustomization.yaml" \
    "secrets/actions-runner-token.sealed.yaml"

  say ""
  say "  After this is pushed and Argo syncs, flip the switch:"
  say "    repo Settings -> Secrets and variables -> Actions -> Variables"
  say "    CI_RUNNER = self-hosted"
  say "  That moves all 217 workflows at once. Clearing it moves them back."
}

seal_agents() {
  step "3/3  Codex worker — unattended dev work on the agent box"
  say "  Two credentials go in one Secret: a GitHub identity that opens PRs,"
  say "  and one Codex credential that decides whose budget a tick spends."
  say ""
  say "  Codex credential — pick one:"
  say "    1) CODEX_AUTH_JSON   a ChatGPT plan's included quota. A tick costs"
  say "                         nothing extra. No euro hard stop, and the"
  say "                         5-hour/weekly windows are shared with whoever"
  say "                         is signed into that account — use a seat that"
  say "                         is not your day-to-day login."
  say "    2) OPENAI_API_KEY    metered project key on a separate OpenAI org"
  say "                         with a dashboard hard spend limit. Costs money,"
  say "                         with a ceiling. Never an Admin key."
  say ""
  local choice
  printf '  Which [1/2]: '
  read -r choice

  local codex_key codex_val prompt
  case "$choice" in
    1) codex_key=CODEX_AUTH_JSON
       prompt="Contents of ~/.codex/auth.json (one line, after 'codex login')" ;;
    2) codex_key=OPENAI_API_KEY
       prompt="OpenAI project API key (separate org, hard spend limit set)" ;;
    *) warn "pick 1 or 2 — nothing sealed"; return 1 ;;
  esac

  read_secret codex_val "$prompt" || return 1
  if [[ "$codex_key" == "CODEX_AUTH_JSON" && "$codex_val" != \{* ]]; then
    warn "that does not look like auth.json (expected it to start with '{')."
    warn "If 'cat ~/.codex/auth.json' does not exist, the CLI used the OS"
    warn "keychain: put cli_auth_credentials_store = \"file\" in the Codex"
    warn "config at \$HOME/.codex/config.toml, then run 'codex login' again."
    return 1
  fi

  say ""
  say "  GitHub identity for the worker's PRs:"
  say "    Repository access : only $REPO_SLUG"
  say "    Permissions       : Contents -> Read and write, Pull requests ->"
  say "                        Write, Metadata -> Read. Nothing else, and it"
  say "                        must not be able to push main."
  say ""
  local gh
  read_secret gh "Fine-grained PAT (Contents RW + Pull requests W)" || return 1

  if [[ $PROBE -eq 1 ]]; then
    if probe_can_read_repo "$gh"; then
      ok "GH_TOKEN can read $REPO_SLUG"
    else
      warn "GH_TOKEN could NOT read $REPO_SLUG. Not sealing."
      return 1
    fi
  fi

  SEAL_PLAINTEXT=("$gh" "$codex_val")
  seal_to codex-secrets agents \
    "$ROOT/gitops/agents/secrets/codex-token.sealed.yaml" \
    "GH_TOKEN=$(b64 "$gh")" "$codex_key=$(b64 "$codex_val")" || return 1
  kustomize_add "$ROOT/gitops/agents/kustomization.yaml" \
    "secrets/codex-token.sealed.yaml"

  say ""
  say "  The governor stays off until you say so, deliberately. After this is"
  say "  pushed and you have watched a sync land, flip both:"
  say "    gitops/agents/governor/cronjob.yaml   suspend: false"
  say "    gitops/agents/governor/policy.json    \"enabled\": true"
}

# ---------------------------------------------------------------------- run

FAILED=()
for t in "${TARGETS[@]}"; do
  case "$t" in
    site)   seal_site   || FAILED+=(site) ;;
    ci)     seal_ci     || FAILED+=(ci) ;;
    agents) seal_agents || FAILED+=(agents) ;;
  esac
done

step "Next"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  warn "did not seal: ${FAILED[*]} — nothing was written for those"
fi

cat <<EOF
  Review, then commit only the *.sealed.yaml files and the kustomization
  edits. Ciphertext is safe to commit; that is the point of sealed-secrets.

    git status --short gitops/
    git add gitops/ && git commit && git push

  Argo syncs from main. Then verify what you turned on:

    site    kubectl -n prod get pods -l app=portfolio-site
            # Init:CrashLoopBackOff -> Running
            kubectl -n prod logs deploy/portfolio-site -c build | tail -1
            # ends in "built ... files"
            kubectl -n prod get certificate
            # READY=True on letsencrypt-prod (the issuer flip landed
            # 2026-08-31 -- this is a publicly trusted cert from the start,
            # no browser warning and no follow-up PR to wait on)

    ci      kubectl -n ci get pods
            # then set CI_RUNNER=self-hosted and re-run any workflow

    agents  kubectl -n agents get pods
            # after you flip suspend/enabled, one Job per tick, max 1 at a time
EOF
