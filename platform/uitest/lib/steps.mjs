// Scripted steps: the deterministic half. No model, no key, same result every
// run. Targets are what a user reads (a label, a button's text, a
// placeholder), or a CSS selector when it starts with `css=`.
//
//   { "fill": "Room width (ft)", "value": "12" }
//   { "click": "Calculate" }
//   { "select": "State", "value": "Texas" }
//   { "check": "Include tax", "checked": true }
//   { "press": "Enter" }
//   { "goto": "/pricing" }
//   { "expectText": "36 gallons" }          or a regex: "/\\d+ gallons/i"
//   { "expectNoText": "NaN" }
//   { "expectUrl": "/thanks" }              substring, or a regex as above
//   { "wait": 500 }
//   { "screenshot": "after-calc" }        saved under --out; a no-op without it

import { firstLine } from './actions.mjs';

export function toMatcher(pattern) {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(pattern);
  if (m) {
    const re = new RegExp(m[1], m[2]);
    return { test: s => re.test(s), label: pattern };
  }
  return { test: s => s.includes(pattern), label: JSON.stringify(pattern) };
}

export function describeStep(step) {
  if ('fill' in step) return `fill ${JSON.stringify(step.fill)} = ${JSON.stringify(String(step.value))}`;
  if ('select' in step) return `select ${JSON.stringify(step.select)} = ${JSON.stringify(String(step.value))}`;
  if ('check' in step) return `${step.checked === false ? 'uncheck' : 'check'} ${JSON.stringify(step.check)}`;
  if ('click' in step) return `click ${JSON.stringify(step.click)}`;
  if ('press' in step) return `press ${step.press}`;
  if ('goto' in step) return `goto ${step.goto}`;
  if ('expectText' in step) return `expect text ${step.expectText}`;
  if ('expectNoText' in step) return `expect no text ${step.expectNoText}`;
  if ('expectUrl' in step) return `expect url ${step.expectUrl}`;
  if ('wait' in step) return `wait ${step.wait}ms`;
  if ('screenshot' in step) return `screenshot ${step.screenshot}`;
  return JSON.stringify(step);
}

async function waitFor(check, timeoutMs, sleep) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= until) return false;
    await sleep(100);
  }
}

/**
 * Run steps in order, stopping at the first failure.
 * @returns {Promise<{ok:boolean, steps:{desc:string, ok:boolean, error?:string}[], screenshots:string[]}>}
 */
export async function runSteps(driver, steps, { resolveUrl, timeoutMs = 5000, screenshotPath = null, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const out = [];
  const screenshots = [];
  for (const step of steps) {
    const desc = describeStep(step);
    try {
      if ('fill' in step) await driver.fillTarget(step.fill, String(step.value));
      else if ('select' in step) await driver.selectTarget(step.select, String(step.value));
      else if ('check' in step) await driver.checkTarget(step.check, step.checked !== false);
      else if ('click' in step) await driver.clickTarget(step.click);
      else if ('press' in step) await driver.press(step.press);
      else if ('goto' in step) await driver.goto(resolveUrl(step.goto));
      else if ('wait' in step) await sleep(Math.min(Number(step.wait) || 0, 30000));
      else if ('screenshot' in step) { if (screenshotPath) screenshots.push(await driver.screenshot(screenshotPath(step.screenshot))); }
      else if ('expectText' in step || 'expectNoText' in step) {
        const negate = 'expectNoText' in step;
        const m = toMatcher(negate ? step.expectNoText : step.expectText);
        // Positive: wait for it to appear. Negative: it must not be there now
        // (waiting for absence would pass on a page that is still loading).
        const ok = negate ? !m.test(await driver.text()) : await waitFor(async () => m.test(await driver.text()), timeoutMs, sleep);
        if (!ok) throw new Error(negate ? `page shows ${m.label}` : `page never showed ${m.label} within ${timeoutMs}ms`);
      } else if ('expectUrl' in step) {
        const m = toMatcher(step.expectUrl);
        const ok = await waitFor(async () => m.test(await driver.url()), timeoutMs, sleep);
        if (!ok) throw new Error(`url is ${await driver.url()}, expected ${m.label}`);
      } else {
        throw new Error('unknown step');
      }
      out.push({ desc, ok: true });
    } catch (err) {
      out.push({ desc, ok: false, error: firstLine(err.message) });
      return { ok: false, steps: out, screenshots };
    }
  }
  return { ok: true, steps: out, screenshots };
}
