// Turning what someone says or types into values for a page's form fields.
//
// "2,400 square feet, eight twelve pitch, waste ten percent" should fill a
// roofing calculator without a model, a key or a download. This is the rule-
// based half of the site assistant (assistant/client.js): it runs everywhere,
// instantly, and its accuracy is measured rather than claimed — evals.json is
// a set of real sentences against real calculator forms, `assistant.test.mjs`
// fails if the score drops, and the Ask page prints the score the build
// measured. A model, when the visitor has one switched on, gets the same field
// list and its answer goes through `validateFills` here, so either path can
// only ever write a value the form itself would accept.
//
// Pure functions over plain field descriptors; no DOM. The browser half reads
// the page into descriptors (`readFields` in client.js) and applies the result.
//
// A field descriptor:
//   { key, label, type: 'number'|'select'|'checkbox'|'text'|'date',
//     min?, max?, step?, options?: [{ value, text }], value? }

const SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { thousand: 1e3, million: 1e6, billion: 1e9 };

// Words that carry no meaning for matching a field. Applied to the sentence and
// to every label alike, so a label word can never be unmatchable.
export const STOPWORDS = new Set(
  ('a an the is are was be been to of my our your its it i im we and or set make put about around roughly ' +
    'approximately approx at for in on that this so like um uh please change update would should will want need ' +
    'have has there their them they me us let lets say just also then plus value enter use using our new is its ' +
    'optional eg e g whats what how much many do does')
    .split(/\s+/),
);

// Spoken and written forms of the same unit, folded to one token so "square
// feet" meets a label that says "sq ft".
const SYNONYMS = {
  feet: 'ft', foot: 'ft', square: 'sq', pounds: 'lb', pound: 'lb', lbs: 'lb', hours: 'hr', hour: 'hr', hrs: 'hr',
  percent: 'pct', percentage: 'pct', pct: 'pct', miles: 'mi', mile: 'mi', qty: 'quantity', amount: 'amount',
  dollars: '', dollar: '', bucks: '', usd: '', hourly: 'hr',
};
// What someone sells a thing for is its price. Folded in what people say only,
// never in labels: a field called "Items already sold" is not a price.
const SPOKEN_SYNONYMS = {
  sell: 'price', sells: 'price', selling: 'price',
  weigh: 'weight', weighs: 'weight', weighing: 'weight',
  labor: 'wage', labour: 'wage',
};
const DIMENSIONS = [/\b(length|long|depth|deep)\b/i, /\b(width|wide)\b/i, /\b(height|high|tall|thickness)\b/i];
const PERCENT_WORDS = new Set(['percent', 'percentage', 'pct']);
const MONEY_WORDS = new Set(['dollars', 'dollar', 'bucks', 'usd']);
const YES = new Set(['yes', 'on', 'include', 'including', 'with', 'add', 'enable', 'enabled', 'check', 'true', 'turn']);
const NO = new Set(['no', 'off', 'without', 'exclude', 'excluding', 'remove', 'disable', 'disabled', 'uncheck', 'false', 'dont', 'not', 'none', 'skip']);
const CLAUSE_WORDS = new Set(['and', 'then', 'also', 'plus', 'next']);

/** A crude English stemmer: enough that "fees" meets "fee" and "pitches" meets "pitch". */
export function stem(word) {
  let w = word.toLowerCase().replace(/'s$/, '');
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The comparable tokens of a piece of text: lower-cased, unit-folded, stemmed, stopwords out. */
export function contentTokens(text, { spoken = false } = {}) {
  const out = [];
  const words = String(text)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/%/g, ' percent ')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/);
  for (const raw of words) {
    if (!raw || /^\d/.test(raw)) continue;
    const has = (map) => Object.prototype.hasOwnProperty.call(map, raw);
    const folded = spoken && has(SPOKEN_SYNONYMS) ? SPOKEN_SYNONYMS[raw] : has(SYNONYMS) ? SYNONYMS[raw] : raw;
    if (!folded || STOPWORDS.has(folded)) continue;
    out.push(stem(folded));
  }
  return out;
}

