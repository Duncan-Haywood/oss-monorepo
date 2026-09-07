#!/usr/bin/env bash
# Serve the portfolio site from a Hetzner box's own nginx and systemd.
#
# WHY THIS EXISTS
#
# This repository has ~175 finished products and, as of 2026-09-06, no way for
# a stranger to open any of them. Every route to a public surface is down, and
# two of the three are down because they were built on top of each other:
#
#   route                                   state   why
#   ------------------------------------    -----   ---------------------------
#   Argo CD on k3s (gitops/prod)            down    :6443 refused on both boxes
#   GitHub Pages (.github/workflows)        down    needs a runner; minutes out
#   self-hosted runners (gitops/ci)         down    they are pods in that k3s
#
# `gitops/agents/host/` and `gitops/ci/host/` already answer this for the two
# things that *build*: put them on the box's own systemd, where neither k3s nor
# an Actions runner is in the way. Both of their READMEs note that the boxes
# themselves were up the whole time -- `:22` answers on both.
#
# Nothing had yet done the same for the thing that *serves*. So the repository
# could restore its dev capacity and its CI to a box that still showed a
# stranger a refused connection. That is the gap this closes, and it is the
# only one of the three whose completion a user can see: it turns a dark
# catalogue into a served one, using the artifact `platform/pages/build.mjs`
# already produces and `platform/pages/check.mjs` already validates.
#
# WHAT IT DOES NOT DO
#
# It does not install, touch, or require k3s, Argo CD, or an Actions runner. It
# creates no Hetzner resources and never calls the Hetzner API. It holds no
# credential in argv -- `--credentials` reads stdin. It obtains no certificate
# unless you ask for one with `--tls`, and it never submits this domain to a
# browser HSTS preload list.
#
# It also does not decide that this site should be public. Running it on the
# production box, as root, with CONFIRM set, on a domain whose DNS already
# points here, IS that decision -- so there is deliberately no second gate
# after it (portfolio/DIRECTION.md: "do not add a second ask").
#
# USAGE
#
#   CONFIRM=install-portfolio-site-host ./bootstrap/scripts/install-portfolio-site-host.sh
#   SITE_TLS_EMAIL=you@example.com CONFIRM=install-portfolio-site-host \
#     ./bootstrap/scripts/install-portfolio-site-host.sh --tls
#   ./bootstrap/scripts/install-portfolio-site-host.sh --check
#
# See gitops/prod/host/README.md for the full walkthrough.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_HOST="$ROOT/gitops/prod/host"

PREFIX="${SITE_HOST_PREFIX:-/opt/portfolio-site}"
ETCDIR="${SITE_HOST_ETC:-/etc/portfolio-site}"
UNITDIR="${SITE_HOST_UNITDIR:-/etc/systemd/system}"
STATE_DIR="${SITE_HOST_STATE:-/var/lib/portfolio-site}"
NGINX_DIR="${SITE_HOST_NGINX_DIR:-/etc/nginx}"
REPO_DIR="$PREFIX/repo"
ACME_WEBROOT="$STATE_DIR/acme"
WEBROOT="$STATE_DIR/current"
CREDS="$ETCDIR/credentials.env"

SERVICE=portfolio-site-refresh.service
TIMER=portfolio-site-refresh.timer
NGINX_SITE="${SITE_HOST_NGINX_SITE:-portfolio-site.conf}"

SITE_REPO_URL="${SITE_REPO_URL:-https://github.com/Duncan-Haywood/monorepo-projects}"
# Apex plus www. `tools.marisstella.dev` is deliberately absent: in host mode
# the apex serves every tool itself out of build.mjs's dist, so pointing a
# second hostname at the same tree would publish every page twice under two
# names with one canonical between them -- a duplicate-content problem the
# in-cluster split did not have, because there `tools.` served a different
# artifact. Add it here only alongside a redirect, never as a second origin.
SITE_DOMAINS="${SITE_DOMAINS:-marisstella.dev www.marisstella.dev}"
SITE_BASE_URL="${SITE_BASE_URL:-https://marisstella.dev/}"
CERT_DIR="${SITE_HOST_CERT_DIR:-/etc/letsencrypt/live/${SITE_DOMAINS%% *}}"

