// Server-rendered public pages: HTML status page, JSON, Atom feed, SVG badge. No browser JS needed.
import { overall, LABELS, COLORS, uptimePct, fmtPct, dayBars, inMaintenance } from "./monitor.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (ms) => new Date(ms).toISOString();
const LEVEL_COLOR = { ok: "#2da44e", minor: "#bf8700", major: "#cf222e", none: "#d0d7de" };

export function statusJson(state, defs, cfg, now) {
  const st = overall(state, defs, now);
  return {
    page: { name: cfg.title, updatedAt: iso(now) },
    status: { indicator: st, description: LABELS[st] },
    components: defs.map((d) => {
      const m = state.monitors[d.id];
      return { id: d.id, name: d.name || d.id, status: inMaintenance(state, d.id, now) ? "maintenance" : m?.status ?? "unknown", uptime30d: uptimePct(m, 30, now), uptime90d: uptimePct(m, 90, now), responseMs: m?.lastMs ?? null };
    }),
    incidents: state.incidents.slice(0, 20).map((i) => ({ id: i.id, title: i.title, status: i.status, impact: i.impact, startedAt: iso(i.startedAt), resolvedAt: i.resolvedAt ? iso(i.resolvedAt) : null, updates: i.updates.map((u) => ({ at: iso(u.at), status: u.status, message: u.message })) })),
    maintenance: state.maintenance.filter((m) => m.endsAt > now).map((m) => ({ id: m.id, title: m.title, startsAt: iso(m.startsAt), endsAt: iso(m.endsAt) })),
  };
}

export function badgeSvg(label, value, color) {
  const w1 = 6 * label.length + 14, w2 = 6 * value.length + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w1 + w2}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}"><rect width="${w1}" height="20" fill="#555"/><rect x="${w1}" width="${w2}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="${w1 / 2}" y="14">${esc(label)}</text><text x="${w1 + w2 / 2}" y="14">${esc(value)}</text></g></svg>`;
}

export function atomFeed(state, cfg, now) {
  const entries = state.incidents.slice(0, 30).map((i) => {
    const last = i.updates[i.updates.length - 1];
    return `<entry><id>${esc(cfg.publicUrl)}#${esc(i.id)}</id><title>${esc(`[${i.status}] ${i.title}`)}</title><updated>${iso(last.at)}</updated><published>${iso(i.startedAt)}</published><content type="text">${esc(i.updates.map((u) => `${iso(u.at)} ${u.status}: ${u.message}`).join("\n"))}</content></entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${esc(cfg.publicUrl)}</id><title>${esc(cfg.title)} incidents</title><updated>${iso(state.incidents[0] ? state.incidents[0].updates.at(-1).at : now)}</updated><link href="${esc(cfg.publicUrl)}"/>${entries.join("")}</feed>`;
}

const SHELL_CSS = ":root{font:16px system-ui,sans-serif;color:#1f2328;background:#f6f8fa}body{max-width:560px;margin:auto;padding:24px}button,input{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid #8c959f}button{background:#0969da;color:#fff;border-color:#0969da;cursor:pointer}a{color:#0550ae}";
export function messagePage(cfg, title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} - ${esc(cfg.title)}</title><style>${SHELL_CSS}</style></head><body><h1>${esc(title)}</h1>${bodyHtml}<p><a href="/">Back to ${esc(cfg.title)} status</a></p></body></html>`;
}

export function statusPage(state, defs, cfg, now) {
  const st = overall(state, defs, now);
  const rows = defs.map((d) => {
    const m = state.monitors[d.id];
    const status = inMaintenance(state, d.id, now) ? "maintenance" : m?.status ?? "unknown";
    const bars = dayBars(m, 90, now).map((b) => `<i title="${esc(b.date)}: ${b.pct === null ? "no data" : fmtPct(b.pct)}" style="background:${LEVEL_COLOR[b.level]}"></i>`).join("");
    const word = { up: "Operational", down: "Down", maintenance: "Maintenance", unknown: "Pending" }[status];
    return `<section class="c"><div class="h"><strong>${esc(d.name || d.id)}</strong><span style="color:${status === "up" ? COLORS.operational : status === "down" ? COLORS.major_outage : status === "maintenance" ? COLORS.maintenance : COLORS.unknown}">${word}</span></div><div class="bars" role="img" aria-label="Last 90 days of uptime">${bars}</div><div class="f"><span>90 days ago</span><span>${fmtPct(uptimePct(m, 90, now))} uptime</span><span>Today</span></div></section>`;
  }).join("");
  const upcoming = state.maintenance.filter((m) => m.endsAt > now).map((m) => `<p class="m"><strong>${esc(m.title)}</strong><br>${iso(m.startsAt)} to ${iso(m.endsAt)}</p>`).join("");
  const incidents = state.incidents.slice(0, 15).map((i) => `<article class="i"><h3>${esc(i.title)} <small>${esc(i.status)}</small></h3>${[...i.updates].reverse().map((u) => `<p><strong>${esc(u.status)}</strong> <time>${iso(u.at)}</time><br>${esc(u.message)}</p>`).join("")}</article>`).join("") || "<p>No incidents reported.</p>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cfg.title)} status</title><meta name="description" content="${esc(LABELS[st])} - live status and 90-day uptime for ${esc(cfg.title)}."><link rel="alternate" type="application/atom+xml" href="/feed.xml"><style>:root{font:16px system-ui,sans-serif;color:#1f2328;background:#f6f8fa}body{max-width:760px;margin:auto;padding:24px}h1{font-size:1.5rem}.banner{background:${COLORS[st]};color:#fff;padding:18px;border-radius:10px;font-size:1.2rem;font-weight:700;margin:16px 0}.c,.i,.m{background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:14px;margin:12px 0}.h{display:flex;justify-content:space-between}.bars{display:flex;gap:2px;height:30px;margin:10px 0 4px}.bars i{flex:1;border-radius:2px}.f{display:flex;justify-content:space-between;font-size:.8rem;color:#57606a}h3 small{font-weight:400;color:#57606a}time{color:#57606a;font-size:.85rem}form.sub{background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:14px;margin:12px 0}form.sub input[type=email]{min-width:16em}button{background:#0969da;color:#fff;border:1px solid #0969da;border-radius:6px;padding:8px 12px;font:inherit;cursor:pointer}footer{font-size:.8rem;color:#57606a;margin-top:28px}</style></head><body><h1>${esc(cfg.title)}</h1><div class="banner" role="status">${esc(LABELS[st])}</div>${rows}${upcoming ? `<h2>Scheduled maintenance</h2>${upcoming}` : ""}<h2>Incidents</h2>${incidents}${cfg.emailEnabled ? `<form class="sub" method="post" action="/subscribe"><h2>Get updates by email</h2><label for="se">Email address</label> <input id="se" name="email" type="email" required autocomplete="email"> <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"> <button type="submit">Subscribe</button><p><small>You get a confirmation email first. Incident and maintenance notices only; one-click unsubscribe in every email.</small></p></form>` : ""}<footer>Updated ${iso(now)} &middot; <a href="/feed.xml">Atom feed</a> &middot; <a href="/api/status.json">JSON</a> &middot; Powered by <a href="https://github.com/Duncan-Haywood/fp-monorepo/tree/main/ventures/status-keeper">status-keeper</a> (free, MIT; no uptime guarantee)</footer></body></html>`;
}
