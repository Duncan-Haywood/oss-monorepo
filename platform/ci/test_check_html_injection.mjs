// node --test platform/ci/test_check_html_injection.mjs
// Runs check_html_injection.js over three fixture pages in a temp dir: one that
// writes a text field into innerHTML on click (self), one that also keeps it in
// the hash and restores it on load (reflected), and one that uses textContent
// (clean).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

// CI runners have no Playwright (platform/ci/browser_checks.py, "Why this exists"); skip there.
let havePlaywright = true;
try { createRequire(import.meta.url)('playwright'); } catch { havePlaywright = false; }

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check_html_injection.js');
const PAGES = {
  bad: `<!doctype html><input id=n type=text><button id=go>Calculate</button><div id=o></div>
<script>go.onclick=()=>{o.innerHTML='Hello '+n.value;}</script>`,
  good: `<!doctype html><input id=n type=text><button id=go>Calculate</button><div id=o></div>
<script>go.onclick=()=>{o.textContent='Hello '+n.value;}</script>`,
  linky: `<!doctype html><input id=n type=text><div id=o></div>
<script>function r(){o.innerHTML='Hi '+n.value;}
n.oninput=()=>{history.replaceState(null,'','#'+encodeURIComponent(n.value));r();};
if(location.hash){n.value=decodeURIComponent(location.hash.slice(1));r();}</script>`,
  csv: `<!doctype html><textarea id=t>name,amount\nA,1</textarea><button id=go>Analyze</button><table id=o></table>
<script>go.onclick=()=>{o.innerHTML=t.value.split('\\n').slice(1).map(l=>'<tr><td>'+l.split(',')[0]+'</td></tr>').join('');}</script>`,
};

test('finds self and reflected injection, passes the escaped page', {skip: !havePlaywright && 'playwright is not installed'}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'xss-'));
  for (const [slug, html] of Object.entries(PAGES)) {
    mkdirSync(join(dir, 'ventures', slug), {recursive: true});
    writeFileSync(join(dir, 'ventures', slug, 'index.html'), html);
  }
  const out = join(dir, 'out.json');
  const r = spawnSync(process.execPath, [SCRIPT, out], {cwd: dir, encoding: 'utf8', timeout: 90000});
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const got = Object.fromEntries(JSON.parse(readFileSync(out, 'utf8')).hits.map((h) => [h.f, h.reach]));
  assert.deepEqual(got, {
    'ventures/bad/index.html': 'self',
    'ventures/csv/index.html': 'self',
    'ventures/linky/index.html': 'reflected',
  });
});
