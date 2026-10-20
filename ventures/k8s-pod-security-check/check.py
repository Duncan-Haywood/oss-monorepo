#!/usr/bin/env python3
"""Find risky pod and container security settings in your own Kubernetes manifests.

    python3 check.py                        # scan *.yaml / *.yml under .
    python3 check.py deploy.yaml k8s/       # scan specific files or directories
    python3 check.py --format json          # machine-readable
    python3 check.py --fail-on-risk         # exit 2 on any medium/high finding

## What it catches

A heuristic LINE SCAN of Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet,
ReplicationController, Job and CronJob documents (multi-document `---` files
are split). The pod spec is found at spec (Pod), spec.template.spec
(workloads) or spec.jobTemplate.spec.template.spec (CronJob).

  k8s-privileged              privileged: true                                (high)
  k8s-host-namespace          hostNetwork / hostPID / hostIPC: true           (high)
  k8s-hostpath-sensitive      hostPath of /, /etc, /root, /proc, /sys,
                              /var/lib/kubelet or docker.sock                 (high)
  k8s-dangerous-capability    capabilities.add of ALL, SYS_ADMIN, NET_ADMIN,
                              SYS_PTRACE, SYS_MODULE, DAC_READ_SEARCH         (high)
  k8s-literal-secret-env      PASSWORD/SECRET/TOKEN/API_KEY as a literal
                              env value                                       (high)
  k8s-privilege-escalation    allowPrivilegeEscalation true or unset          (medium)
  k8s-runs-as-root            runAsUser 0, runAsNonRoot false or unset        (medium)
  k8s-hostpath-volume         any other hostPath volume                       (medium)
  k8s-image-latest            image with no tag, or :latest                   (medium)
  k8s-host-port               hostPort used                                   (medium)
  k8s-no-security-context     container with no securityContext at all        (medium)
  k8s-capabilities-not-dropped  capabilities.drop does not include ALL       (low)
  k8s-writable-root-fs        readOnlyRootFilesystem not true                 (low)
  k8s-automount-token         automountServiceAccountToken not false          (low)
  k8s-seccomp-missing         seccompProfile unset (or Unconfined)            (low)

Each finding prints file:line, the resource and container, the risk and the
exact YAML fix.

## What it is, and is not

A static, read-only, indentation-and-regex line scan of files already on disk.
It makes NO network calls of any kind and sends nothing anywhere. It is NOT a
YAML parser, does not expand anchors, Helm templates, Kustomize overlays or
flow-style maps, and does not know your cluster's admission policies. It is NOT
a security audit and NOT a compliance claim (CIS, NSA, Pod Security Standards
or otherwise): a clean scan means only that these patterns were not found.
Review each finding yourself. Secret values are never printed. Comments are
ignored.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one medium or high finding exists.
"""

import argparse
import json
import os
import re
import sys

PRIVILEGED = "k8s-privileged"
HOST_NAMESPACE = "k8s-host-namespace"
HOSTPATH_SENSITIVE = "k8s-hostpath-sensitive"
DANGEROUS_CAPABILITY = "k8s-dangerous-capability"
LITERAL_SECRET_ENV = "k8s-literal-secret-env"
PRIVILEGE_ESCALATION = "k8s-privilege-escalation"
RUNS_AS_ROOT = "k8s-runs-as-root"
HOSTPATH_VOLUME = "k8s-hostpath-volume"
IMAGE_LATEST = "k8s-image-latest"
HOST_PORT = "k8s-host-port"
NO_SECURITY_CONTEXT = "k8s-no-security-context"
CAPABILITIES_NOT_DROPPED = "k8s-capabilities-not-dropped"
WRITABLE_ROOT_FS = "k8s-writable-root-fs"
AUTOMOUNT_TOKEN = "k8s-automount-token"
SECCOMP_MISSING = "k8s-seccomp-missing"

SEVERITY = {
    PRIVILEGED: "high",
    HOST_NAMESPACE: "high",
    HOSTPATH_SENSITIVE: "high",
    DANGEROUS_CAPABILITY: "high",
    LITERAL_SECRET_ENV: "high",
    PRIVILEGE_ESCALATION: "medium",
    RUNS_AS_ROOT: "medium",
    HOSTPATH_VOLUME: "medium",
    IMAGE_LATEST: "medium",
    HOST_PORT: "medium",
    NO_SECURITY_CONTEXT: "medium",
    CAPABILITIES_NOT_DROPPED: "low",
    WRITABLE_ROOT_FS: "low",
    AUTOMOUNT_TOKEN: "low",
    SECCOMP_MISSING: "low",
}
RISK_CLASSIFICATIONS = frozenset(SEVERITY)

