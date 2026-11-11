#!/usr/bin/env python3
"""Find risky settings and missing sandboxing in your own systemd .service files.

    python3 check.py                          # scan units under .
    python3 check.py /etc/systemd/system/     # scan a directory (drop-ins merged)
    python3 check.py app.service --drop-in    # also print a starter hardening drop-in
    python3 check.py --format json            # machine-readable
    python3 check.py --fail-on-risk           # exit 2 on any medium or high finding

## What it catches

A static read of a unit's [Service] section, with each `NAME.service.d/*.conf`
drop-in beside it merged in the order systemd applies them (the unit first,
then drop-ins by file name; an empty assignment such as `Environment=` resets a
list setting):

  high    svc-literal-secret          PASSWORD/TOKEN/SECRET/API_KEY written into
                                      Environment= (systemd shows a unit's
                                      environment to unprivileged users over D-Bus)
  high    svc-exec-from-writable-dir  an Exec*= binary under /tmp, /var/tmp or
                                      /dev/shm, or under /home in a root service
  high    svc-pipe-to-shell           curl/wget piped into a shell in an Exec*= line
  high    svc-dangerous-capability    CAP_SYS_ADMIN, CAP_SYS_MODULE, CAP_SYS_PTRACE,
                                      CAP_SYS_RAWIO, CAP_DAC_OVERRIDE, CAP_DAC_READ_SEARCH,
                                      CAP_BPF or CAP_SETUID granted in AmbientCapabilities=
                                      or kept in CapabilityBoundingSet=
  high    svc-read-write-root         ReadWritePaths=/ (undoes ProtectSystem=)
  medium  svc-runs-as-root            no User= and no DynamicUser=yes, or User=root
  medium  svc-no-new-privileges       NoNewPrivileges= not on (DynamicUser=yes implies it)
  medium  svc-protect-system-missing  no ProtectSystem= (or =no)
  medium  svc-protect-home-missing    no ProtectHome= (or =no)
  medium  svc-full-privilege-exec     an Exec*= line with the + or ! prefix, which
                                      runs it outside the sandbox
  medium  svc-permissive-umask        UMask= that lets other users write new files
  low     svc-protect-system-partial  ProtectSystem=yes or full rather than strict
  low     svc-private-tmp-missing     no PrivateTmp=yes
  low     svc-private-devices-missing no PrivateDevices=yes
  low     svc-kernel-protection-missing  ProtectKernelTunables=, ProtectKernelModules=,
                                      ProtectKernelLogs= or ProtectControlGroups= unset
  low     svc-no-syscall-filter       no SystemCallFilter=
  low     svc-no-address-family-restriction  no RestrictAddressFamilies=
  low     svc-container-launcher      ExecStart= is `docker run` (podman, nerdctl): the
                                      unit's sandbox does not reach the container, so
                                      the missing-sandbox checks are skipped

Settings systemd implies are honoured: DynamicUser=yes enables NoNewPrivileges=
and implies ProtectSystem=strict, ProtectHome=read-only and a private /tmp
(systemd.exec(5)), so none of those is reported missing beside it. `--drop-in` prints a starter
override for each unit with the missing settings, to install with
`systemctl edit NAME` and loosen where the service breaks.

## What it is, and is not

A read-only line parser of files already on disk. It makes NO network calls
and runs nothing; it never calls systemctl. It does not read the unit's
EnvironmentFile=, vendor drop-ins in other directories, or the binary itself,
and it does not know which settings a service truly needs. It is NOT a
security audit and NOT `systemd-analyze security` (which scores a loaded unit
on a running system with its own weights). A clean scan is never proof a
service is safe. No warranty; review each finding yourself. Secret values are
never printed. User units (`systemctl --user`) run as their user already: pass
--user-units to skip the root check.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one medium or high finding exists.
"""

import argparse
import json
import os
import re
import sys