MODE=install
for arg in "$@"; do
  case "$arg" in
    --check)       MODE=check ;;
    --tls)         MODE=tls ;;
    --credentials) MODE=credentials ;;
    --uninstall)   MODE=uninstall ;;
    -h|--help)     sed -n '2,52p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg (want: --check | --tls | --credentials | --uninstall)" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
ok()   { printf '  + %s\n' "$*"; }
fail() { echo "install-portfolio-site-host: $1" >&2; exit 1; }

require_root() {
  [[ "$(id -u)" == "0" ]] || fail "must run as root (it writes $PREFIX, $STATE_DIR, $NGINX_DIR and $UNITDIR)."
}

systemd_available() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl daemon-reload >/dev/null 2>&1 || return 1
  return 0
}

# ------------------------------------------------------------- prerequisites
#
# nginx serves, node builds, git fetches. A Hetzner `ubuntu-24.04` image
# (infra/servers.tf) ships none of the three, which is the same trap
# gitops/agents/host/README.md documents paying for: an installer that
# succeeds on a box that cannot actually do the job, with the breakage
# surfacing later and as the wrong symptom. So this refuses up front.
#
# Ubuntu 24.04's own `nodejs` is 18.x. build.mjs is an ES-module Node script
# using `node:` builtins and `fs.promises`, all of which 18 has; the version
# floor below is 18 for that reason and is checked rather than assumed,
# because a box on 22.04 has `node` present at 12.22 and `command -v` says
# yes.
PREREQS=(nginx node git curl)
NODE_MIN_MAJOR=18

# Binary name -> Debian/Ubuntu package that provides it, where they differ.
# `apt-get install node` does not install Node: on Debian and Ubuntu `node` is
# the Amateur Packet Radio Node program, and the JavaScript runtime is
# `nodejs`. So the remediation line has to name the package or following it
# leaves the operator with the wrong software and still no `node`.
prereq_package() {
  case "$1" in
    node) echo "nodejs" ;;
    *)    echo "$1" ;;
  esac
}

node_major() {
  local v
  v="$(node --version 2>/dev/null || true)"   # v22.22.2
  v="${v#v}"
  printf '%s' "${v%%.*}"
}

# Packages the last `host_prereqs` run found missing. A global because the
# install path acts on the list and `--check`, which also calls it, must not.
PREREQ_ABSENT=()

host_prereqs() {
  local absent=() tool rc=0
  PREREQ_ABSENT=()
  for tool in "${PREREQS[@]}"; do
    if command -v "$tool" >/dev/null 2>&1; then
      ok "$tool"
    else
      warn "missing: $tool"
      absent+=("$(prereq_package "$tool")")
      rc=1
    fi
  done

  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node_major)"
    if [[ -z "$major" || "$major" -lt "$NODE_MIN_MAJOR" ]]; then
      warn "node is $(node --version 2>/dev/null), but build.mjs needs >= v${NODE_MIN_MAJOR}"
      absent+=("nodejs")
      rc=1
    fi
  fi

  if [[ "${#absent[@]}" != "0" ]]; then
    PREREQ_ABSENT=("${absent[@]}")
    say ""
    say "  apt-get update && apt-get install -y --no-install-recommends ${absent[*]}"
    say ""
  fi
  return "$rc"
}

