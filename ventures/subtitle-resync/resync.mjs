#!/usr/bin/env node
// Command-line front end for engine.mjs. Zero dependencies; Node 18+.
//
//   node resync.mjs movie.srt --offset -2.5 -o fixed.srt
//   node resync.mjs movie.srt --fps 25:23.976 -o fixed.srt
//   node resync.mjs movie.srt --sync 00:01:00,000=00:01:02,000 --sync 01:40:00,000=01:44:10,000
//   node resync.mjs movie.es.srt --reference movie.en.srt -o movie.es.fixed.srt
//   cat movie.srt | node resync.mjs - --offset 1.2 > fixed.srt
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resyncText, parseUserTime, formatTimestamp } from './engine.mjs';

const HELP = `subtitle-resync: shift, stretch or auto-align an SRT or WebVTT file.

Usage: node resync.mjs <input.srt|.vtt|-> [one way to find the timing] [options]
       ("-" reads the subtitle file from standard input)

One way to find the timing (pick one; --offset can be added to any):
  --offset <time>        shift every cue; seconds (-2.5) or a timestamp (-00:00:02,500)
  --fps <from>:<to>      frame-rate fix, e.g. 25:23.976 (PAL subs on a film-rate release)
                         rates: 23.976, 24, 25, 29.97, 30, or any number
  --sync <old>=<new>     a line at <old> should be at <new>; once to shift, twice to
                         shift and stretch
  --reference <file>     a correctly timed subtitle file for the same video (any
                         language): aligns by timing pattern
  --offset-only          with --reference: search a shift only, no stretch

Options:
  --to srt|vtt           output format (default: same as input)
  -o, --output <file>    write here (default: standard output)
  --json                 print the timing found as JSON instead of the file
  -h, --help             this text

Exit codes: 0 written; 1 low-confidence reference alignment (file still written);
2 usage or input error.

No warranty. Free and as-is. Check the result against the video before you rely on it.`;

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}

export function parseArgs(argv) {
  const args = { syncPoints: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--offset') {
      const v = next();
      const ms = parseUserTime(v);
      if (ms === null) throw new Error(`--offset: cannot read "${v}" as seconds or a timestamp`);
      args.offsetMs = ms;
    } else if (a === '--fps') {
      const v = next();
      const m = /^([\d.]+):([\d.]+)$/.exec(v);
      if (!m) throw new Error(`--fps wants <from>:<to>, e.g. 25:23.976 (got "${v}")`);
      args.fps = [m[1], m[2]];
    } else if (a === '--sync') {
      const v = next();
      const [from, to, extra] = v.split('=');
      const fromMs = parseUserTime(from ?? '');
      const toMs = parseUserTime(to ?? '');
      if (extra !== undefined || fromMs === null || toMs === null) throw new Error(`--sync wants <old>=<new>, e.g. 00:01:00,000=00:01:02,000 (got "${v}")`);
      args.syncPoints.push({ fromMs, toMs });
    } else if (a === '--reference') args.reference = next();
    else if (a === '--offset-only') args.offsetOnly = true;
    else if (a === '--to') {
      const v = next();
      if (v !== 'srt' && v !== 'vtt' && v !== 'webvtt') throw new Error(`--to wants srt or vtt (got "${v}")`);
      args.to = v === 'srt' ? 'srt' : 'webvtt';
    } else if (a === '-o' || a === '--output') args.output = next();
    else if (a === '--json') args.json = true;
    else if (a.startsWith('-') && a !== '-') throw new Error(`unknown option ${a}`);
    else if (args.input) throw new Error(`only one input file (got "${args.input}" and "${a}")`);
    else args.input = a;
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(`${err.message}\n\n${HELP}`);
  }
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (!args.input) fail(`no input file\n\n${HELP}`);
  const text = args.input === '-'
    ? await readStdin()
    : await readFile(args.input, 'utf8').catch((e) => fail(`cannot read ${args.input}: ${e.message}`));
  const referenceText = args.reference
    ? await readFile(args.reference, 'utf8').catch((e) => fail(`cannot read ${args.reference}: ${e.message}`))
    : undefined;
  const result = resyncText(text, {
    offsetMs: args.offsetMs,
    fps: args.fps,
    syncPoints: args.syncPoints.length ? args.syncPoints : undefined,
    referenceText,
    offsetOnly: args.offsetOnly,
    outputFormat: args.to,
  });
  if (result.inputError) fail(result.inputError);
  for (const e of result.errors) process.stderr.write(`warning: ${e}\n`);

  const a = result.alignment;
  const summary = [
    `method: ${result.method}; scale ${result.scale.toFixed(6)}; offset ${(result.offsetMs / 1000).toFixed(3)} s`,
    `first cue ${formatTimestamp(result.firstBefore, result.format)} -> ${formatTimestamp(result.firstAfter ?? 0, result.format)}; last cue ${formatTimestamp(result.lastBefore, result.format)} -> ${formatTimestamp(result.lastAfter ?? 0, result.format)}`,
    a ? `reference: ${a.matched} of ${a.total} cues within 0.4 s of a reference cue (median error ${a.medianErrorMs} ms); best scale family "${a.scaleLabel}"; confidence ${a.confidence}` : null,
    result.dropped ? `${result.dropped} cue(s) dropped: they ended before 0:00` : null,
    result.clamped ? `${result.clamped} cue(s) clamped to start at 0:00` : null,
  ].filter(Boolean).join('\n');

  if (args.json) {
    const { output, ...rest } = result;
    process.stdout.write(`${JSON.stringify(rest, null, 2)}\n`);
  } else if (args.output) {
    await writeFile(args.output, result.output);
    process.stderr.write(`${summary}\nwrote ${args.output} (${result.outputCueCount} cues)\n`);
  } else {
    process.stdout.write(result.output);
    process.stderr.write(`${summary}\n`);
  }
  if (a && a.confidence === 'low') {
    process.stderr.write('warning: low confidence; the reference may be for a different cut of the video. Check the result by eye.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
