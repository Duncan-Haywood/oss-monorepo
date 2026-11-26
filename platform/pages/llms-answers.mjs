// The "## Answers" section of a product's llms.txt, generated from the visible
// "Common questions" block (<section id="faq">) on each of its pages.
//
// Why: answer engines read llms.txt to decide what a site can answer. A list of
// tool links says what exists; the questions and their answers, word for word
// as the pages show them, say what a reader can quote and where it came from.
// Copying them by hand drifts the first time a page's FAQ changes, so this
// script writes the section and llms-answers.test.mjs fails when any llms.txt
// that carries one is out of date.
//
// Opt a product in by running it once:
//   node platform/pages/llms-answers.mjs ventures/<slug>
// and re-run it after editing a page's FAQ (`--check` only reports).
// The section replaces an existing "## Answers" up to the next "## " heading;
// otherwise it goes before "## Products in development" or "## Source", or last.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', divide: '÷', sect: '§', deg: '°', plusmn: '±', le: '≤', ge: '≥', minus: '−' };

export function plainText(html) {
  return html
    .replace(/<\/?(p|li|ul|ol|br|div|tr|td|th|table)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// Question/answer pairs from a page's <section id="faq">: each <h3> is a
// question, everything up to the next <h3> (or the section's end) its answer.
export function extractFaq(html) {
  const m = html.match(/<section\b[^>]*\bid="faq"[^>]*>([\s\S]*?)<\/section>/);
  if (!m) return [];
  const parts = m[1].split(/<h3\b[^>]*>/).slice(1);
  return parts
    .map((part) => {
      const [q, ...rest] = part.split(/<\/h3>/);
      return { q: plainText(q), a: plainText(rest.join('')) };
    })
    .filter((x) => x.q && x.a);
}

// The product's public base URL, read from the llms.txt itself so a product
// served under another path keeps it.
export function baseUrl(llms, slug) {
  const m = llms.match(new RegExp(`https://[^\\s)]+/${slug}/`));
  return m ? m[0] : `https://marisstella.app/${slug}/`;
}

// Square brackets inside a Markdown link's text would end it early.
const linkText = (t) => t.replace(/[[\]]/g, (c) => `\\${c}`);

export function answersSection(pages, base) {
  const lines = ['## Answers', '', 'The questions each page answers in its "Common questions" section, with the answer as the page states it. Each link opens that section; the page has the sources.', ''];
  for (const { file, faq } of pages) {
    const url = `${base}${file === 'index.html' ? '' : file}#faq`;
    for (const { q, a } of faq) lines.push(`- [${linkText(q)}](${url}): ${a}`);
  }
  return lines.join('\n') + '\n';
}

export function withAnswers(llms, section) {
  const text = llms.endsWith('\n') ? llms : llms + '\n';
  const at = text.search(/^## Answers[ \t]*$/m);
  if (at >= 0) {
    const after = text.slice(at + 1).search(/^## /m);
    const end = after < 0 ? text.length : at + 1 + after;
    return text.slice(0, at) + section + (after < 0 ? '' : '\n') + text.slice(end);
  }
  for (const h of ['## Products in development', '## Source']) {
    const pos = text.search(new RegExp(`^${h}`, 'm'));
    if (pos >= 0) return text.slice(0, pos) + section + '\n' + text.slice(pos);
  }
  return text + '\n' + section;
}

// The llms.txt a product directory should carry: index.html first, then the
// other pages by file name, each with its visible FAQ.
export function renderFor(dir) {
  const slug = basename(dir);
  const llms = readFileSync(join(dir, 'llms.txt'), 'utf8');
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  const pages = files.map((file) => ({ file, faq: extractFaq(readFileSync(join(dir, file), 'utf8')) })).filter((p) => p.faq.length);
  return { llms, next: pages.length ? withAnswers(llms, answersSection(pages, baseUrl(llms, slug))) : llms, count: pages.reduce((n, p) => n + p.faq.length, 0) };
}

// Products that have opted in: their llms.txt already has the section.
export function optedIn(venturesDir) {
  return readdirSync(venturesDir)
    .map((d) => join(venturesDir, d))
    .filter((d) => existsSync(join(d, 'llms.txt')) && /^## Answers[ \t]*$/m.test(readFileSync(join(d, 'llms.txt'), 'utf8')));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dirs = args.filter((a) => a !== '--check');
  let stale = 0;
  for (const dir of dirs) {
    const { llms, next, count } = renderFor(dir);
    if (next === llms) { console.log(`${dir}: current (${count} answers)`); continue; }
    if (check) { stale++; console.log(`${dir}: out of date, run node platform/pages/llms-answers.mjs ${dir}`); continue; }
    writeFileSync(join(dir, 'llms.txt'), next);
    console.log(`${dir}: wrote ${count} answers`);
  }
  process.exit(stale ? 1 : 0);
}
