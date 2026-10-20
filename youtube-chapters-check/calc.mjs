// YouTube chapter-list checker and converter. Pure functions, no I/O, no network.
// The chapter rules are read from memory of YouTube's help page on video chapters (first timestamp 0:00,
// at least three timestamps in ascending order, each chapter at least 10 seconds, description limit 5,000
// characters); confirm against the current page. Nothing here asks YouTube anything.

export const MIN_CHAPTERS = 3;
export const MIN_SECONDS = 10;
export const MAX_DESCRIPTION = 5000;
const LONG_TITLE = 80;

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

const TS = String.raw`\d{1,2}(?::\d{2}){1,3}(?:[.,]\d{1,3})?`;
const START_RE = new RegExp(String.raw`^[\s\-*•▶►>\[(]*(${TS})[\])]?[\s\-–—:|.)]*(.*)$`);
const END_RE = new RegExp(String.raw`^(.*?)[\s\-–—:|(\[]+(${TS})[\])]?\s*$`);
const AUDACITY_RE = /^(\d+(?:\.\d+)?)\t(\d+(?:\.\d+)?)\t(.*)$/;
const FRAME_TC = /^\d{1,2}:\d{2}:\d{2}[:;]\d{2}$/;

// "1:02:03", "12:30", "0:05.5" or "00:01:23:12" (HH:MM:SS:FF, needs fps) -> seconds, or null when the
// digits cannot be a time (minutes or seconds of 60 or more once a larger unit is present).
export function parseTimestamp(str, fps = 30) {
  const m = String(str).trim().match(/^(\d{1,3}(?::\d{1,2}){1,3})(?:[.,](\d{1,3}))?$/) || String(str).trim().match(/^(\d{1,3}(?:[:;]\d{1,2}){1,3})$/);
  if (!m) return null;
  const parts = m[1].split(/[:;]/).map(Number);
  const frac = m[2] ? Number("0." + m[2]) : 0;
  if (parts.length === 4) {
    const [h, mi, s, f] = parts;
    if (mi > 59 || s > 59 || f >= Math.max(1, Math.round(fps))) return null;
    return h * 3600 + mi * 60 + s + f / fps;
  }
  if (parts.some((p, i) => i > 0 && p > 59)) return null;
  const [a, b, c] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return a * 3600 + b * 60 + c + frac;
}

const clean = (t) => String(t).replace(/\s+/g, " ").replace(/^[\s\-–—:|.)]+/, "").trim();

// Text -> chapters. Understands "0:00 Title", "Title - 0:00", "[1:02:03] Title", Audacity label tracks
// (seconds <tab> seconds <tab> label) and Premiere-style marker exports (a name column and an HH:MM:SS:FF
// In column). Lines with no timestamp are prose and are counted, not reported as errors.
export function parseChapters(text, { fps = 30 } = {}) {
  const chapters = [], bad = [];
  let prose = 0;
  const lines = String(text).split(/\r\n|\n|\r/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const au = raw.match(AUDACITY_RE);
    if (au) {
      chapters.push({ line, seconds: Number(au[1]), title: clean(au[3]), format: "seconds", raw });
      return;
    }
    if (raw.includes("\t")) {
      const cols = raw.split("\t").map((c) => c.trim());
      const idx = cols.findIndex((c) => FRAME_TC.test(c));
      if (idx >= 0) {
        const s = parseTimestamp(cols[idx], fps);
        if (s === null) bad.push({ line, text: raw.trim() });
        else chapters.push({ line, seconds: s, title: clean(cols[0] === cols[idx] ? "" : cols[0]), format: "frames", raw });
        return;
      }
      if (/^marker name\t/i.test(raw)) return;
    }
    const m = raw.match(START_RE) || raw.match(END_RE);
    if (!m) { prose++; return; }
    const atStart = START_RE.test(raw);
    const stamp = atStart ? m[1] : m[2];
    const title = clean(atStart ? m[2] : m[1]);
    const s = parseTimestamp(stamp, fps);
    if (s === null) { bad.push({ line, text: raw.trim() }); return; }
    chapters.push({ line, seconds: s, title, format: formatKind(stamp), raw });
  });
  return { chapters, bad, prose, lines: lines.length };
}

function formatKind(stamp) {
  const p = stamp.split(":").length;
  return p === 4 ? "frames" : p === 3 ? "H:MM:SS" : "M:SS";
}

