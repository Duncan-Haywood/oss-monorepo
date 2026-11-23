// Replays each recorded case through the engine and lists every place the
// engine and the real server disagree.
import { scan, normalize } from "../scan.mjs";
import { makeCase } from "./gen.mjs";

const ROOT = "/parity";
const PORT = (seed) => 21000 + (seed % 2000);

export function resolverFor(c) {
  const files = new Map(), dirs = new Set([ROOT]);
  for (const d of c.dirs) dirs.add(`${ROOT}/${d}`);
  for (const [n, t] of Object.entries(c.files)) files.set(normalize(`${ROOT}/${n}`), t.replaceAll("__PORT__", String(PORT(c.seed))).replaceAll("__DIR__", ROOT));
  return {
    read: (p) => files.get(normalize(p)) ?? null,
    listDir: (d) => {
      const nd = normalize(d), out = new Set();
      for (const p of [...files.keys(), ...dirs]) { const i = p.lastIndexOf("/"); if (p.slice(0, i) === nd) out.add(p.slice(i + 1)); }
      return [...out];
    },
    isDir: (p) => dirs.has(normalize(p)),
    unknown: () => false,
  };
}

export function engineFor(seed, hostAddrs) {
  const c = makeCase(seed);
  // Ubuntu's redis-server links the system jemalloc: no active defrag.
  return scan({ resolver: resolverFor(c), main: `${ROOT}/redis.conf`, cwd: ROOT, hostAddrs, build: { defrag: false } });
}

const covers = (bind, addr) => bind.some((b) => { const a = b.replace(/^-/, ""); return a === "*" || a === "0.0.0.0" || a === addr; });

// Values the engine does not model, or that the runner itself changes.
const SKIP_VALUES = new Set(["proc-title-template", "pidfile"]);

export function compare(rec) {
  const diffs = [];
  let values = 0, probes = 0;
  for (const r of rec.cases) {
    const e = engineFor(r.seed, rec.hostAddrs);
    const d = (what, engine, redis) => diffs.push({ seed: r.seed, what, engine, redis });
    if (r.started !== e.startup.ok) { d("starts", e.startup, r.fatal || r.exit); continue; }
    if (!r.started) {
      if (r.fatal) {
        if (e.startup.stage !== "config") { d("stage", e.startup, r.fatal); continue; }
        if (e.startup.message !== r.fatal.message) d("message", e.startup.message, r.fatal.message);
        if ((e.startup.redisLine ?? null) !== r.fatal.line) d("line", e.startup.redisLine, r.fatal.line);
      } else {
        const got = r.exit.join(" | ");
        const key = e.startup.message.split(".")[0].slice(0, 40);
        // A missing include is logged and exits, outside the FATAL CONFIG block.
        const stageOk = e.startup.stage === "startup" || /can't open config file/.test(e.startup.message);
        if (!stageOk || !got.includes(e.startup.stage === "startup" ? key : e.startup.message)) d("exit", e.startup.message, got);
      }
      continue;
    }
    if (r.values && typeof r.values === "object") {
      for (const [k, v] of Object.entries(r.values)) {
        if (SKIP_VALUES.has(k)) continue;
        values++;
        if (!(k in e.values)) { d(`value ${k}`, undefined, v); continue; }
        if (String(e.values[k]) !== v) d(`value ${k}`, e.values[k], v);
      }
    }
    const x = e.exposure;
    const check = (label, engineSide, got, reachable) => {
      if (!got) return;
      probes++;
      const want = !reachable ? { ping: "refused" } : engineSide.outcome === "open" ? { ping: "ok", configSetDir: engineSide.configSetDir, debug: engineSide.debug, moduleLoad: engineSide.moduleLoad } : { ping: engineSide.outcome === "unknown" ? "?" : engineSide.ping || engineSide.outcome };
      if (JSON.stringify(want) !== JSON.stringify(got)) d(label, want, got);
    };
    const tcp = x.port > 0;
    check("remote", x.remote.outcome === "refused" ? x.remote : x.remote, r.remote, tcp && covers(x.bind, rec.remote) && x.remote.outcome !== "refused" || (tcp && covers(x.bind, rec.remote)));
    check("local", x.local, r.local, tcp && covers(x.bind, "127.0.0.1") && x.local.outcome !== "refused");
    if (r.socket) check("socket", x.socket, r.socket, true);
  }
  return { cases: rec.cases.length, values, probes, diffs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const rec = JSON.parse(readFileSync(process.argv[2] || new URL("./redis-7.0.json", import.meta.url), "utf8"));
  const res = compare(rec);
  console.log(`${res.cases} cases, ${res.values} values, ${res.probes} probes, ${res.diffs.length} differences`);
  for (const x of res.diffs.slice(0, Number(process.argv[3] || 40))) console.log(JSON.stringify(x));
}
