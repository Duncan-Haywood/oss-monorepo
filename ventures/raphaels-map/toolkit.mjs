// @ts-check
// SPEC §7F: dating profile and conversation toolkit.
//
// Everything here is about the USER's own words and settings. Nothing takes
// another person as input, nothing scores anyone, and nothing leaves the
// browser: preferences and drafts live in localStorage under
// `raphaels-map-toolkit` (STORAGE_KEY).
//
// The text-generation functions are pure and exported for toolkit.test.mjs;
// `mount` is the only part that touches the DOM.

/** Adults only. The shell's age inputs never go below this. */
export const MIN_AGE = 18;
/** SPEC §2 default interested age band (adjustable, never below 18). */
export const DEFAULT_AGE_BAND = Object.freeze({ min: 20, max: 25 });

/**
 * SPEC §2 defaults, sorted into three tiers. All editable: the user can
 * move, remove or add his own. These are his preferences, not a rubric for
 * judging anyone.
 */
export const DEFAULT_PREFERENCES = Object.freeze({
  must: Object.freeze([
    'Practicing Catholic: Mass, the sacraments and shared prayer matter to her',
    'Wants marriage, and sees it as a lifelong commitment',
    'Wants children',
    'Fidelity',
  ]),
  nice: Object.freeze([
    'Hopes for a large family (four or more), God willing',
    'Would welcome raising children at home if we can afford it',
    'Would trade some luxury or career for a larger family and a stable home',
    'Wants to raise children in the faith',
  ]),
  discover: Object.freeze([
    'How she sees paid work once there are children (her own preference, not a general view)',
    'Ideal family size compared with what she expects',
    'What she learned about marriage from her own family',
    'What she expects of a husband: provision, involvement, respect',
    'Where she would be willing to live',
  ]),
});

export const TIERS = Object.freeze([
  { id: 'must', label: 'Must-have' },
  { id: 'nice', label: 'Nice-to-have' },
  { id: 'discover', label: 'Discover in conversation' },
]);

/** @typedef {{must: string[], nice: string[], discover: string[]}} Prefs */

/** @returns {Prefs} */
export function defaultPreferences() {
  return { must: [...DEFAULT_PREFERENCES.must], nice: [...DEFAULT_PREFERENCES.nice], discover: [...DEFAULT_PREFERENCES.discover] };
}

/** @param {any} p @returns {Prefs} */
export function normalizePreferences(p) {
  const d = defaultPreferences();
  if (!p || typeof p !== 'object') return d;
  /** @param {any} a @param {string[]} fb */
  const list = (a, fb) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : fb);
  return { must: list(p.must, d.must), nice: list(p.nice, d.nice), discover: list(p.discover, d.discover) };
}

/** @param {Prefs} prefs @param {string} tier @param {string} text @returns {Prefs} */
export function addPreference(prefs, tier, text) {
  const t = String(text || '').trim().slice(0, 200);
  const p = normalizePreferences(prefs);
  if (!t || !(tier in p)) return p;
  if (p[tier].some((s) => s.toLowerCase() === t.toLowerCase())) return p;
  return { ...p, [tier]: [...p[tier], t] };
}

/** @param {Prefs} prefs @param {string} tier @param {number} index @returns {Prefs} */
export function removePreference(prefs, tier, index) {
  const p = normalizePreferences(prefs);
  if (!(tier in p)) return p;
  return { ...p, [tier]: p[tier].filter((_, i) => i !== index) };
}

/** @param {Prefs} prefs @param {string} from @param {number} index @param {string} to @returns {Prefs} */
export function movePreference(prefs, from, index, to) {
  const p = normalizePreferences(prefs);
  if (!(from in p) || !(to in p) || from === to) return p;
  const item = p[from][index];
  if (item === undefined) return p;
  const next = removePreference(p, from, index);
  return { ...next, [to]: [...next[to], item] };
}

