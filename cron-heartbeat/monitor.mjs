// Heartbeat monitor core: config + persisted state in, alerts out. Separate from
// the HTTP shell (server.mjs) so the alert rules are testable without sockets.
import { evaluate, parseCron, checkTimezone } from "./cron.mjs";

const HISTORY_MAX = 50;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("config must be an object of slug -> check");
  const out = {};
  for (const [slug, raw] of Object.entries(config)) {
    if (!SLUG.test(slug)) throw new Error(`bad check name "${slug}": use lowercase letters, digits, - and _`);
    const c = raw || {};
    if (!c.schedule && !c.periodSeconds) throw new Error(`${slug}: set "schedule" (cron) or "periodSeconds"`);
    if (c.tz !== undefined && !c.schedule) throw new Error(`${slug}: "tz" only applies to a cron "schedule"`);
    if (c.schedule) parseCron(c.schedule, c.tz);
    if (c.periodSeconds !== undefined && !(Number(c.periodSeconds) >= 10)) throw new Error(`${slug}: periodSeconds must be at least 10`);
    if (c.graceSeconds !== undefined && !(Number(c.graceSeconds) >= 0)) throw new Error(`${slug}: graceSeconds must be 0 or more`);
    out[slug] = {
      schedule: c.schedule || null,
      tz: c.tz && String(c.tz).toUpperCase() !== "UTC" ? checkTimezone(c.tz) : null,
      periodSeconds: c.periodSeconds ? Number(c.periodSeconds) : null,
      graceSeconds: c.graceSeconds !== undefined ? Number(c.graceSeconds) : 300,
      paused: Boolean(c.paused),
    };
  }
  return out;
}

export function createMonitor({ config, state = {}, notify = async () => {} }) {
  const checks = validateConfig(config);
  const st = state;
  const view = (slug, now) => {
    const rec = st[slug] || {};
    return { ...checks[slug], paused: rec.paused ?? checks[slug].paused, createdAt: rec.createdAt ?? now, lastPing: rec.lastPing, lastStart: rec.lastStart, lastFail: rec.lastFail };
  };

  function ensure(slug, now) {
    if (!st[slug]) st[slug] = { createdAt: now, lastAlert: "new", pings: 0 };
    return st[slug];
  }

  /** kind: "success" | "start" | "fail". Returns false for an unknown check. */
  function ping(slug, kind, now) {
    if (!checks[slug]) return false;
    const rec = ensure(slug, now);
    const h = (rec.history ||= []);
    h.push({ t: now, kind });
    if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
    if (kind === "start") rec.lastStart = now;
    else if (kind === "fail") rec.lastFail = now;
    else { rec.lastPing = now; rec.pings = (rec.pings || 0) + 1; }
    return true;
  }

  /** Pause or resume one check at runtime (maintenance window). Returns false for an unknown check.
   * Resuming restarts the clock, so a long pause never raises an alert for the time it was off. */
  function setPaused(slug, paused, now) {
    if (!checks[slug]) return false;
    const rec = ensure(slug, now);
    rec.paused = Boolean(paused);
    if (!paused) { rec.createdAt = now; delete rec.lastPing; delete rec.lastStart; delete rec.lastFail; rec.lastAlert = "new"; }
    const h = (rec.history ||= []);
    h.push({ t: now, kind: paused ? "paused" : "resumed" });
    if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
    return true;
  }

  function logEvent(rec, now, kind) {
    const h = (rec.history ||= []);
    h.push({ t: now, kind: `alert:${kind}` });
    if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
  }

  /** Recent pings and alerts for one check, newest first; null for an unknown check. */
  function history(slug) {
    if (!checks[slug]) return null;
    return [...((st[slug] || {}).history || [])].reverse();
  }

  async function tick(now) {
    const sent = [];
    for (const slug of Object.keys(checks)) {
      const rec = ensure(slug, now);
      const r = evaluate(view(slug, now), now);
      const bad = r.state === "down" || r.state === "failed";
      const wasBad = rec.lastAlert === "down" || rec.lastAlert === "failed";
      if (bad && rec.lastAlert !== r.state) {
        const msg = { slug, state: r.state, text: `[cron-heartbeat] ${slug} is ${r.state.toUpperCase()}: ${r.reason}`, at: now };
        sent.push(msg); rec.lastAlert = r.state; logEvent(rec, now, r.state);
        try { await notify(msg); } catch (e) { rec.lastAlert = "new"; rec.notifyError = String(e.message || e); }
      } else if (!bad && wasBad && (r.state === "up" || r.state === "running" || r.state === "late")) {
        const msg = { slug, state: "recovered", text: `[cron-heartbeat] ${slug} recovered`, at: now };
        sent.push(msg); rec.lastAlert = "up"; logEvent(rec, now, "recovered");
        try { await notify(msg); } catch (e) { rec.notifyError = String(e.message || e); }
      } else if (!bad) rec.lastAlert = rec.lastAlert === "new" && r.state === "new" ? "new" : r.state;
    }
    return sent;
  }

  function status(now) {
    return Object.keys(checks).map((slug) => {
      const r = evaluate(view(slug, now), now);
      const rec = st[slug] || {};
      return { slug, state: r.state, reason: r.reason, dueAt: r.dueAt, lastPing: rec.lastPing ?? null, pings: rec.pings || 0 };
    });
  }

  return { ping, setPaused, tick, status, history, state: st, checks };
}
