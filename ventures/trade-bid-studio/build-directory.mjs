// Regenerates trades.json from the *-bid-calculator ventures on disk, so the
// directory can never list a calculator that does not exist or miss one that
// does. Run: node build-directory.mjs  (the test fails when the file is stale).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ventures = fileURLToPath(new URL('..', import.meta.url));

const ACRONYMS = new Set(['hvac', 'ev', 'adu', 'led', 'pex', 'rv', 'ac', 'tv', 'pv', 'cnc', 'diy', 'dui', 'abs', 'pvc']);

export function titleFromSlug(slug) {
  return slug.replace(/-bid-calculator$/, '').split('-')
    .map(w => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

export function blurb(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  const first = text.split(/(?<=\.)\s/)[0];
  return first.length > 220 ? `${first.slice(0, 217).trimEnd()}…` : first;
}

export function readTrades() {
  return readdirSync(ventures).filter(d => d.endsWith('-bid-calculator') && existsSync(join(ventures, d, 'index.html'))).sort().map(slug => {
    const yaml = readFileSync(join(ventures, slug, 'VENTURE.yaml'), 'utf8');
    const m = yaml.match(/^description:\s*(.+)$/m);
    return { slug, title: titleFromSlug(slug), blurb: blurb(m ? m[1].replace(/^["']|["']$/g, '') : '') };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const trades = readTrades();
  writeFileSync(new URL('./trades.json', import.meta.url), `${JSON.stringify(trades, null, 1)}\n`);
  console.log(`wrote ${trades.length} trades`);
}
