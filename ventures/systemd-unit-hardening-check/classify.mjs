// Browser port of check.py (the canonical CLI). The two are kept in lockstep by
// the parity test in classify.test.mjs. A static read of a systemd unit's
// [Service] section with its NAME.service.d/*.conf drop-ins merged; not
// systemd-analyze and not a security audit.

export const LITERAL_SECRET = "svc-literal-secret";
export const EXEC_FROM_WRITABLE_DIR = "svc-exec-from-writable-dir";
export const PIPE_TO_SHELL = "svc-pipe-to-shell";
export const DANGEROUS_CAPABILITY = "svc-dangerous-capability";
export const READ_WRITE_ROOT = "svc-read-write-root";
export const RUNS_AS_ROOT = "svc-runs-as-root";
export const NO_NEW_PRIVILEGES = "svc-no-new-privileges";
export const PROTECT_SYSTEM_MISSING = "svc-protect-system-missing";
export const PROTECT_HOME_MISSING = "svc-protect-home-missing";
export const FULL_PRIVILEGE_EXEC = "svc-full-privilege-exec";
export const PERMISSIVE_UMASK = "svc-permissive-umask";
export const PROTECT_SYSTEM_PARTIAL = "svc-protect-system-partial";
export const PRIVATE_TMP_MISSING = "svc-private-tmp-missing";
export const PRIVATE_DEVICES_MISSING = "svc-private-devices-missing";
export const KERNEL_PROTECTION_MISSING = "svc-kernel-protection-missing";
export const NO_SYSCALL_FILTER = "svc-no-syscall-filter";
export const NO_ADDRESS_FAMILY_RESTRICTION = "svc-no-address-family-restriction";
export const CONTAINER_LAUNCHER = "svc-container-launcher";

export const SEVERITY = {
  [LITERAL_SECRET]: "high",
  [EXEC_FROM_WRITABLE_DIR]: "high",
  [PIPE_TO_SHELL]: "high",
  [DANGEROUS_CAPABILITY]: "high",
  [READ_WRITE_ROOT]: "high",
  [RUNS_AS_ROOT]: "medium",
  [NO_NEW_PRIVILEGES]: "medium",
  [PROTECT_SYSTEM_MISSING]: "medium",
  [PROTECT_HOME_MISSING]: "medium",
  [FULL_PRIVILEGE_EXEC]: "medium",
  [PERMISSIVE_UMASK]: "medium",
  [PROTECT_SYSTEM_PARTIAL]: "low",
  [PRIVATE_TMP_MISSING]: "low",
  [PRIVATE_DEVICES_MISSING]: "low",
  [KERNEL_PROTECTION_MISSING]: "low",
  [NO_SYSCALL_FILTER]: "low",
  [NO_ADDRESS_FAMILY_RESTRICTION]: "low",
  [CONTAINER_LAUNCHER]: "low",
};
export const RISK_CLASSIFICATIONS = new Set(Object.keys(SEVERITY));
const SEVERITY_RANK = ["high", "medium", "low"];

const EXEC_KEYS = ["ExecStart", "ExecStartPre", "ExecStartPost", "ExecCondition",
  "ExecReload", "ExecStop", "ExecStopPost"];
const DANGEROUS_CAPS = ["CAP_SYS_ADMIN", "CAP_SYS_MODULE", "CAP_SYS_PTRACE", "CAP_SYS_RAWIO",
  "CAP_DAC_OVERRIDE", "CAP_DAC_READ_SEARCH", "CAP_BPF", "CAP_SETUID"];
const KERNEL_KEYS = ["ProtectKernelTunables", "ProtectKernelModules", "ProtectKernelLogs", "ProtectControlGroups"];
const LIST_KEYS = new Set(["Environment", "CapabilityBoundingSet", "AmbientCapabilities", "ReadWritePaths", ...EXEC_KEYS]);

const SECRET_KEY = /(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)/i;
const TRUE = new Set(["1", "yes", "true", "on"]);
const FALSE = new Set(["0", "no", "false", "off"]);
const WRITABLE_DIRS = ["/tmp/", "/var/tmp/", "/dev/shm/"];
const PIPE_SHELL = /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/;
const CONTAINER_RUN = /^(?:\S*\/)?(?:docker|podman|nerdctl)\s+(?:container\s+)?(?:run|start)\b/;
const DROPIN = /(?:^|\/)([^/]+\.service)\.d\/[^/]+\.conf$/;

