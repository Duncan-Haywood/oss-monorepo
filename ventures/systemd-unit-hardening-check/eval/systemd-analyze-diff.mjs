#!/usr/bin/env node
// Differential test: classify.mjs against systemd's own unit parser.
//
// `systemd-analyze security --offline=yes --json=short <file>` loads a unit file
// (and the NAME.service.d/*.conf drop-ins beside it) with systemd's real parser and
// reports, per setting, whether it is in force. Ten of this tool's eighteen
// finding types ask the same question as one or more of those tests, so for each
// seeded random unit tree we can say whether the tool and systemd agree.
//
// The mapping, tool finding <-> systemd-analyze test (json_field):
//   svc-runs-as-root                  UserOrDynamicUser says "runs as root user"
//   svc-no-new-privileges             NoNewPrivileges not set
//   svc-protect-system-missing        ProtectSystem says "full access"
//   svc-protect-system-partial        ProtectSystem neither "strict" nor "full access"
//   svc-protect-home-missing          ProtectHome says "full access"
//   svc-private-tmp-missing           PrivateTmp not set
//   svc-private-devices-missing       PrivateDevices not set
//   svc-kernel-protection-missing     any of ProtectKernelTunables/Modules/Logs, ProtectControlGroups not set
//   svc-no-syscall-filter             every SystemCallFilter_* says "does not filter"
//   svc-no-address-family-restriction no RestrictAddressFamilies_* is set
//
// Usage: node eval/systemd-analyze-diff.mjs [--seed N] [--count N] [--show N] [--json]
// Needs systemd-analyze (systemd 250 or later for --offline). Exit 1 on any
// disagreement not explained by the one documented gap (system call and address
// family names systemd does not know), 2 if systemd-analyze is missing.
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFiles } from "../classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const KINDS = [
  "svc-runs-as-root", "svc-no-new-privileges", "svc-protect-system-missing", "svc-protect-system-partial",
  "svc-protect-home-missing", "svc-private-tmp-missing", "svc-private-devices-missing",
  "svc-kernel-protection-missing", "svc-no-syscall-filter", "svc-no-address-family-restriction",
];

export function oracleKinds(tests) {
  const by = new Map(tests.map((t) => [t.json_field, t]));
  const set = (f) => by.get(f)?.set === true;
  const desc = (f) => by.get(f)?.description ?? "";
  const out = new Set();
  if (/runs as root user/.test(desc("UserOrDynamicUser"))) out.add("svc-runs-as-root");
  if (!set("NoNewPrivileges")) out.add("svc-no-new-privileges");
  const ps = desc("ProtectSystem");
  if (/full access/.test(ps)) out.add("svc-protect-system-missing");
  else if (!/strict/.test(ps)) out.add("svc-protect-system-partial");
  if (/full access/.test(desc("ProtectHome"))) out.add("svc-protect-home-missing");
  if (!set("PrivateTmp")) out.add("svc-private-tmp-missing");
  if (!set("PrivateDevices")) out.add("svc-private-devices-missing");
  if (["ProtectKernelTunables", "ProtectKernelModules", "ProtectKernelLogs", "ProtectControlGroups"].some((f) => !set(f)))
    out.add("svc-kernel-protection-missing");
  const scf = tests.filter((t) => t.json_field.startsWith("SystemCallFilter_"));
  if (scf.length && scf.every((t) => /does not filter/.test(t.description))) out.add("svc-no-syscall-filter");
  if (!tests.some((t) => t.json_field.startsWith("RestrictAddressFamilies_") && t.set)) out.add("svc-no-address-family-restriction");
  return out;
}

function rng(seed) {
  let s = seed >>> 0; // mulberry32
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOOL = ["yes", "no", "1", "0", "true", "false", "on", "off", "YES", "True", "y", "n", "t", "f", "Y", "", "maybe", " yes ", "yes # c"];
const VALUES = {
  User: ["root", "0", "app", "nobody", "", "app ", '"app"', "root"],
  DynamicUser: BOOL,
  NoNewPrivileges: BOOL,
  ProtectSystem: ["yes", "full", "strict", "no", "", "true", "1", "y", "Strict", "STRICT", "FULL", "off", "maybe", "strict ", "0"],
  ProtectHome: ["yes", "read-only", "tmpfs", "no", "", "1", "y", "Read-Only", "TMPFS", "off", "maybe", "0", "t"],
  PrivateTmp: BOOL, PrivateDevices: BOOL,
  ProtectKernelTunables: BOOL, ProtectKernelModules: BOOL, ProtectKernelLogs: BOOL, ProtectControlGroups: BOOL,
  SystemCallFilter: ["@system-service", "", "~@mount", "~@privileged @resources", "write read", "@nonexistent", "~", "none"],
  RestrictAddressFamilies: ["AF_UNIX", "", "none", "~AF_PACKET", "AF_INET AF_INET6", "AF_BOGUS", "~", "~AF_UNIX AF_INET"],
};
const KEYS = Object.keys(VALUES);
const HEADERS = ["[Service]", "[Service]", "[Service]", "[Unit]", "[Install]", "[service]", "[ Service ]", "[Service] ", " [Service]"];

function body(rnd, n, withHeader) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let t = withHeader ? "[Service]\n" : "";
  for (let j = 0; j < n; j++) {
    if (rnd() < 0.15) t += pick(HEADERS) + "\n";
    const r = rnd();
    if (r < 0.04) t += "# "; else if (r < 0.06) t += "; "; else if (r < 0.1) t += "  ";
    const base = pick(KEYS);
    const key = rnd() < 0.03 ? base.toLowerCase() : base;
    const sep = rnd() < 0.1 ? " = " : rnd() < 0.03 ? " =" : "=";
    let val = pick(VALUES[base]);
    let end = "\n";
    const e = rnd();
    if (e < 0.04) end = "\r\n";
    else if (e < 0.07 && val) { // split the value over a continuation line
      const cut = Math.max(1, Math.floor(val.length / 2));
      val = val.slice(0, cut) + "\\\n" + val.slice(cut);
    } else if (e < 0.09) end = "\\\n";
    t += key + sep + val + end;
  }
  return t;
}