LITERAL_SECRET = "svc-literal-secret"
EXEC_FROM_WRITABLE_DIR = "svc-exec-from-writable-dir"
PIPE_TO_SHELL = "svc-pipe-to-shell"
DANGEROUS_CAPABILITY = "svc-dangerous-capability"
READ_WRITE_ROOT = "svc-read-write-root"
RUNS_AS_ROOT = "svc-runs-as-root"
NO_NEW_PRIVILEGES = "svc-no-new-privileges"
PROTECT_SYSTEM_MISSING = "svc-protect-system-missing"
PROTECT_HOME_MISSING = "svc-protect-home-missing"
FULL_PRIVILEGE_EXEC = "svc-full-privilege-exec"
PERMISSIVE_UMASK = "svc-permissive-umask"
PROTECT_SYSTEM_PARTIAL = "svc-protect-system-partial"
PRIVATE_TMP_MISSING = "svc-private-tmp-missing"
PRIVATE_DEVICES_MISSING = "svc-private-devices-missing"
KERNEL_PROTECTION_MISSING = "svc-kernel-protection-missing"
NO_SYSCALL_FILTER = "svc-no-syscall-filter"
NO_ADDRESS_FAMILY_RESTRICTION = "svc-no-address-family-restriction"
CONTAINER_LAUNCHER = "svc-container-launcher"

SEVERITY = {
    LITERAL_SECRET: "high",
    EXEC_FROM_WRITABLE_DIR: "high",
    PIPE_TO_SHELL: "high",
    DANGEROUS_CAPABILITY: "high",
    READ_WRITE_ROOT: "high",
    RUNS_AS_ROOT: "medium",
    NO_NEW_PRIVILEGES: "medium",
    PROTECT_SYSTEM_MISSING: "medium",
    PROTECT_HOME_MISSING: "medium",
    FULL_PRIVILEGE_EXEC: "medium",
    PERMISSIVE_UMASK: "medium",
    PROTECT_SYSTEM_PARTIAL: "low",
    PRIVATE_TMP_MISSING: "low",
    PRIVATE_DEVICES_MISSING: "low",
    KERNEL_PROTECTION_MISSING: "low",
    NO_SYSCALL_FILTER: "low",
    NO_ADDRESS_FAMILY_RESTRICTION: "low",
    CONTAINER_LAUNCHER: "low",
}
RISK_CLASSIFICATIONS = frozenset(SEVERITY)
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

EXEC_KEYS = ("ExecStart", "ExecStartPre", "ExecStartPost", "ExecCondition",
             "ExecReload", "ExecStop", "ExecStopPost")
DANGEROUS_CAPS = ("CAP_SYS_ADMIN", "CAP_SYS_MODULE", "CAP_SYS_PTRACE", "CAP_SYS_RAWIO",
                  "CAP_DAC_OVERRIDE", "CAP_DAC_READ_SEARCH", "CAP_BPF", "CAP_SETUID")
# systemd.exec(5): DynamicUser= implicitly enables NoNewPrivileges= and
# RestrictSUIDSGID=, implies ProtectSystem=strict and ProtectHome=read-only, and
# gives the unit a private /tmp unless PrivateTmp= is set. The current manual
# names no other setting that turns NoNewPrivileges= on, so only DynamicUser=
# counts here (checked 2026-11-11).
KERNEL_KEYS = ("ProtectKernelTunables", "ProtectKernelModules", "ProtectKernelLogs", "ProtectControlGroups")
LIST_KEYS = frozenset(("Environment", "CapabilityBoundingSet", "AmbientCapabilities",
                       "ReadWritePaths") + EXEC_KEYS)

SECRET_KEY = re.compile(r"(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)", re.I)
TRUE = frozenset(("1", "yes", "true", "on"))
FALSE = frozenset(("0", "no", "false", "off"))
WRITABLE_DIRS = ("/tmp/", "/var/tmp/", "/dev/shm/")
PIPE_SHELL = re.compile(r"\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b")
CONTAINER_RUN = re.compile(r"^(?:\S*/)?(?:docker|podman|nerdctl)\s+(?:container\s+)?(?:run|start)\b")
DROPIN = re.compile(r"(?:^|/)([^/]+\.service)\.d/[^/]+\.conf$")

