// @ts-check
// Audiobooks: checks chapter files against ACX's published audio submission
// requirements (the bar Audible, Amazon and Apple Books' ACX route apply),
// and writes the chapter metadata and ffmpeg commands that turn the same
// files into a single chaptered M4B for direct sale, Google Play Books,
// or a private feed. Pure and browser-safe; the CLI supplies probe results.

import { hhmmss } from './media.mjs';

/**
 * @typedef {{severity: 'danger'|'notice', field: string, message: string, fix?: string}} Finding
 * @typedef {{
 *   file: string, title?: string,
 *   info: Record<string, any>,
 *   loudness?: {rmsDb: number, peakDb: number, noiseFloorDb: number, error?: string},
 * }} Track
 */

// ACX audio submission requirements as published at build time. ACX revises
// these, so each finding names the rule it was checked against.
export const ACX = {
  minKbps: 192,
  sampleRate: 44100,
  maxMinutes: 120,
  rmsDb: [-23, -18],
  peakDb: -3,
  noiseFloorDb: -60,
  sampleMinutes: [1, 5],
};

/**
 * @param {Track[]} tracks  in reading order
 * @returns {{findings: Finding[], totalSeconds: number, files: {file: string, duration: string, ok: boolean}[]}}
 */
export function checkAcx(tracks) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {Finding['severity']} */ severity, /** @type {string} */ field, /** @type {string} */ message, /** @type {string} */ fix = '') =>
    findings.push({ severity, field, message, ...(fix ? { fix } : {}) });
  const files = [];
  let total = 0;
  const channelCounts = new Set();
  for (const t of tracks) {
    const i = t.info;
    const before = findings.length;
    if (i.error) { add('danger', t.file, `Unreadable: ${i.error}.`); files.push({ file: t.file, duration: '?', ok: false }); continue; }
    total += i.duration ?? 0;
    if (i.format !== 'mp3') add('danger', t.file, `ACX takes MP3 only; this is ${String(i.format).toUpperCase()}.`, `ffmpeg -i "${t.file}" -ar 44100 -codec:a libmp3lame -b:a 192k "${t.file.replace(/\.[^.]+$/, '')}.mp3"`);
    else {
      if (!i.cbr) add('danger', t.file, `Variable bitrate (${i.minKbps}–${i.maxKbps} kbps); ACX requires constant bitrate.`, 're-encode with -b:a 192k (libmp3lame is CBR with -b:a)');
      else if (i.bitrateKbps < ACX.minKbps) add('danger', t.file, `${i.bitrateKbps} kbps; ACX requires ${ACX.minKbps} kbps or higher.`);
    }
    if (i.sampleRate && i.sampleRate !== ACX.sampleRate) add('danger', t.file, `${i.sampleRate} Hz; ACX requires 44.1 kHz.`, 'add -ar 44100 when encoding');
    if (i.channels) channelCounts.add(i.channels);
    if ((i.duration ?? 0) > ACX.maxMinutes * 60) add('danger', t.file, `${hhmmss(i.duration)} long; ACX caps a file at ${ACX.maxMinutes} minutes. Split the chapter.`);
    if (t.loudness && !t.loudness.error) {
      const { rmsDb, peakDb, noiseFloorDb } = t.loudness;
      if (rmsDb < ACX.rmsDb[0] || rmsDb > ACX.rmsDb[1]) add('danger', t.file, `RMS ${rmsDb} dB; ACX requires ${ACX.rmsDb[0]} to ${ACX.rmsDb[1]} dB.`);
      if (peakDb > ACX.peakDb) add('danger', t.file, `Peak ${peakDb} dB; ACX requires ${ACX.peakDb} dB or lower.`);
      if (noiseFloorDb > ACX.noiseFloorDb) add('danger', t.file, `Quietest half-second is ${noiseFloorDb} dB RMS; ACX requires a noise floor of ${ACX.noiseFloorDb} dB or lower.`);
    }
    files.push({ file: t.file, duration: hhmmss(i.duration ?? 0), ok: findings.length === before });
  }
  if (channelCounts.size > 1) add('danger', 'channels', 'Files mix mono and stereo; ACX requires every file to be the same.');
  const names = tracks.map((t) => `${t.file} ${t.title ?? ''}`.toLowerCase());
  if (!names.some((n) => /opening|intro.*credit/.test(n))) add('notice', 'credits', 'No file looks like opening credits. ACX wants title, author and narrator read in their own file at the start.');
  if (!names.some((n) => /closing|end.*credit|outro/.test(n))) add('notice', 'credits', 'No file looks like closing credits. ACX wants "The end" and credits in their own file at the end.');
  if (!names.some((n) => /sample/.test(n))) add('notice', 'sample', `No retail sample. ACX asks for a separate ${ACX.sampleMinutes[0]}–${ACX.sampleMinutes[1]} minute sample file.`);
  if (tracks.some((t) => t.info.format === 'mp3') && !tracks.some((t) => t.loudness)) {
    add('notice', 'loudness', 'Loudness (RMS, peak, noise floor) is not measured on MP3 here. Check your WAV masters with `publish-kit audiobook check *.wav`, or run: ffmpeg -i <file>.mp3 -af astats=metadata=0 -f null -');
  }
  return { findings, totalSeconds: Math.round(total), files };
}

