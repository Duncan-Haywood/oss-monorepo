#!/usr/bin/env node
// Load a history export into a running Churn Radar, so the first model trains on day one.
//   RADAR_URL=https://radar.example.com RADAR_API_KEY=... node import.mjs events.csv [cancellations.csv]
// events.csv: `account,date[,event_type]` per line. cancellations.csv: `account,date`. Same format as the browser page.
// Safe to re-run: event ids are derived from the row, so the server reports repeats as duplicates.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseCsv } from "./engine.mjs";

const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Pure: turn the two CSV texts into API payloads. */
export function plan(eventsText, churnText) {
  const { accounts, errors } = parseCsv(eventsText, churnText);
  const events = [], outcomes = [], seen = new Map();
  for (const [account, a] of Object.entries(accounts)) {
    for (const [ts, type] of a.events) {
      const base = hash(`${account}|${ts}|${type}`), n = seen.get(base) || 0; seen.set(base, n + 1);
      events.push({ id: `imp_${base}_${n}`, account, type, timestamp: ts, signup: a.signupAt });
    }
    if (a.churnedAt != null) outcomes.push({ account, churnedAt: a.churnedAt });
  }
  return { events, outcomes, errors };
}

/** POST in batches of 500; returns counts. `fetchImpl` is injectable for tests. */
export async function upload({ url, key, events, outcomes, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, ""), headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const post = async (path, body) => {
    const r = await fetchImpl(base + path, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok && r.status !== 400) throw new Error(`${path} returned ${r.status}`);
    return r.json();
  };
  const tally = { accepted: 0, duplicate: 0, rejected: 0, outcomes: 0 };
  for (let i = 0; i < events.length; i += 500) {
    const { results = [] } = await post("/v1/events", { events: events.slice(i, i + 500) });
    for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;
  }
  for (const o of outcomes) { await post("/v1/outcomes", o); tally.outcomes++; }
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [evFile, chFile] = process.argv.slice(2), { RADAR_URL: url, RADAR_API_KEY: key } = process.env;
  if (!evFile || !url || !key) { console.error("usage: RADAR_URL=... RADAR_API_KEY=... node import.mjs events.csv [cancellations.csv]"); process.exit(2); }
  const p = plan(fs.readFileSync(evFile, "utf8"), chFile ? fs.readFileSync(chFile, "utf8") : "");
  for (const e of p.errors) console.error("skipped:", e);
  console.log(`${p.events.length} events, ${p.outcomes.length} cancellations`);
  console.log(await upload({ url, key, events: p.events, outcomes: p.outcomes }));
}
