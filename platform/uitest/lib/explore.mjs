// The deterministic smoke check: what runs with no model key, and what runs
// before every agent scenario anyway. It opens a page, fills every empty
// field with a plausible value, nudges any pre-filled number, clicks the
// buttons that stay on the page, and reports:
//
//   fail  the page answered 4xx/5xx, or rendered nothing at all
//   warn  no <title>; fields that took input but nothing on the page changed
//         (the "renders perfectly and does nothing" defect)
//
// JavaScript errors and failed requests are collected by the driver for the
// whole scenario and judged by the runner, not here.

export function sampleValue(el) {
  const type = el.tag === 'textarea' ? 'textarea' : el.type || 'text';
  const name = (el.name || '').toLowerCase();
  switch (type) {
    case 'number': case 'range': {
      const min = el.min !== undefined ? Number(el.min) : NaN;
      const max = el.max !== undefined ? Number(el.max) : NaN;
      if (Number.isFinite(min) && Number.isFinite(max)) return String(Math.round((min + max) / 2));
      if (Number.isFinite(min)) return String(min + 10);
      if (Number.isFinite(max)) return String(Math.max(0, Math.min(10, max)));
      return '10';
    }
    case 'email': return 'qa@example.com';
    case 'tel': return '5555550123';
    case 'url': return 'https://example.com';
    case 'date': return '2026-01-15';
    case 'time': return '09:30';
    case 'month': return '2026-01';
    case 'datetime-local': return '2026-01-15T09:30';
    case 'password': return 'Test-pass-123';
    case 'search': return 'test';
    case 'textarea': return 'This is a test entry.';
    case 'text': default:
      if (/zip|postal/.test(name)) return '10001';
      if (/e-?mail/.test(name)) return 'qa@example.com';
      if (/phone/.test(name)) return '5555550123';
      if (/name/.test(name)) return 'Test User';
      if (/(amount|price|cost|rate|qty|quantity|hours|count|number|\$|%)/.test(name)) return '10';
      return 'test';
  }
}

const FILLABLE = new Set(['text', 'number', 'email', 'tel', 'url', 'date', 'time', 'month', 'datetime-local', 'password', 'search']);

export function isFillable(el) {
  if (el.disabled) return false;
  if (el.tag === 'textarea') return true;
  return el.tag === 'input' && FILLABLE.has(el.type);
}

// Buttons that would navigate away or wipe the work are left alone: the smoke
// check is about whether the page responds, not about following every link.
const SKIP_BUTTON = /\b(reset|clear|delete|remove|log ?out|sign ?out|print|share|copy|download|close|dismiss|cancel|buy|pay|checkout|subscribe|donate|sponsor)\b/i;

export function clickableButtons(snap) {
  return snap.elements.filter(el => !el.disabled
    && (el.tag === 'button' || el.role === 'button' || el.role === 'tab' || el.tag === 'summary' || (el.tag === 'input' && /^(submit|button)$/.test(el.type)))
    && !SKIP_BUTTON.test(el.name || ''));
}

/** Same-origin page links worth crawling, without fragments, de-duplicated. */
export function pageLinks(snap, isAllowed) {
  const out = new Set();
  for (const el of snap.elements) {
    if (el.tag !== 'a' || !el.href || /^(mailto|tel|javascript):/i.test(el.href)) continue;
    let u;
    try { u = new URL(el.href, snap.url); } catch { continue; }
    u.hash = '';
    if (!isAllowed(u.href)) continue;
    if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|csv|xlsx?|docx?|json|xml|txt)$/i.test(u.pathname)) continue;
    out.add(u.href);
  }
  return [...out];
}

/**
 * @returns {Promise<{status:number|null, issues:{level:'fail'|'warn', message:string}[], links:string[], filled:number, clicked:number}>}
 */
export async function explorePage(driver, url, { isAllowed = () => true, maxClicks = 12, actionTimeoutMs = 2000 } = {}) {
  const quick = { timeout: actionTimeoutMs };
  const issues = [];
  const nav = await driver.goto(url);
  const status = nav?.status ?? null;
  if (status && status >= 400) {
    issues.push({ level: 'fail', message: `HTTP ${status} for ${url}` });
    return { status, issues, links: [], filled: 0, clicked: 0 };
  }
  let snap = await driver.snapshot();
  if (!snap.elements.length && !snap.text.trim()) {
    issues.push({ level: 'fail', message: `blank page: no text and no controls at ${url}` });
    return { status, issues, links: [], filled: 0, clicked: 0 };
  }
  if (!snap.title?.trim()) issues.push({ level: 'warn', message: `no <title> at ${url}` });
  const links = pageLinks(snap, isAllowed);
  const before = snap.text;

  let filled = 0;
  for (const el of snap.elements.filter(isFillable)) {
    let value;
    if (el.value === '' || el.value === undefined) value = sampleValue(el);
    else if (el.type === 'number' && Number.isFinite(Number(el.value))) value = String(Number(el.value) + 1);
    else continue;
    try { await driver.fill(el.ref, value, quick); filled += 1; } catch { /* readonly or detached: not this check's concern */ }
  }
  for (const el of snap.elements.filter(e => e.tag === 'select' && !e.disabled && (e.options || []).length > 1)) {
    try { await driver.select(el.ref, el.options[1], quick); filled += 1; } catch { /* as above */ }
  }

  let clicked = 0;
  const startUrl = await driver.url();
  const targets = clickableButtons(await driver.snapshot()).map(b => b.name);
  const done = new Map();
  for (const name of targets) {
    if (clicked >= maxClicks) break;
    const nth = done.get(name) || 0;
    done.set(name, nth + 1);
    const current = await driver.snapshot();
    const el = clickableButtons(current).filter(b => b.name === name)[nth];
    if (!el) continue;
    try { await driver.click(el.ref, quick); clicked += 1; } catch { continue; }
    if ((await driver.url()) !== startUrl) {
      try { await driver.back(); } catch { break; }
      if ((await driver.url()) !== startUrl) break;
    }
  }

  const after = (await driver.snapshot()).text;
  if (filled > 0 && after === before) {
    issues.push({ level: 'warn', message: `filled ${filled} field(s)${clicked ? ` and clicked ${clicked} button(s)` : ''} at ${url} but the visible text never changed` });
  }
  return { status, issues, links, filled, clicked };
}