# Supply the packages `host_prereqs` just reported, from the distribution's own
# archive. Returns 1 when it cannot, leaving the caller to refuse.
#
# Same reasoning as `install-codex-host.sh`, and the same constraint: this is a
# plain `apt-get` against Ubuntu's archive -- nginx, nodejs, git and curl are
# all there -- so no third-party repository, no added key, and nothing
# downloaded and piped into a shell. Keep it that way; if a prerequisite ever
# falls outside the archive, refuse and say so rather than fetching an
# installer here.
#
# It matters more on this script than on that one. A box that cannot run the
# Codex worker is a box with no dev capacity; a box that cannot run *this* is a
# box still showing a stranger a refused connection, which is the outage this
# whole file exists to end.
install_prereqs() {
  [[ "${#PREREQ_ABSENT[@]}" == "0" ]] && return 0

  if ! command -v apt-get >/dev/null 2>&1; then
    warn "no apt-get on this host, so the packages above cannot be installed here"
    return 1
  fi

  say "  Installing them from the distribution archive."
  # Noninteractive: the caller is usually a non-interactive SSH command, and a
  # package that stopped to ask a question would hang the whole restore.
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

# --------------------------------------------------------------- nginx config
#
# The templates live in gitops/prod/host/ beside the units, and carry @@NAME@@
# placeholders. Substituting them here (rather than shipping a config with the
# domain baked in) is what lets the same templates be installed on a staging
# box or in a test with different paths, and what lets
# gitops/tests/test_portfolio_site_host.py assert mechanically that every
# placeholder a template uses is one this function knows how to fill.

# nginx has no conditionals, and `listen [::]:80` on a host without IPv6 is not
# a warning -- it is `socket() [::]:80 failed (97: Address family not
# supported by protocol)` and nginx refuses to start at all. On a box whose one
# job is serving this catalogue, that turns a missing kernel feature into a
# fully dark site. Hetzner Cloud servers do get a /64 by default, so the normal
# case is IPv6 present and the lines wanted; this exists so the abnormal case
# degrades to IPv4-only instead of to nothing. Measured: nginx 1.24.0 in a
# container with no /proc/net/if_inet6 fails exactly as above.
host_has_ipv6() { [[ -f /proc/net/if_inet6 ]]; }

render_conf() {
  local template="$1" dest="$2"
  [[ -f "$template" ]] || fail "missing template: $template"
  local ipv6_prefix=''
  if ! host_has_ipv6; then
    ipv6_prefix='# (disabled: no IPv6 on this host) '
  fi
  sed \
    -e "s|^\( *\)listen \[::\]|\1${ipv6_prefix}listen [::]|" \
    -e "s|@@SERVER_NAME@@|${SITE_DOMAINS}|g" \
    -e "s|@@WEBROOT@@|${WEBROOT}|g" \
    -e "s|@@ACME_WEBROOT@@|${ACME_WEBROOT}|g" \
    -e "s|@@CERT_FULLCHAIN@@|${CERT_DIR}/fullchain.pem|g" \
    -e "s|@@CERT_PRIVKEY@@|${CERT_DIR}/privkey.pem|g" \
    "$template" > "$dest"

  # Fail closed on an unsubstituted placeholder rather than handing nginx a
  # config containing a literal @@...@@. nginx would reject most of those, but
  # not all -- a placeholder inside a comment or a string would sail through
  # and the breakage would surface as a wrong header or a wrong path much
  # later, which is exactly the class of failure this repository keeps paying
  # for (CLAUDE.md, "a copied rule going stale").
  if grep -q '@@[A-Z_]*@@' "$dest"; then
    local left
    left="$(grep -o '@@[A-Z_]*@@' "$dest" | sort -u | tr '\n' ' ')"
    rm -f "$dest"
    fail "template $template has placeholders this installer does not fill: $left"
  fi
}

install_nginx_conf() {
  local template="$1"
  local target avail

  # Debian/Ubuntu's packaged nginx includes both sites-enabled/ and conf.d/.
  # Prefer sites-available + a symlink where that layout exists, because that
  # is what an operator on this box will expect to find and disable; fall back
  # to conf.d on anything else.
  if [[ -d "$NGINX_DIR/sites-available" && -d "$NGINX_DIR/sites-enabled" ]]; then
    avail="$NGINX_DIR/sites-available/$NGINX_SITE"
    target="$NGINX_DIR/sites-enabled/$NGINX_SITE"
    render_conf "$template" "$avail"
    ln -sfn "$avail" "$target"
    ok "installed $avail (enabled via sites-enabled)"

    # The packaged default vhost is `default_server` on :80, so leaving it
    # enabled means it, not this site, answers a request whose Host header does
    # not match -- including every health check by IP. Disabling it is
    # reversible (the file stays in sites-available) and is what makes this
    # site the one that answers.
    if [[ -e "$NGINX_DIR/sites-enabled/default" ]]; then
      rm -f "$NGINX_DIR/sites-enabled/default"
      ok "disabled the packaged default vhost (still in sites-available)"
    fi
  else
    install -d -m 0755 "$NGINX_DIR/conf.d"
    target="$NGINX_DIR/conf.d/$NGINX_SITE"
    render_conf "$template" "$target"
    ok "installed $target"
  fi
}

# Never reload nginx on a config it has not accepted. A bad reload on the one
# process serving the catalogue is the single most expensive mistake available
# here, and `nginx -t` costs milliseconds.
validate_and_reload_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    warn "nginx is not installed; the config is in place but nothing is serving."
    return 0
  fi
  if ! nginx -t; then
    fail "nginx rejected the configuration; nothing was reloaded and the previous config is still live."
  fi
  ok "nginx -t passed"
  if systemd_available; then
    systemctl enable nginx >/dev/null 2>&1 || true
    if systemctl is-active nginx >/dev/null 2>&1; then
      systemctl reload nginx && ok "nginx reloaded"
    else
      systemctl start nginx && ok "nginx started"
    fi
  else
    warn "systemd is not managing this host; run 'nginx -s reload' yourself."
  fi
}

