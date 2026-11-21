// P6 notebooks <-> Microsoft Project notes.
//
// P6 keeps an activity's (and a WBS node's) notes as notebook entries: one
// row per notebook topic (MEMOTYPE, e.g. "Description", "Delays",
// "Anticipated Problems") in TASKMEMO (WBSMEMO for a WBS node), each an HTML
// fragment written by P6's rich-text editor, with every line break in the
// XER stored as two 0x7F bytes. Project has one plain-text Notes field per
// task (MSPDI's <Notes>).
//
// So, from P6 to Project, a task's notebook entries become its notes, topic
// by topic in P6's topic order, each under its topic's name in brackets:
//
//   [Description]
//   Pour after the cube test results.
//
//   [Delays]
//   Rain 12-14 March.
//
// and from Project to P6 a note written that way comes back as one notebook
// entry per topic; a note with no bracketed first line (a Project planner's
// own) becomes one entry under the topic "Notes". The text survives the trip;
// P6's formatting (bold, colours, fonts) does not, since Project's XML notes
// are plain text.
//
// memoText(html) -> plain text      memoHtml(text) -> P6 notebook HTML
// notesText(sections) -> Project notes    parseNotes(notes) -> sections

export const NOTES_TOPIC = "Notes"; // the topic a Project note with no heading goes under
export const CONVERSION_TOPIC = "Converted from P6"; // this tool's own note on LOE / WBS summary tasks; not a notebook
const MEMO_TYPE_MAX = 40; // MEMOTYPE.memo_type in P6
// a topic heading: a whole line "[Topic]" from the first column
const HEAD = /^\[([^\]\n]{1,80})\]\s*$/;

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", deg: "°", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", frac12: "½", frac14: "¼", frac34: "¾", times: "×", plusmn: "±" };
const entity = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
  if (e[0] === "#") {
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n === 160 ? 32 : n) : m;
  }
  return NAMED[e.toLowerCase()] ?? m;
});

// A P6 notebook entry (HTML, or plain text as some exports hold) -> its text:
// paragraphs, line breaks, list items and table rows on lines of their own,
// markup and the <HEAD> dropped, entities decoded, runs of spaces folded.
export function memoText(memo) {
  let s = String(memo ?? "").replace(/\x7f\x7f/g, "\n").replace(/\x7f/g, "\n").replace(/\r\n?/g, "\n");
  if (!/<[a-z!/]/i.test(s)) return tidy(entity(s));
  s = s.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\n/g, " ") // in HTML a line break in the source is a space
    // a block's edges (paragraph, list item, row) are one line break however
    // many tags meet there, and the spaces around them are layout, not text;
    // an empty paragraph written as &nbsp; is a blank line
    .replace(/\s*(<\/?(?:p|div|h[1-6]|ul|ol|li|tr|table|tbody|thead|blockquote|pre)\b[^>]*>)\s*/gi, "$1")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\u0001- ")
    .replace(/<\/?(?:p|div|h[1-6]|ul|ol|li|tr|table|tbody|thead|blockquote|pre)\b[^>]*>/gi, "\u0001")
    .replace(/<\/t[dh]\s*>/gi, "\t")
    .replace(/<[^>]*>/g, "");
  s = entity(s).replace(/\u0001+/g, "\u0001").replace(/^\u0001|\u0001$/g, "").replace(/\u0001/g, "\n");
  return tidy(s);
}
function tidy(s) {
  const lines = s.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim());
  const out = [];
  for (const l of lines) if (l || (out.length && out[out.length - 1] !== "")) out.push(l);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Plain text -> the HTML P6 Web writes for a notebook entry, one <P> per line
// (an empty line as an empty paragraph), with no line break or tab in the value, so
// the XER row stays on one line for every P6 version's import.
export function memoHtml(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n");
  return `<HTML><BODY>${lines.map((l) => (l.trim() ? `<P>${escHtml(l)}</P>` : "<P>&nbsp;</P>")).join("")}</BODY></HTML>`;
}

// [{ topic, text }] -> Project notes. Empty entries are left out; topics keep
// the order given (P6's topic order).
export function notesText(sections) {
  const kept = sections.filter((x) => x.text && x.text.trim());
  // a lone "Notes" entry (a Project note that went to P6 and back) is written
  // as it was, with no heading, unless its own first line looks like one
  if (kept.length === 1 && kept[0].topic === NOTES_TOPIC && !HEAD.test(kept[0].text.trim().split("\n")[0])) return kept[0].text.trim();
  // a body line that would read as a heading ("[see A-101]" after a blank
  // line) is indented one space, so it stays in its entry on the way back
  const body = (t) => t.trim().split("\n").map((l) => (HEAD.test(l) ? ` ${l}` : l)).join("\n");
  return kept.map((x) => `[${x.topic}]\n${body(x.text)}`).join("\n\n");
}

// Project notes -> [{ topic, text }]. A note whose first line is a bracketed
// topic name is split at every bracketed line that follows a blank line (as
// notesText writes them, from the first column); any other note is one
// section under "Notes". The
// tool's own "[Converted from P6]" section is dropped.
export function parseNotes(notes) {
  const s = String(notes ?? "").replace(/\r\n?/g, "\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
  if (!s) return [];
  const lines = s.split("\n");
  if (!HEAD.test(lines[0])) return [{ topic: NOTES_TOPIC, text: s.trim() }];
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD.exec(lines[i]);
    if (m && (i === 0 || lines[i - 1].trim() === "")) { cur = { topic: m[1].trim(), lines: [] }; out.push(cur); continue; }
    cur.lines.push(lines[i]);
  }
  return out
    .map((x) => ({ topic: x.topic.slice(0, MEMO_TYPE_MAX), text: x.lines.join("\n").trim() }))
    .filter((x) => x.text && x.topic !== CONVERSION_TOPIC);
}

// The notebook entries of a set of P6 tables, as notes sections per owner:
// { task: Map(task_id -> [{topic, text}]), wbs: Map(wbs_id -> [...]) }, in
// MEMOTYPE order (seq_num, then id). An entry whose topic is not in MEMOTYPE
// keeps "Notebook <id>" so it is not lost.
export function notebookSections(T) {
  const types = new Map((T.MEMOTYPE || []).map((m) => [m.memo_type_id, m]));
  const rank = (id) => { const m = types.get(id); return m ? [Number(m.seq_num) || 0, Number(id) || 0] : [Infinity, Number(id) || 0]; };
  const group = (rows, key, field) => {
    const by = new Map();
    for (const r of rows || []) {
      const text = memoText(r[field]);
      if (!text) continue;
      if (!by.has(r[key])) by.set(r[key], []);
      by.get(r[key]).push({ id: r.memo_type_id, topic: (types.get(r.memo_type_id)?.memo_type || `Notebook ${r.memo_type_id}`).trim(), text });
    }
    for (const list of by.values()) list.sort((a, b) => { const x = rank(a.id), y = rank(b.id); return x[0] - y[0] || x[1] - y[1]; });
    return by;
  };
  return { task: group(T.TASKMEMO, "task_id", "task_memo"), wbs: group(T.WBSMEMO, "wbs_id", "wbs_memo") };
}