POD_PATHS = {
    "Pod": ["spec"],
    "Deployment": ["spec", "template", "spec"],
    "StatefulSet": ["spec", "template", "spec"],
    "DaemonSet": ["spec", "template", "spec"],
    "ReplicaSet": ["spec", "template", "spec"],
    "ReplicationController": ["spec", "template", "spec"],
    "Job": ["spec", "template", "spec"],
    "CronJob": ["spec", "jobTemplate", "spec", "template", "spec"],
}
DANGEROUS_CAPS = ("SYS_ADMIN", "NET_ADMIN", "ALL", "SYS_PTRACE", "SYS_MODULE", "DAC_READ_SEARCH")
SENSITIVE_PATHS = ("/etc", "/root", "/proc", "/sys", "/var/lib/kubelet")
SECRET_KEY = re.compile(
    r"(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)", re.I
)
YAML_NAME = re.compile(r"\.ya?ml$", re.I)
SKIP_DIRS = frozenset(
    {".git", "node_modules", "vendor", "dist", "build", "__pycache__", ".venv", "venv",
     ".tox", "site-packages", "target"}
)
MAX_FILE_BYTES = 2_000_000

KEY_LINE = re.compile(r"""^(["']?[A-Za-z0-9_.\-/]+["']?)\s*:(?:\s+(.*))?$""")
DOC_SEP = re.compile(r"^---(?:\s|$)")
TRUE_WORDS = ("true", "yes", "on")
FALSE_WORDS = ("false", "no", "off")


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


def _entries(lines):
    """Split a block of (lineno, indent, body) mapping lines into key entries."""
    if not lines:
        return []
    ki = lines[0][1]
    out = []
    cur = None
    for ln, ind, body in lines:
        if ind == ki and not body.startswith("-"):
            m = KEY_LINE.match(body)
            if not m:
                cur = None
                continue
            cur = {"key": _unq(m.group(1)), "val": (m.group(2) or "").strip(), "line": ln, "children": []}
            out.append(cur)
        elif cur is not None and (ind > ki or (ind == ki and body.startswith("-"))):
            cur["children"].append((ln, ind, body))
    return out


def _by_key(entries):
    d = {}
    for e in entries:
        d[e["key"]] = e
    return d


def _items(lines):
    """Split a block of list lines into items: {line, scalar, lines}."""
    if not lines:
        return []
    ii = lines[0][1]
    out = []
    cur = None
    for ln, ind, body in lines:
        if ind == ii and (body.startswith("- ") or body == "-"):
            rest = body[1:]
            stripped = rest.lstrip(" ")
            off = ind + 1 + (len(rest) - len(stripped))
            cur = {"line": ln, "scalar": None, "lines": []}
            out.append(cur)
            if stripped:
                if KEY_LINE.match(stripped):
                    cur["lines"].append((ln, off, stripped))
                else:
                    cur["scalar"] = _unq(stripped)
        elif cur is not None and ind > ii:
            cur["lines"].append((ln, ind, body))
    return out


def _scalars(entry):
    """List scalars of an entry, whether flow `[a, b]` or a block list."""
    if entry is None:
        return []
    flow = _flow_items(entry["val"])
    if flow is not None:
        return [(s, entry["line"]) for s in flow]
    return [(it["scalar"], it["line"]) for it in _items(entry["children"]) if it["scalar"] is not None]


def _truthy(e):
    return e is not None and _unq(e["val"]).lower() in TRUE_WORDS


def _falsy(e):
    return e is not None and _unq(e["val"]).lower() in FALSE_WORDS


def _security_context(entry):
    if entry is None:
        return None
    m = _by_key(_entries(entry["children"]))
    caps = m.get("capabilities")
    cm = _by_key(_entries(caps["children"])) if caps else {}
    sp = m.get("seccompProfile")
    spm = _by_key(_entries(sp["children"])) if sp else {}
    return {
        "line": entry["line"],
        "privileged": m.get("privileged"),
        "allow_pe": m.get("allowPrivilegeEscalation"),
        "run_as_user": m.get("runAsUser"),
        "run_as_non_root": m.get("runAsNonRoot"),
        "read_only": m.get("readOnlyRootFilesystem"),
        "caps_line": caps["line"] if caps else None,
        "add": _scalars(cm.get("add")),
        "drop": _scalars(cm.get("drop")),
        "seccomp": spm.get("type") if sp else None,
        "seccomp_line": sp["line"] if sp else None,
    }


