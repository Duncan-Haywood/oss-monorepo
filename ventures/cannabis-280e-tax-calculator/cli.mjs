#!/usr/bin/env node
import { estimate, renderText } from "./tax.mjs";
const a = process.argv.slice(2);
const o = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
try {
  if (!o("receipts")) throw new Error("Usage: node cli.mjs --receipts N --cogs N --opex N [--fed 21] [--state 0] [--state-decoupled] [--no-280e] [--reclass N]");
  console.log(renderText(estimate({
    receipts: o("receipts"), cogs: o("cogs", 0), opex: o("opex", 0), fedRatePct: o("fed", 21), stateRatePct: o("state", 0),
    stateConforms: !a.includes("--state-decoupled"), applies: !a.includes("--no-280e"), reclass: o("reclass", 0),
  })));
} catch (e) { console.error(e.message); process.exit(1); }
