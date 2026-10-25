// Built-in keyword layer against the card-charge memos of Hack Club's public HCB
// feed (hcb.hackclub.com/api/v3, transparent organisations only). Memos carry no
// category label, so this measures coverage (how many get a suggestion) and prints
// the unmatched tail and the hits for a person to judge; it cannot score "right".
// Fetched at run time, never copied into the tree.
//
//   node eval/hcb-memos.mjs [--from 40 --to 100] [--orgpage 1] [--hits 40] [--misses 60]
// --orgpage N reads the Nth page of 100 organisations (held-out reading: page 2 or later).
import { suggest } from "../categorize.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

export function coverage(rows) {
  const opts = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
  const hits = new Map(), misses = new Map();
  for (const x of rows) {
    const s = suggest({ desc: x.memo, cents: x.cents }, opts);
    const m = s.account ? hits : misses, k = x.memo.toLowerCase() + (s.account ? ` => ${s.account}` : "");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  return { n: rows.length, suggested: sum(hits), hits, misses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const orgs = (await get(`https://hcb.hackclub.com/api/v3/organizations?per_page=100&page=${arg("orgpage", 1)}`)).filter((o) => o.transparent).slice(arg("from", 0), arg("to", 40));
  const rows = [];
  for (const o of orgs) {
    try {
      for (let p = 1; p <= 3; p++) {
        const t = await get(`https://hcb.hackclub.com/api/v3/organizations/${o.slug}/transactions?per_page=100&page=${p}`);
        for (const x of t) if (x.type === "card_charge" && x.memo && x.amount_cents < 0) rows.push({ memo: x.memo, cents: x.amount_cents });
        if (t.length < 100) break;
      }
    } catch (e) { console.error(o.slug, e.message); }
  }
  const c = coverage(rows);
  console.log(`${c.n} card charges, ${c.suggested} suggested (${(100 * c.suggested / c.n).toFixed(1)}%)`);
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v} ${k}`).join("\n");
  console.log("\nhits:\n" + top(c.hits, arg("hits", 0)));
  console.log("\nmisses:\n" + top(c.misses, arg("misses", 60)));
}