SKIP_DIRS = frozenset((".git", "node_modules", "vendor", "dist", "build", ".venv", "venv",
                       "__pycache__", ".tox", "site-packages"))


def parse_unit(text, file):
    """Return (entries, service_line) for one unit file.

    entries: list of dicts {file, line, section, key, value} in file order.
    service_line: line number of the first [Service] header, or None.
    Continuation lines (trailing backslash) are joined with a space, as systemd does.
    """
    entries = []
    section = None
    service_line = None
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    i = 0
    while i < len(lines):
        start = i + 1
        raw = lines[i]
        i += 1
        stripped = raw.strip()
        if not stripped or stripped[0] in "#;":
            continue
        if stripped.startswith("[") and stripped.endswith("]"):
            section = stripped[1:-1].strip()
            if section == "Service" and service_line is None:
                service_line = start
            continue
        logical = raw.rstrip()
        while logical.endswith("\\") and i < len(lines):
            nxt = lines[i]
            i += 1
            if nxt.strip()[:1] in ("#", ";"):
                continue
            logical = logical[:-1] + " " + nxt.strip()
        if logical.endswith("\\"):
            logical = logical[:-1]
        if "=" not in logical:
            continue
        key, value = logical.split("=", 1)
        entries.append({"file": file, "line": start, "section": section,
                        "key": key.strip(), "value": value.strip()})
    return entries, service_line


def _effective(entries, key):
    """Entries for `key` that survive the last empty-assignment reset."""
    out = []
    for e in entries:
        if e["key"] != key:
            continue
        if key in LIST_KEYS and e["value"] == "":
            out = []
            continue
        out.append(e)
    return out


def _last(entries, key):
    eff = _effective(entries, key)
    if not eff or eff[-1]["value"] == "":
        return None
    return eff[-1]


def _is_true(entry):
    return entry is not None and entry["value"].lower() in TRUE


def _env_assignments(value):
    """Split an Environment= value into (name, value) pairs, honouring quotes."""
    out = []
    buf = ""
    quote = None
    k = 0
    while k < len(value):
        ch = value[k]
        if quote:
            if ch == "\\" and k + 1 < len(value):
                buf += value[k + 1]
                k += 2
                continue
            if ch == quote:
                quote = None
            else:
                buf += ch
        elif ch in "\"'":
            quote = ch
        elif ch in " \t":
            if buf:
                out.append(buf)
            buf = ""
        else:
            buf += ch
        k += 1
    if buf:
        out.append(buf)
    pairs = []
    for word in out:
        if "=" in word:
            name, val = word.split("=", 1)
            pairs.append((name, val))
    return pairs


def _exec_parts(value):
    """Return (prefixes, binary, rest) of an Exec*= value."""
    v = value.strip()
    prefixes = ""
    while v and v[0] in "@-:+!|":
        prefixes += v[0]
        v = v[1:]
    v = v.strip()
    binary = v.split()[0] if v.split() else ""
    return prefixes, binary, v


def _finding(entry_or_anchor, kind, detail, remediation, unit):
    return {
        "file": entry_or_anchor["file"],
        "line": entry_or_anchor["line"],
        "unit": unit,
        "type": kind,
        "severity": SEVERITY[kind],
        "detail": detail,
        "remediation": remediation,
    }


def _caps(value):
    return [c.strip().upper() for c in value.split() if c.strip()]


