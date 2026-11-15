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
// o). F4 and F5 are fixed at typical adult male values. Singers move formants with
// pitch (raising F1 on high notes); this does not, which `eval/vowel-check.md` measures.

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

export const SING_DEFAULTS = { detunes: [-12, -4, 0, 5, 13], vibratoCents: 14, attack: 0.08, release: 0.25, breath: 0.03, glideFrom: 0.6, onsetShare: 0.4, codaShare: 0.35 };

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
  m: { kind: 'nasal', F: [300, 1100, 2300], av: 0.5, len: 0.07, bw: 3 },
  n: { kind: 'nasal', F: [300, 1500, 2500], av: 0.5, len: 0.07, bw: 3 },
  N: { kind: 'nasal', F: [300, 2000, 2800], av: 0.5, len: 0.07, bw: 3 },
  l: { kind: 'lateral', F: [400, 1250, 2700], av: 1.4, len: 0.05 },
  r: { kind: 'tap', F: [450, 1400, 2500], av: 0.08, len: 0.045 },
  j: { kind: 'glide', F: [270, 2290, 3010], av: 1.2, len: 0.04 },
  w: { kind: 'glide', F: [300, 700, 2200], av: 0.75, len: 0.04 },
};
const VOICE_BAR = 0.08; // voicing left in a voiced closure or under a voiced fricative's noise: a low murmur
const VOICED_FRIC = 0.3;
const NASAL_GAIN = 1.2; // the low-passed murmur sits about 5 dB under the vowel on /a/ at D3 (Fujimura 1962: murmurs run 5-10 dB down)
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
    const i0 = Math.round(sg.t0 * rate), i1 = Math.round(sg.t1 * rate);
    if (sg.kind === 'stop' || sg.kind === 'affricate') {
      const ic = Math.round((sg.t0 + sg.closure * sg.k) * rate);
      for (let i = i0; i < ic; i++) av[i] = sg.voiced ? VOICE_BAR : 0;
      const F = obstruentF(sg, V); keys.push([sg.t0, F], [sg.t1, F]);
      if (sg.kind === 'stop') { // the release: a short burst of noise, sharp rise, quick decay
        const [fc0, bw, db] = sg.burst, fc = fc0 ?? Math.min(3200, Math.max(1800, V[1] + 400)); // a velar burst sits just above the vowel's F2
        const n = Math.max(8, i1 - ic), b = noiseSpan(n, fc, bw, refRms * 10 ** (db / 20), rate, rand, (u) => Math.min(1, u * 8) * Math.exp(-4 * u));
        for (let i = 0; i < n && ic + i < total; i++) fr[ic + i] += b[i];
        for (let i = ic; i < i1; i++) av[i] = sg.voiced ? VOICE_BAR : 0;
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
        av[i] = sg.kind === 'tap' ? 1 - (1 - sg.av) * Math.min(1, Math.max(0, 1.6 - Math.abs(u - 0.5) / 0.25)) : sg.av; // a tap: one brief contact
      }
      if (sg.bw) for (let i = i0; i < i1; i++) bwm[i] = sg.bw; // a nasal's damped upper formants (the side branch's losses)
      // and its murmur: the sound leaves by the nose, which passes little above a few hundred hertz,
      // so the source is low-passed in (10 ms ramps); without it /m/ after /u/ was the vowel 4 dB down
      if (sg.kind === 'nasal' && nas) { const r = Math.max(1, Math.round(0.01 * rate)); for (let i = i0; i < i1 && i < total; i++) nas[i] = Math.max(nas[i], Math.min(1, (i - i0) / r, (i1 - i) / r)); }
      keys.push([sg.t0, sg.F], [sg.t1, sg.F]);
    }
}