/**
 * Split text into words, numbers and separators, with spoken numbers already
 * turned into digits: "twenty four hundred" -> 2400, "two and a half" -> 2.5,
 * "1.5k" -> 1500, "$40" -> 40 (money), "13.6%" -> 13.6 (percent), "8/12" ->
 * 8/12 (a ratio, kept as both parts).
 */
export function tokenize(text) {
  const s = String(text)
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/([a-z])-([a-z])/gi, '$1 $2')
    .replace(/['’]/g, '')
    .toLowerCase();
  const raw = s.match(/\d+(?:\.\d+)?|[a-z]+|[$%/]|[,;!?]|\.(?!\d)/g) || [];
  const tokens = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (/^\d/.test(t)) {
      tokens.push({ kind: 'num', value: Number(t), text: t });
    } else if (SMALL[t] !== undefined || TENS[t] !== undefined || ((t === 'a' || t === 'one') && /^(hundred|thousand|million)$/.test(raw[i + 1] || ''))) {
      // A run of number words. "and" is allowed inside it ("two hundred and
      // fifty"), "point" starts decimals, "and a half" ends it.
      let total = 0;
      let current = 0;
      let text2 = '';
      let j = i;
      let decimals = '';
      for (; j < raw.length; j++) {
        const w = raw[j];
        if (SMALL[w] !== undefined) current += SMALL[w];
        else if (TENS[w] !== undefined) current += TENS[w];
        else if (w === 'a' && /^(hundred|thousand|million)$/.test(raw[j + 1] || '')) current += 1;
        else if (w === 'hundred') current = (current || 1) * 100;
        else if (SCALES[w] !== undefined) { total += (current || 1) * SCALES[w]; current = 0; }
        else if (w === 'and' && (SMALL[raw[j + 1]] !== undefined || TENS[raw[j + 1]] !== undefined) && /^(hundred|thousand|million)$/.test(raw[j - 1] || '')) continue;
        else if (w === 'point' && SMALL[raw[j + 1]] !== undefined) {
          j++;
          for (; j < raw.length && SMALL[raw[j]] !== undefined && SMALL[raw[j]] < 10; j++) decimals += String(SMALL[raw[j]]);
          j--;
        } else break;
        text2 += `${w} `;
      }
      let value = total + current;
      if (decimals) value = Number(`${value}.${decimals}`);
      if (raw[j] === 'and' && raw[j + 1] === 'a' && raw[j + 2] === 'half') { value += 0.5; j += 3; }
      tokens.push({ kind: 'num', value, text: text2.trim() });
      i = j - 1;
    } else if (t === 'half' && !(raw[i - 1] === 'a' && raw[i - 2] === 'and')) {
      // "half a pound": a lone half is a number. ("two and a half" is read above.)
      tokens.push({ kind: 'num', value: 0.5, text: 'half' });
    } else if (/^[,;!?.]$/.test(t)) {
      tokens.push({ kind: 'sep' });
    } else if (t === '$' || t === '%' || t === '/') {
      tokens.push({ kind: 'sym', s: t });
    } else {
      tokens.push({ kind: 'word', w: t });
    }
  }
  // Second pass: attach units and scales to the number they belong to.
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'sym' && t.s === '$' && tokens[i + 1]?.kind === 'num') { tokens[i + 1].money = true; continue; }
    if (t.kind !== 'num') { out.push(t); continue; }
    const next = tokens[i + 1];
    const ratioWord = next?.kind === 'word' && (next.w === 'over' || next.w === 'in') && tokens[i + 2]?.kind === 'num' && tokens[i + 2].value === 12;
    if ((next?.kind === 'sym' && next.s === '/' && tokens[i + 2]?.kind === 'num') || ratioWord) {
      const den = tokens[i + 2].value;
      t.ratio = [t.value, den];
      t.text = `${t.text}/${tokens[i + 2].text}`;
      i += 2;
    } else if (next?.kind === 'word' && next.w === 'k') {
      t.value *= 1000; i++;
    } else if (next?.kind === 'word' && SCALES[next.w] !== undefined) {
      t.value *= SCALES[next.w]; i++;
    } else if (next?.kind === 'word' && next.w === 'and' && tokens[i + 2]?.kind === 'word' && tokens[i + 2].w === 'a' && tokens[i + 3]?.w === 'half') {
      t.value += 0.5; i += 3;
    }
    const after = tokens[i + 1];
    if (after?.kind === 'sym' && after.s === '%') { t.percent = true; i++; }
    else if (after?.kind === 'word' && PERCENT_WORDS.has(after.w)) { t.percent = true; i++; }
    else if (after?.kind === 'word' && MONEY_WORDS.has(after.w)) { t.money = true; i++; }
    out.push(t);
  }
  return out;
}

