#!/usr/bin/env bash
# Install the Codex governor as a systemd timer on a Hetzner box.
#
# WHY THIS EXISTS
#
# The Codex worker is the portfolio's dev capacity, and as of 2026-09-05 it has
# nowhere to run. `agents/governor/cronjob.yaml` schedules it in k3s, and k3s is
# down -- `:6443` refused on both boxes (`Outage triage`, run 33889983086). The
# fallback for a dead scheduler was GitHub Actions, and Actions is out of
# metered minutes -- every job returns `runner_id: 0`
# (`ci_starvation.py --run 33935905418`). The self-hosted runner stack that
# exists as insurance against exactly that (`gitops/ci/`) runs as pods *in the
# cluster*, so it is downstream of the outage it insures.
#
# All three routes are down and two of them are down because they were built on
# top of each other. The boxes themselves are up: `:22` answers on both, per the
# same triage run. This installs onto that -- a systemd timer, no k3s, no
# runner, no Argo. It is the one execution path that survives both outages, and
# it is what makes the SSH key rotation buy working dev capacity rather than
# only a diagnosis.
#
# WHAT IT DOES NOT DO
#
# It does not install or touch k3s, Argo CD, the Ingress, or anything serving
# the public site. It does not create Hetzner resources and never calls the
# Hetzner API. It does not enable the governor *by default*: the policy switch
# stays off unless you ask for it here, so a box can be prepared long before it
# is allowed to spend quota. It holds no credential -- `--credentials` reads
# from stdin, never argv, so nothing lands in the shell history or the process
# table.
#
# USAGE
#
#   CONFIRM=install-codex-host ./bootstrap/scripts/install-codex-host.sh
#   ./bootstrap/scripts/install-codex-host.sh --check        # report, change nothing
#   ./bootstrap/scripts/install-codex-host.sh --credentials  # write creds from stdin
#   ./bootstrap/scripts/install-codex-host.sh --enable       # start spending quota
#   ./bootstrap/scripts/install-codex-host.sh --disable      # stop, keep it installed
#   CONFIRM=install-codex-host ./bootstrap/scripts/install-codex-host.sh --uninstall
#
# ENABLING WITHOUT A SECOND TRIP
#
# `--enable` flips `"enabled"` in the policy copy this installer put on the box
# (`$PREFIX/governor/policy.json`), which is the file the timer actually reads
# (`host_governor.py:112`). It is the whole of step 3, and the reason it lives
# here is arithmetic about one credential.
#
# Until now the only route to that flip was: edit `policy.json` in the
# repository with `enable-codex-governor.sh`, commit it, and *re-run this
# installer on the box* to copy the new policy over. That last clause is a
# second SSH session, and SSH to these boxes needs `HETZNERSSHKEY` -- the one
# owner action every route in this repository is blocked on. So the recovery
# would install the worker, credential it, and then leave the thing switched
# off behind the same key the owner had just spent their one session on. This
# is the identical defect `restore-cluster.sh` fixed for the *credential* on
# 2026-09-10 ("Step 1 is avoidable"), one step further down the sequence.
#
# `CODEX_ENABLED=1` on an install run does the same thing at the end of the
# install, so the recovery can carry it in the same run. Both refuse when there
# is no credential on the box: an enabled governor with nothing to authenticate
# with wakes every five minutes, fails, and sits on a six-hour auth cooldown,
# which looks from the outside exactly like a governor that is working.
#
# Neither touches the repository's `policy.json`. The committed default stays
# `false` on purpose -- turning on unattended automation is an owner decision
# taken per box, not something a merge does to everyone.
#
# The install apt-gets any missing prerequisite from the distribution archive
# and re-checks; SKIP_PREREQ_INSTALL=1 reports and refuses without touching the
# package manager, ALLOW_MISSING_PREREQS=1 proceeds anyway. `--check` never
# installs anything.
#
# Run it on the box, as root. To drive it from a laptop over SSH:
#
#   ssh root@<box> 'bash -s' < bootstrap/scripts/install-codex-host.sh
#
# does not work on its own -- the script copies files out of the repository, so
# the repository has to be on the box. Clone it there first, or see
# `gitops/agents/host/README.md` for the rsync-then-run form.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SRC_AGENTS="$ROOT/gitops/agents"
SRC_HOST="$SRC_AGENTS/host"

