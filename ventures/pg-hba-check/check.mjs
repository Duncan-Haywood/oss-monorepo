#!/usr/bin/env node
// pg_hba.conf Check, CLI. Reads pg_hba.conf and every file it includes, the
// way PostgreSQL 16 does, and prints each finding with file:line, the risk
// and the fix, then which line decides a few typical connections.
//
//   node check.mjs                                   # ./pg_hba.conf, else /etc/postgresql/16/main
//   node check.mjs /etc/postgresql/16/main           # a directory holding pg_hba.conf
//   node check.mjs path/to/pg_hba.conf
//   node check.mjs pg_hba.conf --user app --db appdb --addr 10.0.4.7 --tls
//                                                    # which line decides one connection
//   node check.mjs pg_hba.conf --ssl off             # the server runs with ssl = off
//   node check.mjs pg_hba.conf --format json
//   node check.mjs pg_hba.conf --fail-on-risk        # exit 2 on an error, high or medium
//
// Zero dependencies. It never connects to a server and makes no network
// calls. A clean result means only that these patterns were not found.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scan, matchConnection, hasRisk, summaryLine } from "./scan.mjs";

function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

export const fsResolver = {
  read(p) { try { return isFile(p) ? readFileSync(p, "utf8") : null; } catch { return null; } },
  listDir(d) { try { return readdirSync(d).filter((n) => !isDir(path.join(d, n))); } catch { return null; } },
};

const USAGE = "usage: node check.mjs [pg_hba.conf | DIR] [--ssl on|off] [--user U --db D (--local | --addr IP) [--tls] [--replication] [--group G]...] [--format json] [--fail-on-risk]";

export function main(argv, out = console.log) {
  let format = "text", failOnRisk = false, ssl = true;
  const conn = {};
  const groups = [];
  const targets = [];
  const VALUED = new Set(["--format", "--ssl", "--user", "--db", "--addr", "--group"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUED.has(a) && (i + 1 >= argv.length || argv[i + 1].startsWith("--"))) { console.error(`pg_hba.conf Check: ${a} needs a value\n${USAGE}`); return 2; }
    if (a === "--format") format = argv[++i];
    else if (a === "--fail-on-risk") failOnRisk = true;
    else if (a === "--ssl") ssl = argv[++i] !== "off";
    else if (a === "--user") conn.user = argv[++i];
    else if (a === "--db") conn.database = argv[++i];
    else if (a === "--addr") { conn.type = "host"; conn.address = argv[++i]; }
    else if (a === "--local") conn.type = "local";
    else if (a === "--tls") conn.ssl = true;
    else if (a === "--replication") conn.replication = "physical";
    else if (a === "--group") groups.push(argv[++i]);
    else if (a === "-h" || a === "--help") { out(USAGE); return 0; }
    else targets.push(a);
  }
  let target = targets[0] || (isFile("pg_hba.conf") ? "pg_hba.conf" : "/etc/postgresql/16/main");
  let file = path.resolve(target);
  if (isDir(file)) file = path.join(file, "pg_hba.conf");
  const roles = conn.user ? { [conn.user]: { memberOf: groups } } : undefined;
  const result = scan({ resolver: fsResolver, main: file, build: { ssl } });
  if (conn.user) {
    conn.type ||= "local";
    conn.database ||= conn.user;
    // Only the groups given are known; any other +group stays undecided.
    result.connection = { ...matchConnection(result.rules, conn, groups.length ? roles : undefined), asked: conn };
  }
  const rel = (p) => { const r = path.relative(process.cwd(), p); return r && !r.startsWith("..") && !path.isAbsolute(r) ? r : p; };
  if (format === "json") { out(JSON.stringify(result, (k, v) => (v instanceof RegExp ? String(v) : v), 2)); }
  else {
    out(`pg_hba.conf Check: ${summaryLine(result.findings)}`);
    out(`Read, in order: ${result.order.map(rel).join(" -> ")}`);
    out(`Rules loaded: ${result.rules.length}${result.loads ? "" : " (PostgreSQL would refuse this file)"}`);
    for (const f of result.findings) {
      out(`\n[${f.severity}] ${f.type}  ${f.line ? `${rel(f.file)}:${f.line}` : f.file ? rel(f.file) : ""}`);
      if (f.raw) out(`  ${f.raw.trim()}`);
      out(`  ${f.detail}`);
      out(`  fix: ${f.remediation}`);
    }
    out("\nWhich line decides:");
    for (const p of result.probes) out(`  ${p.label}: ${p.rule ? `${rel(p.rule.file)}:${p.rule.line} ${p.rule.method}` : "no line matches, refused"}${p.unknown.length ? ` (after ${p.unknown.map((u) => `${rel(u.file)}:${u.line}`).join(", ")}, which depend on facts not given)` : ""}`);
    if (result.connection) {
      const c = result.connection;
      out(`\nYour connection: ${c.rule ? `${rel(c.rule.file)}:${c.rule.line} ${c.rule.method}` : "no line matches, refused"}${c.unknown.length ? ` (after ${c.unknown.map((u) => `${rel(u.file)}:${u.line}`).join(", ")}, which might match: group membership, server addresses or DNS not given)` : ""}`);
    }
    for (const n of result.notes) out(`note: ${n}`);
  }
  return failOnRisk && hasRisk(result.findings) ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (err) { console.error(`pg_hba.conf Check: ${err.message}`); process.exitCode = 1; }
}
