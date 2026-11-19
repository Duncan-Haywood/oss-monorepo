// Reading a syllable's opening consonant back from audio, to check what sing.mjs sings.
//
// The textbook acoustic cues, measured on short frames (20 ms Hann, 5 ms hop, 1024-point FFT)
// against the vowel that follows, never from the synthesiser's settings:
// - a stop is a closure (the level drops well below the vowel's for 25 ms or more) and then a
//   release (35 ms or more, so a tap is not one); it is voiced when the closure keeps a low murmur under 500 Hz (the voice bar).
//   Its place is read from the release burst's spectrum, after Stevens and Blumstein (1978):
//   alveolar bursts are high and diffuse (centroid above 3.4 kHz), velar bursts compact (one
//   500 Hz band from 1 to 4 kHz holds much of the energy), labial bursts low and diffuse.
// - a fricative is 30 ms or more of noise, most of its energy above 2.5 kHz; its centroid
//   (1-11 kHz) splits /s/ (above 4.8 kHz) from /ʃ/ (2.2-4.8 kHz), and a weak, flat one is /f/.
//   A closure straight before it makes it an affricate.
// - a nasal is 30 ms or more 10 dB darker (energy above 1 kHz against under 500 Hz) than the vowel
//   after it and the sound before it, its low band near the vowel's, and dark in itself (MURMUR_TILT).
// - a tap is one brief contact: the level's floor, 12 dB or more under the vowel, lasts under 30 ms.
// Anything else (l, the glides, a bare vowel) reads as no consonant.
// Known limits: the thresholds were set on held syllables at D3 (eval/consonant-check.mjs part
// A); voiced fricatives (v, z) carry little noise and are read only as "voiced fricative"; and
// it is a rule-based reader, not a listener.

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// second-order (RBJ) high-pass of x[i0..i1), from rest
function highpass(x, i0, i1, fc, rate) {
  const w0 = (2 * Math.PI * fc) / rate, al = Math.sin(w0) / Math.SQRT2, a0 = 1 + al, c = Math.cos(w0);
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  const out = new Float64Array(Math.max(0, i1 - i0)); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < out.length; i++) { const v = x[i0 + i] || 0, y = b0 * v + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y; }
  return out;
}

const N = 1024;
// band energies and shape of one frame of `len` seconds (default 20 ms) starting at sample i0
export function frameFeatures(x, i0, rate, len = 0.02) {
  const L = Math.round(len * rate), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < L && i < N; i++) re[i] = (x[i0 + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)));
  fft(re, im);
  const df = rate / N; let tot = 0, low = 0, lowMid = 0, hi = 0, hi1 = 0, hi5 = 0, mid = 0, cw = 0, best = 0, peakHz = 0;
  const bands = new Float64Array(8); // 500 Hz bands from 1 to 5 kHz
  for (let k = 1; k < N / 2; k++) {
    const f = k * df, p = re[k] * re[k] + im[k] * im[k];
    tot += p;
    if (f < 500) low += p;
    else if (f < 1000) lowMid += p;
    if (f > 1000) hi1 += p;
    if (f > 2500) hi += p;
    if (f > 5000) hi5 += p;
    if (f >= 1000 && f <= 11000) { mid += p; cw += p * f; }
    if (f >= 1000 && f < 5000) bands[Math.floor((f - 1000) / 500)] += p;
  }
  for (let b = 0; b < 6; b++) if (bands[b] > best) { best = bands[b]; peakHz = 1250 + 500 * b; } // compact peak between 1 and 4 kHz
  // the same, with the 500 Hz band free to sit anywhere from 1 to 4 kHz (a peak at 2 kHz is not split
  // between two fixed bands): readCoda's place uses it
  let slide = 0, slideHz = 0; const w = Math.round(500 / df);
  for (let k0 = Math.round(1000 / df); k0 + w <= Math.round(4000 / df); k0++) {
    let q = 0; for (let k = k0; k < k0 + w; k++) q += re[k] * re[k] + im[k] * im[k];
    if (q > slide) { slide = q; slideHz = (k0 + w / 2) * df; }
  }
  return { tot, low, lowMid, hi1, hi5, peakHz, lowR: tot ? low / tot : 0, hiR: tot ? hi / tot : 0, centroid: mid ? cw / mid : 0, compact: mid ? best / mid : 0, compactAny: mid ? slide / mid : 0, compactHz: slideHz };
}

