#!/usr/bin/env python3
"""Find risky settings in your own docker-compose.yml.

    python3 check.py                       # scan compose files under .
    python3 check.py compose.yaml deploy/  # scan specific files or directories
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 on any medium/high finding

## What it catches

A heuristic LINE SCAN of a Compose file's `services:` block for the settings
that hand a container the keys to the host or leak a credential:

  compose-privileged              privileged: true
  compose-docker-socket           /var/run/docker.sock mounted into a service
  compose-host-network            network_mode: host
  compose-dangerous-capability    cap_add: ALL or SYS_ADMIN
  compose-exposed-database-port   Postgres/MySQL/Redis/MongoDB/Elasticsearch port
                                  published on every interface
  compose-literal-secret          PASSWORD/SECRET/TOKEN/API_KEY set to a literal
                                  value in `environment:`
  compose-sensitive-host-mount    host path / or /etc (also /root /boot /proc /sys)
  compose-security-opt-unconfined seccomp / apparmor / label unconfined
  compose-host-namespace          pid: host or ipc: host
  compose-runs-as-root            user: root (or 0, 0:0)
  compose-image-latest            image with no tag, or :latest           (medium)
  compose-no-restart              no restart policy                       (low)
  compose-no-healthcheck          no healthcheck                          (low)

Each finding prints file:line, the risk and the exact fix.

## What it is, and is not

A static, read-only, indentation-and-regex line scan of files already on disk.
It makes NO network calls of any kind and sends nothing anywhere. It is NOT a
YAML parser, does not expand anchors, `extends`, `include` or ${VARIABLES}, and
does not read long-syntax `ports:` entries. It is NOT a security audit: it
flags some settings that are deliberate, misses everything outside these
patterns, and a clean scan is never proof a stack is safe. No warranty; review
each finding yourself. Secret values are never printed. Comments are ignored.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one medium or high finding exists.
"""

import argparse
import json
import os
import re
import sys

PRIVILEGED = "compose-privileged"
DOCKER_SOCKET = "compose-docker-socket"
HOST_NETWORK = "compose-host-network"
DANGEROUS_CAPABILITY = "compose-dangerous-capability"
EXPOSED_DATABASE_PORT = "compose-exposed-database-port"
LITERAL_SECRET = "compose-literal-secret"
SENSITIVE_HOST_MOUNT = "compose-sensitive-host-mount"
SECURITY_OPT_UNCONFINED = "compose-security-opt-unconfined"
HOST_NAMESPACE = "compose-host-namespace"
RUNS_AS_ROOT = "compose-runs-as-root"
IMAGE_LATEST = "compose-image-latest"
NO_RESTART = "compose-no-restart"
NO_HEALTHCHECK = "compose-no-healthcheck"

SEVERITY = {
    PRIVILEGED: "high",
    DOCKER_SOCKET: "high",
    HOST_NETWORK: "high",
    DANGEROUS_CAPABILITY: "high",
    EXPOSED_DATABASE_PORT: "high",
    LITERAL_SECRET: "high",
    SENSITIVE_HOST_MOUNT: "high",
    SECURITY_OPT_UNCONFINED: "high",
    HOST_NAMESPACE: "high",
    RUNS_AS_ROOT: "medium",
    IMAGE_LATEST: "medium",
    NO_RESTART: "low",
    NO_HEALTHCHECK: "low",
}
RISK_CLASSIFICATIONS = frozenset(SEVERITY)

DB_PORTS = {
    "5432": "Postgres",
    "3306": "MySQL/MariaDB",
    "6379": "Redis",
    "27017": "MongoDB",
    "9200": "Elasticsearch",
}
SENSITIVE_PATHS = ("/etc", "/root", "/boot", "/proc", "/sys")
SECRET_KEY = re.compile(
    r"(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)", re.I
)
COMPOSE_NAME = re.compile(r"^(?:docker-)?compose(?:[.\-].+)?\.ya?ml$", re.I)
SKIP_DIRS = frozenset(
    {".git", "node_modules", "vendor", "dist", "build", "__pycache__", ".venv", "venv",
     ".tox", "site-packages", "target"}
)
MAX_FILE_BYTES = 2_000_000

