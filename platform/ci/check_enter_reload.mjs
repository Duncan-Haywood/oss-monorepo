// Presses Enter in a form field on every venture page that has a <form>, in
// headless Chromium, and reports the pages where that reloads the page and
// throws away what the reader typed.
//
// Why: a reader fills in a calculator and presses Enter. If the inputs sit in a
// <form> with no action and no submit handler that calls preventDefault(), the
// browser's implicit submission (HTML spec, "implicit submission") sends a GET
// to the same page: it reloads, every field returns to its default, and the
// result is gone. Clicking the page's own "Calculate" button can work fine,
// and the other browser sweeps (check_float_noise.mjs, check_thousands_input.mjs)
// cancel submits on purpose so they keep the page, so none of them sees this.
//
// A page is flagged only when, after Enter, the main frame navigated to the
// same path AND the field no longer holds the value we typed. A page that
// reads its query string back into the fields (share-by-URL) keeps the value
// and passes; a form whose action points elsewhere (a search box, a mailto)
// is not probed.
//
// Usage: node platform/ci/check_enter_reload.mjs [out.json] [--limit N] [--only <substr>] [--root <dir>]...
// (--root defaults to ventures; repeat it to sweep research/ or docs/ too)
// Exit 1 when any page loses its input. Offline: every non-local request is aborted.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import cp from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Whether a form's action (as written) submits back to the page itself.
export function selfAction(action) {
  if (action == null) return true;
  const a = action.trim();
  return a === '' || a.startsWith('#') || a === '?' || a.startsWith('?');
}

// Text-like inputs a reader types into and presses Enter in.
export const TYPABLE = ['text', 'number', 'search', 'tel', 'email', 'url', ''];

// A valid-looking value for a required field, so validation does not block the
// submit we are testing (a real reader fills every field first).
export function fillValue(type, min) {
  if (type === 'number') return min !== '' && Number.isFinite(+min) ? String(+min + 1) : '7';
  if (type === 'email') return 'a@example.com';
  if (type === 'url') return 'https://example.com';
  if (type === 'tel') return '5550100';
  return '7';
}

async function main() {
  const args = process.argv.slice(2);
  const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const limit = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : 0;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
  const dirs = args.flatMap((a, i) => (a === '--root' ? [args[i + 1]] : []));
  const scan = (dirs.length ? dirs : ['ventures']).map((d) => `'${d.replace(/'/g, '')}'`).join(' ');
  const { chromium } = require('playwright');
  const root = process.cwd();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    // Resolve under root and refuse anything that escapes it (../, encoded or not).
    let file = path.resolve(root, '.' + path.sep + decodeURIComponent(req.url.split('?')[0]));
    if (file === root) file = path.join(root, 'index.html');
    if (!file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    // Check the final path (a directory's index.html) again right before it is read.
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;

  let files = cp.execSync(`find ${scan} -name '*.html' -not -path '*/node_modules/*' -not -path '*/test*' -not -path '*/fixtures/*'`)
    .toString().trim().split('\n').filter((f) => f && f.includes(only)).sort()
    .filter((f) => /<form\b/i.test(fs.readFileSync(f, 'utf8')));
  if (limit) files = files.slice(0, limit);
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', (r) => (r.request().url().startsWith(`http://localhost:${port}/`) ? r.continue() : r.abort()));
  const hits = [];
  let probed = 0;
  let next = 0;
  async function worker() {
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.dismiss().catch(() => {}));
    while (next < files.length) {
      const f = files[next++];
      const url = `http://localhost:${port}/${f}`;
      let probedHere = false;
      for (let k = 0; k < 6; k++) try {
        await p.goto(url, { waitUntil: 'load', timeout: 10000 });
        await p.waitForTimeout(150);
        // One probe per self-submitting form (up to six, a fresh load each): mark a typable field, fill the
        // form's empty required fields, and note the value we expect to survive.
        const forms = await p.evaluate(({ TYPABLE, selfSrc, fillSrc }) => {
          const selfAction = new Function(`return (${selfSrc})`)();
          const fillValue = new Function(`return (${fillSrc})`)();
          const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
          const res = [];
          document.querySelectorAll('form').forEach((form, i) => {
            if (!selfAction(form.getAttribute('action'))) return;
            if ((form.getAttribute('method') || '').toLowerCase() === 'dialog') return;
            if (form.target && form.target !== '_self') return;
            const fields = [...form.elements].filter((e) => e.tagName === 'INPUT' &&
              TYPABLE.includes((e.getAttribute('type') || '').toLowerCase()) && vis(e) && !e.disabled && !e.readOnly);
            if (!fields.length) return;
            for (const e of form.elements) {
              if (e.required && !e.value && e.tagName === 'INPUT' && vis(e)) e.value = fillValue(e.type, e.getAttribute('min') || '');
            }
            const field = fields[0];
            const t = (field.getAttribute('type') || 'text').toLowerCase();
            // A value no default is likely to equal, still valid for the field.
            let v = t === 'number' ? (field.min !== '' && Number.isFinite(+field.min) ? String(+field.min + 3) : '43')
              : t === 'email' ? 'enter-probe@example.com' : t === 'url' ? 'https://example.com/enter-probe'
              : t === 'tel' ? '5550143' : '43';
            if (field.max !== '' && Number.isFinite(+field.max) && +v > +field.max) v = field.max;
            field.value = v;
            if (!field.checkValidity()) return; // a pattern or step we cannot guess: skip, do not guess
            field.setAttribute('data-enter-probe', String(i));
            res.push({ i, id: field.id || field.name || `form${i}`, v });
          });
          return res;
        }, { TYPABLE, selfSrc: selfAction.toString(), fillSrc: fillValue.toString() });
        if (k >= forms.length) break;
        if (!probedHere) { probed++; probedHere = true; }
        const fm = forms[k];
        await p.evaluate(() => { window.__enterProbe = 1; });
        let navigated = false;
        const onNav = (fr) => { if (fr === p.mainFrame()) navigated = true; };
        p.on('framenavigated', onNav);
        await p.focus(`[data-enter-probe="${fm.i}"]`);
        await p.keyboard.press('Enter');
        await p.waitForTimeout(500);
        await p.waitForLoadState('load').catch(() => {});
        p.off('framenavigated', onNav);
        const after = await p.evaluate(({ id }) => {
          const e = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
          return { still: window.__enterProbe === 1, path: location.pathname, search: location.search, value: e ? e.value : null };
        }, fm).catch(() => null);
        if (!after) break;
        const samePath = after.path === new URL(url).pathname;
        if ((navigated || !after.still) && samePath && after.value !== fm.v) {
          hits.push({ f, field: fm.id, typed: fm.v, after: after.value, url: after.path + after.search });
          break; // one finding per page is enough to send someone to fix it
        }
      } catch (e) { break; /* load timeouts are other sweeps' business */ }
      if (p.url() !== 'about:blank') await p.goto('about:blank').catch(() => {});
    }
    await p.close();
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  await browser.close();
  server.close();
  console.log(`${files.length} pages with a <form>; ${probed} probed; ${hits.length} lose input on Enter`);
  for (const h of hits) console.log(`${h.f}  #${h.field}: typed ${h.typed}, after Enter ${JSON.stringify(h.after)} at ${h.url}`);
  if (out) fs.writeFileSync(out, JSON.stringify(hits, null, 1));
  process.exit(hits.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