PREFIX="${CODEX_HOST_PREFIX:-/opt/codex-agents}"
ETCDIR="${CODEX_HOST_ETC:-/etc/codex-agents}"
UNITDIR="${CODEX_HOST_UNITDIR:-/etc/systemd/system}"
STATEDIR="${CODEX_HOST_STATEDIR:-/var/lib/codex-governor}"
CODEX_HOME="${CODEX_HOST_CODEXHOME:-/var/lib/codex}"
TOOLSDIR="${CODEX_HOST_TOOLSDIR:-/var/lib/codex-tools}"
CREDS="$ETCDIR/credentials.env"
# The policy the *timer* reads, which is the copy on the box rather than the
# one in the checkout. `host_governor.py:112` resolves exactly this path.
INSTALLED_POLICY="$PREFIX/governor/policy.json"

MODE=install
for arg in "$@"; do
  case "$arg" in
    --check)       MODE=check ;;
    --uninstall)   MODE=uninstall ;;
    --credentials) MODE=credentials ;;
    --enable)      MODE=enable ;;
    --disable)     MODE=disable ;;
    -h|--help)     sed -n '2,77p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg (want: --check | --credentials | --enable | --disable | --uninstall)" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
ok()   { printf '  + %s\n' "$*"; }
fail() { echo "install-codex-host: $1" >&2; exit 1; }

# The files this installs, as `source-relative-to-gitops/agents  destination`.
# Kept as one list so --check, install and --uninstall cannot disagree about
# what is managed; a file added to the layout in only one of the three is how a
# stale copy survives an uninstall and gets picked up by the next install.
PAYLOAD=(
  "governor/governor.py     governor/governor.py"
  "governor/policy.json     governor/policy.json"
  "host/host_governor.py    host/host_governor.py"
  "workers/worker.sh        workers/worker.sh"
  "workers/mandate.md       workers/mandate.md"
)

UNITS=(codex-governor.service codex-governor.timer)

require_root() {
  [[ "$(id -u)" == "0" ]] || fail "must run as root (it writes $PREFIX and $UNITDIR)."
}

# Whether systemd is actually running here, not merely installed.
systemd_available() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl daemon-reload >/dev/null 2>&1 || return 1
  return 0
}

# ------------------------------------------------------------- prerequisites
#
# The cluster path never had to ask this question. `governor.py` schedules the
# worker as a Job on `node:22-bookworm` (governor.py:766), an image that ships
# node, npm, git, curl and tar -- which is exactly why `worker.sh` *asserts*
# those are present instead of installing them, and says so in its own comments
# ("node:22-bookworm builds on buildpack-deps:bookworm-scm and already ships
# all three").
#
# Host mode runs that same `worker.sh` as a plain subprocess on the box. No
# image supplies anything, and a Hetzner `ubuntu-24.04` server -- which is what
# `infra/servers.tf:23` builds both boxes from -- ships no node and no npm at
# all. So the first thing the worker does once the governor lets it run,
# `npm install -g "@openai/codex@${CODEX_VERSION}"`, dies on
# `npm: command not found`.
#
# The failure is silent in the way that costs the most:
#
#   - `policy.json` ships `"enabled": false`, so nothing runs at install time
#     and the install reports clean;
#   - the breakage therefore surfaces only after the owner flips the switch and
#     walks away believing dev capacity is running;
#   - and it surfaces as a *worker* failure, which `host_governor.py` records
#     against the queue item's damped score rather than against the box, so the
#     visible symptom is "that item keeps failing", not "this host cannot run
#     the worker at all".
#
# That is the same shape of error CLAUDE.md already records paying for twice
# ("168 became 169"): a rule that was true in one execution context, carried
# into another where it is not. Ask it here instead, while the answer is cheap
# and the operator is still holding the SSH session.

