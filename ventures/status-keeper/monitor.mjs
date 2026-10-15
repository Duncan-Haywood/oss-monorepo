// Pure logic for status-keeper: no node: imports, so the browser page can use it too.
export const DEFAULTS = { intervalSec: 60, failAfter: 2, timeoutMs: 10_000, graceSec: 60 };
export const KEEP_DAYS = 90;
const RECENT = 60, MAX_INCIDENTS = 200;
export const IMPACTS = ["minor", "major"];
export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"];

export const newState = () => ({ v: 1, monitors: {}, incidents: [], maintenance: [] });
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

function mon(state, id) {
  return (state.monitors[id] ||= { id, status: "unknown", streakFail: 0, streakOk: 0, firstFailAt: null, lastCheckAt: null, lastMs: null, lastError: null, lastPingAt: null, days: {}, recent: [] });
}

export function inMaintenance(state, monitorId, now) {
  return state.maintenance.some((m) => m.startsAt <= now && now < m.endsAt && (!m.monitors.length || m.monitors.includes(monitorId)));
}

const openAutoIncident = (state, id) => state.incidents.find((i) => i.auto && !i.resolvedAt && i.monitors.includes(id));

function pushIncident(state, inc) {
  state.incidents.unshift(inc);
  if (state.incidents.length > MAX_INCIDENTS) state.incidents.length = MAX_INCIDENTS;
}

// Fold one check result into the state. Returns events for the caller to alert on.
// result: {ok:boolean, ms?:number, error?:string}
export function recordCheck(state, def, result, now) {
  const m = mon(state, def.id);
  const failAfter = def.failAfter ?? DEFAULTS.failAfter;
  const events = [];
  m.lastCheckAt = now;
  m.lastMs = result.ms ?? null;
  m.lastError = result.ok ? null : String(result.error || "check failed").slice(0, 200);
  const planned = inMaintenance(state, def.id, now);
  const d = (m.days[dayKey(now)] ||= { ok: 0, total: 0 });
  // A check during planned maintenance is not counted against uptime.
  if (!planned) { d.total++; if (result.ok) d.ok++; }
  m.recent.push({ at: now, ok: result.ok, ms: result.ms ?? null });
  if (m.recent.length > RECENT) m.recent.splice(0, m.recent.length - RECENT);
  for (const k of Object.keys(m.days).sort().slice(0, -KEEP_DAYS)) delete m.days[k];

  if (result.ok) {
    m.streakFail = 0; m.streakOk++; m.firstFailAt = null;
    if (m.status === "down") {
      const inc = openAutoIncident(state, def.id);
      if (inc) { inc.status = "resolved"; inc.resolvedAt = now; inc.updates.push({ at: now, status: "resolved", message: "Checks are passing again." }); events.push({ type: "recovered", monitor: def, incident: inc, downMs: now - inc.startedAt }); }
    }
    m.status = "up";
  } else {
    if (!m.streakFail) m.firstFailAt = now;
    m.streakFail++; m.streakOk = 0;
    if (m.streakFail >= failAfter && m.status !== "down" && !planned) {
      m.status = "down";
      const inc = { id: `inc_${now.toString(36)}_${def.id}`, monitors: [def.id], title: `${def.name || def.id} is not responding`, impact: "major", status: "investigating", auto: true, startedAt: m.firstFailAt, resolvedAt: null, updates: [{ at: now, status: "investigating", message: `${m.streakFail} checks in a row failed: ${m.lastError}` }] };
      pushIncident(state, inc);
      events.push({ type: "down", monitor: def, incident: inc });
    }
  }
  return events;
}

// Push (heartbeat) monitors: a ping must arrive within every intervalSec + graceSec.
export function recordPing(state, def, now) {
  mon(state, def.id).lastPingAt = now;
}
export function pushResult(state, def, now) {
  const m = mon(state, def.id);
  if (m.lastPingAt === null) return { ok: false, error: "no ping received yet" };
  const window = ((def.intervalSec ?? DEFAULTS.intervalSec) + (def.graceSec ?? DEFAULTS.graceSec)) * 1000;
  return now - m.lastPingAt <= window ? { ok: true } : { ok: false, error: `no ping for ${Math.round((now - m.lastPingAt) / 1000)}s` };
}

