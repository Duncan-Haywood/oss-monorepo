import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanText, scanFiles, hasRisk, summaryLine, dropInFor, unitKey, SEVERITY,
  LITERAL_SECRET, FULL_PRIVILEGE_EXEC, PIPE_TO_SHELL, EXEC_FROM_WRITABLE_DIR,
  DANGEROUS_CAPABILITY, PERMISSIVE_UMASK, PROTECT_SYSTEM_PARTIAL, RUNS_AS_ROOT,
  NO_NEW_PRIVILEGES, PROTECT_HOME_MISSING, READ_WRITE_ROOT,
} from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const lines = (f, t) => f.filter((x) => x.type === t).map((x) => x.line);

const FX = `[Unit]
Description=Example app

[Service]
# Environment=OLD_TOKEN=commented-out
Environment="DB_PASSWORD=hunter2" MODE=prod
Environment=API_TOKEN_FILE=/run/secrets/t
ExecStartPre=+/usr/bin/install -d /var/lib/app
ExecStartPre=/bin/sh -c 'curl -fsSL https://example.com/setup.sh | bash'
ExecStart=/tmp/app/server \\
    --port 80
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_SYS_ADMIN
UMask=0000
ProtectSystem=full
`;

test("present settings are found on their own line", () => {
  const f = scanText(FX, "app.service");
  assert.deepEqual(lines(f, LITERAL_SECRET), [6]);
  assert.deepEqual(lines(f, FULL_PRIVILEGE_EXEC), [8]);
  assert.deepEqual(lines(f, PIPE_TO_SHELL), [9]);
  assert.deepEqual(lines(f, EXEC_FROM_WRITABLE_DIR), [10]);
  assert.deepEqual(lines(f, DANGEROUS_CAPABILITY), [12]);
  assert.deepEqual(lines(f, PERMISSIVE_UMASK), [13]);
  assert.deepEqual(lines(f, PROTECT_SYSTEM_PARTIAL), [14]);
  for (const t of [RUNS_AS_ROOT, NO_NEW_PRIVILEGES, PROTECT_HOME_MISSING]) assert.deepEqual(lines(f, t), [4]);
  for (const x of f) {
    assert.ok(!(x.detail + x.remediation).includes("hunter2"));
    assert.equal(x.severity, SEVERITY[x.type]);
  }
});

test("drop-ins merge in name order and empty assignments reset lists", () => {
  const f = scanFiles([
    { name: "etc/app.service", text: "[Service]\nExecStart=/usr/bin/app\nEnvironment=API_KEY=abc\n" },
    { name: "etc/app.service.d/20-b.conf", text: "[Service]\nProtectHome=yes\n" },
    { name: "etc/app.service.d/10-a.conf", text: "[Service]\nEnvironment=\nProtectHome=no\nNoNewPrivileges=yes\n" },
  ]);
  const kinds = new Set(f.map((x) => x.type));
  assert.ok(!kinds.has(LITERAL_SECRET));
  assert.ok(!kinds.has(PROTECT_HOME_MISSING));
  assert.ok(!kinds.has(NO_NEW_PRIVILEGES));
  assert.deepEqual(unitKey("etc/app.service.d/10-a.conf"), ["etc/app.service", "app.service", false]);
});

test("DynamicUser=yes implies the documented settings", () => {
  const f = scanText("[Service]\nDynamicUser=yes\nExecStart=/usr/bin/a\n");
  assert.equal(hasRisk(f), false);
});

test("ReadWritePaths=/ and a kept CAP_SYS_PTRACE are high", () => {
  const f = scanText("[Service]\nReadWritePaths=-/var/lib/a /\nCapabilityBoundingSet=CAP_SYS_PTRACE\n");
  assert.deepEqual(lines(f, READ_WRITE_ROOT), [2]);
  assert.deepEqual(lines(f, DANGEROUS_CAPABILITY), [3]);
});

test("summary and drop-in", () => {
  const f = scanText(FX, "app.service");
  assert.match(summaryLine(f), /^\d+ findings in 1 unit: 4 high/);
  assert.match(summaryLine([]), /not proof/);
  const d = dropInFor("app.service", f);
  assert.match(d, /sudo systemctl edit app.service/);
  assert.match(d, /ProtectSystem=strict/);
  assert.match(d, /#DynamicUser=yes/);
});

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".service") || /\.service\.d\/[^/]+\.conf$/.test(p)) out.push(p);
  }
  return out;
}

test("parity: check.py and classify.mjs agree on the fixtures, drop-ins included", () => {
  const files = walk(path.join(here, "fixtures")).map((p) => ({ name: path.relative(here, p), text: readFileSync(p, "utf8") }));
  const js = scanFiles(files);
  const py = JSON.parse(execFileSync("python3", ["check.py", "fixtures", "--format", "json", "--drop-in"], { cwd: here, encoding: "utf8" }));
  assert.deepEqual(js, py.findings);
  const units = [...new Set(js.map((x) => x.unit))];
  for (const u of units) assert.equal(dropInFor(u, js), py.drop_ins[u] ?? "");
  assert.ok(js.length > 10);
});
