#!/usr/bin/env node
// Self-hosted launch waitlist with referrals. Zero dependencies.
//   ADMIN_KEY=... BASE_URL=https://join.example.com PRODUCT_NAME=Acme TAGLINE="Invoices that chase themselves" \
//   RESEND_API_KEY=... MAIL_FROM="Acme <hi@example.com>" node server.mjs
// DRY_RUN defaults to true: no email is sent, and the confirm link is shown on screen so you can try the flow.
import http from "node:http";
import fs from "node:fs";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import * as E from "./engine.mjs";

const env = process.env;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rand = (n = 8) => randomBytes(n).toString("hex");

const readBody = (req, max = 20_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => { const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`); return Boolean(key) && a.length === b.length && timingSafeEqual(a, b); };

export function limiter(max = 10, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => { const w = Math.floor(now / windowMs), h = hits.get(ip); if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; } return ++h.n <= max; };
}

export function resendSender({ apiKey, from, fetchImpl = fetch }) {
  return async (m) => {
    const r = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }) });
    if (!r.ok) throw new Error(`resend ${r.status}`);
  };
}

const CSS = `:root{font:17px system-ui,sans-serif;color:#1d2433;background:#f5f7fb}body{max-width:560px;margin:auto;padding:32px 20px}h1{font-size:2rem;line-height:1.15;margin:0 0 8px}p{line-height:1.55}
.card{background:#fff;border:1px solid #dce1ee;border-radius:14px;padding:22px;margin:18px 0}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #aab3d0;border-radius:8px;font:inherit;margin:8px 0}
table{width:100%;border-collapse:collapse}td{padding:4px 8px 4px 0;border-bottom:1px solid #eef1fa;word-break:break-all}h2{font-size:1.1rem;margin:0 0 8px}button,.btn{border:0;background:#2f5be7;color:#fff;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}.big{font-size:2.6rem;font-weight:800;margin:0}.hint{font-size:.85rem;color:#555}.hp{position:absolute;left:-9999px}code{background:#eef1fa;padding:2px 6px;border-radius:5px;word-break:break-all}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}<p class="hint">Waitlist by <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/waitlist-keeper">Waitlist Keeper</a> (open source). We use your email only to run this waitlist.</p></body></html>`;

// cfg: {state, save, adminKey, baseUrl, product, tagline, boost, cap, tiers, inviteUrl, dryRun, send, now, allow}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allow = cfg.allow || limiter();
  const base = (cfg.baseUrl || "").replace(/\/$/, "");
  const opts = { boost: cfg.boost ?? 5 };
  // Network addresses are only needed to spot a referrer signing up their own friends; keep a salted hash, never the address.
  cfg.state.salt ||= rand(16);
  const hashIp = (ip) => (ip ? createHash("sha256").update(cfg.state.salt + ip).digest("hex").slice(0, 16) : "");
  const leaveLink = (p) => `${base}/leave?t=${p.token}`;
  const product = cfg.product || "our launch", tiers = cfg.tiers || [];
  const mail = async (m) => { if (cfg.dryRun || !cfg.send) { console.log(`[dry-run] email to ${m.to}: ${m.subject}`); return false; } await cfg.send(m); return true; };
  const home = (ref, err, src) => page(`${product} waitlist`, `<h1>${esc(product)}</h1><p>${esc(cfg.tagline || "Join the waitlist.")}</p><p class="hint">${E.stats(cfg.state, opts).confirmed} people are already on the list.</p>${err ? `<p class="card" role="alert">${esc(err)}</p>` : ""}<form class="card" method="post" action="/join"><label for="e">Your email</label><input id="e" name="email" type="email" required autocomplete="email"><input type="hidden" name="ref" value="${esc(ref || "")}"><input type="hidden" name="src" value="${esc(E.cleanSrc(src))}"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button>Join the waitlist</button></form>`);
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname;
    const reply = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2)); };
    const json = (c, b) => reply(c, b, "application/json", { "access-control-allow-origin": "*" });
    try {
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      if (path === "/healthz") return reply(200, "ok\n", "text/plain");
      if (req.method === "OPTIONS") return reply(204, "", "text/plain", { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" });

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice(9);
        if (req.method === "GET" && a === "/stats") return json(200, E.stats(cfg.state, opts));
        if (req.method === "GET" && a === "/export.csv") return reply(200, E.toCsv(cfg.state, opts), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="waitlist.csv"' });
        if (req.method === "POST" && a === "/invite") {
          const b = JSON.parse((await readBody(req)) || "{}");
          const batch = E.nextInvites(cfg.state, Math.min(Number(b.count) || 0, 1000), now(), opts);
          cfg.save();
          const log = [];
          for (const p of batch) {
            const link = b.url || cfg.inviteUrl || base;
            try { const sent = await mail({ to: p.email, subject: `You're in: ${product} is ready for you`, text: `Good news, you're invited to ${product}.\n\n${link}\n` , html: `<p>Good news, you're invited to ${esc(product)}.</p><p><a href="${esc(link)}">Get started</a></p>` }); log.push(`${sent ? "emailed" : "dry-run"} ${p.email}`); } catch (e) { log.push(`FAILED ${p.email}: ${e.message}`); }
          }
          return json(200, { invited: batch.length, log });
        }
        if (req.method === "POST" && a === "/erase") {
          const b = JSON.parse((await readBody(req)) || "{}");
          const gone = E.remove(cfg.state, { email: b.email });
          if (gone) cfg.save();
          return json(gone ? 200 : 404, gone ? { erased: true } : { error: "no such email" });
        }
        return json(404, { error: "not found" });
      }

      // Read-only dashboard for a browser (HTTP Basic, any user name, ADMIN_KEY as password). It changes nothing, so a
      // cross-site request cannot do harm; invites and erasure stay on the bearer-token API.
      if (req.method === "GET" && path === "/admin") {
        const [, pw = ""] = Buffer.from((req.headers.authorization || "").replace(/^Basic /, ""), "base64").toString().split(/:(.*)/s);
        const a = Buffer.from(pw), b = Buffer.from(cfg.adminKey || "");
        if (!cfg.adminKey || a.length !== b.length || !timingSafeEqual(a, b)) return reply(401, "Sign in with the admin key as the password.\n", "text/plain", { "www-authenticate": 'Basic realm="waitlist admin"' });
        const st = E.stats(cfg.state, opts);
        const top = Object.values(cfg.state.people).filter((p) => p.referrals > 0).sort((x, y) => y.referrals - x.referrals).slice(0, 10);
        const src = Object.entries(st.bySource).sort((x, y) => y[1].signups - x[1].signups);
        const cell = (v) => `<td>${esc(v)}</td>`;
        return reply(200, page(`${product} admin`, `<h1>${esc(product)} admin</h1><div class="card"><p class="big">${st.waiting}</p><p class="hint">confirmed and waiting</p><p>${st.signups} signups, ${st.confirmed} confirmed, ${st.invited} invited, ${st.referred} came from a referral. Referrals per confirmed person: ${st.kFactor}.</p></div><div class="card"><h2>Where signups come from</h2><table>${src.map(([k, v]) => `<tr>${cell(k)}${cell(v.signups + " signups")}${cell(v.confirmed + " confirmed")}</tr>`).join("") || "<tr><td>none yet</td></tr>"}</table></div><div class="card"><h2>Top referrers</h2><table>${top.map((p) => `<tr>${cell(p.email)}${cell(p.referrals + " confirmed friends")}</tr>`).join("") || "<tr><td>none yet</td></tr>"}</table></div><div class="card hint">Invite the next 50: <code>curl -X POST -H "Authorization: Bearer $ADMIN_KEY" -d '{"count":50}' ${esc(base)}/v1/admin/invite</code><br>CSV: <code>${esc(base)}/v1/admin/export.csv</code></div>`));
      }

      // Drop-in signup form for any site: <div id="waitlist-keeper"></div><script src="https://your-server/embed.js" async></script>
      if (req.method === "GET" && path === "/embed.js") {
        const js = `(function(){var s=document.currentScript,o=new URL(s.src).origin,t=document.getElementById("waitlist-keeper");if(!t)return;var ref=new URLSearchParams(location.search).get("ref")||"",src=new URLSearchParams(location.search).get("utm_source")||t.getAttribute("data-src")||"";var f=document.createElement("form"),i=document.createElement("input"),b=document.createElement("button"),m=document.createElement("p");i.type="email";i.required=true;i.placeholder="you@example.com";i.setAttribute("aria-label","Your email");b.textContent=t.getAttribute("data-button")||"Join the waitlist";m.setAttribute("role","status");f.append(i,b,m);t.append(f);f.addEventListener("submit",function(e){e.preventDefault();b.disabled=true;fetch(o+"/join",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:i.value,ref:ref,src:src})}).then(function(r){return r.json().then(function(d){return[r.ok,d]})}).then(function(x){m.textContent=x[0]?"Check your email to confirm your spot.":(x[1].error||"Something went wrong.");if(x[0])i.value="";b.disabled=false}).catch(function(){m.textContent="Could not reach the waitlist.";b.disabled=false})})})();`;
        return reply(200, js, "application/javascript; charset=utf-8", { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" });
      }

      // Leave the list. GET only shows a button (mail scanners prefetch links); POST erases.
      if (path === "/leave") {
        const t = url.searchParams.get("t") || "";
        if (req.method === "GET") return reply(200, page("Leave the waitlist", `<h1>Leave the waitlist?</h1><form class="card" method="post" action="/leave?t=${esc(encodeURIComponent(t))}"><p>This deletes your email and place in line.</p><button>Delete my data</button></form>`));
        if (req.method === "POST") {
          const gone = E.remove(cfg.state, { token: t });
          if (gone) cfg.save();
          return reply(gone ? 200 : 404, page("Done", gone ? "<h1>You're off the list</h1><p>Your email has been deleted.</p>" : "<h1>Nothing to delete</h1><p>That link was already used or is not valid.</p>"));
        }
      }

      if (req.method === "GET" && path === "/v1/count") return json(200, { waiting: E.stats(cfg.state, opts).waiting, confirmed: E.stats(cfg.state, opts).confirmed });
      if (req.method === "GET" && path === "/") return reply(200, home(url.searchParams.get("ref"), "", url.searchParams.get("utm_source") || url.searchParams.get("src")));

      if (req.method === "POST" && path === "/join") {
        if (!allow(ip, now())) return reply(429, "Slow down.\n", "text/plain");
        const raw = await readBody(req); const isJson = (req.headers["content-type"] || "").includes("json");
        const b = isJson ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
        if (b.website) return reply(200, page("Check your email", "<h1>Check your email</h1>"));
        let r;
        try { r = E.join(cfg.state, b.email, { ref: b.ref, ip: hashIp(ip), src: b.src || url.searchParams.get("utm_source"), now: now(), token: rand(16), code: rand(4) }); }
        catch (e) { if (e.status === 400) return isJson ? json(400, { error: e.message }) : reply(400, home(b.ref, e.message, b.src)); throw e; }
        const p = r.person;
        if (p.confirmedAt) return isJson ? json(200, { status: "already-confirmed", code: p.code }) : reply(303, "", "text/plain", { location: `/s/${p.code}` });
        const link = `${base}/confirm?t=${p.token}`;
        if (r.created || b.resend) await mail({ to: p.email, subject: `Confirm your spot for ${product}`, text: `Confirm your email to hold your place:\n\n${link}\n\nNot you? Ignore this, or delete your data: ${leaveLink(p)}\n`, html: `<p>Confirm your email to hold your place for ${esc(product)}.</p><p><a href="${esc(link)}">Confirm my spot</a></p><p><small><a href="${esc(leaveLink(p))}">Delete my data</a></small></p>` });
        cfg.save();
        if (isJson) return json(200, { status: "confirm-email-sent", ...(cfg.dryRun ? { devConfirmLink: link } : {}) });
        return reply(200, page("Check your email", `<h1>Check your email</h1><p>We sent a link to confirm your spot. Friends you refer only count once <em>they</em> confirm too.</p>${cfg.dryRun ? `<p class="card hint">Dry-run mode: no email was sent. Confirm here: <a href="/confirm?t=${p.token}">confirm link</a></p>` : ""}`));
      }

      if (req.method === "GET" && path === "/confirm") {
        const p = E.confirm(cfg.state, url.searchParams.get("t") || "", now(), { cap: cfg.cap ?? 25 });
        if (!p) return reply(400, page("Bad link", "<h1>That link did not work</h1><p>It may have expired or been copied wrongly.</p>"));
        cfg.save();
        return reply(303, "", "text/plain", { location: `/s/${p.code}` });
      }

      let m;
      if (req.method === "GET" && (m = path.match(/^\/s\/([0-9a-f]{8})$/))) {
        const id = cfg.state.byCode[m[1]], p = id && cfg.state.people[id];
        if (!p) return reply(404, page("Not found", "<h1>Not found</h1>"));
        if (!p.confirmedAt) return reply(200, page("Confirm your email", "<h1>One more step</h1><p>Confirm your email to get a place in line.</p>"));
        const pos = E.position(cfg.state, p, opts), tier = E.tierFor(tiers, p.referrals), next = tiers.find((t) => t.referrals > p.referrals);
        const share = `${base}/?ref=${p.code}`;
        return reply(200, page(`${product} waitlist`, `<h1>${p.invitedAt ? "You're invited!" : "You're on the list"}</h1><div class="card">${pos ? `<p class="big">#${pos}</p><p class="hint">your place in line</p>` : ""}<p>${p.referrals} friend${p.referrals === 1 ? "" : "s"} confirmed${tier ? ` — reward unlocked: <b>${esc(tier.reward)}</b>` : ""}.${next ? ` ${next.referrals - p.referrals} more for <b>${esc(next.reward)}</b>.` : ""}</p></div><div class="card"><p>Every friend who confirms moves you up ${opts.boost} places. Share your link:</p><p><code>${esc(share)}</code></p></div><p class="hint"><a href="/leave?t=${esc(p.token)}">Leave the list and delete my data</a></p>`));
      }
      return reply(404, "Not found\n", "text/plain");
    } catch (e) {
      const code = e.status || 500; if (code === 500) console.error(e);
      return reply(code, code === 500 ? "Server error\n" : `${e.message}\n`, "text/plain");
    }
  };
}

export function loadState(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return E.newState(); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16) { console.error("Set ADMIN_KEY (16+ characters)."); process.exit(1); }
  const file = env.STATE || "/tmp/state.json"; const state = loadState(file);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const dryRun = env.DRY_RUN !== "false";
  const send = env.RESEND_API_KEY && env.MAIL_FROM ? resendSender({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }) : null;
  let tiers = []; try { tiers = JSON.parse(env.TIERS_JSON || "[]").sort((a, b) => a.referrals - b.referrals); } catch { console.error("TIERS_JSON is not valid JSON; ignoring"); }
  http.createServer(handler({ state, save, adminKey: env.ADMIN_KEY, baseUrl: env.BASE_URL || "", product: env.PRODUCT_NAME, tagline: env.TAGLINE, boost: Number(env.BOOST ?? 5), cap: Number(env.CAP ?? 25), tiers, inviteUrl: env.INVITE_URL, dryRun, send })).listen(Number(env.PORT) || 8080, () => console.log(`waitlist-keeper on :${env.PORT || 8080} (dry run: ${dryRun})`));
}
