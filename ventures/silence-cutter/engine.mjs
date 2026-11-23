// Silence Cutter engine: finds the pauses in a recording and turns the parts
// worth keeping into an edit. Pure functions over Float32Array samples, so the
// same code runs in the browser page and the Node CLI with no dependencies.
//
// Pipeline (README "How it decides what is silence"):
//   1. band-limit the mono mix to the voice band (high-pass 90 Hz, low-pass
//      4 kHz) so mains hum, HVAC rumble and hiss count for less;
//   2. measure the level of every 10 ms frame in dBFS;
//   3. estimate the room's noise floor and the voice level from the
//      distribution of frame levels (10th and 95th percentiles), and set the
//      threshold between them, never closer than 6 dB to the floor;
//   4. mark speech with hysteresis (enter above the threshold, leave 4 dB
//      below it), drop blips shorter than `minSpeech` (clicks, a bumped desk);
//   5. every gap of at least `minSilence` becomes a cut, shrunk by `padBefore`
//      before the next word and `padAfter` after the last one, so breaths and
//      soft word endings stay.

export const FRAME_MS = 10;

export const DEFAULTS = Object.freeze({
  threshold: 'auto', // or a number in dBFS, e.g. -40
  minSilence: 0.5, // seconds: shorter pauses are left alone
  padBefore: 0.12, // seconds kept before speech resumes
  padAfter: 0.18, // seconds kept after speech stops
  minSpeech: 0.06, // seconds: louder bursts shorter than this are not speech
  lowOver: 4, // dB over the floor that a word's soft edges must stay above (null = off)
  extendMax: 0.3, // seconds an edge may grow by that rule
  keepPause: 0, // seconds of the pause to leave in place of each cut (0 = cut it all)
  bandLimit: true,
});

// ---------------------------------------------------------------- filtering

// RBJ cookbook biquad, applied in place on a copy. Q = 1/sqrt(2) (Butterworth).
function biquad(x, sampleRate, type, freq) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  let b0, b1, b2;
  if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
  else { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = B0 * xi + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    y[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

export function voiceBand(samples, sampleRate) {
  let y = biquad(samples, sampleRate, 'highpass', 90);
  y = biquad(y, sampleRate, 'highpass', 90); // 4th order: hum at 50/60 Hz drops ~20 dB
  if (sampleRate > 9000) y = biquad(y, sampleRate, 'lowpass', 4000);
  return y;
}

// Mixes channel arrays (Float32Array each) to one mono Float32Array.
export function mixToMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}

// ---------------------------------------------------------------- levels

// RMS level of each 10 ms frame in dBFS (full-scale sine = -3 dBFS); silence
// floors at -100.
export function frameLevels(samples, sampleRate, frameMs = FRAME_MS) {
  const hop = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const n = Math.ceil(samples.length / hop);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const a = f * hop, b = Math.min(samples.length, a + hop);
    for (let i = a; i < b; i++) s += samples[i] * samples[i];
    const rms = Math.sqrt(s / Math.max(1, b - a));
    out[f] = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
  }
  return out;
}

function percentile(values, p) {
  const a = Array.from(values).sort((x, y) => x - y);
  if (!a.length) return -100;
  const i = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[i];
}

// Noise floor, voice level and the threshold the detector will use.
export function estimateLevels(levels, fraction = 0.35, minOver = 6) {
  const floor = percentile(levels, 10);
  const voice = percentile(levels, 95);
  const spread = voice - floor;
  // 35% of the way from floor to voice, but at least 6 dB over the floor.
  // A recording with almost no pauses has floor near voice; then the spread
  // is small and the 6 dB minimum keeps quiet words from being cut.
  const threshold = floor + Math.max(minOver, fraction * spread);
  return { floor, voice, spread, threshold };
}

// ---------------------------------------------------------------- detection