/** Is this field's label about a percentage, or about money? */
function unitOf(label) {
  if (/%|percent|\brate\b/i.test(label)) return 'percent';
  if (/\$|cost|price|fee|wage|charge|budget|paid|pay\b|revenue|income|salary|spend/i.test(label)) return 'money';
  return '';
}

function prepare(fields) {
  const prepared = fields.map((field, index) => ({
    field,
    index,
    // "(row 2)" tells repeated rows apart for people; for matching, the rows are one field said again.
    tokens: [...new Set([...contentTokens(String(field.label || '').replace(/\s*\(row \d+\)$/, '')), ...contentTokens(field.key || '')])],
    same: String(field.label || '').replace(/\s*\(row \d+\)$/, '').toLowerCase(),
    unit: unitOf(field.label || ''),
    perTwelve: /\b12\b/.test(field.label || ''),
    options: (field.options || []).map((o) => {
      // "Electronics (8%)": the words in brackets describe the choice, they are not its name.
      const name = String(o.text || o.value).replace(/\([^)]*\)/g, ' ');
      const tokens = [...new Set(contentTokens(name))];
      return { ...o, tokens: tokens.length ? tokens : [...new Set(contentTokens(o.text || o.value))], num: Number(String(o.text).replace(/[^0-9.]/g, '')) };
    }),
  }));
  // Rarer label words decide more: "shipping" names three eBay fields, "label" one.
  const df = new Map();
  for (const p of prepared) for (const t of p.tokens) df.set(t, (df.get(t) || 0) + 1);
  const n = prepared.length || 1;
  const weight = (t) => Math.log(1 + n / (df.get(t) || n));
  return { prepared, weight };
}

function scoreField(p, words, weight) {
  let score = 0;
  for (const w of new Set(words)) if (p.tokens.includes(w)) score += weight(w);
  return score;
}

/** Group tokens into clauses at punctuation and "and"/"then". A clause with no number or choice in it joins the next one. */
function clauses(tokens) {
  const groups = [[]];
  for (const t of tokens) {
    if (t.kind === 'sep' || (t.kind === 'word' && CLAUSE_WORDS.has(t.w))) groups.push([]);
    else groups[groups.length - 1].push(t);
  }
  return groups.filter((g) => g.length);
}

function wordsOf(tokens) {
  return contentTokens(tokens.filter((t) => t.kind === 'word').map((t) => t.w).join(' '), { spoken: true });
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
}

/** Check one value against what the field accepts. Returns the value to write, or a reason it cannot be. */
export function checkValue(field, value) {
  if (field.type === 'checkbox') return { ok: true, value: Boolean(value) };
  if (field.type === 'select') {
    const opt = (field.options || []).find((o) => String(o.value) === String(value));
    return opt ? { ok: true, value: String(opt.value) } : { ok: false, reason: `"${value}" is not one of this field's choices` };
  }
  if (field.type === 'number') {
    const num = typeof value === 'number' ? value : Number(String(value).replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(num)) return { ok: false, reason: `"${value}" is not a number` };
    if (field.min !== undefined && field.min !== null && field.min !== '' && num < Number(field.min)) return { ok: false, reason: `${fmt(num)} is below this field's minimum of ${field.min}` };
    if (field.max !== undefined && field.max !== null && field.max !== '' && num > Number(field.max)) return { ok: false, reason: `${fmt(num)} is above this field's maximum of ${field.max}` };
    const step = Number(field.step);
    if (Number.isInteger(step) && step >= 1 && !Number.isInteger(num)) return { ok: false, reason: `this field takes whole numbers, not ${fmt(num)}` };
    return { ok: true, value: fmt(num) };
  }
  const text = String(value ?? '').trim();
  return text ? { ok: true, value: text } : { ok: false, reason: 'empty' };
}

