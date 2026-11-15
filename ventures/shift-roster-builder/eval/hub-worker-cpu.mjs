// How much CPU each team-hub request costs on the Worker's code path (hub-worker.mjs), against a full roster build.
// A free Cloudflare Worker gets about 10 ms of CPU a request (as the README says; not re-read from Cloudflare's docs
// in the session that wrote this). Node wall time on one core stands in for CPU time; the
// first call of each kind warms the JIT and is not counted (a Worker isolate stays warm across requests too).
//   node eval/hub-worker-cpu.mjs > eval/hub-worker-cpu.out.txt
import worker, { RosterHub } from "../hub-worker.mjs";
import { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts, TEMPLATES } from "../calc.mjs";

const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
function boot() {
  const storage = new Map();
  let obj;
  const ns = { idFromName: (n) => n, get: () => obj };
  const env = { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", HUB: ns };
  obj = new RosterHub({ storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); } }, blockConcurrencyWhile: (f) => f() }, env);
  const call = (path, init) => worker.fetch(new Request("https://h.example" + path, init), env);
  return { call, post: (p, b) => call(p, { method: "POST", body: new URLSearchParams(b), redirect: "manual" }) };
}
async function time(fn, n = 9) { await fn(); const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); await fn(); xs.push(performance.now() - t); } return median(xs); }

const weeks = [["sample week", sampleStaff(), sampleShifts()], ...Object.entries(TEMPLATES).filter(([k]) => k !== "cafe").map(([k, t]) => [k, t.staff(), t.shifts()])];
console.log("week | shifts | full build (ms) | publish from browser roster | admin page, 1 call-out + 1 trade | staff page | call-out POST");
for (const [name, staff, shifts] of weeks) {
  const st = parseStaff(staff).staff, sl = parseShifts(shifts).slots;
  if (!sl.length || !st.length) continue;
  const build = await time(() => buildRoster(st, sl, { memo: false }), 3);
  const owner = buildRoster(st, sl).owner;
  const w = boot();
  // The Worker never runs buildRoster; memo is off above so the build column is a real search.
  const pub = await time(() => w.post("/admin/save?key=adm", { act: "publish", weekStart: "2026-11-16", staff, shifts, owner: JSON.stringify(owner) }));
  const ver = (await (await w.call("/team?t=tm")).text());
  const opts = [...ver.matchAll(/<select name="shift" required>(.*?)<\/select>/gs)][0];
  const first = opts ? opts[1].match(/value="([^"]+)"/)[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&") : null;
  const mineSel = ver.match(/<select name="mine" required>(.*?)<\/select>/s);
  const vals = mineSel ? [...mineSel[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]) : [];
  const other = vals.find((v) => v.split("|")[0] !== (first || "").split("|")[0]);
  const co = first ? await time(() => w.post("/team/callout?t=tm", { shift: first }), 3) : NaN;
  if (first && other) await w.post("/team/trade?t=tm", { mine: first, theirs: other });
  const admin = await time(() => w.call("/admin?key=adm"));
  const team = await time(() => w.call("/team?t=tm"));
  console.log(`${name} | ${sl.length} | ${build.toFixed(0)} | ${pub.toFixed(1)} | ${admin.toFixed(1)} | ${team.toFixed(1)} | ${co.toFixed(1)}`);
}