# Binary this host must already have, and why the worker needs it.
PREREQS=(
  "node|runs the codex CLI"
  "npm|installs @openai/codex"
  "git|clones the repository the worker edits"
  "curl|downloads the pinned gh release"
  "tar|unpacks it"
)

# Binary name -> Debian/Ubuntu package that provides it, where they differ.
prereq_package() {
  case "$1" in
    node) echo "nodejs" ;;
    *)    echo "$1" ;;
  esac
}

# `@openai/codex@0.153.1` -- the version `worker.sh` pins -- declares
# `engines.node >= 16`, read from registry.npmjs.org rather than assumed.
# Ubuntu 24.04's `nodejs` package is 18.x, so the distro package clears it and
# host mode needs no separately-built Node. Overridable so a box deliberately
# running something newer can be checked against its own floor.
NODE_MIN_MAJOR="${CODEX_HOST_NODE_MIN_MAJOR:-16}"

# Major version of the `node` on PATH, or empty if it cannot be determined.
# Deliberately tolerant: an unparseable `--version` is reported as unknown and
# does not by itself fail the check, because refusing to install over a version
# string we merely failed to parse is worse than letting the worker try.
node_major() {
  local v
  v="$(node --version 2>/dev/null || true)"   # e.g. v18.19.1
  v="${v#v}"
  v="${v%%.*}"
  [[ "$v" =~ ^[0-9]+$ ]] && printf '%s' "$v"
}

# Debian/Ubuntu packages the last `host_prereqs` run found missing. A global
# because the install path has to act on the list, and `host_prereqs` is also
# called by `--check`, which must not.
PREREQ_ABSENT=()

# Reports every prerequisite; returns 1 if any is missing or too old.
# Changes nothing, so both --check and the install can call it.
host_prereqs() {
  local absent=() entry tool reason major
  PREREQ_ABSENT=()
  for entry in "${PREREQS[@]}"; do
    tool="${entry%%|*}"
    reason="${entry#*|}"
    if command -v "$tool" >/dev/null 2>&1; then
      ok "$tool — $reason"
    else
      warn "missing: $tool — $reason"
      absent+=("$(prereq_package "$tool")")
    fi
  done

  # Only meaningful when node is actually here; absence is already reported.
  if command -v node >/dev/null 2>&1; then
    major="$(node_major)"
    if [[ -z "$major" ]]; then
      warn "could not read a major version from \`node --version\` — continuing"
    elif (( major < NODE_MIN_MAJOR )); then
      warn "node is v${major}; @openai/codex needs >= ${NODE_MIN_MAJOR}"
      absent+=("nodejs")
    fi
  fi

  [[ "${#absent[@]}" == "0" ]] && return 0

  PREREQ_ABSENT=("${absent[@]}")
  say ""
  say "  The worker runs on this host directly, not in a container, so it needs"
  say "  these already on PATH. On Ubuntu 24.04 (infra/servers.tf builds both"
  say "  boxes from it):"
  say ""
  say "      apt-get update && apt-get install -y --no-install-recommends ${absent[*]}"
  say ""
  return 1
}

