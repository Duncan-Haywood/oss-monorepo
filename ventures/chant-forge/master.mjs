// Mix/master check: ITU-R BS.1770-4 integrated loudness (LUFS), true peak,
// mono compatibility and clipping on a WAV file, against streaming targets.
// No dependencies, costs nothing per track. Targets are the commonly published
// ones (Spotify normalises to about -14 LUFS, -1 dBTP ceiling advised); check the
// distributor's current guide before release, they change.
export const TARGETS = { lufs: -14, lufsTolerance: 1.5, truePeakMax: -1, monoLossMax: 3, clipRunMin: 3 };

export function readWav(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      let tag = buf.readUInt16LE(body);
      const bits = buf.readUInt16LE(body + 14);
      if (tag === 0xfffe && size >= 26) tag = buf.readUInt16LE(body + 24);
      fmt = { tag, channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  const { tag, channels, bits, rate } = fmt;
  const ok = (tag === 1 && [16, 24, 32].includes(bits)) || (tag === 3 && bits === 32);
  if (!ok) throw new Error(`unsupported WAV format (tag ${tag}, ${bits} bits)`);
  if (channels < 1 || channels > 2) throw new Error(`${channels} channels: only mono and stereo are checked`);
  const bytes = bits / 8;
  const n = Math.floor(data.length / (bytes * channels));
  const ch = Array.from({ length: channels }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) {
    const o = (i * channels + c) * bytes;
    let v;
    if (tag === 3) v = data.readFloatLE(o);
    else if (bits === 16) v = data.readInt16LE(o) / 32768;
    else if (bits === 24) v = data.readIntLE(o, 3) / 8388608;
    else v = data.readInt32LE(o) / 2147483648;
    ch[c][i] = v;
  }
  return { rate, channels: ch };
}

function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function kWeight(x, fs) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = [[(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]];
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q1 + K * K;
  const hp = [[1, -2, 1], [2 * (K * K - 1) / a0, (1 - K / Q1 + K * K) / a0]];
  return biquad(biquad(x, shelf[0], shelf[1]), hp[0], hp[1]);
}

// Integrated loudness with the absolute (-70) and relative (-10 LU) gates.
export function integratedLufs(channels, fs) {
  const w = channels.map((c) => kWeight(c, fs));
  const n = w[0].length, blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  if (n < blk) return { lufs: -Infinity, blocks: 0 };
  const cum = w.map((c) => { const s = new Float64Array(n + 1); for (let i = 0; i < n; i++) s[i + 1] = s[i] + c[i] * c[i]; return s; });
  const z = [];
  for (let s = 0; s + blk <= n; s += hop) z.push(cum.reduce((t, c) => t + (c[s + blk] - c[s]) / blk, 0));
  const lk = (e) => -0.691 + 10 * Math.log10(e);
  const abs = z.filter((e) => e > 0 && lk(e) > -70);
  if (!abs.length) return { lufs: -Infinity, blocks: z.length };
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const kept = abs.filter((e) => lk(e) > rel);
  return { lufs: lk(kept.reduce((a, b) => a + b, 0) / kept.length), blocks: kept.length };
}

// True peak by 4x oversampling with a Hann-windowed sinc (accurate to a few
// hundredths of a dB on music; BS.1770 Annex 2 specifies a similar 4x FIR).
export function truePeak(x, factor = 4, half = 16) {
  const taps = [];
  for (let p = 0; p < factor; p++) {
    const t = [];
    for (let k = -half + 1; k <= half; k++) {
      const d = k - p / factor;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      t.push(sinc * (0.5 + 0.5 * Math.cos(Math.PI * d / half)));
    }
    taps.push(t);
  }
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    for (let p = 1; p < factor; p++) {
      let s = 0;
      for (let k = -half + 1, j = 0; k <= half; k++, j++) { const idx = i + k; if (idx >= 0 && idx < x.length) s += x[idx] * taps[p][j]; }
      peak = Math.max(peak, Math.abs(s));
    }
  }
  return peak;
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

export function clipRuns(x, minRun = TARGETS.clipRunMin, level = 0.9999) {
  let runs = 0, cur = 0;
  for (const v of x) { if (Math.abs(v) >= level) { cur++; if (cur === minRun) runs++; } else cur = 0; }
  return runs;
}

// Gain in dB that moves the track to the loudness target, capped so the true
// peak stays under its ceiling (null when silent). Cap means the target may
// stay out of reach: a limiter is then needed, not just a fader.
export function suggestGain(lufs, truePeakDb, targets = TARGETS) {
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeakDb)) return null;
  const want = targets.lufs - lufs, room = targets.truePeakMax - truePeakDb;
  return +Math.min(want, room).toFixed(2);
}
// What each service's loudness normalisation would do to this track. Targets
// are commonly reported figures written from memory, NOT read from the
// services' current help pages: check them before relying on them. `up` says
// whether the service also raises quiet tracks (otherwise it only turns down).
export const PLATFORMS = [
  { name: 'Spotify', lufs: -14, up: true },
  { name: 'Apple Music', lufs: -16, up: true },
  { name: 'YouTube', lufs: -14, up: false },
  { name: 'Amazon Music', lufs: -14, up: false },
  { name: 'Tidal', lufs: -14, up: false },
  { name: 'Deezer', lufs: -15, up: false },
];
export function platformPlayback(lufs, platforms = PLATFORMS) {
  if (!Number.isFinite(lufs)) return null;
  return platforms.map((p) => {
    const raw = p.lufs - lufs;
    const gainDb = +(raw > 0 && !p.up ? 0 : raw).toFixed(1);
    return { name: p.name, target: p.lufs, gainDb };
  });
}
export function analyze({ rate, channels }, targets = TARGETS) {
  const { lufs } = integratedLufs(channels, rate);
  const tp = Math.max(...channels.map((c) => truePeak(c)));
  const n = channels[0].length;
  let mono = null, corr = null;
  if (channels.length === 2) {
    let ss = 0, sm = 0, lr = 0, ll = 0, rr = 0;
    for (let i = 0; i < n; i++) {
      const l = channels[0][i], r = channels[1][i];
      ss += (l * l + r * r) / 2; sm += ((l + r) / 2) ** 2; lr += l * r; ll += l * l; rr += r * r;
    }
    mono = ss > 0 ? 10 * Math.log10(Math.max(sm, 1e-20) / ss) : 0;
    corr = ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : null;
  }
  const clips = channels.reduce((t, c) => t + clipRuns(c, targets.clipRunMin), 0);
  const r = {
    seconds: n / rate, rate, channels: channels.length,
    lufs, truePeakDb: db(tp), monoLossDb: mono, correlation: corr, clipRuns: clips,
  };
  r.platforms = platformPlayback(lufs);
  r.suggestedGainDb = suggestGain(lufs, r.truePeakDb, targets);
  const checks = [];
  checks.push({ name: 'loudness', ok: Number.isFinite(lufs) && Math.abs(lufs - targets.lufs) <= targets.lufsTolerance,
    note: `${lufs.toFixed(1)} LUFS integrated; aim ${targets.lufs} +/- ${targets.lufsTolerance}${r.suggestedGainDb !== null && Math.abs(r.suggestedGainDb) >= 0.1 ? `; suggested gain ${r.suggestedGainDb > 0 ? '+' : ''}${r.suggestedGainDb} dB` : ''}` });
  checks.push({ name: 'true peak', ok: r.truePeakDb <= targets.truePeakMax, note: `${r.truePeakDb.toFixed(2)} dBTP; ceiling ${targets.truePeakMax}` });
  if (mono !== null) checks.push({ name: 'mono compatibility', ok: -mono <= targets.monoLossMax, note: `${mono.toFixed(1)} dB summed to mono vs stereo power; correlation ${corr === null ? 'n/a' : corr.toFixed(2)}` });
  checks.push({ name: 'clipping', ok: clips === 0, note: `${clips} run(s) of ${targets.clipRunMin}+ samples at full scale` });
  return { ...r, checks, pass: checks.every((c) => c.ok) };
}
