#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildTable, DEFAULTS, renderText, toCsv, toJson, parseIndexOverrides, parseShares, revenueModel, money, pct } from "./ppp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const read = (p) => readFileSync(p, "utf8");

try {
  if (!args.length || args.includes("--help")) {
    throw new Error("Usage: node cli.mjs <base-price> [--strength 0.7] [--floor 0.35] [--cap 1] [--rounding charm|whole|nine|none] [--tiers N] [--indexes file.csv] [--format text|csv|json] [--traffic shares.txt [--conversion 0.02] [--elasticity 1.5]]");
  }
  const o = {
    base: Number(args[0]),
    strength: Number(flag("strength", DEFAULTS.strength)),
    floor: Number(flag("floor", DEFAULTS.floor)),
    cap: Number(flag("cap", DEFAULTS.cap)),
    rounding: flag("rounding", DEFAULTS.rounding),
    tiers: Number(flag("tiers", DEFAULTS.tiers)),
  };
  const idx = flag("indexes");
  const parsed = idx ? parseIndexOverrides(read(idx)) : { overrides: {}, bad: [] };
  if (parsed.bad.length) console.error(`Ignored index lines: ${parsed.bad.join(" | ")}`);
  const rows = buildTable(o, parsed.overrides);
  const fmt = flag("format", "text");
  console.log(fmt === "csv" ? toCsv(rows) : fmt === "json" ? toJson(rows, o) : renderText(rows, o));
  const traffic = flag("traffic");
  if (traffic) {
    const { shares, bad } = parseShares(read(traffic));
    if (bad.length) console.error(`Ignored traffic lines: ${bad.join(" | ")}`);
    const m = revenueModel(rows, shares, { base: o.base, baseConversion: Number(flag("conversion", 0.02)), elasticity: Number(flag("elasticity", 1.5)) });
    console.log(`\nPer 1,000 visitors: ${money(m.before)} at one price -> ${money(m.after)} regional (${m.change >= 0 ? "+" : ""}${pct(m.pct)}), assuming elasticity ${flag("elasticity", 1.5)}. A model, not a forecast.`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