# Install the packages `host_prereqs` just reported, from the distribution's
# own archive. Returns 1 when it cannot (no apt, or apt failed), leaving the
# caller to fall back to the refusal below.
#
# WHY THIS INSTALLS RATHER THAN ONLY ADVISING
#
# Printing the apt-get line was correct for someone reading a terminal, and
# wrong for the way this script is actually reached. `restore-cluster.sh`
# runs it over SSH, non-interactively, in the middle of a recovery
# (`WITH_CODEX_HOST=1`) whose whole premise is "take this while you are
# already holding the key" -- and a fresh `ubuntu-24.04`, which
# `infra/servers.tf:23` builds both boxes from, has none of these. So the
# one-command recovery reached step 9, refused, and handed the owner a second
# trip they had been told they would not need. The advice was accurate and it
# still cost the thing it was protecting.
#
# It is a plain `apt-get install` from Ubuntu's own archive and nothing more:
# every package the worker needs is there (`nodejs` is 18.x, above the >= 16
# floor `@openai/codex` declares), so there is no third-party repository, no
# added key, and nothing downloaded and piped into a shell. That is the reason
# this is safe to do unattended, and the reason it must stay apt-only -- if a
# future prerequisite is not in the archive, refuse and say so rather than
# reaching for a NodeSource-style installer here.
install_prereqs() {
  [[ "${#PREREQ_ABSENT[@]}" == "0" ]] && return 0

  if ! command -v apt-get >/dev/null 2>&1; then
    warn "no apt-get on this host, so the packages above cannot be installed here"
    return 1
  fi

  say ""
  say "  Installing them from the distribution archive:"
  say "      apt-get install -y --no-install-recommends ${PREREQ_ABSENT[*]}"
  say ""

  # Noninteractive because the caller is usually an SSH command with no tty;
  # a package that stops to ask a question would hang the whole restore.
  export DEBIAN_FRONTEND=noninteractive
  if ! apt-get update -qq; then
    warn "apt-get update failed — is this box online?"
    return 1
  fi
  if ! apt-get install -y --no-install-recommends "${PREREQ_ABSENT[@]}"; then
    warn "apt-get install failed; see its output above"
    return 1
  fi
  ok "packages installed"
  return 0
}

# ------------------------------------------------------------------ reporting

report() {
  step "source tree"
  local missing=0 pair src
  for pair in "${PAYLOAD[@]}"; do
    src="$SRC_AGENTS/${pair%% *}"
    if [[ -f "$src" ]]; then
      ok "${pair%% *}"
    else
      warn "missing from the checkout: ${pair%% *}"
      missing=1
    fi
  done
  local unit
  for unit in "${UNITS[@]}"; do
    if [[ -f "$SRC_HOST/$unit" ]]; then ok "$unit"; else warn "missing: $unit"; missing=1; fi
  done
  [[ "$missing" == "0" ]] || fail "the checkout is incomplete; nothing was changed."

  # Reported, never fatal: --check exists to say what the box looks like, and
  # exiting early here would hide the installed state below it, which is the
  # thing an operator most often runs --check to see.
  step "host prerequisites"
  host_prereqs || true

  step "installed state"
  if [[ -d "$PREFIX" ]]; then ok "$PREFIX exists"; else say "  - $PREFIX not installed"; fi
  for unit in "${UNITS[@]}"; do
    if [[ -f "$UNITDIR/$unit" ]]; then ok "$unit installed"; else say "  - $unit not installed"; fi
  done
  if [[ -f "$CREDS" ]]; then
    # Report that it exists and how locked down it is, never what is in it.
    ok "credentials present ($(stat -c '%a' "$CREDS") $(stat -c '%U' "$CREDS"))"
  else
    say "  - no credentials at $CREDS (the timer will hold on the auth cooldown)"
  fi
  if systemd_available; then
    if systemctl is-enabled codex-governor.timer >/dev/null 2>&1; then
      ok "timer enabled: $(systemctl is-active codex-governor.timer 2>/dev/null || true)"
    else
      say "  - timer not enabled"
    fi
  else
    say "  - systemd is not managing this host (units install, but nothing starts them)"
  fi

  # Report the policy the timer *reads* -- the copy on the box -- not the one
  # in the checkout. Those two are allowed to differ (that is the whole point
  # of `--enable`), and before this they could differ in the direction that
  # misleads: an operator who ran `enable-codex-governor.sh` and committed, but
  # never re-ran the installer, got "policy enabled — the timer will start
  # workers" from a box whose installed copy still said false.
  step "governor policy"
  if [[ ! -f "$INSTALLED_POLICY" ]]; then
    say "  - nothing installed at $INSTALLED_POLICY"
    if policy_is_enabled "$SRC_AGENTS/governor/policy.json"; then
      say "    (the checkout's policy is enabled, but no install has copied it here)"
    fi
  elif policy_is_enabled; then
    ok "policy enabled — the timer will start workers"
  else
    say "  - policy disabled; the timer will tick and hold."
    say "    Enable it on this box with: $0 --enable"
  fi
}

