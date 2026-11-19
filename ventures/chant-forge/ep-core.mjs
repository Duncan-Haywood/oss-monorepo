// Release-folder core (browser-safe: no Buffer, no fs, no zlib). ep.mjs (Node, ep-cli.mjs) and the
// studio page (index.html, "Build the release folder") both use it, so a folder built on the page
// and one built from a plan carry the same release.json, cover, report and release check.
import { crc32 } from './files.mjs';
import { analyze } from './master.mjs';
import { checkReleaseWith } from './release-core.mjs';

export const EP_TARGET_LUFS = -14;
// Release-check lines that need a name, an account or a code only the owner holds.
export const OWNER_CHECK = /^(artist|p-line|c-line)$|ISRC$/;

export function slugify(s) {
  return String(s || 'track').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'track';
}

// The edition a GABC file names (its book: header) and the year printed in it.
export function sourceOf(header) {
  const book = (header.book || '').trim();
  const years = [...book.matchAll(/\b(1[5-9]\d\d|20\d\d)\b/g)].map((m) => Number(m[1]));
  const year = years.length ? Math.min(...years) : null;
  const edition = book.replace(/,?\s*(pp?\.\s*.*)$/i, '').trim() || null;
  const transcriber = (header.transcriber || '').trim();
  const rights = year && year <= 1929
    ? `public domain: melody and Latin text as printed in ${edition} (${year}); GABC transcription ${transcriber || 'unnamed'} via GregoBase (CC0)`
    : `melody and text are traditional Gregorian chant (public domain); this edition (${year || 'year unknown'}) may carry rights of its own in its editorial signs, so check it against a pre-1929 printing`;
  return { edition, year, page: book, transcriber, rights };
}

// ---- cover art -------------------------------------------------------------------------
// A square PNG drawn from the first track's opening notes as square notation on a red
// four-line staff, the way chant books print it. No text: stores reject covers whose text
// does not match the metadata, and the artist name is still the owner's to choose.
const STEP = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6 };
export function diatonic(midi) { return Math.floor(midi / 12) * 7 + STEP[((midi % 12) + 12) % 12]; }


// PNG bytes from 8-bit RGB pixels. `deflate` turns bytes into a zlib stream: zlib's deflateSync
// in Node, CompressionStream('deflate') in a browser (see deflateStream); either may be async.
export async function pngBytes(w, h, rgb, deflate) { return assemblePng(w, h, await deflate(pngRows(w, h, rgb))); }
// The filtered scanlines a PNG's IDAT compresses.
export function pngRows(w, h, rgb) {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    raw[o] = 1; // Sub filter: smooth gradients compress to almost nothing
    for (let x = 0; x < w * 3; x++) raw[o + 1 + x] = (rgb[y * w * 3 + x] - (x >= 3 ? rgb[y * w * 3 + x - 3] : 0)) & 0xff;
  }
  return raw;
}
export function assemblePng(w, h, idat) {
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, w); hv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
// zlib-format deflate with the Compression Streams API (every current browser; Node 18+ too).
export async function deflateStream(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export function coverPixels(midis, { size = 3000, maxNotes = 14 } = {}) {
  const rgb = new Uint8Array(size * size * 3);
  const cx = size / 2, cy = size * 0.47, rmax = Math.hypot(cx, cy);
  // The glow depends only on |x - cx| and |y - cy|, so it is mirror-symmetric: x and size - x
  // give the same pixel exactly (x - cx is the exact negative), and so do rows y and 2 cy - y
  // when cy is a whole number (it is at 3000, 1400 and 600 px). Each mirrored pixel or row is
  // a copy, not a fresh hypot and pow: a quarter of the 9 million at 3000 px are computed.
  const stride = size * 3, cyi = Number.isInteger(cy) ? cy : -1;
  for (let y = 0; y < size; y++) {
    const ky = y * stride;
    if (cyi >= 0 && y > cyi && 2 * cyi - y >= 0) { rgb.copyWithin(ky, (2 * cyi - y) * stride, (2 * cyi - y + 1) * stride); continue; }
    for (let x = 0; x < size; x++) {
      const k = ky + x * 3;
      if (x > cx) { const m = ky + (size - x) * 3; rgb[k] = rgb[m]; rgb[k + 1] = rgb[m + 1]; rgb[k + 2] = rgb[m + 2]; continue; }
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / rmax);
      const f = (1 - t) ** 1.6;
      rgb[k] = 10 + 34 * f; rgb[k + 1] = 9 + 20 * f; rgb[k + 2] = 12 + 14 * f; // warm black, lit from the middle
    }
  }
  const rect = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x1)); x++) {
        const k = (y * size + x) * 3; rgb[k] = r; rgb[k + 1] = g; rgb[k + 2] = b;
      }
    }
  };
  const notes = midis.slice(0, maxNotes);
  const space = size * 0.055, line = Math.max(2, size * 0.004), left = size * 0.12, right = size * 0.88;
  const steps = notes.map(diatonic);
  const mid = steps.length ? Math.round((Math.min(...steps) + Math.max(...steps)) / 2) : 0;
  const staffTop = cy - 1.5 * space;
  for (let i = 0; i < 4; i++) rect(left, staffTop + i * space - line / 2, right, staffTop + i * space + line / 2, [178, 34, 34]);
  // the middle step sits in the middle space (between lines 2 and 3); one step is half a space
  const head = space * 0.82, gap = notes.length > 1 ? (right - left - size * 0.08 - head) / (notes.length - 1) : 0;
  steps.forEach((s, i) => {
    const y = cy - (s - mid) * (space / 2), x = left + size * 0.04 + i * gap;
    rect(x, y - head / 2, x + head, y + head / 2, [226, 196, 120]);
    // ledger lines for heads that leave the staff
    for (let ly = staffTop - space; ly >= y - head / 4; ly -= space) rect(x - head * 0.25, ly - line / 2, x + head * 1.25, ly + line / 2, [178, 34, 34]);
    for (let ly = staffTop + 4 * space; ly <= y + head / 4; ly += space) rect(x - head * 0.25, ly - line / 2, x + head * 1.25, ly + line / 2, [178, 34, 34]);
  });
  // a thin gold rule above and below, like a book's border
  rect(size * 0.08, size * 0.08, size * 0.92, size * 0.08 + line, [150, 124, 70]);
  rect(size * 0.08, size * 0.92 - line, size * 0.92, size * 0.92, [150, 124, 70]);
  return rgb;
}


