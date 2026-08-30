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

export function filterTenders(rows, { category = "", minimum = 0, through = "" } = {}) {
  const terms = parseTradeTerms(category);
  const min = Number(minimum) || 0;
  return rows
    .filter((row) => {
      if (terms.length) {
        const haystack = `${row.category || ""} ${row.title || ""}`.toLowerCase();
        if (!terms.some((term) => haystack.includes(term))) return false;
      }
      if (Number(row.value || 0) < min) return false;
      if (through && row.deadline > through) return false;
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