// Returns speech regions [{start, end}] in seconds from frame levels.
export function speechRegions(levels, threshold, opts = {}) {
  const { minSpeech = DEFAULTS.minSpeech, frameMs = FRAME_MS, hysteresis = 4 } = opts;
  const fs = frameMs / 1000;
  const regions = [];
  let on = false, start = 0;
  for (let f = 0; f < levels.length; f++) {
    const v = levels[f];
    if (!on && v >= threshold) { on = true; start = f; }
    else if (on && v < threshold - hysteresis) { on = false; regions.push([start, f]); }
  }
  if (on) regions.push([start, levels.length]);
  // Bridge gaps under 60 ms first (a plosive's closure), then drop blips.
  const bridged = [];
  for (const r of regions) {
    const last = bridged[bridged.length - 1];
    if (last && (r[0] - last[1]) * fs < 0.06) last[1] = r[1];
    else bridged.push([...r]);
  }
  const kept = bridged.filter(([a, b]) => (b - a) * fs >= minSpeech);
  // Rabiner-Sambur style second pass: walk each edge outward while a 30 ms
  // moving average stays above a lower threshold, so a soft onset (/s/, /f/,
  // /h/) or a trailing-off word that never reached the main threshold stays
  // with its word. Capped at `extendMax` seconds per edge.
  const { low = null, extendMax = 0.3 } = opts;
  if (low != null) {
    const avg = (f) => { let s = 0, n = 0; for (let k = f - 1; k <= f + 1; k++) if (k >= 0 && k < levels.length) { s += Math.pow(10, levels[k] / 10); n++; } return 10 * Math.log10(s / n); };
    const cap = Math.round(extendMax / fs);
    for (let i = 0; i < kept.length; i++) {
      const prevEnd = i ? kept[i - 1][1] : 0, nextStart = i + 1 < kept.length ? kept[i + 1][0] : levels.length;
      let a = kept[i][0], b = kept[i][1];
      for (let n = 0; n < cap && a - 1 > prevEnd && avg(a - 1) >= low; n++) a--;
      for (let n = 0; n < cap && b < nextStart && avg(b) >= low; n++) b++;
      kept[i] = [a, b];
    }
  }
  return kept.map(([a, b]) => ({ start: a * fs, end: b * fs }));
}

// Turns speech regions into keep/cut segments over [0, duration].
export function planCuts(speech, duration, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cuts = [];
  const pushCut = (a, b) => {
    // Leave `keepPause` of the pause in place, split around the middle.
    const keep = Math.min(o.keepPause, b - a);
    const mid = (a + b) / 2;
    const ca = keep > 0 ? Math.max(a, mid - (b - a - keep) / 2) : a;
    const cb = keep > 0 ? Math.min(b, mid + (b - a - keep) / 2) : b;
    if (keep > 0) { const s = a + keep / 2, e = b - keep / 2; if (e - s > 0.01) cuts.push({ start: s, end: e }); return; }
    if (cb - ca > 0.01) cuts.push({ start: ca, end: cb });
  };
  if (!speech.length) return { cuts: duration > 0 ? [{ start: 0, end: duration }] : [], keeps: [] };
  // Leading silence
  const lead = speech[0].start - o.padBefore;
  if (speech[0].start >= o.minSilence && lead > 0.01) cuts.push({ start: 0, end: lead });
  for (let i = 1; i < speech.length; i++) {
    const gapA = speech[i - 1].end, gapB = speech[i].start;
    if (gapB - gapA < o.minSilence) continue;
    const a = gapA + o.padAfter, b = gapB - o.padBefore;
    if (b > a) pushCut(a, b);
  }
  const last = speech[speech.length - 1].end;
  if (duration - last >= o.minSilence) {
    const a = last + o.padAfter;
    if (duration - a > 0.01) cuts.push({ start: a, end: duration });
  }
  return { cuts, keeps: invert(cuts, duration) };
}

export function invert(cuts, duration) {
  const keeps = [];
  let t = 0;
  for (const c of cuts) {
    if (c.start > t + 1e-9) keeps.push({ start: t, end: c.start });
    t = Math.max(t, c.end);
  }
  if (duration > t + 1e-9) keeps.push({ start: t, end: duration });
  return keeps;
}

// One call from samples to an edit plan.
export function analyse(samples, sampleRate, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const duration = o.duration ?? samples.length / sampleRate;
  // `o.levels` lets a caller (the page, re-planning on every slider move)
  // reuse the frame levels instead of filtering the whole file again.
  const levels = o.levels ?? frameLevels(o.bandLimit ? voiceBand(samples, sampleRate) : samples, sampleRate);
  const est = estimateLevels(levels, o.fraction ?? 0.35, o.minOver ?? 6);
  const threshold = o.threshold === 'auto' || o.threshold == null ? est.threshold : Number(o.threshold);
  const lowOver = o.lowOver;
  const low = lowOver == null ? null : Math.min(threshold, est.floor + Math.max(lowOver, 0.1 * (est.voice - est.floor)));
  const speech = speechRegions(levels, threshold, { minSpeech: o.minSpeech, hysteresis: o.hysteresis ?? 4, low, extendMax: o.extendMax });
  const { cuts, keeps } = planCuts(speech, duration, o);
  const kept = keeps.reduce((s, k) => s + k.end - k.start, 0);
  return { duration, sampleRate, levels, floor: est.floor, voice: est.voice, threshold, speech, cuts, keeps, kept, removed: duration - kept, options: o };
}

