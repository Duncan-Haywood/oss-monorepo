// Browser port of check.py (the canonical CLI). The two are kept in lockstep by
// the parity test in classify.test.mjs. Heuristic line scan of Kubernetes
// workload manifests; not a YAML parser, not a full audit, not a compliance claim.

export const PRIVILEGED = "k8s-privileged";
export const HOST_NAMESPACE = "k8s-host-namespace";
export const HOSTPATH_SENSITIVE = "k8s-hostpath-sensitive";
export const DANGEROUS_CAPABILITY = "k8s-dangerous-capability";
export const LITERAL_SECRET_ENV = "k8s-literal-secret-env";
export const PRIVILEGE_ESCALATION = "k8s-privilege-escalation";
export const RUNS_AS_ROOT = "k8s-runs-as-root";
export const HOSTPATH_VOLUME = "k8s-hostpath-volume";
export const IMAGE_LATEST = "k8s-image-latest";
export const HOST_PORT = "k8s-host-port";
export const NO_SECURITY_CONTEXT = "k8s-no-security-context";
export const CAPABILITIES_NOT_DROPPED = "k8s-capabilities-not-dropped";
export const WRITABLE_ROOT_FS = "k8s-writable-root-fs";
export const AUTOMOUNT_TOKEN = "k8s-automount-token";
export const SECCOMP_MISSING = "k8s-seccomp-missing";

export const SEVERITY = {
  [PRIVILEGED]: "high",
  [HOST_NAMESPACE]: "high",
  [HOSTPATH_SENSITIVE]: "high",
  [DANGEROUS_CAPABILITY]: "high",
  [LITERAL_SECRET_ENV]: "high",
  [PRIVILEGE_ESCALATION]: "medium",
  [RUNS_AS_ROOT]: "medium",
  [HOSTPATH_VOLUME]: "medium",
  [IMAGE_LATEST]: "medium",
  [HOST_PORT]: "medium",
  [NO_SECURITY_CONTEXT]: "medium",
  [CAPABILITIES_NOT_DROPPED]: "low",
  [WRITABLE_ROOT_FS]: "low",
  [AUTOMOUNT_TOKEN]: "low",
  [SECCOMP_MISSING]: "low",
};
export const RISK_CLASSIFICATIONS = new Set(Object.keys(SEVERITY));

