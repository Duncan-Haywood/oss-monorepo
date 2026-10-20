#!/usr/bin/env node
// Load a deal export into a running Deal Keeper, so the first forecast uses your history on day one.
//   DEALS_URL=https://deals.example.com DEALS_API_KEY=... node import.mjs deals.csv
// Same CSV as the browser page. Safe to re-run: deals are upserted by id.
import fs from "node:fs";
import { parseCsv, DEFAULT_STAGES } from "./engine.mjs";

/** Pure: CSV text -> API payloads (one per deal) plus the rows that were skipped. */
export function plan(text, stages = DEFAULT_STAGES) {
  const { state, errors } = parseCsv(text, stages);
  const deals = Object.values(state.deals).map((d) => {
    const cur = d.history[d.history.length - 1];
    return {
      id: d.id, name: d.name || undefined, amount: d.amount ?? undefined, status: d.status, createdAt: d.createdAt,
      closeDate: d.closeDate ?? undefined, closedAt: d.closedAt ?? undefined, nextStep: d.nextStep || undefined,
      lastActivityAt: d.touches[d.touches.length - 1],
      ...(d.exact && d.history.length > 1 ? { history: d.history.map(([i, at]) => ({ stage: stages[i], at })) } : { stage: stages[cur[0]], stageAt: cur[1], exact: d.exact }),
    };
  });
  return { deals, errors };
}

/** POST in batches of 500; returns counts. `fetchImpl` is injectable for tests. */
export async function upload({ url, key, deals, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, ""), tally = { ok: 0, rejected: 0, errors: [] };
  for (let i = 0; i < deals.length; i += 500) {
    const r = await fetchImpl(`${base}/v1/deals`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ deals: deals.slice(i, i + 500) }) });
    if (!r.ok && r.status !== 400) throw new Error(`/v1/deals returned ${r.status}`);
    for (const x of (await r.json()).results || []) { tally[x.status]++; if (x.error) tally.errors.push(`${x.id}: ${x.error}`); }
  }
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file] = process.argv.slice(2), { DEALS_URL: url, DEALS_API_KEY: key } = process.env;
  if (!file || !url || !key) { console.error("usage: DEALS_URL=... DEALS_API_KEY=... node import.mjs deals.csv"); process.exit(2); }
  const p = plan(fs.readFileSync(file, "utf8"));
  for (const e of p.errors) console.error("skipped:", e);
  console.log(`${p.deals.length} deals`);
  console.log(await upload({ url, key, deals: p.deals }));
}
