#!/usr/bin/env node
// Self-hosted launch waitlist with referrals. Zero dependencies.
//   ADMIN_KEY=... BASE_URL=https://join.example.com PRODUCT_NAME=Acme TAGLINE="Invoices that chase themselves" \
//   RESEND_API_KEY=... MAIL_FROM="Acme <hi@example.com>" node server.mjs
// DRY_RUN defaults to true: no email is sent, and the confirm link is shown on screen so you can try the flow.
import http from "node:http";
import fs from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
button,.btn{border:0;background:#2f5be7;color:#fff;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}.big{font-size:2.6rem;font-weight:800;margin:0}.hint{font-size:.85rem;color:#555}.hp{position:absolute;left:-9999px}code{background:#eef1fa;padding:2px 6px;border-radius:5px;word-break:break-all}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}<p class="hint">Waitlist by <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/waitlist-keeper">Waitlist Keeper</a> (open source). We use your email only to run this waitlist.</p></body></html>`;

// cfg: {state, save, adminKey, baseUrl, product, tagline, boost, cap, tiers, inviteUrl, dryRun, send, now, allow}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allow = cfg.allow || limiter();
  const base = (cfg.baseUrl || "").replace(/\/$/, "");
  const opts = { boost: cfg.boost ?? 5 };
  const product = cfg.product || "our launch", tiers = cfg.tiers || [];
  const mail = async (m) => { if (cfg.dryRun || !cfg.send) { console.log(`[dry-run] email to ${m.to}: ${m.subject}`); return false; } await cfg.send(m); return true; };
  const home = (ref, err) => page(`${product} waitlist`, `<h1>${esc(product)}</h1><p>${esc(cfg.tagline || "Join the waitlist.")}</p><p class="hint">${E.stats(cfg.state, opts).confirmed} people are already on the list.</p>${err ? `<p class="card" role="alert">${esc(err)}</p>` : ""}<form class="card" method="post" action="/join"><label for="e">Your email</label><input id="e" name="email" type="email" required autocomplete="email"><input type="hidden" name="ref" value="${esc(ref || "")}"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button>Join the waitlist</button></form>`);
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
        return json(404, { error: "not found" });
      }

      if (req.method === "GET" && path === "/v1/count") return json(200, { waiting: E.stats(cfg.state, opts).waiting, confirmed: E.stats(cfg.state, opts).confirmed });
      if (req.method === "GET" && path === "/") return reply(200, home(url.searchParams.get("ref")));

      if (req.method === "POST" && path === "/join") {
        if (!allow(ip, now())) return reply(429, "Slow down.\n", "text/plain");
        const raw = await readBody(req); const isJson = (req.headers["content-type"] || "").includes("json");
        const b = isJson ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
        if (b.website) return reply(200, page("Check your email", "<h1>Check your email</h1>"));
        let r;
        try { r = E.join(cfg.state, b.email, { ref: b.ref, ip, now: now(), token: rand(16), code: rand(4) }); }
        catch (e) { if (e.status === 400) return isJson ? json(400, { error: e.message }) : reply(400, home(b.ref, e.message)); throw e; }
        const p = r.person;
        if (p.confirmedAt) return isJson ? json(200, { status: "already-confirmed", code: p.code }) : reply(303, "", "text/plain", { location: `/s/${p.code}` });
        const link = `${base}/confirm?t=${p.token}`;
        if (r.created || b.resend) await mail({ to: p.email, subject: `Confirm your spot for ${product}`, text: `Confirm your email to hold your place:\n\n${link}\n`, html: `<p>Confirm your email to hold your place for ${esc(product)}.</p><p><a href="${esc(link)}">Confirm my spot</a></p>` });
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
        return reply(200, page(`${product} waitlist`, `<h1>${p.invitedAt ? "You're invited!" : "You're on the list"}</h1><div class="card">${pos ? `<p class="big">#${pos}</p><p class="hint">your place in line</p>` : ""}<p>${p.referrals} friend${p.referrals === 1 ? "" : "s"} confirmed${tier ? ` — reward unlocked: <b>${esc(tier.reward)}</b>` : ""}.${next ? ` ${next.referrals - p.referrals} more for <b>${esc(next.reward)}</b>.` : ""}</p></div><div class="card"><p>Every friend who confirms moves you up ${opts.boost} places. Share your link:</p><p><code>${esc(share)}</code></p></div>`));
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
