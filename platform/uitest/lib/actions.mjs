// The agent's action vocabulary, how a model reply becomes one, and how one
// runs against a driver (see browser.mjs; tests use a fake).

export const ACTIONS = Object.freeze({
  click: { needs: ['ref'], doc: '{"action":"click","ref":N}' },
  fill: { needs: ['ref', 'value'], doc: '{"action":"fill","ref":N,"value":"text"}  (replaces the field\'s contents)' },
  select: { needs: ['ref', 'value'], doc: '{"action":"select","ref":N,"value":"option text"}' },
  check: { needs: ['ref'], doc: '{"action":"check","ref":N,"checked":true}  (checkbox, radio or switch)' },
  press: { needs: ['key'], doc: '{"action":"press","key":"Enter"}  (key on the focused element)' },
  goto: { needs: ['url'], doc: '{"action":"goto","url":"/path"}  (same site only)' },
  scroll: { needs: [], doc: '{"action":"scroll","direction":"down"}' },
  back: { needs: [], doc: '{"action":"back"}' },
  wait: { needs: [], doc: '{"action":"wait","ms":1000}  (max 5000)' },
  done: { needs: ['verdict', 'reason'], doc: '{"action":"done","verdict":"pass"|"fail","reason":"what you saw"}' },
});

export class ActionError extends Error {
  constructor(message) { super(message); this.name = 'ActionError'; }
}

/**
 * Pull the one JSON object out of a model reply. Models wrap JSON in prose or
 * code fences however they are asked; accept both, reject anything ambiguous.
 */
export function parseReply(text) {
  if (typeof text !== 'string' || !text.trim()) throw new ActionError('empty reply');
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1].trim());
  const candidates = fenced.length ? fenced : [];
  if (!candidates.length) {
    // The last balanced {...} in the text: the action usually follows any reasoning.
    const objects = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { if (depth > 0) inStr = true; continue; }
      if (c === '{') { if (depth === 0) start = i; depth++; }
      else if (c === '}' && depth > 0) { depth--; if (depth === 0) objects.push(text.slice(start, i + 1)); }
    }
    if (objects.length) candidates.push(objects[objects.length - 1]);
  }
  if (!candidates.length) throw new ActionError('no JSON object in reply');
  let obj;
  try { obj = JSON.parse(candidates[candidates.length - 1]); } catch (e) { throw new ActionError(`reply JSON does not parse: ${e.message}`); }
  return validateAction(obj);
}

export function validateAction(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new ActionError('action must be a JSON object');
  const spec = ACTIONS[obj.action];
  if (!spec) throw new ActionError(`unknown action "${obj.action}"; use one of ${Object.keys(ACTIONS).join(', ')}`);
  for (const k of spec.needs) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') throw new ActionError(`${obj.action} needs "${k}"`);
  }
  const out = { action: obj.action };
  if (typeof obj.thought === 'string') out.thought = obj.thought.slice(0, 500);
  if (spec.needs.includes('ref')) {
    const ref = Number(obj.ref);
    if (!Number.isInteger(ref) || ref < 1) throw new ActionError(`ref must be a positive integer, got ${JSON.stringify(obj.ref)}`);
    out.ref = ref;
  }
  if ('value' in obj) out.value = String(obj.value);
  if (obj.action === 'check') out.checked = obj.checked !== false;
  if (obj.action === 'press') out.key = String(obj.key);
  if (obj.action === 'goto') out.url = String(obj.url);
  if (obj.action === 'scroll') out.direction = obj.direction === 'up' ? 'up' : 'down';
  if (obj.action === 'wait') out.ms = Math.min(5000, Math.max(0, Number(obj.ms) || 1000));
  if (obj.action === 'done') {
    if (obj.verdict !== 'pass' && obj.verdict !== 'fail') throw new ActionError('verdict must be "pass" or "fail"');
    out.verdict = obj.verdict;
    out.reason = String(obj.reason).slice(0, 1000);
  }
  return out;
}

/** One line for logs and reports. */
export function describeAction(a, snap) {
  const el = a.ref && snap?.elements?.find(e => e.ref === a.ref);
  const target = el ? ` [${a.ref}] ${el.name ? JSON.stringify(el.name.slice(0, 60)) : el.tag}` : a.ref ? ` [${a.ref}]` : '';
  switch (a.action) {
    case 'fill': case 'select': return `${a.action}${target} = ${JSON.stringify(a.value)}`;
    case 'check': return `${a.checked ? 'check' : 'uncheck'}${target}`;
    case 'press': return `press ${a.key}`;
    case 'goto': return `goto ${a.url}`;
    case 'scroll': return `scroll ${a.direction}`;
    case 'wait': return `wait ${a.ms}ms`;
    case 'done': return `done: ${a.verdict} — ${a.reason}`;
    default: return `${a.action}${target}`;
  }
}

/** Run a non-terminal action. Driver errors become ActionErrors the agent sees and can recover from. */
export async function perform(driver, a, { resolveUrl, isAllowed }) {
  try {
    switch (a.action) {
      case 'click': return await driver.click(a.ref);
      case 'fill': return await driver.fill(a.ref, a.value);
      case 'select': return await driver.select(a.ref, a.value);
      case 'check': return await driver.check(a.ref, a.checked);
      case 'press': return await driver.press(a.key);
      case 'scroll': return await driver.scroll(a.direction);
      case 'back': return await driver.back();
      case 'wait': return await driver.wait(a.ms);
      case 'goto': {
        const url = resolveUrl(a.url);
        if (!isAllowed(url)) throw new ActionError(`${url} is outside the site under test`);
        return await driver.goto(url);
      }
      default: throw new ActionError(`cannot perform ${a.action}`);
    }
  } catch (err) {
    if (err instanceof ActionError) throw err;
    throw new ActionError(firstLine(err.message));
  }
}

export function firstLine(s) {
  return String(s || '').split('\n').find(l => l.trim())?.trim().slice(0, 300) || 'unknown error';
}
