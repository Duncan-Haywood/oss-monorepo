#!/usr/bin/env node
// node cli.mjs --secret whsec_... --body body.json --headers headers.txt [--provider stripe] [--json] [--snippet]
// node cli.mjs --sign stripe --secret whsec_... --body body.json   # print headers for a local replay
import { readFileSync } from 'node:fs';
import { verify, sign, snippet, LABELS, PROVIDERS } from './webhook.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const secret = opt('--secret') ?? process.env.WEBHOOK_SECRET ?? '';
const bodyFile = opt('--body'); const headersFile = opt('--headers');
const provider = opt('--provider'); const signAs = opt('--sign');
const json = flag('--json'); const wantSnippet = flag('--snippet');
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch (e) { console.error(`cannot read ${f}: ${e.message}`); process.exit(2); } };

if (provider && !PROVIDERS.includes(provider)) { console.error(`--provider must be one of ${PROVIDERS.join(', ')}`); process.exit(2); }
if (wantSnippet) { console.log(snippet(provider || 'stripe')); process.exit(0); }
if (!bodyFile) { console.error('usage: cli.mjs --body <file> [--headers <file>] --secret <s> [--provider p] | --sign <provider> --body <file> --secret <s>'); process.exit(2); }
const body = read(bodyFile);
if (signAs) {
  for (const [k, v] of Object.entries(await sign(signAs, { body, secret }))) console.log(`${k}: ${v}`);
  process.exit(0);
}
const r = await verify({ provider, headers: headersFile ? read(headersFile) : '', body, secret });
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`${r.provider ? LABELS[r.provider] : 'Unknown provider'}: ${r.ok ? 'VERIFIED' : 'NOT VERIFIED'}`);
  for (const f of r.findings) console.log(`${f.severity.toUpperCase().padEnd(5)} ${f.message}`);
}
process.exit(r.ok ? 0 : 1);