// ---------------------------------------------------------------- timing

export const FRAME_RATES = {
  '23.976': [24000, 1001], '24': [24, 1], '25': [25, 1], '29.97': [30000, 1001],
  '30': [30, 1], '50': [50, 1], '59.94': [60000, 1001], '60': [60, 1],
};

export function fpsOf(key) {
  const r = FRAME_RATES[String(key)];
  if (!r) throw new Error(`unsupported frame rate ${key}; use one of ${Object.keys(FRAME_RATES).join(', ')}`);
  return { num: r[0], den: r[1], fps: r[0] / r[1], timebase: Math.round(r[0] / r[1]), ntsc: r[1] === 1001 };
}

// Snaps keep segments to whole frames, drops any that round to nothing, and
// merges ones that touch.
export function snapToFrames(keeps, rate) {
  const { fps } = typeof rate === 'object' ? rate : fpsOf(rate);
  const out = [];
  for (const k of keeps) {
    const a = Math.round(k.start * fps), b = Math.round(k.end * fps);
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last.out) last.out = Math.max(last.out, b);
    else out.push({ in: a, out: b });
  }
  return out; // frame numbers, source timeline
}

// Non-drop-frame timecode for a frame count at the nominal timebase. NTSC
// rates use the integer timebase (30 for 29.97) without drop-frame, which is
// what "FCM: NON-DROP FRAME" declares.
export function timecode(frames, timebase) {
  const f = frames % timebase;
  const s = Math.floor(frames / timebase);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
}

// Maps a source time to the cut timeline; null if it falls inside a cut.
export function mapTime(t, keeps) {
  let acc = 0;
  for (const k of keeps) {
    if (t < k.start) return null;
    if (t <= k.end) return acc + (t - k.start);
    acc += k.end - k.start;
  }
  return null;
}

// ---------------------------------------------------------------- exports

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// CMX3600 EDL: one event per kept segment, source in/out from the original
// file, record in/out on the new timeline. DaVinci Resolve, Premiere Pro and
// Avid import it against the clip named in FROM CLIP NAME.
export function toEDL(keeps, { fps = '30', clipName = 'source.mp4', title = 'Silence Cutter' } = {}) {
  const rate = fpsOf(fps);
  const frames = snapToFrames(keeps, rate);
  const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
  let rec = 0;
  frames.forEach((k, i) => {
    const len = k.out - k.in;
    const ev = String(i + 1).padStart(3, '0');
    lines.push(`${ev}  AX       AA/V  C        ${timecode(k.in, rate.timebase)} ${timecode(k.out, rate.timebase)} ${timecode(rec, rate.timebase)} ${timecode(rec + len, rate.timebase)}`);
    lines.push(`* FROM CLIP NAME: ${clipName}`);
    lines.push('');
    rec += len;
  });
  return lines.join('\n');
}

