export function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseTenders(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Add a header and at least one tender row.");
  const headers = parseCsvLine(lines.shift()).map((header) => header.toLowerCase());
  if (!headers.includes("title") || !headers.includes("deadline")) {
    throw new Error("The CSV needs title and deadline columns.");
  }
  return lines.map((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, i) => [header, cells[i] || ""]));
    if (!row.title || !row.deadline) throw new Error("Every row needs a title and deadline.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deadline)) {
      throw new Error("Deadlines must use YYYY-MM-DD.");
    }
    return {
      title: row.title,
      buyer: row.buyer || "",
      deadline: row.deadline,
      category: row.category || "",
      value: row.value || "",
      url: row.url || "",
    };
  });
}

// Splits a trade/category filter into individual OR terms. A contractor's
// source portal often spells the same trade differently row to row ("roofing"
// vs "roof repair" vs "reroofing"), so the field accepts a comma- or
// newline-separated list instead of forcing a re-run per spelling.
export function parseTradeTerms(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

// Portal exports rarely give a bare integer: "value" comes through as
// "£5,000", "$85,000.00", "1,200,000 GBP", or blank. `Number()` on any of
// those is `NaN`, and `NaN < minimum` is always `false` -- so the minimum-value
// filter's exclusion branch below never fired for a formatted cell, no matter
// how far under the threshold the tender actually was. A £5,000 job slipped
// straight into a shortlist filtered to "£20,000 minimum" because its cell
// could not be read as a number, which is the opposite of what that filter
// promises. Stripping thousands separators and reading the first signed
// number out of what is left turns the common cases (currency symbols,
// currency codes, comma grouping) into the plain number the filter already
// handled; a cell with no number left in it reads as 0, matching how a truly
// blank cell was already treated (excluded once a positive minimum is set).
export function parseValueNumber(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

// Rows whose deadline has already passed are, by default, excluded from the
// shortlist. A portal export usually still contains last week's notices, and
// nothing can be done about a closed tender, so leaving it in the list mixed
// in with live ones works against the tool's whole point: "the tenders worth
// your time" should not include ones that no longer are. Pass
// `hideClosed: false` to keep them (still sorted to the top, since they are
// the oldest deadlines) when a caller wants to see everything that matched.
export function filterTenders(rows, { category = "", minimum = 0, through = "", today = "", hideClosed = true } = {}) {
  const terms = parseTradeTerms(category);
  const min = Number(minimum) || 0;
  return rows
    .filter((row) => {
      if (terms.length) {
        const haystack = `${row.category || ""} ${row.title || ""}`.toLowerCase();
        if (!terms.some((term) => haystack.includes(term))) return false;
      }
      if (parseValueNumber(row.value) < min) return false;
      if (through && row.deadline > through) return false;
      if (hideClosed && today && row.deadline < today) return false;
      return true;
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

// Days from `today` to `deadline`, both "YYYY-MM-DD". Parsed as UTC calendar
// dates (not `new Date(string)`, which is DST/timezone-sensitive) so a
// deadline of "tomorrow" reads as 1 regardless of the visitor's offset.
function daysUntil(deadline, today) {
  const toUTCDays = (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  return Math.round(toUTCDays(deadline) - toUTCDays(today));
}

// A tender is "worth your time" right now when its deadline is close and has
// not already passed. `row.deadline < today` used to be read as "urgent" in
// the table, which flags exactly the opposite rows: a deadline that already
// closed weeks ago (nothing left to do) while a deadline closing tomorrow
// (the one that actually needs action) got no emphasis at all.
export function isUrgent(deadline, today, windowDays = 7) {
  if (!deadline || !today) return false;
  const diff = daysUntil(deadline, today);
  return diff >= 0 && diff <= windowDays;
}

// True once a deadline has passed. Used to label a row "Closed" when the
// "hide closed tenders" toggle is off and a past-deadline row is still shown.
export function isClosed(deadline, today) {
  if (!deadline || !today) return false;
  return daysUntil(deadline, today) < 0;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function toCsv(rows) {
  const header = "deadline,title,buyer,category,value,url";
  const lines = rows.map((row) =>
    [row.deadline, row.title, row.buyer, row.category, row.value, row.url]
      .map((value) => `"${String(value || "").replaceAll('"', '""')}"`)
      .join(",")
  );
  return [header, ...lines].join("\n");
}
