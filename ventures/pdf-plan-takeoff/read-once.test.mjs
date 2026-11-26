// Pins the 2026-11-26 speed-ups in the sheet reader to what they replaced
// (perf note docs/history/pdf-plan-takeoff-perf-2026-11-26.md):
//  - readSheets tokenizes a page once (TokenList) for both the path reader and
//    the text reader: same tokens, same segments, same runs as from the string;
//  - pathSegments keeps points as plain numbers: same output as the
//    array-of-points version, kept below as the reference, on a seeded fuzz;
//  - bytesToBinaryString decodes ASCII chunks with TextDecoder: same string as
//    String.fromCharCode, chunk edges and high bytes included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, TokenList, runTokens, textRuns, mul } from './pdf-text.mjs';
import { pathSegments } from './geometry.mjs';
import { bytesToBinaryString, PName } from './pdf-parser.mjs';

function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const OPS = ['m', 'l', 'c', 'v', 'y', 'h', 're', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n', 'W', 'q', 'Q', 'cm', 'w',
  'BT', 'ET', 'Tf', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"', 'TL', 'Tc', 'Tw', 'Tz', 'Do', 'gs', 'RG', 'sh', 'BDC', 'EMC', 'xyz', 'Qq'];
function fuzzStream(r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = r();
    if (x < 0.55) out.push(((r() - 0.3) * 800).toFixed(Math.floor(r() * 5)));
    else if (x < 0.6) out.push(['/F1', '/Fm0', '/Fm1', '/Im0', '(1/4" = 1\'-0")', '<41 42>', '[(A) -250 (B)]', '<< /K 1 >>', 'true', 'null', '-0', '.5', '5.'][Math.floor(r() * 13)]);
    else if (x < 0.62) out.push('% a comment\n');
    else out.push(OPS[Math.floor(r() * OPS.length)]);
  }
  return out.join(r() < 0.5 ? ' ' : '\n');
}

const list = (content) => { const got = []; runTokens(content, (v) => got.push({ v }), (op) => got.push({ op })); return got; };

test('a TokenList hands back exactly the tokens of its string', () => {
  const r = rng(7);
  for (let k = 0; k < 300; k++) {
    const s = fuzzStream(r, 1 + Math.floor(r() * 400));
    const want = [...tokens(s)], got = list(new TokenList(s));
    assert.equal(got.length, want.length);
    for (let i = 0; i < want.length; i++) {
      if ('op' in want[i]) assert.equal(got[i].op, want[i].op);
      else if (typeof want[i].v === 'number') assert.ok(Object.is(got[i].v, want[i].v), `${s}: token ${i}`);
      else assert.deepEqual(got[i].v, want[i].v);
    }
    assert.deepEqual(list(s), got); // the string path of runTokens agrees too
  }
  assert.equal(new TokenList('').n, 0);
  assert.equal(new TokenList('1 '.repeat(5000)).n, 5000); // grows past its first 1024
});

// pathSegments as it was before 2026-11-26 (points as two-element arrays).
const MAX_SEGMENTS = 600000;
function cubicRef(p0, p1, p2, p3, out, flags) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = Math.max(2, Math.min(24, Math.ceil(len / 6)));
  let prev = p0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const p = [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
    out.push(prev, p);
    if (flags) flags[out.length / 2 - 1] = 1;
    prev = p;
  }
}
function pathSegmentsRef(content, forms = null, startCtm = null, depth = 0, acc = null, images = null) {
  const out = acc || { segs: [], paint: [], widths: [], curve: [], truncated: false, images: [] };
  let ctm = startCtm ? startCtm.slice() : [1, 0, 0, 1, 0, 0];
  let lw = 1;
  const stack = [];
  let operands = [];
  let path = [];
  let curved = [];
  let cur = null, start = null;
  const pt = (x, y) => [x * ctm[0] + y * ctm[2] + ctm[4], x * ctm[1] + y * ctm[3] + ctm[5]];
  const nums = (k) => operands.slice(-k).map((v) => (typeof v === 'number' ? v : 0));
  const paint = (kind) => {
    const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    for (let i = 0; i + 1 < path.length; i += 2) {
      if (out.paint.length >= MAX_SEGMENTS) { out.truncated = true; break; }
      const a = path[i], b = path[i + 1];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      out.segs.push(a[0], a[1], b[0], b[1]);
      out.paint.push(kind);
      out.widths.push(lw * scale);
      out.curve.push(curved[i / 2] || 0);
    }
    path = []; curved = []; cur = start = null;
  };
  for (const t of tokens(content)) {
    if (!('op' in t)) { operands.push(t.v); if (operands.length > 64) operands.shift(); continue; }
    switch (t.op) {
      case 'q': stack.push([ctm.slice(), lw]); break;
      case 'Q': if (stack.length) [ctm, lw] = stack.pop(); break;
      case 'cm': if (operands.length >= 6) ctm = mul(nums(6), ctm); break;
      case 'w': if (operands.length) lw = nums(1)[0]; break;
      case 'm': if (operands.length >= 2) { const [x, y] = nums(2); cur = start = pt(x, y); } break;
      case 'l': if (operands.length >= 2 && cur) { const [x, y] = nums(2); const p = pt(x, y); path.push(cur, p); cur = p; } break;
      case 'c': if (operands.length >= 6 && cur) { const v = nums(6); const p3 = pt(v[4], v[5]); cubicRef(cur, pt(v[0], v[1]), pt(v[2], v[3]), p3, path, curved); cur = p3; } break;
      case 'v': if (operands.length >= 4 && cur) { const v = nums(4); const p3 = pt(v[2], v[3]); cubicRef(cur, cur, pt(v[0], v[1]), p3, path, curved); cur = p3; } break;
      case 'y': if (operands.length >= 4 && cur) { const v = nums(4); const p3 = pt(v[2], v[3]); cubicRef(cur, pt(v[0], v[1]), p3, p3, path, curved); cur = p3; } break;
      case 'h': if (cur && start) { path.push(cur, start); cur = start; } break;
      case 're': if (operands.length >= 4) {
        const [x, y, w, h] = nums(4);
        const a = pt(x, y), b = pt(x + w, y), c = pt(x + w, y + h), d = pt(x, y + h);
        path.push(a, b, b, c, c, d, d, a);
        cur = start = a;
      } break;
      case 'S': case 's': case 'B': case 'B*': case 'b': case 'b*':
        if ((t.op === 's' || t.op === 'b' || t.op === 'b*') && cur && start) path.push(cur, start);
        paint(1); break;
      case 'f': case 'F': case 'f*': paint(2); break;
      case 'n': path = []; curved = []; cur = start = null; break;
      case 'Do': {
        const nameOp = operands.find((x) => x instanceof PName);
        const form = forms && nameOp ? forms.get(nameOp.name) : null;
        if (form && depth < 8) pathSegmentsRef(form.content, form.forms, mul(form.matrix, ctm), depth + 1, out, form.images || null);
        else if (nameOp && images && images.has(nameOp.name)) out.images.push({ num: images.get(nameOp.name), ctm: ctm.slice() });
        break;
      }
      default: break;
    }
    operands = [];
  }
  return out;
}

