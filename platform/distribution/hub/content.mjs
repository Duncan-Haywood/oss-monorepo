// Platform-native content from a write-up's own words.
//
// `compose.mjs` used to build every post variant from the item's title and
// one-sentence description alone, so X, LinkedIn, Reddit and a video script
// all said the same thing: "New write-up: <title>", one sentence, a link.
// That is an announcement, not content. A reader on LinkedIn or Reddit needs
// the finding itself, and the body of a post has it.
//
// This module reads the post body and picks its strongest sentences, then
// lays them out in each platform's native shape: a numbered thread (X,
// Bluesky, Threads, Mastodon), a LinkedIn post with the findings as bullets,
// a Reddit body with a TL;DR, findings and limits, a Hacker News first
// comment, carousel slides and a spoken video script.
//
// THE RULE: EXTRACT, NEVER WRITE
//
// Every sentence a reader sees comes word for word from the post (markdown
// stripped, and clipped on a word with "…" only when a platform's limit
// forces it). The only words this module adds are fixed labels ("What the
// data showed", "Limits", "1/4") and the disclosure line `compose.mjs` passes
// in. So a draft can be no more wrong than the post it came from, which is
// the never-fabricate rule in `prompts/goals.md` made mechanical. It is
// deterministic and calls no model, so it costs nothing and re-runs give the
// same text (the hub's stateless de-duplication depends on that).
//
// Scoring is a plain heuristic: sentences with numbers (findings), sentences
// from the opening paragraph (the claim), and sentences of a length a feed can
// carry rank up; file paths, "Script:" lines and repository housekeeping rank
// down. Limits are sentences that say what the result does not show.

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
// Characters where one UTF-16 unit is always one grapheme (no combining marks, joiners, surrogates or "\r\n").
// Segmenting a whole article costs seconds; a string made only of these is measured and cut by index instead.
const SIMPLE = /^[\n\t\x20-\x7e\u00a0-\u02ff\u2010-\u2027\u2030-\u205e\u20ac\u2190-\u21ff\u2212]*$/;
/** Length in graphemes, which is what platforms count. */
export const glen = (s) => { const t = String(s); return SIMPLE.test(t) ? t.length : [...seg.segment(t)].length; };
/** The first `n` graphemes. */
export const graphemes = (s, n) => { const t = String(s); return SIMPLE.test(t) ? t.slice(0, n) : [...seg.segment(t)].slice(0, n).map((x) => x.segment).join(''); };

/** Clip to `max` graphemes on a word boundary, ending in "…". */
export function clipWords(s, max) {
  const str = String(s);
  if (glen(str) <= max) return str;
  if (max <= 1) return '';
  const g = graphemes(str, max - 1);
  const cut = g.replace(/\s+\S*$/, '');
  return (cut.length >= g.length * 0.6 ? cut : g).replace(/[\s,;:–—-]+$/, '') + '…';
}

/** Markdown inline syntax to plain text: links keep their words, code keeps its text. */
export function plain(s) {
  // Code spans are kept exactly ("<n>", "x * pitch" mean something there); markup is stripped only between them.
  const prose = (t) => t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2');
  return String(s)
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part.slice(1, -1) : prose(part)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Blocks of a markdown body: { kind: 'p'|'li'|'h', text }. Code, tables, quotes' markers and HTML blocks are dropped. */
export function blocks(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let fence = false;
  const flush = () => { if (para.length) out.push({ kind: 'p', text: plain(para.join(' ')) }); para = []; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) { flush(); fence = !fence; continue; }
    if (fence) continue;
    if (!line.trim()) { flush(); continue; }
    if (/^\s*\|/.test(line) || /^\s*<\/?[a-z]/i.test(line)) { flush(); continue; }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ kind: 'h', text: plain(h[1]) }); continue; }
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { flush(); out.push({ kind: 'li', text: plain(li[1]) }); continue; }
    if (/^\s+\S/.test(raw) && out.length && out[out.length - 1].kind === 'li' && !para.length) {
      out[out.length - 1].text += ` ${plain(line)}`;
      continue;
    }
    para.push(line.replace(/^\s*>\s?/, ''));
  }
  flush();
  return out.filter((b) => b.text);
}