class _Scanner:
    def __init__(self, filename):
        self.filename = filename
        self.findings = []
        self.resource = ""
        self.container = ""

    def add(self, line, type_, detail, fix):
        self.findings.append({
            "file": self.filename,
            "line": line,
            "type": type_,
            "severity": SEVERITY[type_],
            "resource": self.resource,
            "container": self.container,
            "detail": detail,
            "remediation": fix,
        })

    def pod(self, lines):
        p = _by_key(_entries(lines))
        first = None
        for k in ("containers", "initContainers"):
            if k in p and (first is None or p[k]["line"] < first):
                first = p[k]["line"]
        if first is None:
            return
        self.container = "(pod)"
        for k in ("hostNetwork", "hostPID", "hostIPC"):
            if _truthy(p.get(k)):
                self.add(
                    p[k]["line"], HOST_NAMESPACE,
                    f"the pod sets {k}: true, sharing the node's "
                    + {"hostNetwork": "network stack", "hostPID": "process namespace", "hostIPC": "IPC namespace"}[k],
                    f"Delete `{k}: true` (or set it to false) in the pod spec.",
                )
        vol = p.get("volumes")
        if vol:
            for it in _items(vol["children"]):
                ents = _by_key(_entries(it["lines"]))
                hp = ents.get("hostPath")
                if not hp:
                    continue
                pe = _by_key(_entries(hp["children"])).get("path")
                if not pe:
                    continue
                self.host_path(_unq(ents["name"]["val"]) if "name" in ents else "?", _unq(pe["val"]), pe["line"])
        am = p.get("automountServiceAccountToken")
        if not _falsy(am):
            self.add(
                am["line"] if am else first, AUTOMOUNT_TOKEN,
                "the pod does not set automountServiceAccountToken: false, so every container gets an API token mounted",
                "Set `automountServiceAccountToken: false` in the pod spec unless the workload calls the Kubernetes API.",
            )
        pod_sc = _security_context(p.get("securityContext"))
        for k in ("containers", "initContainers"):
            if k in p:
                for it in _items(p[k]["children"]):
                    self.ctr(it, pod_sc)

    def host_path(self, vname, path, lineno):
        norm = path.rstrip("/") or ("/" if path.startswith("/") else "")
        sensitive = (
            "docker.sock" in path
            or norm == "/"
            or any(norm == s or norm.startswith(s + "/") for s in SENSITIVE_PATHS)
        )
        if sensitive:
            self.add(
                lineno, HOSTPATH_SENSITIVE,
                f'volume "{vname}" mounts the node path {path}, which exposes host-wide files or the container runtime',
                f"Remove the hostPath volume `{vname}`. Use an emptyDir, a ConfigMap/Secret or a PersistentVolumeClaim, for example `volumes: [{{ name: {vname}, emptyDir: {{}} }}]`.",
            )
        else:
            self.add(
                lineno, HOSTPATH_VOLUME,
                f'volume "{vname}" mounts the node path {path}, tying the pod to one node and its filesystem',
                f"Replace the hostPath volume `{vname}` with an emptyDir or a PersistentVolumeClaim; if it must stay, mount it `readOnly: true` in the container.",
            )

    def ctr(self, item, pod_sc):
        ents = _by_key(_entries(item["lines"]))
        name = _unq(ents["name"]["val"]) if "name" in ents else "(unnamed)"
        self.container = name
        line = item["line"]
        img = ents.get("image")
        if img:
            v = _unq(img["val"])
            if v and "$" not in v and "{{" not in v and "@sha256:" not in v:
                last = v.split("/")[-1]
                if ":" not in last:
                    self.add(
                        img["line"], IMAGE_LATEST,
                        f"image {v} has no tag, which means :latest",
                        f"Pin a version: `image: {v}:<version>` (or a digest, `{v}@sha256:...`) so a rebuild cannot silently change what runs.",
                    )
                elif last.split(":", 1)[1].lower() == "latest":
                    self.add(
                        img["line"], IMAGE_LATEST,
                        f"image {v} uses a moving tag",
                        f"Pin a version: `image: {v.rsplit(':', 1)[0]}:<version>` (or a digest) so a rebuild cannot silently change what runs.",
                    )
        env = ents.get("env")
        if env:
            for it in _items(env["children"]):
                e = _by_key(_entries(it["lines"]))
                if "name" not in e or "value" not in e:
                    continue
                k = _unq(e["name"]["val"])
                v = _unq(e["value"]["val"])
                up = k.upper()
                if (not v or "$(" in v or "{{" in v or not SECRET_KEY.search(k)
                        or "_FILE" in up or up.endswith("_PATH")
                        or v.lower() in ("true", "false", "yes", "no", "on", "off", "0", "1")):
                    continue
                self.add(
                    e["value"]["line"], LITERAL_SECRET_ENV,
                    f"env {k} is set to a literal value in the manifest (the value is not shown here)",
                    f"Move it into a Secret and reference it: `- name: {k}` with `valueFrom: {{ secretKeyRef: {{ name: app-secrets, key: {k} }} }}`. Rotate it if this file was ever committed.",
                )
        ports = ents.get("ports")
        if ports:
            for it in _items(ports["children"]):
                e = _by_key(_entries(it["lines"]))
                hp = e.get("hostPort")
                if hp and _unq(hp["val"]) not in ("", "0"):
                    self.add(
                        hp["line"], HOST_PORT,
                        f"hostPort {_unq(hp['val'])} binds a port on the node itself, bypassing Services and limiting scheduling",
                        "Delete `hostPort` and expose the pod through a Service (ClusterIP, or NodePort / LoadBalancer when it must be reachable).",
                    )
        sc = _security_context(ents.get("securityContext"))
        if _truthy(sc["privileged"] if sc else None):
            self.add(
                sc["privileged"]["line"], PRIVILEGED,
                "the container runs privileged, which gives it nearly every host capability and device",
                "Set `privileged: false` (or delete the line) under the container's securityContext. If it needs one capability, add only that: `capabilities: { add: [NET_ADMIN] }`.",
            )
        if sc:
            for cap, cl in sc["add"]:
                c = cap.strip().upper()
                if c.startswith("CAP_"):
                    c = c[4:]
                if c in DANGEROUS_CAPS:
                    self.add(
                        cl, DANGEROUS_CAPABILITY,
                        f"the container adds capability {c}, which is close to full root on the node",
                        f"Remove {c} from `capabilities.add` and use `capabilities: {{ drop: [ALL] }}`, adding back only the narrow capability needed (for example `NET_BIND_SERVICE`).",
                    )
        if sc:
            if _truthy(sc["allow_pe"]):
                self.add(
                    sc["allow_pe"]["line"], PRIVILEGE_ESCALATION,
                    "allowPrivilegeEscalation is true, so a process can gain more privileges than its parent",
                    "Set `allowPrivilegeEscalation: false` under the container's securityContext.",
                )
            elif sc["allow_pe"] is None:
                self.add(
                    sc["line"], PRIVILEGE_ESCALATION,
                    "allowPrivilegeEscalation is not set, and Kubernetes defaults it to true",
                    "Add `allowPrivilegeEscalation: false` under the container's securityContext.",
                )
        eff_user = (sc["run_as_user"] if sc and sc["run_as_user"] else None) or (pod_sc["run_as_user"] if pod_sc else None)
        eff_nr = (sc["run_as_non_root"] if sc and sc["run_as_non_root"] else None) or (pod_sc["run_as_non_root"] if pod_sc else None)
        user_nonzero = eff_user is not None and re.match(r"^\d+$", _unq(eff_user["val"])) and int(_unq(eff_user["val"])) != 0
        root_fix = "Set `runAsNonRoot: true` and `runAsUser: 10001` under securityContext (the image must support a non-root user)."
        if eff_user is not None and _unq(eff_user["val"]) == "0":
            self.add(eff_user["line"], RUNS_AS_ROOT, "the container is told to run as user 0 (root)", root_fix)
        elif _falsy(eff_nr):
            self.add(eff_nr["line"], RUNS_AS_ROOT, "runAsNonRoot is false, so the container may run as root", root_fix)
        elif sc and not _truthy(eff_nr) and not user_nonzero:
            self.add(sc["line"], RUNS_AS_ROOT, "neither runAsNonRoot: true nor a non-zero runAsUser is set, so the container may run as root", root_fix)
        if sc:
            if "ALL" not in [c.strip().upper() for c, _ in sc["drop"]]:
                self.add(
                    sc["caps_line"] or sc["line"], CAPABILITIES_NOT_DROPPED,
                    "capabilities.drop does not include ALL, so the container keeps the runtime's default capabilities",
                    "Add `capabilities: { drop: [ALL] }` under the container's securityContext.",
                )
            if not _truthy(sc["read_only"]):
                self.add(
                    sc["read_only"]["line"] if sc["read_only"] else sc["line"], WRITABLE_ROOT_FS,
                    "readOnlyRootFilesystem is not true, so an attacker in the container can write to its filesystem",
                    "Set `readOnlyRootFilesystem: true` and mount an `emptyDir` at any path the app must write, such as /tmp.",
                )
        sp = None
        sp_line = None
        if sc and sc["seccomp"]:
            sp, sp_line = sc["seccomp"], sc["seccomp"]["line"]
        elif pod_sc and pod_sc["seccomp"]:
            sp, sp_line = pod_sc["seccomp"], pod_sc["seccomp"]["line"]
        if sp is not None:
            if _unq(sp["val"]).lower() == "unconfined":
                self.add(
                    sp_line, SECCOMP_MISSING,
                    "seccompProfile type is Unconfined, so no syscall filtering applies",
                    "Set `seccompProfile: { type: RuntimeDefault }` under the securityContext.",
                )
        elif sc:
            self.add(
                sc["line"], SECCOMP_MISSING,
                "no seccompProfile is set on the container or the pod",
                "Add `seccompProfile: { type: RuntimeDefault }` under the securityContext (container or pod level).",
            )
        if not sc:
            self.add(
                line, NO_SECURITY_CONTEXT,
                "the container has no securityContext at all, so every default (root, writable filesystem, privilege escalation allowed) applies",
                "Add `securityContext: { allowPrivilegeEscalation: false, runAsNonRoot: true, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] }, seccompProfile: { type: RuntimeDefault } }`.",
            )