const sameNumbers = (a, b, what) => {
  assert.equal(a.length, b.length, `${what}: length`);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) assert.fail(`${what}[${i}]: ${a[i]} vs ${b[i]}`);
};

test('the path reader matches the array-of-points version, from a string or a TokenList', () => {
  const r = rng(11);
  for (let k = 0; k < 400; k++) {
    const inner = new Map([['Fm1', { content: fuzzStream(r, 60), forms: new Map(), matrix: [0.5, 0, 0, 0.5, 3, 4] }]]);
    const forms = new Map([['Fm0', { content: fuzzStream(r, 120), forms: inner, matrix: [0, 1, -1, 0, 10, 20] }]]);
    const images = new Map([['Im0', 42]]);
    const s = fuzzStream(r, 50 + Math.floor(r() * 600));
    const want = pathSegmentsRef(s, forms, null, 0, null, images);
    for (const got of [pathSegments(s, forms, null, 0, null, images), pathSegments(new TokenList(s), forms, null, 0, null, images)]) {
      for (const key of ['segs', 'paint', 'widths', 'curve']) sameNumbers(got[key], want[key], `${key} of ${JSON.stringify(s.slice(0, 80))}`);
      assert.equal(got.truncated, want.truncated);
      assert.deepEqual(got.images, want.images);
    }
  }
});

test('the text reader reads the same runs from a TokenList as from its string', () => {
  const r = rng(13);
  const font = null;
  for (let k = 0; k < 200; k++) {
    const s = fuzzStream(r, 50 + Math.floor(r() * 400));
    const forms = new Map([['Fm0', { content: fuzzStream(r, 80), fonts: new Map(), forms: new Map(), matrix: [1, 0, 0, 1, 5, 5] }]]);
    assert.deepEqual(textRuns(new TokenList(s), new Map([['F1', font]]), forms), textRuns(s, new Map([['F1', font]]), forms));
  }
  const runs = textRuns(new TokenList('BT /F1 12 Tf 72 700 Td (SCALE 1/4) Tj ET'), new Map());
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'SCALE 1/4');
});

function oldBinaryString(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
}

test('bytesToBinaryString: the same string as fromCharCode, ASCII chunks, binary chunks and edges', () => {
  const r = rng(17);
  for (const n of [0, 1, 0x7fff, 0x8000, 0x8001, 0x10000 + 5, 200000]) {
    for (const mode of ['ascii', 'binary', 'mixed', 'high-at-edges']) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (mode === 'binary') b[i] = Math.floor(r() * 256);
        else if (mode === 'mixed') b[i] = Math.floor(i / 0x8000) % 2 ? Math.floor(r() * 256) : Math.floor(r() * 128);
        else b[i] = Math.floor(r() * 128);
      }
      if (mode === 'high-at-edges') for (let i = 0x7fff; i < n; i += 0x8000) { b[i] = 0x80; if (i + 1 < n) b[i + 1] = 0xff; }
      assert.equal(bytesToBinaryString(b), oldBinaryString(b), `${mode} ${n}`);
    }
  }
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const s = bytesToBinaryString(all);
  for (let i = 0; i < 256; i++) assert.equal(s.charCodeAt(i), i);
  // a subarray view (offset into a larger buffer) reads only its own bytes
  const big = Uint8Array.from({ length: 70000 }, (_, i) => 32 + (i % 90));
  assert.equal(bytesToBinaryString(big.subarray(3, 69990)), oldBinaryString(big.subarray(3, 69990)));
});
