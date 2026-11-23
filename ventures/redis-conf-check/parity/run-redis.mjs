#!/usr/bin/env node
// Runs every generated case against a real redis-server and records what it
// did: whether it started (and Redis's own error when not), CONFIG GET * as
// an admin, and what an unauthenticated client gets from another address of
// this machine, from 127.0.0.1 and over the unix socket.
//
//   node parity/run-redis.mjs [count] [remote-ip] [work-dir] > parity/redis-7.0.json
//
// Needs redis-server 7.0 on PATH. Each case runs in its own new directory
// under work-dir (default: a fresh one in the OS temp dir), which the record
// calls /parity. The directories are left in place for inspection.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { makeCase, fingerprint } from "./gen.mjs";

const COUNT = Number(process.argv[2] || 800);
const REMOTE = process.argv[3] || "192.0.2.2";
const WORK = process.argv[4] || mkdtempSync(path.join(tmpdir(), "redis-parity-"));
const ADMIN = "parity-admin-7c1e9b";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resp(args) { return `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join(""); }

function readReply(b, i = 0) {
  const e = b.indexOf("\r\n", i);
  if (e < 0) return null;
  const head = b.slice(i, e), t = head[0];
  if (t === "+" || t === "-" || t === ":") return { head, len: e + 2 - i };
  if (t === "$") {
    const n = Number(head.slice(1));
    if (n < 0) return { head, len: e + 2 - i };
    if (b.length < e + 2 + n + 2) return null;
    return { head: `$${b.slice(e + 2, e + 2 + n)}`, len: e + 2 + n + 2 - i };
  }
  if (t === "*") {
    const n = Number(head.slice(1)); let j = e + 2; const items = [];
    for (let k = 0; k < n; k++) { const r = readReply(b, j); if (!r) return null; items.push(r.head); j += r.len; }
    return { head: "*", items, len: j - i };
  }
  return { head, len: e + 2 - i };
}

// Sends cmds on one connection; resolves with every reply, or with what
// arrived before the server closed the connection.
// A unix socket path over 107 bytes cannot be connected to directly, so
// socket paths are reached relative to the working directory.
function talk(opts, cmds, timeout = 1500) {
  if (opts.path && path.isAbsolute(opts.path)) {
    const prev = process.cwd();
    process.chdir(path.dirname(opts.path));
    // Probes run one at a time, so the directory stays put until this one ends.
    return talk({ path: path.basename(opts.path) }, cmds, timeout).finally(() => process.chdir(prev));
  }
  return new Promise((resolve) => {
    const out = [];
    let buf = "", done = false;
    const sock = net.createConnection(opts);
    const finish = (tail) => { if (done) return; done = true; clearTimeout(t); sock.destroy(); resolve(tail ? [...out, { head: tail }] : out); };
    const t = setTimeout(() => finish("timeout"), timeout);
    // Protected mode writes -DENIED on accept and closes; wait for it before
    // writing, so the reply is not lost to a reset.
    sock.on("connect", () => setTimeout(() => { if (!done) for (const c of cmds) sock.write(resp(c)); }, 60));
    const drain = () => {
      while (out.length < cmds.length) {
        const r = readReply(buf);
        if (!r) break;
        out.push(r);
        buf = buf.slice(r.len);
      }
    };
    sock.on("data", (d) => { buf += d.toString("latin1"); drain(); if (out.length >= cmds.length) finish(); });
    sock.on("error", (e) => { drain(); finish(out.length ? null : e.code === "ECONNREFUSED" ? "refused" : `closed:${e.code}`); });
    sock.on("close", () => { drain(); finish(out.length ? null : "closed"); });
  });
}

const classify = (h) => {
  if (!h) return "none";
  if (h.startsWith("refused")) return "refused";
  if (h === "+PONG" || h === "+OK" || h === "*") return "ok";
  if (h.startsWith("-DENIED")) return "denied";
  if (h.startsWith("-NOAUTH")) return "noauth";
  if (h.startsWith("-NOPERM")) return "noperm";
  if (h.startsWith("-ERR unknown command")) return "unknown";
  if (/protected config|not allowed/.test(h)) return "blocked";
  return `other:${h.slice(0, 80)}`;
};

async function probe(opts) {
  const r = await talk(opts, [["PING"], ["CONFIG", "SET", "dir", "."], ["DEBUG", "SLEEP", "0"], ["MODULE", "LOAD", "/nonexistent/parity-module.so"]]);
  const ping = classify(r[0]?.head);
  const res = { ping };
  if (ping === "ok") { res.configSetDir = classify(r[1]?.head); res.debug = classify(r[2]?.head); res.moduleLoad = /Error loading the extension/.test(r[3]?.head || "") ? "ok" : classify(r[3]?.head); }
  return res;
}

async function runCase(seed, port) {
  const c = makeCase(seed);
  const dir = path.join(WORK, `case-${seed}`);
  for (const d of c.dirs) mkdirSync(path.join(dir, d), { recursive: true });
  const sub = (t) => t.replaceAll("__PORT__", String(port)).replaceAll("__DIR__", dir);
  for (const [n, t] of Object.entries(c.files)) writeFileSync(path.join(dir, n), sub(t));
  const usesAclfile = Object.values(c.files).some((t) => /^\s*aclfile/im.test(t));
  const args = ["redis.conf"];
  // An admin to read CONFIG GET with; appended after the file, as Redis
  // appends command-line options, so it does not move any line number.
  if (!usesAclfile) args.push("--user", ADMIN, "on", ">admin-pw-parity", "~*", "&*", "+@all");
  const child = spawn("redis-server", args, { cwd: dir, env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", exited = null;
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  child.on("exit", (code) => (exited = code));
  const rec = { seed, fp: fingerprint(c), started: false };
  let ready = false;
  // "Ready to accept connections" is a notice; loglevel warning hides it,
  // so also count any reply on the port or the socket as ready.
  // unixsocket is relative: it lands in the final dir (the case root or data/).
  const sockGuesses = [path.join(dir, "redis.sock"), path.join(dir, "data", "redis.sock")];
  const sockGuess = sockGuesses[0];
  for (let k = 0; k < 80 && exited === null && !ready; k++) {
    await sleep(50);
    ready = /Ready to accept connections/.test(output);
    if (!ready && k % 4 === 3) {
      for (const o of [{ host: "127.0.0.1", port }, { host: REMOTE, port }, ...sockGuesses.map((p) => ({ path: p }))]) {
        const r = await talk(o, [["PING"]], 300);
        if (r[0] && r[0].head && !/^(refused|closed|timeout)/.test(r[0].head)) { ready = true; break; }
      }
    }
  }
  await sleep(30);
  if (exited !== null || !ready) {
    if (exited === null) { child.kill("SIGKILL"); await sleep(50); }
    const m = output.match(/FATAL CONFIG FILE ERROR[^\n]*\n(?:Reading the configuration file, at line (\d+)\n>>> '([^\n]*)'\n)?([^\n]*)/);
    if (m) rec.fatal = { line: m[1] ? Number(m[1]) : null, text: m[2] ?? null, message: m[3].replaceAll(dir, "/parity") };
    else rec.exit = output.split("\n").filter((l) => / # /.test(l)).map((l) => l.replace(/^\d+:[A-Z] [^#]*# /, "").replaceAll(dir, "/parity")).filter((l) => !/oO0OoO0OoO0Oo|Redis version=|Configuration loaded|WARNING|Deprecation warning|may not work for non-privileged/.test(l)).slice(-2);
    rec.exitCode = exited;
    return rec;
  }
  rec.started = true;
  let sockPath = null;
  if (Object.values(c.files).some((t) => /^unixsocket /m.test(t))) {
    for (const p of sockGuesses) { const r = await talk({ path: p }, [["PING"]], 300); if (r[0] && !/^(refused|closed)/.test(r[0].head)) { sockPath = p; break; } }
  }
  if (!usesAclfile) {
    for (const o of [{ host: "127.0.0.1", port }, { host: REMOTE, port }, ...(sockPath ? [{ path: sockPath }] : [])]) {
      const r = await talk(o, [["AUTH", ADMIN, "admin-pw-parity"], ["CONFIG", "GET", "*"]]);
      const g = r[1];
      if (g && g.head === "*") {
        const v = {};
        for (let k = 0; k < g.items.length; k += 2) v[g.items[k].slice(1)] = g.items[k + 1].slice(1).replaceAll(dir, "/parity");
        rec.values = v;
        break;
      }
      if (g && /unknown command/.test(g.head)) { rec.values = "config-renamed"; break; }
    }
  }
  rec.remote = await probe({ host: REMOTE, port, localAddress: REMOTE });
  rec.local = await probe({ host: "127.0.0.1", port });
  if (sockPath) rec.socket = await probe({ path: sockPath });
  child.kill("SIGKILL");
  await new Promise((r) => (exited !== null ? r() : child.on("exit", r)));
  return rec;
}

const server = execFileSync("redis-server", ["--version"], { encoding: "utf8" }).trim();
const cases = [];
for (let s = 1; s <= COUNT; s++) {
  cases.push(await runCase(s, 21000 + (s % 2000)));
  if (s % 100 === 0) process.stderr.write(`${s} cases\n`);
}
process.stdout.write(JSON.stringify({ server, remote: REMOTE, hostAddrs: ["127.0.0.1", REMOTE], cases }) + "\n");
