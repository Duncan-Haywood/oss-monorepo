// Tiny client for your own backend. Zero dependencies; Node 18+ or any runtime with fetch.
//   import { createRadar } from "./sdk.mjs";
//   const radar = createRadar({ url: "https://radar.example.com", key: process.env.RADAR_API_KEY });
//   radar.track("acct_42", "export_report");   // never throws, never blocks a request
export function createRadar({ url, key, fetchImpl = fetch, onError = () => {} }) {
  const post = (path, body) => fetchImpl(`${url.replace(/\/$/, "")}${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  let seq = 0;
  return {
    /** Fire-and-forget. The id makes a retry harmless; pass your own `id` if you retry yourself. */
    track(account, type, extra = {}) {
      const id = extra.id || `${account}:${type}:${Date.now()}:${seq++}`;
      return post("/v1/events", { id, account, type, ...extra }).then((r) => { if (!r.ok) onError(new Error(`churn-radar ${r.status}`)); }).catch(onError);
    },
    /** Tell the radar an account cancelled (the Stripe webhook does this for you if you set it up). */
    churned(account, when) { return post("/v1/outcomes", { account, churnedAt: when }).catch(onError); },
    async atRisk(limit = 20) { const r = await fetchImpl(`${url.replace(/\/$/, "")}/v1/at-risk?limit=${limit}`, { headers: { authorization: `Bearer ${key}` } }); return r.json(); },
  };
}
