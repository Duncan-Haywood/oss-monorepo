#!/usr/bin/env node
// Self-hosted online acceptance for proposals made with Proposal Maker. Zero dependencies.
//   ADMIN_KEY=... BASE_URL=https://sign.example.com NOTIFY_EMAIL=you@example.com \
//   RESEND_API_KEY=... MAIL_FROM="You <hi@example.com>" WEBHOOK_URL=https://... node server.mjs
// DRY_RUN defaults to true: no email is sent and the webhook is not called; the share link is still returned.
import http from "node:http";
import fs from "node:fs";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import * as S from "./sign.mjs";

const env = process.env;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rand = (n) => randomBytes(n).toString("hex");
const when = (t) => new Date(t).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

const readBody = (req, max) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const bearerOk = (req, key) => Boolean(key) && safeEq(req.headers.authorization || "", `Bearer ${key}`);
const basicOk = (req, key) => { const [, pw = ""] = Buffer.from((req.headers.authorization || "").replace(/^Basic /, ""), "base64").toString().split(/:(.*)/s); return Boolean(key) && safeEq(pw, key); };

export function limiter(max = 20, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => { const w = Math.floor(now / windowMs), h = hits.get(ip); if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; } return ++h.n <= max; };
}

export function resendSender({ apiKey, from, fetchImpl = fetch }) {
  return async (m) => {
    const r = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }) });
    if (!r.ok) throw new Error(`resend ${r.status}`);
  };
}

const CSS = `:root{font:17px system-ui,sans-serif;color:#1d2433;background:#f5f7fb}body{max-width:760px;margin:auto;padding:24px 20px}h1{font-size:1.6rem;margin:0 0 8px}p{line-height:1.55}
.card{background:#fff;border:1px solid #dce1ee;border-radius:14px;padding:20px;margin:16px 0}input,textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #aab3d0;border-radius:8px;font:inherit;margin:6px 0}
iframe{width:100%;height:70vh;border:1px solid #dce1ee;border-radius:10px;background:#fff}button{border:0;background:#2f5be7;color:#fff;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}button.sec{background:#e7eaf5;color:#1d2433}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px 6px 0;border-bottom:1px solid #eef1fa;text-align:left;word-break:break-all}.hint{font-size:.85rem;color:#555}code{background:#eef1fa;padding:2px 6px;border-radius:5px;word-break:break-all}.ok{color:#146c2e;font-weight:700}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}<p class="hint">Online acceptance by <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/proposal-maker">Proposal Maker</a> (open source). A typed-name acceptance is a record of agreement, not legal advice; ask a lawyer whether it suffices for your contract.</p></body></html>`;