def _scan_doc(lines, sc):
    top = _by_key(_entries(lines))
    kind = _unq(top["kind"]["val"]) if "kind" in top else ""
    path = POD_PATHS.get(kind)
    if not path:
        return
    name = "(unnamed)"
    if "metadata" in top:
        mn = _by_key(_entries(top["metadata"]["children"])).get("name")
        if mn and _unq(mn["val"]):
            name = _unq(mn["val"])
    sc.resource = f"{kind}/{name}"
    cur = lines
    entry = None
    for key in path:
        entry = _by_key(_entries(cur)).get(key)
        if entry is None:
            return
        cur = entry["children"]
    sc.pod(cur)


def scan_text(text, filename="<manifest>"):
    sc = _Scanner(filename)
    docs = []
    cur = []
    for i, raw in enumerate(re.split(r"\r?\n", text)):
        if DOC_SEP.match(raw):
            docs.append(cur)
            cur = []
            continue
        line = _strip_comment(raw).rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        cur.append((i + 1, indent, line.strip()))
    docs.append(cur)
    for d in docs:
        if d:
            _scan_doc(d, sc)
    return sorted(sc.findings, key=lambda f: f["line"])


def discover_files(paths):
    """Relative-path/file pairs for every YAML file under paths."""
    out = []
    for root in paths:
        if os.path.isfile(root):
            out.append((os.path.basename(root), root))
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for name in sorted(filenames):
                if not YAML_NAME.search(name):
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
        if "{{" in text:
            print(f"warning: skipped {full}: looks like a Helm template (render it first with `helm template`)", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=rel))
    return findings


def has_risk(findings):
    return any(f["severity"] != "low" for f in findings)


def render_text(findings, paths):
    if not findings:
        n = len(discover_files(paths))
        if n == 0:
            return "No .yaml / .yml files found under " + ", ".join(paths)
        return f"Scanned {n} YAML file(s); no findings. (A heuristic line scan: this is not proof the workloads are safe, and not a compliance claim.)"
    lines = []
    for f in findings:
        lines.append(f"!! {f['file']}:{f['line']}  {f['type']}  [{f['severity']}]  {f['resource']}  container: {f['container']}")
        lines.append(f"     risk: {f['detail']}")
        lines.append(f"     fix:  {f['remediation']}")
        lines.append("")
    lines.append(f"{len(findings)} finding(s). Heuristic line scan, not a YAML parser, a full audit or a compliance claim; review each one yourself.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", default=["."], help="manifest files or directories to scan (default: .)")
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