def evaluate(unit, entries, anchor, has_main, user_units=False):
    """All findings for one merged unit. anchor = {file, line} for "missing" findings."""
    svc = [e for e in entries if e["section"] == "Service"]
    out = []

    # --- present settings, reported where they are written ---
    for e in _effective(svc, "Environment"):
        for name, val in _env_assignments(e["value"]):
            if not SECRET_KEY.search(name) or name.upper().endswith("_FILE"):
                continue
            if val == "" or val.startswith("%d") or "/run/credentials" in val or val.lower() in TRUE | FALSE:
                continue
            out.append(_finding(e, LITERAL_SECRET,
                                f"Environment= sets {name} to a literal value. systemd exposes a unit's environment to unprivileged local users over D-Bus (`systemctl show {unit}`), unit files are usually world-readable, and systemd.exec(5) calls environment variables not suitable for secrets.",
                                f"Move it out of the unit: LoadCredential={name.lower()}:/etc/{unit.rsplit('.', 1)[0]}/{name.lower()} (read it from $CREDENTIALS_DIRECTORY), or EnvironmentFile= a root-only (0600) file.",
                                unit))

    user = _last(svc, "User")
    dynamic = _is_true(_last(svc, "DynamicUser"))
    as_root = not user_units and not dynamic and (user is None or user["value"] in ("root", "0"))

    for key in EXEC_KEYS:
        for e in _effective(svc, key):
            prefixes, binary, rest = _exec_parts(e["value"])
            if "+" in prefixes or "!" in prefixes:
                which = "+" if "+" in prefixes else "!"
                out.append(_finding(e, FULL_PRIVILEGE_EXEC,
                                    f"{key}= starts with '{which}', so this command runs with full privileges, outside User= and the sandbox settings.",
                                    "Drop the prefix if the command does not need root; if it does, keep it to a short, fixed helper rather than the main process.",
                                    unit))
            wdir = next((d for d in WRITABLE_DIRS if binary.startswith(d)), None)
            if wdir is None and as_root and binary.startswith("/home/"):
                wdir = "/home/"
            if wdir:
                out.append(_finding(e, EXEC_FROM_WRITABLE_DIR,
                                    f"{key}= runs {binary}, under {wdir}, a directory other users (or the service's own user) can write to; whoever replaces the file runs code as this service.",
                                    "Install the binary under a root-owned path such as /usr/local/bin or /opt/<app>, owned by root and not group- or world-writable.",
                                    unit))
            if PIPE_SHELL.search(rest):
                out.append(_finding(e, PIPE_TO_SHELL,
                                    f"{key}= downloads a script and pipes it straight into a shell, so whoever controls that URL or the network path runs code as this service on every start.",
                                    "Download once, verify a checksum or signature, install the result, and have the unit run the installed file.",
                                    unit))

    for key in ("AmbientCapabilities", "CapabilityBoundingSet"):
        for e in _effective(svc, key):
            if e["value"].startswith("~"):
                continue
            bad = [c for c in _caps(e["value"]) if c in DANGEROUS_CAPS]
            if bad:
                verb = "grants" if key == "AmbientCapabilities" else "keeps"
                out.append(_finding(e, DANGEROUS_CAPABILITY,
                                    f"{key}= {verb} {', '.join(bad)}, each close to full root (CAP_SYS_ADMIN alone covers mounts, namespaces and much of the kernel).",
                                    f"Remove {', '.join(bad)} and keep only the capabilities the service uses, e.g. CapabilityBoundingSet=CAP_NET_BIND_SERVICE for a port below 1024.",
                                    unit))

    for e in _effective(svc, "ReadWritePaths"):
        paths = [p.lstrip("-+") for p in e["value"].split()]
        if "/" in paths:
            out.append(_finding(e, READ_WRITE_ROOT,
                                "ReadWritePaths= includes /, which makes the whole filesystem writable again and cancels ProtectSystem=.",
                                "List only the directories the service writes, e.g. ReadWritePaths=/var/lib/<app>, or use StateDirectory=<app>.",
                                unit))

    umask = _last(svc, "UMask")
    if umask is not None and re.fullmatch(r"[0-7]{1,4}", umask["value"]):
        if not int(umask["value"], 8) & 0o002:
            out.append(_finding(umask, PERMISSIVE_UMASK,
                                f"UMask={umask['value']} lets every user write the files this service creates.",
                                "Use UMask=0027 (or 0077 for private data), the systemd default being 0022.",
                                unit))

    if not has_main:
        return out

    # A unit whose main process is `docker run` (or podman/nerdctl) only
    # confines the client: dockerd starts the container outside this unit, so
    # its sandbox settings never reach the workload. Say so once instead of
    # listing sandbox settings that would not help.
    starts = _effective(svc, "ExecStart")
    if starts and CONTAINER_RUN.search(_exec_parts(starts[-1]["value"])[2]):
        tool = _exec_parts(starts[-1]["value"])[1].rsplit("/", 1)[-1]
        out.append(_finding(starts[-1], CONTAINER_LAUNCHER,
                            f"ExecStart= launches a container with {tool}. The container's isolation comes from the runtime's own options, not mainly from this unit (docker and nerdctl hand it to a daemon that starts it outside the unit entirely), so the missing-sandbox checks are skipped.",
                            "Harden the container itself with the runtime's options: a non-root user, a read-only root filesystem, dropped capabilities, no privileged mode and no docker.sock mount.",
                            unit))
        return out

    # --- settings that are missing, reported at the [Service] header ---
    if as_root:
        detail = ("No User= and no DynamicUser=yes, so the service runs as root." if user is None
                  else f"User={user['value']} runs the service as root.")
        out.append(_finding(user or anchor, RUNS_AS_ROOT, detail,
                            "Set DynamicUser=yes (systemd allocates a throwaway user and implies ProtectSystem=strict), or create a system user and set User=<name>. If it needs a low port, add AmbientCapabilities=CAP_NET_BIND_SERVICE.",
                            unit))

    nnp = _last(svc, "NoNewPrivileges")
    if not _is_true(nnp) and not dynamic:
        out.append(_finding(nnp or anchor, NO_NEW_PRIVILEGES,
                            "NoNewPrivileges= is not on, so a setuid binary (sudo, su, pkexec) run by this service can gain privileges it was never given.",
                            "Add NoNewPrivileges=yes.",
                            unit))

    ps = _last(svc, "ProtectSystem")
    psv = ps["value"].lower() if ps else ""
    if not dynamic:
        if ps is None or psv in FALSE:
            out.append(_finding(ps or anchor, PROTECT_SYSTEM_MISSING,
                                "ProtectSystem= is unset or off, so the service can write /usr, /boot and /etc (as root, it can replace system binaries).",
                                "Add ProtectSystem=strict and list what it writes with ReadWritePaths= or StateDirectory=/LogsDirectory=.",
                                unit))
        elif psv in TRUE or psv == "full":
            out.append(_finding(ps, PROTECT_SYSTEM_PARTIAL,
                                f"ProtectSystem={ps['value']} leaves most of the filesystem (including /var) writable.",
                                "Use ProtectSystem=strict and list writable paths with ReadWritePaths= or StateDirectory=.",
                                unit))

        ph = _last(svc, "ProtectHome")
        if ph is None or ph["value"].lower() in FALSE:
            out.append(_finding(ph or anchor, PROTECT_HOME_MISSING,
                                "ProtectHome= is unset or off, so the service can read every user's home directory (SSH keys, shell history, browser profiles).",
                                "Add ProtectHome=yes (or read-only if it must read a home directory).",
                                unit))

        if not _is_true(_last(svc, "PrivateTmp")):
            out.append(_finding(_last(svc, "PrivateTmp") or anchor, PRIVATE_TMP_MISSING,
                                "No PrivateTmp=yes, so the service shares /tmp with every other process, the usual home of symlink and file-planting attacks.",
                                "Add PrivateTmp=yes.",
                                unit))

    if not _is_true(_last(svc, "PrivateDevices")):
        out.append(_finding(_last(svc, "PrivateDevices") or anchor, PRIVATE_DEVICES_MISSING,
                            "No PrivateDevices=yes, so the service sees every device node in /dev (disks, memory, input devices).",
                            "Add PrivateDevices=yes unless it needs real hardware (a GPU, a serial port); then use DeviceAllow= for just that device.",
                            unit))

    missing = [k for k in KERNEL_KEYS if not _is_true(_last(svc, k))]
    if missing:
        out.append(_finding(anchor, KERNEL_PROTECTION_MISSING,
                            f"{', '.join(k + '=' for k in missing)} not set, so the service can change kernel tunables, load modules, read the kernel log or rewrite cgroups if it has the privilege.",
                            "Add " + " ".join(k + "=yes" for k in missing) + ".",
                            unit))

    if _last(svc, "SystemCallFilter") is None:
        out.append(_finding(anchor, NO_SYSCALL_FILTER,
                            "No SystemCallFilter=, so every system call is available, including ones a normal service never makes (kexec, mount, reboot, raw I/O).",
                            "Add SystemCallFilter=@system-service and SystemCallArchitectures=native; add SystemCallErrorNumber=EPERM to see what breaks without killing the service.",
                            unit))

    if _last(svc, "RestrictAddressFamilies") is None:
        out.append(_finding(anchor, NO_ADDRESS_FAMILY_RESTRICTION,
                            "No RestrictAddressFamilies=, so the service can open any socket type (raw packets, netlink, Bluetooth).",
                            "Add RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 (just AF_UNIX for a service with no network).",
                            unit))
    return out


