// The site assistant: type, speak, or let an agent call it — one panel that
// can search the site, answer from the page you are on, fill in the
// calculator in front of you and read its result back.
//
// Served as /pf-assistant.js and loaded only when someone opens it (the "Ask"
// link in the header, the voice button on a calculator, or the /ask/ page),
// so a visitor who never asks pays nothing. Nothing heavier than this file
// ever loads without a click that says what it will download:
//
//   engine     what runs                    download            where your words go
//   rules      fill.mjs + the search index  none                nowhere
//   browser    the browser's own model      none (Chrome's own) nowhere: on device
//   local      WebLLM in a Web Worker       290 MB or 880 MB    nowhere: on device
//   byok       platform/llm/byok.mjs        none                the provider you chose
//
// Voice in: the browser's on-device speech recognition where it has one, or
// Whisper tiny.en (96 MB) in the same worker. Cloud speech recognition is
// never used, because it would send audio to a third party the page cannot
// name. Voice out: the browser's own speechSynthesis.
//
// Every reply says which engine produced it and where the words went, and
// every value written into a form is listed with an Undo. See /ask/ for the
// measured accuracy and the limitations.

import { parseUtterance, validateFills, mergeFills, extractJson, fieldSchema, describeFills, contentTokens } from './pf-fill.js';
import { searchVariants, searchScore } from './pf-search.js';

const ROOT = new URL('./', import.meta.url);
const SETTINGS_KEY = 'pf-assistant';
const BYOK_KEY = 'pf-assistant-key';
const USAGE_KEY = 'portfolio-hub-usage';

// `gguf` is the same model for llama.cpp, which the worker runs on the CPU
// (WebAssembly) when this browser has no hardware WebGPU; `cpuSize` is its download.
const GGUF = 'https://huggingface.co/Qwen/';
export const LOCAL_MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', size: '290 MB', vram: '1 GB', cpuSize: '430 MB', ggufBytes: 428730208, gguf: `${GGUF}Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf`, note: 'fastest; fine for filling forms, weak at explaining' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', size: '880 MB', vram: '1.7 GB', cpuSize: '1.1 GB', ggufBytes: 1066227232, gguf: `${GGUF}Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf`, note: 'better answers; needs a recent laptop or desktop GPU' },
];
const WHISPER = { name: 'Whisper tiny.en', size: '96 MB' };
const BYOK_PROVIDERS = {
  anthropic: { label: 'Anthropic', host: 'api.anthropic.com', key: true },
  openai: { label: 'OpenAI', host: 'api.openai.com', key: true },
  gemini: { label: 'Google Gemini', host: 'generativelanguage.googleapis.com', key: true },
  'openai-compatible': { label: 'Other (OpenAI-compatible URL)', host: '', key: true, url: true },
  ollama: { label: 'Ollama on this computer', host: 'localhost (your computer)', key: false },
  lmstudio: { label: 'LM Studio on this computer', host: 'localhost (your computer)', key: false },
  llamacpp: { label: 'llama.cpp on this computer', host: 'localhost (your computer)', key: false },
};

// ---------------------------------------------------------------------------
// Storage: per-browser conveniences only, and every access may throw.

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}
const settings = Object.assign({ engine: 'rules', model: LOCAL_MODELS[0].id, speak: false, localReady: false, sttReady: false, byok: { provider: 'anthropic', model: '', baseUrl: '' } }, load(SETTINGS_KEY, {}));
const persist = () => save(SETTINGS_KEY, settings);

// The site's anonymous local counter (same rules as pf-site.js): event names
// only, never what was typed or said, silent under DNT/GPC or the opt-out.
function count(event) {
  try {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    if (localStorage.getItem('portfolio-hub-optout') === '1') return;
    const c = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    c[event] = (c[event] || 0) + 1;
    c.last_day = new Date().toISOString().slice(0, 10);
    localStorage.setItem(USAGE_KEY, JSON.stringify(c));
  } catch { /* counting is not worth an error */ }
}

// ---------------------------------------------------------------------------
// Reading the page.

const PANEL_ID = 'pf-assistant';
const SKIP = `#${PANEL_ID}, [data-pfs-head], .pf-chrome, footer, [data-pf-assistant-skip]`;

function textOf(node) {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function labelFor(el) {
  const label = el.labels && el.labels[0];
  if (label) {
    const copy = label.cloneNode(true);
    copy.querySelectorAll('input, select, textarea, option, .hint, small').forEach((n) => n.remove());
    const t = textOf(copy);
    if (t) return t;
  }
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(' ').trim();
    if (t) return t;
  }
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || '';
}

function visible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