KEY_LINE = re.compile(r"""^\s*([A-Za-z0-9_.\-"']+)\s*:(?:\s+(.*))?$""")
LONG_KEY = re.compile(r"^(source|type|target|read_only|bind|volume)\s*:\s*(.*)$")
ROOT_USER = re.compile(r"^(?:root|0)(?::(?:root|0))?$", re.I)


def _unq(value):
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1].strip()
    return v


def _strip_comment(line):
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def _flow_items(value):
    inner = value.strip()
    if not (inner.startswith("[") and inner.endswith("]")):
        return None
    return [_unq(p) for p in inner[1:-1].split(",") if p.strip()]


def _finding(filename, line, type_, detail, fix):
    return {
        "file": filename,
        "line": line,
        "type": type_,
        "severity": SEVERITY[type_],
        "detail": detail,
        "remediation": fix,
    }


class _Scanner:
    def __init__(self, filename):
        self.filename = filename
        self.findings = []
        self.svc = None

    def add(self, line, type_, detail, fix):
        self.findings.append(_finding(self.filename, line, type_, detail, fix))

    def start(self, name, line):
        self.svc = {"name": name, "line": line, "restart": False, "health": False}

    def finish(self):
        s = self.svc
        self.svc = None
        if not s:
            return
        n = s["name"]
        if not s["restart"]:
            self.add(
                s["line"], NO_RESTART,
                f'service "{n}" has no restart policy, so it stays down after a crash or host reboot',
                "Add `restart: unless-stopped` to the service (or `restart: on-failure:5` for a job that should not loop forever).",
            )
        if not s["health"]:
            self.add(
                s["line"], NO_HEALTHCHECK,
                f'service "{n}" has no healthcheck, so Compose cannot tell a running container from a working one',
                "Add a healthcheck, for example `healthcheck: { test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:8080/health\"], interval: 30s, timeout: 5s, retries: 3 }`.",
            )

    def key(self, key, val, lineno):
        n = self.svc["name"]
        v = _unq(val)
        low = v.lower()
        if key == "privileged" and low in ("true", "yes", "on"):
            self.add(
                lineno, PRIVILEGED,
                f'service "{n}" runs privileged, which gives the container nearly every host capability and device',
                "Delete `privileged: true`. If it needs one device or capability, grant only that: `devices: [\"/dev/ttyUSB0:/dev/ttyUSB0\"]` or `cap_add: [NET_ADMIN]`.",
            )
        elif key == "network_mode" and low == "host":
            self.add(
                lineno, HOST_NETWORK,
                f'service "{n}" shares the host network stack, bypassing Docker network isolation',
                "Delete `network_mode: host` and publish only the ports you need with `ports:`, for example `\"127.0.0.1:8080:8080\"`.",
            )
        elif key in ("pid", "ipc") and low == "host":
            self.add(
                lineno, HOST_NAMESPACE,
                f'service "{n}" shares the host {key} namespace, so it can see or signal host processes' if key == "pid"
                else f'service "{n}" shares the host ipc namespace, so it can read host shared memory',
                f"Delete `{key}: host`. Use the default private namespace, or `{key}: service:<other>` to share only with a sibling container.",
            )
        elif key == "user" and ROOT_USER.match(v):
            self.add(
                lineno, RUNS_AS_ROOT,
                f'service "{n}" is told to run as root',
                "Run as an unprivileged user, for example `user: \"1000:1000\"` (or build the image with a non-root `USER`).",
            )
        elif key == "image" and v and "$" not in v and "@sha256:" not in v:
            last = v.split("/")[-1]
            if ":" not in last:
                self.add(
                    lineno, IMAGE_LATEST,
                    f'service "{n}" uses image {v} with no tag, which means :latest',
                    f"Pin a version: `image: {v}:<version>` (or a digest, `{v}@sha256:...`) so a rebuild cannot silently change what runs.",
                )
            elif last.split(":", 1)[1].lower() == "latest":
                self.add(
                    lineno, IMAGE_LATEST,
                    f'service "{n}" uses image {v}, a moving tag',
                    f"Pin a version: `image: {v.rsplit(':', 1)[0]}:<version>` (or a digest) so a rebuild cannot silently change what runs.",
                )
        elif key == "restart":
            self.svc["restart"] = True
        elif key == "healthcheck":
            self.svc["health"] = True
        items = _flow_items(val)
        if items is not None and key in ("ports", "cap_add", "security_opt", "volumes", "environment"):
            for it in items:
                self.item(key, it, lineno)

    def port(self, spec, lineno):
        s = spec.split("/")[0]
        if s.startswith("["):
            end = s.find("]")
            ip = s[: end + 1]
            rest = s[end + 1:].lstrip(":")
            parts = [ip] + rest.split(":")
        else:
            parts = s.split(":")
        if len(parts) == 3:
            ip, cport = parts[0], parts[2]
        elif len(parts) == 2:
            ip, cport = "", parts[1]
        elif len(parts) == 1:
            ip, cport = "", parts[0]
        else:
            return
        if ip not in ("", "0.0.0.0", "[::]", "::") or cport not in DB_PORTS:
            return
        n = self.svc["name"]
        self.add(
            lineno, EXPOSED_DATABASE_PORT,
            f'service "{n}" publishes {DB_PORTS[cport]} (container port {cport}) on every network interface',
            f"Bind it to loopback, `\"127.0.0.1:{cport}:{cport}\"`, or drop `ports:` and let other services reach it by service name on the Compose network.",
        )

    def mount(self, src, lineno):
        n = self.svc["name"]
        src = _unq(src)
        if "docker.sock" in src:
            self.add(
                lineno, DOCKER_SOCKET,
                f'service "{n}" mounts the Docker socket, which is root on the host for anything that can talk to it (read-only does not help)',
                "Remove the docker.sock mount. If a tool needs the Docker API, put a socket proxy (for example tecnativa/docker-socket-proxy) with only the endpoints it needs in front of it.",
            )
            return
        path = src.rstrip("/") or ("/" if src.startswith("/") else "")
        if path == "/" or any(path == p or path.startswith(p + "/") for p in SENSITIVE_PATHS):
            self.add(
                lineno, SENSITIVE_HOST_MOUNT,
                f'service "{n}" bind-mounts the host path {src}, exposing host-wide files to the container',
                "Mount only the one directory the service needs, for example `./data:/data`, or use a named volume, and add `:ro` when it only reads.",
            )

    def secret(self, k, v, lineno):
        v = _unq(v)
        if not v or "$" in v or not SECRET_KEY.search(k):
            return
        if "_FILE" in k.upper() or k.upper().endswith("_PATH"):
            return
        if v.lower() in ("true", "false", "yes", "no", "on", "off", "0", "1"):
            return
        n = self.svc["name"]
        self.add(
            lineno, LITERAL_SECRET,
            f'service "{n}" sets {k} to a literal value in the Compose file (the value is not shown here)',
            f"Move it out of the file: `{k}: ${{{k}}}` with the value in an uncommitted `.env`, or a Docker secret (`secrets:` plus `{k}_FILE`). Rotate it if this file was ever committed.",
        )

    def item(self, block, item, lineno):
        if block == "ports":
            self.port(item, lineno)
        elif block == "cap_add":
            cap = item.strip().upper()
            if cap.startswith("CAP_"):
                cap = cap[4:]
            if cap in ("ALL", "SYS_ADMIN"):
                self.add(
                    lineno, DANGEROUS_CAPABILITY,
                    f'service "{self.svc["name"]}" adds capability {cap}, which is close to full root on the host',
                    "Drop it. Use `cap_drop: [ALL]` and add back only the narrow capability the service needs (for example `NET_BIND_SERVICE`).",
                )
        elif block == "security_opt":
            if re.match(r"^(?:seccomp|apparmor)\s*[:=]\s*unconfined$|^label\s*[:=]\s*disable$", item.strip(), re.I):
                self.add(
                    lineno, SECURITY_OPT_UNCONFINED,
                    f'service "{self.svc["name"]}" turns off a container confinement layer ({item.strip()})',
                    "Delete the unconfined entry so Docker's default seccomp and AppArmor profiles apply, or supply a custom profile that allows only the syscall you need.",
                )
        elif block == "volumes":
            mm = LONG_KEY.match(item)
            if mm:
                if mm.group(1) == "source":
                    self.mount(mm.group(2), lineno)
            else:
                self.mount(item.split(":")[0], lineno)
        elif block == "environment":
            if "=" in item:
                k, v = item.split("=", 1)
                self.secret(k.strip(), v, lineno)

    def block_line(self, block, body, lineno):
        if block == "deploy" and body.startswith("restart_policy"):
            self.svc["restart"] = True
        if body.startswith("- ") or body == "-":
            self.item(block, _unq(body[1:].strip()), lineno)
            return
        mm = KEY_LINE.match(body)
        if not mm or mm.group(2) is None:
            return
        k, v = _unq(mm.group(1)), mm.group(2)
        if block == "volumes" and k == "source":
            self.mount(v, lineno)
        elif block == "environment":
            self.secret(k, v, lineno)


