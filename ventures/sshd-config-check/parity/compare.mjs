#!/usr/bin/env node
// Replays the recorded sshd runs (sshd-9.6p1.json) through the engine and
// lists every disagreement: whether sshd starts, and each compared setting
// for each connection. `node parity/compare.mjs` prints a summary;
// parity.test.mjs asserts there is none.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { genCase, COMPARED } from "./gen.mjs";
import { scanFiles, readConfig, resolve, DEFAULTS, convtime, intValue } from "../scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// Expand the compact record: each case gets starts, error and, per
// connection, the settings sshd -T printed.
export function loadRecord() {
  const rec = JSON.parse(readFileSync(join(here, "sshd-9.6p1.json"), "utf8"));
  for (const c of rec.cases) {
    c.starts = !c.error;
    c.error ??= null;
    c.conns = (c.conns || []).map((row) => ({ settings: Object.fromEntries(rec.keys.map((k, i) => [k, row[i]]).filter(([, v]) => v !== null)) }));
  }
  return rec;
}

// sshd -T prints the canonical spelling of each enum value.
const CANON = {
  permitrootlogin: { "prohibit-password": "without-password" },
  allowtcpforwarding: { all: "yes" },
};

function engineValue(map, k) {
  const e = map.get(k);
  if (!e) return DEFAULTS[k];
  return e.value;
}

function norm(k, v) {
  if (v == null) return v;
  const c = COMPARED[k];
  let s = String(v);
  // sshd -T prints numbers as it parsed them: 2m30s is 150, 011 is 11.
  if (k === "logingracetime") return String(convtime(s));
  if (k === "maxauthtries") return String(intValue(s).value);
  if (!c.exactCase) s = s.toLowerCase();
  return CANON[k]?.[s] ?? s;
}

// The engine's users list as sshd -T prints it: one line per word.
function listValue(map, k) {
  const e = map.get(k);
  return e ? e.value.slice() : undefined;
}

export function compareCase(rec) {
  const c = genCase(rec.seed);
  const out = [];
  const scan = scanFiles(c.files);
  const engineStarts = !scan.findings.some((f) => f.severity === "error");
  if (engineStarts !== rec.starts) {
    out.push({ seed: rec.seed, kind: "starts", engine: engineStarts, sshd: rec.starts, sshdError: rec.error, engineErrors: scan.findings.filter((f) => f.severity === "error").map((f) => `${f.file}:${f.line} ${f.detail}`) });
    return out;
  }
  if (!rec.starts) return out;
  const read = readConfig(c.files);
  rec.conns.forEach((r, i) => {
    const conn = { ...c.conns[i], groups: [] };
    const { effective } = resolve(read, conn);
    for (const k of Object.keys(COMPARED)) {
      const mine = norm(k, engineValue(effective, k));
      const theirs = r.settings[k];
      if (mine !== theirs) out.push({ seed: rec.seed, kind: "setting", conn: i, keyword: k, engine: mine, sshd: theirs });
    }
    for (const k of ["allowusers", "denyusers"]) {
      const mine = JSON.stringify(listValue(effective, k));
      const theirs = JSON.stringify(r.settings[k]);
      if (mine !== theirs) out.push({ seed: rec.seed, kind: "setting", conn: i, keyword: k, engine: mine, sshd: theirs });
    }
  });
  return out;
}

export function compareAll(record = loadRecord()) {
  const diffs = [];
  let checks = 0;
  for (const rec of record.cases) {
    checks += 1 + (rec.starts ? rec.conns.length * (Object.keys(COMPARED).length + 2) : 0);
    diffs.push(...compareCase(rec));
  }
  return { diffs, checks, cases: record.cases.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { diffs, checks, cases } = compareAll();
  const by = {};
  for (const d of diffs) {
    const key = d.kind === "starts" ? `starts: engine ${d.engine}, sshd ${d.sshd}: ${(d.sshdError || d.engineErrors[0] || "").replace(/^.*?line \d+: /, "").slice(0, 70)}` : `${d.keyword}: engine ${d.engine} vs sshd ${d.sshd}`;
    (by[key] ||= []).push(d.seed);
  }
  console.log(`${cases} cases, ${checks} checks, ${diffs.length} disagreements`);
  for (const [k, seeds] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) console.log(`${String(seeds.length).padStart(4)}  ${k}  (seeds ${[...new Set(seeds)].slice(0, 5).join(", ")})`);
}