export function parseUnit(text, file) {
  const entries = [];
  let section = null;
  let serviceLine = null;
  const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const start = i + 1;
    const raw = lines[i];
    i += 1;
    const stripped = raw.trim();
    if (!stripped || "#;".includes(stripped[0])) continue;
    if (stripped.startsWith("[") && stripped.endsWith("]")) {
      section = stripped.slice(1, -1).trim();
      if (section === "Service" && serviceLine === null) serviceLine = start;
      continue;
    }
    let logical = raw.replace(/\s+$/, "");
    while (logical.endsWith("\\") && i < lines.length) {
      const nxt = lines[i];
      i += 1;
      const first = nxt.trim().slice(0, 1);
      if (first === "#" || first === ";") continue;
      logical = logical.slice(0, -1) + " " + nxt.trim();
    }
    if (logical.endsWith("\\")) logical = logical.slice(0, -1);
    const eq = logical.indexOf("=");
    if (eq < 0) continue;
    entries.push({ file, line: start, section, key: logical.slice(0, eq).trim(), value: logical.slice(eq + 1).trim() });
  }
  return { entries, serviceLine };
}

function effective(entries, key) {
  let out = [];
  for (const e of entries) {
    if (e.key !== key) continue;
    if (LIST_KEYS.has(key) && e.value === "") { out = []; continue; }
    out.push(e);
  }
  return out;
}

function last(entries, key) {
  const eff = effective(entries, key);
  if (!eff.length || eff[eff.length - 1].value === "") return null;
  return eff[eff.length - 1];
}

const isTrue = (e) => e !== null && TRUE.has(e.value.toLowerCase());