const POD_PATHS = {
  Pod: ["spec"],
  Deployment: ["spec", "template", "spec"],
  StatefulSet: ["spec", "template", "spec"],
  DaemonSet: ["spec", "template", "spec"],
  ReplicaSet: ["spec", "template", "spec"],
  ReplicationController: ["spec", "template", "spec"],
  Job: ["spec", "template", "spec"],
  CronJob: ["spec", "jobTemplate", "spec", "template", "spec"],
};
const DANGEROUS_CAPS = ["SYS_ADMIN", "NET_ADMIN", "ALL", "SYS_PTRACE", "SYS_MODULE", "DAC_READ_SEARCH"];
const SENSITIVE_PATHS = ["/etc", "/root", "/proc", "/sys", "/var/lib/kubelet"];
const SECRET_KEY = /(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)/i;
const KEY_LINE = /^(["']?[A-Za-z0-9_.\-/]+["']?)\s*:(?:\s+(.*))?$/;
const DOC_SEP = /^---(?:\s|$)/;
const TRUE_WORDS = ["true", "yes", "on"];
const FALSE_WORDS = ["false", "no", "off"];

function unq(value) {
  const v = value.trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

function flowItems(value) {
  const inner = value.trim();
  if (!(inner.startsWith("[") && inner.endsWith("]"))) return null;
  return inner.slice(1, -1).split(",").filter((p) => p.trim()).map(unq);
}

// lines are [lineno, indent, body] triples.
function entries(lines) {
  if (!lines.length) return [];
  const ki = lines[0][1];
  const out = [];
  let cur = null;
  for (const ln of lines) {
    const [lineno, ind, body] = ln;
    if (ind === ki && !body.startsWith("-")) {
      const m = KEY_LINE.exec(body);
      if (!m) {
        cur = null;
        continue;
      }
      cur = { key: unq(m[1]), val: (m[2] ?? "").trim(), line: lineno, children: [] };
      out.push(cur);
    } else if (cur !== null && (ind > ki || (ind === ki && body.startsWith("-")))) {
      cur.children.push(ln);
    }
  }
  return out;
}

function byKey(list) {
  const d = new Map();
  for (const e of list) d.set(e.key, e);
  return d;
}

function items(lines) {
  if (!lines.length) return [];
  const ii = lines[0][1];
  const out = [];
  let cur = null;
  for (const ln of lines) {
    const [lineno, ind, body] = ln;
    if (ind === ii && (body.startsWith("- ") || body === "-")) {
      const rest = body.slice(1);
      const stripped = rest.replace(/^ +/, "");
      const off = ind + 1 + (rest.length - stripped.length);
      cur = { line: lineno, scalar: null, lines: [] };
      out.push(cur);
      if (stripped) {
        if (KEY_LINE.test(stripped)) cur.lines.push([lineno, off, stripped]);
        else cur.scalar = unq(stripped);
      }
    } else if (cur !== null && ind > ii) {
      cur.lines.push(ln);
    }
  }
  return out;
}

function scalars(entry) {
  if (!entry) return [];
  const flow = flowItems(entry.val);
  if (flow !== null) return flow.map((s) => [s, entry.line]);
  return items(entry.children).filter((it) => it.scalar !== null).map((it) => [it.scalar, it.line]);
}

const truthy = (e) => Boolean(e) && TRUE_WORDS.includes(unq(e.val).toLowerCase());
const falsy = (e) => Boolean(e) && FALSE_WORDS.includes(unq(e.val).toLowerCase());

function securityContext(entry) {
  if (!entry) return null;
  const m = byKey(entries(entry.children));
  const caps = m.get("capabilities");
  const cm = caps ? byKey(entries(caps.children)) : new Map();
  const sp = m.get("seccompProfile");
  const spm = sp ? byKey(entries(sp.children)) : new Map();
  return {
    line: entry.line,
    privileged: m.get("privileged") ?? null,
    allowPe: m.get("allowPrivilegeEscalation") ?? null,
    runAsUser: m.get("runAsUser") ?? null,
    runAsNonRoot: m.get("runAsNonRoot") ?? null,
    readOnly: m.get("readOnlyRootFilesystem") ?? null,
    capsLine: caps ? caps.line : null,
    add: scalars(cm.get("add")),
    drop: scalars(cm.get("drop")),
    seccomp: sp ? (spm.get("type") ?? null) : null,
  };
}

class Scanner {
  constructor(filename) {
    this.filename = filename;
    this.findings = [];
    this.resource = "";
    this.container = "";
  }

  add(line, type, detail, fix) {
    this.findings.push({
      file: this.filename,
      line,
      type,
      severity: SEVERITY[type],
      resource: this.resource,
      container: this.container,
      detail,
      remediation: fix,
    });
  }

  pod(lines) {
    const p = byKey(entries(lines));
    let first = null;
    for (const k of ["containers", "initContainers"]) {
      if (p.has(k) && (first === null || p.get(k).line < first)) first = p.get(k).line;
    }
    if (first === null) return;
    this.container = "(pod)";
    const nsText = { hostNetwork: "network stack", hostPID: "process namespace", hostIPC: "IPC namespace" };
    for (const k of ["hostNetwork", "hostPID", "hostIPC"]) {
      if (truthy(p.get(k))) {
        this.add(
          p.get(k).line, HOST_NAMESPACE,
          `the pod sets ${k}: true, sharing the node's ${nsText[k]}`,
          `Delete \`${k}: true\` (or set it to false) in the pod spec.`,
        );
      }
    }
    const vol = p.get("volumes");
    if (vol) {
      for (const it of items(vol.children)) {
        const ents = byKey(entries(it.lines));
        const hp = ents.get("hostPath");
        if (!hp) continue;
        const pe = byKey(entries(hp.children)).get("path");
        if (!pe) continue;
        this.hostPath(ents.has("name") ? unq(ents.get("name").val) : "?", unq(pe.val), pe.line);
      }
    }
    const am = p.get("automountServiceAccountToken");
    if (!falsy(am)) {
      this.add(
        am ? am.line : first, AUTOMOUNT_TOKEN,
        "the pod does not set automountServiceAccountToken: false, so every container gets an API token mounted",
        "Set `automountServiceAccountToken: false` in the pod spec unless the workload calls the Kubernetes API.",
      );
    }
    const podSc = securityContext(p.get("securityContext"));
    for (const k of ["containers", "initContainers"]) {
      if (p.has(k)) {
        for (const it of items(p.get(k).children)) this.ctr(it, podSc);
      }
    }
  }

  hostPath(vname, path, lineno) {
    const norm = path.replace(/\/+$/, "") || (path.startsWith("/") ? "/" : "");
    const sensitive =
      path.includes("docker.sock") ||
      norm === "/" ||
      SENSITIVE_PATHS.some((s) => norm === s || norm.startsWith(s + "/"));
    if (sensitive) {
      this.add(
        lineno, HOSTPATH_SENSITIVE,
        `volume "${vname}" mounts the node path ${path}, which exposes host-wide files or the container runtime`,
        `Remove the hostPath volume \`${vname}\`. Use an emptyDir, a ConfigMap/Secret or a PersistentVolumeClaim, for example \`volumes: [{ name: ${vname}, emptyDir: {} }]\`.`,
      );
    } else {
      this.add(
        lineno, HOSTPATH_VOLUME,
        `volume "${vname}" mounts the node path ${path}, tying the pod to one node and its filesystem`,
        `Replace the hostPath volume \`${vname}\` with an emptyDir or a PersistentVolumeClaim; if it must stay, mount it \`readOnly: true\` in the container.`,
      );
    }
  }

  ctr(item, podSc) {
    const ents = byKey(entries(item.lines));
    const name = ents.has("name") ? unq(ents.get("name").val) : "(unnamed)";
    this.container = name;
    const line = item.line;
    const img = ents.get("image");
    if (img) {
      const v = unq(img.val);
      if (v && !v.includes("$") && !v.includes("{{") && !v.includes("@sha256:")) {
        const parts = v.split("/");
        const last = parts[parts.length - 1];
        if (!last.includes(":")) {
          this.add(
            img.line, IMAGE_LATEST,
            `image ${v} has no tag, which means :latest`,
            `Pin a version: \`image: ${v}:<version>\` (or a digest, \`${v}@sha256:...\`) so a rebuild cannot silently change what runs.`,
          );
        } else if (last.slice(last.indexOf(":") + 1).toLowerCase() === "latest") {
          this.add(
            img.line, IMAGE_LATEST,
            `image ${v} uses a moving tag`,
            `Pin a version: \`image: ${v.slice(0, v.lastIndexOf(":"))}:<version>\` (or a digest) so a rebuild cannot silently change what runs.`,
          );
        }
      }
    }
    const env = ents.get("env");
    if (env) {
      for (const it of items(env.children)) {
        const e = byKey(entries(it.lines));
        if (!e.has("name") || !e.has("value")) continue;
        const k = unq(e.get("name").val);
        const v = unq(e.get("value").val);
        const up = k.toUpperCase();
        if (
          !v || v.includes("$(") || v.includes("{{") || !SECRET_KEY.test(k) ||
          up.includes("_FILE") || up.endsWith("_PATH") ||
          ["true", "false", "yes", "no", "on", "off", "0", "1"].includes(v.toLowerCase())
        ) continue;
        this.add(
          e.get("value").line, LITERAL_SECRET_ENV,
          `env ${k} is set to a literal value in the manifest (the value is not shown here)`,
          `Move it into a Secret and reference it: \`- name: ${k}\` with \`valueFrom: { secretKeyRef: { name: app-secrets, key: ${k} } }\`. Rotate it if this file was ever committed.`,
        );
      }
    }
    const ports = ents.get("ports");
    if (ports) {
      for (const it of items(ports.children)) {
        const e = byKey(entries(it.lines));
        const hp = e.get("hostPort");
        if (hp && !["", "0"].includes(unq(hp.val))) {
          this.add(
            hp.line, HOST_PORT,
            `hostPort ${unq(hp.val)} binds a port on the node itself, bypassing Services and limiting scheduling`,
            "Delete `hostPort` and expose the pod through a Service (ClusterIP, or NodePort / LoadBalancer when it must be reachable).",
          );
        }
      }
    }
    const sc = securityContext(ents.get("securityContext"));
    if (truthy(sc ? sc.privileged : null)) {
      this.add(
        sc.privileged.line, PRIVILEGED,
        "the container runs privileged, which gives it nearly every host capability and device",
        "Set `privileged: false` (or delete the line) under the container's securityContext. If it needs one capability, add only that: `capabilities: { add: [NET_ADMIN] }`.",
      );
    }
    if (sc) {
      for (const [cap, cl] of sc.add) {
        let c = cap.trim().toUpperCase();
        if (c.startsWith("CAP_")) c = c.slice(4);
        if (DANGEROUS_CAPS.includes(c)) {
          this.add(
            cl, DANGEROUS_CAPABILITY,
            `the container adds capability ${c}, which is close to full root on the node`,
            `Remove ${c} from \`capabilities.add\` and use \`capabilities: { drop: [ALL] }\`, adding back only the narrow capability needed (for example \`NET_BIND_SERVICE\`).`,
          );
        }
      }
      if (truthy(sc.allowPe)) {
        this.add(
          sc.allowPe.line, PRIVILEGE_ESCALATION,
          "allowPrivilegeEscalation is true, so a process can gain more privileges than its parent",
          "Set `allowPrivilegeEscalation: false` under the container's securityContext.",
        );
      } else if (sc.allowPe === null) {
        this.add(
          sc.line, PRIVILEGE_ESCALATION,
          "allowPrivilegeEscalation is not set, and Kubernetes defaults it to true",
          "Add `allowPrivilegeEscalation: false` under the container's securityContext.",
        );
      }
    }
    const effUser = (sc && sc.runAsUser) || (podSc ? podSc.runAsUser : null) || null;
    const effNr = (sc && sc.runAsNonRoot) || (podSc ? podSc.runAsNonRoot : null) || null;
    const userNonzero = effUser !== null && /^\d+$/.test(unq(effUser.val)) && Number(unq(effUser.val)) !== 0;
    const rootFix = "Set `runAsNonRoot: true` and `runAsUser: 10001` under securityContext (the image must support a non-root user).";
    if (effUser !== null && unq(effUser.val) === "0") {
      this.add(effUser.line, RUNS_AS_ROOT, "the container is told to run as user 0 (root)", rootFix);
    } else if (falsy(effNr)) {
      this.add(effNr.line, RUNS_AS_ROOT, "runAsNonRoot is false, so the container may run as root", rootFix);
    } else if (sc && !truthy(effNr) && !userNonzero) {
      this.add(sc.line, RUNS_AS_ROOT, "neither runAsNonRoot: true nor a non-zero runAsUser is set, so the container may run as root", rootFix);
    }
    if (sc) {
      if (!sc.drop.map(([c]) => c.trim().toUpperCase()).includes("ALL")) {
        this.add(
          sc.capsLine ?? sc.line, CAPABILITIES_NOT_DROPPED,
          "capabilities.drop does not include ALL, so the container keeps the runtime's default capabilities",
          "Add `capabilities: { drop: [ALL] }` under the container's securityContext.",
        );
      }
      if (!truthy(sc.readOnly)) {
        this.add(
          sc.readOnly ? sc.readOnly.line : sc.line, WRITABLE_ROOT_FS,
          "readOnlyRootFilesystem is not true, so an attacker in the container can write to its filesystem",
          "Set `readOnlyRootFilesystem: true` and mount an `emptyDir` at any path the app must write, such as /tmp.",
        );
      }
    }
    let sp = null;
    if (sc && sc.seccomp) sp = sc.seccomp;
    else if (podSc && podSc.seccomp) sp = podSc.seccomp;
    if (sp !== null) {
      if (unq(sp.val).toLowerCase() === "unconfined") {
        this.add(
          sp.line, SECCOMP_MISSING,
          "seccompProfile type is Unconfined, so no syscall filtering applies",
          "Set `seccompProfile: { type: RuntimeDefault }` under the securityContext.",
        );
      }
    } else if (sc) {
      this.add(
        sc.line, SECCOMP_MISSING,
        "no seccompProfile is set on the container or the pod",
        "Add `seccompProfile: { type: RuntimeDefault }` under the securityContext (container or pod level).",
      );
    }
    if (!sc) {
      this.add(
        line, NO_SECURITY_CONTEXT,
        "the container has no securityContext at all, so every default (root, writable filesystem, privilege escalation allowed) applies",
        "Add `securityContext: { allowPrivilegeEscalation: false, runAsNonRoot: true, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] }, seccompProfile: { type: RuntimeDefault } }`.",
      );
    }
  }
}

function scanDoc(lines, sc) {
  const top = byKey(entries(lines));
  const kind = top.has("kind") ? unq(top.get("kind").val) : "";
  const path = Object.hasOwn(POD_PATHS, kind) ? POD_PATHS[kind] : null;
  if (!path) return;
  let name = "(unnamed)";
  if (top.has("metadata")) {
    const mn = byKey(entries(top.get("metadata").children)).get("name");
    if (mn && unq(mn.val)) name = unq(mn.val);
  }
  sc.resource = `${kind}/${name}`;
  let cur = lines;
  for (const key of path) {
    const entry = byKey(entries(cur)).get(key);
    if (!entry) return;
    cur = entry.children;
  }
  sc.pod(cur);
}

export function scanText(text, filename = "<manifest>") {
  const sc = new Scanner(filename);
  const docs = [];
  let cur = [];
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (DOC_SEP.test(raw)) {
      docs.push(cur);
      cur = [];
      continue;
    }
    const line = stripComment(raw).replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indent = line.length - line.replace(/^ +/, "").length;
    cur.push([i + 1, indent, line.trim()]);
  }
  docs.push(cur);
  for (const d of docs) if (d.length) scanDoc(d, sc);
  return sc.findings.sort((a, b) => a.line - b.line);
}

export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<manifest>"));
  }
  return findings;
}

export function hasRisk(findings) {
  return findings.some((f) => f.severity !== "low");
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No findings.";
  const kinds = new Set(findings.map((f) => f.type)).size;
  return `${findings.length} finding${findings.length === 1 ? "" : "s"} across ${kinds} pattern${kinds === 1 ? "" : "s"}.`;
}
