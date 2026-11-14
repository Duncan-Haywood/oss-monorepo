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

// BS.1770 K-weighting: a high shelf, then a high-pass, as [b, a] coefficient pairs.
function kCoeffs(fs) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = [[(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]];
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q1 + K * K;
  const hp = [[1, -2, 1], [2 * (K * K - 1) / a0, (1 - K / Q1 + K * K) / a0]];
  return { shelf, hp };
}

export function kWeight(x, fs) {
  const { shelf, hp } = kCoeffs(fs);
  return biquad(biquad(x, shelf[0], shelf[1]), hp[0], hp[1]);
}

// Running sum of squares of kWeight(x, fs): s[i + 1] = s[i] + w[i] * w[i]. Both
// filters run in one loop with no intermediate arrays; every product and sum is
// the one kWeight and the separate loop computed, in the same order, so s is
// the same doubles (master.test.mjs pins it).
export function kWeightedEnergy(x, fs) {
  const { shelf: [[b0, b1, b2], [a1, a2]], hp: [[c0, c1, c2], [d1, d2]] } = kCoeffs(fs);
  const n = x.length, s = new Float64Array(n + 1);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const v = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    // the high-pass's input history is the shelf's output history (y1, y2)
    const w = c0 * v + c1 * y1 + c2 * y2 - d1 * z1 - d2 * z2;
    x2 = x1; x1 = xi; y2 = y1; y1 = v; z2 = z1; z1 = w;
    acc += w * w; s[i + 1] = acc;
  }
  return s;
}

