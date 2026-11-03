#!/usr/bin/env node
// node render-cli.mjs piece.mid [-o piece.wav] [--rate 44100] [--lufs -14]
// Preview render of a chant-forge MIDI file to a stereo WAV; then run master-cli.mjs on it.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderMidi, encodeWav } from './render.mjs';

export function run(argv) {
  let out = null, file = null, rate = 44100, lufs = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o') out = argv[++i];
    else if (argv[i] === '--rate') rate = Number(argv[++i]);
    else if (argv[i] === '--lufs') lufs = Number(argv[++i]);
    else if (!file) file = argv[i];
    else return { code: 2, text: `unexpected argument ${argv[i]}` };
  }
  if (!file) return { code: 2, text: 'usage: node render-cli.mjs piece.mid [-o piece.wav] [--rate 44100] [--lufs -14]' };
  if (![22050, 32000, 44100, 48000].includes(rate)) return { code: 2, text: '--rate must be 22050, 32000, 44100 or 48000' };
  if (lufs !== null && !(lufs >= -30 && lufs <= -6)) return { code: 2, text: '--lufs must be between -30 and -6' };
  out ||= file.replace(/\.midi?$/i, '') + '.wav';
  let r;
  try { r = renderMidi(readFileSync(file), { rate, targetLufs: lufs }); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  writeFileSync(out, encodeWav(r));
  return { code: 0, text: `${file}: ${r.notes} notes, ${r.seconds.toFixed(1)} s, wrote ${out}${r.lufs !== null ? `, ${r.lufs.toFixed(1)} LUFS` : ''} (preview synth, not a master; run master-cli.mjs on it)` };
}
if (import.meta.url === `file://${process.argv[1]}`) { const o = run(process.argv.slice(2)); (o.code ? console.error : console.log)(o.text); process.exit(o.code); }