// Final Cut Pro X / DaVinci Resolve FCPXML 1.9: one asset, a spine of
// asset-clips. Times are rational seconds on the frame grid.
export function toFCPXML(keeps, { fps = '30', clipName = 'source.mp4', duration = 0, width = 1920, height = 1080, hasVideo = true, title = 'Silence Cutter' } = {}) {
  const rate = fpsOf(fps);
  const frames = snapToFrames(keeps, rate);
  const t = (n) => (rate.den === 1 ? `${n}/${rate.num}s` : `${n * rate.den}/${rate.num}s`);
  const totalSrc = Math.ceil(duration * rate.fps);
  const seqLen = frames.reduce((s, k) => s + k.out - k.in, 0);
  const fmt = hasVideo
    ? `<format id="r1" name="FFVideoFormat${height}p${rate.timebase}" frameDuration="${t(1)}" width="${width}" height="${height}"/>`
    : `<format id="r1" frameDuration="${t(1)}"/>`;
  let off = 0;
  const clips = frames.map((k) => {
    const len = k.out - k.in;
    const c = `        <asset-clip ref="r2" name="${xmlEsc(clipName)}" offset="${t(off)}" start="${t(k.in)}" duration="${t(len)}" format="r1" tcFormat="NDF"/>`;
    off += len;
    return c;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    ${fmt}
    <asset id="r2" name="${xmlEsc(clipName)}" start="0s" duration="${t(totalSrc)}" hasVideo="${hasVideo ? 1 : 0}" hasAudio="1" format="r1">
      <media-rep kind="original-media" src="file:./${encodeURI(clipName)}"/>
    </asset>
  </resources>
  <library>
    <event name="${xmlEsc(title)}">
      <project name="${xmlEsc(title)}">
        <sequence format="r1" duration="${t(seqLen)}" tcStart="0s" tcFormat="NDF">
          <spine>
${clips.join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

// Final Cut Pro 7 XML (xmeml v4), the format Premiere Pro imports as a
// sequence. One video and one audio track of clipitems on the frame grid.
export function toPremiereXML(keeps, { fps = '30', clipName = 'source.mp4', duration = 0, width = 1920, height = 1080, hasVideo = true, title = 'Silence Cutter' } = {}) {
  const rate = fpsOf(fps);
  const frames = snapToFrames(keeps, rate);
  const rateXml = `<rate><timebase>${rate.timebase}</timebase><ntsc>${rate.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
  const totalSrc = Math.ceil(duration * rate.fps);
  const seqLen = frames.reduce((s, k) => s + k.out - k.in, 0);
  const file = (first) => first
    ? `<file id="file-1"><name>${xmlEsc(clipName)}</name><pathurl>${xmlEsc(encodeURI(clipName))}</pathurl>${rateXml}<duration>${totalSrc}</duration><media>${hasVideo ? `<video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video>` : ''}<audio><channelcount>2</channelcount></audio></media></file>`
    : '<file id="file-1"/>';
  const items = (kind) => {
    let rec = 0;
    return frames.map((k, i) => {
      const len = k.out - k.in;
      const s = `<clipitem id="${kind}-${i + 1}"><name>${xmlEsc(clipName)}</name><duration>${totalSrc}</duration>${rateXml}<start>${rec}</start><end>${rec + len}</end><in>${k.in}</in><out>${k.out}</out>${file(kind === (hasVideo ? 'v' : 'a') && i === 0)}${kind === 'a' ? '<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>' : ''}</clipitem>`;
      rec += len;
      return s;
    }).join('\n');
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1">
<name>${xmlEsc(title)}</name>
<duration>${seqLen}</duration>
${rateXml}
<media>
${hasVideo ? `<video><track>\n${items('v')}\n</track></video>` : ''}
<audio><track>
${items('a')}
</track></audio>
</media>
</sequence>
</xmeml>
`;
}

// An ffmpeg command that renders the cut file directly (re-encodes).
export function toFfmpeg(keeps, { input = 'input.mp4', output = 'output.mp4', hasVideo = true } = {}) {
  const expr = keeps.map((k) => `between(t,${k.start.toFixed(3)},${k.end.toFixed(3)})`).join('+');
  const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;
  const v = hasVideo ? ` -vf "select='${expr}',setpts=N/FRAME_RATE/TB"` : ' -vn';
  return `ffmpeg -i ${q(input)}${v} -af "aselect='${expr}',asetpts=N/SR/TB" ${q(output)}`;
}

export function toCSV(analysis) {
  const rows = [['kind', 'start_s', 'end_s', 'length_s', 'new_start_s']];
  const segs = [...analysis.keeps.map((k) => ({ ...k, kind: 'keep' })), ...analysis.cuts.map((c) => ({ ...c, kind: 'cut' }))].sort((a, b) => a.start - b.start);
  for (const s of segs) {
    const ns = s.kind === 'keep' ? mapTime(s.start, analysis.keeps) : '';
    rows.push([s.kind, s.start.toFixed(3), s.end.toFixed(3), (s.end - s.start).toFixed(3), ns === '' || ns == null ? '' : ns.toFixed(3)]);
  }
  return rows.map((r) => r.join(',')).join('\n') + '\n';
}

// ---------------------------------------------------------------- subtitles

function parseTs(s) {
  const m = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(s);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
}
function fmtTs(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

// Moves an SRT's cues onto the cut timeline. A cue's start or end that falls
// in a cut moves to the edge of the nearest kept part; a cue wholly inside a
// cut is dropped. Returns { srt, kept, dropped }.
export function retimeSRT(text, keeps) {
  const blocks = String(text).replace(/\r/g, '').replace(/^\uFEFF/, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  let dropped = 0;
  const clampMap = (t, dir) => {
    const m = mapTime(t, keeps);
    if (m != null) return m;
    // inside a cut: snap forward (start) or back (end) to the nearest kept edge
    let acc = 0;
    for (const k of keeps) {
      if (t < k.start) return dir === 'start' ? acc : acc;
      acc += k.end - k.start;
    }
    return acc;
  };
  for (const b of blocks) {
    const lines = b.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->');
    const s = parseTs(a), e = parseTs(z);
    if (s == null || e == null) continue;
    const ns = clampMap(s, 'start'), ne = clampMap(e, 'end');
    if (ne - ns < 0.05) { dropped++; continue; }
    out.push(`${out.length + 1}\n${fmtTs(ns)} --> ${fmtTs(ne)}\n${lines.slice(ti + 1).join('\n')}`);
  }
  return { srt: out.join('\n\n') + (out.length ? '\n' : ''), kept: out.length, dropped };
}

// ---------------------------------------------------------------- rendering

// Concatenates the kept parts of each channel with a short equal-gain
// crossfade at every join so cuts do not click.
export function renderKeeps(channels, sampleRate, keeps, fadeMs = 8) {
  const fade = Math.max(1, Math.round((sampleRate * fadeMs) / 1000));
  const spans = keeps.map((k) => [Math.round(k.start * sampleRate), Math.round(k.end * sampleRate)]).filter(([a, b]) => b > a);
  const total = spans.reduce((s, [a, b]) => s + (b - a), 0);
  return channels.map((ch) => {
    const out = new Float32Array(total);
    let w = 0;
    spans.forEach(([a, b], si) => {
      const len = b - a;
      for (let i = 0; i < len; i++) {
        let g = 1;
        if (si > 0 && i < fade) g = i / fade;
        if (si < spans.length - 1 && len - i <= fade) g = Math.min(g, (len - i) / fade);
        out[w + i] = ch[a + i] * g;
      }
      w += len;
    });
    return out;
  });
}

// 16-bit PCM WAV bytes from channel arrays.
export function encodeWav(channels, sampleRate) {
  const n = channels[0]?.length ?? 0, c = channels.length;
  const buf = new ArrayBuffer(44 + n * c * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * c * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, c, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * c * 2, true);
  v.setUint16(32, c * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * c * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) {
    const s = Math.max(-1, Math.min(1, channels[k][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Uint8Array(buf);
}

// Reads PCM (8/16/24/32-bit int) or 32-bit float WAV bytes.
export function decodeWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file (no RIFF/WAVE header)');
  let o = 12, fmt = null, data = null;
  while (o + 8 <= u8.length) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
      // WAVE_FORMAT_EXTENSIBLE: the real format code opens the SubFormat GUID.
      if (fmt.format === 0xfffe && size >= 40) fmt.format = v.getUint16(o + 32, true);
    }
    if (id === 'data') { data = [o + 8, Math.min(size, u8.length - o - 8)]; break; }
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV file has no fmt or data chunk');
  const { format, channels: c, sampleRate, bits } = fmt;
  if (format !== 1 && format !== 3) throw new Error(`unsupported WAV encoding ${format} (only PCM and 32-bit float)`);
  const bps = bits / 8, frames = Math.floor(data[1] / (bps * c));
  const out = Array.from({ length: c }, () => new Float32Array(frames));
  const isFloat = format === 3;
  for (let i = 0; i < frames; i++) for (let k = 0; k < c; k++) {
    const p = data[0] + (i * c + k) * bps;
    let s;
    if (isFloat) s = v.getFloat32(p, true);
    else if (bits === 16) s = v.getInt16(p, true) / 32768;
    else if (bits === 24) { let x = u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16); if (x & 0x800000) x -= 0x1000000; s = x / 8388608; }
    else if (bits === 32) s = v.getInt32(p, true) / 2147483648;
    else if (bits === 8) s = (u8[p] - 128) / 128;
    else throw new Error(`unsupported WAV bit depth ${bits}`);
    out[k][i] = s;
  }
  return { sampleRate, channels: out };
}

export function formatDuration(s) {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
