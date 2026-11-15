// A men's choir that sings the vowels of the Latin under each note (preview only).
//
// The preview choir in render.mjs is an additive pad with a fixed "ah"-like tilt: every
// syllable sounds the same. This module is a small source-filter singing synthesiser:
// a few detuned sawtooth "voices" with their own vibrato and onset (the glottal source,
// roughly -6 dB/octave once lip radiation is counted), a little breath noise, and a
// cascade of five formant resonators (Klatt 1980's cascade branch) set to the vowel of
// the syllable. A diphthong (au, eu, ei, ui) glides to its second vowel over the end of
// the syllable's last note. Consonants are not synthesised: it is a vocalise on the
// right vowels, not a singer. No dependencies, deterministic (seeded noise).
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
export function latinVowel(syllable) {
  if (!syllable) return null;
  const s = String(syllable).toLowerCase()
    .replace(/[æǽ]/g, 'ae').replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/y/g, 'i');
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (!VOWEL.test(c)) continue;
    const next = s[k + 1] || '';
    if (c === 'u' && (s[k - 1] === 'q' || (s[k - 1] === 'g' && VOWEL.test(next)))) continue;
    if (c === 'i' && k === 0 && VOWEL.test(next)) continue;
    const pair = c + next;
    if (pair === 'ae' || pair === 'oe') return { vowel: 'e', glide: null };
    if (pair === 'au' || pair === 'eu') return { vowel: c, glide: 'u' };
    if (pair === 'ei' || pair === 'ui') return { vowel: c, glide: 'i' };
    return { vowel: c, glide: null };
  }
  return null;
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

export const SING_DEFAULTS = { detunes: [-12, -4, 0, 5, 13], vibratoCents: 14, attack: 0.08, release: 0.25, breath: 0.03, glideFrom: 0.6 };

function rawSing(f, dur, rate, vowel, glide, opts, seed) {
  const o = { ...SING_DEFAULTS, ...opts };
  const total = Math.round((dur + o.release) * rate);
  const out = new Float64Array(total);
  const rand = rng(seed);
  const src = new Float64Array(total);
  for (const dt of o.detunes) {
    const ff = f * 2 ** (dt / 1200);
    const vr = 4.8 + 1.2 * (rand() * 0.5 + 0.5); // vibrato rate 4.8-6.0 Hz per voice
    const vp = Math.PI * (rand() + 1);
    const onset = Math.round(0.02 * (rand() * 0.5 + 0.5) * rate); // voices start up to 20 ms apart
    let ph = rand() * 0.5 + 0.5, drift = 0;
    for (let i = onset; i < total; i++) {
      const t = (i - onset) / rate;
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
  const g0 = Math.round(o.glideFrom * dur * rate), g1 = Math.round(dur * rate);
  const st = new Float64Array(10); // two state values per resonator
  let co = null;
  for (let i = 0; i < total; i++) {
    if ((i & 63) === 0) {
      const u = glide ? Math.min(1, Math.max(0, (i - g0) / Math.max(1, g1 - g0))) : 0;
      const w = u * u * (3 - 2 * u); // smoothstep
      const fs = [...from.map((x, k) => x + (to[k] - x) * w), ...F45];
      co = fs.map((fk, k) => reson(fk, BW[k], rate));
    }
    let x = src[i];
    for (let k = 0; k < 5; k++) {
      const [A, B, C] = co[k];
      const y = A * x + B * st[2 * k] + C * st[2 * k + 1];
      st[2 * k + 1] = st[2 * k]; st[2 * k] = y; x = y;
    }
    out[i] = x;
  }
  const aN = Math.max(1, Math.round(o.attack * rate)), dN = Math.round(dur * rate), rN = Math.max(1, Math.round(o.release * rate));
  for (let i = 0; i < total; i++) {
    let env = Math.min(1, i / aN);
    if (i > dN) env *= Math.max(0, 1 - (i - dN) / rN);
    out[i] *= env;
  }
  return out;
}

// One level for the whole choir: the RMS of a held /a/ on D3 set to `level`, so vowels keep
// their natural differences (/i/ and /u/ are quieter than /a/, as sung) and the voice sits in
// the mix where render.mjs's pad did.
const scaleCache = new Map();
function scaleFor(rate, level) {
  const key = `${rate}:${level}`;
  if (!scaleCache.has(key)) {
    const w = rawSing(146.83, 1, rate, 'a', null, {}, 7);
    let s = 0; const a = Math.round(0.3 * rate), z = Math.round(0.9 * rate);
    for (let i = a; i < z; i++) s += w[i] * w[i];
    scaleCache.set(key, level / Math.sqrt(s / (z - a)));
  }
  return scaleCache.get(key);
}

// f: Hz; dur: s; returns Float64Array of dur + release seconds.
export function singNote(f, dur, rate, { vowel = 'a', glide = null, level = 0.25, seed = 1, ...opts } = {}) {
  const w = rawSing(f, dur, rate, vowel, glide, opts, seed);
  const k = scaleFor(rate, level);
  for (let i = 0; i < w.length; i++) w[i] *= k;
  return w;
}
