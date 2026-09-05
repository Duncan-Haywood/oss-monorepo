#!/usr/bin/env bash
# Step 3 of the Codex worker's three owner steps: turn the governor on.
#
#   ./bootstrap/scripts/enable-codex-governor.sh            # flip both switches
#   ./bootstrap/scripts/enable-codex-governor.sh --check    # report, write nothing
#   ./bootstrap/scripts/enable-codex-governor.sh --disable  # flip them back off
#
# Why this exists
# ---------------
# `seal-owner-secrets.sh agents` does step 2 and then prints step 3 as prose:
# "flip `gitops/agents/governor/cronjob.yaml` suspend: false and
# `gitops/agents/governor/policy.json` "enabled": true". Two hand-edits, in two
# different file formats, in a tree where getting one of them wrong is silent
# in both directions -- flip only the CronJob and the governor wakes up every
# five minutes to read `"enabled": false` and do nothing; flip only the policy
# and nothing ever wakes up to read it at all. Neither mistake produces an
# error anyone sees.
#
# It also makes the *ordering* real. Every document says step 3 comes after the
# seal, and until now nothing enforced it: a tree with the switches on and no
# `codex-secrets` to read is a CronJob that fires every five minutes, installs
# the Codex CLI on the 4 GB cpx22, and dies on a credential that does not
# exist. This script refuses to enable until the sealed Secret is actually in
# the tree *and* wired into the kustomization Argo syncs -- the two conditions
# that together mean the cluster will have the credential when the first Job
# runs. That is a precondition a hand-edit cannot have.
#
# What it deliberately does not do
# --------------------------------
# It does not seal, commit, push, or apply anything, and it holds no
# credential. It edits two files in your checkout. Argo does the rest on your
# next push, exactly as with `seal-owner-secrets.sh`.
#
# There is no `--force`. The seal precondition is the whole point; a flag to
# skip it would leave the script no safer than the hand-edit it replaces.
# `--disable` is ungated on purpose: turning automation off is never the
# direction that needs a guard.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CRONJOB="$ROOT/gitops/agents/governor/cronjob.yaml"
POLICY="$ROOT/gitops/agents/governor/policy.json"
KUSTOMIZATION="$ROOT/gitops/agents/kustomization.yaml"
SEALED="$ROOT/gitops/agents/secrets/codex-token.sealed.yaml"
# The path as the kustomization spells it -- relative to its own directory.
SEALED_REF="secrets/codex-token.sealed.yaml"

MODE=enable
for arg in "$@"; do
  case "$arg" in
    --check)   MODE=check ;;
    --disable) MODE=disable ;;
    -h|--help) sed -n '2,36p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg (want: --check | --disable)" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
ok()   { printf '  + %s\n' "$*"; }

# ------------------------------------------------------------------- reading

# Both switches are read with a regex anchored the way the file writes them, so
# a reformat that changes the shape is a loud failure here rather than a silent
# no-op in the flip below.
cronjob_suspended() { grep -qE '^  suspend: true$'  "$CRONJOB"; }
cronjob_running()   { grep -qE '^  suspend: false$' "$CRONJOB"; }
policy_enabled()    { grep -qE '^  "enabled": true,$'  "$POLICY"; }
policy_disabled()   { grep -qE '^  "enabled": false,$' "$POLICY"; }

for f in "$CRONJOB" "$POLICY" "$KUSTOMIZATION"; do
  [[ -f "$f" ]] || { warn "missing: ${f#"$ROOT"/}"; exit 1; }
done

if ! cronjob_suspended && ! cronjob_running; then
  warn "cannot find a 'suspend:' line in ${CRONJOB#"$ROOT"/}"
  warn "the CronJob's shape changed; fix this script rather than the manifest"
  exit 1
fi
if ! policy_enabled && ! policy_disabled; then
  warn "cannot find an '\"enabled\":' line in ${POLICY#"$ROOT"/}"
  warn "the policy's shape changed; fix this script rather than the manifest"
  exit 1
fi

# ------------------------------------------------------- the seal precondition

# Read only the key *names*, which a SealedSecret carries in the clear; the
# values beside them are ciphertext and this script never decodes or prints
# one. Nothing here needs a cluster.
seal_report() {
  python3 - "$SEALED" <<'PY'
import re
import sys

text = open(sys.argv[1], encoding="utf-8").read()

# A `kind: Secret` here would be a plaintext credential someone was about to
# commit. Refusing is the only safe answer, and it is worth its own message.
kind = re.search(r"^kind:\s*(\S+)", text, re.M)
if not kind or kind.group(1) != "SealedSecret":
    print("kind=%s" % (kind.group(1) if kind else "?"))
    sys.exit(3)

name = re.search(r"^\s*name:\s*(\S+)", text, re.M)
block = re.search(r"encryptedData:\n((?:\s+\S+:.*\n)+)", text)
keys = re.findall(r"^\s+(\S+):", block.group(1), re.M) if block else []
print("name=%s" % (name.group(1) if name else "?"))
print("keys=%s" % ",".join(sorted(keys)))
PY
}