// Integrated loudness with the absolute (-70) and relative (-10 LU) gates.
export function integratedLufs(channels, fs) {
  const n = channels[0].length, blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  if (n < blk) return { lufs: -Infinity, blocks: 0 };
  const cum = channels.map((c) => kWeightedEnergy(c, fs));
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
// `floor` (default 0) starts the peak there, so truePeak(b, 4, 16, truePeak(a)) is
// Math.max(truePeak(a), truePeak(b)) exactly, and windows of b that cannot beat a are skipped.
export function truePeak(x, factor = 4, half = 16, floor = 0) {
  const width = 2 * half, taps = [];
  for (let p = 0; p < factor; p++) {
    const t = new Float64Array(width);
    for (let k = -half + 1, j = 0; k <= half; k++, j++) {
      const d = k - p / factor;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      t[j] = sinc * (0.5 + 0.5 * Math.cos(Math.PI * d / half));
    }
    taps.push(t);
  }
  // The answer is the larger of the sample peak and every interpolated value, so
  // start from the sample peak. An interpolated value is at most sum|taps| times the
  // largest |sample| in its window; a window whose bound is below the peak so far
  // cannot raise it and is skipped. The margin covers rounding in the sum, and NaN
  // fails every comparison, so it still reaches the result.
  const n = x.length, first = half - 1, last = n - half;
  let peak = floor;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  let gain = 0;
  for (let p = 1; p < factor; p++) { let a = 0; for (let j = 0; j < width; j++) a += Math.abs(taps[p][j]); gain = Math.max(gain, a); }
  gain *= 1 + 1e-9;
  const blocks = Math.ceil(n / width), bmax = new Float64Array(blocks + 1);
  for (let b = 0; b < blocks; b++) {
    let m = 0;
    for (let i = b * width, e = Math.min(n, i + width); i < e; i++) m = Math.max(m, Math.abs(x[i]));
    bmax[b] = m;
  }
  for (let i = 0; i < n; i++) {
    if (i >= first && i < last) {
      const base = i - half + 1, b = (base / width) | 0; // the window spans blocks b and b+1
      if (gain * Math.max(bmax[b], bmax[b + 1]) < peak) continue;
      // inside x: the same products in the same order as the checked loop below
      for (let p = 1; p < factor; p++) {
        const t = taps[p];
        let s = 0;
        for (let j = 0; j < width; j++) s += x[base + j] * t[j];
        peak = Math.max(peak, Math.abs(s));
      }
    } else {
      for (let p = 1; p < factor; p++) {
        let s = 0;
        for (let k = -half + 1, j = 0; k <= half; k++, j++) { const idx = i + k; if (idx >= 0 && idx < n) s += x[idx] * taps[p][j]; }
        peak = Math.max(peak, Math.abs(s));
      }
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
// What each service's loudness normalisation would do to this track.
// Read 2026-11-14 (eval/playback-targets-2026-11-14.md). Only Spotify's own page
// ("Loudness normalization", support.spotify.com) gives figures: tracks go to
// -14 LUFS (ITU 1770), quiet ones are lifted only while 1 dB of true-peak
// headroom remains ("-20 dB LUFS ... True Peak maximum is -5 dB FS, we only lift
// the track up to -16 dB LUFS"). Apple's mastering guide (Apple Digital Masters
// PDF), YouTube's "Stable volume" help and Deezer's "Volume Normalization" help
// describe the feature with no level; Amazon's help page and Tidal's support site
// answered 403. Their figures below are the commonly reported ones, marked
// `published: false`. `up` says whether the service also raises quiet tracks;
// `headroomDb` caps that lift so the true peak stays that far under 0 dBTP.
export const PLATFORMS = [
  { name: 'Spotify', lufs: -14, up: true, headroomDb: 1, published: true },
  { name: 'Apple Music', lufs: -16, up: true, published: false },
  { name: 'YouTube', lufs: -14, up: false, published: false },
  { name: 'Amazon Music', lufs: -14, up: false, published: false },
  { name: 'Tidal', lufs: -14, up: false, published: false },
  { name: 'Deezer', lufs: -15, up: false, published: false },
];
// Spotify's mastering tips, same page: "If your master is louder than -14dB
// integrated LUFS, keep True Peak below -2dB".
export const SPOTIFY_LOUD_TRUE_PEAK_MAX = -2;
export function platformPlayback(lufs, platforms = PLATFORMS, truePeakDb = null) {
  if (!Number.isFinite(lufs)) return null;
  return platforms.map((p) => {
    let raw = p.lufs - lufs;
    if (raw > 0 && !p.up) raw = 0;
    let capped = false;
    if (raw > 0 && p.headroomDb !== undefined && Number.isFinite(truePeakDb) && truePeakDb + raw > -p.headroomDb) {
      raw = Math.max(0, -p.headroomDb - truePeakDb); capped = true;
    }
    return { name: p.name, target: p.lufs, gainDb: +raw.toFixed(1), published: p.published, capped };
  });
}
export function analyze({ rate, channels }, targets = TARGETS) {
  const { lufs } = integratedLufs(channels, rate);
  const tp = channels.length ? channels.reduce((m, c) => truePeak(c, 4, 16, m), 0) : -Infinity;
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
    // loudest 400 ms and 3 s windows (EBU Tech 3341 momentary and short-term max)
    maxMomentaryLufs: maxWindowLoudness(channels, rate, 0.4), maxShortTermLufs: maxWindowLoudness(channels, rate, 3),
    // EBU Tech 3342 loudness range: how far the short-term level moves (LU); reported, not checked
    loudnessRange: loudnessRange(channels, rate).lra,
  };
  r.platforms = platformPlayback(lufs, PLATFORMS, r.truePeakDb);
  r.suggestedGainDb = suggestGain(lufs, r.truePeakDb, targets);
  const checks = [];
  checks.push({ name: 'loudness', ok: Number.isFinite(lufs) && Math.abs(lufs - targets.lufs) <= targets.lufsTolerance,
    note: `${lufs.toFixed(1)} LUFS integrated; aim ${targets.lufs} +/- ${targets.lufsTolerance}${r.suggestedGainDb !== null && Math.abs(r.suggestedGainDb) >= 0.1 ? `; suggested gain ${r.suggestedGainDb > 0 ? '+' : ''}${r.suggestedGainDb} dB` : ''}` });
  // a master louder than the target gets Spotify's tighter ceiling (rounded to the 0.1 LU the report prints)
  const loud = Number.isFinite(lufs) && +lufs.toFixed(1) > targets.lufs;
  const ceiling = loud ? Math.min(targets.truePeakMax, SPOTIFY_LOUD_TRUE_PEAK_MAX) : targets.truePeakMax;
  checks.push({ name: 'true peak', ok: r.truePeakDb <= ceiling, note: `${r.truePeakDb.toFixed(2)} dBTP; ceiling ${ceiling}${loud && ceiling < targets.truePeakMax ? ` (louder than ${targets.lufs} LUFS: Spotify asks for under ${SPOTIFY_LOUD_TRUE_PEAK_MAX} dBTP)` : ''}` });
  if (mono !== null) checks.push({ name: 'mono compatibility', ok: -mono <= targets.monoLossMax, note: `${mono.toFixed(1)} dB summed to mono vs stereo power; correlation ${corr === null ? 'n/a' : corr.toFixed(2)}` });
  checks.push({ name: 'clipping', ok: clips === 0, note: `${clips} run(s) of ${targets.clipRunMin}+ samples at full scale` });
  return { ...r, checks, pass: checks.every((c) => c.ok) };
}

// ITU-R BS.1770-5 Annex 2: "one set of filter coefficients (for the order 48,
// 4-phase, FIR interpolating)", copied from the 2023 text (pp. 18-19). Each row is
// one phase's 12 taps; phase p's output for input index n is
// sum_j ANNEX2_PHASES[p][j] * x[n - j].
export const ANNEX2_PHASES = [
  [0.0017089843750, 0.0109863281250, -0.0196533203125, 0.0332031250000, -0.0594482421875, 0.1373291015625, 0.9721679687500, -0.1022949218750, 0.0476074218750, -0.0266113281250, 0.0148925781250, -0.0083007812500],
  [-0.0291748046875, 0.0292968750000, -0.0517578125000, 0.0891113281250, -0.1665039062500, 0.4650878906250, 0.7797851562500, -0.2003173828125, 0.1015625000000, -0.0582275390625, 0.0330810546875, -0.0189208984375],
  [-0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625000000, -0.2003173828125, 0.7797851562500, 0.4650878906250, -0.1665039062500, 0.0891113281250, -0.0517578125000, 0.0292968750000, -0.0291748046875],
  [-0.0083007812500, 0.0148925781250, -0.0266113281250, 0.0476074218750, -0.1022949218750, 0.9721679687500, 0.1373291015625, -0.0594482421875, 0.0332031250000, -0.0196533203125, 0.0109863281250, 0.0017089843750],
];

// True peak exactly as Annex 2 describes it: the 4-phase FIR above, absolute
// value, maximum (in floating point, so the 12.04 dB attenuate-and-restore step
// is a no-op). Only the filter outputs count, not the raw samples: phase 0 is a
// filter too (its taps sum to 1.0016, phases 1 and 2 to 0.9730), so this can read a little under or over
// the sample peak. Inputs before the start count as silence; the last 11 outputs
// past the end are read as well, so a peak in the final samples is not missed.
export function truePeakAnnex2(x) {
  const n = x.length, taps = ANNEX2_PHASES, L = taps[0].length;
  let peak = 0;
  for (let i = 0; i < n + L - 1; i++) {
    for (let p = 0; p < 4; p++) {
      const h = taps[p];
      let s = 0;
      for (let j = 0; j < L; j++) { const k = i - j; if (k >= 0 && k < n) s += h[j] * x[k]; }
      const a = Math.abs(s);
      if (a > peak || Number.isNaN(a)) peak = a;
    }
  }
  return peak;
}

// The loudest window of `seconds` (0.4 = momentary, 3 = short-term; EBU Tech 3341
// 2.3) over every window start, one sample apart, not on a 100 ms grid: a file
// meter knows the whole signal, and Tech 3341 cases 10 and 13 put a 3 s or 400 ms
// tone at offsets of 150 ms and 20 ms that a 100 ms grid would straddle (up to
// -0.58 dB on case 13). Ungated, channels summed with weight 1 (stereo).
// Returns -Infinity for silence or a signal shorter than the window.
export function maxWindowLoudness(channels, fs, seconds) {
  const n = channels[0].length, w = Math.round(seconds * fs);
  if (n < w || w < 1) return -Infinity;
  const cum = channels.map((c) => kWeightedEnergy(c, fs));
  let best = 0;
  for (let s = 0; s + w <= n; s++) {
    let e = 0;
    for (const c of cum) e += c[s + w] - c[s];
    if (e > best) best = e;
  }
  return best > 0 ? -0.691 + 10 * Math.log10(best / w) : -Infinity;
}

// Window loudness at every `hop` samples from `from` seconds on, for checking that
// a signal reads constant (Tech 3341 cases 9 and 12). Returns { min, max } in LUFS.
export function windowLoudnessRange(channels, fs, seconds, from = 0, hop = 1) {
  const n = channels[0].length, w = Math.round(seconds * fs);
  const cum = channels.map((c) => kWeightedEnergy(c, fs));
  let lo = Infinity, hi = -Infinity;
  for (let end = Math.max(w, Math.round(from * fs)); end <= n; end += hop) {
    let e = 0;
    for (const c of cum) e += c[end] - c[end - w];
    const l = -0.691 + 10 * Math.log10(e / w);
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  return { min: lo, max: hi };
}

// Loudness range (LRA, EBU Tech 3342, November 2023, read from
// tech.ebu.ch/docs/tech/tech3342.pdf on 2026-11-14). Input: ungated short-term
// (3 s) loudness every `hopSeconds` (the text asks for at least 10 Hz, i.e. 2.9 s
// of overlap; 0.1 s here, as in libebur128 and ffmpeg). Gates: -70 LUFS absolute,
// then -20 LU under the power mean of what passed (not BS.1770's -10). LRA is the
// 95th minus the 10th percentile, taken as the 3342 MATLAB listing does:
// sorted(round((n - 1) * p / 100 + 1)), 1-based. Windows run from 0 to the last
// full 3 s window; `tailSeconds` pads silence after the end first (the listing's
// "followed by at least 1.5 s of silence" note is for a live meter's latency; 0 by
// default, eval/ebu-tech3342-2026-11-14.md shows both). Returns
// { lra, low, high, windows, kept, levels }: levels is the gated short-term loudness,
// sorted; lra is null when nothing passes the -70 gate.
// `relativeGateLu` exists to show the gate matters: with BS.1770's -10 LU, Tech 3342
// case 3 drops its -40 dBFS tone (eval/ebu-tech3342.mjs).
export function loudnessRange(channels, fs, { hopSeconds = 0.1, tailSeconds = 0, relativeGateLu = -20 } = {}) {
  const pad = Math.round(tailSeconds * fs);
  const src = pad > 0 ? channels.map((c) => { const y = new Float64Array(c.length + pad); y.set(c); return y; }) : channels;
  const n = src[0].length, w = Math.round(3 * fs), hop = Math.max(1, Math.round(hopSeconds * fs));
  const st = [];
  if (n >= w) {
    const cum = src.map((c) => kWeightedEnergy(c, fs));
    for (let s = 0; s + w <= n; s += hop) {
      let e = 0;
      for (const c of cum) e += c[s + w] - c[s];
      st.push(e > 0 ? -0.691 + 10 * Math.log10(e / w) : -Infinity);
    }
  }
  const abs = st.filter((l) => l >= -70);
  if (!abs.length) return { lra: null, low: null, high: null, windows: st.length, kept: 0, levels: [] };
  const mean = 10 * Math.log10(abs.reduce((t, l) => t + 10 ** (l / 10), 0) / abs.length);
  const kept = abs.filter((l) => l >= mean + relativeGateLu).sort((a, b) => a - b);
  const pick = (p) => kept[Math.round((kept.length - 1) * p / 100 + 1) - 1];
  const low = pick(10), high = pick(95);
  return { lra: high - low, low, high, windows: st.length, kept: kept.length, levels: kept };
}