/** The page's form controls as field descriptors, each holding its element(s). */
export function readFields(scope = document.querySelector('main') || document.body) {
  const fields = [];
  const radios = new Map();
  const seen = new Map();
  for (const el of scope.querySelectorAll('input, select, textarea')) {
    if (el.closest(SKIP) || el.disabled || !visible(el)) continue;
    const type = (el.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'file', 'image', 'password', 'search'].includes(type)) continue;
    if (el.id === 'usageOptOut' || /usage count/i.test(labelFor(el))) continue;
    if (type === 'radio') {
      const name = el.name || el.id;
      if (!name) continue;
      if (!radios.has(name)) {
        const group = { key: name, label: textOf(el.closest('fieldset')?.querySelector('legend')) || name, type: 'select', options: [], els: [] };
        radios.set(name, group);
        fields.push(group);
      }
      const g = radios.get(name);
      g.options.push({ value: el.value, text: labelFor(el) || el.value });
      g.els.push(el);
      if (el.checked) g.value = el.value;
      continue;
    }
    let label = labelFor(el);
    const n = (seen.get(label) || 0) + 1;
    seen.set(label, n);
    let key = el.id || el.name || `field-${fields.length + 1}`;
    if (fields.some((f) => f.key === key)) key = `${key}-${fields.length + 1}`;
    const field = { key, label, el };
    if (el.tagName === 'SELECT') {
      field.type = 'select';
      field.options = [...el.options].map((o) => ({ value: o.value, text: textOf(o) }));
    } else if (type === 'checkbox') field.type = 'checkbox';
    // 219 calculators here take numbers in text inputs with inputmode="decimal"
    // (so a phone shows a number pad without the browser's spinner rules).
    else if (type === 'number' || type === 'range' || /^(decimal|numeric)$/.test(el.getAttribute('inputmode') || '')) {
      field.type = 'number';
      for (const a of ['min', 'max', 'step']) if (el.getAttribute(a) !== null) field[a] = el.getAttribute(a);
    } else if (type === 'date') field.type = 'date';
    else field.type = 'text';
    field.value = type === 'checkbox' ? el.checked : el.value;
    fields.push(field);
  }
  // Repeated rows ("Footprint sq ft" once per roof section) are told apart by number.
  const counts = new Map();
  for (const f of fields) counts.set(f.label, (counts.get(f.label) || 0) + 1);
  const at = new Map();
  for (const f of fields) {
    if (counts.get(f.label) > 1) {
      const i = (at.get(f.label) || 0) + 1;
      at.set(f.label, i);
      if (i > 1) f.label = `${f.label} (row ${i})`;
    }
  }
  return fields;
}

const nativeSetter = (el) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;

/** Write fills into the page, firing the events its own script listens for. Returns an undo function. */
export function applyFills(fills, fields) {
  const before = [];
  for (const f of fills) {
    const field = fields.find((x) => x.key === f.key);
    if (!field) continue;
    if (field.els) {
      const target = field.els.find((r) => r.value === String(f.value));
      if (!target) continue;
      before.push({ el: field.els.find((r) => r.checked) || target, radio: true });
      target.checked = true;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }
    const el = field.el;
    if (field.type === 'checkbox') {
      before.push({ el, checked: el.checked });
      el.checked = Boolean(f.value);
    } else {
      before.push({ el, value: el.value });
      const set = nativeSetter(el);
      if (set) set.call(el, String(f.value)); else el.value = String(f.value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.classList.add('pf-assist-filled');
    setTimeout(() => el.classList.remove('pf-assist-filled'), 2400);
  }
  return () => {
    for (const b of before.reverse()) {
      if (b.radio) b.el.checked = true;
      else if ('checked' in b) b.el.checked = b.checked;
      else { const set = nativeSetter(b.el); if (set) set.call(b.el, b.value); else b.el.value = b.value; }
      b.el.dispatchEvent(new Event('input', { bubbles: true }));
      b.el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
}

/** The text of the page's result area: a live region, an <output>, or a block named result/summary/total. */
export function readResults() {
  const scope = document.querySelector('main') || document.body;
  const sel = '[aria-live]:not([aria-live="off"]), output, [role="status"], #results, #result, .results, .result, #summary, .summary, #output, #verdict, .verdict';
  const found = [...scope.querySelectorAll(sel)].filter((el) => !el.closest(SKIP) && visible(el) && textOf(el).length > 2);
  // Outermost first, so a result card wins over the one figure inside it.
  const top = found.filter((el) => !found.some((other) => other !== el && other.contains(el)));
  const text = top.map((el) => (el.innerText || el.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()).filter(Boolean).join('\n');
  return text.slice(0, 1200);
}

function pageExcerpt(limit = 2500) {
  const main = document.querySelector('main') || document.body;
  const copy = main.cloneNode(true);
  copy.querySelectorAll(`${SKIP}, script, style, noscript, svg, select`).forEach((n) => n.remove());
  return `${document.title}\n${document.querySelector('meta[name="description"]')?.content || ''}\n${textOf(copy)}`.slice(0, limit);
}

/** The paragraph on this page that shares most words with a question, or null. No model needed. */
function bestPassage(question) {
  const q = new Set(contentTokens(question));
  if (!q.size) return null;
  const main = document.querySelector('main') || document.body;
  let best = null;
  for (const el of main.querySelectorAll('p, li, dd, details, td')) {
    if (el.closest(SKIP) || el.querySelector('p, li, details')) continue;
    const t = textOf(el);
    if (t.length < 40) continue;
    const tokens = new Set(contentTokens(t));
    let hit = 0;
    for (const w of q) if (tokens.has(w)) hit++;
    if (hit >= 2 && (!best || hit > best.hit)) best = { hit, text: t };
  }
  return best && best.text.length > 420 ? { ...best, text: `${best.text.slice(0, 400)}…` } : best;
}

// ---------------------------------------------------------------------------
// Site search: the hub's own index and ranking (search-index.json, pf-search.js).

let indexLoad = null;
function loadIndex() {
  if (!indexLoad) {
    indexLoad = fetch(new URL('search-index.json', ROOT)).then((r) => {
      if (!r.ok) throw new Error(`index ${r.status}`);
      return r.json();
    }).then((data) => {
      data.stop = new Set(data.stopwords);
      for (const item of data.items) if (!item.u) item.u = `${item.s}/`;
      return data;
    });
    indexLoad.catch(() => { indexLoad = null; });
  }
  return indexLoad;
}

export async function searchSite(query, limit = 5) {
  const data = await loadIndex();
  const forms = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !data.stop.has(w)).map(searchVariants);
  if (!forms.length) return [];
  return data.items
    .map((item, i) => ({ item, i, value: searchScore(item.n, item.x, forms, true) }))
    .filter(({ value }) => value >= 1)
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, limit)
    .map(({ item }) => ({ title: item.t, description: item.d, url: new URL(item.u, ROOT).href, kind: item.k }));
}

// ---------------------------------------------------------------------------
// The worker: on-device language model and speech recognition, off the main thread.

let worker = null;
const waiting = new Map();
let nextId = 1;
const progressListeners = new Set();
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('pf-ai-worker.js', ROOT), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { progressListeners.forEach((fn) => fn(data)); return; }
      const w = waiting.get(data.id);
      if (!w) return;
      if (data.type === 'token') { w.onToken?.(data.text); return; }
      waiting.delete(data.id);
      if (data.type === 'error') w.reject(new Error(data.message));
      else w.resolve(data);
    };
  }
  return worker;
}
function ask(message, onToken) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onToken });
    getWorker().postMessage({ ...message, id });
  });
}