/** Plain-text summary of the user's own preferences, for copy or print. */
export function preferencesText(prefs) {
  const p = normalizePreferences(prefs);
  const lines = ['My preferences (private notes for discernment, not a checklist to grade anyone)', ''];
  for (const t of TIERS) {
    lines.push(`${t.label}:`);
    if (!p[t.id].length) lines.push('  (none)');
    for (const s of p[t.id]) lines.push(`  - ${s}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Profile drafts
// ---------------------------------------------------------------------------

export const TONES = Object.freeze(['warm', 'plain', 'playful']);

/**
 * Sentence bank. Each sentence has a variant per tone; the user picks which
 * ideas to include and can add his own. The two SPEC §7F examples are the
 * `plain` variants of `faith-marriage` and `family-home`.
 */
export const SENTENCES = Object.freeze([
  {
    id: 'faith-marriage',
    topic: 'Faith and intent',
    warm: "My Catholic faith is the center of my life, and I'm dating with marriage in mind. I'd love a large family, God willing.",
    plain: 'Practicing Catholic, dating for marriage, hoping for a large family, God willing.',
    playful: 'Catholic who actually goes to Mass (even the early one). Dating for marriage, hoping for a big, loud family, God willing.',
  },
  {
    id: 'family-home',
    topic: 'Family and home',
    warm: "I'd love to provide for a home where family comes first, and I'd choose children over luxury.",
    plain: "I'd love to provide for a family-centered home and prioritize children over luxury.",
    playful: "Future plans: a full dinner table over a fancy car. I'd love to provide for a family-centered home.",
  },
  {
    id: 'faith-practice',
    topic: 'Faith and intent',
    warm: 'Sunday Mass, confession and praying together matter a lot to me.',
    plain: 'Sunday Mass and the sacraments are a regular part of my week.',
    playful: "You'll find me at Sunday Mass, and probably at the parish donut table afterwards.",
  },
  {
    id: 'commitment',
    topic: 'Faith and intent',
    warm: 'I believe marriage is for life, and I want to build one that lasts through the ordinary hard seasons.',
    plain: 'I see marriage as a lifelong commitment.',
    playful: "Looking for my person for keeps, not for a season.",
  },
  {
    id: 'trade-offs',
    topic: 'Family and home',
    warm: "I'd gladly live a little more simply if it means more time with family.",
    plain: "I'd trade some income or comfort for a larger family and a stable home.",
    playful: "Happy to trade a bigger house for a bigger family (within reason; I do like having a roof).",
  },
  {
    id: 'respect',
    topic: 'Character',
    warm: 'I want a marriage built on respect, honesty and friendship, where we look after each other.',
    plain: 'I value honesty, fidelity and mutual respect.',
    playful: 'Big on honesty, loyalty and doing the dishes without being asked.',
  },
  {
    id: 'conversation',
    topic: 'Character',
    warm: "I'd love to get to know you over a few good conversations. Tell me what you love about your faith.",
    plain: "I'd like to get to know someone over a few good conversations.",
    playful: 'Ask me about my favorite saint and I will talk for longer than you planned.',
  },
]);

/**
 * Common profile-length bands. These are NOT any app's current limit: apps
 * set and change their own limits, so the counter only says how a draft
 * compares with a few round numbers and tells the user to check his app.
 */
export const LENGTH_BANDS = Object.freeze([
  { chars: 150, label: 'Short prompt or tagline' },
  { chars: 300, label: 'Medium answer' },
  { chars: 500, label: 'Longer bio' },
]);
export const LENGTH_NOTE = 'Round numbers for comparison only. Each app sets its own limits and changes them: check your app.';

/** Character count as a person (and most apps) would count it: code points, not UTF-16 units. */
export function charCount(text) {
  return [...String(text ?? '')].length;
}

/** @param {string} text */
export function lengthReport(text) {
  const n = charCount(text);
  return LENGTH_BANDS.map((b) => ({ ...b, count: n, fits: n <= b.chars, over: Math.max(0, n - b.chars) }));
}

/** @param {string} tone */
const toneOf = (tone) => (TONES.includes(tone) ? tone : 'warm');

/** @param {string} s */
function sentenceCase(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const first = t[0].toUpperCase() + t.slice(1);
  return /[.!?…)"']$/.test(first) ? first : first + '.';
}

/**
 * Assemble a few drafts from the sentences the user chose, in his tone,
 * plus any sentences he wrote himself. Pure: the same input gives the same
 * drafts, and nothing is invented beyond the bank and his own text.
 *
 * @param {{chosen?: string[], custom?: string[], tone?: string, opener?: string}} opts
 * @returns {{id: string, label: string, text: string, count: number}[]}
 */
export function buildDrafts({ chosen = [], custom = [], tone = 'warm', opener = '' } = {}) {
  const t = toneOf(tone);
  const byId = new Map(SENTENCES.map((s) => [s.id, s]));
  const picked = chosen.map((id) => byId.get(id)).filter(Boolean).map((s) => /** @type {any} */ (s)[t]);
  const own = custom.map(sentenceCase).filter(Boolean);
  const open = sentenceCase(opener);
  const all = [...(open ? [open] : []), ...picked, ...own];
  if (!all.length) return [];
  const join = (/** @type {string[]} */ xs) => xs.join(' ');
  const drafts = [];
  // Short: the opener (if any) and the first chosen idea only.
  drafts.push({ id: 'short', label: 'Short', parts: all.slice(0, open ? 2 : 1) });
  // Focused: up to three ideas, own sentences kept.
  const focused = [...(open ? [open] : []), ...picked.slice(0, 2), ...own.slice(0, 1)];
  drafts.push({ id: 'focused', label: 'Focused', parts: focused.length ? focused : all.slice(0, 3) });
  // Full: everything chosen, in order.
  drafts.push({ id: 'full', label: 'Full', parts: all });
  const seen = new Set();
  const out = [];
  for (const d of drafts) {
    const text = join(d.parts);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ id: d.id, label: d.label, text, count: charCount(text) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dating-app settings checklist
// ---------------------------------------------------------------------------

/** Clamp an age band to adults: min >= 18, max >= min, max <= 99. */
export function clampAgeBand(band) {
  const b = band && typeof band === 'object' ? band : {};
  let min = Math.round(Number(b.min));
  let max = Math.round(Number(b.max));
  if (!Number.isFinite(min)) min = DEFAULT_AGE_BAND.min;
  if (!Number.isFinite(max)) max = DEFAULT_AGE_BAND.max;
  min = Math.min(99, Math.max(MIN_AGE, min));
  max = Math.min(99, Math.max(MIN_AGE, max));
  if (max < min) max = min;
  return { min, max };
}

export const SETTINGS_NOTE =
  'Features differ by app and change over time. Some apps have no religion or family-plans field, some put them behind a paid tier, and names vary. Use this as a list of things to look for, not a description of any particular app.';

/** @param {{min: number, max: number}} band */
export function settingsChecklist(band) {
  const { min, max } = clampAgeBand(band);
  return [
    { id: 'age', label: `Age range: ${min} to ${max}`, help: `Adults only. The tool will not go below ${MIN_AGE}.` },
    { id: 'religion', label: 'Religion: Catholic', help: 'On your own profile, and as a filter or preference if the app offers one.' },
    { id: 'children', label: 'Family plans: wants children', help: 'On your profile; as a filter if offered.' },
    { id: 'intent', label: 'Looking for: marriage, or a long-term relationship', help: 'The closest option the app has.' },
    { id: 'distance', label: 'Distance: wide enough to include the parishes and groups you would actually visit', help: 'Compare with the Communities view.' },
    { id: 'own-profile', label: 'Your own profile says the same things your drafts say', help: 'Filters only work if both people fill in the fields.' },
  ];
}

/** @param {{min: number, max: number}} band @param {Record<string, boolean>} done */
export function settingsText(band, done = {}) {
  const lines = ['Dating-app settings to look for', ''];
  for (const item of settingsChecklist(band)) lines.push(`[${done[item.id] ? 'x' : ' '}] ${item.label}`);
  lines.push('', SETTINGS_NOTE);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Conversation questions
// ---------------------------------------------------------------------------

export const QUESTIONS_GUIDANCE = [
  'These are for mutual discovery over several conversations, not one sitting and not an interview.',
  'Share your own answer first, and let her ask you the same things.',
  'Any question can be skipped. No one owes anyone an answer, and some things are shared only once trust is there.',
  'Never score, rank or grade a person, and do not keep notes about her intimate history.',
];

/**
 * SPEC §7F questions, verbatim, grouped by topic, each with gentle
 * follow-ups. A few extra openers are marked `source: 'added'`.
 */
export const QUESTION_GROUPS = Object.freeze([
  {
    id: 'children',
    topic: 'Children and family size',
    questions: [
      {
        text: 'If money were no concern, how many children would you ideally want?',
        source: 'spec',
        followups: ['What do you picture when you imagine that family?', 'Is that different from what you expect will happen?'],
      },
      {
        text: 'Would you prefer a large family and modest comforts, or a small family and much more luxury?',
        source: 'spec',
        followups: ['What would "modest" mean to you in practice?', 'How did your own family handle money and time?'],
      },
    ],
  },
  {
    id: 'work-home',
    topic: 'Work, home and raising children',
    questions: [
      {
        text: 'If you had children, what role would you ideally want paid work to play?',
        source: 'spec',
        followups: ['Would that change as children got older?', 'What would you hope a husband does to make that possible?'],
      },
    ],
  },
  {
    id: 'marriage',
    topic: 'Marriage',
    questions: [
      {
        text: 'What did you learn about marriage from the family you grew up in?',
        source: 'spec',
        followups: ['Is there anything you would want to do the same, or differently?'],
      },
      {
        text: 'Do you view marriage as a permanent commitment through difficult periods? What exceptions do you recognize?',
        source: 'spec',
        followups: ['What helps a couple through a hard season?'],
        note: 'Permanence through ordinary difficulty is not tolerance of abuse or danger. Say so if it comes up.',
      },
    ],
  },
  {
    id: 'faith',
    topic: 'Faith',
    questions: [
      {
        text: 'What part of your faith means the most to you right now?',
        source: 'added',
        followups: ['How did you come to it?', 'Is there a saint or a prayer you go back to?'],
      },
      {
        text: 'What would you hope prayer and Sunday look like in your own home one day?',
        source: 'added',
        followups: ['What did they look like growing up?'],
      },
    ],
  },
]);

/** @param {Set<string>|string[]} [selected] question texts to include; all when empty */
export function questionsText(selected) {
  const sel = selected ? new Set(selected) : null;
  const lines = ['Questions to explore together', ''];
  for (const g of QUESTION_GROUPS) {
    const qs = g.questions.filter((q) => !sel || !sel.size || sel.has(q.text));
    if (!qs.length) continue;
    lines.push(`${g.topic}`);
    for (const q of qs) {
      lines.push(`  - ${q.text}`);
      for (const f of q.followups) lines.push(`      then, if it feels natural: ${f}`);
      if (q.note) lines.push(`      note: ${q.note}`);
    }
    lines.push('');
  }
  lines.push('How to use these:');
  for (const g of QUESTIONS_GUIDANCE) lines.push(`  - ${g}`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** The toolkit's slice of the shell's persisted state, with defaults filled in. */
export function normalizeToolkitState(s) {
  const t = s && typeof s === 'object' ? s : {};
  return {
    prefs: normalizePreferences(t.prefs),
    tone: toneOf(t.tone),
    chosen: Array.isArray(t.chosen) ? t.chosen.filter((id) => SENTENCES.some((x) => x.id === id)) : ['faith-marriage', 'family-home'],
    custom: Array.isArray(t.custom) ? t.custom.filter((x) => typeof x === 'string').slice(0, 10) : [],
    opener: typeof t.opener === 'string' ? t.opener.slice(0, 200) : '',
    ageBand: clampAgeBand(t.ageBand || DEFAULT_AGE_BAND),
    settingsDone: t.settingsDone && typeof t.settingsDone === 'object' ? { ...t.settingsDone } : {},
  };
}

/** Everything the user made here, as one plain-text document. */
export function fullText(state) {
  const s = normalizeToolkitState(state);
  const drafts = buildDrafts(s);
  const parts = [preferencesText(s.prefs), 'Profile drafts', ''];
  if (!drafts.length) parts.push('  (no sentences chosen)');
  for (const d of drafts) parts.push(`${d.label} (${d.count} characters):`, d.text, '');
  parts.push(LENGTH_NOTE, '', settingsText(s.ageBand, s.settingsDone), questionsText());
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/** @param {any} s */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/** Copy text; falls back to a selected textarea where the async API is unavailable. */
async function copyText(text, doc = globalThis.document) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Print plain text in its own window, so the rest of the app is not printed. */
function printText(title, text) {
  const w = globalThis.open ? globalThis.open('', '_blank') : null;
  if (!w) { globalThis.print?.(); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:2rem;white-space:pre-wrap}</style><body>${esc(text)}</body>`);
  w.document.close();
  w.focus();
  w.print();
}

/** localStorage key for the toolkit's state. The shell's setState keeps only view/params/prefs, so the toolkit stores its own slice. */
export const STORAGE_KEY = 'raphaels-map-toolkit';

/** @param {any} storage */
export function loadToolkitState(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    return normalizeToolkitState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeToolkitState(null);
  }
}