export function formatTime(seconds, long) {
  const t = Math.floor(seconds + 1e-9);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, "0");
  return long ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${h * 60 + m}:${ss}`;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// opts: duration (seconds, optional), fps (frame rate for HH:MM:SS:FF), offset (seconds subtracted from
// every time, for a cut intro).
export function validate(text, opts = {}) {
  const { duration = null, fps = 30, offset = 0 } = opts;
  const parsed = parseChapters(text, { fps });
  const findings = [];
  const add = (severity, title, detail, line = 0, fixable = false) => findings.push({ severity, title, detail, line, fixable });
  const chapters = parsed.chapters.map((c) => ({ ...c, seconds: c.seconds - offset }));

  for (const b of parsed.bad) add("error", "Not a valid time", `"${b.text.slice(0, 60)}" has digits that cannot be a time (minutes and seconds stop at 59).`, b.line);
  if (offset) add("info", `All times shifted by ${offset}s`, "The offset you entered was subtracted from every timestamp before checking.");
  if (String(text).length > MAX_DESCRIPTION) add("warning", "Longer than a YouTube description", `The text is ${String(text).length} characters; descriptions are limited to ${MAX_DESCRIPTION}. Paste only the chapter lines into the description.`);
  if (!parsed.chapters.length && !parsed.bad.length) {
    add("error", "No timestamps found", "Put one chapter per line, like \"0:00 Intro\". Audacity label tracks and Premiere marker exports are also read.");
    return result(findings, [], parsed, null);
  }

  const frames = chapters.some((c) => c.format === "frames");
  if (frames) add("info", `Frame timecodes read at ${fps} fps`, "HH:MM:SS:FF times were converted to seconds with the frame rate you chose; fractions of a second are dropped in the output.");

  chapters.forEach((c) => {
    if (c.seconds < 0) add("error", "Time is before the start after the offset", `"${c.title || c.raw.trim().slice(0, 40)}" falls ${Math.abs(c.seconds).toFixed(0)}s before 0:00 once the offset is applied.`, c.line);
    if (!c.title) add("error", "Chapter has no title", "A timestamp with no text after it shows as a blank chapter.", c.line);
    else if (c.title.length > LONG_TITLE) add("warning", "Long chapter title", `${c.title.length} characters; long titles are likely to be cut off in the chapter list on small screens.`, c.line);
    if (duration !== null && c.seconds >= duration) add("error", "Starts after the video ends", `${formatTime(c.seconds, duration >= 3600)} is at or past the ${formatTime(duration, duration >= 3600)} you entered as the video length.`, c.line);
  });

  const ok = chapters.filter((c) => c.seconds >= 0);
  let sorted = true;
  for (let i = 1; i < ok.length; i++) {
    if (ok[i].seconds < ok[i - 1].seconds) {
      sorted = false;
      add("error", "Not in ascending order", `${formatTime(ok[i].seconds, true)} comes after ${formatTime(ok[i - 1].seconds, true)}; YouTube needs timestamps in ascending order.`, ok[i].line, true);
    }
  }
  const byTime = [...ok].sort((a, b) => a.seconds - b.seconds || a.line - b.line);
  for (let i = 1; i < byTime.length; i++) {
    if (Math.floor(byTime[i].seconds) === Math.floor(byTime[i - 1].seconds)) {
      add("error", "Two chapters at the same time", `Lines ${byTime[i - 1].line} and ${byTime[i].line} both start at ${formatTime(byTime[i].seconds, true)}. Which title to keep cannot be decided for you.`, byTime[i].line);
    }
  }
  if (byTime.length && Math.floor(byTime[0].seconds) !== 0) {
    add("error", "First chapter does not start at 0:00", `The first timestamp is ${formatTime(byTime[0].seconds, true)}. YouTube only builds chapters when the list starts at 0:00; add a title for the opening seconds or shift the times.`, byTime[0].line, true);
  }
  if (ok.length < MIN_CHAPTERS) add("error", "Fewer than three chapters", `${plural(ok.length, "chapter")} found. YouTube needs at least ${MIN_CHAPTERS} timestamps.`);
  for (let i = 0; i < byTime.length; i++) {
    const next = i + 1 < byTime.length ? byTime[i + 1].seconds : duration;
    if (next === null || next === undefined) continue;
    const len = next - byTime[i].seconds;
    if (len > 0 && len < MIN_SECONDS && Math.floor(next) !== Math.floor(byTime[i].seconds)) {
      add("error", "Chapter shorter than 10 seconds", `"${byTime[i].title || "(untitled)"}" runs ${Math.floor(len)}s; YouTube's minimum is ${MIN_SECONDS}. Merge it into a neighbour or move the next timestamp.`, byTime[i].line);
    }
  }
  const kinds = new Set(chapters.filter((c) => c.format !== "seconds").map((c) => c.format));
  if (kinds.size > 1 && !frames) add("warning", "Mixed time formats", "Some times are M:SS and some H:MM:SS. YouTube reads both, but one format is easier to check; the cleaned list uses one.", 0, true);
  if (chapters.some((c) => c.format === "M:SS" && c.seconds >= 3600)) add("warning", "Hour-plus time written as minutes", "A time of an hour or more is written as M:SS (like 75:10); write it as H:MM:SS.", 0, true);

  return result(findings, chapters, parsed, sorted);
}

