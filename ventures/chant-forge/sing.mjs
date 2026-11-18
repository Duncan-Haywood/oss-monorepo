// A men's choir that sings the Latin under each note: opening consonants and vowels (preview only).
//
// The preview choir in render.mjs is an additive pad with a fixed "ah"-like tilt: every
// syllable sounds the same. This module is a small source-filter singing synthesiser:
// a few detuned sawtooth "voices" with their own vibrato and onset (the glottal source,
// roughly -6 dB/octave once lip radiation is counted), a little breath noise, and a
// cascade of five formant resonators (Klatt 1980's cascade branch) set to the vowel of
// the syllable. A diphthong (au, eu, ei, ui) glides to its second vowel over the end of
// the syllable's last note. The syllable's opening consonants (latinOnset) are made on the
// same source and filter: stops as a closure and a burst, fricatives as band-limited noise,
// nasals, l, r and the glides as voiced spans with their own formants (PHONES), sung before
// the beat by render.mjs so the vowel lands on it. Its final consonants (latinCoda) close the
// syllable's last note on the same recipes, as late as they fit, so the vowel is held to them
// (codaPlan). It is not a singer. No dependencies, deterministic (seeded noise).
//
// Formant targets are the men's averages of Peterson & Barney (1952), "Control methods
// used in a study of the vowels", JASA 24(2), Table II: ecclesiastical Latin's five
// vowels taken as /a ɛ i ɔ u/ (the Liber Usualis's pronunciation notes give open e and
// o). F4 and F5 are fixed at typical adult male values. On high notes F1 is raised to at least
// 1.1 x f0 (tuneF1, SING_DEFAULTS.f1Tune), as singers raise it, so a tenor's G4 /i/ is not 16 dB
// under his /a/ (eval/f1-tune-check-report.md).

export const FORMANTS = {
  a: [730, 1090, 2440], // /ɑ/
  e: [530, 1840, 2480], // /ɛ/
  i: [270, 2290, 3010], // /i/
  o: [570, 840, 2410], // /ɔ/
  u: [300, 870, 2240], // /u/
};
const F45 = [3350, 3750];
const BW = [80, 100, 140, 250, 300];

const VOWEL = /[aeiouy]/;

// The sung vowel of one syllable of ecclesiastical Latin: { vowel, glide } (glide is the
// second vowel of a diphthong or null), or null when the syllable has no vowel (a sign,
// an empty lyric). Rules: ae and oe (and æ, œ) are e; y is i; u after q, and u after g
// before a vowel (lin-gua, san-guis), is a consonant; i opening a syllable before a vowel
// is the consonant j (iam, Ie-su, e-ius); au, eu, ei and ui are diphthongs on their first vowel.
function normSyl(syllable) {
  return String(syllable).toLowerCase()
    .replace(/[æǽ]/g, 'ae').replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/y/g, 'i');
}

// the sung vowel and where it starts in the normalised syllable
function readSyl(syllable) {
  if (!syllable) return null;
  const s = normSyl(syllable);
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (!VOWEL.test(c)) continue;
    const next = s[k + 1] || '';
    if (c === 'u' && (s[k - 1] === 'q' || (s[k - 1] === 'g' && VOWEL.test(next)))) continue;
    if (c === 'i' && k === 0 && VOWEL.test(next)) continue;
    const pair = c + next;
    let r;
    if (pair === 'ae' || pair === 'oe') r = { vowel: 'e', glide: null };
    else if (pair === 'au' || pair === 'eu') r = { vowel: c, glide: 'u' };
    else if (pair === 'ei' || pair === 'ui') r = { vowel: c, glide: 'i' };
    else r = { vowel: c, glide: null };
    return { ...r, s, at: k, len: pair === 'ae' || pair === 'oe' || r.glide ? 2 : 1 };
  }
  return null;
}

export function latinVowel(syllable) {
  const r = readSyl(syllable);
  return r && { vowel: r.vowel, glide: r.glide };
}

// The consonants sung before the vowel of one syllable of ecclesiastical Latin, as a list
// of phones (empty when the syllable opens on its vowel). Phones: p b t d k g (stops),
// tS dZ (the c and g of ce, ci, ge, gi: /tʃ/ /dʒ/), f v s z S (S is the sc of sce, sci: /ʃ/),
// m n N (N is gn: /ɲ/), l r (a tap), j w (glides: the i of iam, the u of qu and gu).
// Rules from the Liber Usualis's pronunciation notes: c and g are soft before e, i, y, ae
// and oe, hard elsewhere; ch is k, ph is f, th is t; h is silent; x is ks; qu is kw.
export function latinOnset(syllable) {
  const r = readSyl(syllable);
  if (!r) return [];
  const on = r.s.slice(0, r.at), soft = /[ei]/.test(r.s[r.at]) || /^(ae|oe)/.test(r.s.slice(r.at));
  const out = [];
  for (let k = 0; k < on.length; k++) {
    const c = on[k], nx = on[k + 1] || '', last = k === on.length - 1;
    if (c === 'h') continue;
    if ((c === 'c' || c === 'p' || c === 't') && nx === 'h') { out.push(c === 'p' ? 'f' : c === 'c' ? 'k' : 't'); k++; continue; }
    if (c === 's' && nx === 'c' && k + 1 === on.length - 1 && soft) { out.push('S'); k++; continue; }
    if (c === 'q') { out.push('k'); if (nx === 'u') { out.push('w'); k++; } continue; }
    if (c === 'g' && nx === 'n') { out.push('N'); k++; continue; }
    if (c === 'g' && nx === 'u') { out.push('g', 'w'); k++; continue; }
    if (c === 'c' || c === 'g') { out.push(last && soft ? (c === 'c' ? 'tS' : 'dZ') : (c === 'c' ? 'k' : 'g')); continue; }
    if (c === 'x') { out.push('k', 's'); continue; }
    if (c === 'i' || c === 'j') { out.push('j'); continue; }
    if (c === 'u') { out.push('w'); continue; }
    if ('pbtdkfvszmnlr'.includes(c)) out.push(c);
  }
  return out;
}