tls_installed() { [[ -f "$CERT_DIR/fullchain.pem" && -f "$CERT_DIR/privkey.pem" ]]; }

# Google operates `.dev`, `.app` and `.page` and submitted each whole TLD to
# the browsers' HSTS preload list, so for a name under one of them HTTPS is not
# a hardening step -- it is the only way a browser will make the request at
# all. Worth saying precisely rather than warning on every domain: on a name
# that is not preloaded, an HTTP-only install genuinely does serve visitors,
# and crying wolf there would train an operator to skip the message on the one
# domain where it is load-bearing.
primary_domain() { printf '%s' "${SITE_DOMAINS%% *}"; }
domain_is_hsts_preloaded_tld() {
  case "$(primary_domain)" in
    *.dev|*.app|*.page) return 0 ;;
    *) return 1 ;;
  esac
}

# ------------------------------------------------------------------ reporting

report() {
  step "source tree"
  local missing=0 f
  for f in portfolio-site.http.conf portfolio-site.tls.conf refresh-site.sh "$SERVICE" "$TIMER"; do
    if [[ -f "$SRC_HOST/$f" ]]; then ok "$f"; else warn "missing from the checkout: gitops/prod/host/$f"; missing=1; fi
  done
  [[ "$missing" == "0" ]] || fail "the checkout is incomplete; nothing was changed."

  step "host prerequisites"
  host_prereqs || true

  step "installed state"
  if [[ -d "$REPO_DIR/.git" ]]; then
    ok "deploy checkout at $REPO_DIR ($(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo 'no commit'))"
  else
    say "  - no deploy checkout at $REPO_DIR"
  fi
  if [[ -x "$PREFIX/refresh-site.sh" ]]; then ok "refresh-site.sh installed"; else say "  - refresh-site.sh not installed"; fi
  if [[ -L "$WEBROOT" ]]; then
    ok "serving $(readlink "$WEBROOT") (built from $(cat "$WEBROOT/.built-from" 2>/dev/null || echo 'unknown'))"
    say "    $(find "$WEBROOT/" -type f 2>/dev/null | wc -l | tr -d ' ') files"
  else
    say "  - nothing staged at $WEBROOT (no release has been built)"
  fi
  if [[ -f "$CREDS" ]]; then
    ok "credentials present ($(stat -c '%a' "$CREDS") $(stat -c '%U' "$CREDS"))"
  else
    say "  - no credentials at $CREDS (refresh holds if the origin is private)"
  fi

  step "nginx"
  if command -v nginx >/dev/null 2>&1; then
    if [[ -e "$NGINX_DIR/sites-enabled/$NGINX_SITE" || -e "$NGINX_DIR/conf.d/$NGINX_SITE" ]]; then
      ok "site config installed"
    else
      say "  - site config not installed"
    fi
    if nginx -t >/dev/null 2>&1; then
      ok "nginx -t passes"
    else
      warn "nginx -t FAILS on the current config"
    fi
  else
    say "  - nginx is not installed"
  fi

  step "TLS"
  if tls_installed; then
    ok "certificate present at $CERT_DIR"
    if command -v openssl >/dev/null 2>&1; then
      say "    expires $(openssl x509 -enddate -noout -in "$CERT_DIR/fullchain.pem" 2>/dev/null | cut -d= -f2)"
    fi
  else
    say "  - no certificate at $CERT_DIR"
    say ""
    if domain_is_hsts_preloaded_tld; then
      warn "  $(primary_domain) is under an HSTS-preloaded TLD. Until a certificate is"
      warn "    installed, every mainstream browser rewrites http:// to https:// before"
      warn "    it opens a socket, so this site serves curl and nobody else."
    else
      say "    Serving over HTTP only. Visitors can reach it, but nothing is encrypted."
    fi
    say "    Obtain one with:  SITE_TLS_EMAIL=you@example.com $0 --tls"
  fi

  step "systemd"
  if systemd_available; then
    for u in "$SERVICE" "$TIMER"; do
      if [[ -f "$UNITDIR/$u" ]]; then
        ok "$u installed$(systemctl is-enabled "$u" >/dev/null 2>&1 && echo ' and enabled' || echo ' (not enabled)')"
      else
        say "  - $u not installed"
      fi
    done
    systemctl list-timers "$TIMER" --no-pager 2>/dev/null | sed -n '2p' | sed 's/^/    /' || true
  else
    say "  - systemd is not managing this host (units install, but nothing starts them)"
  fi
}

