// Caption/subtitle quality engine: given an SRT or WebVTT file's text, does
// it violate the widely-published caption style-guide rules that keep a
// caption track actually readable, rather than merely present?
//
// A caption track can be technically valid (parses, plays, syncs) and still
// fail the audience it exists for -- a deaf or hard-of-hearing viewer who has
// to choose between reading the caption and watching the scene, or a viewer
// with a slower reading speed for whom "captions exist" and "captions work"
// are two different claims. WCAG 1.2.2 requires captions for prerecorded
// video; it does not grade their quality, and neither does a video platform's
// own upload check, which accepts a syntactically valid file regardless of
// how fast or cramped its cues are. Six checks, each mechanical and each
// traceable to a widely-published caption style guide (Netflix's public
// Timed Text Style Guide and the BBC's public Subtitle Guidelines both state
// versions of these numbers; they are cited here as commonly-used industry
// thresholds, not as a single controlling standard -- see README.md):
//
//   reading-too-fast   Characters-per-second (CPS) above the configured cap
//                      (default 20, a commonly-cited adult-content ceiling)
//                      -- the viewer cannot read the cue before it changes.
//   duration-too-short  A cue displayed for less than the configured minimum
//                      (default 5/6 second, ~833ms) -- even a short cue needs
//                      a floor, or it flashes past before a saccade lands.
//   duration-too-long   A cue displayed for longer than the configured
//                      maximum (default 7s) -- style guides cap this because
//                      a static cue left on screen invites re-reading and
//                      desyncs the viewer's attention from the scene.
//   line-too-long       A line longer than the configured maximum (default
//                      42 characters) -- forces a viewer's eye to travel
//                      further per line than a caption box is designed for.
//   too-many-lines      More than the configured maximum (default 2) lines
//                      in one cue -- crowds the frame and the classic
//                      two-line caption box.
//   invalid-timing      A cue's end time is at or before its start time, or
//                      cues are out of chronological order -- not a quality
//                      defect but a broken file; every duration-based check
//                      is skipped for that cue since duration is meaningless.
//   overlapping-cues    A cue's end time is after the next cue's start time
//                      -- most players cannot show two caption cues at once,
//                      so one is dropped or garbled.
//   gap-too-short       A positive but very small gap between consecutive
//                      cues (default floor: 2 frames at 24fps, ~84ms) --
//                      commonly cited as too brief to register as a new cue
//                      rather than a flicker of the same one.
//   empty-cue           A cue with no visible text at all.
//
// Pure, no I/O, no network -- the identical function classifies cues parsed
// from a CLI-read file and cues parsed from text pasted into the browser
// page, so the two surfaces can never silently disagree about what a given
// track means. This portfolio's standalone ventures vendor their own small
// parsing/classification logic rather than importing from `platform/` (see
// redirect-chain-check/engine.mjs, hreflang-reciprocity-check/engine.mjs).

const TIMESTAMP_RE = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/;
const TAG_RE = /<[^>]*>/g;

export const DEFAULT_OPTIONS = {
  maxCps: 20,
  minDurationMs: 833, // 5/6 second
  maxDurationMs: 7000,
  maxLineLength: 42,
  maxLines: 2,
  minGapMs: 84, // ~2 frames at 24fps
};

