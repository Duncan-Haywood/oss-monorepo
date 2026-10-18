// Tiny client for your own backend or scripts. Zero dependencies; Node 18+ or any runtime with fetch.
//   import { createKeeper } from "./sdk.mjs";
//   const deals = createKeeper({ url: "https://deals.example.com", key: process.env.DEAL_KEEPER_API_KEY });
//   deals.upsert({ id: "acme-q4", name: "Acme", amount: 12000, stage: "proposal", closeDate: "2026-11-30" });
//   deals.activity("acme-q4");                 // "I talked to them today"
// Calls never throw; failures go to onError.
export function createKeeper({ url, key, fetchImpl = fetch, onError = () => {} }) {
  const base = url.replace(/\/$/, ""), headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const call = async (method, path, body) => {
    try {
      const r = await fetchImpl(base + path, { method, headers, body: body == null ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
      if (!r.ok) onError(new Error(`deal-keeper ${r.status}`));
      return await r.json();
    } catch (e) { onError(e); return null; }
  };
  return {
    /** Create or update a deal. Changing `stage` records the move; `status: "won"|"lost"` closes it. */
    upsert: (deal) => call("POST", "/v1/deals", deal),
    activity: (id, at) => call("POST", `/v1/deals/${encodeURIComponent(id)}/activity`, at == null ? {} : { at }),
    /** A draft follow-up note for you to edit and send; { text, source: "model" | "fallback" }. */
    followUp: (id) => call("POST", `/v1/deals/${encodeURIComponent(id)}/followup`),
    pipeline: () => call("GET", "/v1/pipeline"),
    forecast: (opts = {}) => call("GET", `/v1/forecast?${new URLSearchParams(Object.entries(opts).map(([k, v]) => [k, String(v)]))}`),
  };
}