# --------------------------------------------------------------- credentials

write_credentials() {
  require_root
  [[ ! -t 0 ]] || fail "--credentials reads the env file from stdin; pipe it in."
  install -d -m 0750 "$ETCDIR"
  local tmp
  tmp="$(mktemp "$ETCDIR/.credentials.XXXXXX")"
  chmod 0600 "$tmp"
  cat > "$tmp"
  [[ -s "$tmp" ]] || { rm -f "$tmp"; fail "stdin was empty; $CREDS left unchanged."; }
  mv "$tmp" "$CREDS"
  chmod 0600 "$CREDS"
  ok "wrote $CREDS (0600)"
  say "  it takes effect on the next timer tick, or run: systemctl start $SERVICE"
}

# -------------------------------------------------------------------- install

ensure_checkout() {
  step "deploy checkout"
  if [[ -d "$REPO_DIR/.git" ]]; then
    ok "already present at $REPO_DIR"
    return 0
  fi
  install -d -m 0755 "$PREFIX"

  # A full clone of the origin is the wanted end state: refresh-site.sh fetches
  # `main` from it on every tick. When the origin is private and this box has
  # no token yet, fall back to cloning the tree the operator rsync'd here and
  # then point its origin at GitHub -- that gives a box that serves correctly
  # today and starts self-updating the moment a credential arrives, instead of
  # an installer that refuses to produce a site at all.
  local askpass=''
  if [[ -f "$CREDS" ]]; then
    set -a
    # shellcheck source=/dev/null
    . "$CREDS"
    set +a
  fi
  # Never let git open an interactive prompt. Without this, a clone that needs
  # a credential this box does not have blocks on "Username for
  # 'https://github.com':" until something times it out -- and the same code
  # path runs from a systemd unit with no terminal at all.
  export GIT_TERMINAL_PROMPT=0
  if [[ -n "${GH_TOKEN:-}" ]]; then
    askpass="$(mktemp)"; chmod 0700 "$askpass"
    # Single quotes on purpose: `$GH_TOKEN` must reach the generated helper
    # unexpanded and be read from the environment when git runs it, so the
    # token is never written to a file on disk.
    # shellcheck disable=SC2016
    printf '#!/bin/sh\nprintf "%%s" "$GH_TOKEN"\n' > "$askpass"
    export GIT_ASKPASS="$askpass"
  fi

  if git clone --quiet --branch main "$SITE_REPO_URL" "$REPO_DIR" 2>/dev/null; then
    ok "cloned $SITE_REPO_URL"
  elif [[ -d "$ROOT/.git" ]]; then
    warn "could not clone $SITE_REPO_URL (private origin, no usable GH_TOKEN?)"
    git clone --quiet "$ROOT" "$REPO_DIR"
    git -C "$REPO_DIR" remote set-url origin "$SITE_REPO_URL"
    ok "cloned the local checkout instead; origin points at $SITE_REPO_URL"
    say "    it will self-update once credentials arrive: $0 --credentials"
  else
    [[ -n "$askpass" ]] && rm -f "$askpass"
    fail "cannot clone $SITE_REPO_URL and $ROOT is not a git checkout (was .git excluded from the rsync?).
  Either give this box a credential first ($0 --credentials <<< 'GH_TOKEN=...')
  or rsync the repository including its .git directory."
  fi
  [[ -n "$askpass" ]] && rm -f "$askpass"
  unset GIT_ASKPASS
}

