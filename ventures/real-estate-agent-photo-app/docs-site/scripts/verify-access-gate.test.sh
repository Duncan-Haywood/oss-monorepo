#!/usr/bin/env bash
set -euo pipefail

# Exercises every branch of verify-access-gate.sh against a local stub origin.
#
# verify-access-gate.sh gates the docs deploy, so both of its answers have to be
# demonstrated. Its FAIL path is already proven against the real world (the live
# hostname serves 200 + content today). This proves the PASS paths, so we know
# the gate check can actually be satisfied and is not a permanent deploy block —
# and it proves the fail path is driven by the response rather than by a
# hardcoded verdict.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY="${SCRIPT_DIR}/verify-access-gate.sh"

PORT="${ACCESS_TEST_PORT:-8791}"
STUB_PID=""
failures=0

CAN_BIND=0
if python3 -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', 0)); s.close()" 2>/dev/null; then
  CAN_BIND=1
fi

MOCK_DIR=""
if [[ "${CAN_BIND}" -eq 0 ]]; then
  MOCK_DIR="$(mktemp -d)"
  cat << 'SHIM' > "${MOCK_DIR}/curl"
#!/usr/bin/env bash
out_file=""
format=""
is_head=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out_file="$2"
      shift 2
      ;;
    -w)
      format="$2"
      shift 2
      ;;
    -sSI|-I|-sI)
      is_head=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

case "${STUB_MODE:-open}" in
  redirect)
    if [[ "${is_head}" -eq 1 ]]; then
      echo "HTTP/1.1 302 Found"
      echo "Location: https://example.cloudflareaccess.com/cdn-cgi/access/login/abc"
    else
      [[ -n "${out_file}" ]] && echo "" > "${out_file}"
      [[ "${format}" == *"%{http_code}"* ]] && printf "302"
    fi
    ;;
  forbidden)
    if [[ "${is_head}" -eq 1 ]]; then
      echo "HTTP/1.1 403 Forbidden"
    else
      [[ -n "${out_file}" ]] && echo "<html><body>Sign in with a one-time PIN</body></html>" > "${out_file}"
      [[ "${format}" == *"%{http_code}"* ]] && printf "403"
    fi
    ;;
  open)
    if [[ "${is_head}" -eq 1 ]]; then
      echo "HTTP/1.1 200 OK"
    else
      [[ -n "${out_file}" ]] && echo "<html><body>Listing Lens Docs</body></html>" > "${out_file}"
      [[ "${format}" == *"%{http_code}"* ]] && printf "200"
    fi
    ;;
  wrong-redirect)
    if [[ "${is_head}" -eq 1 ]]; then
      echo "HTTP/1.1 302 Found"
      echo "Location: https://example.com/somewhere"
    else
      [[ -n "${out_file}" ]] && echo "" > "${out_file}"
      [[ "${format}" == *"%{http_code}"* ]] && printf "302"
    fi
    ;;
  leaky-403)
    if [[ "${is_head}" -eq 1 ]]; then
      echo "HTTP/1.1 403 Forbidden"
    else
      [[ -n "${out_file}" ]] && echo "<html><body>Listing Lens Docs</body></html>" > "${out_file}"
      [[ "${format}" == *"%{http_code}"* ]] && printf "403"
    fi
    ;;
esac
SHIM
  chmod +x "${MOCK_DIR}/curl"
fi

cleanup_stub() {
  if [[ -n "${STUB_PID}" ]] && kill -0 "${STUB_PID}" 2>/dev/null; then
    kill "${STUB_PID}" 2>/dev/null || true
    wait "${STUB_PID}" 2>/dev/null || true
    STUB_PID=""
  fi
}

cleanup_all() {
  cleanup_stub
  if [[ -n "${MOCK_DIR}" && -d "${MOCK_DIR}" ]]; then
    rm -rf "${MOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup_all EXIT

# Serves one canned response shape on every request.
start_stub() {
  local mode="$1"
  cleanup_stub
  if [[ "${CAN_BIND}" -eq 0 ]]; then
    return 0
  fi
  MODE="${mode}" python3 - "${PORT}" <<'PY' &
import os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

MODE = os.environ["MODE"]
BODY = b"<html><body>Listing Lens Docs</body></html>"
LOGIN = b"<html><body>Sign in with a one-time PIN</body></html>"

class H(BaseHTTPRequestHandler):
    def respond(self):
        if MODE == "open":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(BODY)
        elif MODE == "redirect":
            self.send_response(302)
            self.send_header("Location", "https://example.cloudflareaccess.com/cdn-cgi/access/login/abc")
            self.end_headers()
        elif MODE == "forbidden":
            self.send_response(403)
            self.end_headers()
            self.wfile.write(LOGIN)
        elif MODE == "wrong-redirect":
            # A redirect that is NOT to Access must not count as a gate.
            self.send_response(302)
            self.send_header("Location", "https://example.com/somewhere")
            self.end_headers()
        elif MODE == "leaky-403":
            # Denied status but the content came back anyway.
            self.send_response(403)
            self.end_headers()
            self.wfile.write(BODY)

    def do_GET(self):
        self.respond()

    def do_HEAD(self):
        self.respond()

    def log_message(self, *args):
        pass

HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
  STUB_PID=$!
  for _ in $(seq 1 40); do
    if curl -sS -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
  done
  echo "stub failed to start" >&2
  exit 1
}

check() {
  local name="$1" mode="$2" expected="$3"
  start_stub "${mode}"

  local out
  if [[ "${CAN_BIND}" -eq 0 ]]; then
    out=$(PATH="${MOCK_DIR}:${PATH}" \
      STUB_MODE="${mode}" \
      DOCS_HOSTNAME="stub.invalid" \
      ACCESS_VERIFY_URL="http://127.0.0.1:${PORT}/" \
      ACCESS_VERIFY_ATTEMPTS=2 \
      ACCESS_VERIFY_DELAY=0 \
      bash "${VERIFY}" 2>&1) || actual=$?
    actual=${actual:-0}
  else
    out=$(DOCS_HOSTNAME="stub.invalid" \
      ACCESS_VERIFY_URL="http://127.0.0.1:${PORT}/" \
      ACCESS_VERIFY_ATTEMPTS=2 \
      ACCESS_VERIFY_DELAY=0 \
      bash "${VERIFY}" 2>&1) || actual=$?
    actual=${actual:-0}
  fi
  set -e

  if [[ "${actual}" == "${expected}" ]]; then
    echo "  ok   ${name} (exit ${actual})"
  else
    echo "  FAIL ${name}: expected exit ${expected}, got ${actual}" >&2
    echo "  Output: ${out}" >&2
    failures=$((failures + 1))
  fi
}

echo "verify-access-gate.test.sh:"
# Gated: an Access-protected origin bounces an anonymous caller to the login.
check "redirect to Access login passes" redirect 0
# Gated: a deny with no content is also acceptable evidence.
check "403 without site content passes" forbidden 0
# Ungated: this is the live site's current behaviour.
check "200 with site content fails" open 1
# A redirect somewhere else is not a gate.
check "redirect to a non-Access host fails" wrong-redirect 1
# Status alone is not evidence — the content must actually be withheld.
check "403 that still serves the content fails" leaky-403 1

if [[ "${failures}" -ne 0 ]]; then
  echo "verify-access-gate.test.sh: ${failures} failure(s)" >&2
  exit 1
fi
echo "verify-access-gate.test.sh: all assertions passed"