def scan_text(text, filename="<compose>"):
    sc = _Scanner(filename)
    in_services = False
    svc_indent = None
    child_indent = None
    block = None
    for i, raw in enumerate(re.split(r"\r?\n", text)):
        lineno = i + 1
        line = _strip_comment(raw).rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        body = line.strip()
        if indent == 0:
            sc.finish()
            svc_indent = child_indent = block = None
            mm = KEY_LINE.match(line)
            in_services = bool(mm and _unq(mm.group(1)) == "services")
            continue
        if not in_services:
            continue
        if svc_indent is None:
            svc_indent = indent
        if indent <= svc_indent:
            sc.finish()
            child_indent = block = None
            mm = KEY_LINE.match(line)
            if mm:
                sc.start(_unq(mm.group(1)), lineno)
            continue
        if sc.svc is None:
            continue
        if child_indent is None:
            child_indent = indent
        if indent == child_indent and not body.startswith("-"):
            mm = KEY_LINE.match(line)
            block = None
            if not mm:
                continue
            key, val = _unq(mm.group(1)), (mm.group(2) or "").strip()
            sc.key(key, val, lineno)
            if val == "":
                block = key
            continue
        if block is not None:
            sc.block_line(block, body, lineno)
    sc.finish()
    return sorted(sc.findings, key=lambda f: f["line"])