do_install() {
  require_root
  [[ "${CONFIRM:-}" == "install-portfolio-site-host" ]] || \
    fail "refusing to install without CONFIRM=install-portfolio-site-host (or use --check)."

  step "source tree"
  local f
  for f in portfolio-site.http.conf portfolio-site.tls.conf refresh-site.sh "$SERVICE" "$TIMER"; do
    [[ -f "$SRC_HOST/$f" ]] || fail "missing from the checkout: gitops/prod/host/$f; nothing was changed."
  done
  ok "templates, units and refresh script present"

  # Try to supply what is missing, then re-ask rather than trusting apt's exit
  # code -- a package can install and still put nothing on PATH, and an install
  # that proceeds on that basis leaves a box that cannot serve while reporting
  # clean. Only a second failed check refuses, before anything is written.
  step "host prerequisites"
  if ! host_prereqs; then
    if [[ "${SKIP_PREREQ_INSTALL:-0}" == "1" ]]; then
      warn "SKIP_PREREQ_INSTALL=1 — not installing the packages above."
    elif install_prereqs; then
      step "host prerequisites (re-checked)"
      host_prereqs || true
    fi
  fi
  [[ "${#PREREQ_ABSENT[@]}" == "0" ]] || \
    fail "install the packages above and re-run. Nothing was changed."

  step "directories"
  install -d -m 0755 "$PREFIX" "$STATE_DIR" "$STATE_DIR/releases" "$ACME_WEBROOT"
  install -d -m 0750 "$ETCDIR"
  ok "$PREFIX, $STATE_DIR, $ETCDIR"

  ensure_checkout

  step "refresh script"
  install -m 0755 "$SRC_HOST/refresh-site.sh" "$PREFIX/refresh-site.sh"
  ok "refresh-site.sh"

  step "first release"
  # Build before touching nginx, so the config is only ever pointed at a tree
  # that exists and has passed check.mjs. The alternative order gives a window
  # where nginx serves a root that is not there yet -- a 404 on every path.
  if SITE_REPO_DIR="$REPO_DIR" SITE_STATE_DIR="$STATE_DIR" SITE_BASE_URL="$SITE_BASE_URL" \
       bash "$PREFIX/refresh-site.sh"; then
    ok "built and staged"
  else
    fail "the first build failed; nginx was not reconfigured and nothing is being served yet.
  The output above is from build.mjs or check.mjs -- fix that and re-run."
  fi
  [[ -L "$WEBROOT" ]] || fail "refresh-site.sh reported success but $WEBROOT is not a symlink; refusing to configure nginx."

  step "nginx"
  # Keep the TLS config if a certificate is already here (a re-install must not
  # silently downgrade a serving HTTPS site to the pre-TLS block), otherwise
  # start on HTTP so `--tls` has an ACME path to answer on.
  if tls_installed; then
    install_nginx_conf "$SRC_HOST/portfolio-site.tls.conf"
    ok "certificate present -- installed the TLS config"
  else
    install_nginx_conf "$SRC_HOST/portfolio-site.http.conf"
  fi
  validate_and_reload_nginx

  step "systemd units"
  install -d -m 0755 "$UNITDIR"
  install -m 0644 "$SRC_HOST/$SERVICE" "$UNITDIR/$SERVICE"
  install -m 0644 "$SRC_HOST/$TIMER" "$UNITDIR/$TIMER"
  ok "$SERVICE, $TIMER"

  if ! systemd_available; then
    warn "systemd is not managing this host; the units are in place but nothing starts them."
    warn "the site under $WEBROOT is complete and nginx is configured for it."
  else
    systemctl daemon-reload
    systemctl enable --now "$TIMER"
    ok "$TIMER enabled (rebuilds from main every 10 minutes)"
  fi

  step "next"
  if ! tls_installed; then
    if domain_is_hsts_preloaded_tld; then
      say "  1. Get a certificate. $(primary_domain) is under an HSTS-preloaded TLD, so"
      say "     until this step a browser will NOT load the site, however healthy curl says it is:"
    else
      say "  1. Get a certificate, so visitors reach this over HTTPS rather than in the clear:"
    fi
    say "       SITE_TLS_EMAIL=you@example.com CONFIRM=install-portfolio-site-host $0 --tls"
  fi
  if [[ ! -f "$CREDS" ]]; then
    say "  2. Give it read access so it keeps itself current (reads stdin, never argv):"
    say "       $0 --credentials <<< 'GH_TOKEN=<fine-grained PAT, Contents: Read>'"
  fi
  say "  Verify:  curl -sS -o /dev/null -w '%{http_code}\\n' http://127.0.0.1/healthz"
  say "  Watch:   journalctl -u $SERVICE -f"
  say "  Check:   $0 --check"
}

