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

export function filterTenders(rows, { category = "", minimum = 0, through = "" } = {}) {
  const trade = String(category || "").trim().toLowerCase();
  const min = Number(minimum) || 0;
  return rows
    .filter((row) => {
      if (trade && !String(row.category || "").toLowerCase().includes(trade)) return false;
      if (Number(row.value || 0) < min) return false;
      if (through && row.deadline > through) return false;
      return true;
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
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
