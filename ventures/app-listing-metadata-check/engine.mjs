// Pure rule engine: a store listing's text fields in, findings out. No I/O, so
// the CLI and the browser page run byte-for-byte the same checks.
//
// Two kinds of rule, and the split is the honest part. LIMITS are mechanical:
// a field over its character cap is refused at submit time, so it is a danger
// finding. Everything else is a HEURISTIC drawn from each store's published
// metadata guidelines (Apple App Review Guideline 2.3, Google Play's Metadata
// policy) and reported as a notice that says what it saw, never as a verdict
// on whether review will pass. SPEC_REVIEWED is the date the tables were last
// compared to the stores' own pages.

export const SPEC_REVIEWED = '2026-10-06';

export const LIMITS = {
  ios: { name: 30, subtitle: 30, keywords: 100, promotional_text: 170, description: 4000, release_notes: 4000 },
  play: { title: 30, short_description: 80, full_description: 4000 },
};

export const FIELD_LABELS = {
  name: 'App name', subtitle: 'Subtitle', keywords: 'Keyword field', promotional_text: 'Promotional text',
  description: 'Description', release_notes: 'Release notes',
  title: 'App title', short_description: 'Short description', full_description: 'Full description',
};

const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'by', 'your', 'you', 'my']);
// Words the store already indexes or that carry no ranking value in the keyword field.
const WASTED_KEYWORDS = new Set(['app', 'apps', 'ios', 'iphone', 'ipad', 'free', 'application', 'mobile', 'store', 'appstore']);
const PROMO_TERMS = ['free', 'best', 'top', 'new', 'sale', 'cheap', 'discount', '#1', 'no.1', 'number one', 'download now', 'install now', 'official'];
const PLACEHOLDERS = /lorem ipsum|\btbd\b|\btodo\b|your text here|insert (?:text|description)|placeholder text|coming soon!? *$/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const len = (s) => [...String(s ?? '')].length;
const words = (s) => (String(s ?? '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) || []);
const stem = (w) => w.replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '');

function finding(severity, id, field, title, detail) {
  return { severity, id, field, title, detail };
}

export function checkListing({ store = 'ios', fields = {}, avoid = [] } = {}) {
  if (!LIMITS[store]) throw new Error(`unknown store "${store}" (use ios or play)`);
  const out = [];
  const limits = LIMITS[store];
  const label = (f) => FIELD_LABELS[f] || f;

  // 1. Limits, and the one field that cannot be empty.
  const required = store === 'ios' ? 'name' : 'title';
  if (len(fields[required]).valueOf() === 0) {
    out.push(finding('danger', 'missing-required', required, `${label(required)} is empty`, `${label(required)} is required to submit a listing.`));
  }
  for (const [f, max] of Object.entries(limits)) {
    const n = len(fields[f]);
    if (n > max) {
      out.push(finding('danger', 'over-limit', f, `${label(f)} is ${n - max} over its limit`, `${label(f)} is ${n} characters; the limit is ${max}.`));
    }
  }

  // 2. Placeholder text anywhere.
  for (const f of Object.keys(limits)) {
    const m = String(fields[f] ?? '').match(PLACEHOLDERS);
    if (m) out.push(finding('danger', 'placeholder', f, `${label(f)} looks like placeholder text`, `Found "${m[0].trim()}". Placeholder content is a standard reason for a listing to be sent back.`));
  }

  // 3. Names and titles: promo claims, emoji, shouting.
  const nameField = store === 'ios' ? 'name' : 'title';
  const nameText = String(fields[nameField] ?? '');
  const lowerName = nameText.toLowerCase();
  const promoHits = PROMO_TERMS.filter((t) => (t.startsWith('#') || t.includes(' ') || t.includes('.') ? lowerName.includes(t) : words(nameText).includes(t)));
  if (promoHits.length) {
    const rule = store === 'ios' ? 'App Review Guideline 2.3.7 (names should not carry prices, terms or promotional descriptions)' : 'the Google Play metadata policy (no performance or promotional claims such as "best", "#1", "free" or "new" in the title)';
    out.push(finding(store === 'play' ? 'danger' : 'notice', 'promo-in-name', nameField, `${label(nameField)} contains a promotional term`, `Found: ${promoHits.join(', ')}. See ${rule}.`));
  }
  if (store === 'play' && EMOJI.test(nameText)) {
    out.push(finding('danger', 'emoji-in-title', nameField, 'Title contains an emoji', 'The Google Play metadata policy does not allow emoji in the app title.'));
  }
  const shouting = (nameText.match(/\b[A-Z]{4,}\b/g) || []);
  if (shouting.length >= 2 || (shouting.length === 1 && words(nameText).length > 2)) {
    out.push(finding('notice', 'all-caps', nameField, `${label(nameField)} uses ALL-CAPS words`, `Found: ${shouting.join(', ')}. Stores discourage excessive capitalisation in titles unless it is part of the brand.`));
  }
  if (/[!?]{2,}|[~*_=]{3,}/.test(nameText)) {
    out.push(finding('notice', 'repeated-symbols', nameField, `${label(nameField)} has repeated symbols`, 'Repeated punctuation in a name reads as decoration or keyword padding.'));
  }

  // 4. iOS keyword field.
  if (store === 'ios' && String(fields.keywords ?? '').length > 0) {
    const kw = String(fields.keywords);
    const items = kw.split(',');
    const nonEmpty = items.map((s) => s.trim()).filter(Boolean);
    const spacedPadding = items.reduce((a, s) => a + (s.length - s.trim().length), 0);
    if (spacedPadding > 0) {
      out.push(finding('notice', 'keyword-spaces', 'keywords', `${spacedPadding} character${spacedPadding === 1 ? '' : 's'} of the keyword field are spaces around commas`, 'Apple treats the commas as separators; spaces next to them spend part of the 100 characters and add nothing.'));
    }
    if (!kw.includes(',') && /\s/.test(kw.trim())) {
      out.push(finding('notice', 'keyword-separator', 'keywords', 'Keywords are separated by spaces, not commas', 'Separate keywords with commas, no spaces: "habit,streak,routine".'));
    }
    if (items.length > nonEmpty.length) {
      out.push(finding('notice', 'keyword-empty-entry', 'keywords', 'Keyword field has an empty entry', 'A leading, trailing or doubled comma spends a character and indexes nothing.'));
    }
    const seen = new Map();
    const dupes = new Set();
    const pairs = new Set();
    for (const w of nonEmpty.flatMap((s) => words(s))) {
      const s = stem(w);
      if (seen.has(w)) dupes.add(w);
      else if ([...seen.keys()].some((o) => o !== w && stem(o) === s)) pairs.add(`${[...seen.keys()].find((o) => stem(o) === s)}/${w}`);
      seen.set(w, true);
    }
    if (dupes.size) out.push(finding('notice', 'keyword-duplicate', 'keywords', 'A keyword is repeated', `Repeated: ${[...dupes].join(', ')}. The second copy spends characters for no extra ranking.`));
    if (pairs.size) out.push(finding('notice', 'keyword-plural', 'keywords', 'Singular and plural both present', `Pairs: ${[...pairs].join(', ')}. Apple matches the other form; one of each is wasted.`));
    const covered = new Set([...words(fields.name), ...words(fields.subtitle)].map(stem));
    const redundant = [...new Set(nonEmpty.flatMap((s) => words(s)).filter((w) => covered.has(stem(w)) && !STOPWORDS.has(w)))];
    if (redundant.length) out.push(finding('notice', 'keyword-in-name', 'keywords', 'Keywords repeat words already in the name or subtitle', `Already indexed from the name/subtitle: ${redundant.join(', ')}. Replace them with words that appear nowhere else in your metadata.`));
    const wasted = [...new Set(nonEmpty.flatMap((s) => words(s)).filter((w) => WASTED_KEYWORDS.has(w)))];
    if (wasted.length) out.push(finding('notice', 'keyword-generic', 'keywords', 'Keywords include generic words', `Low-value in this field: ${wasted.join(', ')}.`));
    const unused = 100 - len(kw);
    if (unused >= 10 && unused > 0) out.push(finding('notice', 'keyword-unused', 'keywords', `${unused} characters of the keyword field are unused`, 'The field is 100 characters; unused room is ranking surface left empty.'));
  }

  // 5. Subtitle that just repeats the name.
  if (store === 'ios' && fields.subtitle) {
    const n = new Set(words(fields.name).map(stem));
    const sub = words(fields.subtitle).filter((w) => !STOPWORDS.has(w));
    const rep = sub.filter((w) => n.has(stem(w)));
    if (sub.length && rep.length / sub.length >= 0.5) {
      out.push(finding('notice', 'subtitle-repeats-name', 'subtitle', 'Subtitle mostly repeats the name', `Repeated: ${rep.join(', ')}. The subtitle is indexed separately; new words there add search coverage.`));
    }
  }

  // 6. Long text: keyword stuffing and other-platform mentions.
  for (const f of store === 'ios' ? ['description', 'promotional_text', 'release_notes'] : ['short_description', 'full_description']) {
    const text = String(fields[f] ?? '');
    if (!text) continue;
    const ws = words(text).filter((w) => w.length > 3 && !STOPWORDS.has(w));
    if (ws.length >= 40) {
      const counts = new Map();
      for (const w of ws) counts.set(w, (counts.get(w) || 0) + 1);
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n >= 10 && n / ws.length > 0.06) {
        out.push(finding('notice', 'keyword-stuffing', f, `${label(f)} repeats "${top}" ${n} times`, `That is ${(100 * n / ws.length).toFixed(1)}% of its content words. Both stores prohibit keyword stuffing in descriptions.`));
      }
    }
    const other = store === 'ios' ? /\b(android|google play|play store)\b/i : /\b(ios|iphone|app store|apple)\b/i;
    const m = text.match(other);
    if (m && f !== 'release_notes') {
      out.push(finding('notice', 'other-platform', f, `${label(f)} mentions another platform`, `Found "${m[0]}". ${store === 'ios' ? 'App Review Guideline 2.3.10 asks metadata to stay focused on the iOS experience.' : 'Keep Play listing text about the Android app.'}`));
    }
  }

  // 7. Caller-supplied terms that must not appear (competitor names, trademarks).
  const terms = avoid.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  for (const f of Object.keys(limits)) {
    const hay = String(fields[f] ?? '').toLowerCase();
    const hit = terms.filter((t) => hay.includes(t));
    if (hit.length) out.push(finding('danger', 'avoided-term', f, `${label(f)} contains a term you asked to avoid`, `Found: ${hit.join(', ')}. Naming another app or brand in metadata is a standard rejection reason.`));
  }

  return { store, findings: out };
}

export function hasBlocking(findings) {
  return findings.some((f) => f.severity === 'danger');
}

export function summarizeLimits(store, fields) {
  return Object.entries(LIMITS[store]).map(([field, max]) => ({ field, label: FIELD_LABELS[field], used: len(fields[field]), max }));
}