/** @param {any} state @param {any} storage */
export function saveToolkitState(state, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(normalizeToolkitState(state)));
    return true;
  } catch {
    return false; // storage blocked or full: the toolkit still works for this visit
  }
}

/**
 * @param {HTMLElement} el
 * @param {{state?: any, record?: (e: string) => void, storage?: any}} ctx
 */
export function mount(el, ctx = {}) {
  const record = typeof ctx.record === 'function' ? ctx.record : () => {};
  const storage = 'storage' in ctx ? ctx.storage : globalThis.localStorage;
  let ts = ctx.state && ctx.state.toolkit ? normalizeToolkitState(ctx.state.toolkit) : loadToolkitState(storage);
  const save = () => saveToolkitState(ts, storage);
  /** @param {any} next */
  const update = (next) => { ts = normalizeToolkitState({ ...ts, ...next }); save(); render(); };

  function prefsHtml() {
    return TIERS.map((t) => `
      <div class="tk-tier" data-tier="${t.id}">
        <h4>${esc(t.label)}</h4>
        <ul>${ts.prefs[t.id].map((p, i) => `
          <li><span>${esc(p)}</span>
            <select data-act="move" data-tier="${t.id}" data-i="${i}" aria-label="Move to">
              <option value="">Move…</option>${TIERS.filter((o) => o.id !== t.id).map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}
            </select>
            <button type="button" data-act="remove" data-tier="${t.id}" data-i="${i}" aria-label="Remove">Remove</button></li>`).join('') || '<li class="tk-empty">None yet.</li>'}
        </ul>
        <form data-act="add" data-tier="${t.id}"><input name="text" maxlength="200" placeholder="Add your own" aria-label="Add to ${esc(t.label)}"><button>Add</button></form>
      </div>`).join('');
  }

  function draftsHtml() {
    const drafts = buildDrafts(ts);
    if (!drafts.length) return '<p class="tk-empty">Pick at least one sentence above, or write your own.</p>';
    return drafts.map((d) => `
      <div class="tk-draft">
        <h4>${esc(d.label)} <small>${d.count} characters</small></h4>
        <p>${esc(d.text)}</p>
        <p class="tk-len">${lengthReport(d.text).map((b) => `${b.fits ? '✓' : '✗'} ${b.chars} (${esc(b.label.toLowerCase())})${b.fits ? '' : `: ${b.over} over`}`).join(' · ')}</p>
        <button type="button" data-act="copy-draft" data-id="${d.id}">Copy</button>
      </div>`).join('') + `<p class="tk-note">${esc(LENGTH_NOTE)}</p>`;
  }

  function render() {
    const topics = [...new Set(SENTENCES.map((s) => s.topic))];
    el.innerHTML = `
    <section class="tk" aria-labelledby="tk-h">
      <h2 id="tk-h">Profile and conversation toolkit</h2>
      <p class="tk-lede">Your own words and settings, kept in this browser only. Nothing here looks at, lists or rates any other person.</p>

      <h3>1. What you are looking for</h3>
      <p class="tk-note">Private notes to help you discern. They are not a test for anyone to pass, and people grow and change.</p>
      <div class="tk-prefs">${prefsHtml()}</div>
      <button type="button" data-act="copy-prefs">Copy preferences</button>
      <button type="button" data-act="reset-prefs">Restore defaults</button>

      <h3>2. Profile drafts</h3>
      <fieldset class="tk-tone"><legend>Tone</legend>
        ${TONES.map((t) => `<label><input type="radio" name="tk-tone" value="${t}" ${ts.tone === t ? 'checked' : ''}> ${t}</label>`).join(' ')}
      </fieldset>
      <label class="tk-opener">Opening line (optional, your own words)
        <input data-act="opener" maxlength="200" value="${esc(ts.opener)}" placeholder="e.g. Engineer in Denver who loves the mountains"></label>
      ${topics.map((topic) => `<fieldset class="tk-bank"><legend>${esc(topic)}</legend>
        ${SENTENCES.filter((s) => s.topic === topic).map((s) => `<label><input type="checkbox" data-act="choose" value="${s.id}" ${ts.chosen.includes(s.id) ? 'checked' : ''}> ${esc(s[ts.tone])}</label>`).join('')}
      </fieldset>`).join('')}
      <form data-act="add-custom"><input name="text" maxlength="200" placeholder="Add a sentence of your own" aria-label="Add a sentence of your own"><button>Add</button></form>
      <ul class="tk-custom">${ts.custom.map((c, i) => `<li>${esc(c)} <button type="button" data-act="remove-custom" data-i="${i}">Remove</button></li>`).join('')}</ul>
      <div class="tk-drafts" aria-live="polite">${draftsHtml()}</div>

      <h3>3. Dating-app settings checklist</h3>
      <p class="tk-note">${esc(SETTINGS_NOTE)}</p>
      <p><label>Age range from <input type="number" data-act="age" data-k="min" min="${MIN_AGE}" max="99" value="${ts.ageBand.min}"></label>
         <label>to <input type="number" data-act="age" data-k="max" min="${MIN_AGE}" max="99" value="${ts.ageBand.max}"></label>
         <small>Adults only; never below ${MIN_AGE}.</small></p>
      <ul class="tk-settings">${settingsChecklist(ts.ageBand).map((s) => `<li><label><input type="checkbox" data-act="setting" value="${s.id}" ${ts.settingsDone[s.id] ? 'checked' : ''}> ${esc(s.label)}</label> <small>${esc(s.help)}</small></li>`).join('')}</ul>
      <button type="button" data-act="copy-settings">Copy checklist</button>

      <h3>4. Questions to explore together</h3>
      <ul class="tk-guidance">${QUESTIONS_GUIDANCE.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
      ${QUESTION_GROUPS.map((g) => `<div class="tk-qgroup"><h4>${esc(g.topic)}</h4><ul>${g.questions.map((q) => `
        <li><p>${esc(q.text)}</p><ul class="tk-follow">${q.followups.map((f) => `<li>Then, if it feels natural: ${esc(f)}</li>`).join('')}</ul>${q.note ? `<p class="tk-note">${esc(q.note)}</p>` : ''}</li>`).join('')}</ul></div>`).join('')}
      <button type="button" data-act="copy-questions">Copy questions</button>

      <p class="tk-actions"><button type="button" data-act="copy-all">Copy everything</button>
        <button type="button" data-act="print">Print</button> <span class="tk-status" role="status"></span></p>
    </section>`;
  }

  /** @param {string} msg */
  const status = (msg) => { const s = el.querySelector('.tk-status'); if (s) s.textContent = msg; };
  /** @param {string} text @param {string} what */
  const doCopy = async (text, what) => {
    const ok = await copyText(text);
    status(ok ? `Copied ${what}.` : 'Copy failed: select the text and copy it by hand.');
    record('toolkit_copy');
  };

  const ac = new AbortController();
  const opt = { signal: ac.signal };
  el.addEventListener('click', (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('[data-act]');
    if (!b || b.tagName === 'FORM' || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const act = b.getAttribute('data-act');
    const tier = b.getAttribute('data-tier') || '';
    const i = Number(b.getAttribute('data-i'));
    if (act === 'remove') { update({ prefs: removePreference(ts.prefs, tier, i) }); record('toolkit_pref_edit'); }
    else if (act === 'reset-prefs') { update({ prefs: defaultPreferences() }); }
    else if (act === 'remove-custom') { update({ custom: ts.custom.filter((_, j) => j !== i) }); }
    else if (act === 'copy-prefs') doCopy(preferencesText(ts.prefs), 'preferences');
    else if (act === 'copy-draft') { const d = buildDrafts(ts).find((x) => x.id === b.getAttribute('data-id')); if (d) doCopy(d.text, 'draft'); }
    else if (act === 'copy-settings') doCopy(settingsText(ts.ageBand, ts.settingsDone), 'checklist');
    else if (act === 'copy-questions') doCopy(questionsText(), 'questions');
    else if (act === 'copy-all') doCopy(fullText(ts), 'everything');
    else if (act === 'print') { record('toolkit_print'); printText("Raphael's Map toolkit", fullText(ts)); }
  }, opt);

  el.addEventListener('submit', (ev) => {
    const f = /** @type {HTMLFormElement} */ (ev.target);
    ev.preventDefault();
    const input = /** @type {HTMLInputElement|null} */ (f.querySelector('input[name=text]'));
    const text = input ? input.value : '';
    if (f.getAttribute('data-act') === 'add') { update({ prefs: addPreference(ts.prefs, f.getAttribute('data-tier') || '', text) }); record('toolkit_pref_edit'); }
    else if (f.getAttribute('data-act') === 'add-custom' && text.trim()) { update({ custom: [...ts.custom, text.trim()] }); record('toolkit_draft'); }
  }, opt);

  el.addEventListener('change', (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    const act = t.getAttribute('data-act');
    if (t.name === 'tk-tone') { update({ tone: t.value }); record('toolkit_draft'); }
    else if (act === 'choose') {
      const chosen = t.checked ? [...ts.chosen, t.value] : ts.chosen.filter((x) => x !== t.value);
      update({ chosen }); record('toolkit_draft');
    } else if (act === 'opener') update({ opener: t.value });
    else if (act === 'age') update({ ageBand: { ...ts.ageBand, [t.getAttribute('data-k') || 'min']: Number(t.value) } });
    else if (act === 'setting') update({ settingsDone: { ...ts.settingsDone, [t.value]: t.checked } });
    else if (act === 'move' && t.value) {
      update({ prefs: movePreference(ts.prefs, t.getAttribute('data-tier') || '', Number(t.getAttribute('data-i')), t.value) });
      record('toolkit_pref_edit');
    }
  }, opt);

  render();
  record('toolkit_view');
  return { destroy() { ac.abort(); el.innerHTML = ''; } };
}
