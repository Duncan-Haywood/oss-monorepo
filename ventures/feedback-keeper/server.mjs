#!/usr/bin/env node
// Self-hosted feedback board: votes, roadmap, changelog, duplicate detection. Zero dependencies.
//   ADMIN_KEY=... BASE_URL=https://feedback.example.com BOARD_TITLE="Acme feedback" \
//   RESEND_API_KEY=... MAIL_FROM="Acme <hi@example.com>" node server.mjs
// MODERATION defaults to on (new ideas wait for approval); DRY_RUN defaults to true (no email is sent).
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual, createHash } from "node:crypto";
import * as S from "./store.mjs";
import * as R from "./render.mjs";
import { notifyStatus, resendSender } from "./notify.mjs";

const env = process.env;

const readBody = (req, max = 100_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const parseBody = (raw, type = "") => {
  if (type.includes("json")) { try { return JSON.parse(raw || "{}"); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); } }
  return Object.fromEntries(new URLSearchParams(raw));
};
const bearerOk = (req, key) => {
  const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
};
const cookie = (req, name) => (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];

export function limiter(max = 30, windowMs = 60_000) {
  const hits = new Map();
  return (ip, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(ip);
    if (!h || h.w !== w) { hits.set(ip, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

// cfg: {state, save, adminKey, title, baseUrl, moderation, dryRun, send, secret, now, allow}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allow = cfg.allow || limiter();
  const title = cfg.title || "Feedback";
  const baseUrl = (cfg.baseUrl || "").replace(/\/$/, "");
  const secret = cfg.secret || createHash("sha256").update(`fk:${cfg.adminKey}`).digest("hex");
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    let setCookie;
    const reply = (code, body, type = "text/html; charset=utf-8", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", ...(setCookie ? { "set-cookie": setCookie } : {}), ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    };
    const json = (code, body) => reply(code, body, "application/json", { "access-control-allow-origin": "*" });
    const redirect = (to) => reply(303, "", "text/plain", { location: to });
    try {
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      let voter = cookie(req, "fk_voter");
      if (!/^[0-9a-f]{32}$/.test(voter || "")) { voter = S.newVoterId(); setCookie = `fk_voter=${voter}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`; }
      const posting = req.method === "POST";
      if (posting && path !== "/admin/ignore" && !path.startsWith("/v1/admin") && !allow(ip, now())) return reply(429, "Slow down.\n", "text/plain");

      if (path === "/healthz") return reply(200, "ok\n", "text/plain");
      if (req.method === "OPTIONS") return reply(204, "", "text/plain", { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST" });

      // ---- admin JSON API (bearer ADMIN_KEY) ----
      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice("/v1/admin".length);
        if (req.method === "GET" && a === "/posts") return json(200, { summary: S.summary(cfg.state), posts: Object.values(cfg.state.posts).map((p) => ({ id: p.id, title: p.title, status: p.status, approved: p.approved, mergedInto: p.mergedInto, votes: p.votes.length, subs: p.subs.length })) });
        if (posting) {
          const b = parseBody(await readBody(req), req.headers["content-type"]);
          let m;
          if ((m = a.match(/^\/posts\/(\d+)\/status$/))) {
            const { post, notify } = S.setStatus(cfg.state, m[1], b.status, now());
            const log = await notifyStatus({ post, recipients: notify, title, baseUrl, secret, send: cfg.send, dryRun: cfg.dryRun });
            cfg.save(); log.forEach((l) => console.log(l));
            return json(200, { post: S.publicPost(post), notified: log });
          }
          if ((m = a.match(/^\/posts\/(\d+)\/approve$/))) { const p = cfg.state.posts[m[1]]; if (!p) return json(404, { error: "no such post" }); p.approved = true; cfg.save(); return json(200, { post: S.publicPost(p) }); }
          if ((m = a.match(/^\/posts\/(\d+)\/merge$/))) { const into = S.merge(cfg.state, m[1], String(b.into)); cfg.save(); return json(200, { into: S.publicPost(into) }); }
          if ((m = a.match(/^\/posts\/(\d+)\/comment$/))) { const c = S.comment(cfg.state, m[1], b.body, true, now()); cfg.save(); return json(200, { comment: c }); }
          if (a === "/changelog") { const e = S.addEntry(cfg.state, b, now()); cfg.save(); return json(200, { entry: e }); }
        }
        return json(404, { error: "not found" });
      }

      // ---- public JSON API ----
      if (req.method === "GET" && path === "/v1/posts") {
        const ps = S.list(cfg.state, { sort: url.searchParams.get("sort") || "top", status: url.searchParams.get("status") || "", q: url.searchParams.get("q") || "", now: now() });
        return json(200, { posts: ps.map((p) => S.publicPost(p, voter)) });
      }
      if (req.method === "GET" && path === "/v1/similar") {
        const q = url.searchParams.get("q") || "";
        return json(200, { similar: S.similarTo(cfg.state, q).map((x) => ({ id: x.id, title: x.post.title, votes: x.post.votes.length, score: x.score })) });
      }

      // ---- pages ----
      if (req.method === "GET" && path === "/") {
        const sort = url.searchParams.get("sort") || "top", q = url.searchParams.get("q") || "";
        return reply(200, R.board({ boardTitle: title, posts: S.list(cfg.state, { sort, q, now: now() }), voter, sort, q, notice: url.searchParams.get("posted") ? (cfg.moderation ? "Thanks! Your idea will appear once it has been reviewed." : "Thanks! Your idea is on the board.") : "" }));
      }
      let m;
      if (req.method === "GET" && (m = path.match(/^\/post\/(\d+)$/))) {
        const p = cfg.state.posts[m[1]];
        if (!p || !p.approved) return reply(404, R.layout({ title: "Not found", boardTitle: title, body: "<p>No such idea.</p>" }));
        if (p.mergedInto) return redirect(`/post/${p.mergedInto}`);
        return reply(200, R.postPage({ boardTitle: title, p, voter }));
      }
      if (req.method === "GET" && path === "/roadmap") return reply(200, R.roadmap({ boardTitle: title, posts: S.visible(cfg.state) }));
      if (req.method === "GET" && path === "/changelog") return reply(200, R.changelogPage({ boardTitle: title, entries: cfg.state.changelog }));
      if (req.method === "GET" && path === "/changelog.atom") return reply(200, R.atom({ boardTitle: title, baseUrl, entries: cfg.state.changelog }), "application/atom+xml");
      if (req.method === "GET" && path === "/unsubscribe") {
        const e = url.searchParams.get("e") || "";
        if (!S.unsubOk(secret, e, url.searchParams.get("t"))) return reply(400, "Bad link.\n", "text/plain");
        const n = S.unsubscribeAll(cfg.state, e); cfg.save();
        return reply(200, R.layout({ title: "Unsubscribed", boardTitle: title, body: `<p class="card">You will get no more updates (${n} ${n === 1 ? "idea" : "ideas"} unfollowed).</p>` }));
      }
      if (posting && path === "/unsubscribe") { // RFC 8058 one-click
        const e = url.searchParams.get("e") || "";
        if (!S.unsubOk(secret, e, url.searchParams.get("t"))) return reply(400, "Bad link.\n", "text/plain");
        S.unsubscribeAll(cfg.state, e); cfg.save(); return reply(200, "ok\n", "text/plain");
      }

      // ---- form posts (work without JavaScript) ----
      if (posting) {
        const b = parseBody(await readBody(req), req.headers["content-type"]);
        const wantsJson = (req.headers["content-type"] || "").includes("json");
        const done = (to, obj) => (wantsJson ? json(200, obj) : redirect(to));
        if (b.website) return done("/", { ok: true }); // honeypot: bots fill it, people never see it
        if (path === "/submit") {
          const p = S.submit(cfg.state, { ...b, voter }, { moderate: cfg.moderation, now: now() });
          cfg.save();
          return done(cfg.moderation ? "/?posted=1" : `/post/${p.id}`, { id: p.id, pending: cfg.moderation });
        }
        if ((m = path.match(/^\/vote\/(\d+)$/))) { const r = S.vote(cfg.state, m[1], voter, now()); cfg.save(); return done(req.headers.referer?.startsWith(baseUrl || "\0") ? new URL(req.headers.referer).pathname + new URL(req.headers.referer).search : `/post/${m[1]}`, r); }
        if ((m = path.match(/^\/comment\/(\d+)$/))) { S.comment(cfg.state, m[1], b.body, false, now()); cfg.save(); return done(`/post/${m[1]}`, { ok: true }); }
        if ((m = path.match(/^\/follow\/(\d+)$/))) { const ok = S.subscribe(cfg.state, m[1], b.email); cfg.save(); return done(`/post/${m[1]}`, { ok }); }
      }
      return reply(404, "Not found\n", "text/plain");
    } catch (e) {
      const code = e.status || 500;
      if (code === 500) console.error(e);
      return reply(code, code === 500 ? "Server error\n" : `${e.message}\n`, "text/plain");
    }
  };
}

export function loadState(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return S.newState(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16) { console.error("Set ADMIN_KEY (16+ characters). It guards /v1/admin."); process.exit(1); }
  const file = env.STATE || "/tmp/state.json";
  const state = loadState(file);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const dryRun = env.DRY_RUN !== "false";
  const send = env.RESEND_API_KEY && env.MAIL_FROM ? resendSender({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }) : null;
  const h = handler({ state, save, adminKey: env.ADMIN_KEY, title: env.BOARD_TITLE || "Feedback", baseUrl: env.BASE_URL || "", moderation: env.MODERATION !== "false", dryRun, send });
  http.createServer(h).listen(Number(env.PORT) || 8080, () => console.log(`feedback-keeper on :${env.PORT || 8080} (dry run: ${dryRun}, moderation: ${env.MODERATION !== "false"})`));
}
