// EP builder (2026-11-16): one plan file in, one distributor-ready folder out.
// For each track it runs the converter (cli.mjs), renders the singing preview choir with the
// limiter at -14 LUFS (render.mjs), writes timed lyrics, copies the GABC source next to it, then
// draws a cover from the first track's own melody, writes release.json with each track's source
// edition and runs the release check (release.mjs) over the folder. What only the owner can fill
// in (artist name, p- and c-lines, ISRCs) is reported as owner steps, not as faults of the build.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { run as convert } from './cli.mjs';
import { renderMidi, encodeWav } from './render.mjs';
import { analyze } from './master.mjs';
import { parseGabc } from './gabc.mjs';
import { checkRelease } from './release.mjs';

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

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    raw[o] = 1; // Sub filter: smooth gradients compress to almost nothing
    for (let x = 0; x < w * 3; x++) {
      const v = rgb[y * w * 3 + x], left = x >= 3 ? rgb[y * w * 3 + x - 3] : 0;
      raw[o + 1 + x] = (v - left) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function coverArt(midis, { size = 3000, maxNotes = 14 } = {}) {
  const rgb = new Uint8Array(size * size * 3);
  const cx = size / 2, cy = size * 0.47, rmax = Math.hypot(cx, cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / rmax);
      const k = (y * size + x) * 3, f = (1 - t) ** 1.6;
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
  return encodePng(size, size, rgb);
}

// ---- the build -------------------------------------------------------------------------
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

export function buildEp(plan, planDir, outDir, { rate = 44100, sing = true, coverSize = 3000, today, log = () => {} } = {}) {
  const errs = validatePlan(plan);
  if (errs.length) throw new Error(errs.join('\n'));
  mkdirSync(join(outDir, 'tracks'), { recursive: true });
  mkdirSync(join(outDir, 'sources'), { recursive: true });
  const tracks = [];
  let coverMidis = null;
  plan.tracks.forEach((t, i) => {
    const src = resolve(planDir, t.gabc);
    const parsed = parseGabc(readFileSync(src, 'utf8'));
    const title = (t.title || parsed.header.name || basename(src, '.gabc')).replace(/\s*\(.*?\)\s*$/, '').trim();
    const base = `${String(i + 1).padStart(2, '0')}-${slugify(title)}`;
    const mid = join(outDir, 'tracks', `${base}.mid`), lrcFile = join(outDir, 'tracks', `${base}.lrc`);
    const r = convert([src, ...(t.args || []), '-o', mid, '--lrc', lrcFile, '--json']);
    if (r.code) throw new Error(`track ${i + 1} (${t.gabc}): ${r.text}`);
    const summary = JSON.parse(r.text);
    if (!coverMidis) coverMidis = r.events.filter((e) => e.type === 'note').map((e) => e.midi);
    const t0 = Date.now();
    const wav = renderMidi(readFileSync(mid), { rate, targetLufs: EP_TARGET_LUFS, limit: true, sing });
    const wavFile = join(outDir, 'tracks', `${base}.wav`);
    writeFileSync(wavFile, encodeWav(wav));
    const a = analyze(wav);
    const gabcCopy = join('sources', basename(src));
    copyFileSync(src, join(outDir, gabcCopy));
    log(`${base}: ${wav.seconds.toFixed(1)} s, ${a.lufs.toFixed(2)} LUFS, ${a.truePeakDb.toFixed(2)} dBTP, rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    tracks.push({ base, title, gabc: t.gabc, header: parsed.header, summary, seconds: wav.seconds, analysis: a, isrc: t.isrc || '', gabcCopy,
      warnings: summary.warnings || [] });
  });
  const coverFile = 'cover.png';
  if (plan.cover) copyFileSync(resolve(planDir, plan.cover), join(outDir, coverFile));
  else writeFileSync(join(outDir, coverFile), coverArt(coverMidis, { size: coverSize }));
  const type = plan.type || (tracks.length <= 3 ? 'single' : tracks.length <= 6 ? 'ep' : 'album');
  const artist = (plan.artist || '').trim();
  const year = (plan.releaseDate || today || '').slice(0, 4);
  const release = {
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
  writeFileSync(join(outDir, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  const check = checkRelease(release, outDir, { today });
  const failed = check.checks.filter((c) => c.level === 'FAIL');
  const ownerSteps = failed.filter((c) => OWNER_CHECK.test(c.name));
  const buildFaults = failed.filter((c) => !OWNER_CHECK.test(c.name));
  const report = epReport(plan, release, tracks, check, ownerSteps, buildFaults);
  writeFileSync(join(outDir, 'REPORT.md'), report);
  return { release, tracks, check, ownerSteps, buildFaults, report, ready: buildFaults.length === 0 };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export function epReport(plan, release, tracks, check, ownerSteps, buildFaults) {
  const total = tracks.reduce((s, t) => s + t.seconds, 0);
  const warns = check.checks.filter((c) => c.level === 'WARN');
  return [
    `# ${release.title}`,
    '',
    `${release.type}, ${tracks.length} tracks, ${mmss(total)}. Built by chant-forge's \`ep-cli.mjs\`; every file is in this folder.`,
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