// ---------------------------------------------------------------------------
// Engines. Each answers `generate(system, prompt, { json, onToken })`.

const engines = {
  rules: { label: 'Rule-based reader (no AI model)', sent: 'nowhere', ready: true },
  browser: { label: 'This browser’s built-in model', sent: 'nowhere — it runs on this device', ready: false },
  local: { label: '', sent: 'nowhere — it runs on this device', ready: false },
  byok: { label: '', sent: '', ready: false },
};
let browserSession = null;

export async function browserModelStatus() {
  const LM = globalThis.LanguageModel;
  if (!LM || typeof LM.availability !== 'function') return 'unsupported';
  try { return await LM.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }); } catch { return 'unavailable'; }
}

async function startBrowserModel(onProgress) {
  const LM = globalThis.LanguageModel;
  browserSession = await LM.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress?.({ progress: e.loaded, text: 'Your browser is downloading its model' })); },
  });
  engines.browser.ready = true;
}

async function startLocalModel(onProgress) {
  const m = LOCAL_MODELS.find((x) => x.id === settings.model) || LOCAL_MODELS[0];
  const listener = (d) => { if (d.kind === 'llm') onProgress?.(d); };
  progressListeners.add(listener);
  let loaded = null;
  try {
    try { await navigator.storage?.persist?.(); } catch { /* optional */ }
    loaded = await ask({ type: 'llm-load', model: m.id, gguf: m.gguf, ggufBytes: m.ggufBytes });
  } finally { progressListeners.delete(listener); }
  const build = loaded?.backend === 'wasm' ? ' (on the CPU: no WebGPU here, so slower)' : /q4f32/.test(loaded?.model || '') ? ' (32-bit build: this GPU lacks 16-bit shaders)' : '';
  engines.local.label = `${m.name}${build}, on this device`;
  engines.local.ready = true;
  settings.localReady = true;
  persist();
}

function byokConfig() {
  const b = settings.byok || {};
  let apiKey = '';
  try { apiKey = localStorage.getItem(BYOK_KEY) || ''; } catch { /* none */ }
  return { provider: b.provider, model: b.model || undefined, baseUrl: b.baseUrl || undefined, apiKey: apiKey || undefined, browser: true };
}

async function generate(system, prompt, { json = null, onToken } = {}) {
  const engine = settings.engine;
  if (engine === 'browser') {
    if (!browserSession) await startBrowserModel();
    const session = await browserSession.clone();
    try {
      if (json) return await session.prompt(`${system}\n\n${prompt}`, { responseConstraint: json });
      let text = '';
      for await (const chunk of session.promptStreaming(`${system}\n\n${prompt}`)) { text += chunk; onToken?.(chunk); }
      return text;
    } finally { session.destroy?.(); }
  }
  if (engine === 'local') {
    if (!engines.local.ready) await startLocalModel();
    const r = await ask({
      type: 'llm-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      json: json ? JSON.stringify(json) : null,
      maxTokens: json ? 400 : 500,
    }, onToken);
    return r.text;
  }
  if (engine === 'byok') {
    const { complete } = await import('./pf-byok.js');
    const r = await complete(byokConfig(), { system, prompt, maxTokens: 700 });
    onToken?.(r.text);
    return r.text;
  }
  throw new Error('no model is switched on');
}

function engineLabel() {
  if (settings.engine === 'local') return engines.local.label || 'On-device model';
  if (settings.engine === 'byok') {
    const p = BYOK_PROVIDERS[settings.byok?.provider] || {};
    return `Your ${p.label || 'provider'}${settings.byok?.model ? ` (${settings.byok.model})` : ''}`;
  }
  return engines[settings.engine]?.label || engines.rules.label;
}
function engineSent() {
  if (settings.engine === 'byok') {
    const b = settings.byok || {};
    const p = BYOK_PROVIDERS[b.provider] || {};
    try { return p.host || new URL(b.baseUrl).host; } catch { return 'the address you entered'; }
  }
  return engines[settings.engine]?.sent || 'nowhere';
}

// ---------------------------------------------------------------------------
// Speech.

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const LANG = (document.documentElement.lang || navigator.language || 'en-US').replace(/^en$/, 'en-US');

/** 'available' | 'downloadable' | 'downloading' | 'unsupported': on-device recognition only. */
export async function localSpeechStatus() {
  if (!SR || typeof SR.available !== 'function') return 'unsupported';
  try { return await SR.available({ langs: [LANG], processLocally: true }); } catch { return 'unsupported'; }
}

function recognizeOnDevice(onInterim) {
  return new Promise((resolve, reject) => {
    const r = new SR();
    r.lang = LANG;
    r.processLocally = true;
    r.interimResults = true;
    r.continuous = false;
    let final = '';
    r.onresult = (e) => {
      let interim = '';
      for (const res of e.results) (res.isFinal ? (final = res[0].transcript) : (interim += res[0].transcript));
      onInterim?.(final || interim);
    };
    r.onerror = (e) => (e.error === 'no-speech' ? resolve('') : reject(new Error(`speech recognition: ${e.error}`)));
    r.onend = () => resolve(final.trim());
    stopListening = () => r.stop();
    r.start();
  });
}

let stopListening = null;

