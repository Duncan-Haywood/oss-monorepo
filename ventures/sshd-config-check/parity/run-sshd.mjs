#!/usr/bin/env node
// Runs the generated cases through a real sshd and records what it says.
// Needs root in a throwaway machine or container: it writes each case to
// /etc/ssh (and deletes that directory first). Never run it on a server.
//
//   SSHD=/path/to/sshd HOSTKEY=/path/to/ed25519_key node parity/run-sshd.mjs [count] [first-seed]
//
// Output: parity/sshd-9.6p1.json, replayed by parity.test.mjs with no sshd.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { genCase, COMPARED } from "./gen.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SSHD = process.env.SSHD || "/usr/sbin/sshd";
const HOSTKEY = process.env.HOSTKEY;
if (!HOSTKEY) throw new Error("set HOSTKEY to a private host key file (ssh-keygen -t ed25519 -N '' -f key)");
if (existsSync("/etc/ssh/.parity-ok") === false && existsSync("/etc/ssh")) throw new Error("/etc/ssh exists and was not made by this script; refusing to delete it");
const count = Number(process.argv[2] || 400);
const first = Number(process.argv[3] || 1);
const version = spawnSync(SSHD, ["-V"], { encoding: "utf8" }).stderr.trim();

export const KEYS = [...Object.keys(COMPARED), "allowusers", "denyusers"];
const KEEP = new Set(KEYS);
function run(args) {
  const p = spawnSync(SSHD, ["-f", "/etc/ssh/sshd_config", "-h", HOSTKEY, ...args], { encoding: "utf8" });
  const out = {};
  for (const line of (p.stdout || "").split("\n")) {
    const m = /^(\S+) (.*)$/.exec(line);
    if (!m || !KEEP.has(m[1])) continue;
    if (m[1] === "allowusers" || m[1] === "denyusers") (out[m[1]] ||= []).push(m[2]);
    else out[m[1]] = m[2];
  }
  return { status: p.status, stderr: (p.stderr || "").trim().split("\n").filter(Boolean).slice(-2).join(" | "), settings: out };
}

const cases = [];
for (let seed = first; seed < first + count; seed++) {
  const c = genCase(seed);
  rmSync("/etc/ssh", { recursive: true, force: true });
  mkdirSync("/etc/ssh/sshd_config.d", { recursive: true });
  writeFileSync("/etc/ssh/.parity-ok", "");
  for (const f of c.files) { mkdirSync(dirname(f.name), { recursive: true }); writeFileSync(f.name, f.text); }
  const test = run(["-t"]);
  // Each connection's settings as a row in KEYS order; the connection itself
  // is regenerated from the seed.
  const conns = test.status !== 0 ? [] : c.conns.map((conn) => {
    const r = run(["-T", "-C", `user=${conn.user},host=${conn.host},addr=${conn.addr},laddr=${conn.laddr},lport=${conn.lport}`]);
    if (r.status !== 0) throw new Error(`seed ${seed}: sshd -t passed but -T -C failed: ${r.stderr}`);
    return KEYS.map((k) => r.settings[k] ?? null);
  });
  cases.push(test.status === 0 ? { seed, conns } : { seed, error: test.stderr.replace(/^.*?line (\d+)/, "line $1").replace(/\r/g, "") });
}
rmSync("/etc/ssh", { recursive: true, force: true });
const outFile = join(here, "sshd-9.6p1.json");
writeFileSync(outFile, JSON.stringify({ sshd: version, generator: "parity/gen.mjs", first, count, keys: KEYS, cases }, null, 0).replace(/\{"seed"/g, '\n{"seed"') + "\n");
console.log(`${cases.length} cases, ${cases.filter((c) => !c.error).length} start; wrote ${outFile} (${version})`);
