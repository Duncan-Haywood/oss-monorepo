// Reproduce a venture page's *first-load* result without a browser.
//
// FAQ copy has to quote numbers the visitor actually sees. Inventing them, or
// re-deriving them by hand from calc.mjs, is how a "Common questions" block ends
// up contradicting the calculator directly above it — and because the copy is
// what `faqEntries()` turns into `FAQPage` schema, a wrong number there is also
// a wrong number handed to search engines and assistants.
//
// The trap this exists to close: reading each control's default straight out of
// the markup is correct for most pages and badly wrong for some. `stair-lift`
// and `walk-in-tub` ship their rate fields *empty* and fill them at load from
// `suggested*Kit()` (stair-lift/index.html lines 653-656). Read the markup alone
// and you get zero hours, zero material, and a $136.56 price — a number no
// visitor has ever seen. Applying the kits the way the page does gives the real
// $4,855.02. Both shapes are legitimate; a grounding tool has to handle both.
//
//   node platform/pages/venture-defaults.mjs <slug> [...]        # human-readable
//   node platform/pages/venture-defaults.mjs --json <slug> [...] # machine-readable
//
// A `!? still blank` line means a control was left empty even after the kits
// ran. `proposedPrice` is expected there — it is the optional "what if I bid
// X?" comparison field. Anything else means this tool did not reproduce the
// page and its numbers should not be quoted.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Ids named by a `const NAME = ['a', 'b']` list, tolerating line wrapping. */
function idList(html, name) {
  const m = html.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]) : [];
}

/**
 * One control's default, resolved the way a browser would.
 *
 * `calc` is consulted only for a `<select>` the page fills from JS at load, which
 * has no static `<option>` to read. The wiring call names the array exactly, so
 * read that rather than guessing an export name from the id — `fillSelect('rail',
 * RAIL_PRESETS)` is guessable, `fillSelect('cell', FOAM_TYPES)` is not.
 */
export function defaultFor(html, id, calc = {}) {
  const sel = html.match(new RegExp(`<select[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</select>`, 'i'));
  if (sel) {
    const opts = [...sel[1].matchAll(/<option([^>]*)>/gi)].map((o) => o[1]);
    const chosen = opts.find((a) => /\bselected\b/i.test(a)) ?? opts[0] ?? '';
    const v = chosen.match(/value=["']([^"']*)["']/i);
    if (v) return v[1];

    const wired = html.match(new RegExp(`fillSelect\\(\\s*['"]${id}['"]\\s*,\\s*(\\w+)`));
    for (const name of [wired?.[1], `${id.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_PRESETS`]) {
      const preset = name && calc[name];
      if (Array.isArray(preset) && preset.length) return preset[0].id ?? preset[0].value ?? '';
    }
    return '';
  }

  const tag = html.match(new RegExp(`<input[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
  if (!tag) return undefined;
  if (/type=["']checkbox["']/i.test(tag[0])) return /\bchecked\b/i.test(tag[0]);
  const v = tag[0].match(/value=["']([^"']*)["']/i);
  return v ? v[1] : '';
}

/**
 * The input object the page would hand its calculator on first load, plus the
 * ids still blank afterwards.
 */
export function defaultInput(html, calc) {
  // Which constants `readInput()` reads varies by page — `FIELD_IDS` on some,
  // `JOB_IDS`/`RATE_IDS`/`COST_IDS` on others — so discover them from the
  // function itself rather than assuming a naming convention, and keep the
  // common three as a fallback for pages that assemble input another way.
  const body = html.match(/function readInput\s*\([\s\S]*?\n {4}\}/)?.[0] ?? '';
  const names = new Set([...body.matchAll(/\b([A-Z][A-Z0-9_]*_IDS)\b/g)].map((m) => m[1]));
  for (const n of ['FIELD_IDS', 'FLAG_IDS', 'SELECT_IDS']) names.add(n);

  const input = {};
  for (const id of [...names].flatMap((n) => idList(html, n))) {
    const d = defaultFor(html, id, calc);
    if (d !== undefined) input[id] = d;
  }

  // Apply the load-time kits. A kit is keyed off the select its name matches
  // (`suggestedRailKit` <- `rail`), and never overwrites a field that already
  // carries a value — the same rule `applyKit()` uses on the page, where an
  // edited field is left alone.
  for (const [name, fn] of Object.entries(calc)) {
    const m = /^suggested(\w+?)Kit$/.exec(name);
    if (!m || typeof fn !== 'function') continue;
    const key = m[1][0].toLowerCase() + m[1].slice(1);
    let kit;
    try {
      kit = fn(input[key]);
    } catch {
      continue; // A kit that needs an argument this page has no select for.
    }
    for (const [k, v] of Object.entries(kit ?? {})) {
      if (input[k] === '' || input[k] === undefined) input[k] = v;
    }
  }

  const blank = Object.entries(input).filter(([, v]) => v === '').map(([k]) => k);
  return { input, blank };
}

/** Default input and computed result for one venture slug. */
export async function ground(slug) {
  const dir = path.join(REPO, 'ventures', slug);
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  const calc = await import(pathToFileURL(path.join(dir, 'calc.mjs')).href);
  const { input, blank } = defaultInput(html, calc);

  const entry = Object.keys(calc).find((k) => /^calculate/.test(k));
  if (!entry) throw new Error(`${slug}: no exported calculate* entry point`);

  return { slug, entry, input, blank, result: calc[entry](input) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const slugs = args.filter((a) => !a.startsWith('--'));

  if (!slugs.length) {
    console.error('usage: node platform/pages/venture-defaults.mjs [--json] <slug> [...]');
    process.exit(2);
  }

  // A tool that seeds its rows in the DOM (a `STARTING_*` repeater) or fills a
  // rate from a load-time kit throws here — this reproduces first load without a
  // browser, and there is nothing to read a `<select>` or run `addRow` against.
  // That is the honest failure this tool's header describes: its numbers should
  // not be quoted. Catch it per-slug so one such page does not abort a batch,
  // and point at the browser oracle that *can* ground it.
  const ORACLE_HINT =
    'builds its inputs in the DOM (a STARTING_* repeater or a load-time kit); ' +
    'ground it with: node platform/pages/price-oracle.mjs --dist=<built site> ';
  const out = [];
  let failed = 0;
  for (const slug of slugs) {
    let g;
    try {
      g = await ground(slug);
    } catch (err) {
      failed++;
      if (json) {
        out.push({ slug, error: err.message, groundWith: `price-oracle.mjs ${slug}` });
      } else {
        console.log(`\n########## ${slug} ##########`);
        console.log(`!? cannot ground headlessly: ${err.message}`);
        console.log(`   ${ORACLE_HINT}${slug}`);
      }
      continue;
    }
    if (json) {
      out.push(g);
      continue;
    }
    console.log(`\n########## ${g.slug}  (${g.entry}) ##########`);
    if (g.blank.length) console.log(`!? still blank after kits: ${g.blank.join(', ')}`);
    console.log('--- default input ---');
    console.log(JSON.stringify(g.input, null, 1));
    console.log('--- result ---');
    console.log(JSON.stringify(g.result, null, 1));
  }
  if (json) console.log(JSON.stringify(out, null, 2));
  // A non-zero exit lets a caller tell "grounded everything" from "some pages
  // need the browser oracle" without parsing output.
  if (failed) process.exitCode = 1;
}
