#!/usr/bin/env node
// Silence Cutter CLI: find the pauses in a recording and write an edit.
// Zero dependencies. Reads WAV directly; any other format (MP4, MOV, MP3,
// M4A, MKV) goes through ffmpeg if it is on PATH.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyse, decodeWav, mixToMono, toEDL, toFCPXML, toPremiereXML, toFfmpeg, toCSV, retimeSRT, renderKeeps, encodeWav, formatDuration, DEFAULTS, FRAME_RATES } from './engine.mjs';

const HELP = `Silence Cutter: remove the pauses from a talking recording.

Usage: node cutter.mjs INPUT [options]

  INPUT              a WAV file, or any audio/video file ffmpeg can read
  --threshold DB     loudness below which audio counts as silence, in dBFS
                     (default: auto, set from the recording's own noise floor)
  --min-silence S    shortest pause to cut, seconds (default ${DEFAULTS.minSilence})
  --pad-before S     audio kept before speech resumes (default ${DEFAULTS.padBefore})
  --pad-after S      audio kept after speech stops (default ${DEFAULTS.padAfter})
  --keep-pause S     leave this much of each pause instead of cutting it all (default 0)
  --fps RATE         frame rate for EDL/XML: ${Object.keys(FRAME_RATES).join(', ')} (default 30)
  --edl FILE         write a CMX3600 EDL (DaVinci Resolve, Premiere Pro, Avid)
  --fcpxml FILE      write FCPXML 1.9 (Final Cut Pro, DaVinci Resolve)
  --xml FILE         write Final Cut 7 XML (Premiere Pro: File > Import)
  --csv FILE         write the keep/cut list
  --wav FILE         write the cut audio as 16-bit WAV
  --srt IN OUT       move a subtitle file's cues onto the cut timeline
  --ffmpeg           print an ffmpeg command that renders the cut video
  --json             print the analysis as JSON
  -h, --help         this text

No warranty: provided as-is; review the edit before you publish it.`;

function parseArgs(argv) {
  const o = { srt: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--threshold': { const v = next(); o.threshold = v === 'auto' ? 'auto' : Number(v); break; }
      case '--min-silence': o.minSilence = Number(next()); break;
      case '--pad-before': o.padBefore = Number(next()); break;
      case '--pad-after': o.padAfter = Number(next()); break;
      case '--keep-pause': o.keepPause = Number(next()); break;
      case '--fps': o.fps = next(); break;
      case '--edl': o.edl = next(); break;
      case '--fcpxml': o.fcpxml = next(); break;
      case '--xml': o.xml = next(); break;
      case '--csv': o.csv = next(); break;
      case '--wav': o.wav = next(); break;
      case '--srt': o.srt = [next(), next()]; break;
      case '--ffmpeg': o.ffmpeg = true; break;
      case '--json': o.json = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
        rest.push(a);
    }
  }
  for (const k of ['minSilence', 'padBefore', 'padAfter', 'keepPause']) if (o[k] != null && !(o[k] >= 0)) throw new Error(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} must be a number of seconds >= 0`);
  if (o.threshold != null && o.threshold !== 'auto' && !Number.isFinite(o.threshold)) throw new Error('--threshold must be a dBFS number like -40, or auto');
  o.input = rest[0];
  return o;
}

export function loadAudio(path) {
  if (extname(path).toLowerCase() === '.wav') {
    try { return decodeWav(readFileSync(path)); } catch (e) { if (!/unsupported|no fmt/.test(e.message)) throw e; }
  }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 });
  if (r.error || r.status !== 0) throw new Error(`could not read ${path}: ${r.error ? 'ffmpeg is not installed (convert to WAV first)' : String(r.stderr).trim()}`);
  const b = r.stdout;
  const x = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
  return { sampleRate: 16000, channels: [x] };
}

function probeVideo(path) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path]);
  if (r.error || r.status !== 0) return null;
  const m = /^(\d+),(\d+)/.exec(String(r.stdout).trim());
  return m ? { width: +m[1], height: +m[2] } : null;
}

export function main(argv) {
  const o = parseArgs(argv);
  if (o.help || !o.input) { console.log(HELP); return o.help ? 0 : 1; }
  const audio = loadAudio(o.input);
  const a = analyse(mixToMono(audio.channels), audio.sampleRate, o);
  const clipName = basename(o.input);
  const video = extname(o.input).toLowerCase() === '.wav' ? null : probeVideo(o.input);
  const meta = { fps: o.fps ?? '30', clipName, duration: a.duration, hasVideo: !!video, ...(video ?? {}) };
  if (o.edl) writeFileSync(o.edl, toEDL(a.keeps, meta));
  if (o.fcpxml) writeFileSync(o.fcpxml, toFCPXML(a.keeps, meta));
  if (o.xml) writeFileSync(o.xml, toPremiereXML(a.keeps, meta));
  if (o.csv) writeFileSync(o.csv, toCSV(a));
  if (o.wav) {
    const full = extname(o.input).toLowerCase() === '.wav' ? audio : loadAudio(o.input);
    writeFileSync(o.wav, encodeWav(renderKeeps(full.channels, full.sampleRate, a.keeps), full.sampleRate));
  }
  if (o.srt) { const r = retimeSRT(readFileSync(o.srt[0], 'utf8'), a.keeps); writeFileSync(o.srt[1], r.srt); console.error(`subtitles: ${r.kept} cues kept, ${r.dropped} fell inside cuts`); }
  if (o.json) { const { levels, ...rest } = a; console.log(JSON.stringify(rest, null, 2)); return 0; }
  if (o.ffmpeg) { console.log(toFfmpeg(a.keeps, { input: o.input, output: o.input.replace(/(\.[^.]+)?$/, '-cut$1'), hasVideo: !!video })); return 0; }
  console.log(`${clipName}: ${formatDuration(a.duration)} -> ${formatDuration(a.kept)} (${a.cuts.length} pauses cut, ${a.removed.toFixed(1)} s removed, ${((100 * a.removed) / Math.max(a.duration, 1e-9)).toFixed(0)}%)`);
  console.log(`noise floor ${a.floor.toFixed(1)} dBFS, voice ${a.voice.toFixed(1)} dBFS, threshold ${a.threshold.toFixed(1)} dBFS`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 2; }
}