// Words that end in a full stop without ending a sentence.
const ABBREV = /(?:\b(?:e\.g|i\.e|vs|etc|approx|Dr|Mr|Mrs|Ms|No|Fig|cf|al|St|Inc|Ltd|Jr|Sr|U\.S|U\.K)|\b[A-Z])\.$/;

/** Sentences of a plain-text paragraph. Decimals ("1.5") and common abbreviations do not split. */
export function sentences(text) {
  const parts = String(text).split(/(?<=[.!?])\s+(?=["“(\[]?[A-Z0-9])/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

const HOUSEKEEPING = /(\b[\w-]+\/[\w./-]+\.(?:mjs|js|py|rs|md|json|yaml|yml|csv|toml)\b|^(?:Script|Source|Output|Code|Data|Run|See|Files?)\s*:|\bPR\s*#?\d|\bpull request\b|\brun record\b|\bCLAUDE\.md\b|\bthis (?:PR|run|session|post)\b|\bagent doc\b)/i;
const NUMBER = /\d/;
const LIMIT = /\b(?:not|cannot|can't|doesn't|does not|only|limit(?:s|ed|ation)?|caveat|honest(?:ly)?|without|cost|untested|unknown|unlabelled|unlabeled|small sample|no labels)\b/i;
const CONTRAST = /\b(?:but|however|although|while|yet|instead)\b/i;

/** Score one sentence. Higher is a better standalone line for a feed. */
export function score(s, { lead = false } = {}) {
  const n = glen(s);
  let v = 0;
  if (NUMBER.test(s)) v += 2 + Math.min(2, (s.match(/\d+(?:[.,]\d+)?/g) || []).length * 0.4);
  if (/[%$£€×]|\bper cent\b|\bpercent\b|\btimes\b/i.test(s)) v += 0.5;
  if (lead) v += 1.5;
  if (CONTRAST.test(s)) v += 0.5;
  if (n < 40) v -= 3;
  else if (n > 280) v -= 1.5;
  if (HOUSEKEEPING.test(s)) v -= 5;
  if (/[:]$/.test(s)) v -= 3; // introduces a list; reads as a fragment on its own
  return v;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * What a post says, ready to lay out: the lead sentence, the best key points
 * (in the post's own order), and its stated limits. Pure.
 */
export function extract(body, { description = '', points = 4, limits = 2 } = {}) {
  const bs = blocks(body);
  const all = [];
  let firstPara = true;
  for (const b of bs) {
    if (b.kind === 'h') continue;
    // A list item is one point unless it is a paragraph in disguise (a bold lead-in and several sentences).
    const ss = b.kind === 'li' && glen(b.text) <= 280 ? [b.text] : sentences(b.text);
    ss.forEach((s) => all.push({ s, i: all.length, lead: firstPara && b.kind === 'p', score: score(s, { lead: firstPara && b.kind === 'p' }) }));
    if (b.kind === 'p') firstPara = false;
  }
  const usable = all.filter((x) => x.score > -2);
  const descKey = norm(description);
  const isDup = (a, b) => { const x = norm(a); const y = norm(b); if (!x || !y) return false; return x === y || (x.length > 30 && (x.includes(y) || y.includes(x))); };

  const lead = usable.find((x) => x.lead && !HOUSEKEEPING.test(x.s))?.s || usable[0]?.s || description;
  const ranked = [...usable].filter((x) => x.s !== lead && !isDup(x.s, descKey)).sort((a, b) => b.score - a.score || a.i - b.i);
  const keys = [];
  for (const x of ranked) {
    if (keys.length >= points) break;
    if (x.score < 0.5) break;
    if (keys.some((k) => isDup(k.s, x.s))) continue;
    keys.push(x);
  }
  const lim = usable
    .filter((x) => LIMIT.test(x.s) && x.s !== lead && !keys.includes(x) && !HOUSEKEEPING.test(x.s))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limits);
  const order = (xs) => [...xs].sort((a, b) => a.i - b.i).map((x) => x.s);
  return { lead, points: order(keys), limits: order(lim), headings: bs.filter((b) => b.kind === 'h').map((b) => b.text) };
}

/**
 * A numbered thread. `max` is the per-post limit, `link` and `footer` go in
 * the last post, never clipped. At most `maxPosts` posts.
 */
export function thread({ title, lead, points }, { max, link, footer = '', maxPosts = 6 }) {
  const NUM = 7; // room for " 10/10"
  const body = [];
  body.push(clipWords(`${title}\n\n${lead}`, max - NUM));
  for (const p of points.slice(0, maxPosts - 2)) body.push(clipWords(p, max - NUM));
  const last = `Full write-up, data and code: ${link}${footer ? `\n\n${footer}` : ''}`;
  body.push(glen(last) + NUM <= max ? last : `${link}${footer && glen(`${link}\n\n${footer}`) + NUM <= max ? `\n\n${footer}` : ''}`);
  const n = body.length;
  return body.map((t, i) => `${t} ${i + 1}/${n}`);
}

/** A LinkedIn-style long post. `head` must open it (the template marker). */
export function longPost({ head, lead, points, limits }, { max, link, footer = '' }) {
  const build = (pts, lims) => {
    const parts = [head, '', lead];
    if (pts.length) parts.push('', 'What the data showed:', ...pts.map((p) => `• ${p}`));
    if (lims.length) parts.push('', `The limits: ${lims.join(' ')}`);
    return parts.join('\n');
  };
  const tail = ['', '', `Full write-up: ${link}`, ...(footer ? ['', footer] : [])].join('\n');
  const room = max - glen(tail);
  // Drop limits, then findings, from the end until it fits; clip only as a last resort. The link and footer always survive.
  let pts = points;
  let lims = limits;
  while (glen(build(pts, lims)) > room && lims.length) lims = lims.slice(0, -1);
  while (glen(build(pts, lims)) > room && pts.length > 1) pts = pts.slice(0, -1);
  return clipWords(build(pts, lims), room) + tail;
}

/** A Reddit self-post body: TL;DR, the lead, findings, limits, link, disclosure. */
export function redditBody({ description, lead, points, limits }, { link, disclosure }) {
  const out = [`**TL;DR:** ${description}`, '', lead];
  if (points.length) out.push('', '**What we found**', '', ...points.map((p) => `- ${p}`));
  if (limits.length) out.push('', '**Limits**', '', ...limits.map((p) => `- ${p}`));
  out.push('', `Full write-up with the data and code: ${link}`, '', disclosure);
  return out.join('\n');
}

/** The submitter's first comment on Hacker News: context, limits, where the data is. Plain text. */
export function hnComment({ lead, points, limits }, { link, disclosure }) {
  const out = [lead];
  if (points[0]) out.push('', points[0]);
  if (limits.length) out.push('', `Limits: ${limits.join(' ')}`);
  out.push('', `Data and code are linked from the post: ${link}`, '', disclosure);
  return out.join('\n');
}

/** Carousel slides (Instagram, LinkedIn document posts): title, one finding per slide, close. */
export function slides({ title, lead, points }, { close, perSlide = 220, max = 8 }) {
  const out = [{ role: 'title', text: clipWords(title, 120) }, { role: 'claim', text: clipWords(lead, perSlide) }];
  for (const p of points.slice(0, max - 3)) out.push({ role: 'finding', text: clipWords(p, perSlide) });
  out.push({ role: 'close', text: close });
  return out;
}

/** A 30-45 s spoken script, every spoken line quoted from the post. */
export function videoScript({ title, lead, points }, { url, close }) {
  const hook = points.find((p) => NUMBER.test(p)) || lead;
  const rest = points.filter((p) => p !== hook).slice(0, 2);
  return [
    `HOOK (0-3 s, on screen): ${clipWords(title, 90)}`,
    `SAY (3-10 s): ${clipWords(hook, 200)}`,
    `SAY (10-18 s): ${clipWords(lead, 200)}`,
    ...rest.map((p, i) => `SAY (${18 + i * 8}-${26 + i * 8} s): ${clipWords(p, 200)}`),
    `SHOW (on screen throughout): scroll ${url} to the chart, table or number being read out`,
    `CLOSE: "${close}"`,
  ].join('\n');
}
