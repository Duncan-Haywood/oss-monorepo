#!/usr/bin/env node
import { quote, compareServices, checkAsk, toMarkdown } from "./engine.mjs";

const NUM = { guests: "guests", hours: "hours", "bartender-rate": "bartenderRate", "guests-per-bartender": "guestsPerBartender", miles: "miles", margin: "targetMargin", insurance: "insuranceAndPermit" };

export function parseArgs(argv) {
  const input = {}; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    const k = a.slice(2);
    if (["json", "compare"].includes(k)) { flags[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`--${k} needs a value`);
    if (k === "service") input.service = v;
    else if (k === "client") flags.client = v;
    else if (k === "ask") flags.ask = v;
    else if (k === "max-price") flags.maxPrice = Number(v);
    else if (NUM[k]) input[NUM[k]] = Number(v);
    else throw new Error(`unknown flag --${k}`);
  }
  return { input, flags };
}

export function run(argv) {
  const { input, flags } = parseArgs(argv);
  if (flags.ask !== undefined) {
    const r = checkAsk(input, flags.ask);
    return { code: r.verdict === "loss" ? 1 : 0, out: flags.json ? JSON.stringify(r, null, 2) : `Ask $${flags.ask}/guest = $${r.revenue}; profit $${r.profit} (${Math.round(r.margin * 100)}%): ${r.verdict}. Your price at target margin: $${r.quote.price}.` };
  }
  if (flags.compare) return { code: 0, out: JSON.stringify(compareServices(input), null, 2) };
  const q = quote(input);
  const over = flags.maxPrice != null && q.price > flags.maxPrice;
  return { code: over ? 1 : 0, out: flags.json ? JSON.stringify(q, null, 2) : toMarkdown(q, { client: flags.client }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { code, out } = run(process.argv.slice(2));
    console.log(out);
    process.exit(code);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
