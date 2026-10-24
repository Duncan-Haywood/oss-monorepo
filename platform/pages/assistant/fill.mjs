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
  house: 'home', bought: 'paid', buy: 'paid',
};
const DIMENSIONS = [/\b(length|long|depth|deep)\b/i, /\b(width|wide)\b/i, /\b(height|high|tall|thickness)\b/i];
const PERCENT_WORDS = new Set(['percent', 'percentage', 'pct']);
const MONEY_WORDS = new Set(['dollars', 'dollar', 'bucks', 'usd']);
const YES = new Set(['yes', 'on', 'include', 'including', 'with', 'add', 'enable', 'enabled', 'check', 'true', 'turn']);
const NO = new Set(['no', 'off', 'without', 'exclude', 'excluding', 'remove', 'disable', 'disabled', 'uncheck', 'false', 'dont', 'not', 'none', 'skip']);
// Units that, said right after a number, belong to that number ("2,200 square feet").
const UNIT_WORDS = new Set(('square feet foot ft sq pounds pound lbs lb miles mile mi hours hour hrs hr minutes minute mins '
  + 'days day weeks week months month years year inches inch percent').split(' '));
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
    .toLowerCase()
    // "listing it at 19" is a price, not the "Promoted listings" field.
    .replace(/\blist(?:ing|ed)?\s+(?:it\s+)?(?:at|for)\b/g, 'price');
  const raw = s.match(/\d+(?:\.\d+)?|[a-z]+|[$%/]|[,;!?]|\.(?!\d)/g) || [];
  const tokens = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (/^\d/.test(t)) {
      tokens.push({ kind: 'num', value: Number(t), text: t });
    } else if (t === 'one' && /^(time|off|way)$/.test(raw[i + 1] || '')) {
      // "a one-time clean" names a kind of job, not a quantity.
      tokens.push({ kind: 'word', w: t });
    } else if (SMALL[t] !== undefined || TENS[t] !== undefined || ((t === 'a' || t === 'one') && /^(hundred|thousand|million)$/.test(raw[i + 1] || ''))) {
      // A run of number words. "and" is allowed inside it ("two hundred and
      // fifty"), "point" starts decimals, "and a half" ends it.
      let total = 0;
      let current = 0;
      let text2 = '';
      let j = i;
      let decimals = '';
      let pair = null;
      for (; j < raw.length; j++) {
        const w = raw[j];
        // "twelve fifty": two spoken groups with no "hundred" between them.
        // As money that is 12.50; as anything else, 1250. Adding them (62)
        // is right in no reading, so the pair is kept for the field to decide.
        if (!total && current >= 10 && current < 100 && raw[j - 1] !== 'hundred' && ((SMALL[w] ?? 0) >= 10 || TENS[w] !== undefined)) {
          let second = SMALL[w] ?? TENS[w];
          text2 += `${w} `;
          if (TENS[w] !== undefined && SMALL[raw[j + 1]] !== undefined && SMALL[raw[j + 1]] < 10) { j++; second += SMALL[raw[j]]; text2 += `${raw[j]} `; }
          pair = [current, second];
          current = current * 100 + second;
          j++;
          break;
        }
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
      tokens.push({ kind: 'num', value, text: text2.trim(), ...(pair ? { pair } : {}) });
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
    else if (after?.kind === 'word' && (after.w === 'cents' || after.w === 'cent')) { t.value /= 100; t.money = true; i++; }
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
    labelTokens: new Set(contentTokens(String(field.label || '').replace(/\s*\(row \d+\)$/, ''))),
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
  let hit = 0;
  for (const w of new Set(words)) if (p.tokens.includes(w)) { score += weight(w); if (p.labelTokens.has(w)) hit++; }
  // Between two labels that share the words said, the one those words cover
  // more of: "3 bathrooms" is "Bathrooms", not "Extra minutes per bathroom".
  // Measured on the label only; an id like crewSize is not something said.
  return score > 0 ? score + (0.3 * hit) / (p.labelTokens.size || 1) : 0;
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
    // "price 40, shipping 6" names each number before it; "2,200 square feet
    // with 3 bathrooms" names it after. Both readings are scored, and the one
    // that matches more of the form, more strongly, is kept. A tie goes to
    // name-first, the way forms are usually read aloud.
    // Where each number's unit words end: "2,200 square feet" keeps "square feet".
    const unitEnd = nums.map(([, at]) => {
      let e = at + 1;
      while (clause[e]?.kind === 'word' && UNIT_WORDS.has(clause[e].w)) e++;
      return e;
    });
    const reading = (before) => nums.map(([num, at], k) => {
      // Name-first, a number's context starts after the previous number's
      // unit words, and its own unit words count with it.
      const start = before ? (k === 0 ? 0 : unitEnd[k - 1]) : at + 1;
      const end = before ? at : (k + 1 < nums.length ? nums[k + 1][1] : clause.length);
      const ctx = before ? [...clause.slice(start, end), ...clause.slice(at + 1, unitEnd[k])] : clause.slice(start, end);
      const words = wordsOf(ctx);
      const from = before
        ? [...ctx.filter((t) => t.kind === 'word').map((t) => t.w), num.text].join(' ')
        : [num.text, ...ctx.filter((t) => t.kind === 'word').map((t) => t.w)].join(' ');
      const scores = numeric.map((p) => {
        let s = scoreField(p, words, weight);
        if (s > 0 && num.percent && p.unit === 'percent') s += 0.5;
        if (s > 0 && num.percent && p.unit === 'money') s -= 0.4;
        if (s > 0 && num.money && p.unit === 'money') s += 0.3;
        if (s > 0 && num.ratio && p.perTwelve) s += 0.5;
        return { p, s };
      });
      return { num, from, words, scores };
    });
    // How many numbers a reading places, then how strongly.
    const strength = (cands) => {
      const seen = new Set();
      let placed = 0;
      let total = 0;
      for (const c of cands) {
        const best = c.scores.filter((x) => !seen.has(x.p.field.key)).sort((a, b) => b.s - a.s)[0];
        if (best && best.s > 0) { seen.add(best.p.field.key); placed++; total += best.s; }
      }
      return placed * 1000 + total;
    };
    const first = reading(true);
    const after = reading(false);
    candidates.push(...(strength(after) > strength(first) ? after : first));
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
    if (c.num.pair && p.unit === 'money') value = c.num.pair[0] + c.num.pair[1] / 100;
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

/** The numbers in a sentence, each with every value it can be read as (5 percent is 5 or 0.05). */
function saidNumbers(said) {
  const out = [];
  for (const t of tokenize(said)) {
    if (t.kind !== 'num') continue;
    const reads = [t.value, t.value / 100];
    if (t.pair) reads.push(t.pair[0], t.pair[1], t.pair[0] + t.pair[1] / 100);
    if (t.ratio) reads.push(t.ratio[0], t.ratio[1], t.ratio[0] / t.ratio[1]);
    out.push(new Set(reads.map(fmt)));
  }
  if (/\b(zero|free|no|none|nothing)\b/i.test(said)) out.push(new Set(['0']));
  return out;
}

/**
 * Whether the person named a choice: a word of the chosen option for a select,
 * or a word of a checkbox's label that no other field's label has. Numbers and
 * text are checked elsewhere.
 */
function named(field, value, fields, words) {
  if (field.type === 'select') {
    const opt = (field.options || []).find((o) => String(o.value) === String(value));
    return contentTokens(`${opt?.text || ''} ${value}`).some((w) => words.has(w));
  }
  if (field.type === 'checkbox') {
    const others = new Set(fields.filter((f) => f !== field).flatMap((f) => contentTokens(f.label)));
    return contentTokens(field.label).some((w) => !others.has(w) && words.has(w));
  }
  return true;
}

/**
 * Check a model's proposed values (an object of key -> value) against the
 * form. Unknown keys and values the field would refuse are dropped and
 * reported, never written. Given what the person `said`, a number that is not
 * in their words is dropped too: a 0.5B model asked for JSON fills unmentioned
 * fields with 0 (docs/reports/2026-10-21-wasm-on-the-site.md).
 */
export function validateFills(proposed, fields, said = null) {
  const heard = said === null ? null : saidNumbers(said);
  const words = said === null ? null : new Set(contentTokens(said));
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
    if (heard && field.type === 'number' && !heard.some((reads) => reads.has(checked.value))) {
      skipped.push({ text: `${field.label}: ${value}`, reason: 'the model gave a number you did not say' });
      continue;
    }
    if (heard && !named(field, checked.value, fields, words)) {
      skipped.push({ text: `${field.label}: ${value}`, reason: 'the model set a choice you did not name' });
      continue;
    }
    fills.push({ key, label: field.label, value: checked.value, from: 'model' });
  }
  return { fills, skipped };
}

/**
 * Combine the rule reader's fills with a model's. The rules' values stand; the
 * model only adds fields the rules did not fill. Given what the person `said`,
 * each number they said fills one field: the model cannot reuse a number the
 * rules placed, and a number it puts in more fields than it was said is
 * dropped from all of them. On the 52 eval sentences with Qwen2.5 0.5B, letting
 * the model's reading replace the rules' wrote 337 wrong values
 * (docs/reports/2026-10-21-wasm-on-the-site.md).
 */
export function mergeFills(ruled, viaModel, said = null) {
  const have = new Set(ruled.fills.map((f) => f.key));
  const fresh = viaModel.fills.filter((f) => !have.has(f.key));
  const skipped = [...ruled.skipped, ...viaModel.skipped];
  let added = fresh;
  if (said !== null) {
    const left = saidNumbers(said);
    const take = (value) => { const i = left.findIndex((reads) => reads.has(String(value))); if (i >= 0) left.splice(i, 1); return i >= 0; };
    for (const f of ruled.fills) if (/^-?[\d.]+$/.test(String(f.value))) take(f.value);
    const byValue = new Map();
    for (const f of fresh) if (typeof f.value === 'string' && /^-?[\d.]+$/.test(f.value)) byValue.set(f.value, [...(byValue.get(f.value) || []), f]);
    const dropped = new Set();
    for (const [value, group] of byValue) {
      const free = left.filter((reads) => reads.has(value)).length;
      if (group.length > free) { group.forEach((f) => dropped.add(f)); skipped.push({ text: `${value}: ${group.map((f) => f.label).join(', ')}`, reason: free ? 'the model put one number in several fields' : 'that number is already used' }); }
      else for (let i = 0; i < group.length; i++) take(value);
    }
    added = fresh.filter((f) => !dropped.has(f));
  }
  return { fills: [...ruled.fills, ...added], skipped, added: added.length };
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
