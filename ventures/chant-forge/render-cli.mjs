#!/usr/bin/env node
// node render-cli.mjs piece.mid [-o piece.wav] [--rate 44100] [--lufs -14]
// Preview render of a chant-forge MIDI file to a stereo WAV; then run master-cli.mjs on it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderMidi, encodeWav } from './render.mjs';
import { pathToFileURL } from 'node:url';

export function run(argv) {
  let out = null, file = null, rate = 44100, lufs = null, stemDir = null, limit = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o') out = argv[++i];
    else if (argv[i] === '--rate') rate = Number(argv[++i]);
    else if (argv[i] === '--lufs') lufs = Number(argv[++i]);
    else if (argv[i] === '--limit') limit = true;
    else if (argv[i] === '--stems') stemDir = argv[++i];
    else if (!file) file = argv[i];
    else return { code: 2, text: `unexpected argument ${argv[i]}` };
  }
  if (!file) return { code: 2, text: 'usage: node render-cli.mjs piece.mid [-o piece.wav] [--rate 44100] [--lufs -14] [--limit] [--stems DIR]' };
  if (![22050, 32000, 44100, 48000].includes(rate)) return { code: 2, text: '--rate must be 22050, 32000, 44100 or 48000' };
  if (lufs !== null && !(lufs >= -30 && lufs <= -6)) return { code: 2, text: '--lufs must be between -30 and -6' };
  if (limit && lufs === null) return { code: 2, text: '--limit needs --lufs' };
  out ||= file.replace(/\.midi?$/i, '') + '.wav';
  let r;
  try { r = renderMidi(readFileSync(file), { rate, targetLufs: lufs, limit, stems: !!stemDir }); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  writeFileSync(out, encodeWav(r));
  let extra = '';
  if (stemDir) {
    mkdirSync(stemDir, { recursive: true });
    const base = out.replace(/^.*\//, '').replace(/\.wav$/i, '');
    const names = Object.keys(r.stems);
    for (const v of names) writeFileSync(`${stemDir}/${base}-${v}.wav`, encodeWav(r.stems[v]));
    extra = `; ${names.length} stems in ${stemDir} (${names.join(', ')}; they sum to the mix, drop them on one DAW start point)`;
  }
  return { code: 0, text: `${file}: ${r.notes} notes, ${r.seconds.toFixed(1)} s, wrote ${out}${r.lufs !== null ? `, ${r.lufs.toFixed(1)} LUFS` : ''} (preview synth, not a master; run master-cli.mjs on it)${extra}` };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const o = run(process.argv.slice(2)); (o.code ? console.error : console.log)(o.text); process.exit(o.code); }
