#!/usr/bin/env node
// Certificate chain check, command line. Node 18+, no dependencies.
//
//   node check.mjs fullchain.pem --host www.example.com
//   openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null | node check.mjs - --host example.com
//   node check.mjs cert.pem chain.pem --fix > fullchain.pem
//
// Exit 0: no error or high finding (or no --fail-on-risk); 2: risk with --fail-on-risk; 1: bad usage or unreadable file.
import { readFileSync } from "node:fs";
import { scan, hasRisk, fullchainPem } from "./scan.mjs";

const HELP = `usage: node check.mjs FILE... [options]     (FILE - reads stdin)
  --host NAME        check that the server certificate covers NAME (DNS name or IP)
  --at ISO-DATE      check as of this time instead of now
  --warn-days N      warn when a certificate in the chain expires within N days (default 30)
  --format text|json
  --fix              print the chain in the right order (server certificate, then intermediates, no root) as PEM
  --fail-on-risk     exit 2 on an error, high or medium finding`;

const args = process.argv.slice(2);
const opts = { format: "text", files: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const val = () => { if (i + 1 >= args.length) usage(`${a} needs a value`); return args[++i]; };
  if (a === "--host") opts.host = val();
  else if (a === "--at") opts.at = val();
  else if (a === "--warn-days") opts.warnDays = Number(val());
  else if (a === "--format") opts.format = val();
  else if (a === "--fix") opts.fix = true;
  else if (a === "--fail-on-risk") opts.failOnRisk = true;
  else if (a === "-h" || a === "--help") { console.log(HELP); process.exit(0); }
  else if (a.startsWith("--")) usage(`unknown option ${a}`);
  else opts.files.push(a);
}
if (!opts.files.length) usage("no file given");
if (!["text", "json"].includes(opts.format)) usage("--format is text or json");
if (opts.at && Number.isNaN(Date.parse(opts.at))) usage(`--at ${opts.at} is not a date`);
if (opts.warnDays !== undefined && !(opts.warnDays >= 0)) usage("--warn-days is a number of days");

function usage(msg) {
  console.error(`check.mjs: ${msg}\n${HELP}`);
  process.exit(1);
}

const parts = [];
for (const f of opts.files) {
  try {
    parts.push(readFileSync(f === "-" ? 0 : f));
  } catch (e) {
    console.error(`check.mjs: cannot read ${f}: ${e.code || e.message}`);
    process.exit(1);
  }
}
// One DER file is read as bytes; anything else is joined as text.
const input = parts.length === 1 && parts[0][0] === 0x30 ? new Uint8Array(parts[0]) : parts.map((b) => b.toString("latin1")).join("\n");

const report = await scan(input, { host: opts.host, at: opts.at, warnDays: opts.warnDays });

if (opts.fix) {
  process.stdout.write(await fullchainPem(report, input));
} else if (opts.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(textReport(report));
}
process.exit(opts.failOnRisk && hasRisk(report) ? 2 : 0);

function textReport(r) {
  const out = [];
  const verdict = { ok: "OK: no problem found in what was checked", risky: "RISKY: some clients will refuse this chain", broken: "BROKEN: clients will refuse this chain", "no-certificates": "NO CERTIFICATES FOUND" }[r.verdict];
  out.push(verdict);
  out.push(`checked at ${r.checkedAt}${r.host ? ` for ${r.host}${r.hostMatch ? (r.hostMatch.ok ? ` (matches ${r.hostMatch.by})` : " (does not match)") : ""}` : ""}`);
  if (r.chain.length) out.push(`chain: ${r.chain.map((i) => `#${i}`).join(" -> ")}${r.expires ? `; works until ${r.expires}` : ""}`);
  out.push("");
  for (const c of r.certificates) {
    out.push(`#${c.index} ${c.role}: ${c.subject || "(empty subject)"}`);
    out.push(`   issuer   ${c.issuer}`);
    out.push(`   valid    ${c.notBefore} to ${c.notAfter} (${Math.round(c.validityDays)} days)`);
    out.push(`   key      ${c.key}, signed ${c.signatureAlgorithm}${c.ca ? `, CA${c.pathLen !== null ? ` pathlen ${c.pathLen}` : ""}` : ""}`);
    if (c.san.length) out.push(`   names    ${c.san.join(", ")}`);
    out.push(`   sha256   ${c.sha256}`);
  }
  if (r.findings.length) {
    out.push("");
    for (const f of r.findings) out.push(`${f.severity.toUpperCase().padEnd(6)} ${f.type} [${f.where}]\n       ${f.message}`);
  }
  for (const n of r.notes) out.push(`\nnote: ${n}`);
  return out.join("\n");
}