// The consonants that close one syllable, sung at the end of its last note: the letters after
// the vowel (or diphthong), or after the last vowel letter when a syllable holds two (tu-ae read as
// one), as phones (latinOnset's names). In a coda c and g are hard (no vowel follows); ch is k,
// ph is f, th is t; h is silent; x is ks. "Dies" ends on s, "Sanc" on n k, "lux" on k s.
export function latinCoda(syllable) {
  const r = readSyl(syllable);
  if (!r) return [];
  let rest = r.s.slice(r.at + r.len);
  const lastV = Math.max(...[...'aeiou'].map((v) => rest.lastIndexOf(v)));
  if (lastV >= 0) rest = rest.slice(lastV + 1);
  const out = [];
  for (let k = 0; k < rest.length; k++) {
    const c = rest[k], nx = rest[k + 1] || '';
    if (c === 'h') continue;
    if ((c === 'c' || c === 'p' || c === 't') && nx === 'h') { out.push(c === 'p' ? 'f' : c === 'c' ? 'k' : 't'); k++; continue; }
    if (c === 'c' || c === 'q') { out.push('k'); continue; }
    if (c === 'x') { out.push('k', 's'); continue; }
    if ('pbtdgfvszmnlr'.includes(c)) out.push(c);
  }
  return out;
}