# Starter drop-in lines: (setting, the finding it answers, why).
DROP_IN = (
    ("NoNewPrivileges=yes", NO_NEW_PRIVILEGES, "setuid binaries cannot raise privileges"),
    ("ProtectSystem=strict", PROTECT_SYSTEM_MISSING, "the whole filesystem read-only; add ReadWritePaths= for what it writes"),
    ("ProtectHome=yes", PROTECT_HOME_MISSING, "home directories hidden"),
    ("PrivateTmp=yes", PRIVATE_TMP_MISSING, "a private /tmp"),
    ("PrivateDevices=yes", PRIVATE_DEVICES_MISSING, "no hardware devices; remove if it needs a GPU or serial port"),
    ("ProtectKernelTunables=yes", KERNEL_PROTECTION_MISSING, "/proc/sys and /sys read-only"),
    ("ProtectKernelModules=yes", KERNEL_PROTECTION_MISSING, "no module loading"),
    ("ProtectKernelLogs=yes", KERNEL_PROTECTION_MISSING, "no kernel log access"),
    ("ProtectControlGroups=yes", KERNEL_PROTECTION_MISSING, "cgroup tree read-only"),
    ("SystemCallArchitectures=native", NO_SYSCALL_FILTER, "no foreign-ABI system calls"),
    ("SystemCallFilter=@system-service", NO_SYSCALL_FILTER, "the usual service system calls only"),
    ("RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6", NO_ADDRESS_FAMILY_RESTRICTION, "only Unix and IP sockets"),
)