function result(findings, chapters, parsed, sorted) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return {
    findings,
    chapters,
    summary: { errors, warnings, chapters: chapters.length, fixable: findings.filter((f) => f.fixable).length, prose: parsed.prose, sorted },
  };
}

// opts: offset, fps, duration, introTitle (string; when given and the first chapter is after 0:00, a 0:00
// chapter with that title is added). Returns the cleaned chapter list as description text.
export function repair(text, opts = {}) {
  const { offset = 0, fps = 30, duration = null, introTitle = "" } = opts;
  const parsed = parseChapters(text, { fps });
  const changes = [];
  let chapters = parsed.chapters.map((c) => ({ ...c, seconds: c.seconds - offset }));
  if (offset) changes.push(`Shifted every time by ${offset}s.`);
  const dropped = chapters.filter((c) => c.seconds < 0);
  if (dropped.length) { changes.push(`Dropped ${plural(dropped.length, "chapter")} that fell before 0:00 after the shift.`); chapters = chapters.filter((c) => c.seconds >= 0); }
  const before = chapters.map((c) => c.line).join();
  chapters = chapters.map((c, i) => ({ ...c, i })).sort((a, b) => Math.floor(a.seconds) - Math.floor(b.seconds) || a.i - b.i);
  if (chapters.map((c) => c.line).join() !== before) changes.push("Put the chapters in ascending time order.");
  const seen = new Set();
  const keep = [];
  for (const c of chapters) {
    const key = Math.floor(c.seconds) + "|" + c.title.toLowerCase();
    if (seen.has(key)) { changes.push(`Dropped a repeat of "${c.title}" at ${formatTime(c.seconds, true)}.`); continue; }
    seen.add(key);
    keep.push(c);
  }
  chapters = keep;
  if (introTitle.trim() && chapters.length && Math.floor(chapters[0].seconds) !== 0) {
    chapters.unshift({ seconds: 0, title: clean(introTitle), format: "M:SS", line: 0 });
    changes.push(`Added a 0:00 chapter titled "${clean(introTitle)}".`);
  }
  const long = (duration ?? 0) >= 3600 || chapters.some((c) => c.seconds >= 3600);
  const out = toDescription(chapters, long);
  if (chapters.length && out) changes.push(`Wrote every time as ${long ? "H:MM:SS" : "M:SS"} with one space before the title.`);
  return { text: out, chapters, changes };
}

export function toDescription(chapters, long) {
  const useLong = long ?? chapters.some((c) => c.seconds >= 3600);
  return chapters.map((c) => `${formatTime(c.seconds, useLong)} ${c.title}`.trimEnd()).join("\n") + (chapters.length ? "\n" : "");
}

// Podcasting 2.0 chapters.json (version 1.2.0).
export function toChaptersJson(chapters) {
  return JSON.stringify({ version: "1.2.0", chapters: chapters.map((c) => ({ startTime: Math.floor(c.seconds), title: c.title })) }, null, 2) + "\n";
}

// FFmpeg FFMETADATA1 chapters in milliseconds; needs the video length for the last END.
export function toFfmetadata(chapters, duration) {
  if (!chapters.length || !(duration > 0)) return null;
  const lines = [";FFMETADATA1"];
  chapters.forEach((c, i) => {
    const start = Math.floor(c.seconds) * 1000;
    const end = i + 1 < chapters.length ? Math.floor(chapters[i + 1].seconds) * 1000 : Math.floor(duration) * 1000;
    lines.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${start}`, `END=${Math.max(end, start)}`, `title=${c.title.replace(/([=;#\\])/g, "\\$1")}`);
  });
  return lines.join("\n") + "\n";
}

// WebVTT chapters track (kind="chapters"), each cue ending where the next begins.
export function toWebVtt(chapters, duration) {
  if (!chapters.length || !(duration > 0)) return null;
  const ts = (s) => { const t = Math.floor(s); return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}.000`; };
  const cues = chapters.map((c, i) => `${i + 1}\n${ts(c.seconds)} --> ${ts(i + 1 < chapters.length ? chapters[i + 1].seconds : duration)}\n${c.title}`);
  return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
}

export function findingsCsv(res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,title,detail,auto_fixed", ...res.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return ["0:00 Intro", "0:48 Why chapters help", "3:15 Setting up the project", "11:02 The part everyone gets wrong", "18:30 Wrap-up and next steps", ""].join("\n");
}

export function sampleBrokenFile() {
  return [
    "Chapters for the video:",
    "0:45 Intro",
    "3:15 - Setting up the project",
    "2:10 Why chapters help",
    "3:20 Quick tip",
    "11:75 The part everyone gets wrong",
    "[18:30]",
    "Thanks for watching!",
    "",
  ].join("\n");
}