// Klatt resonator coefficients: y[n] = A x[n] + B y[n-1] + C y[n-2], unity gain at 0 Hz.
function reson(f, bw, rate) {
  const C = -Math.exp((-2 * Math.PI * bw) / rate);
  const B = 2 * Math.exp((-Math.PI * bw) / rate) * Math.cos((2 * Math.PI * f) / rate);
  return [1 - B - C, B, C];
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

// polyBLEP-corrected sawtooth step: removes most of the aliasing of a naive saw
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export const SING_DEFAULTS = { f1Tune: 1.1, detunes: [-12, -4, 0, 5, 13], vibratoCents: 14, attack: 0.08, release: 0.25, breath: 0.03, glideFrom: 0.6, onsetShare: 0.4, codaShare: 0.35 };

// Formant tuning on high notes: a vowel's F1 raised to at least `ratio` times f0 (0: off), so the
// first harmonic is not left above the first resonance. F2 and F3 stay. See tuneF1's note in the README.
export function tuneF1(V, f0, ratio) {
  return ratio > 0 && V[0] < ratio * f0 ? [ratio * f0, V[1], V[2]] : V;
}

// How each consonant is made. A source-filter recipe, not a recording: each phone is a span of
// time with a voicing gain (0 = the voices stop, as in a voiceless closure), a formant target,
// and for obstruents a burst or a stretch of band-limited noise added after the cascade
// (Klatt's parallel branch, simplified to one band per phone). Durations in seconds; noise
// levels in dB against the RMS of a held /a/. Formant targets: the steady formants of a
// sonorant, and for an obstruent where the vowel's formants start, halfway from the place's
// locus to the vowel (Delattre, Liberman and Cooper 1955: F2 loci near 720 Hz for labials and
// 1800 Hz for alveolars; velars have none, so F2 starts near the vowel's own F2 and F3 meets it).
const PLACE = { lab: [250, 800, 2200], alv: [250, 1800, 2700], pal: [250, 2200, 2900] };
export const PHONES = {
  p: { kind: 'stop', voiced: false, place: 'lab', closure: 0.06, burst: [500, 1500, -14], blen: 0.008 },
  b: { kind: 'stop', voiced: true, place: 'lab', closure: 0.05, burst: [500, 1500, -18], blen: 0.008 },
  t: { kind: 'stop', voiced: false, place: 'alv', closure: 0.06, burst: [4500, 3000, -8] },
  d: { kind: 'stop', voiced: true, place: 'alv', closure: 0.05, burst: [4500, 3000, -14] },
  k: { kind: 'stop', voiced: false, place: 'vel', closure: 0.06, burst: [null, 600, -10], blen: 0.02 },
  g: { kind: 'stop', voiced: true, place: 'vel', closure: 0.05, burst: [null, 600, -16], blen: 0.02 },
  tS: { kind: 'affricate', voiced: false, place: 'pal', closure: 0.045, fric: [3000, 1800, -10], len: 0.06 },
  dZ: { kind: 'affricate', voiced: true, place: 'pal', closure: 0.04, fric: [3000, 1800, -16], len: 0.05 },
  f: { kind: 'fricative', voiced: false, place: 'lab', fric: [5000, 7000, -26], len: 0.08 },
  v: { kind: 'fricative', voiced: true, place: 'lab', fric: [5000, 7000, -22], len: 0.06 },
  s: { kind: 'fricative', voiced: false, place: 'alv', fric: [6500, 3000, -12], len: 0.09 },
  z: { kind: 'fricative', voiced: true, place: 'alv', fric: [6500, 3000, -14], len: 0.07 },
  S: { kind: 'fricative', voiced: false, place: 'pal', fric: [3000, 1800, -10], len: 0.09 },
  m: { kind: 'nasal', F: [300, 1100, 2300], av: 0.5, len: 0.07, bw: 3, Z: 1000, place: 'lab' },
  n: { kind: 'nasal', F: [300, 1500, 2500], av: 0.5, len: 0.07, bw: 3, Z: 1800, place: 'alv' },
  N: { kind: 'nasal', F: [300, 2000, 2800], av: 0.5, len: 0.07, bw: 3, Z: 2200, place: 'pal' },
  l: { kind: 'lateral', F: [400, 1250, 2700], av: 1.4, len: 0.05 },
  r: { kind: 'tap', F: [450, 1400, 2500], av: 0.08, len: 0.045 },
  j: { kind: 'glide', F: [270, 2290, 3010], av: 1.2, len: 0.04 },
  w: { kind: 'glide', F: [300, 700, 2200], av: 0.75, len: 0.04 },
};
const VOICE_BAR = 0.08; // voicing left in a voiced closure or under a voiced fricative's noise: a low murmur
const VOICED_FRIC = 0.3;
// The voice bar's level: VOICE_BAR_DB under the vowel beside it, worked out per note (voiceBarGain) as the
// nasal's and the lateral's are. With the fixed VOICE_BAR a voiced closure's murmur passes through its 180 Hz
// F1, so its level against the vowel swung with how near a harmonic fell to 180 Hz: on the sung *sub* of
// eval/coda-check.mjs part L it sat 17 to 38 dB under the /u/ (G2-C#4), and where it was 17-20 dB under,
// the closure was read as nothing (README "A voice bar at one level"). 28 dB is an assumption, the middle of
// where the fixed gain left it on the notes it read right, not fitted to recordings. `voiceBarLevel: false`
// (a singNote option) keeps the fixed gain, to compare.
export const VOICE_BAR_DB = 28;
// Through the walls (2026-11-16, README "A closure against the vowel before it"; tried, off by default): with the mouth shut, the voicing
// of a b, d or g is heard through the cheeks and throat, which pass little above a few hundred hertz, so a
// voice bar is a low band (Stevens 1998, Acoustic Phonetics, ch. 7). Sung through the closure's formants
// alone, its harmonics above 600 Hz came up with the per-note gain on D4-E4, where the fundamental is far
// from the closure's 180 Hz F1, and buried the release burst: on D#4 and E4 *nab*/*gab* the burst stood 9
// dB over the bar above 600 Hz, under the reader's 12. So the bar is also low-passed (the two one-pole 400
// Hz low-passes the nasal murmur uses), and voiceBarGain takes that into account. Tried, not shipped: it
// read 7 more of part N's voiced stops but cost part A and part P, and the openings (consonant-check A 195 to
// 192, B 812 to 808), so it is off by default: `voiceBarWall: true` (a singNote option; `renderMidi(..., {
// voiceBarWall: true })`) turns it on;
// `voiceBarWall: 'coda'` walls the codas' bars only (2026-11-16, README "The wall in codas only").
const WALL_HZ = 400;
function wallPow(hz, rate) {
  const a = 1 - Math.exp((-2 * Math.PI * WALL_HZ) / rate), w = (2 * Math.PI * hz) / rate;
  const one = (a * a) / (1 - 2 * (1 - a) * Math.cos(w) + (1 - a) ** 2);
  return one * one;
}
// The murmur's level: NASAL_DB under the vowel it leaves (or, in an opening, goes to), the middle of
// Fujimura's (1962) 5-10 dB. A fixed gain (the first version's) left it 9 to 27 dB down depending on the
// vowel and the pitch, as the low-pass and the nasal's resonance pass more or less of the harmonics, and
// /m/ after /u/ was at times nothing to hear. So the gain is worked out per note (nasalGain): the
// harmonics' power through the vowel's resonators against their power through the murmur's path.
// Each nasal also has its antiformant, the side branch's zero (Fujimura 1962: /m/ 750-1250 Hz,
// /n/ 1450-2200 Hz; Z in PHONES), which takes out the band just above the murmur that the low-pass leaves.
const NASAL_DB = 7;
// murmurSource 'match': how long the chorus's and the one voice's power are averaged over (one 20 ms frame)
const MATCH_TAU = 0.02;
// Openings now sing the same murmur as codas (2026-11-15, README "Openings on the coda murmur"): its gain
// worked out per note against the vowel it goes to, its antiformant and its broad low resonance. Before,
// an opening nasal kept the first version's murmur (this fixed gain, no antiformant, a vowel-width F1),
// which with one voice and no vibrato sat 6.2 to 16.5 dB under its vowel by vowel and pitch (E2-E4; now
// 7.6-7.8 dB after every vowel at every pitch). `onsetMurmur:
// 'first'` (a singNote option) brings it back, to compare.
const ONSET_NASAL_GAIN = 1.2;
const NASAL_ZBW = 200;
// The murmur's low resonance is broad (Fujimura 1962 measured nasal-murmur bandwidths of 100-300 Hz and
// more), not a vowel F1's 80 Hz: with 80 Hz the murmur's level swung 18 dB with pitch as harmonics hit
// or missed it. 3.5 x 80 = 280 Hz.
const NASAL_BW1 = 3.5;
// A final /l/'s voicing, set per note (lateralGain) so its steady part sits LATERAL_DB under the vowel it
// leaves. With PHONES.l's fixed 1.4 it sat -3 to +8 dB against the vowel, loudest after /e/, /i/ and /u/,
// whose energy the /l/'s F1 of 400 Hz and F2 of 1250 Hz pass better than their own resonances do: a swell
// on every final -l. 4 dB is an assumption, not fitted to recordings: a liquid is quieter than a vowel and
// louder than a nasal (NASAL_DB 7). An opening /l/ is set the same way against the vowel it goes to
// (2026-11-15, README "An opening /l/ at its vowel's level"; eval/onset-lateral-check.md): with the fixed
// 1.4 it sat 7.7 dB under to 6.3 dB over that vowel by vowel and pitch. `onsetLateral: 'first'` keeps the
// fixed gain on openings only; `lateralLevel: false` (a singNote option) keeps it on both, to compare.
// README "Final consonants, sixth round"; eval/lateral-level-check.md.
export const LATERAL_DB = 4;
const TRANSITION = 0.045; // formants move from the consonant to the vowel over this long

function phoneLen(ph) { const c = PHONES[ph]; return (c.closure || 0) + (c.len || 0) + (c.burst ? c.blen || 0.012 : 0); }

// Where an obstruent's formants start before the vowel `V` ([F1, F2, F3]).
function obstruentF(c, V) {
  // F1 sits lower (180 Hz) through a stop's closure, so the voice bar of b, d, g stays a low murmur
  const f1 = c.kind === 'stop' || c.kind === 'affricate' ? 180 : 250;
  if (c.place === 'vel') return [f1, V[1], Math.max(V[1] + 200, V[2] - 400)];
  const L = Object.hasOwn(PLACE, c.place) ? PLACE[c.place] : PLACE.alv;
  return [f1, (L[1] + V[1]) / 2, (L[2] + V[2]) / 2];
}

// Lay the onset out in time: [{ ph, t0, t1, ...recipe }] in seconds from the note start, and
// the time the vowel starts. `room`: the seconds it may take (shortened in proportion to fit);
// by default `share` of the note, the formant transition included.
export const onsetLength = (onset) => onset.reduce((a, ph) => a + phoneLen(ph), 0);
export function onsetPlan(onset, dur, share = SING_DEFAULTS.onsetShare, room = null) {
  const want = onsetLength(onset);
  if (!want) return { segs: [], vowelAt: 0, scale: 1 };
  const k = Math.min(1, room !== null ? room / want : (share * dur) / (want + TRANSITION));
  let t = 0; const segs = [];
  for (const ph of onset) { const L = phoneLen(ph) * k; segs.push({ ph, ...PHONES[ph], t0: t, t1: t + L, k }); t += L; }
  return { segs, vowelAt: t, scale: k };
}

// RBJ band-pass (0 dB peak), run over `x` in place
function bandpass(x, fc, bw, rate) {
  fc = Math.min(fc, rate * 0.45);
  const w0 = (2 * Math.PI * fc) / rate, q = fc / bw, al = Math.sin(w0) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
  return x;
}

// noise of RMS `rms` in the band, shaped by env(t in 0..1)
function noiseSpan(n, fc, bw, rms, rate, rand, env) {
  const pad = Math.round(0.01 * rate), x = new Float64Array(n + pad);
  for (let i = 0; i < x.length; i++) x[i] = rand();
  bandpass(x, fc, bw, rate); bandpass(x, fc, bw, rate); // fourth order: a burst's band stands out as it does in speech
  const y = x.subarray(pad);
  let s = 0; for (let i = 0; i < n; i++) s += y[i] * y[i];
  const g = s > 0 ? rms / Math.sqrt(s / n) : 0;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] * g * env(i / Math.max(1, n - 1));
  return out;
}

