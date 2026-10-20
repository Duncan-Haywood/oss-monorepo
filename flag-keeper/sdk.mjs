// flag-keeper SDK: zero dependencies, Node 18+ and browsers.
//   import { createClient } from "https://flags.example.com/sdk.mjs"       // served by your own flag-keeper
//   const flags = createClient({ url: "https://flags.example.com", key: CLIENT_KEY });           // remote: one request per check
//   const flags = createClient({ url, key: SERVER_KEY, mode: "local" }); await flags.ready();    // backend: evaluates in-process
//   if (await flags.isOn("new-checkout", { key: user.id, plan: user.plan })) { ... }
import { evaluate } from "./engine.mjs";

export function createClient({ url, key, mode = "remote", pollSeconds = 30, fetchImpl = fetch, onError = () => {} }) {
  const base = url.replace(/\/$/, ""), headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  let config = null, etag = null, timer = null;
  async function refresh() {
    try {
      const r = await fetchImpl(`${base}/v1/config`, { headers: etag ? { ...headers, "if-none-match": etag } : headers });
      if (r.status === 304) return false;
      if (!r.ok) throw new Error(`config ${r.status}`);
      config = await r.json(); etag = r.headers.get("etag"); return true;
    } catch (e) { onError(e); return false; }
  }
  async function detail(flag, context, fallback) {
    if (mode === "local") {
      if (!config) return { flag, variant: null, value: fallback, reason: "not_ready" };
      const r = evaluate(config, flag, context);
      return r.value === null ? { ...r, value: fallback } : r;
    }
    try {
      const r = await fetchImpl(`${base}/v1/evaluate`, { method: "POST", headers, body: JSON.stringify({ flag, context }) });
      const b = await r.json(); return r.ok ? b : { flag, variant: null, value: fallback, reason: b.reason || "error" };
    } catch (e) { onError(e); return { flag, variant: null, value: fallback, reason: "error" }; }
  }
  return {
    detail,
    value: async (flag, context, fallback = null) => (await detail(flag, context, fallback)).value,
    isOn: async (flag, context) => (await detail(flag, context, false)).value === true,
    ready: async () => { if (mode === "local") { await refresh(); timer = setInterval(refresh, pollSeconds * 1000); timer.unref?.(); } },
    refresh,
    close: () => clearInterval(timer),
  };
}