def drop_in_for(unit, findings):
    """A starter override for one unit: the settings its findings say are missing."""
    types = {f["type"] for f in findings if f["unit"] == unit}
    lines = []
    if PROTECT_SYSTEM_PARTIAL in types:
        types.add(PROTECT_SYSTEM_MISSING)
    for setting, kind, why in DROP_IN:
        if kind != KERNEL_PROTECTION_MISSING and kind in types:
            lines.append(f"{setting:<48} # {why}")
        elif kind == KERNEL_PROTECTION_MISSING and kind in types:
            missing = next(f["detail"] for f in findings if f["unit"] == unit and f["type"] == kind)
            if setting.split("=")[0] + "=" in missing:
                lines.append(f"{setting:<48} # {why}")
    root = RUNS_AS_ROOT in types
    if not lines and not root:
        return ""
    head = [
        f"# Starter hardening for {unit}. Install with: sudo systemctl edit {unit}",
        "# Then: sudo systemctl restart " + unit + " && journalctl -u " + unit + " -e",
        "# Loosen any line that breaks the service; each is independent.",
        "[Service]",
    ]
    if root:
        head.append(f"{'#DynamicUser=yes':<48} # run as a throwaway user; check it can still reach its files first")
    return "\n".join(head + lines) + "\n"


def unit_key(path):
    """(group key, unit name, is_main) for a .service or a NAME.service.d/*.conf path."""
    norm = path.replace("\\", "/")
    m = DROPIN.search(norm)
    if m:
        base = norm[: m.start(1)] if m.start(1) > 0 else ""
        return (base + m.group(1), m.group(1), False)
    name = norm.rsplit("/", 1)[-1]
    return (norm, name, True)