const edge = (u, a) => Math.min(1, u / a, (1 - u) / a); // linear ramps at both ends, a = share of the span

// Paint one consonant span into the voicing gain `av`, the noise `fr`, the bandwidth scale `bwm`
// and the formant keypoints `keys`, against the vowel `V` beside it.
function paintSeg(sg, V, rate, total, av, fr, bwm, keys, rand, refRms, nas) {
    const wall = nas.wall;
    const i0 = Math.round(sg.t0 * rate), i1 = Math.round(sg.t1 * rate);
    if (sg.kind === 'stop' || sg.kind === 'affricate') {
      const ic = Math.round((sg.t0 + sg.closure * sg.k) * rate);
      for (let i = i0; i < ic; i++) av[i] = sg.voiced ? sg.vb ?? VOICE_BAR : 0;
      if (sg.voiced && sg.wall) for (let i = i0; i < Math.min(total, sg.kind === 'stop' ? i1 : ic); i++) wall[i] = 1;
      const F = obstruentF(sg, V); keys.push([sg.t0, F], [sg.t1, F]);
      if (sg.kind === 'stop') { // the release: a short burst of noise, sharp rise, quick decay
        const [fc0, bw, db] = sg.burst, fc = fc0 ?? Math.min(3200, Math.max(1800, V[1] + 400)); // a velar burst sits just above the vowel's F2
        const n = Math.max(8, i1 - ic), b = noiseSpan(n, fc, bw, refRms * 10 ** (db / 20), rate, rand, (u) => Math.min(1, u * 8) * Math.exp(-4 * u));
        for (let i = 0; i < n && ic + i < total; i++) fr[ic + i] += b[i];
        for (let i = ic; i < i1; i++) av[i] = sg.voiced ? sg.vb ?? VOICE_BAR : 0;
      } else { // the affricate's release is its fricative
        const [fc, bw, db] = sg.fric, n = Math.max(8, i1 - ic);
        const b = noiseSpan(n, fc, bw, refRms * 10 ** (db / 20), rate, rand, (u) => Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.25));
        for (let i = 0; i < n && ic + i < total; i++) fr[ic + i] += b[i];
        for (let i = ic; i < i1; i++) av[i] = sg.voiced ? VOICED_FRIC : 0;
      }
    } else if (sg.kind === 'fricative') {
      const [fc, bw, db] = sg.fric, n = Math.max(8, i1 - i0);
      const b = noiseSpan(n, fc, bw, refRms * 10 ** (db / 20), rate, rand, (u) => edge(u, 0.2));
      for (let i = 0; i < n && i0 + i < total; i++) fr[i0 + i] += b[i];
      for (let i = i0; i < i1; i++) av[i] = sg.voiced ? VOICED_FRIC : 0;
      const F = obstruentF(sg, V); keys.push([sg.t0, F], [sg.t1, F]);
    } else { // sonorants: the voices go on, quieter, with the consonant's own formants
      for (let i = i0; i < i1; i++) {
        const u = (i - i0) / Math.max(1, i1 - i0);
        // a tap: one brief contact, in the middle of the phone or, for a final r with its voiced tail (codaPlan),
        // centred at sg.at over the sg.cw of the phone it takes
        av[i] = sg.kind === 'tap' ? 1 - (1 - sg.av) * Math.min(1, Math.max(0, 1.6 - Math.abs(u - (sg.at ?? 0.5)) / (0.25 * (sg.cw ?? 1)))) : sg.av;
      }
      if (sg.bw) for (let i = i0; i < i1; i++) bwm[i] = sg.bw; // a nasal's damped upper formants (the side branch's losses)
      // and its murmur: the sound leaves by the nose, which passes little above a few hundred hertz,
      // so the source is low-passed in (10 ms ramps); without it /m/ after /u/ was the vowel 4 dB down
      if (sg.kind === 'nasal' && nas) { const r = Math.max(1, Math.round(0.01 * rate)); for (let i = i0; i < i1 && i < total; i++) { nas[i] = Math.max(nas[i], Math.min(1, (i - i0) / r, (i1 - i) / r)); nas.z[i] = sg.Z; } }
      keys.push([sg.t0, sg.F], [sg.t1, sg.F]);
    }
}