# ------------------------------------------------------------ policy switch
#
# Reads the installed policy's `"enabled"` field. Absent file counts as "not
# enabled" rather than an error: the question every caller is really asking is
# "will the next tick start a worker?", and a box with nothing installed
# answers that with "no".
policy_is_enabled() {
  local file="${1:-$INSTALLED_POLICY}"
  grep -qE '^  "enabled": true,$' "$file" 2>/dev/null
}

# Flip the installed policy in place. Deliberately a targeted substitution on
# the one line rather than a JSON rewrite: there is no `jq` in the prerequisite
# list, and re-emitting the file with a different serialiser would silently
# reformat a policy the operator may be diffing against the repository copy.
set_policy_enabled() {
  local want="$1"
  require_root
  [[ -f "$INSTALLED_POLICY" ]] || fail \
    "no installed policy at $INSTALLED_POLICY; run the install first."

  # An enabled governor with no credential is not "on", it is a five-minute
  # loop into a six-hour auth cooldown -- and it reports as a *worker* failure
  # against the queue item's damped score, so the visible symptom is "that item
  # keeps failing" rather than "this box was never credentialed". Refuse, in
  # the same spirit as `enable-codex-governor.sh` refusing to enable the
  # cluster path before the SealedSecret is in the tree.
  if [[ "$want" == "true" && ! -f "$CREDS" ]]; then
    fail "refusing to enable with no credentials at $CREDS.
  Give it one first -- in this same session, so it costs no second trip:
      $0 --credentials < codex.env
  It wants CODEX_AUTH_JSON (from \`codex login\`, which draws on the ChatGPT
  plan's included quota) and GH_TOKEN. Then re-run $0 --enable."
  fi

  # Already in the requested state: nothing to write, and nothing to say --
  # the caller prints the one authoritative line about where the box ended up.
  if [[ "$want" == "true" ]] && policy_is_enabled; then return 0; fi
  if [[ "$want" == "false" ]] && ! policy_is_enabled; then return 0; fi

  local tmp
  tmp="$(mktemp "${INSTALLED_POLICY}.XXXXXX")"
  sed -E 's/^(  "enabled": )(true|false),$/\1'"$want"',/' "$INSTALLED_POLICY" > "$tmp"

  # Verify before moving into place. A policy this substitution silently missed
  # would leave the box in the state the operator just asked it to leave, and
  # `--enable` printing success is precisely how that goes unnoticed.
  if ! grep -qE "^  \"enabled\": ${want},\$" "$tmp"; then
    rm -f "$tmp"
    fail "could not set \"enabled\": ${want} in $INSTALLED_POLICY (unexpected format)."
  fi
  chmod 0644 "$tmp"
  mv "$tmp" "$INSTALLED_POLICY"
}

do_enable() {
  step "governor policy"
  set_policy_enabled true
  ok "enabled — the timer will start a worker on its next tick"
  if systemd_available && ! systemctl is-enabled codex-governor.timer >/dev/null 2>&1; then
    warn "the timer itself is not enabled, so nothing will read this."
    warn "run the install (CONFIRM=install-codex-host $0) to put it back."
  fi
  say "  Watch it:  systemctl list-timers codex-governor.timer"
  say "             journalctl -u codex-governor.service -f"
  say "  Budget:    $PREFIX/host/host_governor.py --check"
}

do_disable() {
  step "governor policy"
  set_policy_enabled false
  ok "disabled — the timer keeps ticking and will start nothing"
  say "  The install, the credential and the budget ledger are all untouched."
  say "  Re-enable with: $0 --enable"
}

# --------------------------------------------------------------- credentials

write_credentials() {
  require_root
  [[ ! -t 0 ]] || fail "--credentials reads the env file from stdin; pipe it in."
  install -d -m 0750 "$ETCDIR"
  # Written via a mode-0600 temp file in the same directory and moved into
  # place, so there is no window in which the real path exists world-readable.
  local tmp
  tmp="$(mktemp "$ETCDIR/.credentials.XXXXXX")"
  chmod 0600 "$tmp"
  cat > "$tmp"
  # Refuse an empty write rather than silently replacing working credentials
  # with nothing, which would look like a successful install and then fail
  # every run six hours apart on the auth cooldown.
  [[ -s "$tmp" ]] || { rm -f "$tmp"; fail "stdin was empty; $CREDS left unchanged."; }
  mv "$tmp" "$CREDS"
  chmod 0600 "$CREDS"
  ok "wrote $CREDS (0600)"
  say "  systemctl restart codex-governor.timer to pick it up"
}

# -------------------------------------------------------------------- install

do_install() {
  require_root
  [[ "${CONFIRM:-}" == "install-codex-host" ]] || \
    fail "refusing to install without CONFIRM=install-codex-host (or use --check)."

  # Fail closed, and fail *first*: an install that completes on a box which
  # cannot run the worker is the outcome this check exists to prevent, and
  # stopping before anything is written leaves the box exactly as it was.
  #
  # The order matters. Try to supply what is missing (`install_prereqs`), then
  # re-ask the same question rather than assuming the install worked -- apt can
  # exit 0 having installed a package that still puts nothing on PATH. Only a
  # second failed check refuses.
  #
  # SKIP_PREREQ_INSTALL=1 keeps the old advise-and-refuse behaviour, for a box
  # whose packages are managed elsewhere and where an apt-get would fight
  # config management. ALLOW_MISSING_PREREQS=1 is the stronger one: proceed
  # even though the box cannot run the worker yet, for preparing a box whose
  # packages arrive by another route afterwards. Neither silences the report --
  # the warnings still print.
  step "host prerequisites"
  if ! host_prereqs; then
    if [[ "${SKIP_PREREQ_INSTALL:-0}" == "1" ]]; then
      warn "SKIP_PREREQ_INSTALL=1 — not installing the packages above."
    elif install_prereqs; then
      step "host prerequisites (re-checked)"
      host_prereqs || true
    fi
  fi

  if [[ "${#PREREQ_ABSENT[@]}" != "0" ]]; then
    [[ "${ALLOW_MISSING_PREREQS:-0}" == "1" ]] || fail \
      "this host cannot run the worker yet; install the packages above and re-run. Nothing was changed. (ALLOW_MISSING_PREREQS=1 overrides.)"
    warn "ALLOW_MISSING_PREREQS=1 — installing anyway; the worker will fail until they are present."
  fi

  step "directories"
  install -d -m 0755 "$PREFIX" "$PREFIX/governor" "$PREFIX/host" "$PREFIX/workers"
  install -d -m 0750 "$ETCDIR"
  # The three the unit lists in ReadWritePaths, and nothing else.
  install -d -m 0700 "$STATEDIR" "$CODEX_HOME" "$TOOLSDIR"
  ok "$PREFIX, $STATEDIR, $CODEX_HOME, $TOOLSDIR"

  # Read the box's current switch *before* the payload step overwrites the
  # installed policy with the repository's (disabled) copy. The README tells
  # operators this installer is idempotent and to "re-run it to roll out a new
  # queue or a new policy" -- so without this, the ordinary act of shipping a
  # new queue item would quietly switch off a governor that was running, and
  # the only symptom would be dev capacity that stopped doing anything.
  local was_enabled=0
  policy_is_enabled && was_enabled=1

  step "payload"
  local pair src dst mode
  for pair in "${PAYLOAD[@]}"; do
    src="$SRC_AGENTS/${pair%% *}"
    dst="$PREFIX/${pair##* }"
    [[ -f "$src" ]] || fail "missing from the checkout: ${pair%% *}"
    # worker.sh is invoked as `bash worker.sh` so it does not strictly need the
    # bit, but an operator running it by hand should not have to know that.
    mode=0644
    case "$dst" in *.sh|*host_governor.py) mode=0755 ;; esac
    install -m "$mode" "$src" "$dst"
    ok "${pair##* }"
  done

  step "queue"
  # Replaced wholesale rather than merged: an item deleted from the repository
  # queue must stop running here, and a merge would leave it scheduled forever.
  rm -rf "${PREFIX:?}/queue"
  install -d -m 0755 "$PREFIX/queue"
  local item count=0
  for item in "$SRC_AGENTS/queue"/*.yaml "$SRC_AGENTS/queue"/*.yml "$SRC_AGENTS/queue"/*.json; do
    [[ -f "$item" ]] || continue
    # example.item.yaml documents the schema; it is not work.
    [[ "$(basename "$item")" == "example.item.yaml" ]] && continue
    install -m 0644 "$item" "$PREFIX/queue/$(basename "$item")"
    count=$((count + 1))
  done
  ok "$count queue item(s)"

  # `CODEX_ENABLED=1` finishes the job in this run rather than leaving step 3
  # behind another SSH session -- see "ENABLING WITHOUT A SECOND TRIP" above.
  #
  # Placed here for two reasons, both learned by testing it in the wrong spot.
  # It must come *after* the payload step, because that step overwrites the
  # installed policy with the repository's (disabled) copy on every run, so a
  # flip made earlier would be undone by the install that made it. And it must
  # come *before* the systemd section, which returns early on a host where
  # systemd is not PID 1 -- putting it after that return meant the flip
  # silently did not happen on exactly the hosts where the installer is
  # exercised before it is pointed at the box that matters.
  #
  # Precedence, and the unset case is the one that matters most:
  #   CODEX_ENABLED=1   turn it on (refused, with a warning, if uncredentialed)
  #   CODEX_ENABLED=0   turn it off
  #   unset             leave the box's switch where it already was
  #
  # "Leave it where it was" makes the switch a property of the box rather than
  # of whichever checkout last ran the installer, which is what an operator
  # rolling out a queue change actually expects.
  step "governor policy"
  case "${CODEX_ENABLED:-}" in
    1)
      if [[ -f "$CREDS" ]]; then
        set_policy_enabled true
        ok "CODEX_ENABLED=1 — enabled; the timer will start a worker on its next tick"
      else
        warn "CODEX_ENABLED=1 was set, but there are no credentials at $CREDS."
        warn "left disabled — an enabled governor with no credential just loops"
        warn "into a six-hour auth cooldown. Both steps, still with no second trip:"
        warn "    $0 --credentials < codex.env && $0 --enable"
      fi
      ;;
    0)
      set_policy_enabled false
      ok "CODEX_ENABLED=0 — disabled; the timer will tick and start nothing"
      ;;
    *)
      if [[ "$was_enabled" == "1" && -f "$CREDS" ]]; then
        set_policy_enabled true
        ok "still enabled (carried over from the previous install)"
      elif [[ "$was_enabled" == "1" ]]; then
        # Enabled before, but the credential is gone. Carrying the switch over
        # would restore a governor that can only fail; and `set_policy_enabled`
        # refuses this case anyway, which mid-install would abort a run that is
        # otherwise fine. Say what happened instead of doing either.
        warn "was enabled, but there are no credentials at $CREDS — left disabled."
        warn "restore it with: $0 --credentials < codex.env && $0 --enable"
      else
        say "  - disabled; the timer will tick and hold."
        say "    Enable it on this box with: $0 --enable"
      fi
      ;;
  esac

  step "systemd units"
  # Always present on a real box; created anyway so the installer is runnable
  # against a scratch prefix, which is the only way it gets exercised before it
  # is pointed at the machine that matters.
  install -d -m 0755 "$UNITDIR"
  local unit
  for unit in "${UNITS[@]}"; do
    [[ -f "$SRC_HOST/$unit" ]] || fail "missing: $unit"
    install -m 0644 "$SRC_HOST/$unit" "$UNITDIR/$unit"
    ok "$unit"
  done

  # `command -v systemctl` is not the right question: the binary is present in
  # plenty of containers where PID 1 is not systemd, and there `daemon-reload`
  # fails with "Failed to connect to bus". Everything above this line has
  # already succeeded at that point, so dying on `set -e` would leave a
  # complete file install looking like a failed one. Ask whether the bus
  # answers, and if it does not, say what is and is not done.
  if ! systemd_available; then
    warn "systemd is not managing this host; units are in place but not started."
    warn "the payload under $PREFIX is complete — activate it wherever it will run."
    return 0
  fi

  systemctl daemon-reload
  # The timer is enabled, not the service: the service is oneshot and enabling
  # it would run a tick at every boot outside the timer's schedule.
  systemctl enable --now codex-governor.timer
  ok "codex-governor.timer enabled"

  step "next"
  if [[ ! -f "$CREDS" ]]; then
    say "  1. Give it credentials (reads stdin, nothing lands in argv):"
    say "       $0 --credentials < codex.env"
    say "     It wants CODEX_AUTH_JSON (from \`codex login\`) and GH_TOKEN."
  fi
  if ! policy_is_enabled; then
    say "  2. The governor is disabled, so the timer ticks and holds."
    say "     Enable it on this box -- no commit and no second SSH trip:"
    say "       $0 --enable"
    say "     (or pass CODEX_ENABLED=1 to this installer to do it in one run.)"
  fi
  say "  Watch it:  systemctl list-timers codex-governor.timer"
  say "             journalctl -u codex-governor.service -f"
  say "  Ask it:    $PREFIX/host/host_governor.py --check"
}

# ------------------------------------------------------------------ uninstall

do_uninstall() {
  require_root
  [[ "${CONFIRM:-}" == "install-codex-host" ]] || \
    fail "refusing to uninstall without CONFIRM=install-codex-host."

  step "systemd"
  if systemd_available; then
    systemctl disable --now codex-governor.timer 2>/dev/null || true
    systemctl stop codex-governor.service 2>/dev/null || true
    ok "timer stopped and disabled"
  fi
  local unit
  for unit in "${UNITS[@]}"; do
    rm -f "$UNITDIR/$unit" && ok "removed $unit"
  done
  # Let systemd forget the units we just deleted. Ignored if it is not running
  # here; there is nothing to reload in that case.
  if systemd_available; then ok "systemd reloaded"; fi

  step "files"
  rm -rf "${PREFIX:?}"
  ok "removed $PREFIX"
  # Deliberately kept: $CREDS is the owner's credential and re-obtaining it
  # costs a `codex login`; $STATEDIR is the budget ledger and losing it would
  # let a reinstall spend a fresh window's quota immediately. Neither is large
  # and neither is dangerous to leave.
  say "  kept $CREDS and $STATEDIR — remove them by hand if you mean to."
}

case "$MODE" in
  check)       report ;;
  credentials) write_credentials ;;
  install)     do_install ;;
  enable)      do_enable ;;
  disable)     do_disable ;;
  uninstall)   do_uninstall ;;
esac
