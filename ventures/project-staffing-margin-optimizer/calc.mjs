// Project staffing margin optimizer: who should work on which project, to earn the most margin.
// Exact: a transportation problem solved by min-cost flow (successive shortest paths), in quarter-hour units.

export const MAX_PEOPLE = 20;
export const MAX_PROJECTS = 20;
export const UNIT = 4; // flow units per hour (15 minutes)

export const SHARED_DEFAULTS = { minMarginPct: "0", extraHours: "10" };
export const PERSON_DEFAULTS = { name: "", cost: "", hours: "", skills: "" };
export const PROJECT_DEFAULTS = { name: "", rate: "", hours: "", skill: "" };

export const EXAMPLE_SHARED = { minMarginPct: "20", extraHours: "10" };
export const EXAMPLE_PEOPLE = [
  { name: "Ana", cost: "62", hours: "120", skills: "design, frontend" },
  { name: "Ben", cost: "75", hours: "140", skills: "frontend, backend" },
  { name: "Chloe", cost: "90", hours: "100", skills: "backend, data" },
  { name: "Dev", cost: "55", hours: "160", skills: "frontend" },
  { name: "Elif", cost: "110", hours: "80", skills: "data, strategy" },
];
export const EXAMPLE_PROJECTS = [
  { name: "Acme redesign", rate: "140", hours: "150", skill: "design" },
  { name: "Northwind portal", rate: "125", hours: "220", skill: "frontend" },
  { name: "Globex API", rate: "150", hours: "180", skill: "backend" },
  { name: "Initech dashboards", rate: "170", hours: "120", skill: "data" },
  { name: "Umbrella retainer", rate: "85", hours: "100", skill: "frontend" },
  { name: "Hooli audit", rate: "200", hours: "40", skill: "strategy" },
];

