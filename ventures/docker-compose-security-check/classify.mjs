// Browser port of check.py (the canonical CLI). The two are kept in lockstep by
// the parity test in classify.test.mjs. Heuristic line scan of a Compose file's
// `services:` block; not a YAML parser and not a security audit.

export const PRIVILEGED = "compose-privileged";
export const DOCKER_SOCKET = "compose-docker-socket";
export const HOST_NETWORK = "compose-host-network";
export const DANGEROUS_CAPABILITY = "compose-dangerous-capability";
export const EXPOSED_DATABASE_PORT = "compose-exposed-database-port";
export const LITERAL_SECRET = "compose-literal-secret";
export const SENSITIVE_HOST_MOUNT = "compose-sensitive-host-mount";
export const SECURITY_OPT_UNCONFINED = "compose-security-opt-unconfined";
export const HOST_NAMESPACE = "compose-host-namespace";
export const RUNS_AS_ROOT = "compose-runs-as-root";
export const IMAGE_LATEST = "compose-image-latest";
export const NO_RESTART = "compose-no-restart";
export const NO_HEALTHCHECK = "compose-no-healthcheck";

export const SEVERITY = {
  [PRIVILEGED]: "high",
  [DOCKER_SOCKET]: "high",
  [HOST_NETWORK]: "high",
  [DANGEROUS_CAPABILITY]: "high",
  [EXPOSED_DATABASE_PORT]: "high",
  [LITERAL_SECRET]: "high",
  [SENSITIVE_HOST_MOUNT]: "high",
  [SECURITY_OPT_UNCONFINED]: "high",
  [HOST_NAMESPACE]: "high",
  [RUNS_AS_ROOT]: "medium",
  [IMAGE_LATEST]: "medium",
  [NO_RESTART]: "low",
  [NO_HEALTHCHECK]: "low",
};
export const RISK_CLASSIFICATIONS = new Set(Object.keys(SEVERITY));

