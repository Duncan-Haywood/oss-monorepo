// Server-rendered admin pages. Every dynamic value goes through esc().
import { submissions } from "./forms.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const shell = (cfg, title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>:root{font:16px system-ui,sans-serif;color:#1c2030;background:#f6f7fb}body{max-width:980px;margin:auto;padding:24px}a{color:#2342b8}.card{background:#fff;border:1px solid #dde1ec;border-radius:12px;padding:18px;margin:16px 0}label{display:block;font-weight:600;margin:10px 0 4px}input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #b5bdd6;border-radius:6px;font:inherit}button{padding:7px 14px;border:0;border-radius:6px;background:#2342b8;color:#fff;font:inherit;cursor:pointer}button.alt{background:#e3e6f1;color:#1c2030}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6f1;vertical-align:top}pre{background:#eef0f8;padding:10px;border-radius:8px;overflow-x:auto;font-size:.82rem;white-space:pre-wrap}.muted{color:#46506b;font-size:.85rem}form.inline{display:inline}</style></head><body><main>
<h1><a href="/admin" style="text-decoration:none;color:inherit">${esc(cfg.company)} · form inbox</a></h1>${body}
<p class="muted">No warranty; no delivery or uptime guarantee. Review submissions yourself; the spam score is a heuristic.${cfg.sponsor ? ` <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.` : ""}</p></main></body></html>`;

const snippet = (base, f) => `<form action="${base}/f/${f.id}" method="post">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <!-- spam trap: real visitors never see this -->
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button>Send</button>
</form>`;

export function adminPage(cfg, state, base) {
  const forms = Object.values(state.forms).sort((a, b) => b.created - a.created);
  const rows = forms.map((f) => `<tr><td><a href="/admin/f/${esc(f.id)}">${esc(f.name)}</a></td><td>${f.count - f.spam}</td><td>${f.spam}</td><td>${esc(f.origins.join(", ") || "any site")}</td></tr>`).join("");
  return shell(cfg, `${cfg.company} form inbox`, `
<div class="card"><h2>Forms</h2>${forms.length ? `<table><tr><th>Form</th><th>Inbox</th><th>Spam</th><th>Allowed sites</th></tr>${rows}</table>` : "<p>No forms yet. Create one below, then paste its snippet into your site.</p>"}</div>
<div class="card"><h2>New form</h2><form method="post" action="/admin/forms">
<label for="name">Name</label><input id="name" name="name" required maxlength="80">
<label for="origins">Allowed sites (space separated, e.g. https://example.com; empty = any)</label><input id="origins" name="origins">
<label for="redirect">Thank-you page URL (optional)</label><input id="redirect" name="redirect" type="url">
<label for="notifyEmail">Email me each submission (optional; needs RESEND_API_KEY)</label><input id="notifyEmail" name="notifyEmail" type="email">
<p><button>Create form</button></p></form></div>`);
}

export function formPage(cfg, state, f, base, { showSpam = false } = {}) {
  const subs = submissions(state, f.id, { spam: showSpam });
  const items = subs.slice(0, 200).map((s) => `<tr><td>${esc(new Date(s.at).toISOString().replace("T", " ").slice(0, 16))}</td><td>${Object.entries(s.data).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("<br>")}${s.reasons.length ? `<div class="muted">score ${s.score}: ${esc(s.reasons.join("; "))}</div>` : ""}</td><td>
<form class="inline" method="post" action="/admin/s/${esc(s.id)}/${showSpam ? "ham" : "spam"}"><button class="alt">${showSpam ? "Not spam" : "Spam"}</button></form>
<form class="inline" method="post" action="/admin/s/${esc(s.id)}/delete"><button class="alt">Delete</button></form></td></tr>`).join("");
  return shell(cfg, f.name, `
<p><a href="/admin">&larr; all forms</a> · <a href="/admin/f/${esc(f.id)}">Inbox (${f.count - f.spam})</a> · <a href="/admin/f/${esc(f.id)}?spam=1">Spam (${f.spam})</a> · <a href="/admin/f/${esc(f.id)}.csv">Export CSV</a></p>
<div class="card"><h2>${esc(f.name)}</h2><table><tr><th>Received (UTC)</th><th>Fields</th><th></th></tr>${items || `<tr><td colspan="3">Nothing here yet.</td></tr>`}</table></div>
<div class="card"><h2>Embed</h2><pre>${esc(snippet(base, f))}</pre><p class="muted">Or POST JSON to <code>${esc(base)}/f/${esc(f.id)}</code>. Endpoint accepts form posts and JSON; unknown fields are stored as-is.</p>
<form method="post" action="/admin/f/${esc(f.id)}/delete" onsubmit="return confirm('Delete this form and all its submissions?')"><button class="alt">Delete form</button></form></div>`);
}

export const thanksPage = (cfg) => shell({ ...cfg, sponsor: false }, "Thanks", `<div class="card"><h2>Thanks, we got it.</h2><p>Your message was sent. You can close this tab.</p></div>`);
