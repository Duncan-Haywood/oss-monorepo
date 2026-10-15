// meter-keeper SDK: zero dependencies, Node 18+. Server side only: the key must never reach a browser.
//   import { createMeter } from "https://meter.example.com/sdk.mjs"      // served by your own meter-keeper
//   const meter = createMeter({ url: "https://meter.example.com", key: process.env.METER_API_KEY });
//   meter.track("acme", "api", 1);                                       // buffered, batched, retried; never throws
//   if (!(await meter.check("acme", "api")).allowed) return res.status(402).end();
//   await meter.close();                                                 // flush on shutdown
import { randomUUID } from "node:crypto";

export function createMeter({ url, key, batchSize = 100, flushMs = 2000, maxBuffer = 10_000, retries = 4, backoffMs = 250, fetchImpl = fetch, onError = () => {} }) {
  const base = url.replace(/\/$/, ""), headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  let buf = [], timer = null, chain = Promise.resolve();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = async (path) => { const r = await fetchImpl(base + path, { headers }); const b = await r.json(); if (!r.ok) throw new Error(b.error || `meter-keeper ${r.status}`); return b; };

  // The id is fixed when the event is tracked, so resending a batch after a timeout cannot double count.
  async function send(batch) {
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await fetchImpl(`${base}/v1/events`, { method: "POST", headers, body: JSON.stringify({ events: batch }) });
        if (r.ok) return;
        if (r.status !== 429 && r.status < 500) { onError(new Error(`meter-keeper ${r.status}: ${(await r.json().catch(() => ({}))).error || "rejected"}`), batch); return; }
      } catch { /* network error: retry */ }
      if (i < retries) await sleep(backoffMs * 2 ** i);
    }
    onError(new Error(`meter-keeper unreachable, dropped ${batch.length} event(s)`), batch);
  }
  function flush() {
    clearTimeout(timer); timer = null;
    while (buf.length) { const batch = buf.splice(0, Math.min(batchSize, 100)); chain = chain.then(() => send(batch)); }
    return chain;
  }
  return {
    /** Records usage. Returns the event id (pass your own `id` to dedupe against your own retries). */
    track(customer, meter, value = 1, { id = randomUUID(), key: uniqueKey, timestamp } = {}) {
      if (buf.length >= maxBuffer) { onError(new Error("meter-keeper buffer full, event dropped")); return id; }
      buf.push({ id, customer, meter, value, ...(uniqueKey != null && { key: uniqueKey }), ...(timestamp != null && { timestamp: new Date(timestamp).toISOString() }) });
      if (buf.length >= batchSize) flush(); else if (!timer) { timer = setTimeout(flush, flushMs); timer.unref?.(); }
      return id;
    },
    flush,
    /** Is `quantity` more units of `meter` inside the customer's plan? Fails open if the meter is unreachable. */
    async check(customer, meter, quantity = 1) {
      try { return await get(`/v1/check?customer=${encodeURIComponent(customer)}&meter=${encodeURIComponent(meter)}&quantity=${quantity}`); }
      catch (e) { onError(e); return { allowed: true, reason: "meter_unreachable" }; }
    },
    usage: (customer, opts = {}) => get(`/v1/usage?customer=${encodeURIComponent(customer)}${opts.meter ? `&meter=${encodeURIComponent(opts.meter)}` : ""}`),
    invoicePreview: (customer) => get(`/v1/invoice-preview?customer=${encodeURIComponent(customer)}`),
    projection: (customer) => get(`/v1/projection?customer=${encodeURIComponent(customer)}`),
    close: () => flush(),
  };
}