// a nasal's per-sample weight (0..1) and its antiformant's frequency (nas.z)
// and nas.wall: 1 where a voiced closure's bar is heard through the walls of the shut tract (WALL_LP)
function nasTrack(total) { const t = new Float64Array(total); t.z = new Float64Array(total); t.wall = new Float64Array(total); return t; }

// Per-sample voicing gain, frication noise and formant targets for a note's onset.
function onsetTracks(onset, dur, total, rate, V, rand, refRms, share, room, latAv = null, barAv = null, wallOn = false) {
  const plan = onsetPlan(onset, dur, share, room);
  if (latAv) for (const sg of plan.segs) if (sg.kind === 'lateral') sg.av = latAv(sg);
  if (barAv) for (const sg of plan.segs) if ((sg.kind === 'stop' || sg.kind === 'affricate') && sg.voiced) { sg.vb = barAv(sg); sg.wall = wallOn; }
  const av = new Float64Array(total).fill(1), fr = new Float64Array(total), bwm = new Float64Array(total).fill(1);
  const keys = []; // [t, F] formant keypoints before the vowel
  const nas = nasTrack(total);
  for (const sg of plan.segs) paintSeg(sg, V, rate, total, av, fr, bwm, keys, rand, refRms, nas);
  // voicing ramps back in over 10 ms after an obstruent instead of switching on
  const ramp = Math.round(0.01 * rate), iv = Math.round(plan.vowelAt * rate);
  for (let i = iv; i < Math.min(total, iv + ramp); i++) av[i] = Math.min(av[i], av[iv - 1 >= 0 ? iv - 1 : 0] + (1 - av[iv - 1 >= 0 ? iv - 1 : 0]) * ((i - iv) / ramp));
  if (keys.length) keys.push([plan.vowelAt + TRANSITION * plan.scale, V]);
  const formantsAt = (t) => {
    if (!keys.length || t >= keys[keys.length - 1][0]) return null;
    let j = 0; while (j < keys.length - 1 && keys[j + 1][0] <= t) j++;
    const [ta, Fa] = keys[j], [tb, Fb] = keys[Math.min(j + 1, keys.length - 1)];
    const u = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
    return Fa.map((x, q) => x + (Fb[q] - x) * u);
  };
  return { av, fr, bwm, nas, formantsAt, plan };
}

// Lay a coda out in time, ending at `end` (seconds from the wave's start): the consonants take their
// own length where `share` of the note (with the formant transition into them) allows, shortened when
// it does not. Choirs hold the vowel and close it late, so the coda sits at the end. Shortening keeps
// each phone above a floor a listener needs (CODA_FLOOR: a 45 ms closure and a 10 ms burst, 35 ms of
// frication, 40 ms of murmur): what is cut is each phone's length above its floor, in proportion. When
// the floors need more than `share` (a cluster such as the k s of "lux" on a short note), the coda takes
// up to CLUSTER_SHARE of the note; only past that is everything shortened in proportion.
export const CODA_FLOOR = { closure: 0.045, burst: 0.01, fricative: 0.035, nasal: 0.06, other: 0.03 };
const CLUSTER_SHARE = 0.5;
// A final r is its contact and then the voice open again for a moment, [floor, full] seconds each: sung on
// the note's last 45 ms, as an opening's tap is, its contact sat 15-25 ms from the next sound, with no
// voice after it inside the note to tell a tap from the sound simply stopping (README "Final consonants,
// fifth round"). The tail's length is an assumption, not fitted to recordings of singers.
export const CODA_TAP = { contact: [0.04, 0.045], tail: [0.03, 0.035] };
function phoneParts(ph, last = false) { // [floor, full] for each part of a phone: a stop or affricate has a closure and a release
  const c = PHONES[ph], F = CODA_FLOOR;
  if (c.kind === 'tap' && last) return [CODA_TAP.contact, CODA_TAP.tail];
  if (c.kind === 'stop') return [[F.closure, c.closure], [F.burst, c.blen || 0.012]];
  if (c.kind === 'affricate') return [[F.closure, c.closure], [F.fricative, c.len]];
  const full = c.len || 0, fl = c.kind === 'fricative' ? F.fricative : c.kind === 'nasal' ? F.nasal : F.other;
  return [[Math.min(fl, full), full]];
}
export function codaPlan(coda, dur, end, share = SING_DEFAULTS.codaShare) {
  const want = coda.reduce((a, ph, j) => a + phoneParts(ph, j === coda.length - 1).reduce((q, [, full]) => q + full, 0), 0);
  if (!want) return { segs: [], codaAt: end, scale: 1 };
  const parts = coda.map((ph, j) => phoneParts(ph, j === coda.length - 1)), floors = parts.flat().reduce((a, [f]) => a + f, 0);
  const room = (sh) => Math.min(want, (sh * dur * want) / (want + TRANSITION));
  let T = room(share);
  if (T < floors) T = Math.min(floors, room(Math.max(share, CLUSTER_SHARE)));
  // u: the share of each part's length above its floor that is kept; below the floors, all scale by v
  const u = want > floors ? Math.max(0, Math.min(1, (T - floors) / (want - floors))) : 1, v = Math.min(1, T / floors);
  const len = ([f, full]) => (T >= floors ? f + (full - f) * u : f * v);
  let t = end - T; const codaAt = t, segs = [];
  coda.forEach((ph, j) => {
    const ls = parts[j].map(len), L = ls.reduce((a, b) => a + b, 0), c = PHONES[ph];
    // paintSeg ends a closure at closure * k: k is set so it ends where this plan puts it
    const tail = c.kind === 'tap' && ls.length > 1 ? { at: ls[0] / 2 / L, cw: ls[0] / L } : {};
    segs.push({ ph, ...c, ...tail, t0: t, t1: t + L, k: c.closure ? ls[0] / c.closure : L / Math.max(1e-9, phoneLen(ph)) });
    t += L;
  });
  return { segs, codaAt, scale: T / want };
}