# ------------------------------------------------------------------------ tls

do_tls() {
  require_root
  [[ "${CONFIRM:-}" == "install-portfolio-site-host" ]] || \
    fail "refusing to request a certificate without CONFIRM=install-portfolio-site-host."
  command -v certbot >/dev/null 2>&1 || fail "certbot is not installed.
  apt-get update && apt-get install -y --no-install-recommends certbot"
  [[ -n "${SITE_TLS_EMAIL:-}" ]] || fail "set SITE_TLS_EMAIL to the address Let's Encrypt should send expiry warnings to.
  It is the only way you learn a renewal has been failing before the certificate lapses."
  [[ -d "$ACME_WEBROOT" ]] || fail "no ACME webroot at $ACME_WEBROOT -- run the installer first."

  step "certificate"
  local args=(certonly --webroot -w "$ACME_WEBROOT" --agree-tos --non-interactive
              --email "$SITE_TLS_EMAIL" --keep-until-expiring)
  local d
  for d in $SITE_DOMAINS; do args+=(-d "$d"); done
  # --webroot rather than --nginx on purpose. The nginx plugin edits the
  # server block in place, which would fight this installer's own idempotent
  # re-render of that same file: whichever ran last would win, and a re-install
  # would silently strip the TLS the plugin added. With --webroot, certbot only
  # ever writes to /etc/letsencrypt and the config stays this repository's.
  say "  certbot ${args[*]}"
  certbot "${args[@]}"
  tls_installed || fail "certbot reported success but $CERT_DIR/fullchain.pem is missing.
  Check 'certbot certificates' -- nginx has not been reconfigured, so the site is unchanged."
  ok "certificate at $CERT_DIR"

  step "nginx"
  install_nginx_conf "$SRC_HOST/portfolio-site.tls.conf"
  validate_and_reload_nginx

  step "renewal"
  # certbot's package ships its own renewal timer; it just has no reason to
  # reload nginx, which would otherwise keep serving the expired certificate
  # out of its own memory until something restarted it.
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
# Installed by bootstrap/scripts/install-portfolio-site-host.sh.
# nginx holds the certificate in memory, so a renewed file on disk changes
# nothing served until it is reloaded.
systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
HOOK
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  ok "deploy hook reloads nginx after each renewal"
  if systemd_available; then
    systemctl list-timers 'certbot*' --no-pager 2>/dev/null | sed -n '2p' | sed 's/^/    /' || true
  fi

  step "next"
  say "  Verify from off the box:  curl -sSI https://${SITE_DOMAINS%% *}/healthz"
  say "  Dry-run a renewal:        certbot renew --dry-run"
}

# ------------------------------------------------------------------ uninstall

do_uninstall() {
  require_root
  [[ "${CONFIRM:-}" == "install-portfolio-site-host" ]] || \
    fail "refusing to uninstall without CONFIRM=install-portfolio-site-host."

  step "systemd"
  if systemd_available; then
    systemctl disable --now "$TIMER" 2>/dev/null || true
    systemctl stop "$SERVICE" 2>/dev/null || true
    ok "timer stopped and disabled"
  fi
  rm -f "$UNITDIR/$SERVICE" "$UNITDIR/$TIMER"
  ok "removed the units"
  systemd_available && systemctl daemon-reload || true

  step "nginx"
  rm -f "$NGINX_DIR/sites-enabled/$NGINX_SITE" "$NGINX_DIR/sites-available/$NGINX_SITE" \
        "$NGINX_DIR/conf.d/$NGINX_SITE"
  ok "removed the site config"
  if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
    systemd_available && systemctl reload nginx 2>/dev/null || true
    ok "nginx reloaded without this site"
  fi

  step "files"
  rm -rf "${PREFIX:?}"
  ok "removed $PREFIX"
  say "  kept $CREDS — remove it by hand if you mean to."
  say "  kept $STATE_DIR (the built releases; rollback material) — remove by hand if you mean to."
  say "  kept the Let's Encrypt certificate — 'certbot delete' if you mean to."
}

case "$MODE" in
  check)       report ;;
  credentials) write_credentials ;;
  install)     do_install ;;
  tls)         do_tls ;;
  uninstall)   do_uninstall ;;
esac
