#!/usr/bin/env node
// node render-cli.mjs piece.mid [-o piece.wav] [--rate 44100] [--lufs -14]
// Preview render of a chant-forge MIDI file to a stereo WAV; then run master-cli.mjs on it.
// --learn DIR also writes rehearsal tracks, two per choir section: <base>-<section>-part.wav
// (that section loud on the left, the other sections --others dB down on the right, the band
// --backing dB down) and <base>-<section>-minus.wav (everything but that section).
// --sing makes the choir sing the vowel of each Latin syllable (sing.mjs) instead of a fixed "ah".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderMidi, encodeWav, learningTracks } from './render.mjs';
import { pathToFileURL } from 'node:url';

export function run(argv) {
  let out = null, file = null, rate = 44100, lufs = null, stemDir = null, limit = false, sing = false, learnDir = null, others = -12, backing = -6;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o') out = argv[++i];
    else if (argv[i] === '--rate') rate = Number(argv[++i]);
    else if (argv[i] === '--lufs') lufs = Number(argv[++i]);
    else if (argv[i] === '--limit') limit = true;
    else if (argv[i] === '--sing') sing = true;
    else if (argv[i] === '--stems') stemDir = argv[++i];
    else if (argv[i] === '--learn') learnDir = argv[++i];
    else if (argv[i] === '--others') others = Number(argv[++i]);
    else if (argv[i] === '--backing') backing = Number(argv[++i]);
    else if (!file) file = argv[i];
    else return { code: 2, text: `unexpected argument ${argv[i]}` };
  }
  if (!file) return { code: 2, text: 'usage: node render-cli.mjs piece.mid [-o piece.wav] [--rate 44100] [--lufs -14] [--limit] [--sing] [--stems DIR] [--learn DIR [--others -12] [--backing -6]]' };
  if (!learnDir && (argv.includes('--others') || argv.includes('--backing'))) return { code: 2, text: '--others and --backing need --learn' };
  for (const [k, v] of [['--others', others], ['--backing', backing]]) if (!(v >= -60 && v <= 0)) return { code: 2, text: `${k} must be between -60 and 0 dB` };
  if (![22050, 32000, 44100, 48000].includes(rate)) return { code: 2, text: '--rate must be 22050, 32000, 44100 or 48000' };
  if (lufs !== null && !(lufs >= -30 && lufs <= -6)) return { code: 2, text: '--lufs must be between -30 and -6' };
  if (limit && lufs === null) return { code: 2, text: '--limit needs --lufs' };
  out ||= file.replace(/\.midi?$/i, '') + '.wav';
  let r;
  try { r = renderMidi(readFileSync(file), { rate, targetLufs: lufs, limit, sing, stems: !!stemDir }); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  writeFileSync(out, encodeWav(r));
  let extra = '';
  if (stemDir) {
    mkdirSync(stemDir, { recursive: true });
    const base = out.replace(/^.*\//, '').replace(/\.wav$/i, '');
    const names = Object.keys(r.stems);
    for (const v of names) writeFileSync(`${stemDir}/${base}-${v}.wav`, encodeWav(r.stems[v]));
    extra = `; ${names.length} stems in ${stemDir} (${names.join(', ')}; they sum to the mix, drop them on one DAW start point)`;
  }
  if (learnDir) {
    let tracks;
    try { tracks = learningTracks(readFileSync(file), { rate, targetLufs: lufs, sing, others: 10 ** (others / 20), backing: 10 ** (backing / 20) }); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
    if (!tracks.length) return { code: 1, text: `${file}: no choir part to make rehearsal tracks from` };
    mkdirSync(learnDir, { recursive: true });
    const base = out.replace(/^.*\//, '').replace(/\.wav$/i, '');
    for (const t of tracks) writeFileSync(`${learnDir}/${base}-${t.slug}-${t.mode}.wav`, encodeWav(t.wav));
    const secs = [...new Set(tracks.map((t) => t.name))];
    extra += `; ${tracks.length} rehearsal tracks in ${learnDir} for ${secs.join(', ')} (-part: that section loud on the left, the rest ${-others} dB down on the right; -minus: everything but that section)`;
  }
  return { code: 0, text: `${file}: ${r.notes} notes, ${r.seconds.toFixed(1)} s, wrote ${out}${r.lufs !== null ? `, ${r.lufs.toFixed(1)} LUFS` : ''} (preview synth${sing ? ', choir singing the vowels' : ''}, not a master; run master-cli.mjs on it)${extra}` };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const o = run(process.argv.slice(2)); (o.code ? console.error : console.log)(o.text); process.exit(o.code); }