function envAssignments(value) {
  const words = [];
  let buf = "";
  let quote = null;
  let k = 0;
  while (k < value.length) {
    const ch = value[k];
    if (quote) {
      if (ch === "\\" && k + 1 < value.length) { buf += value[k + 1]; k += 2; continue; }
      if (ch === quote) quote = null; else buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (buf) words.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
    k += 1;
  }
  if (buf) words.push(buf);
  const pairs = [];
  for (const w of words) {
    const eq = w.indexOf("=");
    if (eq >= 0) pairs.push([w.slice(0, eq), w.slice(eq + 1)]);
  }
  return pairs;
}

function execParts(value) {
  let v = value.trim();
  let prefixes = "";
  while (v && "@-:+!|".includes(v[0])) { prefixes += v[0]; v = v.slice(1); }
  v = v.trim();
  const words = v.split(/\s+/).filter(Boolean);
  return [prefixes, words.length ? words[0] : "", v];
}

function finding(at, type, detail, remediation, unit) {
  return { file: at.file, line: at.line, unit, type, severity: SEVERITY[type], detail, remediation };
}

const caps = (value) => value.split(/\s+/).map((c) => c.trim().toUpperCase()).filter(Boolean);

function evaluate(unit, entries, anchor, hasMain, userUnits) {
  const svc = entries.filter((e) => e.section === "Service");
  const out = [];

  for (const e of effective(svc, "Environment")) {
    for (const [name, val] of envAssignments(e.value)) {
      if (!SECRET_KEY.test(name) || name.toUpperCase().endsWith("_FILE")) continue;
      if (val === "" || val.startsWith("%d") || val.includes("/run/credentials") || TRUE.has(val.toLowerCase()) || FALSE.has(val.toLowerCase())) continue;
      const base = unit.lastIndexOf(".") >= 0 ? unit.slice(0, unit.lastIndexOf(".")) : unit;
      out.push(finding(e, LITERAL_SECRET,
        `Environment= sets ${name} to a literal value. systemd exposes a unit's environment to unprivileged local users over D-Bus (\`systemctl show ${unit}\`), unit files are usually world-readable, and systemd.exec(5) calls environment variables not suitable for secrets.`,
        `Move it out of the unit: LoadCredential=${name.toLowerCase()}:/etc/${base}/${name.toLowerCase()} (read it from $CREDENTIALS_DIRECTORY), or EnvironmentFile= a root-only (0600) file.`,
        unit));
    }
  }

  const user = last(svc, "User");
  const dynamic = isTrue(last(svc, "DynamicUser"));
  // A static user of the configured name wins over DynamicUser=yes (systemd.exec(5)),
  // and root always exists, so User=root runs as root either way.
  const asRoot = !userUnits && (user !== null ? user.value === "root" || user.value === "0" : !dynamic);

  for (const key of EXEC_KEYS) {
    for (const e of effective(svc, key)) {
      const [prefixes, binary, rest] = execParts(e.value);
      if (prefixes.includes("+") || prefixes.includes("!")) {
        const which = prefixes.includes("+") ? "+" : "!";
        out.push(finding(e, FULL_PRIVILEGE_EXEC,
          `${key}= starts with '${which}', so this command runs with full privileges, outside User= and the sandbox settings.`,
          "Drop the prefix if the command does not need root; if it does, keep it to a short, fixed helper rather than the main process.",
          unit));
      }
      let wdir = WRITABLE_DIRS.find((d) => binary.startsWith(d)) ?? null;
      if (wdir === null && asRoot && binary.startsWith("/home/")) wdir = "/home/";
      if (wdir) {
        out.push(finding(e, EXEC_FROM_WRITABLE_DIR,
          `${key}= runs ${binary}, under ${wdir}, a directory other users (or the service's own user) can write to; whoever replaces the file runs code as this service.`,
          "Install the binary under a root-owned path such as /usr/local/bin or /opt/<app>, owned by root and not group- or world-writable.",
          unit));
      }
      if (PIPE_SHELL.test(rest)) {
        out.push(finding(e, PIPE_TO_SHELL,
          `${key}= downloads a script and pipes it straight into a shell, so whoever controls that URL or the network path runs code as this service on every start.`,
          "Download once, verify a checksum or signature, install the result, and have the unit run the installed file.",
          unit));
      }
    }
  }

  for (const key of ["AmbientCapabilities", "CapabilityBoundingSet"]) {
    for (const e of effective(svc, key)) {
      if (e.value.startsWith("~")) continue;
      const bad = caps(e.value).filter((c) => DANGEROUS_CAPS.includes(c));
      if (bad.length) {
        const verb = key === "AmbientCapabilities" ? "grants" : "keeps";
        out.push(finding(e, DANGEROUS_CAPABILITY,
          `${key}= ${verb} ${bad.join(", ")}, each close to full root (CAP_SYS_ADMIN alone covers mounts, namespaces and much of the kernel).`,
          `Remove ${bad.join(", ")} and keep only the capabilities the service uses, e.g. CapabilityBoundingSet=CAP_NET_BIND_SERVICE for a port below 1024.`,
          unit));
      }
    }
  }

  for (const e of effective(svc, "ReadWritePaths")) {
    const paths = e.value.split(/\s+/).filter(Boolean).map((p) => p.replace(/^[-+]+/, ""));
    if (paths.includes("/")) {
      out.push(finding(e, READ_WRITE_ROOT,
        "ReadWritePaths= includes /, which makes the whole filesystem writable again and cancels ProtectSystem=.",
        "List only the directories the service writes, e.g. ReadWritePaths=/var/lib/<app>, or use StateDirectory=<app>.",
        unit));
    }
  }

  const umask = last(svc, "UMask");
  if (umask !== null && /^[0-7]{1,4}$/.test(umask.value) && !(parseInt(umask.value, 8) & 0o002)) {
    out.push(finding(umask, PERMISSIVE_UMASK,
      `UMask=${umask.value} lets every user write the files this service creates.`,
      "Use UMask=0027 (or 0077 for private data), the systemd default being 0022.",
      unit));
  }

  if (!hasMain) return out;

  const starts = effective(svc, "ExecStart");
  if (starts.length && CONTAINER_RUN.test(execParts(starts[starts.length - 1].value)[2])) {
    const tool = execParts(starts[starts.length - 1].value)[1].split("/").pop();
    out.push(finding(starts[starts.length - 1], CONTAINER_LAUNCHER,
      `ExecStart= launches a container with ${tool}. The container's isolation comes from the runtime's own options, not mainly from this unit (docker and nerdctl hand it to a daemon that starts it outside the unit entirely), so the missing-sandbox checks are skipped.`,
      "Harden the container itself with the runtime's options: a non-root user, a read-only root filesystem, dropped capabilities, no privileged mode and no docker.sock mount.",
      unit));
    return out;
  }

  if (asRoot) {
    const detail = user === null
      ? "No User= and no DynamicUser=yes, so the service runs as root."
      : `User=${user.value} runs the service as root.`;
    out.push(finding(user ?? anchor, RUNS_AS_ROOT, detail,
      "Set DynamicUser=yes (systemd allocates a throwaway user and implies ProtectSystem=strict), or create a system user and set User=<name>. If it needs a low port, add AmbientCapabilities=CAP_NET_BIND_SERVICE.",
      unit));
  }

  const nnp = last(svc, "NoNewPrivileges");
  if (!isTrue(nnp) && !dynamic) {
    out.push(finding(nnp ?? anchor, NO_NEW_PRIVILEGES,
      "NoNewPrivileges= is not on, so a setuid binary (sudo, su, pkexec) run by this service can gain privileges it was never given.",
      "Add NoNewPrivileges=yes.",
      unit));
  }

  const ps = last(svc, "ProtectSystem");
  const psv = ps ? ps.value.toLowerCase() : "";
  if (!dynamic) {
    if (ps === null || FALSE.has(psv)) {
      out.push(finding(ps ?? anchor, PROTECT_SYSTEM_MISSING,
        "ProtectSystem= is unset or off, so the service can write /usr, /boot and /etc (as root, it can replace system binaries).",
        "Add ProtectSystem=strict and list what it writes with ReadWritePaths= or StateDirectory=/LogsDirectory=.",
        unit));
    } else if (TRUE.has(psv) || psv === "full") {
      out.push(finding(ps, PROTECT_SYSTEM_PARTIAL,
        `ProtectSystem=${ps.value} leaves most of the filesystem (including /var) writable.`,
        "Use ProtectSystem=strict and list writable paths with ReadWritePaths= or StateDirectory=.",
        unit));
    }

    const ph = last(svc, "ProtectHome");
    if (ph === null || FALSE.has(ph.value.toLowerCase())) {
      out.push(finding(ph ?? anchor, PROTECT_HOME_MISSING,
        "ProtectHome= is unset or off, so the service can read every user's home directory (SSH keys, shell history, browser profiles).",
        "Add ProtectHome=yes (or read-only if it must read a home directory).",
        unit));
    }

    if (!isTrue(last(svc, "PrivateTmp"))) {
      out.push(finding(last(svc, "PrivateTmp") ?? anchor, PRIVATE_TMP_MISSING,
        "No PrivateTmp=yes, so the service shares /tmp with every other process, the usual home of symlink and file-planting attacks.",
        "Add PrivateTmp=yes.",
        unit));
    }
  }

  if (!isTrue(last(svc, "PrivateDevices"))) {
    out.push(finding(last(svc, "PrivateDevices") ?? anchor, PRIVATE_DEVICES_MISSING,
      "No PrivateDevices=yes, so the service sees every device node in /dev (disks, memory, input devices).",
      "Add PrivateDevices=yes unless it needs real hardware (a GPU, a serial port); then use DeviceAllow= for just that device.",
      unit));
  }

  const missing = KERNEL_KEYS.filter((k) => !isTrue(last(svc, k)));
  if (missing.length) {
    out.push(finding(anchor, KERNEL_PROTECTION_MISSING,
      `${missing.map((k) => k + "=").join(", ")} not set, so the service can change kernel tunables, load modules, read the kernel log or rewrite cgroups if it has the privilege.`,
      "Add " + missing.map((k) => k + "=yes").join(" ") + ".",
      unit));
  }

  if (last(svc, "SystemCallFilter") === null) {
    out.push(finding(anchor, NO_SYSCALL_FILTER,
      "No SystemCallFilter=, so every system call is available, including ones a normal service never makes (kexec, mount, reboot, raw I/O).",
      "Add SystemCallFilter=@system-service and SystemCallArchitectures=native; add SystemCallErrorNumber=EPERM to see what breaks without killing the service.",
      unit));
  }

  if (last(svc, "RestrictAddressFamilies") === null) {
    out.push(finding(anchor, NO_ADDRESS_FAMILY_RESTRICTION,
      "No RestrictAddressFamilies=, so the service can open any socket type (raw packets, netlink, Bluetooth).",
      "Add RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 (just AF_UNIX for a service with no network).",
      unit));
  }
  return out;
}

const DROP_IN = [
  ["NoNewPrivileges=yes", NO_NEW_PRIVILEGES, "setuid binaries cannot raise privileges"],
  ["ProtectSystem=strict", PROTECT_SYSTEM_MISSING, "the whole filesystem read-only; add ReadWritePaths= for what it writes"],
  ["ProtectHome=yes", PROTECT_HOME_MISSING, "home directories hidden"],
  ["PrivateTmp=yes", PRIVATE_TMP_MISSING, "a private /tmp"],
  ["PrivateDevices=yes", PRIVATE_DEVICES_MISSING, "no hardware devices; remove if it needs a GPU or serial port"],
  ["ProtectKernelTunables=yes", KERNEL_PROTECTION_MISSING, "/proc/sys and /sys read-only"],
  ["ProtectKernelModules=yes", KERNEL_PROTECTION_MISSING, "no module loading"],
  ["ProtectKernelLogs=yes", KERNEL_PROTECTION_MISSING, "no kernel log access"],
  ["ProtectControlGroups=yes", KERNEL_PROTECTION_MISSING, "cgroup tree read-only"],
  ["SystemCallArchitectures=native", NO_SYSCALL_FILTER, "no foreign-ABI system calls"],
  ["SystemCallFilter=@system-service", NO_SYSCALL_FILTER, "the usual service system calls only"],
  ["RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6", NO_ADDRESS_FAMILY_RESTRICTION, "only Unix and IP sockets"],
];

export function dropInFor(unit, findings) {
  const mine = findings.filter((f) => f.unit === unit);
  const types = new Set(mine.map((f) => f.type));
  if (types.has(PROTECT_SYSTEM_PARTIAL)) types.add(PROTECT_SYSTEM_MISSING);
  const lines = [];
  for (const [setting, kind, why] of DROP_IN) {
    if (!types.has(kind)) continue;
    if (kind === KERNEL_PROTECTION_MISSING) {
      const detail = mine.find((f) => f.type === kind).detail;
      if (!detail.includes(setting.split("=")[0] + "=")) continue;
    }
    lines.push(`${setting.padEnd(48)} # ${why}`);
  }
  const root = types.has(RUNS_AS_ROOT);
  if (!lines.length && !root) return "";
  const head = [
    `# Starter hardening for ${unit}. Install with: sudo systemctl edit ${unit}`,
    `# Then: sudo systemctl restart ${unit} && journalctl -u ${unit} -e`,
    "# Loosen any line that breaks the service; each is independent.",
    "[Service]",
  ];
  if (root) head.push(`${"#DynamicUser=yes".padEnd(48)} # run as a throwaway user; check it can still reach its files first`);
  return head.concat(lines).join("\n") + "\n";
}

export function unitKey(path) {
  const norm = String(path).replace(/\\/g, "/");
  const m = DROPIN.exec(norm);
  if (m) {
    const start = m.index + m[0].indexOf(m[1]);
    return [norm.slice(0, start) + m[1], m[1], false];
  }
  return [norm, norm.split("/").pop(), true];
}

const basename = (n) => String(n).replace(/\\/g, "/").split("/").pop();
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function scanFiles(files, userUnits = false) {
  const groups = new Map();
  for (const f of files) {
    const [key, unit, isMain] = unitKey(f.name);
    if (!groups.has(key)) groups.set(key, { unit, main: null, dropins: [] });
    const g = groups.get(key);
    if (isMain) g.main = f; else g.dropins.push(f);
  }
  const findings = [];
  for (const g of groups.values()) {
    const entries = [];
    let anchor = null;
    let hasService = false;
    const parts = (g.main ? [g.main] : []).concat([...g.dropins].sort((a, b) => cmp(basename(a.name), basename(b.name))));
    for (const part of parts) {
      const { entries: ents, serviceLine } = parseUnit(part.text, part.name);
      entries.push(...ents);
      if (serviceLine !== null) {
        hasService = true;
        if (anchor === null && part === g.main) anchor = { file: part.name, line: serviceLine };
      }
    }
    if (!hasService) continue;
    if (anchor === null) anchor = { file: parts[0].name, line: 1 };
    findings.push(...evaluate(g.unit, entries, anchor, g.main !== null, userUnits));
  }
  findings.sort((a, b) => cmp(a.file, b.file) || a.line - b.line
    || SEVERITY_RANK.indexOf(a.severity) - SEVERITY_RANK.indexOf(b.severity) || cmp(a.type, b.type));
  return findings;
}

export function scanText(text, name = "unit.service", userUnits = false) {
  return scanFiles([{ name, text }], userUnits);
}

export function hasRisk(findings) {
  return findings.some((f) => f.severity === "high" || f.severity === "medium");
}

export function summaryLine(findings) {
  if (!findings.length) {
    return "No risky settings or missing sandboxing found in the patterns this tool reads (not proof the service is safe).";
  }
  const parts = ["high", "medium", "low"]
    .map((s) => [s, findings.filter((f) => f.severity === s).length])
    .filter(([, n]) => n)
    .map(([s, n]) => `${n} ${s}`);
  const units = new Set(findings.map((f) => f.unit)).size;
  return `${findings.length} finding${findings.length !== 1 ? "s" : ""} in ${units} unit${units !== 1 ? "s" : ""}: ${parts.join(", ")}.`;
}
