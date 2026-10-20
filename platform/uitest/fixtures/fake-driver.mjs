// An in-memory stand-in for browser.mjs's driver: the paint-estimator fixture
// as plain state, so the agent loop, steps and smoke check are tested without
// a browser. `broken: true` makes Calculate do nothing (the defect sweep.mjs
// exists for).

export function fakeDriver({ broken = false, url = 'http://app.test/' } = {}) {
  const state = { url, width: '', height: '', coats: '1', result: '', log: [] };
  const elements = () => [
    { ref: 1, tag: 'input', type: 'number', name: 'Wall width (ft)', value: state.width },
    { ref: 2, tag: 'input', type: 'number', name: 'Wall height (ft)', value: state.height },
    { ref: 3, tag: 'select', name: 'Coats', value: state.coats, options: ['1', '2', '3'] },
    { ref: 4, tag: 'button', name: 'Calculate' },
    { ref: 5, tag: 'a', name: 'Pricing', href: '/pricing' },
    { ref: 6, tag: 'a', name: 'Elsewhere', href: 'https://other.test/' },
  ];
  const text = () => `Paint estimator ${state.result}`.trim();
  const byName = name => elements().find(e => e.name === name);
  const fields = { 1: 'width', 2: 'height' };
  const d = {
    state,
    events: { consoleErrors: [], pageErrors: [], requestFailures: [], blocked: [], dialogs: [] },
    drain() { const e = d.events; d.events = { consoleErrors: [], pageErrors: [], requestFailures: [], blocked: [], dialogs: [] }; return e; },
    async goto(u) { state.log.push(`goto ${u}`); Object.assign(state, { url: u, width: '', height: '', coats: '1', result: '' }); return { status: u.includes('missing') ? 404 : 200 }; },
    async snapshot() { return { url: state.url, title: 'Paint estimator', headings: ['h1: Paint estimator'], alerts: [], elements: elements(), text: text() }; },
    async url() { return state.url; },
    async text() { return text(); },
    async click(ref) {
      state.log.push(`click ${ref}`);
      if (ref === 4) {
        if (broken) return;
        const w = Number(state.width), h = Number(state.height);
        state.result = w > 0 && h > 0 ? `You need ${Math.ceil(w * h * Number(state.coats) / 35) / 10} gallons of paint.` : 'Enter a width and a height.';
      } else if (ref === 5) state.url = new URL('/pricing', state.url).href;
      else if (ref > 6) throw new Error(`locator [data-uitest-ref="${ref}"] not found\nCall log: ...`);
    },
    async fill(ref, v) { state.log.push(`fill ${ref} ${v}`); if (!fields[ref]) throw new Error('not a field'); state[fields[ref]] = v; },
    async select(ref, v) { state.log.push(`select ${ref} ${v}`); if (ref !== 3) throw new Error('not a select'); state.coats = v; },
    async check() { throw new Error('no checkbox'); },
    async press(k) { state.log.push(`press ${k}`); },
    async scroll() {},
    async back() { state.url = url; },
    async wait() {},
    async fillTarget(t, v) { const e = byName(t); if (!e) throw new Error(`no visible element matches "${t}"`); return d.fill(e.ref, v); },
    async selectTarget(t, v) { const e = byName(t); if (!e) throw new Error(`no visible element matches "${t}"`); return d.select(e.ref, v); },
    async checkTarget(t) { throw new Error(`no visible element matches "${t}"`); },
    async clickTarget(t) { const e = byName(t); if (!e) throw new Error(`no visible element matches "${t}"`); return d.click(e.ref); },
    async screenshot(p) { return p; },
    async close() {},
  };
  return d;
}

/** A "model" that drives the fixture correctly: fill, fill, calculate, judge. Finds refs by name, as a model would. */
export function scriptedModel() {
  return async (_system, prompt) => {
    const page = prompt.slice(prompt.indexOf('<<<PAGE'));
    const ref = name => Number(new RegExp(`\\[(\\d+)\\][^\\n]*"${name.replace(/[()]/g, '\\$&')}"`).exec(page)?.[1]);
    const empty = name => new RegExp(`"${name.replace(/[()]/g, '\\$&')}" value=""`).test(page);
    let action;
    if (empty('Wall width (ft)')) action = { thought: 'width', action: 'fill', ref: ref('Wall width (ft)'), value: '12' };
    else if (empty('Wall height (ft)')) action = { thought: 'height', action: 'fill', ref: ref('Wall height (ft)'), value: '8' };
    else if (/gallons/.test(page)) action = { action: 'done', verdict: 'pass', reason: page.match(/You need [\d.]+ gallons/)[0] };
    else if (/ACTIONS SO FAR:[\s\S]*click \[\d+\] "Calculate"[\s\S]*click \[\d+\] "Calculate"/.test(prompt)) action = { action: 'done', verdict: 'fail', reason: 'Calculate does nothing' };
    else action = { action: 'click', ref: ref('Calculate') };
    return { text: `Next step.\n\`\`\`json\n${JSON.stringify(action)}\n\`\`\``, usage: { input: 100, output: 20 } };
  };
}