// Per-sample tracks for a coda (see onsetTracks). The vowel's formants move to the first
// consonant's over the transition before it; after a final obstruent the voices stay silent
// through the release, after a final nasal, l or r they hum on with its formants as they fade.
function codaTracks(coda, dur, end, total, rate, V, rand, refRms, share, latAv = null, barAv = null, wallOn = false) {
  const plan = codaPlan(coda, dur, end, share);
  if (latAv) for (const sg of plan.segs) if (sg.kind === 'lateral') sg.av = latAv(sg);
  if (barAv) for (const sg of plan.segs) if ((sg.kind === 'stop' || sg.kind === 'affricate') && sg.voiced) { sg.vb = barAv(sg); sg.wall = wallOn; }
  const av = new Float64Array(total).fill(1), fr = new Float64Array(total), bwm = new Float64Array(total).fill(1);
  const keys = [[plan.codaAt - TRANSITION * plan.scale, V]], nas = nasTrack(total);
  for (const sg of plan.segs) paintSeg(sg, V, rate, total, av, fr, bwm, keys, rand, refRms, nas);
  const first = plan.segs[0], last = plan.segs[plan.segs.length - 1];
  // into a nasal the vowel's formants move toward the place's locus while the mouth closes, as into a
  // stop, and the murmur's own resonances start at the closure: moving them to the murmur's F2 instead
  // made /u/ brighter (F2 870 to 1100 Hz, +14 dB above 1 kHz) just before an /m/
  if (first.kind === 'nasal') keys.splice(1, 0, [first.t0 - 0.002, obstruentF(first, V)]);
  // the voices fade out over 10 ms into an obstruent rather than switching off
  const ramp = Math.round(0.01 * rate), ic = Math.round(first.t0 * rate);
  if (first.F === undefined) for (let i = Math.max(0, ic - ramp); i < ic; i++) av[i] = Math.min(av[i], 1 - (1 - av[ic]) * ((i - (ic - ramp)) / ramp));
  const ie = Math.round(last.t1 * rate);
  const after = last.F === undefined ? 0 : last.kind === 'tap' ? 0.6 : last.av;
  // a final nasal hums on through the nose: its murmur's 10 ms ramp-out (paintSeg) is held at 1, or the
  // low-pass and antiformant lifted for 10 ms between murmur and hum, a blip of bare vowel (+12-19 dB above
  // 1 kHz, 45 ms into every final -m and -n; README "Final consonants, third round")
  const i0h = last.kind === 'nasal' ? Math.max(0, ie - Math.round(0.01 * rate)) : ie;
  for (let i = i0h; i < ie && i < total; i++) { nas[i] = 1; nas.z[i] = last.Z; }
  for (let i = ie; i < total; i++) { av[i] = after; if (last.bw) bwm[i] = last.bw; if (last.kind === 'nasal') { nas[i] = 1; nas.z[i] = last.Z; } }
  const formantsAt = (t) => {
    if (t < keys[0][0]) return null;
    if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    let j = 0; while (j < keys.length - 1 && keys[j + 1][0] <= t) j++;
    const [ta, Fa] = keys[j], [tb, Fb] = keys[j + 1];
    const u = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
    return Fa.map((x, q) => x + (Fb[q] - x) * u);
  };
  return { av, fr, bwm, nas, formantsAt, plan };
}