require_seal() {
  if [[ ! -f "$SEALED" ]]; then
    warn "no sealed credential at ${SEALED#"$ROOT"/}"
    warn "the governor must not be enabled before the Secret it reads exists:"
    warn "every Job would install the Codex CLI on the cpx22 and die on a"
    warn "credential that is not there. Seal first:"
    warn "    ./bootstrap/scripts/seal-owner-secrets.sh agents"
    return 1
  fi

  local report status
  set +e
  report="$(seal_report)"
  status=$?
  set -e
  if [[ $status -eq 3 ]]; then
    warn "${SEALED#"$ROOT"/} is not a SealedSecret ($report)"
    warn "a plaintext Secret must never be committed. Re-run the seal script."
    return 1
  fi
  [[ $status -eq 0 ]] || { warn "could not read ${SEALED#"$ROOT"/}"; return 1; }

  local name keys
  name="${report#*name=}"; name="${name%%$'\n'*}"
  keys="${report##*keys=}"

  if [[ "$name" != "codex-secrets" ]]; then
    warn "sealed Secret is named '$name'; the worker reads 'codex-secrets'"
    return 1
  fi

  # A GitHub identity, and exactly the credential question the seal script
  # asked. Half a seal is the failure this check exists for: a Secret with
  # `GH_TOKEN` alone passes every YAML check there is and cannot run Codex.
  [[ ",$keys," == *,GH_TOKEN,* ]] || {
    warn "sealed Secret carries no GH_TOKEN (has: $keys)"
    warn "the worker cannot open a PR without it. Re-seal both credentials."
    return 1
  }
  if [[ ",$keys," == *,CODEX_AUTH_JSON,* ]]; then
    ok "sealed credential: CODEX_AUTH_JSON (a ChatGPT plan's included quota)"
  elif [[ ",$keys," == *,OPENAI_API_KEY,* ]]; then
    ok "sealed credential: OPENAI_API_KEY (metered, against its org's hard limit)"
  else
    warn "sealed Secret carries no Codex credential (has: $keys)"
    warn "seal CODEX_AUTH_JSON or OPENAI_API_KEY:"
    warn "    ./bootstrap/scripts/seal-owner-secrets.sh agents"
    return 1
  fi

  # Present in the tree but absent from the kustomization is the quiet half of
  # this failure: the file is committed, review looks right, and Argo never
  # applies it because nothing lists it.
  if ! grep -qF "$SEALED_REF" "$KUSTOMIZATION"; then
    warn "${SEALED#"$ROOT"/} exists but ${KUSTOMIZATION#"$ROOT"/} does not list it"
    warn "Argo applies what the kustomization names, so the cluster would"
    warn "never receive this Secret. Add it under 'resources:':"
    warn "    - $SEALED_REF"
    return 1
  fi
  ok "sealed Secret is wired into ${KUSTOMIZATION#"$ROOT"/}"
}

# ------------------------------------------------------------------ flipping

set_cronjob() { # $1: true|false
  local tmp="$CRONJOB.tmp.$$"
  sed -E "s/^  suspend: (true|false)$/  suspend: $1/" "$CRONJOB" > "$tmp"
  grep -qE "^  suspend: $1$" "$tmp" || { rm -f "$tmp"; warn "flip failed"; return 1; }
  mv "$tmp" "$CRONJOB"
}

set_policy() { # $1: true|false
  local tmp="$POLICY.tmp.$$"
  sed -E "s/^  \"enabled\": (true|false),$/  \"enabled\": $1,/" "$POLICY" > "$tmp"
  # The policy is parsed by `governor.py` at start-up; a file this script broke
  # would take the governor down rather than turn it on, so prove it still
  # parses and still says what we meant before it replaces the original.
  if ! python3 - "$tmp" "$1" <<'PY'
import json
import sys

path, want = sys.argv[1], sys.argv[2] == "true"
policy = json.load(open(path, encoding="utf-8"))
if policy.get("enabled") is not want:
    sys.exit("  ! policy.json still reads enabled=%r" % policy.get("enabled"))
PY
  then
    rm -f "$tmp"
    warn "policy.json flip failed; left unchanged"
    return 1
  fi
  mv "$tmp" "$POLICY"
}

# ----------------------------------------------------------------------- run

case "$MODE" in
  check)
    step "Codex governor"
    if cronjob_running; then
      ok "CronJob:  running (suspend: false)"
    else
      say "  - CronJob:  suspended (suspend: true)"
    fi
    if policy_enabled; then
      ok "policy:   enabled"
    else
      say "  - policy:   disabled (\"enabled\": false)"
    fi
    if [[ -f "$SEALED" ]]; then
      require_seal || true
    else
      say "  - seal:     absent (${SEALED#"$ROOT"/})"
    fi
    if cronjob_running && policy_enabled; then
      say ""
      say "  The governor is on. It starts at most one worker Job every five"
      say "  minutes, inside its window and weekly budget fraction."
      exit 0
    fi
    say ""
    say "  The governor is off. Run this script with no arguments to turn it on"
    say "  once the credential is sealed."
    exit 1
    ;;

  disable)
    step "Disabling the Codex governor"
    set_cronjob true
    set_policy false
    ok "CronJob suspended and policy disabled"
    say ""
    say "  Commit and push. Argo suspends the CronJob on the next sync; a Job"
    say "  already running is left to finish rather than killed."
    exit 0
    ;;

  enable)
    step "Enabling the Codex governor"
    if cronjob_running && policy_enabled; then
      ok "already enabled — nothing to change"
      exit 0
    fi
    require_seal || {
      warn "nothing changed"
      exit 1
    }
    set_cronjob false
    set_policy true
    ok "CronJob unsuspended and policy enabled"
    say ""
    say "  Review the two changed files, then commit and push:"
    say "    gitops/agents/governor/cronjob.yaml   suspend: false"
    say "    gitops/agents/governor/policy.json    \"enabled\": true"
    say ""
    say "  Argo syncs on your next push and the first tick follows within five"
    say "  minutes. The worker logs which budget it spent on every run."
    say ""
    say "  To stop it again:  $0 --disable"
    exit 0
    ;;
esac