/**
 * Read a sentence into field values without any model.
 *
 * Returns { fills: [{ key, label, value, from }], skipped: [{ text, reason }] }.
 * `from` is the words the value was read from, so the page can show its work.
 * Nothing is guessed: a number that matches no field, or two fields equally,
 * is reported in `skipped` rather than written somewhere plausible.
 */
export function parseUtterance(text, fields) {
  const { prepared, weight } = prepare(fields);
  const numeric = prepared.filter((p) => p.field.type === 'number' || (p.field.type === 'select' && p.options.length && p.options.every((o) => Number.isFinite(o.num) && String(o.text).trim() !== '')));
  const choice = prepared.filter((p) => p.field.type === 'select');
  const toggles = prepared.filter((p) => p.field.type === 'checkbox');
  const candidates = []; // { num, from, scores: [{p, score}] }
  const fills = [];
  const skipped = [];
  const taken = new Set();
  const toggled = []; // token sets of the toggles a clause named
  const tokens = tokenize(text);

  for (const clause of clauses(tokens)) {
    const nums = clause.map((t, i) => [t, i]).filter(([t]) => t.kind === 'num');
    const allWords = wordsOf(clause);

    // Toggles are read from the whole clause.
    const rawWords = clause.filter((t) => t.kind === 'word').map((t) => t.w.replace(/'/g, ''));
    if (toggles.length) {
      const scored = toggles.map((p) => ({ p, s: scoreField(p, allWords, weight) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      if (scored.length && !nums.length && (scored.length === 1 || scored[0].s > scored[1].s) && !taken.has(scored[0].p.field.key)) {
        const off = rawWords.some((w) => NO.has(w));
        const on = rawWords.some((w) => YES.has(w));
        const p = scored[0].p;
        taken.add(p.field.key);
        toggled.push(p.tokens);
        fills.push({ key: p.field.key, label: p.field.label, value: off ? false : on || true, from: rawWords.join(' ') });
      }
    }

    if (!nums.length) continue;
    // "price 40" (words first) or "40 dollar price" (number first): which side
    // of each number its name is on is decided once per clause.
    // Words before the first number count only if they name something on the
    // form: in "aim for a 25 percent margin" the name comes after.
    const lead = wordsOf(clause.slice(0, nums[0][1]));
    const before = lead.length > 0 && numeric.some((p) => scoreField(p, lead, weight) > 0);
    // "12 by 9 by 4 inches": a run of numbers joined by "by" or "x" is a set
    // of dimensions, written length, width, height, when the form has them.
    const chain = [];
    for (let i = 0; i < clause.length; i++) {
      if (clause[i].kind !== 'num') continue;
      const run = [i];
      while (clause[run[run.length - 1] + 1]?.kind === 'word' && /^(by|x)$/.test(clause[run[run.length - 1] + 1].w) && clause[run[run.length - 1] + 2]?.kind === 'num') run.push(run[run.length - 1] + 2);
      if (run.length > 1) { chain.push(...run); break; }
    }
    if (chain.length) {
      const dims = DIMENSIONS.map((re) => prepared.find((p) => p.field.type === 'number' && re.test(p.field.label) && !taken.has(p.field.key)));
      if (dims.slice(0, chain.length).every(Boolean)) {
        chain.forEach((at, k) => {
          const p = dims[k];
          const checked = checkValue(p.field, clause[at].value);
          if (checked.ok) { taken.add(p.field.key); fills.push({ key: p.field.key, label: p.field.label, value: checked.value, from: `${clause[at].text} (${['length', 'width', 'height'][k]})` }); }
          else skipped.push({ text: clause[at].text, reason: `${p.field.label}: ${checked.reason}` });
        });
        for (let k = nums.length - 1; k >= 0; k--) if (chain.includes(nums[k][1])) nums.splice(k, 1);
        if (!nums.length) continue;
      }
    }
    nums.forEach(([num, at], k) => {
      const start = before ? (k === 0 ? 0 : nums[k - 1][1] + 1) : at + 1;
      const end = before ? at : (k + 1 < nums.length ? nums[k + 1][1] : clause.length);
      const ctx = clause.slice(start, end);
      const words = wordsOf(ctx);
      const from = [...ctx.filter((t) => t.kind === 'word').map((t) => t.w), num.text].join(' ');
      const scores = numeric.map((p) => {
        let s = scoreField(p, words, weight);
        if (s > 0 && num.percent && p.unit === 'percent') s += 0.5;
        if (s > 0 && num.percent && p.unit === 'money') s -= 0.4;
        if (s > 0 && num.money && p.unit === 'money') s += 0.3;
        if (s > 0 && num.ratio && p.perTwelve) s += 0.5;
        return { p, s };
      });
      candidates.push({ num, from, words, scores });
    });
  }

  // Choices are read from the whole sentence, not one clause: "beauty and
  // personal care" is one option even though "and" splits clauses. An option
  // whose words are all inside a toggle the sentence just named ("no low-price
  // FBA" is the toggle, not the FBA choice) is that toggle talking.
  const everyWord = wordsOf(tokens);
  for (const p of choice) {
    if (taken.has(p.field.key)) continue;
    const labelScore = scoreField(p, everyWord, weight);
    let best = null;
    for (const o of p.options) {
      if (!o.tokens.length || !o.tokens.every((t) => everyWord.includes(t))) continue;
      if (toggled.some((set) => o.tokens.every((t) => set.includes(t)))) continue;
      const s = o.tokens.length * 2 + labelScore;
      if (!best || s > best.s) best = { o, s };
    }
    if (!best) {
      // "in clothing" for "Clothing & accessories": one word that only this
      // choice has, and that is long enough not to be a common filler, is enough.
      const distinctive = p.options.filter((o) => o.tokens.some((t) => t.length >= 4 && everyWord.includes(t)
        && !p.options.some((other) => other !== o && other.tokens.includes(t))));
      if (distinctive.length === 1 && !toggled.some((set) => distinctive[0].tokens.every((t) => set.includes(t)))) best = { o: distinctive[0] };
    }
    if (best) {
      taken.add(p.field.key);
      fills.push({ key: p.field.key, label: p.field.label, value: String(best.o.value), from: best.o.text });
    }
  }

  // Greedy: the most confident pairing first, so "shipping label cost 5,
  // shipping 6" gives the label to the stronger match before the weaker one.
  const pairs = [];
  candidates.forEach((c, ci) => c.scores.forEach(({ p, s }) => { if (s > 0) pairs.push({ ci, p, s }); }));
  pairs.sort((a, b) => b.s - a.s || a.p.index - b.p.index);
  const used = new Set();
  for (const { ci, p, s } of pairs) {
    if (used.has(ci) || taken.has(p.field.key)) continue;
    const c = candidates[ci];
    // Two different free fields equally good: say so rather than pick one.
    // Repeated rows (same label) are not a tie: the first free row takes it.
    const rivals = c.scores.filter((x) => x.s === s && x.p !== p && !taken.has(x.p.field.key) && x.p.same !== p.same);
    if (rivals.length) {
      used.add(ci);
      skipped.push({ text: c.from, reason: `matches ${[p, ...rivals.map((r) => r.p)].map((x) => `"${x.field.label}"`).join(' and ')} equally; say which` });
      continue;
    }
    let value = c.num.value;
    if (c.num.ratio) value = p.perTwelve && c.num.ratio[1] === 12 ? c.num.ratio[0] : c.num.ratio[0] / c.num.ratio[1];
    if (p.field.type === 'select') {
      const opt = p.options.find((o) => o.num === value);
      if (!opt) { used.add(ci); skipped.push({ text: c.from, reason: `${fmt(value)} is not one of "${p.field.label}"'s choices` }); continue; }
      value = opt.value;
    }
    const checked = checkValue(p.field, value);
    used.add(ci);
    if (!checked.ok) { skipped.push({ text: c.from, reason: `${p.field.label}: ${checked.reason}` }); continue; }
    taken.add(p.field.key);
    fills.push({ key: p.field.key, label: p.field.label, value: checked.value, from: c.from });
  }
  // A bare number on a form with one number field means that field.
  const numberFields = numeric.filter((p) => p.field.type === 'number');
  candidates.forEach((c, ci) => {
    if (used.has(ci)) return;
    if (!c.words.length && numberFields.length === 1 && !taken.has(numberFields[0].field.key)) {
      const p = numberFields[0];
      const checked = checkValue(p.field, c.num.value);
      if (checked.ok) { taken.add(p.field.key); fills.push({ key: p.field.key, label: p.field.label, value: checked.value, from: c.from }); return; }
    }
    skipped.push({ text: c.from, reason: 'no field on this page matches these words' });
  });
  fills.sort((a, b) => fields.findIndex((f) => f.key === a.key) - fields.findIndex((f) => f.key === b.key));
  return { fills, skipped };
}

/**
 * Check a model's proposed values (an object of key -> value) against the
 * form. Unknown keys and values the field would refuse are dropped and
 * reported, never written.
 */
export function validateFills(proposed, fields) {
  const fills = [];
  const skipped = [];
  if (!proposed || typeof proposed !== 'object') return { fills, skipped: [{ text: String(proposed), reason: 'the model did not return field values' }] };
  for (const [key, value] of Object.entries(proposed)) {
    const field = fields.find((f) => f.key === key);
    if (!field) { skipped.push({ text: key, reason: 'the model named a field this page does not have' }); continue; }
    if (value === null || value === undefined || value === '') continue;
    let v = value;
    if (field.type === 'select' && !(field.options || []).some((o) => String(o.value) === String(v))) {
      const byText = (field.options || []).find((o) => String(o.text).toLowerCase() === String(v).toLowerCase());
      if (byText) v = byText.value;
    }
    const checked = checkValue(field, v);
    if (!checked.ok) { skipped.push({ text: `${field.label}: ${value}`, reason: checked.reason }); continue; }
    fills.push({ key, label: field.label, value: checked.value, from: 'model' });
  }
  return { fills, skipped };
}

/** The first JSON object in a model's reply, or null. Small models wrap JSON in prose and fences. */
export function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** A JSON Schema for the form: what a model is asked to fill, and what an agent's tool call takes. */
export function fieldSchema(fields) {
  const properties = {};
  for (const f of fields) {
    const p = { description: f.label };
    if (f.type === 'number') {
      p.type = 'number';
      if (f.min !== undefined && f.min !== '' && f.min !== null) p.minimum = Number(f.min);
      if (f.max !== undefined && f.max !== '' && f.max !== null) p.maximum = Number(f.max);
    } else if (f.type === 'select') {
      p.type = 'string';
      p.enum = (f.options || []).map((o) => String(o.value));
      p.description = `${f.label}. Choices: ${(f.options || []).map((o) => `${o.value} = ${o.text}`).join('; ')}`;
    } else if (f.type === 'checkbox') p.type = 'boolean';
    else p.type = 'string';
    properties[f.key] = p;
  }
  return { type: 'object', properties, additionalProperties: false };
}

/** "Item price 40 → 55; Shipping 6 → 8" — what changed, in words a screen reader or a speaker can say. */
export function describeFills(fills, fields = []) {
  return fills
    .map((f) => {
      const field = fields.find((x) => x.key === f.key);
      let shown = f.value;
      if (field?.type === 'select') shown = (field.options || []).find((o) => String(o.value) === String(f.value))?.text ?? f.value;
      if (field?.type === 'checkbox') shown = f.value ? 'on' : 'off';
      return `${f.label} to ${shown}`;
    })
    .join(', ');
}