export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const hoursFmt = (n) => (Math.round(n * 100) / 100).toLocaleString("en-US") + " h";

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const skillList = (s) => String(s || "").split(/[,;/]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

// Maximise total margin. nodes: 0 source, 1..P people, P+1..P+J projects, P+J+1 sink.
function solveFlow(people, projects, ok, minPct) {
  const P = people.length, J = projects.length, S = 0, T = P + J + 1, V = T + 1;
  const edges = [], adj = Array.from({ length: V }, () => []);
  const add = (u, v, cap, cost) => {
    adj[u].push(edges.length); edges.push({ u, v, cap, cost, flow: 0 });
    adj[v].push(edges.length); edges.push({ u: v, v: u, cap: 0, cost: -cost, flow: 0 });
  };
  for (let i = 0; i < P; i++) add(S, 1 + i, Math.round(people[i].hours * UNIT), 0);
  for (let j = 0; j < J; j++) add(1 + P + j, T, Math.round(projects[j].hours * UNIT), 0);
  const BIG = 1e9, pairEdge = new Map();
  for (let i = 0; i < P; i++) for (let j = 0; j < J; j++) {
    if (!ok[i][j]) continue;
    const margin = projects[j].rate - people[i].cost;
    if (margin <= 0 || margin < (minPct / 100) * projects[j].rate - 1e-9) continue;
    pairEdge.set(i * J + j, edges.length);
    add(1 + i, 1 + P + j, BIG, -margin);
  }
  for (;;) {
    const dist = new Array(V).fill(Infinity), prev = new Array(V).fill(-1), inQ = new Array(V).fill(false);
    dist[S] = 0;
    const q = [S];
    while (q.length) {
      const u = q.shift(); inQ[u] = false;
      for (const id of adj[u]) {
        const e = edges[id];
        if (e.cap - e.flow > 0 && dist[u] + e.cost < dist[e.v] - 1e-9) {
          dist[e.v] = dist[u] + e.cost; prev[e.v] = id;
          if (!inQ[e.v]) { inQ[e.v] = true; q.push(e.v); }
        }
      }
    }
    if (!(dist[T] < -1e-9)) break;
    let f = Infinity;
    for (let v = T; v !== S; v = edges[prev[v]].u) f = Math.min(f, edges[prev[v]].cap - edges[prev[v]].flow);
    for (let v = T; v !== S; v = edges[prev[v]].u) { edges[prev[v]].flow += f; edges[prev[v] ^ 1].flow -= f; }
  }
  const x = Array.from({ length: P }, () => new Array(J).fill(0));
  let margin = 0;
  for (const [key, id] of pairEdge) {
    const i = Math.floor(key / J), j = key % J, h = edges[id].flow / UNIT;
    x[i][j] = h; margin += h * (projects[j].rate - people[i].cost);
  }
  return { x, margin };
}

export function analyze(rawPeople, rawProjects, shared = {}) {
  const warnings = [];
  const people = [], projects = [];
  rawPeople.forEach((r, k) => {
    const hasAny = r.name || r.cost || r.hours || r.skills;
    if (!hasAny) return;
    const cost = num(r.cost), hours = num(r.hours);
    if (!(cost >= 0) || !(hours > 0) || !skillList(r.skills).length) { warnings.push(`Person ${k + 1} (${r.name || "unnamed"}) needs a cost per hour, hours available and at least one skill, so it was left out.`); return; }
    people.push({ name: r.name || `Person ${k + 1}`, cost, hours, skills: skillList(r.skills) });
  });
  rawProjects.forEach((r, k) => {
    const hasAny = r.name || r.rate || r.hours || r.skill;
    if (!hasAny) return;
    const rate = num(r.rate), hours = num(r.hours);
    if (!(rate > 0) || !(hours > 0) || !skillList(r.skill).length) { warnings.push(`Project ${k + 1} (${r.name || "unnamed"}) needs a bill rate, hours to staff and a required skill, so it was left out.`); return; }
    projects.push({ name: r.name || `Project ${k + 1}`, rate, hours, skills: skillList(r.skill) });
  });
  if (people.length > MAX_PEOPLE) { people.length = MAX_PEOPLE; warnings.push(`Only the first ${MAX_PEOPLE} people were used.`); }
  if (projects.length > MAX_PROJECTS) { projects.length = MAX_PROJECTS; warnings.push(`Only the first ${MAX_PROJECTS} projects were used.`); }
  if (!people.length || !projects.length) { warnings.push("Enter at least one person and one project."); return { ok: false, warnings }; }
  const minPct = Math.min(95, Math.max(0, num(shared.minMarginPct) || 0));
  const extra = Math.max(1, num(shared.extraHours) || 10);
  const ok = people.map((p) => projects.map((j) => j.skills.some((s) => p.skills.includes(s))));
  const base = solveFlow(people, projects, ok, minPct);

  const assignments = [];
  base.x.forEach((row, i) => row.forEach((h, j) => {
    if (h > 0) assignments.push({ person: people[i].name, project: projects[j].name, hours: h, rate: projects[j].rate, cost: people[i].cost, revenue: h * projects[j].rate, margin: h * (projects[j].rate - people[i].cost) });
  }));
  assignments.sort((a, b) => b.margin - a.margin);
  const revenue = assignments.reduce((s, a) => s + a.revenue, 0);
  const cost = assignments.reduce((s, a) => s + a.hours * a.cost, 0);

  const perPerson = people.map((p, i) => {
    const used = base.x[i].reduce((s, h) => s + h, 0);
    const bumped = people.map((q, k) => (k === i ? { ...q, hours: q.hours + extra } : q));
    const gain = (solveFlow(bumped, projects, ok, minPct).margin - base.margin) / extra;
    return { name: p.name, hours: p.hours, used, idle: p.hours - used, utilisation: used / p.hours, extraHourValue: gain };
  });
  const perProject = projects.map((j, k) => {
    const filled = base.x.reduce((s, row) => s + row[k], 0);
    const qualified = people.filter((_, i) => ok[i][k]);
    let why = "";
    if (filled < j.hours - 1e-9) {
      if (!qualified.length) why = "nobody has this skill";
      else {
        const cheapest = Math.min(...qualified.map((p) => p.cost));
        if (cheapest >= j.rate) why = "the bill rate is at or below the cost of everyone qualified";
        else if (j.rate - cheapest < (minPct / 100) * j.rate) why = "no qualified person clears your minimum margin";
        else why = "the people who could do it are better used on higher-margin work";
      }
    }
    return { name: j.name, hours: j.hours, filled, unfilled: j.hours - filled, why, rate: j.rate, skills: j.skills };
  });
  return {
    ok: true, warnings, assignments, perPerson, perProject, minPct, extra,
    revenue, cost, margin: base.margin, marginPct: revenue > 0 ? base.margin / revenue : 0,
    hoursStaffed: assignments.reduce((s, a) => s + a.hours, 0),
    hoursOpen: perProject.reduce((s, p) => s + p.unfilled, 0),
    idleHours: perPerson.reduce((s, p) => s + p.idle, 0),
    people, projects,
  };
}

export function toCsv(a) {
  const esc = (s) => /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s);
  const rows = [["person", "project", "hours", "bill_rate", "cost_rate", "revenue", "margin"]];
  for (const r of a.assignments) rows.push([r.person, r.project, r.hours, r.rate, r.cost, r.revenue.toFixed(2), r.margin.toFixed(2)]);
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
