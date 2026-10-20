import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'deploy');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const server = fs.readFileSync(path.join(root, 'counter.mjs'), 'utf8');

test('every env var the deploy files set is one counter.mjs reads', () => {
  const used = new Set([...server.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]));
  const set = [...read('Dockerfile').matchAll(/\b([A-Z_]{3,})=/g)].map((m) => m[1]);
  set.push(...[...read('compose.yaml').matchAll(/^\s+(COUNTER_ORIGIN):/gm)].map((m) => m[1]));
  assert.ok(set.length >= 3);
  for (const v of set) assert.ok(used.has(v), `${v} is not read by counter.mjs`);
});

test('the image ships only counter.mjs and runs unprivileged on the served port', () => {
  const d = read('Dockerfile');
  assert.match(d, /COPY counter\.mjs/);
  assert.match(d, /USER node/);
  assert.match(d, /PORT=8787/);
  assert.ok(!/npm (i|install|ci)/.test(d), 'counter has no dependencies');
});

test('Caddy proxies to the counter port and keeps no access log', () => {
  const c = read('Caddyfile');
  assert.match(c, /reverse_proxy counter:8787/);
  assert.match(c, /output discard/);
});

test('compose requires both operator inputs and persists the counts volume', () => {
  const y = read('compose.yaml');
  assert.match(y, /COUNTER_ORIGIN:\?/);
  assert.match(y, /COUNTER_HOST:\?/);
  assert.match(y, /counts:\/data/);
});