export function makeTree(rnd) {
  const files = [{ name: "app.service", text: "[Service]\nExecStart=/usr/bin/true\n" + body(rnd, 1 + Math.floor(rnd() * 8), false) }];
  const nd = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 3);
  const names = ["10-a.conf", "20-b.conf", "05-z.conf", "a.conf", "B.conf"];
  for (let k = 0; k < nd; k++) {
    const name = names[Math.floor(rnd() * names.length)];
    if (files.some((f) => f.name.endsWith("/" + name))) continue;
    files.push({ name: "app.service.d/" + name, text: body(rnd, 1 + Math.floor(rnd() * 4), rnd() < 0.85) });
  }
  return files;
}

function analyze(dir) {
  return new Promise((resolve) => {
    execFile("systemd-analyze", ["security", "--offline=yes", "--json=short", path.join(dir, "app.service")],
      { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
        try { resolve({ tests: JSON.parse(stdout), stderr: String(stderr) }); } catch { resolve({ tests: null, stderr: String(stderr || err) }); }
      });
  });
}

export async function run({ seed = 1, count = 500, jobs = os.cpus().length } = {}) {
  const rnd = rng(seed);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sa-diff-"));
  const cases = [];
  for (let i = 0; i < count; i++) cases.push(makeTree(rnd));
  const results = new Array(count);
  let next = 0;
  async function worker() {
    while (next < count) {
      const i = next++;
      const dir = path.join(root, String(i));
      for (const f of cases[i]) {
        fs.mkdirSync(path.dirname(path.join(dir, f.name)), { recursive: true });
        fs.writeFileSync(path.join(dir, f.name), f.text);
      }
      results[i] = await analyze(dir);
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  fs.rmSync(root, { recursive: true, force: true });

  const perKind = Object.fromEntries(KINDS.map((k) => [k, { agree: 0, toolOnly: 0, systemdOnly: 0 }]));
  const diffs = [];
  let unloadable = 0, unloadableFatal = 0, explained = 0;
  cases.forEach((files, i) => {
    const { tests, stderr } = results[i];
    if (!tests || /fatal error/.test(stderr)) {
      unloadable++;
      if (/fatal error/.test(stderr)) unloadableFatal++;
      return;
    }
    const want = oracleKinds(tests);
    const got = new Set(scanFiles(files).map((f) => f.type).filter((t) => KINDS.includes(t)));
    const miss = [];
    for (const k of KINDS) {
      const a = got.has(k), b = want.has(k);
      if (a === b) perKind[k].agree++;
      else { (a ? perKind[k].toolOnly++ : perKind[k].systemdOnly++); miss.push((a ? "tool-only " : "systemd-only ") + k); }
    }
    if (!miss.length) return;
    // Known, documented gap: systemd drops system call and address family names it
    // does not know, so a deny list of only such names filters nothing; the tool
    // does not check names. Count a difference as that only when every differing
    // kind is one of those two lists and systemd warned about an unknown name.
    const unknownName = /System call \S.* is not known|Unknown system call group|Failed to parse address family/.test(stderr);
    const why = unknownName && miss.every((m) => /syscall-filter|address-family/.test(m)) ? "unknown-name" : null;
    if (why) explained++;
    diffs.push({ i, files, miss, why });
  });
  return { seed, count, unloadable, unloadableFatal, explained, perKind, diffs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
  try { execFileSync("systemd-analyze", ["--version"], { stdio: "ignore" }); } catch { console.error("systemd-analyze not found"); process.exit(2); }
  const version = execFileSync("systemd-analyze", ["--version"], { encoding: "utf8" }).split("\n")[0];
  const r = await run({ seed: arg("--seed", 1), count: arg("--count", 500) });
  if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 1)); process.exit(r.diffs.some((d) => !d.why) ? 1 : 0); }
  console.log(`${version}; seed ${r.seed}; ${r.count} unit trees; ${r.unloadable} not loadable by systemd-analyze (${r.unloadableFatal} a fatal parse error)`);
  for (const [k, v] of Object.entries(r.perKind)) console.log(`  ${k.padEnd(36)} agree ${v.agree}  tool-only ${v.toolOnly}  systemd-only ${v.systemdOnly}`);
  const unexplained = r.diffs.filter((d) => !d.why);
  console.log(`${r.diffs.length} of ${r.count - r.unloadable} trees disagree on at least one finding; ` +
    `${r.explained} only through names systemd does not know (a documented gap); ${unexplained.length} unexplained`);
  for (const d of unexplained.slice(0, arg("--show", 3))) {
    console.log(`\n--- case ${d.i}: ${d.miss.join(", ")}`);
    for (const f of d.files) console.log(`>> ${f.name}\n${f.text}`);
  }
  process.exit(unexplained.length ? 1 : 0);
}