/** Record until silence (or the button), then transcribe with Whisper in the worker. */
async function recognizeWhisper(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  const buf = new Float32Array(analyser.fftSize);
  const started = performance.now();
  let spoke = false;
  let quietSince = 0;
  await new Promise((resolve) => {
    stopListening = resolve;
    const tick = () => {
      if (recorder.state !== 'recording') return resolve();
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      onLevel?.(rms);
      const now = performance.now();
      if (rms > 0.02) { spoke = true; quietSince = 0; } else if (spoke && !quietSince) quietSince = now;
      if ((spoke && quietSince && now - quietSince > 1300) || now - started > 15000 || (!spoke && now - started > 7000)) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  recorder.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  ctx.close();
  if (!spoke) return '';
  const blob = new Blob(chunks, { type: recorder.mimeType });
  const decoder = new AudioContext({ sampleRate: 16000 });
  const audio = (await decoder.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
  decoder.close();
  const r = await ask({ type: 'stt', audio });
  return r.text;
}

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in globalThis) || !text) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, '').slice(0, 900));
    u.lang = LANG;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

// ---------------------------------------------------------------------------
// Turning a message into an action.

const FILL_SYSTEM = 'You fill in a web form from what the user said. Reply with only a JSON object whose keys are field keys from the list and whose values are what the user gave for that field. Leave out every field the user did not mention. Numbers are plain numbers with no units or currency signs. For a choice field, use one of its listed values. Never invent a value.';
const ANSWER_SYSTEM = 'You are the assistant on a website of free calculators and research. Answer in at most four short sentences, in plain words, from the page text and tool list you are given. If they do not contain the answer, say so. Recommend only tools from the list, by name. Never give legal, tax, medical or financial advice; point to the tool or a professional instead.';

function wantsFill(text, fields, ruled) {
  if (!fields.length) return false;
  if (ruled.fills.length) return true;
  return /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand)\b/i.test(text) && !/\?\s*$/.test(text);
}

function fieldList(fields) {
  return fields.slice(0, 60).map((f) => {
    let t = `- ${f.key}: ${f.label} (${f.type}`;
    if (f.type === 'number' && (f.min !== undefined || f.max !== undefined)) t += `, ${f.min ?? ''}..${f.max ?? ''}`;
    if (f.type === 'select') t += `; choices: ${f.options.map((o) => `${o.value}=${o.text}`).join(', ')}`;
    return `${t}; now ${f.value === '' ? 'empty' : f.value})`;
  }).join('\n');
}

const settle = () => new Promise((r) => setTimeout(r, 180));