// ---- the plan and release.json ------------------------------------------------------------
export function validatePlan(plan) {
  const errs = [];
  if (!plan || typeof plan !== 'object') return ['the plan is not a JSON object'];
  if (!(plan.title || '').trim()) errs.push('title: the release needs a title');
  if (!Array.isArray(plan.tracks) || !plan.tracks.length) errs.push('tracks: list at least one track');
  (plan.tracks || []).forEach((t, i) => {
    if (!t || !t.gabc) errs.push(`track ${i + 1}: gabc (the source file) is missing`);
    if (t && t.args && !Array.isArray(t.args)) errs.push(`track ${i + 1}: args must be a list of cli.mjs options`);
    if (t && (t.args || []).some((a) => a === '-o' || a === '--json')) errs.push(`track ${i + 1}: leave -o and --json out; the builder sets them`);
  });
  if (plan.type && !['single', 'ep', 'album'].includes(plan.type)) errs.push('type: single, ep or album');
  return errs;
}

// release.json from the built tracks. Each track: { base, title, header, seconds, isrc, gabcCopy }.
export function releaseJson(plan, tracks, { coverFile = 'cover.png', today } = {}) {
  const type = plan.type || (tracks.length <= 3 ? 'single' : tracks.length <= 6 ? 'ep' : 'album');
  const artist = (plan.artist || '').trim();
  const year = (plan.releaseDate || today || '').slice(0, 4);
  return {
    title: plan.title, artist, type, releaseDate: plan.releaseDate || '',
    pLine: plan.pLine || (artist && year ? `℗ ${year} ${artist}` : ''),
    cLine: plan.cLine || (artist && year ? `© ${year} ${artist}` : ''),
    ...(plan.label ? { label: plan.label } : {}), ...(plan.upc ? { upc: plan.upc } : {}),
    cover: coverFile,
    aiDisclosure: plan.aiDisclosure || {
      level: 'assisted',
      tools: 'chant-forge (MIT): rule-based arranger and a formant choir synthesiser; no trained model',
      parts: 'vocals (synthesised choir), instruments (synthesised), arrangement (rule-based from the chant)',
    },
    credits: plan.credits || [
      { role: 'Composer', name: 'Traditional (Gregorian chant)' },
      { role: 'Arranger', name: artist || 'to be named' },
      { role: 'Vocals', name: 'chant-forge synthesised choir' },
    ],
    tracks: tracks.map((t) => {
      const s = sourceOf(t.header);
      return {
        title: t.title, isrc: t.isrc, language: 'la', explicit: false, audio: `tracks/${t.base}.wav`,
        lyrics: `tracks/${t.base}.lrc`, seconds: +t.seconds.toFixed(1),
        source: { edition: s.edition, year: s.year, page: s.page, transcriber: s.transcriber, rights: s.rights, gabcFile: t.gabcCopy },
      };
    }),
  };
}
export function splitChecks(check) {
  const failed = check.checks.filter((c) => c.level === 'FAIL');
  const ownerSteps = failed.filter((c) => OWNER_CHECK.test(c.name));
  const buildFaults = failed.filter((c) => !OWNER_CHECK.test(c.name));
  return { ownerSteps, buildFaults, ready: buildFaults.length === 0 };
}