/** @param {string} s */
function ffEscape(s) {
  return String(s).replace(/[=;#\\\n]/g, (c) => `\\${c}`);
}

/**
 * FFMETADATA1 text with one chapter per track, in order, timed by duration.
 * @param {{title: string, author?: string, narrator?: string, year?: string|number, description?: string}} book
 * @param {{title: string, duration: number}[]} chapters
 */
export function ffmetadata(book, chapters) {
  const lines = [';FFMETADATA1', `title=${ffEscape(book.title)}`, `album=${ffEscape(book.title)}`, 'genre=Audiobook'];
  if (book.author) lines.push(`artist=${ffEscape(book.author)}`, `album_artist=${ffEscape(book.author)}`);
  if (book.narrator) lines.push(`composer=${ffEscape(book.narrator)}`);
  if (book.year) lines.push(`date=${ffEscape(String(book.year))}`);
  if (book.description) lines.push(`comment=${ffEscape(book.description)}`);
  let start = 0;
  for (const ch of chapters) {
    const end = start + Math.round(ch.duration * 1000);
    lines.push('', '[CHAPTER]', 'TIMEBASE=1/1000', `START=${start}`, `END=${end}`, `title=${ffEscape(ch.title)}`);
    start = end;
  }
  return lines.join('\n') + '\n';
}

/** @param {string} p */
const q = (p) => `'${p.replace(/'/g, `'\\''`)}'`;

/**
 * The concat list and the ffmpeg command that join the tracks into one
 * chaptered M4B (AAC, cover embedded, +faststart for streaming).
 * @param {{files: string[], metadataPath: string, listPath: string, cover?: string, out: string, kbps?: number}} p
 */
export function m4bCommands({ files, metadataPath, listPath, cover, out, kbps = 64 }) {
  const list = files.map((f) => `file ${q(f)}`).join('\n') + '\n';
  const cmd = [
    'ffmpeg -hide_banner -y',
    `-f concat -safe 0 -i ${q(listPath)}`,
    `-i ${q(metadataPath)}`,
    cover ? `-i ${q(cover)} -map 0:a -map 2:v -c:v copy -disposition:v:0 attached_pic` : '-map 0:a',
    '-map_metadata 1 -map_chapters 1',
    `-c:a aac -b:a ${kbps}k -movflags +faststart`,
    q(out),
  ].join(' ');
  return { list, cmd };
}

/** "03 - The Storm.mp3" -> "The Storm" @param {string} file */
export function titleFromFile(file) {
  const base = file.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? file;
  return base.replace(/^\s*(chapter|ch|track)?[\s_-]*\d+[\s._-]*/i, '').replace(/[_]+/g, ' ').trim() || base;
}
