// Runs the generated cases against a real PostgreSQL 16 server and records
// what it did, for compare.mjs (and the test suite) to check the engine
// against. Needs a disposable server you own; it overwrites pg_hba.conf in
// the data directory and reloads it, then puts the original back.
//
//   PGDATA=/var/tmp/pgp/data PGSOCK=/var/tmp/pgp PGPORT=54329 \
//     node parity/run-pg.mjs --parse 400 --match 150 > parity/pg-16.json
//
// Server set-up used for the recorded run (see README.md): ssl = on with a
// self-signed certificate, log_connections = on, listen_addresses =
// '127.0.0.1,::1', roles alice (LOGIN REPLICATION, member of staff), bob
// (LOGIN), staff (NOLOGIN), postgres; every login role has password 'pw',
// stored as SCRAM; databases appdb and staff. The view is read over the
// socket with the original trust file still loaded, so a broken test file
// never locks the runner out.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { parseCase, matchCase, MATCH_CONNECTIONS } from "./gen.mjs";

const DATA = process.env.PGDATA;
const SOCK = process.env.PGSOCK;
const PORT = process.env.PGPORT || "5432";
const LOG = process.env.PGLOG;
const PGCTL = process.env.PGCTL || "/usr/lib/postgresql/16/bin/pg_ctl";
const AS = process.env.PGOSUSER || "postgres";
if (!DATA || !SOCK || !LOG) throw new Error("set PGDATA, PGSOCK and PGLOG");

const args = process.argv.slice(2);
const nParse = Number(args[args.indexOf("--parse") + 1] || 0);
const nMatch = Number(args[args.indexOf("--match") + 1] || 0);
const HBA = path.join(DATA, "pg_hba.conf");
const original = readFileSync(HBA, "utf8");
const EXTRA = ["conf.d", "extra.conf", "users.txt", "missing.conf", "nosuch.txt"];

function writeCase(files) {
  for (const e of EXTRA) rmSync(path.join(DATA, e), { recursive: true, force: true });
  for (const [name, text] of Object.entries(files)) {
    const p = path.join(DATA, name);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

function psqlAdmin(sql) {
  return execFileSync("psql", ["-h", SOCK, "-p", PORT, "-U", "postgres", "-d", "postgres", "-XAtq", "-c", sql], { encoding: "utf8" });
}

function reload() {
  const before = readFileSync(LOG, "utf8").split("received SIGHUP").length;
  execFileSync("su", [AS, "-c", `${PGCTL} -D ${DATA} reload -s`]);
  for (let i = 0; i < 200; i++) {
    const now = readFileSync(LOG, "utf8");
    if (now.split("received SIGHUP").length > before) { spawnSync("sleep", ["0.15"]); return; }
    spawnSync("sleep", ["0.02"]);
  }
  throw new Error("reload not seen in log");
}

function logFrom(offset) {
  const size = statSync(LOG).size;
  const buf = Buffer.alloc(size - offset);
  const fd = openSync(LOG, "r");
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  return buf.toString("utf8");
}

function connect(c) {
  const conninfo = [
    `host=${c.type === "local" ? SOCK : c.address}`, `port=${PORT}`, `user=${c.user}`, `dbname=${c.database}`,
    "gssencmode=disable", `sslmode=${c.type === "local" ? "disable" : c.ssl ? "require" : "disable"}`, "connect_timeout=5",
    ...(c.replication ? ["replication=true"] : []),
  ].join(" ");
  const offset = statSync(LOG).size;
  const res = spawnSync("psql", [conninfo, "-XAtq", "-c", c.replication ? "IDENTIFY_SYSTEM" : "SELECT 1"], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "pw" } });
  spawnSync("sleep", ["0.03"]);
  const log = logFrom(offset);
  const m = /connection authenticated: identity="[^"]*" method=(\S+) \(([^:]+):(\d+)\)/.exec(log);
  if (m) return { outcome: "auth", method: m[1], file: m[2], line: Number(m[3]) };
  const err = res.stderr || "";
  if (/pg_hba\.conf rejects (replication )?connection/.test(err)) return { outcome: "reject" };
  if (/no pg_hba\.conf entry for (replication )?(connection|host)/.test(err)) return { outcome: "none" };
  return { outcome: "other", stderr: err.trim().split("\n").slice(-1)[0] };
}

const out = { server: psqlAdmin("SELECT version()").trim(), data: DATA, parse: [], match: [] };
try {
  for (let s = 1; s <= nParse; s++) {
    const files = parseCase(s);
    writeCase(files);
    const rows = JSON.parse(psqlAdmin("SELECT coalesce(json_agg(json_build_object('file_name', file_name, 'line_number', line_number, 'type', type, 'database', database, 'user_name', user_name, 'address', address, 'netmask', netmask, 'auth_method', auth_method, 'options', options, 'error', error) ORDER BY rn), '[]') FROM (SELECT *, row_number() OVER () AS rn FROM pg_hba_file_rules) t").trim() || "[]");
    out.parse.push({ seed: s, files, rows });
  }
  for (let s = 1; s <= nMatch; s++) {
    const files = matchCase(s);
    writeCase(files);
    reload();
    const results = MATCH_CONNECTIONS.map((c) => ({ conn: c, ...connect(c) }));
    out.match.push({ seed: s, files, results });
    writeFileSync(HBA, original);
    reload();
  }
} finally {
  for (const e of EXTRA) rmSync(path.join(DATA, e), { recursive: true, force: true });
  writeFileSync(HBA, original);
  reload();
}
process.stdout.write(JSON.stringify(out) + "\n");
