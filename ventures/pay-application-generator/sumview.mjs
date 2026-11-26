// Phone view of the padded text summaries (<pre class="sum" id="...">).
// Copied from ventures/pay-app-guides/sumview.mjs (ventures do not import each other), with
// two changes: a numbered label ("5.  Retainage ...", calc.mjs pads the number to 4 places)
// keeps its number instead of splitting on the spaces after it, and a "Project: ..." line is
// plain text, not a heading.
//
// The summaries are built for pasting into an email: a label padded with spaces or dot
// leaders, then the amount (calc.mjs summaryText, retlog.mjs, colog.mjs, ...). Below
// 600 px the monospace lines wrap, so each amount lands at the start of the next line
// under its label and the columns are lost (measured 2026-11-26: the retainage summary
// was 20 lines of text drawn as 34 rows at 390 px). This module reads the same text and
// draws a label/amount row per line beside the <pre>; style.css shows that view on a
// phone and the <pre> elsewhere. The copy buttons still read the <pre>, so what is
// pasted does not change. Letters (prose, few padded lines) are left as they are.

// label, then 2+ spaces, a dot leader, or (when the label filled the padding) one space
// before a closing dollar amount.
const PAIR = /^(\s*)((?:\d+\.\s+)?\S.*?)(?: {2,}|\s*\.{2,} | (?=-?\$[\d,]+\.\d\d$))(\S.*)$/;

/** Split summary text into rows: {pair, label, value, indent} | {item} | {text, heading?} | {blank}. */
export function parseSummary(text) {
  return String(text).replace(/\n+$/, "").split("\n").map((line) => {
    if (!line.trim()) return { blank: true };
    const m = PAIR.exec(line);
    if (m) return { pair: true, indent: m[1].length, label: m[2].trim().replace(/\s+/g, " "), value: m[3].replace(/ {2,}/g, " · ").trim() };
    const t = line.trim();
    if (/^- /.test(t)) return { item: t.slice(2) };
    // A short line that is not a sentence is a heading ("Aging", "By GC", "As of 2026-11-25").
    return /[.:;]$/.test(t) || /: /.test(t) || t.length > 60 ? { text: t } : { text: t, heading: true };
  });
}

/** True when the text reads as a table of figures, not a letter. */
export function isTabular(rows) {
  const filled = rows.filter((r) => !r.blank);
  const pairs = filled.filter((r) => r.pair).length;
  return pairs >= 3 && pairs * 2 >= filled.filter((r) => !r.item).length;
}

function render(pre, view) {
  const rows = parseSummary(pre.textContent);
  const on = isTabular(rows);
  pre.classList.toggle("has-view", on);
  view.hidden = !on;
  view.replaceChildren();
  if (!on) return;
  for (const r of rows) {
    if (r.blank) { view.append(Object.assign(document.createElement("div"), { className: "sv-gap" })); continue; }
    const row = document.createElement("div");
    if (r.pair) {
      row.className = "sv-row";
      if (r.indent) row.style.paddingLeft = `${Math.min(r.indent, 6) * 0.5}em`;
      const k = Object.assign(document.createElement("span"), { textContent: r.label });
      const v = Object.assign(document.createElement("span"), { className: "sv-v" });
      // "$120,000.00 · overdue $22,000.00": each figure on its own line, never split mid-figure.
      for (const part of r.value.split(" · ")) v.append(Object.assign(document.createElement("span"), { textContent: part }));
      row.append(k, v);
    } else if (r.item) {
      row.className = "sv-item";
      row.textContent = r.item;
    } else {
      row.className = r.heading ? "sv-text sv-head" : "sv-text";
      row.textContent = r.text;
    }
    view.append(row);
  }
}

/** Attach a phone view to every generated summary on the page and keep it in step. */
export function mountSummaryViews(doc = document) {
  for (const pre of doc.querySelectorAll("pre.sum[id]")) {
    const view = doc.createElement("div");
    view.className = "sum-view";
    view.hidden = true;
    pre.after(view);
    const run = () => render(pre, view);
    new MutationObserver(run).observe(pre, { childList: true, characterData: true, subtree: true });
    run();
  }
}

if (typeof document !== "undefined") mountSummaryViews();
