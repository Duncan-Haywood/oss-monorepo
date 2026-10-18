#!/usr/bin/env node
// Zero-dependency CLI for ticket resellers. No network call -- local numbers only.
//
//   node cli.mjs price --cost 120 --qty 2 --fee 10 --list 150 [--p-sell 0.8] [--salvage 0] [--json]
//   node cli.mjs price --cost 120 --qty 2 --fee 10 --target-profit 100
//   node cli.mjs log sales.csv [--json] [--min-roi 5]
//   cat sales.csv | node cli.mjs log -

import fs from "node:fs/promises";
import { netIfSold, listForProfit, breakEvenList, expectedProfit, comparePlatforms, parseSales, analyzeSales, summarizeSales, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--cost": "costPerTicket", "--qty": "qty", "--fee": "feePct", "--flat-fee": "flatFeePerTicket", "--delivery": "deliveryPerOrder", "--list": "list", "--target-profit": "targetProfit", "--p-sell": "pSell", "--salvage": "salvage", "--min-roi": "minRoi" };

function parseArgs(argv) {
  const args = { json: false, positional: [], nums: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (FLAGS[a]) args.nums[FLAGS[a]] = Number(argv[++i]);
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs price --cost <per ticket> [--qty 1] [--fee 10] [--flat-fee 0] [--delivery 0] (--list <per ticket> | --target-profit <total>) [--p-sell 0.8] [--salvage 0] [--json]",
  "  node cli.mjs log <sales.csv|-> [--min-roi 5] [--json]",
  "",
  "price: net payout, profit and ROI at a list price, the break-even list price, the list price for a target profit,",
  "  and with --p-sell the expected profit once an unsold ticket is worth --salvage (default 0).",
  "log: per-marketplace profit, ROI and effective fee rate from past sales (event,platform,qty,cost,sale,fees or a header row).",
  "  Exit 1 if --min-roi is given and the overall ROI is below it; 2 on bad input. No network call.",
].join("\n");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stdin = readStdin } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  const n = args.nums;
  for (const [k, v] of Object.entries(n)) if (!Number.isFinite(v)) return { exitCode: 2, output: `${k} needs a number.` };

  if (args.sub === "price") {
    if (n.costPerTicket === undefined) return { exitCode: 2, output: "price needs --cost (what you paid per ticket)." };
    const input = { qty: n.qty ?? 1, costPerTicket: n.costPerTicket, feePct: n.feePct ?? 10, flatFeePerTicket: n.flatFeePerTicket ?? 0, deliveryPerOrder: n.deliveryPerOrder ?? 0 };
    try {
      const breakEven = breakEvenList(input);
      const out = { input, breakEvenList: breakEven, note: MODEL_NOTE };
      if (n.targetProfit !== undefined) out.listForTargetProfit = listForProfit(n.targetProfit, input);
      const list = n.list ?? out.listForTargetProfit;
      if (list !== undefined) {
        out.list = list;
        out.ifSold = netIfSold(list, input);
        out.platforms = comparePlatforms(list, input).map(({ label, feePct, payout, profit }) => ({ label, feePct, payout, profit }));
        if (n.pSell !== undefined) out.expected = expectedProfit(list, input, { pSell: n.pSell, salvagePerTicket: n.salvage ?? 0 });
      }
      if (args.json) return { exitCode: 0, output: JSON.stringify(out, null, 2) };
      const lines = [`Break-even list price: ${usd(breakEven)} per ticket (${input.qty} ticket${input.qty === 1 ? "" : "s"}, ${input.feePct}% seller fee)`];
      if (out.listForTargetProfit !== undefined) lines.push(`List for ${usd(n.targetProfit)} total profit: ${usd(out.listForTargetProfit)} per ticket`);
      if (out.ifSold) {
        const s = out.ifSold;
        lines.push(`At ${usd(list)}: payout ${usd(s.payout)}, profit ${usd(s.profit)}${s.roi === null ? "" : `, ROI ${s.roi}%`}`);
        lines.push("Same order elsewhere: " + out.platforms.map((p) => `${p.label} ${usd(p.profit)}`).join(" | "));
      }
      if (out.expected) lines.push(`Expected profit at ${Math.round(n.pSell * 100)}% sale chance: ${usd(out.expected.expected)} (needs ${out.expected.breakEvenPSell === null ? "n/a" : Math.round(out.expected.breakEvenPSell * 100) + "%"} to break even)`);
      lines.push("", MODEL_NOTE + ".");
      return { exitCode: 0, output: lines.join("\n") };
    } catch (e) {
      return { exitCode: 2, output: e.message };
    }
  }

  if (args.sub === "log") {
    if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs log <sales.csv|->" };
    let text;
    try { text = args.positional[0] === "-" ? await stdin() : await readFile(args.positional[0]); } catch (e) { return { exitCode: 2, output: `Cannot read ${args.positional[0]}: ${e.message}` }; }
    const report = analyzeSales(parseSales(text));
    if (!report.count) return { exitCode: 2, output: "No sales rows could be read. Expect event,platform,qty,cost,sale,fees or a header row." };
    const s = summarizeSales(report);
    const exitCode = n.minRoi !== undefined && (report.total.roi ?? -Infinity) < n.minRoi ? 1 : 0;
    if (args.json) return { exitCode, output: JSON.stringify({ summary: s.text, ...report, note: MODEL_NOTE }, null, 2) };
    const lines = [s.text, "", "platform             sales  fee%    profit    ROI%"];
    for (const p of report.platforms) lines.push(`${p.platform.padEnd(20)} ${String(p.sales).padStart(5)} ${String(p.feePct ?? "-").padStart(5)} ${usd(p.profit).padStart(9)} ${String(p.roi ?? "-").padStart(7)}`);
    if (report.losers.length) lines.push("", "Sales that lost money: " + report.losers.map((l) => `${l.event || l.platform} (-${usd(l.loss)})`).join(", "));
    if (report.skipped) lines.push("", `${report.skipped} row(s) skipped (unreadable).`);
    lines.push("", MODEL_NOTE + ".");
    return { exitCode, output: lines.join("\n") };
  }
  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then(({ exitCode, output }) => { console.log(output); process.exitCode = exitCode; });
}
