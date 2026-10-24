// Score an on-device model on the assistant's eval sentences, in headless
// Chromium, through llama.cpp compiled to WebAssembly (wllama): the path a
// browser without WebGPU takes. Results feed docs/reports/2026-10-21-wasm-on-the-site.md.
//
//   npm i --prefix /tmp/wl @wllama/wllama@3.8.1
//   curl -L -o /tmp/q05.gguf https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf
//   PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core/index.mjs \
//     node platform/pages/assistant/model-bench/run.mjs --wllama /tmp/wl/node_modules/@wllama/wllama/esm \
//       --model /tmp/q05.gguf --out results.json [--threads 4] [--isolated] [--n 52]
//   node platform/pages/assistant/model-bench/score.mjs results.json
//
// --isolated sends the cross-origin isolation headers that wllama needs for
// threads. GitHub Pages cannot send them, so the live site runs on one thread.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { values: a } = parseArgs({ options: {
  wllama: { type: 'string' }, model: { type: 'string' }, out: { type: 'string', default: 'results.json' },
  threads: { type: 'string', default: '' }, isolated: { type: 'boolean', default: false }, n: { type: 'string', default: '' },
} });
const files = {
  '/bench.html': path.join(HERE, 'bench.html'),
  '/fill.mjs': path.join(HERE, '..', 'fill.mjs'),
  '/evals.json': path.join(HERE, '..', 'evals.json'),
  '/model.gguf': a.model,
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  const p = files[url] || (url.startsWith('/wllama/') ? path.join(a.wllama, url.slice(8)) : null);
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end(); }
  const h = { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'content-length': fs.statSync(p).size };
  if (a.isolated) Object.assign(h, { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
  res.writeHead(200, h);
  fs.createReadStream(p).pipe(res);
}).listen(0);
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${server.address().port}/bench.html?threads=${a.threads}&n=${a.n}`);
  await page.waitForFunction(() => document.title === 'ready');
  const t = Date.now();
  const out = await page.evaluate(() => window.run());
  out.wallMs = Date.now() - t;
  out.model = path.basename(a.model);
  fs.writeFileSync(a.out, JSON.stringify(out, null, 1));
  console.log(`wrote ${a.out}: ${out.cases.length} cases in ${Math.round(out.wallMs / 1000)} s`);
} finally {
  await browser.close();
  server.close();
}
