// Mix and master check: reads a PCM or float WAV and measures integrated loudness
// (ITU-R BS.1770-4 K-weighting, EBU R128 gating), 4x oversampled true peak,
// clipped samples and mono compatibility, then compares them with streaming targets.
// Local only, no network. Targets are common published guidance, not a platform's contract.
import { readFileSync } from 'node:fs';

export function parseWav(buf) {
  if (buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') fmt = { tag: buf.readUInt16LE(body), ch: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === 'data') { data = [body, Math.min(size, buf.length - body)]; break; }
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  // WAVE_FORMAT_EXTENSIBLE (0xfffe) is read as integer PCM; extensible float files are not supported.
  const float = fmt.bits === 32 && fmt.tag === 3;
  if (!float && ![16, 24, 32].includes(fmt.bits)) throw new Error(`unsupported ${fmt.bits}-bit WAV`);
  if (fmt.ch < 1 || fmt.ch > 2) throw new Error('only mono and stereo are supported');
  const bytes = fmt.bits / 8;
  const n = Math.floor(data[1] / (bytes * fmt.ch));
  const chans = Array.from({ length: fmt.ch }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) {
    const o = data[0] + (i * fmt.ch + c) * bytes;
    chans[c][i] = float ? buf.readFloatLE(o)
      : fmt.bits === 16 ? buf.readInt16LE(o) / 32768
      : fmt.bits === 24 ? buf.readIntLE(o, 3) / 8388608
      : buf.readInt32LE(o) / 2147483648;
  }
  return { rate: fmt.rate, chans };
}

function kFilters(fs) {
  let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const hp = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, hp];
}
function biquad(x, { b, a }) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
  }
  return y;
}

export function integratedLufs(chans, fs) {
  const filt = chans.map((c) => kFilters(fs).reduce((s, f) => biquad(s, f), c));
  const n = filt[0].length, win = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const blocks = [];
  for (let s = 0; s + win <= n; s += hop) {
    let z = 0;
    for (const c of filt) { let e = 0; for (let i = s; i < s + win; i++) e += c[i] * c[i]; z += e / win; }
    blocks.push(z);
  }
  const lk = (z) => -0.691 + 10 * Math.log10(z);
  const abs = blocks.filter((z) => z > 0 && lk(z) > -70);
  if (!abs.length) return null;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const kept = abs.filter((z) => lk(z) > rel);
  return kept.length ? lk(kept.reduce((a, b) => a + b, 0) / kept.length) : null;
}

// 4x oversampling with a Hann-windowed sinc, 24 taps per side: a close estimate, not the full BS.1770 filter.
export function truePeak(x) {
  let peak = 0;
  const half = 12;
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    for (let ph = 1; ph < 4; ph++) {
      const t = ph / 4; let v = 0;
      for (let k = -half + 1; k <= half; k++) {
        const j = i + k; if (j < 0 || j >= x.length) continue;
        const d = k - t, s = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
        v += x[j] * s * (0.5 + 0.5 * Math.cos(Math.PI * d / half));
      }
      peak = Math.max(peak, Math.abs(v));
    }
  }
  return peak;
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

export function analyze({ rate, chans }) {
  const lufs = integratedLufs(chans, rate);
  const tp = Math.max(...chans.map(truePeak));
  const clipped = chans.reduce((s, c) => s + c.reduce((k, v) => k + (Math.abs(v) >= 0.9999 ? 1 : 0), 0), 0);
  let mono = null;
  if (chans.length === 2) {
    let ll = 0, rr = 0, lr = 0;
    for (let i = 0; i < chans[0].length; i++) { ll += chans[0][i] ** 2; rr += chans[1][i] ** 2; lr += chans[0][i] * chans[1][i]; }
    const corr = ll && rr ? lr / Math.sqrt(ll * rr) : 1;
    const sum = (ll + rr + 2 * lr) / 4;
    mono = { correlation: corr, foldDownLossDb: ll + rr > 0 ? 10 * Math.log10(sum / ((ll + rr) / 2) || 1e-12) : 0 };
  }
  return { rate, seconds: chans[0].length / rate, lufs, truePeakDb: db(tp), clippedSamples: clipped, mono };
}

// Streaming guidance: about -14 LUFS (Spotify, YouTube), -16 (Apple Sound Check), true peak under -1 dBTP.
export function verdict(m, { targetLufs = -14, tolerance = 1.5, ceilingDb = -1 } = {}) {
  const out = [];
  if (m.lufs === null) out.push({ level: 'fail', msg: 'silent or too quiet to measure' });
  else if (Math.abs(m.lufs - targetLufs) > tolerance) out.push({ level: 'warn', msg: `integrated ${m.lufs.toFixed(1)} LUFS is ${m.lufs > targetLufs ? 'above' : 'below'} the ${targetLufs} LUFS target; platforms will turn it ${m.lufs > targetLufs ? 'down' : 'down or leave it quiet'}` });
  if (m.truePeakDb > ceilingDb) out.push({ level: 'warn', msg: `true peak ${m.truePeakDb.toFixed(2)} dBTP is over the ${ceilingDb} dBTP ceiling; lossy encoding can clip` });
  if (m.clippedSamples > 0) out.push({ level: 'fail', msg: `${m.clippedSamples} samples at full scale` });
  if (m.mono && m.mono.correlation < 0) out.push({ level: 'warn', msg: `channel correlation ${m.mono.correlation.toFixed(2)} is negative; the mix loses level in mono` });
  return out;
}

export function run(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) return { code: 2, text: 'usage: node mastercheck.mjs track.wav [--json]' };
  let m;
  try { m = analyze(parseWav(readFileSync(file))); } catch (e) { return { code: 2, text: e.message }; }
  const v = verdict(m);
  if (argv.includes('--json')) return { code: v.some((x) => x.level === 'fail') ? 1 : 0, text: JSON.stringify({ ...m, verdict: v }, null, 2) };
  const lines = [`${file}: ${m.seconds.toFixed(1)} s at ${m.rate} Hz`,
    `integrated loudness  ${m.lufs === null ? 'n/a' : m.lufs.toFixed(1) + ' LUFS'}`,
    `true peak            ${m.truePeakDb.toFixed(2)} dBTP`,
    `clipped samples      ${m.clippedSamples}`];
  if (m.mono) lines.push(`channel correlation  ${m.mono.correlation.toFixed(2)}`, `mono fold-down       ${m.mono.foldDownLossDb.toFixed(1)} dB`);
  lines.push(v.length ? v.map((x) => `${x.level.toUpperCase()}: ${x.msg}`).join('\n') : 'OK against -14 LUFS / -1 dBTP guidance');
  return { code: v.some((x) => x.level === 'fail') ? 1 : 0, text: lines.join('\n') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run(process.argv.slice(2));
  console.log(r.text); process.exit(r.code);
}
