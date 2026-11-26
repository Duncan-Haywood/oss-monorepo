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
//
// A product with hundreds of answers (einvoice-preflight: 396 from 99 pages,
// which would make a 245 KB llms.txt) would outgrow one fetch, the reason the
// site index is capped (backlog P052). Past INLINE_LIMIT the llms.txt keeps
// the questions, each linked to its page, and the answers go to a sibling
// llms-answers.txt that the section links; the test checks both files.
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', divide: '÷', sect: '§', deg: '°', plusmn: '±', le: '≤', ge: '≥', minus: '−' };

// A malformed reference past U+10FFFF stays as written instead of throwing.
const codePoint = (n, raw) => (n <= 0x10ffff ? String.fromCodePoint(n) : raw);

// Tags come off until nothing changes, so no `<...>` pair can survive, nested
// fragments such as `<scr<b>ipt>` included (CodeQL
// js/incomplete-multi-character-sanitization).
function stripTags(html) {
  let prev;
  let out = html;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out;
}

export function plainText(html) {
  return stripTags(html.replace(/<\/?(p|li|ul|ol|br|div|tr|td|th|table)\b[^>]*>/gi, ' '))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(Number(d), m))
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

// A slug is matched literally: regex metacharacters in a directory name are
// escaped rather than read as a pattern (CodeQL js/regex-injection).
const escapeRegExp = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The product's public base URL, read from the llms.txt itself so a product
// served under another path keeps it.
export function baseUrl(llms, slug) {
  const m = llms.match(new RegExp(`https://[^\\s)]+/${escapeRegExp(slug)}/`));
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

// The questions only, for an llms.txt whose answers live in llms-answers.txt.
export function questionsSection(pages, base) {
  const lines = ['## Answers', '', `The questions each page answers in its "Common questions" section, one line per page. The answers, word for word as the pages state them, are in [llms-answers.txt](${base}${ANSWERS_FILE}); each link opens that section of the page, which has the sources.`, ''];
  for (const { file, faq } of pages) {
    const name = file === 'index.html' ? 'index' : file.replace(/\.html$/, '');
    lines.push(`- [${linkText(name)}](${base}${file === 'index.html' ? '' : file}#faq): ${faq.map(({ q }) => q).join(' ')}`);
  }
  return lines.join('\n') + '\n';
}

// The sibling file: a title line, then the full section.
export function answersDoc(title, pages, base) {
  return `# ${title}: answers\n\n` + answersSection(pages, base).replace(/^## Answers\n\n/, '');
}

export const INLINE_LIMIT = 100_000;
export const ANSWERS_FILE = 'llms-answers.txt';

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
  const count = pages.reduce((n, p) => n + p.faq.length, 0);
  const answersPath = join(dir, ANSWERS_FILE);
  const answers = existsSync(answersPath) ? readFileSync(answersPath, 'utf8') : null;
  if (!pages.length) return { llms, next: llms, count, answers, nextAnswers: answers };
  const base = baseUrl(llms, slug);
  const inline = withAnswers(llms, answersSection(pages, base));
  if (Buffer.byteLength(inline) <= INLINE_LIMIT) return { llms, next: inline, count, answers, nextAnswers: null };
  const title = (llms.match(/^# (.+)$/m) || [null, slug])[1].trim();
  return { llms, next: withAnswers(llms, questionsSection(pages, base)), count, answers, nextAnswers: answersDoc(title, pages, base) };
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
    const { llms, next, count, answers, nextAnswers } = renderFor(dir);
    const split = nextAnswers !== null;
    if (next === llms && answers === nextAnswers) { console.log(`${dir}: current (${count} answers${split ? `, in ${ANSWERS_FILE}` : ''})`); continue; }
    if (check) { stale++; console.log(`${dir}: out of date, run node platform/pages/llms-answers.mjs ${dir}`); continue; }
    writeFileSync(join(dir, 'llms.txt'), next);
    if (split) writeFileSync(join(dir, ANSWERS_FILE), nextAnswers);
    else if (answers !== null) unlinkSync(join(dir, ANSWERS_FILE));
    console.log(`${dir}: wrote ${count} answers${split ? ` (questions in llms.txt, answers in ${ANSWERS_FILE})` : ''}`);
  }
  process.exit(stale ? 1 : 0);
}
