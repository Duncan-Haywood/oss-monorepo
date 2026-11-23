#!/usr/bin/env node
// redis.conf Check, CLI. Reads redis.conf and every file its include lines
// pull in, the way Redis 7.0 does, and prints whether Redis would start,
// who can connect without a password, and each finding with file:line and
// the fix.
//
//   node check.mjs                         # ./redis.conf, else /etc/redis/redis.conf
//   node check.mjs /etc/redis/redis.conf
//   node check.mjs redis.conf --cwd /var/lib/redis   # where redis-server starts (relative includes)
//   node check.mjs redis.conf --host-addrs           # check bind against this machine's addresses
//   node check.mjs redis.conf --get maxmemory        # the value Redis would use, and the line that set it
//   node check.mjs redis.conf --no-defrag            # a build without active defrag (Debian/Ubuntu packages)
//   node check.mjs redis.conf --format json
//   node check.mjs redis.conf --fail-on-risk         # exit 2 on an error, high or medium finding
//
// Zero dependencies. It never connects to a server and makes no network
// calls. A clean result means only that these patterns were not found.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scan, hasRisk, summaryLine, OUTCOME_TEXT } from "./scan.mjs";

function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

export const fsResolver = {
  read(p) { try { return isFile(p) ? readFileSync(p, "latin1") : null; } catch { return null; } },
  listDir(d) { try { return readdirSync(d); } catch { return null; } },
  isDir(p) { return isDir(p); },
  unknown() { return false; },
};

export function localAddrs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list || []) out.push(a.address);
  return out;
}

const USAGE = "usage: node check.mjs [redis.conf] [--cwd DIR] [--host-addrs] [--no-defrag] [--get NAME]... [--format json] [--fail-on-risk]";

export function main(argv, out = console.log) {
  let format = "text", failOnRisk = false, cwd, hostAddrs, build;
  const gets = [], targets = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--format", "--cwd", "--get"].includes(a) && (i + 1 >= argv.length || argv[i + 1].startsWith("--"))) { console.error(`redis.conf Check: ${a} needs a value\n${USAGE}`); return 2; }
    if (a === "--format") format = argv[++i];
    else if (a === "--cwd") cwd = path.resolve(argv[++i]);
    else if (a === "--get") gets.push(argv[++i].toLowerCase());
    else if (a === "--host-addrs") hostAddrs = localAddrs();
    else if (a === "--fail-on-risk") failOnRisk = true;
    else if (a === "--no-defrag") build = { defrag: false };
    else if (a === "-h" || a === "--help") { out(USAGE); return 0; }
    else targets.push(a);
  }
  const file = path.resolve(targets[0] || (isFile("redis.conf") ? "redis.conf" : "/etc/redis/redis.conf"));
  const result = scan({ resolver: fsResolver, main: file, cwd: cwd || path.dirname(file), hostAddrs, build });
  const rel = (p) => { if (!p) return ""; const r = path.relative(process.cwd(), p); return r && !r.startsWith("..") && !path.isAbsolute(r) ? r : p; };
  if (format === "json") { out(JSON.stringify(result, null, 2)); }
  else {
    out(`redis.conf Check (Redis ${result.version}): ${summaryLine(result.findings)}`);
    out(`Read, in order: ${result.order.map(rel).join(" -> ")}`);
    out(result.startup.ok ? "Starts: yes" : `Starts: no -- ${result.startup.message}${result.startup.file ? ` (${rel(result.startup.file)}${result.startup.line ? `:${result.startup.line}` : ""})` : ""}`);
    if (result.exposure && result.startup.ok) {
      const e = result.exposure;
      out(`Listens: ${e.port ? `port ${e.port}` : "no plaintext port"}${e.tlsPort ? `, TLS port ${e.tlsPort}` : ""} on ${e.bind.join(" ") || "(nothing)"}${e.unixsocket ? `, socket ${e.unixsocket}` : ""}`);
      out(`  From another machine: ${OUTCOME_TEXT[e.remote.outcome]}`);
      out(`  From this machine (127.0.0.1): ${OUTCOME_TEXT[e.local.outcome]}`);
      if (e.socket) out(`  Over the unix socket: ${OUTCOME_TEXT[e.socket.outcome]}`);
    }
    for (const f of result.findings) {
      out(`\n[${f.severity}] ${f.type}  ${f.line ? `${rel(f.file)}:${f.line}` : rel(f.file)}`);
      if (f.raw) out(`  ${f.raw.trim()}`);
      out(`  ${f.detail.replaceAll(process.cwd() + "/", "")}`);
      out(`  fix: ${f.remediation}`);
    }
    for (const g of gets) {
      const s = result.setBy[g];
      const shown = /pass/.test(g) && result.values[g] ? "(set, hidden)" : result.values[g] ?? null;
      out(`\n${g} = ${JSON.stringify(shown)}${s ? ` (set at ${rel(s.file)}:${s.line})` : " (default)"}`);
    }
    for (const n of result.notes) out(`note: ${n}`);
  }
  return failOnRisk && hasRisk(result.findings) ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (err) { console.error(`redis.conf Check: ${err.message}`); process.exitCode = 1; }
}
