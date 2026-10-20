// What the agent sees: a compact text snapshot of the page, not a screenshot.
//
// Text keeps the tool provider-agnostic (any model that returns text can
// drive it, no vision needed), cheap (a few thousand tokens a step), and
// reproducible in a report. Every interactive element gets a numbered ref,
// stamped on the element as `data-uitest-ref`, so an action names "ref 7"
// rather than a selector the model has to invent.

export const REF_ATTR = 'data-uitest-ref';

/**
 * Runs inside the page (Playwright `page.evaluate`), so it must be
 * self-contained: no closure over module scope.
 */
export function collectInPage({ refAttr, maxText }) {
  const visible = el => {
    if (!el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    // Hidden radio/checkbox inputs styled behind a label are still operable.
    if (el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type)) return true;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const nameOf = el => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ');
      if (clean(t)) return clean(t);
    }
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map(l => l.innerText).join(' ');
      if (clean(t)) return clean(t);
    }
    if (el.tagName === 'INPUT' && /^(submit|button|reset)$/.test(el.type)) return clean(el.value);
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const t = clean(el.innerText);
      if (t) return t.slice(0, 80);
    }
    return clean(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || el.id || '');
  };
  const SELECTOR = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=switch],[role=combobox],[contenteditable=""],[contenteditable=true]';
  document.querySelectorAll(`[${refAttr}]`).forEach(el => el.removeAttribute(refAttr));
  const elements = [];
  let ref = 0;
  for (const el of document.querySelectorAll(SELECTOR)) {
    if (!visible(el)) continue;
    ref += 1;
    el.setAttribute(refAttr, String(ref));
    const tag = el.tagName.toLowerCase();
    const item = { ref, tag, name: nameOf(el) };
    const role = el.getAttribute('role');
    if (role) item.role = role;
    if (tag === 'input') item.type = el.type;
    if (tag === 'input' && el.min !== '') item.min = el.min;
    if (tag === 'input' && el.max !== '') item.max = el.max;
    if (tag === 'a') item.href = el.getAttribute('href');
    if (/^(input|textarea)$/.test(tag) && !/^(checkbox|radio|submit|button|reset)$/.test(el.type)) item.value = el.value;
    if (tag === 'input' && /^(checkbox|radio)$/.test(el.type)) item.checked = el.checked;
    if (tag === 'select') {
      item.value = el.options[el.selectedIndex]?.text ?? '';
      item.options = [...el.options].slice(0, 25).map(o => clean(o.text));
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
    if (el.required) item.required = true;
    if (el.validity && !el.validity.valid) item.invalid = el.validationMessage || true;
    elements.push(item);
  }
  const alerts = [...document.querySelectorAll('[role=alert],[role=status],[aria-live]')]
    .filter(visible).map(el => clean(el.innerText)).filter(Boolean).slice(0, 10);
  const text = clean(document.body ? document.body.innerText : '');
  return {
    url: location.href,
    title: document.title,
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(h => `${h.tagName.toLowerCase()}: ${clean(h.innerText)}`).slice(0, 30),
    alerts,
    elements,
    text: text.length > maxText ? text.slice(0, maxText) + ' …[truncated]' : text,
    textLength: text.length,
  };
}

const show = v => JSON.stringify(String(v)).slice(0, 120);

/** Render a snapshot as the lines the agent reads. */
export function formatSnapshot(snap, { maxElements = 150 } = {}) {
  const lines = [`URL: ${snap.url}`, `Title: ${snap.title || '(none)'}`];
  if (snap.headings?.length) lines.push('Headings:', ...snap.headings.map(h => `  ${h}`));
  if (snap.alerts?.length) lines.push('Alerts / live regions:', ...snap.alerts.map(a => `  ${a}`));
  lines.push('Interactive elements:');
  const els = snap.elements || [];
  if (!els.length) lines.push('  (none)');
  for (const el of els.slice(0, maxElements)) {
    let kind = el.role || (el.tag === 'input' ? `input[${el.type}]` : el.tag);
    let line = `  [${el.ref}] ${kind}`;
    if (el.name) line += ` ${show(el.name)}`;
    if (el.value !== undefined && el.tag !== 'select') line += ` value=${show(el.value)}`;
    if (el.tag === 'select') line += ` selected=${show(el.value)} options=[${(el.options || []).map(show).join(', ')}]`;
    if (el.checked !== undefined) line += el.checked ? ' (checked)' : ' (unchecked)';
    if (el.href) line += ` -> ${el.href.slice(0, 100)}`;
    if (el.disabled) line += ' (disabled)';
    if (el.required) line += ' (required)';
    if (el.invalid) line += ` (invalid${typeof el.invalid === 'string' ? `: ${el.invalid}` : ''})`;
    lines.push(line);
  }
  if (els.length > maxElements) lines.push(`  … ${els.length - maxElements} more not shown`);
  lines.push('Visible text:', snap.text || '(empty)');
  return lines.join('\n');
}
