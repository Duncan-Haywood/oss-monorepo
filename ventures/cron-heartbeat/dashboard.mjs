// HTML for the dashboard (private, needs the key) and the public status page.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const COLOR = { up: "#1a7f37", running: "#0969da", late: "#9a6700", new: "#6e7781", paused: "#6e7781", down: "#cf222e", failed: "#cf222e" };
const ago = (ms, now) => {
  if (ms == null) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1f2328;background:#fff}@media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}td,th{border-color:#30363d!important}}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.5rem;border-bottom:1px solid #d0d7de}.dot{display:inline-block;width:.7rem;height:.7rem;border-radius:50%;margin-right:.4rem}small{opacity:.7}</style></head><body>${body}</body></html>`;

export function dashboardHtml(rows, now, { channels = [] } = {}) {
  const bad = rows.filter((r) => r.state === "down" || r.state === "failed").length;
  const trs = rows.map((r) => `<tr><td><span class="dot" style="background:${COLOR[r.state] || "#6e7781"}"></span><b>${esc(r.slug)}</b></td><td>${esc(r.state)}<br><small>${esc(r.reason)}</small></td><td>${esc(ago(r.lastPing, now))}<br><small>${r.pings} pings</small></td></tr>`).join("");
  return page("cron-heartbeat", `<h1>cron-heartbeat</h1><p>${bad ? `<b style="color:#cf222e">${bad} check${bad > 1 ? "s" : ""} need attention.</b>` : "All checks healthy."} <small>Alerts: ${channels.length ? esc(channels.join(", ")) : "none configured (set one in the environment)"}</small></p><table><tr><th>Check</th><th>State</th><th>Last ping</th></tr>${trs || '<tr><td colspan="3">No checks configured.</td></tr>'}</table>`);
}

/** Public page: names and up/down only, never reasons, keys or timings. */
export function publicStatusHtml(rows, title = "Status") {
  const bad = rows.filter((r) => r.state === "down" || r.state === "failed").length;
  const trs = rows.map((r) => { const ok = r.state !== "down" && r.state !== "failed"; return `<tr><td><span class="dot" style="background:${ok ? COLOR.up : COLOR.down}"></span>${esc(r.slug)}</td><td>${ok ? "Operational" : "Disruption"}</td></tr>`; }).join("");
  return page(title, `<h1>${esc(title)}</h1><p><b>${bad ? "Some systems are having problems." : "All systems operational."}</b></p><table>${trs}</table>`);
}

/** Shields-style SVG badge for one check: name + Operational/Disruption/Paused. Same disclosure as /s. */
export function badgeSvg(slug, state) {
  const bad = state === "down" || state === "failed";
  const label = bad ? "disruption" : state === "paused" ? "paused" : "operational";
  const color = bad ? COLOR.down : state === "paused" ? COLOR.paused : COLOR.up;
  const w1 = 12 + slug.length * 7, w2 = 12 + label.length * 7, w = w1 + w2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(slug)}: ${label}"><rect width="${w1}" height="20" fill="#555"/><rect x="${w1}" width="${w2}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="${w1 / 2}" y="14">${esc(slug)}</text><text x="${w1 + w2 / 2}" y="14">${label}</text></g></svg>`;
}
