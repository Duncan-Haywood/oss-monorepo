// Subtitle resync engine: move every cue of an SRT or WebVTT file onto the
// timeline of the video you actually have.
//
// Out-of-sync subtitles almost always fail in one of three ways, and each
// one is a straight-line (affine) map from the file's times to the video's:
//
//   constant offset   every cue is early or late by the same amount (a
//                     different intro, a trimmed studio logo):
//                     t' = t + d
//   frame-rate drift  the file was timed against a release running at a
//                     different frame rate (the classic case is a 25 fps
//                     PAL release, which plays 23.976 fps film about 4.3% fast),
//                     so the error grows steadily through the film:
//                     t' = s * t,   s = fromFps / toFps
//   both              t' = s * t + d
//
// Three ways to find (s, d), from the least to the most automatic:
//
//   1. typed:      an offset and/or a frame-rate pair
//   2. two points: "this line should be at 00:01:02,000, that line at
//                  01:40:10,500"; two (old, new) pairs fix the line exactly
//   3. reference:  a correctly timed subtitle file for the same video (often
//                  another language), aligned by timing pattern alone, so
//                  the two files never need to share a word
//
// The reference alignment (autoAlign below) is a vote, then a fit. For each
// candidate scale (1 and every ratio between the common frame rates) every
// pair of (target cue, reference cue) votes for the offset that would put
// one on the other. Pairs that genuinely correspond all vote for the same
// offset; unrelated pairs scatter their votes. The scale whose best offset
// window collects most votes wins, and a least-squares fit over the cues
// that then land within a shrinking tolerance of a reference cue refines it.
// It is an original implementation of a standard robust-registration idea
// (Hough-style voting, then least squares on inliers). alass
// (github.com/kaegi/alass, GPL-3.0) aligns subtitles to a reference too and
// also handles split edits; no code of it is used or ported here.
//
// Pure, no I/O, no network: the CLI and the browser page call the same
// functions, so they cannot disagree about a file.

const TIMESTAMP_RE = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;

/** Exact frame rates. 23.976 and 29.97 are NTSC's 24000/1001 and 30000/1001. */
export const FRAME_RATES = Object.freeze({
  '23.976': 24000 / 1001,
  '24': 24,
  '25': 25,
  '29.97': 30000 / 1001,
  '30': 30,
});

