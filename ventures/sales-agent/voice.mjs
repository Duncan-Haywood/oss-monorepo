// Sales Agent voice helpers (goals.md, "Direction: voice, chat and agents as primary ways in"). Pure text functions, so they
// can be tested without a microphone: turn what a browser's speech recognition heard into call-note lines, and turn a
// brief or draft into text that reads aloud cleanly. The page wires them to the browser's own SpeechRecognition and
// speechSynthesis; nothing here records, stores or sends audio.

// Spoken commands a rep says while dictating, in the order they are tried.
const BREAKS = /\b(?:new line|next point|new point|next line|new bullet)\b[,.]?/gi;

/** Dictated text -> one call-note point per line. "next point" / "new line" starts a line; "period" ends a sentence. */
export function dictationToLines(heard) {
  let t = String(heard || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  t = t.replace(BREAKS, "\n");
  t = t.replace(/\s+(?:full stop|period)\b[,.]?/gi, ".").replace(/\s+question mark\b/gi, "?").replace(/\s+comma\b/gi, ",");
  return t.split("\n").map((l) => l.replace(/\s+([.,?])/g, "$1").trim()).filter(Boolean).map((l) => {
    const s = l.charAt(0).toUpperCase() + l.slice(1);
    return /[.!?]$/.test(s) ? s : s + ".";
  });
}

/** Appends dictated lines to existing notes, one point per line, without touching what is already there. */
export function appendDictation(existing, heard) {
  const add = dictationToLines(heard);
  if (!add.length) return String(existing || "");
  const base = String(existing || "").replace(/\s+$/, "");
  return (base ? base + "\n" : "") + add.join("\n");
}

/** Brief or draft text -> something a speech voice reads well: no markdown marks, no table pipes, email addresses spoken. */
export function speakable(text) {
  return String(text || "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)/g, (_, u, d) => u + " at " + d.replace(/\./g, " dot "))
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