export function createIncident(state, { title, impact = "minor", message = "", monitors = [], now }) {
  if (!title || !String(title).trim()) throw new Error("title required");
  if (!IMPACTS.includes(impact)) throw new Error(`impact must be one of ${IMPACTS.join(", ")}`);
  const inc = { id: `inc_${now.toString(36)}_m${state.incidents.length}`, monitors, title: String(title).slice(0, 140), impact, status: "investigating", auto: false, startedAt: now, resolvedAt: null, updates: [{ at: now, status: "investigating", message: String(message).slice(0, 2000) }] };
  pushIncident(state, inc);
  return inc;
}

export function addUpdate(state, id, { status, message = "", now }) {
  const inc = state.incidents.find((i) => i.id === id);
  if (!inc) throw Object.assign(new Error("no such incident"), { status: 404 });
  if (!INCIDENT_STATUSES.includes(status)) throw new Error(`status must be one of ${INCIDENT_STATUSES.join(", ")}`);
  inc.status = status;
  inc.updates.push({ at: now, status, message: String(message).slice(0, 2000) });
  inc.resolvedAt = status === "resolved" ? now : null;
  return inc;
}

export function scheduleMaintenance(state, { title, startsAt, endsAt, monitors = [] }) {
  if (!title || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new Error("title, startsAt and a later endsAt (epoch ms) required");
  const m = { id: `mnt_${startsAt.toString(36)}`, title: String(title).slice(0, 140), startsAt, endsAt, monitors };
  state.maintenance.push(m);
  state.maintenance = state.maintenance.slice(-50);
  return m;
}

export function uptimePct(m, days, now) {
  if (!m) return null;
  let ok = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const d = m.days[dayKey(now - i * 86_400_000)];
    if (d) { ok += d.ok; total += d.total; }
  }
  return total ? (ok / total) * 100 : null;
}

export const fmtPct = (p) => (p === null ? "n/a" : p >= 99.995 ? "100%" : `${(Math.floor(p * 100) / 100).toFixed(2)}%`);

// Bars for the last n days, oldest first.
export function dayBars(m, n, now) {
  return Array.from({ length: n }, (_, k) => {
    const date = dayKey(now - (n - 1 - k) * 86_400_000);
    const d = m?.days[date];
    const pct = d && d.total ? (d.ok / d.total) * 100 : null;
    return { date, pct, level: pct === null ? "none" : pct >= 99.9 ? "ok" : pct >= 95 ? "minor" : "major" };
  });
}

export function overall(state, defs, now) {
  const live = defs.filter((d) => !inMaintenance(state, d.id, now));
  if (defs.length && !live.length) return "maintenance";
  const down = live.filter((d) => state.monitors[d.id]?.status === "down").length;
  if (down && down === live.length) return "major_outage";
  if (down) return "partial_outage";
  const open = state.incidents.filter((i) => !i.resolvedAt && !i.auto);
  if (open.some((i) => i.impact === "major")) return "partial_outage";
  if (open.length) return "degraded";
  if (defs.length && live.every((d) => (state.monitors[d.id]?.status ?? "unknown") === "unknown")) return "unknown";
  return "operational";
}

export const LABELS = { operational: "All systems operational", degraded: "Degraded performance", partial_outage: "Partial outage", major_outage: "Major outage", maintenance: "Scheduled maintenance", unknown: "Waiting for the first checks" };
export const COLORS = { operational: "#1a7f37", degraded: "#9a6700", partial_outage: "#c2410c", major_outage: "#cf222e", maintenance: "#0969da", unknown: "#6e7781" };

// How much downtime an availability target allows, in seconds.
export function allowedDowntimeSec(targetPct, periodDays) {
  if (!(targetPct > 0 && targetPct <= 100) || !(periodDays > 0)) return null;
  return (1 - targetPct / 100) * periodDays * 86400;
}
export function humanDuration(sec) {
  if (sec === null) return "n/a";
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
