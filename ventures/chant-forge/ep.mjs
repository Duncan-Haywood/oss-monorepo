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
import { EP_TARGET_LUFS, slugify, coverPixels, validatePlan, releaseJson, splitChecks, epReport, assemblePng, pngRows } from './ep-core.mjs';

export { EP_TARGET_LUFS, OWNER_CHECK, slugify, sourceOf, diatonic, coverPixels, validatePlan, releaseJson, epReport } from './ep-core.mjs';

// Node's synchronous PNG writer (zlib level 9); the page uses ep-core's pngBytes with CompressionStream.
export function encodePng(w, h, rgb) { return Buffer.from(assemblePng(w, h, deflateSync(pngRows(w, h, rgb), { level: 9 }))); }
export function coverArt(midis, opts = {}) { const size = opts.size || 3000; return encodePng(size, size, coverPixels(midis, opts)); }

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
  const release = releaseJson(plan, tracks, { coverFile, today });
  writeFileSync(join(outDir, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  const check = checkRelease(release, outDir, { today });
  const { ownerSteps, buildFaults } = splitChecks(check);
  const report = epReport(plan, release, tracks, check, ownerSteps, buildFaults);
  writeFileSync(join(outDir, 'REPORT.md'), report);
  return { release, tracks, check, ownerSteps, buildFaults, report, ready: buildFaults.length === 0 };
}