function rawSing(f, dur, rate, vowel, glide, opts, seed) {
  const o = { ...SING_DEFAULTS, ...opts };
  const onset = o.onset || [];
  // lead: seconds of consonant sung before the note's beat (the wave starts that early); onsetLen:
  // how long the whole consonant takes from the wave's start (default: fitted into the note)
  const lead = onset.length ? o.lead || 0 : 0, room = onset.length && o.onsetLen != null ? o.onsetLen : null;
  const total = Math.round((lead + dur + o.release) * rate);
  const out = new Float64Array(total);
  const rand = rng(seed);
  const src = new Float64Array(total);
  // o.murmurSource 'one': the murmur (and a nasal's hum) is taken from one voice, not the beating chorus (src1).
  // 'match' (2026-11-18, README "One voice at the chorus's level"; eval/murmur-one-diag.mjs): the same voice, its
  // level matched to the chorus's low-passed source just before a coda's murmur starts. On a short low note the
  // five voices barely drift in phase, so the chorus's power is frozen for the note anywhere from near zero to
  // five times its average, while 'one' sits at the average: on part D's D3 eighth notes the one-voice murmur
  // came out 4 dB under to 11 dB over the chorus's, and the four nasals it lost were the +7 to +11 dB ones.
  const match = o.murmurSource === 'match', one = o.murmurSource === 'one' || match, src1 = one ? new Float64Array(total) : null;
  let vi = 0;
  for (const dt of o.detunes) {
    const ff = f * 2 ** (dt / 1200);
    const vr = 4.8 + 1.2 * (rand() * 0.5 + 0.5); // vibrato rate 4.8-6.0 Hz per voice
    const vp = Math.PI * (rand() + 1);
    const onsetN = Math.round(0.02 * (rand() * 0.5 + 0.5) * rate); // voices start up to 20 ms apart
    let ph = rand() * 0.5 + 0.5, drift = 0;
    for (let i = onsetN; i < total; i++) {
      const t = (i - onsetN) / rate;
      if ((i & 255) === 0) drift = 0.97 * drift + 0.03 * rand(); // slow pitch wander
      const depth = Math.min(1, t / 0.35) * o.vibratoCents + 3 * drift;
      const inc = (ff * 2 ** ((depth * Math.sin(2 * Math.PI * vr * t + vp)) / 1200)) / rate;
      ph += inc; if (ph >= 1) ph -= 1;
      const v = (2 * ph - 1) - blep(ph, inc);
      src[i] += v; if (one && vi === 0) src1[i] = v;
    }
    vi++;
  }
  const nv = o.detunes.length;
  for (let i = 0; i < total; i++) { const b = o.breath * rand(); src[i] = src[i] / nv + b; if (one) src1[i] = src1[i] / Math.sqrt(nv) + b; } // one voice at the chorus's average (incoherent) power: at its coherent level (no division) part B's nasals fell 37 to 15 of 39
  // formant track: the vowel, gliding to `glide` from glideFrom of the sung length
  const from = tuneF1(FORMANTS[vowel] || FORMANTS.a, f, o.f1Tune), to = glide ? tuneF1(FORMANTS[glide], f, o.f1Tune) : from;
  const on = onset.length ? onsetTracks(onset, dur, total, rate, from, rng(seed ^ 0x5bd1e995), rawRms(rate), o.onsetShare, room, o.lateralLevel === false || o.onsetLateral === 'first' ? null : (c) => lateralGain(f, rate, from, c), o.voiceBarLevel === false ? null : (c) => voiceBarGain(f, rate, from, c, VOICE_BAR_DB, o.voiceBarWall === true), o.voiceBarWall === true) : null;
  const coda = o.coda || [];
  // `voiceBarWall: 'coda'` walls a closing b, d or g only, so the openings are sung as before (README "The wall in codas only")
  const codaWall = o.voiceBarWall === true || o.voiceBarWall === 'coda';
  const cd = coda.length ? codaTracks(coda, dur, lead + dur, total, rate, to, rng(seed ^ 0x27d4eb2f), rawRms(rate), o.codaShare, o.lateralLevel === false ? null : (c) => lateralGain(f, rate, to, c), o.voiceBarLevel === false ? null : (c) => voiceBarGain(f, rate, to, c, VOICE_BAR_DB, codaWall), codaWall) : null;
  // a diphthong reaches its second vowel by the coda (or the note's end)
  const g0 = Math.round((lead + o.glideFrom * dur) * rate), g1 = Math.max(g0 + 1, Math.round((cd ? cd.plan.codaAt - TRANSITION * cd.plan.scale : lead + dur) * rate));
  const st = new Float64Array(10); // two state values per resonator
  let co = null, lp = 0, lp2 = 0, lpm = 0, lpm2 = 0, az = null, zx1 = 0, zx2 = 0;
  // 'match': the chorus's and the one voice's low-passed power, smoothed over MATCH_TAU; the gain between them
  // follows until a coda's murmur starts and is held from there (an opening's murmur follows throughout)
  const MK = 1 - Math.exp(-1 / (MATCH_TAU * rate));
  let pc = 0, po = 0, mg = 1;
  // the murmur's gain against the vowel it leaves (or, in an opening, the one it goes to)
  const onCoda = o.onsetMurmur !== 'first'; // an opening nasal sings the coda's murmur
  const gains = new Map(), gainOf = (z, V, side) => { // per nasal (its zero) and vowel (the one it leaves or goes to)
    const key = `${z}:${side}`;
    if (!gains.has(key)) { const c = Object.values(PHONES).find((q) => q.Z === z); gains.set(key, nasalGain(f, rate, V, c)); }
    return gains.get(key);
  };
  const NASAL_LP = 1 - Math.exp((-2 * Math.PI * 400) / rate); // two one-pole low-passes at 400 Hz
  for (let i = 0; i < total; i++) {
    if ((i & 63) === 0) {
      const u = glide ? Math.min(1, Math.max(0, (i - g0) / Math.max(1, g1 - g0))) : 0;
      const w = u * u * (3 - 2 * u); // smoothstep
      const c = (cd && cd.formantsAt(i / rate)) || (on && on.formantsAt(i / rate));
      const fs = [...(c || from.map((x, k) => x + (to[k] - x) * w)), ...F45];
      const bm = (on ? on.bwm[i] : 1) * (cd ? cd.bwm[i] : 1);
      const b1 = 1 + (NASAL_BW1 - 1) * Math.max(cd ? cd.nas[i] : 0, on && onCoda ? on.nas[i] : 0); // a nasal's broad low resonance
      co = fs.map((fk, k) => reson(fk, BW[k] * (k > 0 ? bm : b1), rate));
    }
    const avi = (on ? on.av[i] : 1) * (cd ? cd.av[i] : 1);
    let x = src[i] * avi;
    const nOn = on ? on.nas[i] : 0, nCd = cd ? cd.nas[i] : 0, nz = Math.max(nOn, nCd);
    lp += NASAL_LP * (x - lp); lp2 += NASAL_LP * (lp - lp2);
    if (one) { lpm += NASAL_LP * (src1[i] * avi - lpm); lpm2 += NASAL_LP * (lpm - lpm2); }
    if (match) {
      if (!(cd && cd.nas[i] > 0)) { pc += MK * (lp2 * lp2 - pc); po += MK * (lpm2 * lpm2 - po); if (po > 1e-12) mg = Math.sqrt(pc / po); }
    }
    const mm = one ? (match ? lpm2 * mg : lpm2) : lp2; // the murmur's source, low-passed
    // the antiformant: an inverse resonator (Klatt's antiresonator, unity gain at 0 Hz) on the murmur
    const zf = nCd >= nOn ? cd && cd.nas.z[i] : onCoda && on.nas.z[i];
    if (zf && (!az || az.f !== zf)) { const [A, B, C] = reson(zf, NASAL_ZBW, rate); az = { f: zf, a: 1 / A, b: -B / A, c: -C / A }; }
    const zy = az ? az.a * mm + az.b * zx1 + az.c * zx2 : mm; zx2 = zx1; zx1 = mm;
    // a voiced closure's bar through the shut tract's walls: the same two low-passes, taken in place of x
    const wl = Math.max(on ? on.nas.wall[i] : 0, cd ? cd.nas.wall[i] : 0);
    if (wl && !nz) x = x * (1 - wl) + lp2 * wl;
    if (nz) x = nCd >= nOn ? x * (1 - nz) + zy * nz * gainOf(zf, to, 'cd') : onCoda ? x * (1 - nz) + zy * nz * gainOf(zf, from, 'on') : x * (1 - nz) + mm * nz * ONSET_NASAL_GAIN;
    for (let k = 0; k < 5; k++) {
      const [A, B, C] = co[k];
      const y = A * x + B * st[2 * k] + C * st[2 * k + 1];
      st[2 * k + 1] = st[2 * k]; st[2 * k] = y; x = y;
    }
    out[i] = x + (on ? on.fr[i] : 0) + (cd ? cd.fr[i] : 0);
  }
  // with a consonant first, it shapes the start itself: the voices still take 30 ms to swell
  const aN = Math.max(1, Math.round((on ? Math.min(o.attack, 0.03) : o.attack) * rate)), dN = Math.round((lead + dur) * rate), rN = Math.max(1, Math.round(o.release * rate));
  for (let i = 0; i < total; i++) {
    let env = on && on.fr[i] !== 0 && i < Math.round(on.plan.vowelAt * rate) ? 1 : Math.min(1, i / aN);
    if (i > dN) env *= Math.max(0, 1 - (i - dN) / rN);
    out[i] *= env;
  }
  return out;
}