// see readCoda's note on the murmur's own tilt
export const MURMUR_TILT = 28;
// readOnset's nasal: how much darker than its neighbours a murmur is (chosen on eval/consonant-check.mjs A and B)
export const DARK_BY = 10;
// readCoda's murmur against the vowel just before it (see its note); chosen on eval/coda-check.mjs A, B and I
export const NEAR = { dark: 8, lo: -18, hi: 0, hold: 4, tiltHold: 4 };
// readCoda's murmur just before the obstruent of an n-t, n-s or n-k cluster (see its note); chosen on the
// synthetic syllables of eval/coda-check.mjs A and J only. hi raised from 4 to 12 (2026-11-16, twelfth round,
// README "A murmur louder than the dip before it"): on D4-E4 notes the n of punc, tunt and sons swells 8-12 dB
// over the vowel's darkening dip just before it; set on J, N and O, pre-registered on part P
export const PRE = { dark: 6, step: 8, lo: -18, hi: 12, minMs: 40, gap: 5 };
// readCoda's vowelAgain before an obstruent (see its note); chosen on eval/coda-check.mjs J only
export const AGAIN = { gap: 5, frames: 2 };
// readCoda's voiced fricative: how much more energy above 5 kHz than the vowel's a frame must carry (see its
// note); chosen on synthetic syllables at part K's pitches (eval/coda-check.mjs header, tenth round)
export const VFRIC_HI5 = 12;
// readCoda's compact velar burst (opt-in `compactVelar: true`; README "A g's burst read as a b"); chosen on
// eval/coda-check.mjs K, N, T and U's stop codas read by eval/vstop-diag.mjs: labial bursts peaking at 1.5 kHz or
// above held 0.58 or less, velars read as labial 0.68 or more at 1.9 kHz or above
export const COMPACT_VELAR = { c: 0.65, hz: 1650 };
// readCoda's `voicelessLow` (README "A p's burst read as a k"): the share of a voiceless burst's energy above 1 kHz
// under which it is labial; set midway between the voiceless labials' highest (0.79) and the velars' lowest (0.99)
export const VOICELESS_LOW = 0.9;
// readCoda's voice-bar burst (`barBurst`, the default since its registration held on part X, eval/coda-check.mjs
// twentieth round; `barBurst: false` is the reader before; README "No burst on C#4-E4"): on C#4-E4 a voiced stop's voice
// bar sits 19-23 dB under the vowel in all but only 4-7 dB under its band under 500 Hz (the bar and the vowel are both
// little more than the fundamental there), so the closure rule (12 dB under 500 Hz) misses it and the nasal rule takes
// it; and a b's burst (a 500 Hz band) stands under 12 dB over the bar's harmonics above 600 Hz, the bar fading 5-9 dB
// through the closure. So, when the 600 Hz search finds nothing, the burst is searched again above `hz`, rising
// against the bar in the 10 ms before it. And a run `lvl` dB or more under the vowel, above `floor` (voiced: a
// silent closure is under it), `dark` dB or more under it above 1 kHz, is a voiced closure when a burst follows it
// within `tail` ms of its last frame, with the `holdMs` before the release still voiced and within `hold` dB of the
// run's median, no burst-into-frication (a cluster's s), and no closure with a burst of its own starting within
// `after` frames of its end (a cluster's n hands over to its stop's silent closure with one bright frame). A murmur
// read by any nasal rule that starts at most `lead` frames before such a closure is that closure's voice bar.
// Chosen on U's C#4 and D#4 cells (eval/burst-diag.mjs) and the development parts A-W of eval/coda-check.mjs.
// voicedLead's hold form: the longest lead, in 5 ms frames, it drops before a closure (README "A voiced closure that holds to its burst")
export const VOICED_HOLD_SPAN = 20;
// readCoda's default voicedLead since the twenty-second round's registration held on part Z (`voicedLead: false` is the
// reader before; `true` the bar form only)
export const VOICED_LEAD = { hold: true };
export const BAR_BURST = { hz: 2000, lvl: 10, floor: -40, dark: 30, tail: 25, lead: 4, hold: 6, holdMs: 20, after: 8 };
// readCoda's deep murmur on a high short note before an obstruent (see its note; off by default, `deepMurmur: true`);
// chosen on eval/coda-check.mjs J and N
// A dark-vowel nasal's lip closure (`lipShut`, the default since its registration held on part a; `lipShut: false` is the
// reader before; README "A dark-vowel m"): after /u/ on D4-E4 a final m is only
// 4-6 dB darker than the vowel, which has almost nothing above 1 kHz to lose, so the level, step and near rules all
// pass it by. What the closure does is drop the band above 1 kHz by `fall` dB or more within two hops, after a blip
// up as the lips meet, while the vowel's own vibrato moves it 4-9 dB over the same span. See readCoda.
// `span`, `settle` and `rise` (the twenty-fifth round, README "A dark-vowel m that closes slowly"; opt-in as
// `lipShut: { span: 4, settle: 2, rise: 4 }`): the fall counted from any of `span` frames before, the hold looked for up
// to `settle` frames after the fall, a late hold only when the band above 1 kHz climbs back no more than `rise` dB
export const LIP_SHUT = { fall: 12, span: 2, settle: 0, rise: null, dark: 8, lo: -20, hi: 0, hold: 4, hiHold: 6, minMs: 45 };
// A dark-vowel m that holds level (`lipHold`, opt-in; README "A dark-vowel m that holds level"): on D4-E4 after /u/
// (part a's *bum*, *hum*, *fum*) the vowel's band above 1 kHz has already fallen 3-8 dB into the closure, so the m sits
// no lower in that band than the vowel 25-45 ms before and lipShut's darkness test fails. What it does instead is hold:
// after the lips' blip the band above 1 kHz falls `fall` dB within `span` hops, and the level settles `drop` dB or more
// under the vowel and holds within `hold` dB for 30 ms. A vowel's fade at the note's end falls 1-3 dB per 10 ms.
export const LIP_HOLD = { fall: 12, span: 3, drop: 3, lo: -20, hold: 2, minMs: 45 };
// A vowel's release read as a murmur (`levelFade`, opt-in; README "A /u/ release read as a nasal"): a level-rule run
// that starts within `tail` 5 ms frames of the read window's last frame (the window ends 20 ms before the next sound)
// is thrown out. Every vowel-only nasal of c (A#3 quarters) and W (E3 eighths) started 5-6 frames from it; the earliest
// right nasal on K-c, 7 (eval/level-tail-sweep.mjs).
export const LEVEL_FADE = { tail: 6 };
export const LONG_TILT = { span: 0.3, gap: 0.45 };
export const DEEP = { lo: -35, hi: -12, minMs: 60, silent: -50, gap: 5, tilt: 15, peak: true };
const db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const median = (v) => { const s = [...v].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

// Classify the opening of a sung syllable: x is the signal, t0 the note start and vowelAt
// a time inside the steady vowel (seconds). Returns { cls, ...cues } where cls is one of
// 'stop', 'affricate', 'fricative', 'nasal', 'tap', 'none'; stops add voiced and place
// ('lab', 'alv', 'vel'), affricates voiced, fricatives place ('s', 'S', 'f', 'voiced').
// The earliest cue wins, so "spi" reads as its /s/ and "tri" as its /t/.
// murmurTilt (readCoda's rule): first tried on openings 2026-11-15 (eval/consonant-check.mjs), it cut the
// vowel-only control's false nasals from 123 to 23 of 934 but read B's sung nasal openings 64 of 149
// instead of 96, as openings still sang the first murmur. Since openings sing the coda's murmur (sing.mjs,
// README "Openings on the coda murmur") it is on, and a nasal's level bar is the coda reader's: 5 dB under
// the vowel (`nasalBar`), not 7, which sat on the new murmur's own level (7 dB under). `murmurTilt: 0,
// nasalBar: 7` is the reader before that round.
export function readOnset(x, rate, t0, vowelAt, { window = 0.2, murmurTilt = MURMUR_TILT, nasalBar = 5, tiltSpan = 3, darkBy = DARK_BY, darkLvl = 6, darkBoth = true } = {}) {
  const hop = Math.round(0.005 * rate), a = Math.round(t0 * rate), z = Math.round(Math.min(vowelAt, t0 + window) * rate);
  const ref = [];
  for (let i = Math.round(vowelAt * rate); i < Math.round((vowelAt + 0.06) * rate); i += hop) ref.push(frameFeatures(x, i, rate));
  const avg = (k) => ref.reduce((s, f) => s + f[k], 0) / Math.max(1, ref.length);
  const vTot = avg('tot'), vLow = avg('low'), vHi1 = avg('hi1'), vHi = avg('hiR');
  const fr = [];
  for (let i = a; i <= z; i += hop) fr.push({ t: (i - a) / rate, ...frameFeatures(x, i, rate) });
  for (const f of fr) { f.lvl = db(f.tot, vTot); f.loRel = db(f.low, vLow); f.hiRel = db(f.hi1, vHi1); }
  const runs = (pred, minMs) => {
    const out = []; let s = -1;
    fr.forEach((f, k) => { if (pred(f, k)) { if (s < 0) s = k; } else if (s >= 0) { out.push([s, k - 1]); s = -1; } });
    if (s >= 0) out.push([s, fr.length - 1]);
    return out.filter((r) => msOf(r) >= minMs);
  };
  const msOf = ([s, e]) => (e - s) * 5 + 20; // a run of frames covers (frames - 1) hops plus one frame
  const noisy = (f) => f.hiR > Math.max(0.5, 3 * vHi) && f.lvl > -45;
  const vnoisy = (f) => !noisy(f) && f.hiR > Math.max(0.12, 3 * vHi) && f.lowR > 0.2 && f.hiRel > -20 && f.lvl > -35 && f.lvl < -3;
  const closed = (f) => f.lvl < -22 && f.loRel < -12 && !noisy(f) && !vnoisy(f);
  // a nasal (since the "darker than both sides" round): 30 ms or more whose own tilt (above 1 kHz against
  // under 500 Hz) is darkBy dB darker than the vowel after it and than the frame just before the window,
  // its low band within 15 dB of the vowel's and its level 25 dB under to darkLvl over the vowel's. The
  // level bar it replaces (nasalBar under the vowel) missed a third of the sung murmurs: with five detuned
  // voices a murmur's level against its vowel beats from 20 dB under to 5 over (README, "Openings on the
  // coda murmur"), while its darkness holds. `darkBy: 0` is the level rule.
  const vTilt = db(vHi1, vLow), pre = frameFeatures(x, Math.max(0, a - Math.round(0.02 * rate)), rate), preTilt = darkBoth ? db(pre.hi1, pre.low) : Infinity;
  const nasal = darkBy
    ? (f) => f.loRel >= -15 && f.lvl < darkLvl && f.lvl > -25 && db(f.hi1, f.low) <= Math.min(vTilt, preTilt) - darkBy
    : (f) => f.loRel >= -15 && f.lvl < -nasalBar && f.lvl > -25 && f.hiRel < f.loRel - 5;
  // a tap: one brief contact, the level's deepest part (within 6 dB of its floor, 12 dB or more
  // under the vowel) shorter than 30 ms, with louder frames on both sides
  let mk = 0; fr.forEach((f, k) => { if (f.lvl < fr[mk].lvl) mk = k; });
  const floor = fr[mk].lvl;
  let s0 = mk, s1 = mk; while (s0 > 0 && fr[s0 - 1].lvl < floor + 6) s0--; while (s1 < fr.length - 1 && fr[s1 + 1].lvl < floor + 6) s1++;
  const dip = floor <= -12 && s0 > 0 && s1 < fr.length - 1 && msOf([s0, s1]) < 30
    && Math.max(...fr.slice(0, s0).map((f) => f.lvl)) >= floor + 10 && Math.max(...fr.slice(s1 + 1).map((f) => f.lvl)) >= floor + 10;
  if (dip && !fr.some((f) => noisy(f) || vnoisy(f))) return { cls: 'tap', floor }; // voiced throughout: no hiss before or after
  // the murmur's tilt: the run's median, or with tiltSpan k its darkest stretch of k frames (its median)
  const darkest = (r) => { const t = fr.slice(r[0], r[1] + 1).map((f) => db(f.hi1, f.low)); if (!tiltSpan || t.length <= tiltSpan) return median(t); let best = Infinity; for (let j = 0; j + tiltSpan <= t.length; j++) best = Math.min(best, median(t.slice(j, j + tiltSpan))); return best; };
  const cands = [
    ['closure', runs(closed, 35).filter((r) => r[1] < fr.length - 1)[0]],
    ['fricative', runs(noisy, 30)[0]],
    ['vfricative', runs(vnoisy, 30)[0]],
    ['nasal', runs(nasal, 30).find((r) => !murmurTilt || darkest(r) <= -murmurTilt)],
  ].filter(([, r]) => r).sort((p, q) => p[1][0] - q[1][0]);
  if (cands.length) {
    const [kind, r] = cands[0];
    const seg = fr.slice(r[0], r[1] + 1);
    if (kind === 'closure') {
      const inner = seg.length > 2 ? seg.slice(1, -1) : seg;
      const bar = median(inner.map((f) => f.loRel)), voiced = bar > -40;
      const after = runs((f, k) => k > r[1] && (noisy(f) || vnoisy(f)), 50).filter((q) => q[0] <= r[1] + 4);
      if (after.length) return { cls: 'affricate', voiced, bar, closureMs: msOf(r) };
      // the release: the first 2 ms after the closure's middle whose energy above 600 Hz (so a voice
      // bar does not count) rises 12 dB over the closure's and within 40 dB of the vowel's; the
      // burst is the 10 ms from 1 ms before it
      const from = a + Math.round((fr[r[0]].t + 0.01) * rate), to = a + Math.round((fr[r[1]].t + 0.04) * rate);
      const hp = highpass(x, from - Math.round(0.02 * rate), to + Math.round(0.01 * rate), 600, rate), off = from - Math.round(0.02 * rate);
      const vh = highpass(x, Math.round(vowelAt * rate) - Math.round(0.02 * rate), Math.round((vowelAt + 0.05) * rate), 600, rate);
      let vMean = 0; for (let i = Math.round(0.02 * rate); i < vh.length; i++) vMean += vh[i] ** 2; vMean /= Math.max(1, vh.length - Math.round(0.02 * rate));
      const w2 = Math.round(0.002 * rate), e2 = (i) => { let q = 0; for (let j = 0; j < w2; j++) q += (hp[i - off + j] || 0) ** 2; return q / w2; };
      const base = e2(from) + vMean * 1e-6;
      let rel = to;
      for (let i = from; i < to; i += w2) { const q = e2(i); if (q > base * 10 ** 1.2 && q > vMean * 1e-4) { rel = i; break; } }
      const b = frameFeatures(x, rel - Math.round(0.001 * rate), rate, 0.01);
      const place = b.centroid > 3400 ? 'alv' : b.compact > 0.4 && b.peakHz >= 1500 ? 'vel' : 'lab';
      return { cls: 'stop', voiced, place, bar, closureMs: msOf(r), centroid: b.centroid, compact: b.compact, peakHz: b.peakHz };
    }
    if (kind === 'fricative') {
      const cen = seg.reduce((q, f) => q + f.centroid, 0) / seg.length, l = seg.reduce((q, f) => q + f.lvl, 0) / seg.length;
      const voicedUnder = median(seg.map((f) => f.loRel)) > -25; // the voices go on under a v or a z
      const place = voicedUnder ? 'voiced' : l < -20 ? 'f' : cen > 4800 ? 's' : cen > 2200 ? 'S' : 'f';
      return { cls: 'fricative', place, centroid: cen, level: l };
    }
    if (kind === 'vfricative') return { cls: 'fricative', place: 'voiced' };
    return { cls: 'nasal' };
  }
  return { cls: 'none' };
}

// what readOnset should report for a phone (sing.mjs's PHONES names)
export function expectedRead(ph) {
  if (!ph) return { cls: 'none' };
  if ('pbtdkg'.includes(ph)) return { cls: 'stop', voiced: 'bdg'.includes(ph), place: { p: 'lab', b: 'lab', t: 'alv', d: 'alv', k: 'vel', g: 'vel' }[ph] };
  if (ph === 'tS' || ph === 'dZ') return { cls: 'affricate', voiced: ph === 'dZ' };
  if (ph === 's' || ph === 'S' || ph === 'f') return { cls: 'fricative', place: ph };
  if (ph === 'v' || ph === 'z') return { cls: 'fricative', place: 'voiced' };
  if ('mnN'.includes(ph)) return { cls: 'nasal' };
  if (ph === 'r') return { cls: 'tap' };
  return { cls: 'none' }; // l, j, w
}

// Reading a syllable's final consonant back from audio: the same cues, run the other way. x is the
// signal, vowelAt a time inside the steady vowel before the coda (seconds; the 60 ms from it are
// the reference) and tEnd where the next sound may start. Frames from the reference's end to tEnd:
// - a stop is a closure (30 ms or more, the voices gone) and then one short burst:
//   energy above 600 Hz rising 12 dB over the closure and falling 6 dB again within 25 ms (a fade
//   into silence has no burst, and the next vowel does not fall); place from the burst as before.
// - a fricative, a nasal and a tap as for an opening.
// The earliest cue wins, so "nunc" reads as its /n/ and "post" as its /s/.
// A murmur is dark in itself, not only against its vowel: the nose passes little above a few hundred
// hertz, so a nasal's energy above 1 kHz sits far under its own band under 500 Hz, while a lateral (/l/)
// keeps its F2 and F3. Measured on the sung syllables E2-E4 (README "Final consonants, fourth round"):
// /l/ 12-25 dB, /m/ and /n/ 38-54 dB. Without it every final *al* read as a nasal (its F1 falls under
// 500 Hz, which brightens the low band against the vowel's). `murmurTilt: 0` turns the check off.
export const LOCAL_REF = { from: 6, to: 24, cap: 20, nasal: false };
// A second rule for the same fault, written in parallel by another session (2026-11-16, README "Two anchors for one
// closure"): a frame closes against the louder of the reference and the loudest of the last ANCHOR.frames
// vowel-like frames (within ANCHOR.drop dB of that level), band by band (total and under 500 Hz apart), uncapped.
// No frame in a closure is vowel-like, so the anchor holds through it. Opt-in (`closeAnchor: true`); it replaces
// localRef on the closure rule only, the nasal rule is untouched.
export const ANCHOR = { frames: 10, drop: 12 };
export function readCoda(x, rate, vowelAt, tEnd, { murmurTilt = MURMUR_TILT, nearVowel = true, nearOpts = {}, preObstruent = true, preOpts = {}, againGap = true, vfricHi5 = VFRIC_HI5, deepMurmur = false, deepOpts = {}, localRef = LOCAL_REF, closeAnchor = false, barLead = false, compactVelar = false, voicelessLow = VOICELESS_LOW, barBurst = true, voicedLead = VOICED_LEAD, lipShut = true, lipHold = false, levelFade = false, longTilt = false, nearRelease = false, noteEnd = null, trace = null } = {}) {
  const hop = Math.round(0.005 * rate), a = Math.round((vowelAt + 0.06) * rate), z = Math.round((tEnd - 0.02) * rate), zEnd = Math.round(tEnd * rate);
  const ref = [];
  for (let i = Math.round(vowelAt * rate); i < a; i += hop) ref.push(frameFeatures(x, i, rate));
  const avg = (k) => ref.reduce((s, f) => s + f[k], 0) / Math.max(1, ref.length);
  const vTot = avg('tot'), vLow = avg('low'), vHi1 = avg('hi1'), vHi = avg('hiR'), vHi5 = avg('hi5');
  const fr = [];
  for (let i = a; i <= z; i += hop) fr.push({ t: (i - a) / rate, ...frameFeatures(x, i, rate) });
  if (fr.length < 3) return { cls: 'none' };
  for (const f of fr) { f.lvl = db(f.tot, vTot); f.loRel = db(f.low, vLow); f.hiRel = db(f.hi1, vHi1); }
  // Against the vowel just before (2026-11-16, README "A closure against the vowel before it"): on a high note
  // five beating voices swing the vowel's level by 15-20 dB, and the 60 ms reference can fall in a trough, so a
  // closure 25 dB under the vowel before it read 13 dB under the reference (D4 *ib*, *eb*) and missed the
  // closure rule. So the closure's level is read against the louder of the reference and the vowel before the
  // frame: the loudest median of five frames from localRef.from to localRef.to frames back (30-120 ms), capped
  // at localRef.cap dB over the reference. The nasal rule keeps the reference (localRef.nasal false): read
  // against the vowel before, a vowel-only release fading through -5 to -25 dB of it read as a murmur (the
  // vowel-only controls of J, K, L, M and N lost 33 cells). A closure needs a burst after it, which a fade
  // never has. `localRef: false` is the reader before.
  if (localRef) {
    const LR = localRef === true ? LOCAL_REF : localRef, sm = fr.map((_, k) => median(fr.slice(Math.max(0, k - 2), k + 3).map((f) => f.lvl)));
    fr.forEach((f, k) => {
      let up = 0; for (let j = Math.max(0, k - LR.to); j <= k - LR.from; j++) up = Math.max(up, sm[j]);
      f.up = Math.min(LR.cap, up);
    });
  } else for (const f of fr) f.up = 0;
  const msOf = ([s, e]) => (e - s) * 5 + 20;
  const runs = (pred, minMs) => {
    const out = []; let s = -1;
    fr.forEach((f, k) => { if (pred(f, k)) { if (s < 0) s = k; } else if (s >= 0) { out.push([s, k - 1]); s = -1; } });
    if (s >= 0) out.push([s, fr.length - 1]);
    return out.filter((r) => msOf(r) >= minMs);
  };
  // A fricative adds noise: frication high up (sing.mjs's /z/ and /s/ are centred on 6.5 kHz, /v/ and /f/
  // on 5 kHz), so a frame of one, voiced or not, carries vfricHi5 dB or more energy above 5 kHz than the
  // vowel (2026-11-16, README "/i/ is not a voiced fricative"). Without that test, /i/ met the voiced
  // fricative wherever its low band sank: /i/ has almost all its energy in its lowest harmonics (F1 270 Hz),
  // so where the five detuned voices' fundamentals beat out of phase, and in its release, the low band drops
  // 8-18 dB, the share above 2.5 kHz rises past 0.12 (past 0.5 on a short note's attack) and the frame looked
  // voiced and noisy. Its energy above 5 kHz stays within -13 to +3 dB of the vowel's there; sung z and v sit
  // 66 dB and more over it. `vfricHi5: false` is the reader before.
  const hiss = (f) => vfricHi5 === false || db(f.hi5, vHi5) >= vfricHi5;
  const noisy = (f) => f.hiR > Math.max(0.5, 3 * vHi) && f.lvl > -45 && hiss(f);
  const vnoisy = (f) => !noisy(f) && f.hiR > Math.max(0.12, 3 * vHi) && f.lowR > 0.2 && f.hiRel > -20 && f.lvl > -35 && f.lvl < -3 && hiss(f);
  if (closeAnchor) {
    const hist = []; // the last ANCHOR.frames vowel-like frames' [lvl, loRel]
    for (const f of fr) {
      f.aT = Math.max(0, ...hist.map((h) => h[0])); f.aL = Math.max(0, ...hist.map((h) => h[1]));
      if (f.lvl > f.aT - ANCHOR.drop) { hist.push([f.lvl, f.loRel]); if (hist.length > ANCHOR.frames) hist.shift(); }
    }
  }
  const closed = closeAnchor ? (f) => f.lvl - f.aT < -22 && f.loRel - f.aL < -12 && !noisy(f) && !vnoisy(f)
    : (f) => f.lvl - f.up < -22 && f.loRel - f.up < -12 && !noisy(f) && !vnoisy(f);
  // a coda's nasal must be a deeper murmur than an opening's: a vowel fading into its release also
  // loses its upper formants first (they ring for less time), by 5 to 12 dB
  const nu = (f) => (localRef && (localRef === true ? LOCAL_REF : localRef).nasal ? f.up : 0);
  // The murmur's darkness against a longer stretch of vowel (2026-11-17, README "A cluster onset before -um"):
  // five detuned voices beat, so the vowel's tilt (above 1 kHz against under 500 Hz) swings 10-15 dB through a
  // held note, and the 60 ms reference can land on its darkest stretch. On D4 *brum* it read -47 dB, darker than
  // the m itself (-36 to -46), and the plain level rule's darkness test could not pass. With `longTilt` the test
  // takes the median tilt of the frames from the reference's start to longTilt.span seconds on, ending at least
  // longTilt.gap seconds before tEnd (so the coda stays out of it), never shorter than the reference itself.
  let darkTest = (f) => f.hiRel < f.loRel - 15;
  if (longTilt) {
    const LT = { ...LONG_TILT, ...(longTilt === true ? {} : longTilt) }, s0 = Math.round(vowelAt * rate);
    const s1 = Math.max(a, Math.min(Math.round((vowelAt + LT.span) * rate), Math.round((tEnd - LT.gap) * rate)));
    const tl = []; for (let i = s0; i < s1; i += hop) { const g = frameFeatures(x, i, rate); tl.push(db(g.hi1, g.low)); }
    const refT = median(tl);
    darkTest = (f) => db(f.hi1, f.low) < refT - 15;
  }
  const nasal = (f) => f.loRel - nu(f) >= -15 && f.lvl - nu(f) < -5 && f.lvl - nu(f) > -25 && darkTest(f);
  // a tap: a brief dip, 12 dB or more under the vowel and under 30 ms at its deepest, with frames
  // 10 dB louder within 40 ms on both sides (a final r hums on after it). Searched locally: the
  // quietest frame of the window is the release's fade. After a dark vowel (/u/, /o/) the r's own
  // voice on either side of its contact is up to 7 dB louder than the vowel, so a contact 13-17 dB
  // under its neighbours sat only 9-12 dB under the vowel (README "Final consonants, fifth round"):
  // a dip 6 dB under the vowel counts when frames 12 dB louder than it stand on both sides.
  let tapRun = null;
  for (let k = 1; k < fr.length - 1 && !tapRun; k++) {
    const fl = fr[k].lvl;
    if (fl > -6 || fr[k - 1].lvl < fl || fr[k + 1].lvl < fl) continue;
    let p0 = k, p1 = k; while (p0 > 0 && fr[p0 - 1].lvl < fl + 6) p0--; while (p1 < fr.length - 1 && fr[p1 + 1].lvl < fl + 6) p1++;
    if (p0 === 0 || p1 === fr.length - 1 || msOf([p0, p1]) >= 30) continue;
    const rise = fl > -12 ? 12 : 10, side = (lo, hi) => fr.slice(Math.max(0, lo), Math.max(0, hi)).some((f) => f.lvl >= fl + rise);
    if (side(p0 - 8, p0) && side(p1 + 1, p1 + 9)) tapRun = [p0, p1];
  }
  const floor = tapRun ? fr[tapRun[0]].lvl : null, dip = !!tapRun, s0 = tapRun?.[0], s1 = tapRun?.[1];
  const BB = barBurst ? { ...BAR_BURST, ...(barBurst === true ? {} : barBurst) } : null;
  const vMeanOf = {};
  const vMeanAt = (hz) => {
    if (vMeanOf[hz] === undefined) {
      const vh = highpass(x, Math.round(vowelAt * rate) - Math.round(0.02 * rate), a, hz, rate);
      let m = 0; for (let i = Math.round(0.02 * rate); i < vh.length; i++) m += vh[i] ** 2; vMeanOf[hz] = m / Math.max(1, vh.length - Math.round(0.02 * rate));
    }
    return vMeanOf[hz];
  };
  // a burst after the closure that starts at frame r[0]: the release time, or -1. With `barBurst` a search above
  // 600 Hz that finds none is run again above BB.hz, over the voice bar's second and third harmonics on a high note
  const burstAfter = (r, why = null, tail = 0.04, fricOk = true) => {
    const at = burstIn(r, why, tail, 600, fricOk);
    return at >= 0 || !BB ? at : burstIn(r, why && (why.hi = {}), tail, BB.hz, fricOk);
  };
  const burstIn = (r, why, tail, hz, fricOk) => {
    const vMean = vMeanAt(hz);
    const from = a + Math.round((fr[r[0]].t + 0.015) * rate), to = Math.min(zEnd - Math.round(0.003 * rate), a + Math.round((fr[r[1]].t + tail) * rate));
    // nothing after tEnd is read: the next syllable's sound is not this one's burst decaying or not
    const off = from - Math.round(0.02 * rate), hp = highpass(x, off, Math.min(to + Math.round(0.04 * rate), zEnd), hz, rate);
    const w2 = Math.round(0.002 * rate), e2 = (i) => { let q = 0; for (let j = 0; j < w2; j++) q += (hp[i - off + j] || 0) ** 2; return q / w2; };
    // the retry above BB.hz rises against the bar just before it, the mean of the 10 ms ending 2 ms earlier: the bar
    // fades 5-9 dB through a closure on C#4-E4, and its energy up there comes in glottal pulses, so the closure's
    // first 2 ms stood level with b's burst at its end
    const base0 = e2(from) + vMean * 1e-6, bw = Math.round(0.01 * rate);
    const baseAt = hz === 600 ? () => base0 : (i) => { let q = 0, nq = 0; for (let j = Math.max(off, i - w2 - bw); j < i - w2; j += w2) { q += e2(j); nq++; } return q / Math.max(1, nq) + vMean * 1e-6; };
    const base = base0;
    if (why) Object.assign(why, { from: (from - a) / rate, to: (to - a) / rate, baseDb: 10 * Math.log10(base / vMean), maxDb: -Infinity, tries: [] });
    for (let i = from; i < to; i += w2) {
      const q = e2(i), bi = baseAt(i);
      if (why) { why.maxDb = Math.max(why.maxDb, 10 * Math.log10(q / bi)); (why.series = why.series || []).push(Math.round(10 * Math.log10(q / bi))); }
      if (!(q > bi * 10 ** 1.2 && q > vMean * 1e-4)) continue;
      let peak = q; for (let j = i; j < i + Math.round(0.01 * rate); j += w2) peak = Math.max(peak, e2(j));
      let late = 0, nl = 0; for (let j = i + Math.round(0.02 * rate); j < i + Math.round(0.03 * rate); j += w2) { late += e2(j); nl++; }
      if (why) why.tries.push({ at: (i - a) / rate, riseDb: 10 * Math.log10(q / bi), lateDb: 10 * Math.log10(late / Math.max(1, nl) / peak) });
      if (late / Math.max(1, nl) < peak / 4) return i;
      // or the burst runs straight into frication (the k s of "lux", the p s of "ops"): noise above
      // 2.5 kHz from 10 to 30 ms after it, with the voices still off, is the cluster's fricative
      const after = [0.01, 0.02].map((d) => frameFeatures(x, i + Math.round(d * rate), rate));
      if (fricOk && i + Math.round(0.04 * rate) <= zEnd && after.every((f) => f.hiR > Math.max(0.5, 3 * vHi) && db(f.low, vLow) < -20)) return i;
      return -1; // the energy came back and stayed: the next sound, not a burst
    }
    return -1;
  };
  // 30 ms, not an opening's 35: a coda on a short note is shortened to fit (codaPlan)
  const closures = runs(closed, 30).filter((r) => r[0] > 0);
  // a voice bar the closure rule misses (`barBurst`): voiced, dark, and running up to a burst
  // The burst must end a held bar: no burst-into-frication (a cluster's s after its n), and the 20 ms just before
  // the release still voiced, within BB.hold dB of the run's median (a cluster's n fades into a silent closure)
  const barRel = (r) => {
    const rel = burstAfter(r, null, BB.tail / 1000, false);
    if (rel < 0) return -1;
    const f = frameFeatures(x, rel - Math.round(BB.holdMs / 1000 * rate), rate, BB.holdMs / 1000), l = db(f.tot, vTot) - 10 * Math.log10(BB.holdMs / 20), ml = median(fr.slice(r[0], r[1] + 1).map((q) => q.lvl));
    return l > BB.floor && l >= ml - BB.hold ? rel : -1;
  };
  const barred = BB ? runs((f) => f.lvl < -BB.lvl && f.lvl > BB.floor && f.hiRel < -BB.dark && !noisy(f) && !vnoisy(f), 30)
    // a cluster's n before its stop: the n hands over to the closure with one bright frame the retry can take for a
    // burst, and the closure the closure rule reads after it has a burst of its own
    .filter((r) => r[0] > 0 && !closures.some((c) => c[0] >= r[1] - 2 && c[0] - r[1] <= BB.after && burstAfter(c) >= 0) && barRel(r) >= 0) : [];
  if (trace && BB) trace.barCands = runs((f) => f.lvl < -BB.lvl && f.lvl > BB.floor && f.hiRel < -BB.dark && !noisy(f) && !vnoisy(f), 30).map((r) => { const why = {}; const rel = burstAfter(r, why, BB.tail / 1000, false); return { held: rel >= 0 ? barRel(r) >= 0 : null, t: fr[r[0]].t, end: fr[r[1]].t, rel: rel < 0 ? -1 : (rel - a) / rate, ...why }; });
  for (const r of barred) if (!closures.some((c) => c[0] <= r[0] && c[1] >= r[0])) closures.push(r);
  closures.sort((p, q) => p[0] - q[0]);
  const relMemo = new Map(), relOf = { get: (r) => { if (!relMemo.has(r)) relMemo.set(r, barred.includes(r) ? barRel(r) : burstAfter(r)); return relMemo.get(r); } };
  const stopRun = closures.find((r) => relOf.get(r) >= 0);
  const barRun = stopRun && barred.includes(stopRun) ? stopRun : null;
  if (trace) trace.closures = closures.map((r) => { const why = {}; const rel = relOf.get(r); burstAfter(r, why, barred.includes(r) ? BB.tail / 1000 : 0.04); return { at: r[0], end: r[1], t: fr[r[0]].t, ms: msOf(r), rel: rel < 0 ? -1 : (rel - a) / rate, ...why }; });
  const fric = runs(noisy, 30)[0], vfric = runs(vnoisy, 30)[0], tap = dip && !fr.some((f) => noisy(f) || vnoisy(f)) ? [s0, s1] : null;
  // F1 falls as the mouth closes for an obstruent, so the vowel's last 30-45 ms before a closure or
  // a fricative look like a murmur. A nasal there counts only when it lasts 45 ms or more ("unt").
  const next = [stopRun, fric, vfric, tap].filter(Boolean).map((r) => r[0]);
  // and a murmur closes the syllable: when the vowel comes back after it (a vibrato swing taking a
  // harmonic off F1 on a high note looks like one for 30 ms) it was not a nasal
  // Before an obstruent (2026-11-16, README "nunc and mens on C4"): when a stop's closure or a fricative
  // starts within AGAIN.gap frames of the run's end, only the frames between are read, and the vowel is back
  // only when AGAIN.frames or more of them are vowel-like. What follows the obstruent's onset is the
  // obstruent (the /s/ of *mens* is bright and loud) or the next note, and the 5-10 ms the murmur takes to
  // hand over to a closure brightens one frame (the oral tract opens a little as the velum shuts): on C4
  // that one frame threw out the murmur of *nunc*, *tunc* and *mens*. `againGap: false` is the reader before.
  const obsAt = [stopRun, fric, vfric].filter(Boolean).map((q) => q[0]);
  const vowelLike = (f) => f.hiRel > -6 && f.lvl > -10;
  const vowelAgain = (r) => {
    const o = againGap ? obsAt.filter((k) => k > r[1] && k - r[1] <= AGAIN.gap).sort((p, q) => p - q)[0] : undefined;
    if (o === undefined) return fr.slice(r[1] + 1).some(vowelLike);
    return fr.slice(r[1] + 1, o).filter(vowelLike).length >= AGAIN.frames;
  };
  // After a dark vowel (/u/, and /o/ low down) the vowel has little above 1 kHz to lose, so its murmur is
  // only 8-12 dB darker, which a fade also reaches (README "Final consonants, third round"). What a fade
  // does not do is step under 500 Hz: the lips shut in 10 ms and the murmur, quieter than the vowel in
  // every band, then holds its level, while a release falls 1-3 dB per 10 ms and an open vowel's release
  // (/a/ on A2) loses its upper formants first with its low band held within 3 dB. So a run 6 dB or more
  // under the vowel under 500 Hz and 7 dB darker, entered by a drop of 5 dB or more there within 20 ms
  // and holding within 4 dB for 45 ms, is a murmur too.
  const darkish = (f) => f.lvl > -20 && f.loRel <= -6 && f.loRel > -20 && f.hiRel < f.loRel - 7;
  const stepped = (r) => {
    const held = fr.slice(r[0], r[0] + 6).map((f) => f.loRel);
    if (held.length < 6 || Math.max(...held) - Math.min(...held) > 4) return false;
    const before = fr.slice(Math.max(0, r[0] - 4), r[0]).map((f) => f.loRel);
    return before.length > 0 && Math.max(...before) >= median(held) + 5;
  };
  const murmur = (r) => !murmurTilt || median(fr.slice(r[0], r[1] + 1).map((f) => db(f.hi1, f.low))) <= -murmurTilt;
  const step = runs(darkish, 45).find((r) => stepped(r) && !vowelAgain(r) && murmur(r));
  // A murmur that runs into a tap's contact or through it is the r's own voice around the contact: its
  // formants (F1 450 Hz) are darker than /a/'s, so after /a/ it met the murmur rule for 30 ms and more, and
  // no Latin coda puts a nasal next to an r (README "Final consonants, fifth round").
  const intoTap = (r) => tap && r[0] <= tap[1] && r[1] >= tap[0] - 2;
  // Against the vowel just before it (2026-11-15, README "A short final -um against the vowel just before
  // it"): five detuned voices beat, and a murmur passes only their lowest harmonics, so its level against
  // the reference 60 ms at the note's start swung from 4 to 15 dB under (D3, the same -um); the vowel's
  // own level drifts with the same beat. So a run also counts as a murmur when, against the vowel 25-45
  // ms before it (NEAR), each frame is NEAR.dark dB or more darker, its level from NEAR.lo to NEAR.hi dB
  // of it, its level and its darkness holding within NEAR.hold and NEAR.tiltHold dB over its first 30 ms
  // (a fade falls 1-3 dB per 10 ms; the darkness of a /u/ or /o/ releasing wanders by 8 dB while its level
  // holds), 45 ms long, and dark in itself.
  const NR = { ...NEAR, ...nearOpts };
  const tiltOf = (f) => db(f.hi1, f.low);
  const nearRun = () => {
    if (!nearVowel) return null;
    const out = [];
    for (let k = 9; k < fr.length; k++) {
      const pre = fr.slice(k - 9, k - 4), pl = median(pre.map((f) => f.lvl)), pt = median(pre.map(tiltOf));
      const ok = (f) => tiltOf(f) <= pt - NR.dark && f.lvl - pl >= NR.lo && f.lvl - pl <= NR.hi && tiltOf(f) <= -murmurTilt;
      let e = k; while (e < fr.length && ok(fr[e])) e++;
      if (msOf([k, e - 1]) < 45 || e === k) continue;
      const held = fr.slice(k, k + 6), spread = (v) => Math.max(...v) - Math.min(...v);
      if (spread(held.map((f) => f.lvl)) > NR.hold || spread(held.map(tiltOf)) > NR.tiltHold) continue;
      out.push([k, e - 1]); break;
    }
    return out.find((r) => !vowelAgain(r)) || null;
  };
  let near = nearRun();
  // The vowel's release read as a murmur (2026-11-19, opt-in `nearRelease`, README "Held out where the release
  // lands"): sing.mjs sings a coda at the end of its note so it finishes as the note does (codaPlan), so a sung
  // murmur starts before the note's end. On parts K-c every right near-rule read but one started 26 ms or more
  // before it; 48 of the 50 wrong ones, every one a vowel-only /u/ or /o/ fading after the note, started 19-171 ms
  // after it (eval/near-tail-sweep.txt; part e's 14, eval/e4-eighth-diag.mjs, 95 ms after). With `noteEnd` (seconds, the score's end of the note) a near run starting at
  // or after it is thrown out. Read off that sweep, not tuned.
  if (nearRelease && near && noteEnd != null && vowelAt + 0.06 + fr[near[0]].t >= noteEnd) {
    if (trace) trace.nearReleased = { t: fr[near[0]].t, after: Math.round(1000 * (vowelAt + 0.06 + fr[near[0]].t - noteEnd)) };
    near = null;
  }
  if (trace && near) trace.near = { at: near[0], t: fr[near[0]].t, ms: msOf(near), left: fr.length - 1 - near[0], endLeft: fr.length - 1 - near[1], lv: fr.slice(near[0], Math.min(near[1] + 1, near[0] + 7)).map((f) => +f.lvl.toFixed(1)), tilt: fr.slice(near[0], Math.min(near[1] + 1, near[0] + 7)).map((f) => Math.round(tiltOf(f))) };
  // Before the obstruent of a cluster (2026-11-16, README "-unt read on its stop"): the n of *sunt*, *ant*,
  // *mens* is a murmur of 40-70 ms (codaPlan) that the obstruent's closure or noise ends, so none of the
  // rules above, which want it quieter (nasal), stepped down under 500 Hz (step) or holding its darkness
  // within 4 dB (near), need see it: with five beating voices it sits 2 to 4 dB under its vowel at E2 and
  // A2 and its darkness wobbles by 6 dB. What it does is stay dark right up to the closure. So a run counts
  // when every frame is PRE.dark dB or more darker than the vowel 25-45 ms before it, from PRE.lo to PRE.hi
  // dB of its level, dark in itself (murmurTilt), PRE.minMs long, and ends at most PRE.gap frames before a
  // stop's closure or a fricative. A vowel only darkens into a closure as a ramp over its last 20-30 ms
  // (F1 falling), mostly brighter than murmurTilt; with no obstruent after it (the vowel-only choir, a
  // final -m) this rule cannot fire. `preObstruent: false` is the reader before.
  const PR = { ...PRE, ...preOpts };
  const preRun = () => {
    if (!preObstruent) return null;
    const obs = [stopRun, fric, vfric].filter(Boolean).map((r) => r[0]);
    if (!obs.length) return null;
    for (let k = 9; k < fr.length; k++) {
      const pre = fr.slice(k - 9, k - 4), pl = median(pre.map((f) => f.lvl)), pt = median(pre.map(tiltOf));
      const ok = (f) => tiltOf(f) <= pt - PR.dark && f.lvl - pl >= PR.lo && f.lvl - pl <= PR.hi && tiltOf(f) <= -murmurTilt;
      if (!ok(fr[k])) continue;
      let e = k; while (e < fr.length && ok(fr[e])) e++;
      const r = [k, e - 1];
      // entered by a step: some 5 ms hop from two frames before the run to two into it darkens by PR.step dB
      let jump = 0; for (let i = Math.max(1, k - 2); i <= Math.min(e - 1, k + 2); i++) jump = Math.max(jump, tiltOf(fr[i - 1]) - tiltOf(fr[i]));
      if (jump < PR.step) continue;
      if (msOf(r) >= PR.minMs && obs.some((o) => o > r[1] && o - r[1] <= PR.gap)) return r;
    }
    return null;
  };
  const pre = preRun();
  // A deep murmur on a high short note (2026-11-16, README "E4 eighth notes: a murmur read as a closure"): on E4
  // eighth notes the n of *nunc*, *tunc*, *mens* and *sunt* sits 18-33 dB under its vowel, past PRE.lo, and only
  // 15-30 dB dark in itself, short of murmurTilt (one harmonic of a 330 Hz voice passes under 500 Hz), so no rule
  // above saw it, and the beat's dips inside it met the closure rule, with the murmur's swell back read as the
  // burst: a voiced labial stop. What it does that nothing else does is hold, then end in an obstruent: a run
  // of DEEP.minMs or more at DEEP.lo to DEEP.hi dB of the vowel (the louder of the reference and the vowel's
  // peak in the 50 ms before the run: on an eighth note the reference is still in the attack), a median DEEP.tilt
  // dB dark in itself, that runs into frication outlasting it, or within DEEP.gap frames into a closure that
  // reaches silence (a frame at DEEP.silent dB of the vowel or lower) and ends in a burst. A voiced stop's voice
  // bar (-24 to -43 dB) holds up to its burst; a vowel falling into a voiceless closure passes through the band
  // in 15-35 ms. Second registration (eval/coda-check.mjs header): the first, with a fall of 18 dB under the run
  // in place of silence and no peak, read voice bars as murmurs. The second also failed three of its predictions on
  // held-out part O (no gain on its D4-E4 eighths, M's others 106 to 105), so as registered it is off by default:
  // `deepMurmur: true` turns it on.
  const DP = { ...DEEP, ...deepOpts };
  const deepRun = () => {
    if (!deepMurmur) return null;
    if (!stopRun && !fric) return null;
    for (let k = 1; k < fr.length; k++) {
      const base = DP.peak ? Math.max(0, ...fr.slice(Math.max(0, k - 10), k).map((f) => f.lvl)) : 0;
      const inBand = (f) => f.lvl - base >= DP.lo && f.lvl - base <= DP.hi;
      if (!inBand(fr[k]) || inBand(fr[k - 1])) continue;
      let e = k; while (e < fr.length && inBand(fr[e])) e++;
      const r = [k, e - 1];
      if (msOf(r) < DP.minMs) continue;
      const seg = fr.slice(k, e), ml = median(seg.map((f) => f.lvl));
      if (median(seg.map(tiltOf)) > -DP.tilt) continue;
      // into frication that outlasts it (a burst inside the run is a voiced stop's release, not an s)
      const intoFric = fric && fric[0] >= r[1] - 2 && fric[1] > r[1] && fric[0] - r[1] <= DP.gap;
      // or into a silent closure that ends in a burst: a voice bar instead runs on up to its burst, and
      // the beat's dips inside a murmur are not silent
      const intoSilence = closures.some((c) => c[0] >= r[1] - 2 && c[0] - r[1] <= DP.gap && burstAfter(c) >= 0
        && fr.slice(c[0], c[1] + 1).some((f) => f.lvl <= DP.silent));
      if (intoFric || intoSilence) return r;
    }
    return null;
  };
  const deep = deepRun();
  // A dark-vowel nasal's lip closure (`lipShut`, the default since the twenty-third round; README "A dark-vowel m"):
  // Z's *lum* and *dun* and X's *tum* on D4-E4 read as nothing. Frame by frame (eval/dark-nasal-diag.mjs) the sung m there sits 2-17 dB under the reference
  // and is dark in itself (tilt -39 to -50), but no darker than an /u/ that already had a tilt of -38 to -45, so the
  // level rule's 15 dB and the step rule's 7 dB of darkness against the vowel both fail. Its entry is what marks it:
  // the band above 1 kHz blips up as the lips meet, then falls 14-19 dB within two hops and holds within 1-4 dB. So a
  // run counts when the band above 1 kHz has fallen SH.fall dB or more from either of the two frames before it, every
  // frame sits SH.dark dB or more under that band in the vowel 25-45 ms before, SH.lo to SH.hi dB of that vowel's
  // level, dark in itself (murmurTilt), its level and its upper band holding within SH.hold and SH.hiHold dB over its
  // first 30 ms, SH.minMs long, and the vowel does not come back after it.
  const SH = lipShut ? { ...LIP_SHUT, ...(lipShut === true ? {} : lipShut) } : null;
  const shutRun = () => {
    if (!SH) return null;
    for (let k = 9; k < fr.length; k++) {
      let top = -Infinity; for (let i = 1; i <= SH.span; i++) top = Math.max(top, fr[k - i].hiRel);
      if (top - fr[k].hiRel < SH.fall) continue;
      const pre = fr.slice(k - 9, k - 4), pl = median(pre.map((f) => f.lvl)), ph = median(pre.map((f) => f.hiRel));
      const ok = (f) => f.hiRel <= ph - SH.dark && f.lvl - pl >= SH.lo && f.lvl - pl <= SH.hi && tiltOf(f) <= -murmurTilt;
      let e = k; while (e < fr.length && ok(fr[e])) e++;
      const r = [k, e - 1];
      if (e === k || msOf(r) < SH.minMs) continue;
      const spread = (v) => Math.max(...v) - Math.min(...v);
      let steady = false, at = 0;
      for (let s = 0; s <= SH.settle && !steady && k + s + 6 <= e; s++) {
        const held = fr.slice(k + s, k + s + 6);
        steady = spread(held.map((f) => f.lvl)) <= SH.hold && spread(held.map((f) => f.hiRel)) <= SH.hiHold;
        at = s;
      }
      // the slow form: a hold that only starts `at` > 0 frames after the fall counts when the band above 1 kHz never
      // climbs back more than SH.rise dB over its lowest point since the fall, up to the hold's end (a fading vowel's
      // vibrato brings it back 6-10 dB; eval/coda-check.mjs A's /u/ on C4). A hold from the fall itself is the rule as before.
      if (steady && at > 0 && SH.rise != null) {
        let lo = Infinity;
        for (const f of fr.slice(k, k + at + 6)) { lo = Math.min(lo, f.hiRel); if (f.hiRel - lo > SH.rise) { steady = false; break; } }
      }
      if (trace) (trace.shut = trace.shut || []).push({ k, t: fr[k].t, fall: top - fr[k].hiRel, ms: msOf(r), steady, again: vowelAgain(r), lv: fr.slice(k - 6, k + 10).map((f) => Math.round(f.lvl - pl)), hi: fr.slice(k - 6, k + 10).map((f) => Math.round(f.hiRel - ph)), tilt: fr.slice(k - 6, k + 10).map((f) => Math.round(tiltOf(f))) });
      if (!steady) continue;
      if (vowelAgain(r)) continue;
      return r;
    }
    return null;
  };
  const shut = shutRun();
  // A dark-vowel m that holds level (opt-in `lipHold`; LIP_HOLD above)
  const LH = lipHold ? { ...LIP_HOLD, ...(lipHold === true ? {} : lipHold) } : null;
  const holdRun = () => {
    if (!LH) return null;
    for (let k = 9; k < fr.length; k++) {
      let top = -Infinity; for (let i = 1; i <= LH.span; i++) top = Math.max(top, fr[k - i].hiRel);
      if (top - fr[k].hiRel < LH.fall) continue;
      const pl = median(fr.slice(k - 9, k - 4).map((f) => f.lvl));
      const ok = (f) => f.lvl - pl >= LH.lo && f.lvl - pl <= -LH.drop && tiltOf(f) <= -murmurTilt;
      let e = k; while (e < fr.length && ok(fr[e])) e++;
      const r = [k, e - 1];
      if (e === k || msOf(r) < LH.minMs) continue;
      const lv = fr.slice(k, k + 6).map((f) => f.lvl);
      if (Math.max(...lv) - Math.min(...lv) > LH.hold) continue;
      if (vowelAgain(r)) continue;
      return r;
    }
    return null;
  };
  const lhold = holdRun();
  // A voice bar read as a murmur (opt-in `barLead: N`): a level-rule run that a stop's closure, burst found,
  // starts inside of within N frames of the run's own start is that closure's voice bar
  const barOf = (r) => barLead !== false && stopRun && stopRun[0] >= r[0] && stopRun[0] <= r[1] && stopRun[0] - r[0] <= barLead;
  // A voiced stop's lead read as a murmur (opt-in `voicedLead: N`, README "A g's voice bar read as a nasal"): on C#4-E4
  // a dark vowel's last frames (/o/'s F1 falling into the closure) and the voice bar's first meet a nasal rule and run
  // up to, or into, the closure readCoda chose for the stop. No Latin coda puts a nasal before a voiced stop (the
  // clusters are -nt, -nc, -ns, -nx, whose stops are voiceless), so a run that ends at most N frames before the chosen
  // closure, or inside it, is that stop's lead when the closure reads voiced (its bar above -40 dB, as below)
  const VL = voicedLead === false ? null : typeof voicedLead === 'number' ? { gap: voicedLead, bar: false } : { gap: 2, bar: true, ...(voicedLead !== true && voicedLead.hold ? { span: VOICED_HOLD_SPAN } : {}), ...(voicedLead === true ? {} : voicedLead) };
  // The hold form (`voicedLead: { hold: true }`, the twenty-second round, README "A voiced closure that holds to its
  // burst"): a closure the ordinary closure rule found counts too when it passes the voice-bar rule's own release
  // test (barRel: a burst that does not run into frication, and the 20 ms before it still voiced, above BB.floor and
  // within BB.hold dB of the run's median). An n-t's closure is silent at its end and an n-s runs into frication; a
  // voiced stop's bar runs up to its burst. And the run dropped must start at most VL.span frames (100 ms) before the
  // closure: a voiced stop's lead (F1 falling, the bar's first frames) started 1-14 frames before it on A-Y, a final
  // nasal held 37-55 frames before a release blip the closure rule took for one
  // The opt-in deep rule's run is never a lead: it fires only on a murmur that runs into frication or a silent closure
  const barHeld = (r) => !!BB && VL.hold && relOf.get(r) >= 0 && barRel(r) >= 0;
  const stopVoiced = (() => {
    if (!VL || !stopRun || (VL.bar && !barRun && !barHeld(stopRun))) return false;
    const rel = relOf.get(stopRun), sg = fr.slice(stopRun[0], stopRun[1] + 1), shut = sg.filter((f) => a + f.t * rate + 0.02 * rate <= rel);
    const inner = shut.length >= 2 ? shut.slice(Math.floor(shut.length / 2)) : shut.length ? shut : sg;
    return median(inner.map((f) => f.loRel)) > -40;
  })();
  const leadOf = (r) => {
    const yes = stopVoiced && r[0] < stopRun[0] && r[1] >= stopRun[0] - VL.gap && (VL.span === undefined || stopRun[0] - r[0] <= VL.span);
    if (yes && trace) (trace.leads = trace.leads || []).push({ before: stopRun[0] - r[0], len: r[1] - r[0] + 1, bar: !!barRun });
    return yes;
  };
  // A release read as a murmur (opt-in `levelFade`; LEVEL_FADE above): a level-rule run that starts within LF.tail
  // frames of the window's last frame is the vowel's release fading into the gap, not a nasal: a sung coda's murmur
  // starts well before the next sound
  const LF = levelFade ? { ...LEVEL_FADE, ...(levelFade === true ? {} : levelFade) } : null;
  const fadeOf = (r) => fr.length - 1 - r[0] <= LF.tail;
  const levelRun = runs(nasal, 30).find((r) => (msOf(r) >= 45 || !next.some((k) => k >= r[1] && k - r[1] <= 3)) && !vowelAgain(r) && murmur(r) && !barOf(r));
  if (trace && levelRun) trace.level = { at: levelRun[0], t: fr[levelRun[0]].t, ms: msOf(levelRun), lv: fr.slice(levelRun[0], Math.min(levelRun[1] + 1, levelRun[0] + 7)).map((f) => +f.lvl.toFixed(1)), toEnd: levelRun[1] === fr.length - 1, left: fr.length - 1 - levelRun[0], endLeft: fr.length - 1 - levelRun[1] };
  const levelKept = levelRun && LF && fadeOf(levelRun) ? null : levelRun;
  const nasRules = [['level', levelKept], ['step', step], ['near', near], ['pre', pre], ['deep', deep], ['shut', shut], ['hold', lhold]]
    .filter(([name, r]) => r && !intoTap(r) && !(name !== 'deep' && leadOf(r)) && !(barRun && r[0] <= barRun[0] && barRun[0] - r[0] <= BB.lead)).sort((p, q) => p[1][0] - q[1][0]);
  const nas = nasRules[0]?.[1];
  const cands = [['closure', stopRun], ['fricative', fric], ['vfricative', vfric], ['nasal', nas], ['tap', tap]]
    .filter(([, r]) => r).sort((p, q) => p[1][0] - q[1][0]);
  if (!cands.length) return { cls: 'none' };
  const [kind, r] = cands[0];
  const seg = fr.slice(r[0], r[1] + 1);
  if (kind === 'closure') {
    // the voice bar is read before the burst: after a final stop the closure runs on into silence
    const rel = relOf.get(r), shut = seg.filter((f) => a + f.t * rate + 0.02 * rate <= rel);
    // read from the closure's later half: on a short closure the first frames' windows still reach back
    // into the vowel, which then reads as a voice bar (a 35 ms k s closure read -39 dB, voiced)
    const inner = shut.length >= 2 ? shut.slice(Math.floor(shut.length / 2)) : shut.length ? shut : seg;
    const bar = median(inner.map((f) => f.loRel)), voiced = bar > -40;
    const b = frameFeatures(x, rel - Math.round(0.001 * rate), rate, 0.01);
    // with no vowel after it a labial burst is plainly low: most of its energy under 1 kHz.
    // A compact velar burst first (opt-in `compactVelar`, README "A g's burst read as a b"): on F#3-A#3 the voice
    // bar's harmonics under 1 kHz run on under a voiced g's burst, so the low test reads it as a b; a burst whose
    // 500 Hz band holds `c` or more of the 1-11 kHz energy, centred at `hz` or above, is velar whatever lies under it
    const cv = compactVelar === true ? COMPACT_VELAR : compactVelar;
    // A p's burst read as a k (`voicelessLow`, default since its registration held on part W; README "A p's burst
    // read as a k"; `voicelessLow: false` is the reader before): sing.mjs's labial burst is
    // noise through a wide band at 500 Hz, and one 8 ms draw of it holds 11-79% of its energy above 1 kHz (median 0.39
    // on K, N, T, U and V), so "most of it under 1 kHz" misses a third of them. With no voice bar under it nothing else
    // sounds low: every voiceless velar and alveolar burst there held 99% or more above 1 kHz. So a burst after a
    // silent closure with `voicelessLow` or less of its energy above 1 kHz is labial; a voiced one keeps the 0.5 test
    const vl = voicelessLow === true ? VOICELESS_LOW : voicelessLow, lowShare = vl && !voiced ? vl : 0.5;
    const place = b.centroid > 3400 ? 'alv' : cv && b.compactAny >= cv.c && b.compactHz >= cv.hz ? 'vel' : b.hi1 < lowShare * b.tot ? 'lab' : b.compactAny > 0.4 && b.compactHz >= 1500 ? 'vel' : 'lab';
    return { cls: 'stop', voiced, place, bar, closureMs: msOf(r), centroid: b.centroid, compact: b.compact, peakHz: b.peakHz, hi1R: b.tot ? b.hi1 / b.tot : 0, compactAny: b.compactAny, compactHz: b.compactHz, relAt: rel / rate };
  }
  if (kind === 'fricative') {
    const cen = seg.reduce((q, f) => q + f.centroid, 0) / seg.length, l = seg.reduce((q, f) => q + f.lvl, 0) / seg.length;
    const voicedUnder = median(seg.map((f) => f.loRel)) > -25;
    const place = voicedUnder ? 'voiced' : l < -20 ? 'f' : cen > 4800 ? 's' : cen > 2200 ? 'S' : 'f';
    return { cls: 'fricative', place, centroid: cen, level: l };
  }
  if (kind === 'vfricative') return { cls: 'fricative', place: 'voiced' };
  if (kind === 'tap') return { cls: 'tap', floor };
  return { cls: 'nasal', rule: nasRules[0][0], at: r[0], ms: msOf(r), stopAt: stopRun ? stopRun[0] : -1 };
}