def discover_files(paths):
    """Relative-path/file pairs for every Compose file under paths."""
    out = []
    for root in paths:
        if os.path.isfile(root):
            out.append((os.path.basename(root), root))
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for name in sorted(filenames):
                if not COMPOSE_NAME.match(name):
                    continue
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, root).replace(os.sep, "/")
                out.append((rel, full))
    return out


def scan_path(paths):
    findings = []
    for rel, full in discover_files(paths):
        try:
            if os.path.getsize(full) > MAX_FILE_BYTES:
                print(f"warning: skipped {full}: larger than {MAX_FILE_BYTES} bytes", file=sys.stderr)
                continue
            with open(full, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError as exc:
            print(f"warning: could not read {full}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=rel))
    return findings


def has_risk(findings):
    return any(f["severity"] != "low" for f in findings)


def render_text(findings, paths):
    if not findings:
        n = len(discover_files(paths))
        if n == 0:
            return "No docker-compose.yml / compose.yaml files found under " + ", ".join(paths)
        return f"Scanned {n} compose file(s); no findings. (A heuristic line scan: this is not proof the stack is safe.)"
    lines = []
    for f in findings:
        lines.append(f"!! {f['file']}:{f['line']}  {f['type']}  [{f['severity']}]")
        lines.append(f"     risk: {f['detail']}")
        lines.append(f"     fix:  {f['remediation']}")
        lines.append("")
    lines.append(f"{len(findings)} finding(s). Heuristic line scan, not a security audit; review each one yourself.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", default=["."], help="compose files or directories to scan (default: .)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument("--fail-on-risk", action="store_true", help="exit 2 on any medium or high finding")
    args = parser.parse_args(argv)

    findings = scan_path(args.paths)
    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.paths))
    if args.fail_on_risk and has_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
