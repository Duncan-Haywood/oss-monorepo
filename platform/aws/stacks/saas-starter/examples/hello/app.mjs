// The smallest product on the starter: a Workers-style app. Everything under /api/* sits behind
// the Cognito JWT authorizer (env.user is the verified claims); everything else is public.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("<!doctype html><title>hello</title><h1>hello</h1>", { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/healthz") return json({ ok: true, product: env.PRODUCT });

    if (!url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    if (!env.user) return json({ error: "sign in" }, 401);    // belt and braces: the authorizer already enforces this

    if (url.pathname === "/api/me") return json({ sub: env.user.sub, email: env.user.email ?? null, plan: await env.entitlement() });

    if (url.pathname === "/api/notes" && request.method === "POST") {
      const ent = await env.entitlement();
      if (!ent.entitled) return json({ error: "subscription required", status: ent.status }, 402);
      const { text } = await request.json();
      const row = await env.DB.prepare("INSERT INTO notes (user_sub, text) VALUES (?, ?) RETURNING id").bind(env.user.sub, String(text).slice(0, 2000)).first();
      ctx.waitUntil(Promise.resolve());   // e.g. analytics; awaited before Lambda returns
      return json({ id: row.id }, 201);
    }
    if (url.pathname === "/api/notes") {
      const { results } = await env.DB.prepare("SELECT id, text FROM notes WHERE user_sub = ? ORDER BY id").bind(env.user.sub).all();
      return json({ notes: results });
    }
    if (url.pathname === "/api/devices" && request.method === "POST" && env.push) {
      const { platform, token } = await request.json();
      await env.push.register(platform, token);
      return json({ ok: true }, 201);
    }
    return json({ error: "not found" }, 404);
  },
  // Cron trigger (module input `schedules`), same shape as Workers.
  async scheduled(controller, env) {
    await env.DB.prepare("DELETE FROM notes WHERE created < now() - interval '365 days'").run();
  },
};