def scan_files(files, user_units=False):
    """files: list of {name, text}. Groups drop-ins with their unit and returns findings."""
    groups = {}
    order = []
    for f in files:
        key, unit, is_main = unit_key(f["name"])
        if key not in groups:
            groups[key] = {"unit": unit, "main": None, "dropins": []}
            order.append(key)
        if is_main:
            groups[key]["main"] = f
        else:
            groups[key]["dropins"].append(f)
    findings = []
    for key in order:
        g = groups[key]
        entries = []
        anchor = None
        has_service = False
        parts = ([g["main"]] if g["main"] else []) + sorted(g["dropins"], key=lambda d: d["name"].replace("\\", "/").rsplit("/", 1)[-1])
        for part in parts:
            ents, sline = parse_unit(part["text"], part["name"])
            entries.extend(ents)
            if sline is not None:
                has_service = True
                if anchor is None and part is g["main"]:
                    anchor = {"file": part["name"], "line": sline}
        if not has_service:
            continue
        if anchor is None:
            anchor = {"file": parts[0]["name"], "line": 1}
        findings.extend(evaluate(g["unit"], entries, anchor, g["main"] is not None, user_units))
    findings.sort(key=lambda x: (x["file"], x["line"], SEVERITY_ORDER[x["severity"]], x["type"]))
    return findings


def scan_text(text, name="unit.service", user_units=False):
    return scan_files([{"name": name, "text": text}], user_units)


def has_risk(findings):
    return any(f["severity"] in ("high", "medium") for f in findings)


def summary_line(findings):
    if not findings:
        return "No risky settings or missing sandboxing found in the patterns this tool reads (not proof the service is safe)."
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in ("high", "medium", "low")}
    units = len({f["unit"] for f in findings})
    parts = [f"{n} {s}" for s, n in counts.items() if n]
    return f"{len(findings)} finding{'s' if len(findings) != 1 else ''} in {units} unit{'s' if units != 1 else ''}: {', '.join(parts)}."


def _wanted(path):
    norm = path.replace("\\", "/")
    return norm.endswith(".service") or bool(DROPIN.search(norm))


def collect(paths):
    files = []
    for p in paths:
        if os.path.isfile(p):
            files.append(p)
            continue
        for root, dirs, names in os.walk(p):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            for n in sorted(names):
                full = os.path.join(root, n)
                if _wanted(full) and os.path.isfile(full):
                    files.append(full)
    out = []
    for path in files:
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        name = os.path.relpath(path) if not os.path.isabs(path) or path.startswith(os.getcwd()) else path
        out.append({"name": name.replace(os.sep, "/"), "text": text})
    return out


def render_text(findings, files):
    if not files:
        return "No .service files found."
    lines = [summary_line(findings)]
    for f in findings:
        lines.append(f"{f['file']}:{f['line']}  {f['severity'].upper():<6} {f['type']}")
        lines.append(f"    {f['detail']}")
        lines.append(f"    fix: {f['remediation']}")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", default=["."], help=".service files, drop-in .conf files or directories (default: .)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument("--fail-on-risk", action="store_true", help="exit 2 on any medium or high finding")
    parser.add_argument("--drop-in", action="store_true", help="also print a starter hardening drop-in per unit")
    parser.add_argument("--user-units", action="store_true", help="units run by `systemctl --user`: skip the root check")
    args = parser.parse_args(argv)

    files = collect(args.paths)
    findings = scan_files(files, args.user_units)
    units = []
    for f in findings:
        if f["unit"] not in units:
            units.append(f["unit"])
    if args.format == "json":
        payload = findings
        if args.drop_in:
            payload = {"findings": findings, "drop_ins": {u: drop_in_for(u, findings) for u in units if drop_in_for(u, findings)}}
        print(json.dumps(payload, indent=2))
    else:
        print(render_text(findings, files))
        if args.drop_in:
            for u in units:
                text = drop_in_for(u, findings)
                if text:
                    print()
                    print(text, end="")
    if args.fail_on_risk and has_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
