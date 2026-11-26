// Splits an uploaded interview transcript into turns. Supports WebVTT and SRT cues, "Name:" speaker
// labels and Q:/A: transcripts. Respondent = every speaker who is not the interviewer. With no
// recognisable structure the whole text becomes a single respondent turn.
import type { TurnRole } from "@shared/enums";

export interface ParsedTurn {
  role: TurnRole;
  speaker: string | null;
  content: string;
}

export type TranscriptFormat = "vtt" | "srt" | "labeled" | "plain";

export interface ParsedTranscript {
  format: TranscriptFormat;
  turns: ParsedTurn[];
  /** "Speaker: text" lines (or the raw text for plain transcripts) — what we store as the document. */
  normalizedText: string;
}

export interface ParseOptions {
  /** Speaker names to treat as the interviewer (case-insensitive). */
  interviewerNames?: string[];
}

const TIMING_RE =
  /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\s*-->\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/;
const INTERVIEWER_LABEL_RE =
  /^(?:q|question|interviewer|int|host|moderator|facilitator|ai|grant autopilot)$/i;
const RESPONDENT_LABEL_RE = /^(?:a|answer|respondent|interviewee|guest)$/i;
/** Optional leading timestamp, then a short speaker label followed by a colon. */
const LABEL_LINE_RE =
  /^\s*(?:[[(]?(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?[\])]?\s*[-–]?\s*)?([A-Za-z][\w.'’\- ]{0,40}?)\s*(?:[[(](?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?[\])])?\s*[:：]\s*(.*)$/;
/** Words that commonly precede a colon in prose and are not speakers. */
const NOT_SPEAKERS = new Set([
  "note",
  "notes",
  "date",
  "time",
  "location",
  "subject",
  "re",
  "title",
  "topic",
  "agenda",
  "summary",
  "http",
  "https",
  "example",
  "goal",
  "goals",
  "mission",
  "budget",
  "total",
  "attendees",
  "participants",
]);

interface RawSegment {
  speaker: string | null;
  text: string;
}

export function detectFormat(text: string, filename?: string): TranscriptFormat {
  const name = filename?.toLowerCase() ?? "";
  const head = text.replace(/^\uFEFF/, "").trimStart();
  if (name.endsWith(".vtt") || head.startsWith("WEBVTT")) return "vtt";
  const lines = head.split(/\r?\n/, 12);
  if (name.endsWith(".srt") || (/^\d+\s*$/.test(lines[0] ?? "") && TIMING_RE.test(lines[1] ?? "")))
    return "srt";
  return "labeled";
}

export function parseTranscript(
  input: string,
  opts: ParseOptions & { filename?: string } = {},
): ParsedTranscript {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const format = detectFormat(text, opts.filename);
  let segments: RawSegment[] | null;
  if (format === "vtt" || format === "srt") segments = parseCues(text, format);
  else segments = parseLabeled(text);

  if (!segments || segments.length === 0 || segments.every((s) => s.speaker === null)) {
    const content =
      format === "vtt" || format === "srt"
        ? (segments ?? [])
            .map((s) => s.text)
            .join(" ")
            .trim()
        : text.trim();
    return {
      format: format === "labeled" ? "plain" : format,
      turns: content ? [{ role: "respondent", speaker: null, content }] : [],
      normalizedText: content,
    };
  }

  const merged = mergeConsecutive(segments);
  const interviewer = pickInterviewers(merged, opts.interviewerNames ?? []);
  const turns: ParsedTurn[] = merged.map((s) => ({
    role: s.speaker && interviewer.has(s.speaker.toLowerCase()) ? "interviewer" : "respondent",
    speaker: s.speaker,
    content: s.text,
  }));
  const normalizedText =
    format === "labeled"
      ? text.trim()
      : turns.map((t) => (t.speaker ? `${t.speaker}: ${t.content}` : t.content)).join("\n\n");
  return { format, turns, normalizedText };
}

/** WebVTT / SRT: drop headers, indices and timings; speaker from <v Name> or "Name:" prefix. */
function parseCues(text: string, format: "vtt" | "srt"): RawSegment[] {
  const blocks = text.split(/\n\s*\n/);
  const out: RawSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim());
    const timingIdx = lines.findIndex((l) => TIMING_RE.test(l));
    if (timingIdx < 0) continue; // WEBVTT header, NOTE, STYLE, REGION blocks
    if (format === "vtt" && /^(NOTE|STYLE|REGION)\b/.test(lines[0] ?? "")) continue;
    const body = lines.slice(timingIdx + 1).filter(Boolean);
    if (body.length === 0) continue;
    let speaker: string | null = null;
    const textParts: string[] = [];
    for (const raw of body) {
      const voice = raw.match(/^<v(?:\.[\w.-]+)?\s+([^>]+)>/);
      if (voice?.[1]) speaker = voice[1].trim();
      let line = stripCueTags(raw);
      if (!voice) {
        const m = line.match(LABEL_LINE_RE);
        if (m?.[1] && isPlausibleSpeaker(m[1]) && m[2] !== undefined) {
          speaker = m[1].trim();
          line = m[2].trim();
        }
      }
      if (line) textParts.push(line);
    }
    const t = textParts.join(" ").replace(/\s+/g, " ").trim();
    if (t) out.push({ speaker, text: t });
  }
  // Cues without a speaker continue the previous speaker.
  let last: string | null = null;
  for (const s of out) {
    if (s.speaker) last = s.speaker;
    else s.speaker = last;
  }
  return out;
}

function stripCueTags(line: string): string {
  return line
    .replace(/<\/?(?:v|c|i|b|u|lang|ruby|rt)(?:[.\s][^>]*)?>/g, "")
    .replace(/<\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function isPlausibleSpeaker(label: string): boolean {
  const l = label.trim();
  if (!l || l.length > 40) return false;
  if (NOT_SPEAKERS.has(l.toLowerCase())) return false;
  if (INTERVIEWER_LABEL_RE.test(l) || RESPONDENT_LABEL_RE.test(l)) return true;
  if (/\d/.test(l)) return false;
  const words = l.split(/\s+/);
  if (words.length > 4) return false;
  // Names: every word capitalised, except common surname particles ("Maria de la Cruz").
  return words.every((w, i) => /^[A-Z]/.test(w) || (i > 0 && NAME_PARTICLES.has(w)));
}

const NAME_PARTICLES = new Set([
  "de",
  "la",
  "del",
  "da",
  "di",
  "van",
  "von",
  "der",
  "le",
  "al",
  "bin",
]);

/** "Name: text" transcripts. Returns null when the text does not look speaker-labelled. */
function parseLabeled(text: string): RawSegment[] | null {
  const lines = text.split("\n");
  const segs: RawSegment[] = [];
  let current: { speaker: string; parts: string[] } | null = null;
  let labelCount = 0;
  const speakers = new Map<string, number>();

  for (const raw of lines) {
    const m = raw.match(LABEL_LINE_RE);
    if (m?.[1] && isPlausibleSpeaker(m[1])) {
      const speaker = canonicalSpeaker(m[1]);
      labelCount++;
      speakers.set(speaker.toLowerCase(), (speakers.get(speaker.toLowerCase()) ?? 0) + 1);
      if (current) segs.push({ speaker: current.speaker, text: joinParts(current.parts) });
      current = { speaker, parts: [m[2] ?? ""] };
    } else if (current) {
      current.parts.push(raw);
    }
    // Text before the first label (titles, dates, attendee lists) is kept only in the document.
  }
  if (current) segs.push({ speaker: current.speaker, text: joinParts(current.parts) });

  // Need real dialogue structure: ≥2 labelled lines and either ≥2 speakers or a repeated speaker.
  const repeated = [...speakers.values()].some((n) => n >= 2);
  if (labelCount < 2 || (speakers.size < 2 && !repeated) || speakers.size > 8) return null;
  return segs.filter((s) => s.text);
}

function canonicalSpeaker(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function joinParts(parts: string[]): string {
  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergeConsecutive(segs: RawSegment[]): RawSegment[] {
  const out: RawSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === s.speaker) prev.text = `${prev.text} ${s.text}`.trim();
    else out.push({ ...s });
  }
  return out;
}

/** Lower-cased speaker names that are the interviewer. */
function pickInterviewers(segs: RawSegment[], configured: string[]): Set<string> {
  const names = new Set(configured.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const speakers = [...new Set(segs.map((s) => s.speaker).filter((s): s is string => !!s))];
  if (names.size > 0) return names;

  const explicit = speakers.filter((s) => INTERVIEWER_LABEL_RE.test(s));
  if (explicit.length > 0) return new Set(explicit.map((s) => s.toLowerCase()));
  // Q/A transcripts with only answer labels: nobody is the interviewer.
  if (speakers.length < 2) return new Set();

  // Otherwise: the speaker whose turns are mostly questions.
  let best: { name: string; ratio: number; count: number } | null = null;
  for (const name of speakers) {
    const turns = segs.filter((s) => s.speaker === name);
    const questions = turns.filter((s) => /\?\s*$|\?["'”)]?\s*$/.test(s.text)).length;
    const ratio = questions / turns.length;
    if (!best || ratio > best.ratio || (ratio === best.ratio && turns.length > best.count)) {
      best = { name, ratio, count: turns.length };
    }
  }
  if (best && best.ratio >= 0.5) return new Set([best.name.toLowerCase()]);
  // Fall back to whoever speaks first if their first turn is a question.
  const first = segs[0];
  if (first?.speaker && /\?/.test(first.text)) return new Set([first.speaker.toLowerCase()]);
  return new Set();
}