// One level for the whole choir: the RMS of a held /a/ on D3 set to `level`, so vowels keep
// their natural differences (/i/ and /u/ are quieter than /a/, as sung) and the voice sits in
// the mix where render.mjs's pad did.
const rmsCache = new Map();
function rawRms(rate) {
  if (!rmsCache.has(rate)) {
    const w = rawSing(146.83, 1, rate, 'a', null, {}, 7);
    let s = 0; const a = Math.round(0.3 * rate), z = Math.round(0.9 * rate);
    for (let i = a; i < z; i++) s += w[i] * w[i];
    rmsCache.set(rate, Math.sqrt(s / (z - a)));
  }
  return rmsCache.get(rate);
}
const scaleFor = (rate, level) => level / rawRms(rate);
// |H(e^jw)|^2 of a Klatt resonator at frequency hz
function resonPow(hz, f, bw, rate) {
  const [A, B, C] = reson(f, bw, rate), w = (2 * Math.PI * hz) / rate;
  const re = 1 - B * Math.cos(w) - C * Math.cos(2 * w), im = B * Math.sin(w) + C * Math.sin(2 * w);
  return (A * A) / (re * re + im * im);
}
// The murmur path's gain that puts a nasal NASAL_DB under the vowel V ([F1, F2, F3]) on f0: the power of
// the sawtooth's harmonics (amplitude 1/h, up to 5 kHz) through the vowel's five resonators, against their
// power through the murmur's path (voicing c.av, the two 400 Hz low-passes, the antiformant, and the
// nasal's own resonators with their wider bandwidths). Steady state; vibrato and detuning ignored.
function nasalGain(f0, rate, V, c) {
  const a = 1 - Math.exp((-2 * Math.PI * 400) / rate);
  const vf = [...V, ...F45], nf = [...c.F, ...F45];
  let pv = 0, pm = 0;
  for (let h = 1; h * f0 < 5000; h++) {
    const hz = h * f0, w = (2 * Math.PI * hz) / rate, amp = 1 / (h * h);
    let gv = amp, gm = amp * c.av * c.av;
    for (let k = 0; k < 5; k++) { gv *= resonPow(hz, vf[k], BW[k], rate); gm *= resonPow(hz, nf[k], BW[k] * (k > 0 ? c.bw || 1 : NASAL_BW1), rate); }
    const lp = (a * a) / (1 - 2 * (1 - a) * Math.cos(w) + (1 - a) * (1 - a)); // one pole, squared magnitude
    gm *= lp * lp / resonPow(hz, c.Z, NASAL_ZBW, rate);
    pv += gv; pm += gm;
  }
  return pm > 0 ? 10 ** (-NASAL_DB / 20) * Math.sqrt(pv / pm) : 0;
}

// The voicing gain that puts a lateral c LATERAL_DB under the vowel V on f0: as nasalGain, the harmonics'
// power through the vowel's five resonators against their power through the lateral's (no low-pass, no
// zero: the /l/ sounds through the mouth, round the tongue). Steady state; vibrato and detuning ignored.
function lateralGain(f0, rate, V, c) {
  const vf = [...V, ...F45], lf = [...c.F, ...F45];
  let pv = 0, pl = 0;
  for (let h = 1; h * f0 < 5000; h++) {
    const hz = h * f0; let gv = 1 / (h * h), gl = gv;
    for (let k = 0; k < 5; k++) { gv *= resonPow(hz, vf[k], BW[k], rate); gl *= resonPow(hz, lf[k], BW[k], rate); }
    pv += gv; pl += gl;
  }
  return pl > 0 ? 10 ** (-LATERAL_DB / 20) * Math.sqrt(pv / pl) : c.av;
}

// The voicing gain that puts a voiced closure's bar VOICE_BAR_DB under the vowel V on f0: as lateralGain,
// the harmonics' power through the vowel's five resonators against their power through the closure's
// (obstruentF: F1 at 180 Hz). Steady state; vibrato and detuning ignored. `db` for the checks.
export function voiceBarGain(f0, rate, V, c, db = VOICE_BAR_DB, wall = false) {
  const vf = [...V, ...F45], bf = [...obstruentF(c, V), ...F45];
  let pv = 0, pb = 0;
  for (let h = 1; h * f0 < 5000; h++) {
    const hz = h * f0; let gv = 1 / (h * h), gb = gv * (wall ? wallPow(hz, rate) : 1);
    for (let k = 0; k < 5; k++) { gv *= resonPow(hz, vf[k], BW[k], rate); gb *= resonPow(hz, bf[k], BW[k], rate); }
    pv += gv; pb += gb;
  }
  return pb > 0 ? 10 ** (-db / 20) * Math.sqrt(pv / pb) : VOICE_BAR;
}

// f: Hz; dur: s; returns Float64Array of lead + dur + release seconds. `onset`: the syllable's
// consonants (latinOnset), sung before the vowel: by default inside the note, or with `lead`
// (seconds) and `onsetLen` (seconds) starting `lead` before the beat and taking `onsetLen` in all,
// so the vowel lands `onsetLen - lead` after the beat. `coda`: the syllable's final consonants
// (latinCoda), sung at the end of the note (codaPlan) so they finish as it does.
export function singNote(f, dur, rate, { vowel = 'a', glide = null, level = 0.25, seed = 1, ...opts } = {}) {
  const w = rawSing(f, dur, rate, vowel, glide, opts, seed);
  const k = scaleFor(rate, level);
  for (let i = 0; i < w.length; i++) w[i] *= k;
  return w;
}