/** @returns {number|null} milliseconds, or null if unparsable */
export function parseTimestamp(raw) {
  const m = TIMESTAMP_RE.exec(String(raw).trim());
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = Number(m[4]);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Strips WebVTT/SRT inline markup tags (<i>, <b>, <c.classname>, karaoke
 * timestamp tags) from a line, leaving only what a viewer actually reads. */
export function stripTags(line) {
  return String(line).replace(TAG_RE, '');
}

/**
 * Parses SRT or WebVTT text into cues. Blocks with no recognizable
 * "start --> end" line (the WEBVTT header, NOTE/STYLE/REGION blocks, blank
 * runs) are skipped rather than treated as cues; a block that has an arrow
 * line but unparsable timestamps is reported as a parse error and skipped.
 *
 * @param {string} text
 * @returns {{ format: 'webvtt'|'srt'|'unknown', cues: Array<{index:number, id:string|null, startMs:number, endMs:number, lines:string[]}>, parseErrors: string[] }}
 */
export function parseCaptions(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  const format = /^﻿?WEBVTT/.test(normalized) ? 'webvtt' : (normalized.trim() ? 'srt' : 'unknown');
  const blocks = normalized.split(/\n{2,}/);
  const cues = [];
  const parseErrors = [];
  let cueIndex = 0;

  for (const block of blocks) {
    const trimmedLines = block.split('\n');
    // A cue's timing line is identified by the "-->" separator alone, not by
    // requiring both sides to already be valid timestamps -- a line that
    // *looks* like a timing line but has a malformed timestamp on either
    // side must still be recognized as one, or it silently disappears as if
    // it were a header/NOTE block instead of being reported as broken.
    const arrowLineIdx = trimmedLines.findIndex((l) => l.includes('-->'));
    if (arrowLineIdx === -1) continue; // header/NOTE/STYLE/blank block, not a cue

    const arrowLine = trimmedLines[arrowLineIdx];
    const [leftRaw, rightRaw] = arrowLine.split('-->');
    const startMs = parseTimestamp((leftRaw ?? '').trim());
    // WebVTT allows cue settings (align:start line:0% ...) after the end
    // timestamp on the same line; only its first whitespace-separated token
    // is the timestamp itself.
    const endMs = parseTimestamp((rightRaw ?? '').trim().split(/\s+/)[0] ?? '');
    const id = arrowLineIdx > 0 ? trimmedLines[arrowLineIdx - 1].trim() || null : null;
    const textLines = trimmedLines.slice(arrowLineIdx + 1).filter((l, i, arr) => !(i === arr.length - 1 && l === ''));

    if (startMs === null || endMs === null) {
      parseErrors.push(`Block ${cueIndex + 1}: could not parse timestamps on "${arrowLine.trim()}"`);
      cueIndex += 1;
      continue;
    }

    cues.push({ index: cueIndex, id, startMs, endMs, lines: textLines });
    cueIndex += 1;
  }

  return { format, cues, parseErrors };
}

function visibleText(lines) {
  return lines.map(stripTags).join('\n');
}

function charCount(lines) {
  return visibleText(lines).replace(/\n/g, '').length;
}

/**
 * Classifies parsed cues against the caption-quality rules above.
 *
 * @param {Array<{index:number, id?:string|null, startMs:number, endMs:number, lines:string[]}>} cues
 * @param {Partial<typeof DEFAULT_OPTIONS>} [opts]
 */
export function classifyCaptions(cues, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };

  if (!Array.isArray(cues) || cues.length === 0) {
    return {
      cues: [], findings: [], dangerCount: 0, noticeCount: 0, cueCount: 0, ok: false,
      inputError: 'No cues found -- paste an SRT or WebVTT track, or point the CLI at a .srt/.vtt file.',
    };
  }

  const findings = [];
  const enriched = cues.map((cue) => {
    const durationMs = cue.endMs - cue.startMs;
    const text = visibleText(cue.lines);
    const chars = charCount(cue.lines);
    const lineLengths = cue.lines.map((l) => stripTags(l).length);
    const cps = durationMs > 0 ? chars / (durationMs / 1000) : null;
    return { ...cue, durationMs, text, charCount: chars, lineLengths, cps };
  });

  let previousValidStart = null;
  enriched.forEach((cue, i) => {
    const label = `Cue ${cue.index + 1} (${cue.id ? `"${cue.id}", ` : ''}${cue.startMs}ms-${cue.endMs}ms)`;

    if (cue.durationMs <= 0) {
      findings.push({
        id: 'invalid-timing', severity: 'danger', cueIndex: cue.index,
        title: `${label}: end time is at or before its start time`,
        detail: 'A cue must end strictly after it starts. Duration-based checks (reading speed, min/max duration) are skipped for this cue since its duration is meaningless.',
      });
      return; // duration-dependent checks below would be meaningless
    }

    if (previousValidStart !== null && cue.startMs < previousValidStart) {
      findings.push({
        id: 'out-of-order', severity: 'danger', cueIndex: cue.index,
        title: `${label}: starts before the previous cue`,
        detail: 'Cues are expected in chronological order. A player following the file in order may show this cue at the wrong time or skip it.',
      });
    }
    previousValidStart = cue.startMs;

    if (cue.charCount === 0) {
      findings.push({
        id: 'empty-cue', severity: 'notice', cueIndex: cue.index,
        title: `${label}: no visible text`,
        detail: 'An empty cue still occupies a timing slot and is usually a leftover from editing rather than an intentional silence marker.',
      });
    }

    if (cue.cps !== null && cue.cps > o.maxCps) {
      findings.push({
        id: 'reading-too-fast', severity: 'danger', cueIndex: cue.index,
        title: `${label}: ${cue.cps.toFixed(1)} characters/second, above the ${o.maxCps} cap`,
        detail: `${cue.charCount} characters in ${(cue.durationMs / 1000).toFixed(2)}s. A viewer reading at a typical pace cannot finish this cue before it changes -- widely-used caption style guides cap adult-content reading speed around ${o.maxCps} characters per second for exactly this reason.`,
      });
    }

    if (cue.durationMs < o.minDurationMs) {
      findings.push({
        id: 'duration-too-short', severity: 'notice', cueIndex: cue.index,
        title: `${label}: on screen for only ${cue.durationMs}ms`,
        detail: `Below the commonly-used minimum of ${o.minDurationMs}ms (5/6 second) -- a cue shorter than this can flash past before a viewer's eye lands on it, regardless of how few characters it holds.`,
      });
    }

    if (cue.durationMs > o.maxDurationMs) {
      findings.push({
        id: 'duration-too-long', severity: 'notice', cueIndex: cue.index,
        title: `${label}: on screen for ${(cue.durationMs / 1000).toFixed(1)}s`,
        detail: `Above the commonly-used maximum of ${(o.maxDurationMs / 1000).toFixed(0)}s -- a cue left on screen this long invites re-reading and desyncs the viewer's attention from the scene it is describing.`,
      });
    }

    const overLine = cue.lineLengths.findIndex((len) => len > o.maxLineLength);
    if (overLine !== -1) {
      findings.push({
        id: 'line-too-long', severity: 'notice', cueIndex: cue.index,
        title: `${label}: line ${overLine + 1} is ${cue.lineLengths[overLine]} characters`,
        detail: `Above the commonly-used maximum of ${o.maxLineLength} characters per line -- forces a viewer's eye to travel further per line than a caption box is designed for.`,
      });
    }

    if (cue.lines.length > o.maxLines) {
      findings.push({
        id: 'too-many-lines', severity: 'notice', cueIndex: cue.index,
        title: `${label}: ${cue.lines.length} lines`,
        detail: `Above the commonly-used maximum of ${o.maxLines} lines per cue -- crowds the frame and the classic two-line caption box most players and TVs assume.`,
      });
    }
  });

  // Pairwise checks: overlap and gap, only between cues whose own timing was
  // valid (an invalid-timing cue's neighbours are compared to it as-is --
  // the pair check still means something even if the cue itself is broken).
  for (let i = 0; i < enriched.length - 1; i++) {
    const a = enriched[i];
    const b = enriched[i + 1];
    const gap = b.startMs - a.endMs;
    const labelA = `Cue ${a.index + 1}`;
    const labelB = `Cue ${b.index + 1}`;
    if (gap < 0) {
      findings.push({
        id: 'overlapping-cues', severity: 'danger', cueIndex: a.index,
        title: `${labelA} overlaps ${labelB} by ${Math.abs(gap)}ms`,
        detail: 'Most players cannot display two caption cues at once -- one is typically dropped or the two are garbled together on screen.',
      });
    } else if (gap > 0 && gap < o.minGapMs) {
      findings.push({
        id: 'gap-too-short', severity: 'notice', cueIndex: a.index,
        title: `${labelA} to ${labelB}: only ${gap}ms gap`,
        detail: `Below the commonly-cited floor of ${o.minGapMs}ms (~2 frames at 24fps) -- too brief for many players to register as a new cue rather than a flicker of the same one.`,
      });
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    cues: enriched, findings, dangerCount, noticeCount, cueCount: enriched.length,
    ok: dangerCount === 0, inputError: null,
  };
}

/** Convenience: parse + classify in one call, surfacing parse errors as
 * danger findings so a caller (browser or CLI) needs to read only one list. */
export function checkCaptionsText(text, opts = {}) {
  const { format, cues, parseErrors } = parseCaptions(text);
  const report = classifyCaptions(cues, opts);
  const parseFindings = parseErrors.map((detail, i) => ({
    id: 'unparsable-block', severity: 'danger', cueIndex: -1,
    title: `Unparsable block ${i + 1}`, detail,
  }));
  return {
    format,
    ...report,
    findings: [...parseFindings, ...report.findings],
    dangerCount: report.dangerCount + parseFindings.length,
    ok: report.ok && parseFindings.length === 0,
  };
}
