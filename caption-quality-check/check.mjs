#!/usr/bin/env node
// CLI: reads an SRT or WebVTT caption file from disk and reports reading
// speed, line length, duration, and timing/overlap problems against
// commonly-used caption style-guide thresholds. Your file, your machine --
// nothing is uploaded.
//
//   node check.mjs <path-to.srt|.vtt> [--json]
//     [--max-cps <n>] [--min-duration-ms <n>] [--max-duration-ms <n>]
//     [--max-line-length <n>] [--max-lines <n>] [--min-gap-ms <n>]
//
// Exit code 0 when no danger-severity finding was produced; 1 when a danger
// finding was found, the file could not be parsed, or it could not be read
// at all.

import { readFileSync } from 'node:fs';
import { checkCaptionsText, DEFAULT_OPTIONS } from './engine.mjs';

function parseArgs(argv) {
  const args = { file: null, json: false, options: {} };
  const numFlag = {
    '--max-cps': 'maxCps',
    '--min-duration-ms': 'minDurationMs',
    '--max-duration-ms': 'maxDurationMs',
    '--max-line-length': 'maxLineLength',
    '--max-lines': 'maxLines',
    '--min-gap-ms': 'minGapMs',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (numFlag[a]) args.options[numFlag[a]] = Number(argv[++i]);
    else if (!args.file && !a.startsWith('--')) args.file = a;
  }
  return args;
}

/** Pure orchestration: given file text, run the checker. Kept separate from
 * main() so tests can supply text directly instead of touching the disk. */
export function runCheck(text, options = {}) {
  return checkCaptionsText(text, options);
}

function formatText(file, result, options) {
  const lines = [];
  lines.push(`File: ${file}`);
  lines.push(`Format detected: ${result.format}`);
  lines.push(`Cues: ${result.cueCount ?? 0}`);
  lines.push(
    `Thresholds: max ${options.maxCps ?? DEFAULT_OPTIONS.maxCps} cps, ` +
      `${options.minDurationMs ?? DEFAULT_OPTIONS.minDurationMs}-${options.maxDurationMs ?? DEFAULT_OPTIONS.maxDurationMs}ms duration, ` +
      `max ${options.maxLineLength ?? DEFAULT_OPTIONS.maxLineLength} chars/line, ` +
      `max ${options.maxLines ?? DEFAULT_OPTIONS.maxLines} lines/cue, ` +
      `min ${options.minGapMs ?? DEFAULT_OPTIONS.minGapMs}ms gap`,
  );
  lines.push('');

  if (result.inputError) {
    lines.push(result.inputError);
    return lines.join('\n');
  }

  if (result.findings.length === 0) {
    lines.push('None of the checked caption-quality issues were found.');
  } else {
    for (const f of result.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }

  lines.push(
    `${result.dangerCount} danger, ${result.noticeCount} notice. This is evidence against ` +
      'commonly-used caption style-guide thresholds, not a certification against any single ' +
      'controlling standard -- see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Usage: node check.mjs <path-to.srt|.vtt> [--json] [--max-cps <n>] [--min-duration-ms <n>] [--max-duration-ms <n>] [--max-line-length <n>] [--max-lines <n>] [--min-gap-ms <n>]');
    process.exit(2);
  }

  let text;
  try {
    text = readFileSync(args.file, 'utf8');
  } catch (error) {
    console.error(`Could not read ${args.file}: ${error.message}`);
    process.exit(2);
  }

  const result = runCheck(text, args.options);

  if (args.json) {
    console.log(JSON.stringify({ file: args.file, options: args.options, ...result }, null, 2));
  } else {
    console.log(formatText(args.file, result, args.options));
  }

  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
