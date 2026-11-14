#!/usr/bin/env node
// sshd_config Check, CLI. Reads sshd_config and every file its Include lines
// pull in, in the order sshd reads them, and prints each finding with
// file:line, the risk and the fix, then how people can log in.
//
//   node check.mjs                          # /etc/ssh (or ./sshd_config here)
//   node check.mjs /etc/ssh                 # /etc/ssh/sshd_config + its Includes
//   node check.mjs ./sshd_config            # one file and what it includes
//   node check.mjs /etc/ssh --user deploy --addr 203.0.113.9 --group sudo
//                                           # what one connection gets (Match)
//   node check.mjs /etc/ssh --format json
//   node check.mjs /etc/ssh --fail-on-risk  # exit 2 on an error, high or medium
//
// Zero dependencies. It never runs sshd and makes no network calls. A
// relative Include resolves against /etc/ssh, as in sshd; --root DIR reads
// a copy of /etc laid out under DIR (DIR/etc/ssh/...). A clean result means
// only that these patterns were not found.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scanFiles, hasRisk, summaryLine, argvSplit, SSHDIR } from "./scan.mjs";

function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function globToRe(seg) {
  return new RegExp("^" + seg.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\[!/g, "[^") + "$");
}

// Expand an Include pattern on disk (wildcards in any path segment). `disk`
// maps an sshd path (/etc/ssh/...) to where the file really is.
function expand(pattern, disk) {
  const segs = pattern.split("/").filter(Boolean);
  let paths = ["/"];
  for (const seg of segs) {
    const next = [];
    for (const p of paths) {
      if (!/[*?[]/.test(seg)) { next.push(path.posix.join(p, seg)); continue; }
      let names = [];
      try { names = readdirSync(disk(p)); } catch { /* none */ }
      const re = globToRe(seg);
      for (const n of names) if (re.test(n) && !(n.startsWith(".") && !seg.startsWith("."))) next.push(path.posix.join(p, n));
    }
    paths = next;
  }
  return paths.filter((p) => isFile(disk(p)));
}

// Load the main file and, recursively, everything its Include lines name.
// Files are named by their sshd path, the main one "sshd_config".
export function collect(disk, mainPath = `${SSHDIR}/sshd_config`) {
  const files = new Map();
  const queue = [mainPath];
  while (queue.length) {
    const p = queue.shift();
    if (files.has(p)) continue;
    let text;
    try { text = readFileSync(disk(p), "utf8"); } catch (e) { if (p === mainPath) throw e; continue; }
    files.set(p, text);
    for (const line of text.split("\n")) {
      const m = /^\s*include(?:\s*=\s*|\s+)(.*)$/i.exec(line);
      if (!m) continue;
      let args = [];
      try { args = argvSplit(m[1]); } catch { continue; }
      for (const a of args) {
        const pat = a.startsWith("/") ? a : `${SSHDIR}/${a}`;
        for (const hit of expand(pat, disk)) queue.push(hit);
      }
    }
  }
  return [...files].map(([p, text]) => ({ name: p === mainPath ? "sshd_config" : p.startsWith(`${SSHDIR}/`) ? p.slice(SSHDIR.length + 1) : p, text }));
}

export function main(argv) {
  let format = "text";
  let failOnRisk = false;
  let root = "/";
  const conn = {};
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format") format = argv[++i];
    else if (a === "--fail-on-risk") failOnRisk = true;
    else if (a === "--root") root = argv[++i];
    else if (a === "--user") conn.user = argv[++i];
    else if (a === "--group") (conn.groups ||= []).push(argv[++i]);
    else if (a === "--host") conn.host = argv[++i];
    else if (a === "--addr") conn.addr = argv[++i];
    else if (a === "--laddr") conn.laddr = argv[++i];
    else if (a === "--lport") conn.lport = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log("usage: node check.mjs [/etc/ssh | path/to/sshd_config] [--root DIR] [--user U --group G --host H --addr A --laddr A --lport P] [--format json] [--fail-on-risk]");
      return 0;
    } else targets.push(a);
  }
  let target = targets[0] || (isFile("sshd_config") ? "sshd_config" : SSHDIR);
  let disk;
  let mainFile;
  if (root !== "/") {
    disk = (p) => path.join(root, p);
    mainFile = `${SSHDIR}/sshd_config`;
  } else {
    // The target's folder stands in for /etc/ssh, so a copy in a repo reads
    // the way it will on the server.
    const abs = path.resolve(target);
    const file = isDir(abs) ? path.join(abs, "sshd_config") : abs;
    const dir = path.dirname(file);
    disk = (p) => (p === `${SSHDIR}/sshd_config` ? file : p.startsWith(`${SSHDIR}/`) ? path.join(dir, p.slice(SSHDIR.length + 1)) : p);
    mainFile = `${SSHDIR}/sshd_config`;
  }
  const files = collect(disk, mainFile);
  const result = scanFiles(files, Object.keys(conn).length ? { connection: conn } : {});
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`sshd_config Check: ${summaryLine(result.findings)}`);
    console.log(`Read, in order: ${result.order.map((o) => o.name).join(" -> ")}`);
    for (const f of result.findings) {
      console.log(`\n[${f.severity}] ${f.type}  ${f.line ? `${f.file}:${f.line}` : "(not set, default)"}${f.scope !== "global" ? `  (${f.scope})` : ""}`);
      console.log(`  ${f.detail}`);
      console.log(`  fix: ${f.remediation}`);
    }
    const l = result.login;
    console.log(`\nLogin: root ${l.root} (${l.rootAt}); passwords ${l.passwords ? `ON via ${l.passwordVia}` : "off"}; keys ${l.keys ? "on" : "off"}`);
    for (const m of result.perMatch) console.log(`  ${m.match} (${m.file}:${m.line}): ${m.sets.join("; ")}`);
    if (result.connection) console.log(`Connection: applies ${result.connection.applied.join(", ") || "no Match block"}; root ${result.connection.root}; passwords ${result.connection.passwords ? "ON" : "off"}`);
    for (const n of result.notes) console.log(`note: ${n}`);
  }
  return failOnRisk && hasRisk(result.findings) ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`sshd_config Check: ${err.message}`);
    process.exitCode = 1;
  }
}