// Per-sample voicing gain, frication noise and formant targets for a note's onset.
function onsetTracks(onset, dur, total, rate, V, rand, refRms, share, room) {
  const plan = onsetPlan(onset, dur, share, room);
  const av = new Float64Array(total).fill(1), fr = new Float64Array(total), bwm = new Float64Array(total).fill(1);
  const keys = []; // [t, F] formant keypoints before the vowel
  const nas = new Float64Array(total);
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
// own length where `share` of the note (with the formant transition into them) allows, shortened in
// proportion when it does not. Choirs hold the vowel and close it late, so the coda sits at the end.
export function codaPlan(coda, dur, end, share = SING_DEFAULTS.codaShare) {
  const want = onsetLength(coda);
  if (!want) return { segs: [], codaAt: end, scale: 1 };
  const k = Math.min(1, (share * dur) / (want + TRANSITION));
  let t = end - want * k; const codaAt = t, segs = [];
  for (const ph of coda) { const L = phoneLen(ph) * k; segs.push({ ph, ...PHONES[ph], t0: t, t1: t + L, k }); t += L; }
  return { segs, codaAt, scale: k };
}

// Per-sample tracks for a coda (see onsetTracks). The vowel's formants move to the first
// consonant's over the transition before it; after a final obstruent the voices stay silent
// through the release, after a final nasal, l or r they hum on with its formants as they fade.
function codaTracks(coda, dur, end, total, rate, V, rand, refRms, share) {
  const plan = codaPlan(coda, dur, end, share);
  const av = new Float64Array(total).fill(1), fr = new Float64Array(total), bwm = new Float64Array(total).fill(1);
  const keys = [[plan.codaAt - TRANSITION * plan.scale, V]], nas = new Float64Array(total);
  for (const sg of plan.segs) paintSeg(sg, V, rate, total, av, fr, bwm, keys, rand, refRms, nas);
  const first = plan.segs[0], last = plan.segs[plan.segs.length - 1];
  // the voices fade out over 10 ms into an obstruent rather than switching off
  const ramp = Math.round(0.01 * rate), ic = Math.round(first.t0 * rate);
  if (first.F === undefined) for (let i = Math.max(0, ic - ramp); i < ic; i++) av[i] = Math.min(av[i], 1 - (1 - av[ic]) * ((i - (ic - ramp)) / ramp));
  const ie = Math.round(last.t1 * rate);
  const after = last.F === undefined ? 0 : last.kind === 'tap' ? 0.6 : last.av;
  for (let i = ie; i < total; i++) { av[i] = after; if (last.bw) bwm[i] = last.bw; if (last.kind === 'nasal') nas[i] = 1; }
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
      src[i] += (2 * ph - 1) - blep(ph, inc);
    }
  }
  const nv = o.detunes.length;
  for (let i = 0; i < total; i++) src[i] = src[i] / nv + o.breath * rand();
  // formant track: the vowel, gliding to `glide` from glideFrom of the sung length
  const from = FORMANTS[vowel] || FORMANTS.a, to = glide ? FORMANTS[glide] : from;
  const on = onset.length ? onsetTracks(onset, dur, total, rate, from, rng(seed ^ 0x5bd1e995), rawRms(rate), o.onsetShare, room) : null;
  const coda = o.coda || [];
  const cd = coda.length ? codaTracks(coda, dur, lead + dur, total, rate, to, rng(seed ^ 0x27d4eb2f), rawRms(rate), o.codaShare) : null;
  // a diphthong reaches its second vowel by the coda (or the note's end)
  const g0 = Math.round((lead + o.glideFrom * dur) * rate), g1 = Math.max(g0 + 1, Math.round((cd ? cd.plan.codaAt - TRANSITION * cd.plan.scale : lead + dur) * rate));
  const st = new Float64Array(10); // two state values per resonator
  let co = null, lp = 0, lp2 = 0;
  const NASAL_LP = 1 - Math.exp((-2 * Math.PI * 400) / rate); // two one-pole low-passes at 400 Hz
  for (let i = 0; i < total; i++) {
    if ((i & 63) === 0) {
      const u = glide ? Math.min(1, Math.max(0, (i - g0) / Math.max(1, g1 - g0))) : 0;
      const w = u * u * (3 - 2 * u); // smoothstep
      const c = (cd && cd.formantsAt(i / rate)) || (on && on.formantsAt(i / rate));
      const fs = [...(c || from.map((x, k) => x + (to[k] - x) * w)), ...F45];
      const bm = (on ? on.bwm[i] : 1) * (cd ? cd.bwm[i] : 1);
      co = fs.map((fk, k) => reson(fk, BW[k] * (k > 0 ? bm : 1), rate));
    }
    let x = src[i] * (on ? on.av[i] : 1) * (cd ? cd.av[i] : 1);
    const nz = Math.max(on ? on.nas[i] : 0, cd ? cd.nas[i] : 0);
    lp += NASAL_LP * (x - lp); lp2 += NASAL_LP * (lp - lp2);
    if (nz) x = x * (1 - nz) + lp2 * nz * NASAL_GAIN;
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