/** @returns {number|null} milliseconds, or null if unparsable */
export function parseTimestamp(raw) {
  const m = TIMESTAMP_RE.exec(String(raw).trim());
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (minutes > 59 || seconds > 59) return null;
  // "1,5" is half a second, not 5 ms: a short fraction is right-padded.
  const millis = Number(m[4].padEnd(3, '0'));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/**
 * Parses a user-typed time: a subtitle timestamp ("01:02:03,500",
 * "02:03.5") or plain signed seconds ("-2.5", "+90").
 * @returns {number|null} milliseconds
 */
export function parseUserTime(raw) {
  const s = String(raw).trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const neg = s.startsWith('-');
  const ms = parseTimestamp(neg || s.startsWith('+') ? s.slice(1) : s);
  if (ms === null) return null;
  return neg ? -ms : ms;
}

/** @param {'srt'|'webvtt'} format */
export function formatTimestamp(ms, format = 'srt') {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const sep = format === 'webvtt' ? '.' : ',';
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(milli, 3)}`;
}

/**
 * Parses SRT or WebVTT text.
 * - WebVTT header blocks before the first cue (the WEBVTT line, STYLE,
 *   REGION, NOTE) are kept verbatim and written back out.
 * - NOTE blocks after the first cue are dropped and counted.
 * - A block with a "-->" line whose timestamps do not parse is reported
 *   and skipped, never silently treated as text.
 *
 * @returns {{format:'srt'|'webvtt'|'unknown', headerBlocks:string[], cues:Array<{id:string|null,startMs:number,endMs:number,settings:string,lines:string[]}>, errors:string[], droppedNotes:number}}
 */
export function parseSubtitles(text) {
  const normalized = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const format = /^WEBVTT(?:[ \t]|$)/m.test(normalized.split('\n')[0] ?? '')
    ? 'webvtt'
    : (normalized.trim() ? 'srt' : 'unknown');
  const blocks = normalized.split(/\n[ \t]*\n+/).map((b) => b.replace(/^\n+|\n+$/g, '')).filter((b) => b.trim());
  const headerBlocks = [];
  const cues = [];
  const errors = [];
  let droppedNotes = 0;

  for (const block of blocks) {
    const lines = block.split('\n');
    const arrowIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowIdx === -1) {
      if (format === 'webvtt' && cues.length === 0) headerBlocks.push(block);
      else if (format === 'webvtt' && /^NOTE(\s|$)/.test(lines[0])) droppedNotes++;
      else errors.push(`Skipped a block with no "-->" timing line: "${lines[0].slice(0, 60)}"`);
      continue;
    }
    if (arrowIdx > 1) {
      errors.push(`Skipped a block with ${arrowIdx} lines before its timing line: "${lines[0].slice(0, 60)}"`);
      continue;
    }
    const arrow = lines[arrowIdx];
    const m = /^\s*(\S+)\s*-->\s*(\S+)(.*)$/.exec(arrow);
    const startMs = m ? parseTimestamp(m[1]) : null;
    const endMs = m ? parseTimestamp(m[2]) : null;
    if (startMs === null || endMs === null) {
      errors.push(`Skipped a cue with an unreadable timing line: "${arrow.trim().slice(0, 80)}"`);
      continue;
    }
    cues.push({
      id: arrowIdx === 1 ? lines[0].trim() : null,
      startMs,
      endMs,
      settings: format === 'webvtt' ? m[3].trim() : '',
      lines: lines.slice(arrowIdx + 1),
    });
  }
  return { format, headerBlocks, cues, errors, droppedNotes };
}

/**
 * Writes cues back out. SRT cues are renumbered 1..n (SRT players expect a
 * sequence; the old numbers mean nothing once cues are dropped). WebVTT cue
 * ids and settings are kept.
 * @param {'srt'|'webvtt'} format
 */
export function serializeSubtitles(cues, format = 'srt', headerBlocks = []) {
  if (format === 'webvtt') {
    const head = headerBlocks.length ? headerBlocks : ['WEBVTT'];
    const body = cues.map((c) => {
      const timing = `${formatTimestamp(c.startMs, 'webvtt')} --> ${formatTimestamp(c.endMs, 'webvtt')}${c.settings ? ` ${c.settings}` : ''}`;
      return [c.id, timing, ...c.lines].filter((l) => l !== null && l !== undefined).join('\n');
    });
    return `${[...head, ...body].join('\n\n')}\n`;
  }
  return cues.map((c, i) => [
    String(i + 1),
    `${formatTimestamp(c.startMs, 'srt')} --> ${formatTimestamp(c.endMs, 'srt')}`,
    ...c.lines,
  ].join('\n')).join('\n\n') + '\n';
}

/**
 * The scale that moves subtitles timed against a release at `fromFps` onto
 * a release at `toFps` of the same film. A given frame n sits at n/fromFps
 * in the first and n/toFps in the second, so t' = t * fromFps / toFps.
 */
export function frameRateScale(fromFps, toFps) {
  const from = typeof fromFps === 'string' ? (FRAME_RATES[fromFps] ?? Number(fromFps)) : fromFps;
  const to = typeof toFps === 'string' ? (FRAME_RATES[toFps] ?? Number(toFps)) : toFps;
  if (!(from > 0) || !(to > 0)) throw new Error(`Frame rates must be positive numbers (got ${fromFps} and ${toFps}).`);
  return from / to;
}

/**
 * The line through two (old time, new time) points.
 * @param {{fromMs:number,toMs:number}} a
 * @param {{fromMs:number,toMs:number}} b
 */
export function twoPointTransform(a, b) {
  if (a.fromMs === b.fromMs) throw new Error('The two sync points must be at different times in the subtitle file.');
  const scale = (b.toMs - a.toMs) / (b.fromMs - a.fromMs);
  if (!(scale > 0)) throw new Error('The two sync points reverse the order of the subtitles: the later line would end up earlier. Check which time goes with which line.');
  return { scale, offsetMs: a.toMs - scale * a.fromMs };
}

/**
 * Applies t' = scale * t + offsetMs to every cue, rounding to whole ms.
 * A cue that ends at or before 0 is dropped (it would play before the
 * video starts); one that starts before 0 is clamped to 0.
 */
export function applyTransform(cues, { scale = 1, offsetMs = 0 } = {}) {
  const out = [];
  let dropped = 0;
  let clamped = 0;
  for (const c of cues) {
    const startMs = Math.round(scale * c.startMs + offsetMs);
    const endMs = Math.round(scale * c.endMs + offsetMs);
    if (endMs <= 0) { dropped++; continue; }
    if (startMs < 0) clamped++;
    out.push({ ...c, startMs: Math.max(0, startMs), endMs });
  }
  return { cues: out, dropped, clamped };
}

/** Candidate scales for autoAlign: 1 and every ratio between FRAME_RATES. */
export function candidateScales() {
  const rates = Object.entries(FRAME_RATES);
  const seen = new Map([['1', { scale: 1, label: 'same frame rate' }]]);
  for (const [fromName, from] of rates) {
    for (const [toName, to] of rates) {
      if (from === to) continue;
      const scale = from / to;
      const key = scale.toFixed(6);
      if (!seen.has(key)) seen.set(key, { scale, label: `${fromName} → ${toName} fps` });
    }
  }
  return [...seen.values()];
}

function nearestIndex(sorted, x) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1] - x) <= Math.abs(sorted[lo] - x)) return lo - 1;
  return lo;
}

function matchPairs(targetStarts, refStarts, scale, offsetMs, tolMs) {
  const pairs = [];
  for (const t of targetStarts) {
    const p = scale * t + offsetMs;
    const j = nearestIndex(refStarts, p);
    const r = refStarts[j];
    if (Math.abs(r - p) <= tolMs) pairs.push([t, r]);
  }
  return pairs;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fitLine(pairs) {
  const n = pairs.length;
  let mt = 0; let mr = 0;
  for (const [t, r] of pairs) { mt += t; mr += r; }
  mt /= n; mr /= n;
  let stt = 0; let str = 0;
  for (const [t, r] of pairs) { stt += (t - mt) ** 2; str += (t - mt) * (r - mr); }
  const scale = str / stt;
  return { scale, offsetMs: mr - scale * mt };
}

/**
 * Finds (scale, offset) that puts `targetCues` on `referenceCues`' timeline.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxOffsetMs=900000]  largest offset searched (15 min)
 * @param {number} [opts.binMs=100]           vote histogram resolution
 * @param {number} [opts.windowBins=5]        votes are summed over this many bins
 * @param {boolean} [opts.offsetOnly=false]   search scale 1 only, fit offset only
 * @returns {{scale:number, offsetMs:number, scaleLabel:string, matched:number, total:number, matchFraction:number, medianErrorMs:number|null, confidence:'high'|'medium'|'low', candidates:Array<{label:string,scale:number,votes:number}>}}
 */
export function autoAlign(targetCues, referenceCues, opts = {}) {
  const { maxOffsetMs = 900000, binMs = 100, windowBins = 5, offsetOnly = false } = opts;
  if (targetCues.length < 3 || referenceCues.length < 3) {
    throw new Error('Automatic alignment needs at least 3 cues in each file.');
  }
  const targetStarts = targetCues.map((c) => c.startMs).sort((a, b) => a - b);
  const refStarts = referenceCues.map((c) => c.startMs).sort((a, b) => a - b);
  const nBins = Math.floor((2 * maxOffsetMs) / binMs) + 1;
  const scales = offsetOnly ? [{ scale: 1, label: 'same frame rate' }] : candidateScales();

  const candidates = [];
  for (const { scale, label } of scales) {
    const hist = new Uint32Array(nBins);
    for (const t of targetStarts) {
      const st = scale * t;
      // Only reference cues within maxOffsetMs of st can vote.
      let j = nearestIndex(refStarts, st - maxOffsetMs);
      if (refStarts[j] < st - maxOffsetMs) j++;
      for (; j < refStarts.length; j++) {
        const d = refStarts[j] - st;
        if (d > maxOffsetMs) break;
        hist[Math.round((d + maxOffsetMs) / binMs)]++;
      }
    }
    let best = -1; let bestBin = 0; let sum = 0;
    for (let b = 0; b < nBins; b++) {
      sum += hist[b];
      if (b >= windowBins) sum -= hist[b - windowBins];
      if (sum > best) { best = sum; bestBin = b - (windowBins - 1) / 2; }
    }
    candidates.push({ label, scale, votes: best, offsetMs: bestBin * binMs - maxOffsetMs });
  }
  candidates.sort((a, b) => b.votes - a.votes);
  const top = candidates[0];

  let scale = top.scale;
  let offsetMs = top.offsetMs;
  let pairs = [];
  for (const tol of [1000, 600, 400, 400]) {
    pairs = matchPairs(targetStarts, refStarts, scale, offsetMs, tol);
    if (!pairs.length) break;
    const span = pairs[pairs.length - 1][0] - pairs[0][0];
    if (!offsetOnly && pairs.length >= 10 && span >= 60000) {
      ({ scale, offsetMs } = fitLine(pairs));
    } else {
      offsetMs = median(pairs.map(([t, r]) => r - scale * t));
    }
  }
  pairs = matchPairs(targetStarts, refStarts, scale, offsetMs, 400);
  const residuals = pairs.map(([t, r]) => Math.abs(r - (scale * t + offsetMs)));
  const matched = pairs.length;
  const total = targetStarts.length;
  const matchFraction = matched / total;
  const medianErrorMs = residuals.length ? Math.round(median(residuals)) : null;
  const confidence = matchFraction >= 0.6 && medianErrorMs !== null && medianErrorMs <= 250
    ? 'high'
    : (matchFraction >= 0.35 ? 'medium' : 'low');
  return {
    scale,
    offsetMs,
    scaleLabel: top.label,
    matched,
    total,
    matchFraction,
    medianErrorMs,
    confidence,
    candidates: candidates.map(({ label, scale: s, votes }) => ({ label, scale: s, votes })),
  };
}

/**
 * One call for both surfaces.
 * @param {string} text  the subtitle file to fix
 * @param {object} spec
 * @param {number} [spec.offsetMs]            added after any scale
 * @param {[string|number,string|number]} [spec.fps]  [from, to]
 * @param {Array<{fromMs:number,toMs:number}>} [spec.syncPoints]  one (offset) or two (line)
 * @param {string} [spec.referenceText]       a correctly timed file to align to
 * @param {boolean} [spec.offsetOnly]         reference mode: keep scale 1
 * @param {'srt'|'webvtt'} [spec.outputFormat] defaults to the input's format
 */
export function resyncText(text, spec = {}) {
  const doc = parseSubtitles(text);
  if (doc.format === 'unknown' || doc.cues.length === 0) {
    return { inputError: 'No subtitle cues found. Paste an SRT or WebVTT file (cues look like "00:00:01,000 --> 00:00:03,500").', errors: doc.errors };
  }
  const modes = [spec.referenceText ? 'reference' : null, spec.syncPoints?.length ? 'sync' : null, spec.fps ? 'fps' : null].filter(Boolean);
  if (modes.length > 1) {
    return { inputError: `Pick one way to find the timing (got ${modes.join(' and ')}). An extra offset can be added to any of them.`, errors: doc.errors };
  }
  let scale = 1;
  let offsetMs = 0;
  let method = 'offset';
  let alignment = null;
  try {
    if (spec.referenceText) {
      const ref = parseSubtitles(spec.referenceText);
      if (ref.cues.length === 0) return { inputError: 'The reference file has no readable subtitle cues.', errors: doc.errors };
      alignment = autoAlign(doc.cues, ref.cues, { offsetOnly: spec.offsetOnly });
      ({ scale, offsetMs } = alignment);
      method = 'reference';
    } else if (spec.syncPoints?.length === 1) {
      offsetMs = spec.syncPoints[0].toMs - spec.syncPoints[0].fromMs;
      method = 'one-point';
    } else if (spec.syncPoints?.length === 2) {
      ({ scale, offsetMs } = twoPointTransform(spec.syncPoints[0], spec.syncPoints[1]));
      method = 'two-point';
    } else if (spec.syncPoints?.length > 2) {
      return { inputError: 'Give one sync point (a shift) or two (a shift and a stretch), not more.', errors: doc.errors };
    } else if (spec.fps) {
      scale = frameRateScale(spec.fps[0], spec.fps[1]);
      method = 'fps';
    }
  } catch (err) {
    return { inputError: err.message, errors: doc.errors };
  }
  offsetMs += spec.offsetMs ?? 0;
  if (!Number.isFinite(scale) || !Number.isFinite(offsetMs)) {
    return { inputError: 'The timing works out to a non-number; check the values typed.', errors: doc.errors };
  }
  const format = spec.outputFormat ?? doc.format;
  // SRT's sequence numbers are not WebVTT cue ids; converting drops them.
  const source = doc.format === 'srt' && format === 'webvtt' ? doc.cues.map((c) => ({ ...c, id: null })) : doc.cues;
  const moved = applyTransform(source, { scale, offsetMs });
  const headerBlocks = format === 'webvtt' && doc.format === 'webvtt' ? doc.headerBlocks : [];
  return {
    output: serializeSubtitles(moved.cues, format, headerBlocks),
    format,
    inputFormat: doc.format,
    method,
    scale,
    offsetMs,
    alignment,
    cueCount: doc.cues.length,
    outputCueCount: moved.cues.length,
    dropped: moved.dropped,
    clamped: moved.clamped,
    droppedNotes: doc.droppedNotes,
    errors: doc.errors,
    firstBefore: doc.cues[0].startMs,
    firstAfter: moved.cues[0]?.startMs ?? null,
    lastBefore: doc.cues[doc.cues.length - 1].startMs,
    lastAfter: moved.cues[moved.cues.length - 1]?.startMs ?? null,
  };
}
