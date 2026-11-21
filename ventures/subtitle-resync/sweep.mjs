// Robustness sweep for autoAlign on synthetic tracks: `node sweep.mjs`.
// Prints how many of 200 generated (reference, shifted+stretched target)
// pairs come back within 500 ms at the target's first and last cue, the
// confidence ratings, and how many of 50 unrelated pairs are rated high.
// The numbers quoted on fix-subtitles-out-of-sync.html come from this.
import { autoAlign, candidateScales } from './engine.mjs';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ref(n, seed) { const r = rng(seed); const c = []; let t = 20000; for (let i = 0; i < n; i++) { t += 800 + r() * (r() < 0.1 ? 40000 : 4000); const d = 900 + r() * 3500; c.push({ startMs: Math.round(t), endMs: Math.round(t + d) }); t += d; } return c; }
function tgt(R, { scale, offsetMs, jitter, drop, extra, seed }) {
  const r = rng(seed); const o = [];
  for (const c of R) { if (r() < drop) continue; const s = Math.round((c.startMs + (r() * 2 - 1) * jitter - offsetMs) / scale); o.push({ startMs: s, endMs: s + 1000 }); }
  const span = R[R.length - 1].startMs;
  for (let i = 0; i < R.length * extra; i++) { const s = Math.round((r() * span - offsetMs) / scale); o.push({ startMs: s, endMs: s + 1500 }); }
  return o.filter((c) => c.startMs > 0).sort((a, b) => a.startMs - b.startMs);
}

const noise = { jitter: Number(process.argv[2] ?? 300), drop: Number(process.argv[3] ?? 0.25), extra: Number(process.argv[4] ?? 0.2) };
const scales = candidateScales().map((c) => c.scale).filter((s) => s > 0.9 && s < 1.1);
let ok = 0; const conf = { high: 0, medium: 0, low: 0 }; let worstHigh = 0; const t0 = Date.now();
for (let seed = 1; seed <= 200; seed++) {
  const r = rng(seed * 7);
  const R = ref(600 + Math.floor(r() * 1200), seed);
  const scale = scales[Math.floor(r() * scales.length)];
  const off = (r() * 2 - 1) * 300000;
  const T = tgt(R, { scale, offsetMs: off, ...noise, seed: seed + 1000 });
  const a = autoAlign(T, R);
  conf[a.confidence]++;
  const e = Math.max(...[T[0].startMs, T[T.length - 1].startMs].map((t) => Math.abs(a.scale * t + a.offsetMs - (scale * t + off))));
  if (a.confidence === 'high') worstHigh = Math.max(worstHigh, e);
  if (e < 500) ok++;
}
let falseHigh = 0;
for (let s = 1; s <= 50; s++) if (autoAlign(ref(800, s), ref(800, s + 500)).confidence === 'high') falseHigh++;
console.log(JSON.stringify({ noise, within500ms: `${ok}/200`, confidence: conf, worstHighConfidenceErrorMs: Math.round(worstHigh), msPerAlignment: Math.round((Date.now() - t0) / 200), unrelatedRatedHigh: `${falseHigh}/50` }));