async function handle(text, ui, { spoken = false } = {}) {
  const say = (reply) => (spoken || settings.speak ? speak(reply) : Promise.resolve());
  const lower = text.toLowerCase().trim().replace(/[.!?]+$/, '');
  if (/^(undo|undo that|put it back)$/.test(lower)) {
    const undo = ui.undoStack.pop();
    if (!undo) { ui.reply('There is nothing to undo.', { how: engines.rules.label }); return say('There is nothing to undo.'); }
    undo();
    ui.reply('Put the previous values back.', { how: engines.rules.label });
    return say('Put the previous values back.');
  }
  if (/^(read|read (the )?(results?|answer|total)|what('?s| is) the (result|total|answer)|results?)$/.test(lower)) {
    const r = readResults();
    ui.reply(r || 'I could not find a result area on this page.', { how: 'Read from the page' });
    return say(r ? r.split('\n').slice(0, 3).join('. ') : 'I could not find a result area on this page.');
  }

  const fields = readFields();
  const ruled = parseUtterance(text, fields);
  if (wantsFill(text, fields, ruled)) {
    let result = ruled;
    let how = engines.rules.label;
    if (settings.engine !== 'rules') {
      try {
        ui.status(`Reading your numbers with ${engineLabel()}…`);
        const raw = await generate(FILL_SYSTEM, `Fields:\n${fieldList(fields)}\n\nThe user said: ${text}`, { json: fieldSchema(fields.slice(0, 60)) });
        // The rules' values stand; the model only adds fields they missed.
        const merged = mergeFills(ruled, validateFills(extractJson(raw), fields, text), text);
        if (merged.added) { result = merged; how = `${engineLabel()} and the rule-based reader`; }
      } catch (e) {
        ui.note(`The model could not run (${e.message}), so the rule-based reader was used.`);
      } finally { ui.status(''); }
    }
    if (!result.fills.length) {
      const msg = `I could not match that to a field on this page.${result.skipped.length ? ` ${result.skipped.map((s) => s.reason).join('; ')}.` : ''} Try saying the field's name and then the number, like "${fields.find((f) => f.type === 'number')?.label || 'price'} 40".`;
      ui.reply(msg, { how });
      return say(msg);
    }
    const undo = applyFills(result.fills, fields);
    ui.undoStack.push(undo);
    count('assistant_filled');
    await settle();
    const results = readResults();
    const changed = describeFills(result.fills, fields);
    let summary = results ? results.split('\n').slice(0, 2).join(' — ') : '';
    if (results && settings.engine !== 'rules' && (spoken || settings.speak)) {
      try { summary = await generate(ANSWER_SYSTEM, `In one or two sentences, say what this calculator result shows:\n${results}`); } catch { /* keep the raw text */ }
    }
    ui.reply(`Set ${changed}.${summary ? `\n${summary}` : ''}`, {
      how,
      fills: result.fills,
      skipped: result.skipped,
      undo: () => { undo(); ui.undoStack = ui.undoStack.filter((u) => u !== undo); },
    });
    return say(`Set ${changed}. ${summary}`);
  }

  // A question: the site's own search, the page's own words, and a model if one is on.
  let tools = [];
  try { tools = await searchSite(text); } catch { /* offline: answer from the page alone */ }
  const passage = document.querySelector('main') ? bestPassage(text) : null;
  if (settings.engine === 'rules') {
    const parts = [];
    if (passage) parts.push(`From this page: ${passage.text}`);
    if (tools.length) parts.push(passage ? 'Related tools:' : 'These tools match what you asked:');
    if (!parts.length) parts.push('I found nothing on this page or in the catalogue for that. Try fewer, plainer words, or turn on a model in Settings for open-ended questions.');
    ui.reply(parts.join('\n'), { how: engines.rules.label, tools });
    return say(passage ? passage.text : tools.length ? `These match: ${tools.slice(0, 3).map((t) => t.title).join(', ')}.` : parts[0]);
  }
  const prompt = `${fields.length ? `This page is a calculator. Its fields:\n${fieldList(fields).slice(0, 1500)}\nIts result area says:\n${readResults().slice(0, 600)}\n\n` : ''}Page text:\n${pageExcerpt(fields.length ? 1500 : 2500)}\n\nTools on this site that may be relevant:\n${tools.map((t) => `- ${t.title}: ${t.description}`).join('\n') || '(none found)'}\n\nQuestion: ${text}`;
  const bubble = ui.reply('', { how: engineLabel(), tools, streaming: true });
  try {
    const answer = await generate(ANSWER_SYSTEM, prompt, { onToken: (t) => bubble.append(t) });
    bubble.set(answer);
    return say(answer);
  } catch (e) {
    bubble.set(`The model could not answer (${e.message}).${passage ? `\nFrom this page: ${passage.text}` : ''}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// The panel.

const CSS = `
#pf-assistant{--pa-bg:#fff;--pa-ink:#1d2530;--pa-muted:#4a5666;--pa-line:#d3dce6;--pa-accent:#12594a;--pa-on-accent:#fff;--pa-bubble:#eef3f7;
  font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--pa-ink);background:var(--pa-bg);box-sizing:border-box;text-align:left}
@media (prefers-color-scheme:dark){#pf-assistant{--pa-bg:#171e27;--pa-ink:#e8eef5;--pa-muted:#a2b0c0;--pa-line:#2f3a46;--pa-accent:#7fd8c0;--pa-on-accent:#0e1a16;--pa-bubble:#212b36}}
#pf-assistant *{box-sizing:border-box}
#pf-assistant[hidden],#pf-assistant [hidden]{display:none !important}
#pf-assistant.pa-float{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:min(400px,calc(100vw - 32px));height:min(620px,calc(100vh - 32px));
  display:flex;flex-direction:column;border:1px solid var(--pa-line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden}
#pf-assistant.pa-inline{display:flex;flex-direction:column;min-height:460px;border:1px solid var(--pa-line);border-radius:14px;overflow:hidden}
@media (max-width:560px){#pf-assistant.pa-float{right:0;left:0;bottom:0;width:100%;height:min(88vh,640px);border-radius:14px 14px 0 0}}
#pf-assistant .pa-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--pa-line)}
#pf-assistant .pa-head h2{flex:1;margin:0;font-size:16px;font-weight:700}
#pf-assistant button,#pf-assistant select,#pf-assistant input{font:inherit;color:inherit}
#pf-assistant button{cursor:pointer;border:1px solid var(--pa-line);background:transparent;border-radius:8px;padding:6px 10px;min-height:36px}
#pf-assistant button.pa-primary{background:var(--pa-accent);color:var(--pa-on-accent);border-color:var(--pa-accent);font-weight:650}
#pf-assistant button[aria-pressed="true"]{background:var(--pa-accent);color:var(--pa-on-accent);border-color:var(--pa-accent)}
#pf-assistant :focus-visible{outline:2px solid var(--pa-accent);outline-offset:2px}
#pf-assistant .pa-log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
#pf-assistant .pa-msg{max-width:92%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}
#pf-assistant .pa-you{align-self:flex-end;background:var(--pa-accent);color:var(--pa-on-accent)}
#pf-assistant .pa-bot{align-self:flex-start;background:var(--pa-bubble)}
#pf-assistant .pa-how{display:block;margin-top:6px;font-size:12.5px;color:var(--pa-muted);white-space:normal}
#pf-assistant .pa-bot a{color:inherit;text-decoration:underline}
#pf-assistant .pa-bot ul{margin:6px 0 0;padding-left:18px;white-space:normal}
#pf-assistant .pa-row{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--pa-line);align-items:center}
#pf-assistant .pa-row input[type=text]{flex:1;min-width:0;padding:8px 10px;border:1px solid var(--pa-line);border-radius:8px;background:transparent}
#pf-assistant .pa-status{padding:0 12px;font-size:13px;color:var(--pa-muted);min-height:0}
#pf-assistant .pa-status:not(:empty){padding:6px 12px}
#pf-assistant progress{width:100%;height:8px}
#pf-assistant .pa-settings{padding:12px;overflow:auto;flex:1;border-top:1px solid var(--pa-line)}
#pf-assistant .pa-settings fieldset{border:1px solid var(--pa-line);border-radius:10px;margin:0 0 12px;padding:8px 12px}
#pf-assistant .pa-settings legend{font-weight:700;padding:0 4px}
#pf-assistant .pa-settings label{display:block;margin:6px 0}
#pf-assistant .pa-settings small,#pf-assistant .pa-note{display:block;color:var(--pa-muted);font-size:13px}
#pf-assistant .pa-settings input[type=text],#pf-assistant .pa-settings input[type=password],#pf-assistant .pa-settings select{width:100%;padding:6px 8px;border:1px solid var(--pa-line);border-radius:8px;background:transparent;margin-top:3px}
#pf-assistant .pa-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#pf-assistant .pa-listening{animation:pa-pulse 1s infinite}
@keyframes pa-pulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){#pf-assistant .pa-listening{animation:none}}
.pf-assist-filled{outline:3px solid #2f9e44 !important;outline-offset:2px;transition:outline-color 2s}
@media print{#pf-assistant{display:none !important}}
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

let panel = null;
let opener = null;

function build({ inline = false } = {}) {
  if (!document.getElementById('pf-assistant-css')) {
    document.head.append(el('style', { id: 'pf-assistant-css' }, CSS));
  }
  const ui = { undoStack: [] };
  const log = el('div', { class: 'pa-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const status = el('div', { class: 'pa-status', role: 'status' });
  const input = el('input', { type: 'text', 'aria-label': 'Ask, or tell the calculator your numbers', placeholder: 'Ask, or say your numbers…', autocomplete: 'off', enterkeyhint: 'send' });
  const mic = el('button', { type: 'button', 'aria-label': 'Speak', title: 'Speak (on this device)' }, '🎤');
  const voiceMode = el('button', { type: 'button', 'aria-pressed': 'false', title: 'Voice-only: listen, fill, speak the result, listen again' }, 'Voice mode');
  const send = el('button', { type: 'submit', class: 'pa-primary' }, 'Send');
  const form = el('form', { class: 'pa-row' }, input, mic, send);
  const settingsBtn = el('button', { type: 'button', 'aria-expanded': 'false' }, 'Settings');
  const close = inline ? null : el('button', { type: 'button', 'aria-label': 'Close assistant' }, '✕');
  const settingsPane = el('div', { class: 'pa-settings', hidden: true });
  const root = el('section', { id: PANEL_ID, class: inline ? 'pa-inline' : 'pa-float', role: inline ? 'region' : 'dialog', 'aria-label': 'Ask this site' },
    el('div', { class: 'pa-head' }, el('h2', {}, 'Ask'), voiceMode, settingsBtn, close),
    log, settingsPane, status, form);

  ui.status = (text, progress) => {
    status.textContent = text || '';
    if (progress !== undefined && progress !== null) status.append(el('progress', { max: '1', value: String(progress) }));
  };
  ui.note = (text) => log.append(el('p', { class: 'pa-note' }, text));
  ui.reply = (text, { how, fills, skipped, undo, tools = [], streaming } = {}) => {
    const body = el('span', {}, text);
    const msg = el('div', { class: 'pa-msg pa-bot' }, body);
    if (tools.length) {
      msg.append(el('ul', {}, ...tools.map((t) => el('li', {}, el('a', { href: t.url }, t.title), t.description ? ` — ${t.description.slice(0, 110)}` : ''))));
    }
    if (skipped?.length) msg.append(el('span', { class: 'pa-how' }, `Not filled: ${skipped.map((s) => `“${s.text}” (${s.reason})`).join('; ')}`));
    const meta = el('span', { class: 'pa-how' }, `How: ${how || engineLabel()} · Sent: ${how === engines.rules.label || how === 'Read from the page' ? 'nowhere' : engineSent()}`);
    if (fills?.length) meta.append(' · ', el('span', {}, `Read from: ${fills.map((f) => `“${f.from}”`).join(', ')}`));
    msg.append(meta);
    if (undo) {
      const b = el('button', { type: 'button', onclick: () => { undo(); b.disabled = true; b.textContent = 'Undone'; } }, 'Undo');
      msg.append(el('div', {}, b));
    }
    log.append(msg);
    log.scrollTop = log.scrollHeight;
    if (streaming) return { append: (t) => { body.textContent += t; log.scrollTop = log.scrollHeight; }, set: (t) => { body.textContent = t; } };
    return msg;
  };
  const you = (text) => { log.append(el('div', { class: 'pa-msg pa-you' }, text)); log.scrollTop = log.scrollHeight; };

  async function submit(text, spoken = false) {
    text = text.trim();
    if (!text) return;
    you(text);
    count(spoken ? 'assistant_voice' : 'assistant_typed');
    try { await handle(text, ui, { spoken }); } catch (e) { ui.reply(`Something went wrong: ${e.message}`, { how: engineLabel() }); }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; submit(t); });

  // ---- Voice in ----
  let listening = false;
  async function listen() {
    if (listening) { stopListening?.(); return ''; }
    const local = await localSpeechStatus();
    let how;
    if (local === 'available') how = 'on-device';
    else if (local === 'downloadable' && typeof SR.install === 'function') {
      ui.status('Your browser is installing its on-device speech recognition…');
      try { if (await SR.install({ langs: [LANG], processLocally: true })) how = 'on-device'; } catch { /* fall through */ }
      ui.status('');
    }
    if (!how) {
      if (!settings.sttReady && !confirm(`Speaking needs speech recognition on this device. Your browser has none built in, so this will download ${WHISPER.name} (${WHISPER.size}, once, from huggingface.co). Your voice is transcribed here and never uploaded. Download it?`)) return '';
      const listener = (d) => { if (d.kind === 'stt') ui.status(`Downloading ${WHISPER.name}… ${d.text || ''}`, d.progress); };
      progressListeners.add(listener);
      try { await ask({ type: 'stt-load' }); settings.sttReady = true; persist(); } finally { progressListeners.delete(listener); ui.status(''); }
      how = 'whisper';
    }
    listening = true;
    mic.classList.add('pa-listening');
    mic.setAttribute('aria-label', 'Stop listening');
    ui.status('Listening… (press the microphone again to stop)');
    try {
      const text = how === 'on-device'
        ? await recognizeOnDevice((t) => { input.value = t; })
        : await recognizeWhisper();
      return text;
    } finally {
      listening = false;
      mic.classList.remove('pa-listening');
      mic.setAttribute('aria-label', 'Speak');
      input.value = '';
      ui.status('');
    }
  }
  mic.addEventListener('click', async () => {
    try { const t = await listen(); if (t) await submit(t, true); } catch (e) { ui.note(`Could not listen: ${e.message}`); }
  });

  // Voice-only: a loop of listen → act → speak, until the button or "stop".
  let looping = false;
  voiceMode.addEventListener('click', async () => {
    looping = !looping;
    voiceMode.setAttribute('aria-pressed', String(looping));
    if (!looping) { stopListening?.(); globalThis.speechSynthesis?.cancel?.(); return; }
    count('assistant_voice_mode');
    await speak(readFields().length ? 'Voice mode. Tell me your numbers, ask a question, or say stop.' : 'Voice mode. Ask me anything about this site, or say stop.');
    while (looping) {
      let t = '';
      try { t = await listen(); } catch (e) { ui.note(`Could not listen: ${e.message}`); break; }
      if (!looping) break;
      if (!t) continue;
      if (/^(stop|exit|quit|stop listening|that'?s all)\.?$/i.test(t.trim())) break;
      await submit(t, true);
    }
    looping = false;
    voiceMode.setAttribute('aria-pressed', 'false');
  });

  // ---- Settings ----
  settingsBtn.addEventListener('click', () => {
    const open = settingsPane.hidden;
    settingsPane.hidden = !open;
    log.hidden = open;
    settingsBtn.setAttribute('aria-expanded', String(open));
    settingsBtn.textContent = open ? 'Back to chat' : 'Settings';
    if (open) renderSettings(settingsPane, ui);
  });

  if (close) close.addEventListener('click', () => hide());
  // On the document, not the panel: focus may sit on a button the panel just disabled.
  if (!inline) document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) hide(); });

  const fields = readFields();
  ui.reply(fields.length
    ? `I can fill in this calculator. Type or say your numbers, like “${fields.filter((f) => f.type === 'number').slice(0, 2).map((f, i) => `${f.label.replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase()} ${[40, 12][i]}`).join(', ') || 'price 40'}”, then ask “read the result”. I can also find other tools or answer from this page.`
    : 'Ask me to find a tool or explain something on this page. On any calculator I can fill in the form from what you type or say.',
  { how: engines.rules.label });
  ui.input = input;
  ui.root = root;
  return ui;
}

function renderSettings(pane, ui) {
  pane.replaceChildren();
  const engineSet = el('fieldset', {}, el('legend', {}, 'Which model answers'));
  const radio = (value, title, help, extra) => el('label', {},
    el('input', { type: 'radio', name: 'pa-engine', value, checked: settings.engine === value, onchange: () => { settings.engine = value; persist(); renderSettings(pane, ui); } }),
    ` ${title}`, el('small', {}, help), extra || null);
  engineSet.append(radio('rules', 'No model (default)', 'Fills calculators with a rule-based reader and finds tools with the site search. Instant, nothing downloaded, nothing sent anywhere.'));

  const browserRow = radio('browser', 'This browser’s built-in model', 'Checking…');
  engineSet.append(browserRow);
  browserModelStatus().then((s) => {
    browserRow.querySelector('small').textContent = {
      available: 'Ready: your browser ships a small model (Chrome’s Gemini Nano). Runs on this device; nothing is sent.',
      downloadable: 'Your browser can download its own model the first time you use it (the browser manages this download, not this site). Runs on this device.',
      downloading: 'Your browser is downloading its model.',
      unavailable: 'Your browser has this feature but not on this device (it needs enough memory and disk).',
      unsupported: 'Not in this browser. Recent desktop Chrome has it.',
    }[s] || s;
    if (s === 'unsupported' || s === 'unavailable') browserRow.querySelector('input').disabled = true;
  });

  const modelSelect = el('select', { 'aria-label': 'On-device model', onchange: (e) => { settings.model = e.target.value; settings.localReady = false; engines.local.ready = false; persist(); } },
    ...LOCAL_MODELS.map((m) => el('option', { value: m.id, selected: settings.model === m.id }, navigator.gpu ? `${m.name} — ${m.size} download, ~${m.vram} GPU memory (${m.note})` : `${m.name} — ${m.cpuSize} download, runs on the CPU (${m.note})`)));
  const loadBtn = el('button', { type: 'button', class: 'pa-primary' }, settings.localReady ? 'Load it now' : 'Download and turn on');
  loadBtn.addEventListener('click', async () => {
    settings.engine = 'local'; persist();
    loadBtn.disabled = true;
    try {
      await startLocalModel((d) => ui.status(`On-device model: ${d.text || ''}`, d.progress));
      ui.status('');
      loadBtn.textContent = 'Ready';
    } catch (e) { ui.status(`Could not start the on-device model: ${e.message}`); loadBtn.disabled = false; }
  });
  engineSet.append(radio('local', 'A model on this device (download once)',
    `Runs in the background, so the page stays responsive: on the graphics chip with WebGPU (WebLLM), or on the CPU with WebAssembly (llama.cpp) where there is no WebGPU, which is several times slower. Downloaded once from huggingface.co and the engine from cdn.jsdelivr.net, then kept in this browser’s storage. What you type is never sent. ${navigator.gpu ? '' : 'This browser has no WebGPU, so it will use the CPU: in our test a form fill took from 10 seconds to almost 2 minutes.'}`,
    el('span', {}, modelSelect, ' ', loadBtn)));

  const b = settings.byok;
  const prov = el('select', { 'aria-label': 'Provider', onchange: (e) => { b.provider = e.target.value; persist(); renderSettings(pane, ui); } },
    ...Object.entries(BYOK_PROVIDERS).map(([id, p]) => el('option', { value: id, selected: b.provider === id }, p.label)));
  const model = el('input', { type: 'text', value: b.model || '', placeholder: b.provider === 'anthropic' ? 'claude-opus-5-5 (default)' : 'model name', 'aria-label': 'Model', onchange: (e) => { b.model = e.target.value.trim(); persist(); } });
  const p = BYOK_PROVIDERS[b.provider] || {};
  const url = p.url ? el('input', { type: 'text', value: b.baseUrl || '', placeholder: 'https://…/v1', 'aria-label': 'Base URL', onchange: (e) => { b.baseUrl = e.target.value.trim(); persist(); } }) : null;
  let currentKey = '';
  try { currentKey = localStorage.getItem(BYOK_KEY) || ''; } catch { /* none */ }
  const key = p.key ? el('input', { type: 'password', value: currentKey, placeholder: 'API key', autocomplete: 'off', 'aria-label': 'API key', onchange: (e) => { try { localStorage.setItem(BYOK_KEY, e.target.value.trim()); } catch { /* private mode */ } } }) : null;
  engineSet.append(radio('byok', 'Your own key, or a model server on your computer',
    `What you type goes from this browser straight to ${p.host || 'the address you enter'}, under your account and its terms. The key is kept only in this browser and sent only there. This site never sees either.`,
    el('span', {}, prov, model, url, key, p.key ? null : el('small', {}, 'Start Ollama with OLLAMA_ORIGINS set to this site’s address so the page may reach it.'))));
  pane.append(engineSet);

  const voice = el('fieldset', {}, el('legend', {}, 'Voice'));
  voice.append(el('label', {}, el('input', { type: 'checkbox', checked: settings.speak, onchange: (e) => { settings.speak = e.target.checked; persist(); } }), ' Read every reply aloud', el('small', {}, 'Uses your device’s own voices (speechSynthesis). Replies to anything you say are always read aloud.')));
  // Not probed here: asking the browser whether it has on-device recognition
  // is left to the microphone press (it crashes some headless Chromium builds,
  // and a settings screen has no business waking a speech service).
  voice.append(el('p', {}, el('small', {}, `Speech recognition: your browser’s own on-device recogniser where it has one; otherwise ${WHISPER.name} (${WHISPER.size}, downloaded once from huggingface.co when you first press the microphone, after asking). Either way audio is transcribed on this device and never uploaded. Cloud recognition is never used.${settings.sttReady ? ` ${WHISPER.name} is already downloaded.` : ''}`)));
  pane.append(voice);

  const data = el('fieldset', {}, el('legend', {}, 'Your data'));
  const forget = el('button', { type: 'button' }, 'Delete downloaded models and settings');
  forget.addEventListener('click', async () => {
    try { for (const name of await caches.keys()) if (/webllm|transformers|tvmjs/i.test(name)) await caches.delete(name); } catch { /* no Cache API */ }
    try { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(BYOK_KEY); } catch { /* ignore */ }
    Object.assign(settings, { engine: 'rules', localReady: false, sttReady: false });
    worker?.terminate(); worker = null; engines.local.ready = false; browserSession = null;
    forget.textContent = 'Deleted';
    renderSettings(pane, ui);
  });
  data.append(el('p', {}, el('small', {}, 'Nothing you type or say is stored by this site. Settings and any key live in this browser only; models live in its cache.')), forget,
    el('p', {}, el('a', { href: new URL('ask/#how', ROOT).href }, 'How this works, what it gets wrong, and how well it is measured to work')));
  pane.append(data);
}

function hide() {
  if (!panel) return;
  panel.root.hidden = true;
  stopListening?.();
  try { speechSynthesis.cancel(); } catch { /* none */ }
  opener?.focus?.();
}

/** Open the floating panel (the header link and the calculator button call this). */
export function open({ opener: from = null, voice = false } = {}) {
  opener = from || document.activeElement;
  if (!panel) {
    panel = build();
    document.body.append(panel.root);
    count('assistant_opened');
    if (settings.engine === 'local' && settings.localReady) {
      startLocalModel((d) => panel.status(`Loading the on-device model from this browser’s cache… ${d.text || ''}`, d.progress)).then(() => panel.status(''), (e) => panel.status(`On-device model not loaded: ${e.message}`));
    }
  }
  panel.root.hidden = false;
  panel.input.focus();
  if (voice) panel.root.querySelector('.pa-row button[aria-label="Speak"]')?.click();
}

/** Mount the assistant inline (the /ask/ page). */
export function mount(container) {
  panel = build({ inline: true });
  container.replaceChildren(panel.root);
  count('assistant_opened');
  if (settings.engine === 'local' && settings.localReady) {
    startLocalModel((d) => panel.status(`Loading the on-device model from this browser’s cache… ${d.text || ''}`, d.progress)).then(() => panel.status(''), (e) => panel.status(`On-device model not loaded: ${e.message}`));
  }
  return panel;
}

/**
 * Offer this page's form to an AI agent running in the browser, through
 * WebMCP (`navigator.modelContext`) where the browser has it. The agent gets
 * the same three things a person does: search the site, fill the form (every
 * value checked against the field first), read the result.
 */
export function registerAgentTools() {
  const mc = navigator.modelContext;
  if (!mc) return [];
  const fields = readFields();
  const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
  const tools = [
    {
      name: 'search_site_tools',
      description: 'Search this site’s free calculators, checkers and research by keywords. Returns titles, URLs and one-line descriptions.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the person needs, in plain words' } }, required: ['query'] },
      annotations: { readOnlyHint: true },
      execute: async ({ query }) => text(await searchSite(String(query || ''), 8)),
    },
    {
      name: 'read_page_results',
      description: `Read the results ${document.title} is currently showing.`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => text(readResults() || 'This page shows no result area.'),
    },
  ];
  if (fields.length) {
    tools.push({
      name: 'fill_form',
      description: `Fill in the calculator on this page (${document.title}) and return what it then shows. Pass only the fields to change; values outside a field's range are refused, not clamped.`,
      inputSchema: fieldSchema(fields.slice(0, 80)),
      execute: async (input) => {
        const current = readFields();
        const { fills, skipped } = validateFills(input, current);
        applyFills(fills, current);
        await settle();
        return text({ filled: fills.map(({ key, label, value }) => ({ key, label, value })), refused: skipped, results: readResults() });
      },
    });
  }
  try {
    if (typeof mc.registerTool === 'function') for (const t of tools) mc.registerTool(t);
    else if (typeof mc.provideContext === 'function') mc.provideContext({ tools });
  } catch { /* an agent API that changed shape is not worth breaking the page for */ }
  return tools.map((t) => t.name);
}