const DB_PORTS = {
  5432: "Postgres",
  3306: "MySQL/MariaDB",
  6379: "Redis",
  27017: "MongoDB",
  9200: "Elasticsearch",
};
const SENSITIVE_PATHS = ["/etc", "/root", "/boot", "/proc", "/sys"];
const SECRET_KEY = /(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)/i;
const KEY_LINE = /^\s*([A-Za-z0-9_.\-"']+)\s*:(?:\s+(.*))?$/;
const LONG_KEY = /^(source|type|target|read_only|bind|volume)\s*:\s*(.*)$/;
const ROOT_USER = /^(?:root|0)(?::(?:root|0))?$/i;

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

function lstripSpaces(s) {
  return s.replace(/^ +/, "");
}

class Scanner {
  constructor(filename) {
    this.filename = filename;
    this.findings = [];
    this.svc = null;
  }

  add(line, type, detail, fix) {
    this.findings.push({
      file: this.filename, line, type, severity: SEVERITY[type], detail, remediation: fix,
    });
  }

  start(name, line) {
    this.svc = { name, line, restart: false, health: false };
  }

  finish() {
    const s = this.svc;
    this.svc = null;
    if (!s) return;
    const n = s.name;
    if (!s.restart) {
      this.add(
        s.line, NO_RESTART,
        `service "${n}" has no restart policy, so it stays down after a crash or host reboot`,
        "Add `restart: unless-stopped` to the service (or `restart: on-failure:5` for a job that should not loop forever).",
      );
    }
    if (!s.health) {
      this.add(
        s.line, NO_HEALTHCHECK,
        `service "${n}" has no healthcheck, so Compose cannot tell a running container from a working one`,
        'Add a healthcheck, for example `healthcheck: { test: ["CMD", "curl", "-f", "http://localhost:8080/health"], interval: 30s, timeout: 5s, retries: 3 }`.',
      );
    }
  }

  key(key, val, lineno) {
    const n = this.svc.name;
    const v = unq(val);
    const low = v.toLowerCase();
    if (key === "privileged" && ["true", "yes", "on"].includes(low)) {
      this.add(
        lineno, PRIVILEGED,
        `service "${n}" runs privileged, which gives the container nearly every host capability and device`,
        'Delete `privileged: true`. If it needs one device or capability, grant only that: `devices: ["/dev/ttyUSB0:/dev/ttyUSB0"]` or `cap_add: [NET_ADMIN]`.',
      );
    } else if (key === "network_mode" && low === "host") {
      this.add(
        lineno, HOST_NETWORK,
        `service "${n}" shares the host network stack, bypassing Docker network isolation`,
        'Delete `network_mode: host` and publish only the ports you need with `ports:`, for example `"127.0.0.1:8080:8080"`.',
      );
    } else if ((key === "pid" || key === "ipc") && low === "host") {
      this.add(
        lineno, HOST_NAMESPACE,
        key === "pid"
          ? `service "${n}" shares the host pid namespace, so it can see or signal host processes`
          : `service "${n}" shares the host ipc namespace, so it can read host shared memory`,
        `Delete \`${key}: host\`. Use the default private namespace, or \`${key}: service:<other>\` to share only with a sibling container.`,
      );
    } else if (key === "user" && ROOT_USER.test(v)) {
      this.add(
        lineno, RUNS_AS_ROOT,
        `service "${n}" is told to run as root`,
        'Run as an unprivileged user, for example `user: "1000:1000"` (or build the image with a non-root `USER`).',
      );
    } else if (key === "image" && v && !v.includes("$") && !v.includes("@sha256:")) {
      const parts = v.split("/");
      const last = parts[parts.length - 1];
      if (!last.includes(":")) {
        this.add(
          lineno, IMAGE_LATEST,
          `service "${n}" uses image ${v} with no tag, which means :latest`,
          `Pin a version: \`image: ${v}:<version>\` (or a digest, \`${v}@sha256:...\`) so a rebuild cannot silently change what runs.`,
        );
      } else if (last.slice(last.indexOf(":") + 1).toLowerCase() === "latest") {
        this.add(
          lineno, IMAGE_LATEST,
          `service "${n}" uses image ${v}, a moving tag`,
          `Pin a version: \`image: ${v.slice(0, v.lastIndexOf(":"))}:<version>\` (or a digest) so a rebuild cannot silently change what runs.`,
        );
      }
    } else if (key === "restart") {
      this.svc.restart = true;
    } else if (key === "healthcheck") {
      this.svc.health = true;
    }
    const items = flowItems(val);
    if (items !== null && ["ports", "cap_add", "security_opt", "volumes", "environment"].includes(key)) {
      for (const it of items) this.item(key, it, lineno);
    }
  }

  port(spec, lineno) {
    const s = spec.split("/")[0];
    let parts;
    if (s.startsWith("[")) {
      const end = s.indexOf("]");
      const ip = s.slice(0, end + 1);
      const rest = s.slice(end + 1).replace(/^:+/, "");
      parts = [ip, ...rest.split(":")];
    } else {
      parts = s.split(":");
    }
    let ip;
    let cport;
    if (parts.length === 3) {
      ip = parts[0];
      cport = parts[2];
    } else if (parts.length === 2) {
      ip = "";
      cport = parts[1];
    } else if (parts.length === 1) {
      ip = "";
      cport = parts[0];
    } else {
      return;
    }
    if (!["", "0.0.0.0", "[::]", "::"].includes(ip) || !Object.hasOwn(DB_PORTS, cport)) return;
    this.add(
      lineno, EXPOSED_DATABASE_PORT,
      `service "${this.svc.name}" publishes ${DB_PORTS[cport]} (container port ${cport}) on every network interface`,
      `Bind it to loopback, \`"127.0.0.1:${cport}:${cport}"\`, or drop \`ports:\` and let other services reach it by service name on the Compose network.`,
    );
  }

  mount(srcRaw, lineno) {
    const n = this.svc.name;
    const src = unq(srcRaw);
    if (src.includes("docker.sock")) {
      this.add(
        lineno, DOCKER_SOCKET,
        `service "${n}" mounts the Docker socket, which is root on the host for anything that can talk to it (read-only does not help)`,
        "Remove the docker.sock mount. If a tool needs the Docker API, put a socket proxy (for example tecnativa/docker-socket-proxy) with only the endpoints it needs in front of it.",
      );
      return;
    }
    let path = src.replace(/\/+$/, "");
    if (!path) path = src.startsWith("/") ? "/" : "";
    if (path === "/" || SENSITIVE_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
      this.add(
        lineno, SENSITIVE_HOST_MOUNT,
        `service "${n}" bind-mounts the host path ${src}, exposing host-wide files to the container`,
        "Mount only the one directory the service needs, for example `./data:/data`, or use a named volume, and add `:ro` when it only reads.",
      );
    }
  }

  secret(k, vRaw, lineno) {
    const v = unq(vRaw);
    if (!v || v.includes("$") || !SECRET_KEY.test(k)) return;
    const up = k.toUpperCase();
    if (up.includes("_FILE") || up.endsWith("_PATH")) return;
    if (["true", "false", "yes", "no", "on", "off", "0", "1"].includes(v.toLowerCase())) return;
    this.add(
      lineno, LITERAL_SECRET,
      `service "${this.svc.name}" sets ${k} to a literal value in the Compose file (the value is not shown here)`,
      `Move it out of the file: \`${k}: \${${k}}\` with the value in an uncommitted \`.env\`, or a Docker secret (\`secrets:\` plus \`${k}_FILE\`). Rotate it if this file was ever committed.`,
    );
  }

  item(block, item, lineno) {
    if (block === "ports") {
      this.port(item, lineno);
    } else if (block === "cap_add") {
      let cap = item.trim().toUpperCase();
      if (cap.startsWith("CAP_")) cap = cap.slice(4);
      if (cap === "ALL" || cap === "SYS_ADMIN") {
        this.add(
          lineno, DANGEROUS_CAPABILITY,
          `service "${this.svc.name}" adds capability ${cap}, which is close to full root on the host`,
          "Drop it. Use `cap_drop: [ALL]` and add back only the narrow capability the service needs (for example `NET_BIND_SERVICE`).",
        );
      }
    } else if (block === "security_opt") {
      if (/^(?:seccomp|apparmor)\s*[:=]\s*unconfined$|^label\s*[:=]\s*disable$/i.test(item.trim())) {
        this.add(
          lineno, SECURITY_OPT_UNCONFINED,
          `service "${this.svc.name}" turns off a container confinement layer (${item.trim()})`,
          "Delete the unconfined entry so Docker's default seccomp and AppArmor profiles apply, or supply a custom profile that allows only the syscall you need.",
        );
      }
    } else if (block === "volumes") {
      const mm = LONG_KEY.exec(item);
      if (mm) {
        if (mm[1] === "source") this.mount(mm[2], lineno);
      } else {
        this.mount(item.split(":")[0], lineno);
      }
    } else if (block === "environment") {
      const eq = item.indexOf("=");
      if (eq !== -1) this.secret(item.slice(0, eq).trim(), item.slice(eq + 1), lineno);
    }
  }

  blockLine(block, body, lineno) {
    if (block === "deploy" && body.startsWith("restart_policy")) this.svc.restart = true;
    if (body.startsWith("- ") || body === "-") {
      this.item(block, unq(body.slice(1).trim()), lineno);
      return;
    }
    const mm = KEY_LINE.exec(body);
    if (!mm || mm[2] === undefined) return;
    const k = unq(mm[1]);
    const v = mm[2];
    if (block === "volumes" && k === "source") this.mount(v, lineno);
    else if (block === "environment") this.secret(k, v, lineno);
  }
}

export function scanText(text, filename = "<compose>") {
  const sc = new Scanner(filename);
  let inServices = false;
  let svcIndent = null;
  let childIndent = null;
  let block = null;
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const lineno = i + 1;
    const line = stripComment(rawLines[i]).replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indent = line.length - lstripSpaces(line).length;
    const body = line.trim();
    if (indent === 0) {
      sc.finish();
      svcIndent = childIndent = block = null;
      const mm = KEY_LINE.exec(line);
      inServices = Boolean(mm && unq(mm[1]) === "services");
      continue;
    }
    if (!inServices) continue;
    if (svcIndent === null) svcIndent = indent;
    if (indent <= svcIndent) {
      sc.finish();
      childIndent = block = null;
      const mm = KEY_LINE.exec(line);
      if (mm) sc.start(unq(mm[1]), lineno);
      continue;
    }
    if (sc.svc === null) continue;
    if (childIndent === null) childIndent = indent;
    if (indent === childIndent && !body.startsWith("-")) {
      const mm = KEY_LINE.exec(line);
      block = null;
      if (!mm) continue;
      const key = unq(mm[1]);
      const val = (mm[2] ?? "").trim();
      sc.key(key, val, lineno);
      if (val === "") block = key;
      continue;
    }
    if (block !== null) sc.blockLine(block, body, lineno);
  }
  sc.finish();
  return sc.findings.sort((a, b) => a.line - b.line);
}

export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<compose>"));
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