// cfg: {state, save, adminKey, baseUrl, notifyEmail, dryRun, send, webhookUrl, fetchImpl, now, allow}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allow = cfg.allow || limiter();
  const base = (cfg.baseUrl || "").replace(/\/$/, "");
  cfg.state.salt ||= rand(16);
  // Only a salted hash of the network address is kept, enough to tell viewers apart in the certificate.
  const hashIp = (ip) => (ip ? createHash("sha256").update(cfg.state.salt + ip).digest("hex").slice(0, 16) : "");
  const link = (d) => `${base}/d/${d.token}`;
  const notify = async (event, d) => {
    const subject = `Proposal ${event}: ${d.title}`;
    const text = `${subject}\n${d.signature ? `Signed by ${d.signature.name} at ${when(d.signature.at)}\n` : ""}${d.decline && d.decline.reason ? `Reason: ${d.decline.reason}\n` : ""}Certificate: ${link(d)}/certificate\n`;
    if (cfg.dryRun) { console.log(`[dry-run] ${subject}`); return; }
    const jobs = [];
    if (cfg.send && cfg.notifyEmail) jobs.push(cfg.send({ to: cfg.notifyEmail, subject, text, html: `<pre>${esc(text)}</pre>` }));
    if (cfg.send && event === "accepted" && d.signature.email) jobs.push(cfg.send({ to: d.signature.email, subject: `Your signed copy: ${d.title}`, text: `Thanks. This confirms you accepted "${d.title}" on ${when(d.signature.at)}.\nCertificate: ${link(d)}/certificate\n`, html: `<p>Thanks. This confirms you accepted &ldquo;${esc(d.title)}&rdquo; on ${esc(when(d.signature.at))}.</p><p><a href="${esc(link(d))}/certificate">Certificate</a></p>` }));
    if (cfg.webhookUrl) jobs.push((cfg.fetchImpl || fetch)(cfg.webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, id: d.id, title: d.title, status: d.status, signedBy: d.signature ? d.signature.name : null, at: now() }) }));
    // A failed notification must never undo a signature the client already made.
    for (const r of await Promise.allSettled(jobs)) if (r.status === "rejected") console.error("notify failed:", r.reason && r.reason.message);
  };
  const certificate = (d) => {
    const sig = d.signature;
    return page(`Certificate: ${d.title}`, `<h1>Acceptance certificate</h1><div class="card"><h2>${esc(d.title)}</h2><table>
<tr><th>Status</th><td class="${d.status === "accepted" ? "ok" : ""}">${esc(d.status)}</td></tr>
${sig ? `<tr><th>Signed by</th><td>${esc(sig.name)}</td></tr><tr><th>Email given</th><td>${esc(sig.email || "none")}</td></tr><tr><th>Signed at</th><td>${esc(when(sig.at))}</td></tr><tr><th>Viewer fingerprint</th><td>${esc(sig.viewer)}</td></tr><tr><th>Browser</th><td>${esc(sig.userAgent)}</td></tr><tr><th>Statement agreed to</th><td>${esc(sig.consent)}</td></tr>` : ""}
${d.decline ? `<tr><th>Declined at</th><td>${esc(when(d.decline.at))}</td></tr><tr><th>Reason</th><td>${esc(d.decline.reason || "none given")}</td></tr>` : ""}
<tr><th>Document SHA-256</th><td><code>${esc(d.sha256)}</code></td></tr><tr><th>Sent</th><td>${esc(when(d.createdAt))}</td></tr><tr><th>Opened</th><td>${d.views.length} time${d.views.length === 1 ? "" : "s"}</td></tr></table>
<p class="hint">The SHA-256 is a fingerprint of the exact proposal file the client saw. Download it from <a href="${esc(link(d))}/doc">the document</a> and run <code>sha256sum</code> to check it matches.</p></div>
<div class="card"><h2>Timeline</h2><table>${d.events.map((e) => `<tr><td>${esc(when(e.at))}</td><td>${esc(e.type)}</td></tr>`).join("")}</table></div>`);
  };

  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname;
    const reply = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2)); };
    const json = (c, b) => reply(c, b, "application/json");
    try {
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      const t = now();
      if (path === "/healthz") return reply(200, "ok\n", "text/plain");

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice(9); let m;
        if (req.method === "POST" && a === "/docs") {
          const b = JSON.parse((await readBody(req, S.MAX_HTML + 10_000)) || "{}");
          const d = S.publish(cfg.state, { html: b.html, title: b.title, clientEmail: b.clientEmail, expires: b.expires }, { id: rand(4), token: rand(24), now: t });
          cfg.save();
          return json(201, { id: d.id, url: link(d), sha256: d.sha256, status: d.status });
        }
        if (req.method === "GET" && a === "/docs") return json(200, { stats: S.stats(cfg.state, t), docs: Object.values(cfg.state.docs).map((d) => S.summary(d, t)).sort((x, y) => y.createdAt - x.createdAt) });
        if (req.method === "GET" && a === "/export.csv") return reply(200, S.toCsv(cfg.state, t), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="proposals.csv"' });
        if ((m = a.match(/^\/docs\/([0-9a-f]{8})$/))) {
          const d = cfg.state.docs[m[1]]; if (!d) return json(404, { error: "no such proposal" });
          if (req.method === "GET") { const { html, ...rest } = d; return json(200, { ...rest, url: link(d), status: S.effectiveStatus(d, t) }); }
          if (req.method === "DELETE") { S.remove(cfg.state, d.id); cfg.save(); return json(200, { deleted: true }); }
        }
        return json(404, { error: "not found" });
      }

      if (req.method === "GET" && path === "/admin") {
        if (!basicOk(req, cfg.adminKey)) return reply(401, "Sign in with the admin key as the password.\n", "text/plain", { "www-authenticate": 'Basic realm="proposal admin"' });
        const st = S.stats(cfg.state, t);
        const rows = Object.values(cfg.state.docs).map((d) => ({ d, r: S.summary(d, t) })).sort((x, y) => y.r.createdAt - x.r.createdAt);
        return reply(200, page("Proposal admin", `<h1>Proposals</h1><div class="card"><p>${st.total} sent, ${st.open} waiting (${st.unopened} never opened), ${st.accepted} accepted, ${st.declined} declined, ${st.expired} expired.${st.winRate === null ? "" : ` Win rate ${st.winRate}%.`}</p></div>
<div class="card"><h2>Send a proposal for signature</h2><p class="hint">In Proposal Maker choose &ldquo;Download as HTML file&rdquo;, then pick that file here. Your admin key is used once and not stored.</p>
<form id="pub"><input type="file" id="file" accept=".html,text/html" required aria-label="Proposal HTML file"><input id="ce" type="email" placeholder="Client email (optional, for their signed copy)" aria-label="Client email"><input id="ex" type="date" aria-label="Link expires on (optional)"><input id="key" type="password" placeholder="Admin key" required aria-label="Admin key"><button>Create signing link</button></form><p id="out" role="status"></p></div>
<div class="card"><h2>All proposals</h2><table><tr><th>Proposal</th><th>Status</th><th>Opened</th><th>Signed by</th><th></th></tr>${rows.map(({ d, r }) => `<tr><td>${esc(r.title)}</td><td>${esc(r.status)}</td><td>${r.views}</td><td>${esc(r.signedBy || "")}</td><td><a href="/d/${esc(d.token)}/certificate">certificate</a></td></tr>`).join("") || "<tr><td>none yet</td></tr>"}</table><p class="hint">CSV export: <code>curl -H "Authorization: Bearer $ADMIN_KEY" ${esc(base)}/v1/admin/export.csv</code></p></div>
<script>document.getElementById("pub").onsubmit=async function(e){e.preventDefault();var o=document.getElementById("out"),f=document.getElementById("file").files[0];o.textContent="Sending...";try{var html=await f.text(),r=await fetch("/v1/admin/docs",{method:"POST",headers:{authorization:"Bearer "+document.getElementById("key").value,"content-type":"application/json"},body:JSON.stringify({html:html,clientEmail:document.getElementById("ce").value,expires:document.getElementById("ex").value})}),d=await r.json();o.textContent=r.ok?"Send this link to your client: "+d.url:(d.error||"Failed");}catch(x){o.textContent="Failed: "+x.message}}</script>`));
      }

      let m;
      if ((m = path.match(/^\/d\/([0-9a-f]{48})(\/[a-z]+)?$/))) {
        const d = S.byToken(cfg.state, m[1]); const sub = m[2] || "";
        if (!d) return reply(404, page("Not found", "<h1>Not found</h1><p>This link is not valid.</p>"));
        const viewer = hashIp(ip), st = S.effectiveStatus(d, t);
        if (req.method === "GET" && sub === "/doc") {
          if (S.recordView(d, { viewer, now: t })) { cfg.save(); await notify("opened", d); }
          return reply(200, d.html, "text/html; charset=utf-8", { "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:" });
        }
        if (req.method === "GET" && sub === "/certificate") return reply(200, certificate(d));
        if (req.method === "GET" && sub === "") {
          const form = st === "sent" ? `<form class="card" method="post" action="/d/${d.token}/accept"><h2>Accept this proposal</h2><label for="n">Type your full name to sign</label><input id="n" name="name" required minlength="2" autocomplete="name"><label for="e">Your email, to get a signed copy (optional)</label><input id="e" name="email" type="email" autocomplete="email" value="${esc(d.clientEmail)}"><p><label><input type="checkbox" name="agree" value="1" required style="width:auto"> ${esc(S.CONSENT)}</label></p><button>Accept and sign</button></form><form class="card" method="post" action="/d/${d.token}/decline"><h2>Not for you?</h2><label for="r">Tell the sender why (optional)</label><textarea id="r" name="reason" rows="2"></textarea><button class="sec">Decline</button></form>`
            : `<div class="card"><p><b>This proposal is ${esc(st)}.</b>${d.status === "accepted" || d.status === "declined" ? ` <a href="/d/${d.token}/certificate">View the record</a>.` : " Ask the sender for a new one."}</p></div>`;
          return reply(200, page(d.title, `<h1>${esc(d.title)}</h1><iframe src="/d/${d.token}/doc" sandbox title="Proposal"></iframe>${form}`));
        }
        if (req.method === "POST" && (sub === "/accept" || sub === "/decline")) {
          if (!allow(ip, t)) return reply(429, "Slow down.\n", "text/plain");
          const raw = await readBody(req, 20_000); const isJson = (req.headers["content-type"] || "").includes("json");
          const b = isJson ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
          try {
            if (sub === "/accept") S.accept(d, { name: b.name, agree: b.agree, email: b.email, viewer, userAgent: req.headers["user-agent"] }, t);
            else S.decline(d, { reason: b.reason, viewer }, t);
          } catch (e) { if (e.status) return isJson ? json(e.status, { error: e.message }) : reply(e.status, page("Could not record", `<h1>Could not record that</h1><p>${esc(e.message)}</p><p><a href="/d/${d.token}">Go back</a></p>`)); throw e; }
          cfg.save();
          await notify(d.status, d);
          return isJson ? json(200, { status: d.status }) : reply(303, "", "text/plain", { location: `/d/${d.token}/certificate` });
        }
      }
      return reply(404, "Not found\n", "text/plain");
    } catch (e) {
      const code = e.status || (e instanceof SyntaxError ? 400 : 500); if (code === 500) console.error(e);
      return reply(code, code === 500 ? "Server error\n" : `${e.message}\n`, "text/plain");
    }
  };
}

export function loadState(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return S.newState(); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16) { console.error("Set ADMIN_KEY (16+ characters)."); process.exit(1); }
  const file = env.STATE || "/tmp/state.json"; const state = loadState(file);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const dryRun = env.DRY_RUN !== "false";
  const send = env.RESEND_API_KEY && env.MAIL_FROM ? resendSender({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }) : null;
  http.createServer(handler({ state, save, adminKey: env.ADMIN_KEY, baseUrl: env.BASE_URL || "", notifyEmail: env.NOTIFY_EMAIL, webhookUrl: env.WEBHOOK_URL, dryRun, send })).listen(Number(env.PORT) || 8080, () => console.log(`proposal-maker sign server on :${env.PORT || 8080} (dry run: ${dryRun})`));
}