// The whole release folder in memory, for the studio page: the tracks are already converted and
// rendered (MIDI bytes, the -14 LUFS render { rate, channels }, LRC text, the GABC text). Returns
// the files for a ZIP plus the same release.json, check and REPORT.md ep-cli.mjs writes.
// wavBytes encodes the audio (files.mjs; passed in so this module needs no encoder of its own).
export async function releaseKit(plan, tracks, { today, coverSize = 3000, coverMidis, deflate = deflateStream, wavBytes, builder = 'the chant-forge studio page' } = {}) {
  const errs = [];
  if (!(plan.title || '').trim()) errs.push('the release needs a title');
  if (!tracks.length) errs.push('there is no track to release');
  if (errs.length) throw new Error(errs.join('; '));
  const enc = new TextEncoder(), files = new Map(), wavs = new Map(), analyses = new Map();
  const built = tracks.map((t, i) => {
    const title = (t.title || t.header.name || 'Chant').replace(/\s*\(.*?\)\s*$/, '').trim();
    const base = `${String(i + 1).padStart(2, '0')}-${slugify(title)}`;
    const gabcCopy = `sources/${t.gabcName || `${slugify(title)}.gabc`}`;
    files.set(`tracks/${base}.mid`, t.midi);
    files.set(`tracks/${base}.wav`, wavBytes(t.wav));
    files.set(`tracks/${base}.lrc`, enc.encode(t.lrc));
    files.set(gabcCopy, enc.encode(t.gabcText));
    wavs.set(`tracks/${base}.wav`, t.wav);
    const analysis = analyze(t.wav);
    analyses.set(`tracks/${base}.wav`, analysis);
    return { base, title, header: t.header, seconds: t.wav.channels[0].length / t.wav.rate, analysis, isrc: t.isrc || '', gabcCopy, warnings: t.warnings || [] };
  });
  const midis = coverMidis || [];
  files.set('cover.png', await pngBytes(coverSize, coverSize, coverPixels(midis, { size: coverSize }), deflate));
  const release = releaseJson(plan, built, { today });
  files.set('release.json', enc.encode(JSON.stringify(release, null, 2) + '\n'));
  const io = {
    exists: (p) => files.has(p),
    bytes: (p) => files.get(p),
    wav: (p) => { if (!wavs.has(p)) throw new Error('not a WAV the page built'); return wavs.get(p); },
    // the check reads the same in-memory render the report analysed, so it reuses that analysis
    analysis: (p) => analyses.get(p),
  };
  const check = checkReleaseWith(release, io, { today });
  const s = splitChecks(check);
  const report = epReport(plan, release, built, check, s.ownerSteps, s.buildFaults, { builder });
  files.set('REPORT.md', enc.encode(report));
  const order = ['REPORT.md', 'release.json', 'cover.png'];
  const list = [...files].map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99) || (a.name < b.name ? -1 : 1));
  return { files: list, release, tracks: built, check, report, ...s };
}

// ---- the report ---------------------------------------------------------------------------
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export function epReport(plan, release, tracks, check, ownerSteps, buildFaults, { builder = "chant-forge's `ep-cli.mjs`" } = {}) {
  const total = tracks.reduce((s, t) => s + t.seconds, 0);
  const warns = check.checks.filter((c) => c.level === 'WARN');
  return [
    `# ${release.title}`,
    '',
    `${release.type}, ${tracks.length} tracks, ${mmss(total)}. Built by ${builder}; every file is in this folder.`,
    '',
    '| # | Track | Length | Mode | Loudness | True peak | Source |',
    '|---|---|---|---|---|---|---|',
    ...tracks.map((t, i) => `| ${i + 1} | ${t.title} | ${mmss(t.seconds)} | ${t.header.mode || '?'} | ${t.analysis.lufs.toFixed(1)} LUFS | ${t.analysis.truePeakDb.toFixed(2)} dBTP | ${(t.header.book || '').replace(/\|/g, '/')} |`),
    '',
    '## Release check',
    '',
    `${check.checks.length - check.fail - check.warn} pass, ${check.warn} warn, ${check.fail} fail.`,
    '',
    buildFaults.length ? '**Build faults (fix before upload):**' : 'No build faults: the audio, cover, sources and metadata the builder controls all pass.',
    ...buildFaults.map((c) => `- ${c.name}: ${c.note}`),
    '',
    ownerSteps.length ? '**Owner steps (only the owner can fill these in):**' : 'No owner steps left.',
    ...ownerSteps.map((c) => `- ${c.name}: ${c.note}`),
    ...(ownerSteps.length ? ['', 'Fill them in `release.json` (or the plan, then rebuild) and run `node release-cli.mjs release.json`.'] : []),
    '',
    ...(warns.length ? ['**Warnings (judgement calls):**', ...warns.map((c) => `- ${c.name}: ${c.note}`), ''] : []),
    ...(tracks.some((t) => t.warnings.length) ? ['**Converter warnings:**', ...tracks.flatMap((t) => t.warnings.map((w) => `- ${t.title}: ${w}`)), ''] : []),
    '## Before upload',
    '',
    '- Listen to every track end to end on speakers and headphones. Nobody has listened to the preview choir yet; it is a formant synthesiser, not a recorded choir (`RECORDING-GUIDE.md`).',
    '- The AI-disclosure answer is the owner\'s call; the builder says "assisted" and names the tools and parts.',
    '- The cover is the first track\'s opening notes in square notation on a red staff, with no text.',
    '',
  ].join('\n');
}
