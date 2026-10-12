#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { estimate, renderText, EXAMPLE } from "./penalty.mjs";
const a = process.argv.slice(2);
const o = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
try {
  const input = a.includes("--example") ? EXAMPLE
    : o("file") ? JSON.parse(readFileSync(o("file"), "utf8"))
    : (() => { throw new Error("Usage: node cli.mjs --file deposits.json | --example   (JSON: {asOf, ratePct, trustSharePct, noticeDate, deposits:[{label, amount, due, paid}]})"); })();
  console.log(renderText(estimate(input)));
} catch (e) { console.error(e.message); process.exit(1); }
