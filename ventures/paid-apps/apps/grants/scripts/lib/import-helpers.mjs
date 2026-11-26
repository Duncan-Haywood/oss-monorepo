// Helpers for scripts/import-documents.mjs and scripts/bootstrap-org.mjs (Node 22, no deps).
//
// The first part is pure (kind inference, manifest CSV, validation, formatting) and unit-tested in
// scripts/import-documents.test.mjs. The second part is the small HTTP client both CLIs share
// (cookie session, Origin header, 429 backoff); its fetch and sleep are injectable for tests.
//
// The allowlists below mirror the server (src/shared/enums.ts, src/worker/services/ingestion/files.ts);
// a unit test fails if they drift apart.

// ---------------------------------------------------------------------------------------------
// Server mirrors
// ---------------------------------------------------------------------------------------------

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Canonical MIME type per allowed extension (same table as the server's EXT_TO_MIME). */
export const EXT_TO_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export const ALLOWED_EXTENSIONS = Object.keys(EXT_TO_MIME);

export const DOCUMENT_KINDS = [
  "mission_statement",
  "charter_bylaws",
  "annual_report",
  "financial_statement",
  "budget",
  "program_description",
  "past_application",
  "award_letter",
  "rejection_letter",
  "letter_of_support",
  "interview_transcript",
  "website_page",
  "policy",
  "other",
];
export const PAST_OUTCOMES = ["awarded", "declined", "pending", "unknown"];
export const MEMBER_ROLES = ["owner", "admin", "editor", "reviewer", "viewer"];
export const ORG_TYPES = [
  "nonprofit_501c3",
  "tribal_government",
  "tribal_organization",
  "faith_based",
  "community_based",
  "educational",
  "government",
  "fiscally_sponsored",
  "other",
];

/** Manifest-only pseudo kind: list a file but never upload it. */
export const SKIP_KIND = "skip";

export const MANIFEST_COLUMNS = [
  "path",
  "kind",
  "title",
  "pastOutcome",
  "pastFunder",
  "pastAmountUSD",
  "pastYear",
  "notes",
];

/** Server field limits (routes/org/documents.ts uploadFields). */
const LIMITS = { title: 300, pastFunder: 300, notes: 5000 };
const MAX_AMOUNT_CENTS = 100_000_000_000;

// ---------------------------------------------------------------------------------------------
// Paths and files
// ---------------------------------------------------------------------------------------------

export function extensionOf(filename) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(filename).trim());
  return m?.[1]?.toLowerCase() ?? "";
}

export const mimeForFile = (filename) => EXT_TO_MIME[extensionOf(filename)] ?? null;

/**
 * Normalize a path relative to the import folder: forward slashes, no "./", NFC (macOS stores
 * names decomposed, so "Diné" from Finder and "Diné" typed in a CSV would otherwise differ).
 * Returns null for absolute paths or paths that escape the folder.
 */
export function normalizeRelPath(p) {
  const s = String(p ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\\/g, "/");
  if (!s || s.startsWith("/") || /^[A-Za-z]:\//.test(s)) return null;
  const parts = s.split("/").filter((x) => x !== "" && x !== ".");
  if (parts.length === 0 || parts.includes("..")) return null;
  return parts.join("/");
}

/** Files the walker never imports: dotfiles, OS junk and Office lock files. */
export function isIgnoredName(name) {
  const n = String(name);
  if (n.startsWith(".")) return true; // .DS_Store, .git, ._resource-forks
  if (n.startsWith("~$")) return true; // Office lock files
  return ["thumbs.db", "desktop.ini"].includes(n.toLowerCase());
}

/** Size and extension checks matching the server (413 / 415 / "file is empty"). */
export function validateFile({ name, size }) {
  const ext = extensionOf(name);
  if (!ext || !EXT_TO_MIME[ext]) {
    return {
      ok: false,
      code: "unsupported_file_type",
      reason: `.${ext || "(none)"} is not allowed (allowed: ${ALLOWED_EXTENSIONS.join(", ")})`,
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: "empty_file", reason: "File is empty" };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      reason: `${formatBytes(size)} is over the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Kind inference
// ---------------------------------------------------------------------------------------------

/** "Past Applications", "past_applications" and "past-applications" all become "past-applications". */
export function slugSegment(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const w = (alts) => new RegExp(`(?:^|-)(?:${alts})(?:-|$)`);

/** First match wins within one folder/filename, so more specific kinds come first. */
const KIND_RULES = [
  ["rejection_letter", w("rejection-letters?|decline-letters?|declination-letters?|rejections?")],
  ["award_letter", w("award-letters?|awards?|notice-of-award|grant-agreements?")],
  ["letter_of_support", w("letters?-of-support|support-letters?|lettersofsupport")],
  ["interview_transcript", w("transcripts?|interview-transcripts?|interviews?")],
  ["past_application", w("(?:past-)?(?:grant-)?(?:applications?|proposals?)")],
  ["annual_report", w("annual-reports?")],
  [
    "financial_statement",
    w("financials?|financial-statements?|audits?|audited-financials?|990s?|form-990s?|irs-990s?"),
  ],
  ["budget", w("budgets?")],
  ["charter_bylaws", w("by-?laws|charters?|articles-of-incorporation|incorporation")],
  ["mission_statement", w("mission(?:-statements?)?|mission-and-vision")],
  ["policy", w("polic(?:y|ies)")],
  ["program_description", w("programs?|program-descriptions?|program-overviews?")],
  ["website_page", w("website|web-pages?|webpages?")],
  ["other", w("other|misc|miscellaneous")],
];

/** Declined first: "not-funded" must not read as "funded". */
const OUTCOME_RULES = [
  [
    "declined",
    w("declined|rejected|denied|unfunded|unsuccessful|not-funded|not-awarded|not-selected"),
  ],
  ["awarded", w("awarded|funded|won|approved|successful")],
  ["pending", w("pending|submitted|in-review|under-review")],
  ["unknown", w("unknown")],
];

const matchRules = (rules, slug) => rules.find(([, re]) => re.test(slug))?.[0];

/**
 * Infer the document kind from a path relative to the import folder.
 * The deepest folder that matches a rule wins; the filename is used only when no folder matches;
 * otherwise "other". For past applications the outcome comes from the folders below the
 * past-applications folder or from the filename (e.g. past-applications/awarded/x.pdf).
 * @returns {{ kind: string, kindSource: "folder"|"filename"|"default", pastOutcome?: string }}
 */
export function inferKind(relPath) {
  const parts = String(relPath).replace(/\\/g, "/").split("/").filter(Boolean);
  const filename = parts.pop() ?? "";
  const stem = slugSegment(filename.replace(/\.[A-Za-z0-9]{1,10}$/, ""));
  const folders = parts.map(slugSegment);

  let kind;
  let kindSource = "default";
  let kindIndex = -1;
  for (let i = folders.length - 1; i >= 0; i--) {
    const k = matchRules(KIND_RULES, folders[i]);
    if (k) {
      kind = k;
      kindSource = "folder";
      kindIndex = i;
      break;
    }
  }
  if (!kind) {
    const k = matchRules(KIND_RULES, stem);
    if (k) {
      kind = k;
      kindSource = "filename";
    }
  }
  if (!kind) kind = "other";

  const result = { kind, kindSource };
  if (kind === "past_application") {
    const candidates = [...folders.slice(kindIndex + 1).reverse(), stem];
    for (const c of candidates) {
      const o = matchRules(OUTCOME_RULES, c);
      if (o) {
        result.pastOutcome = o;
        break;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Personal-data screening (a backstop, not a substitute for a human look at every file)
// ---------------------------------------------------------------------------------------------

const SENSITIVE_NAME = w(
  [
    "clients?",
    "client-(?:list|records?|files?|data)",
    "participants?",
    "participant-(?:list|records?|data)",
    "intake(?:-forms?)?",
    "case-(?:notes?|files?|management)",
    "ssns?",
    "social-security",
    "medical",
    "health-records?",
    "hipaa",
    "phi",
    "patients?",
    "diagnos[ie]s",
    "rosters?",
    "w-?2s?",
    "w-?9s?",
    "i-?9s?",
    "payroll",
    "personnel(?:-files?)?",
    "background-checks?",
    "dob",
    "passports?",
    "drivers?-licen[cs]es?",
  ].join("|"),
);

/** Filename/folder words that suggest client records, IDs or health information. */
export function sensitiveNameReason(relPath) {
  for (const seg of String(relPath).replace(/\\/g, "/").split("/")) {
    const slug = slugSegment(seg.replace(/\.[A-Za-z0-9]{1,10}$/, ""));
    const m = SENSITIVE_NAME.exec(slug);
    if (m)
      return `name contains "${m[0].replace(/^-|-$/g, "")}" (client records, IDs or health info?)`;
  }
  return null;
}

/** Extensions whose bytes are plain text, so they can be scanned for SSN-shaped numbers. */
export const TEXT_SCAN_EXTENSIONS = ["txt", "md", "markdown", "csv", "html", "htm", "rtf"];

const SSN_RE = /(?<![\d-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\d-])/;

/** True when text contains something shaped like a US Social Security number (NNN-NN-NNNN). */
export const containsSsnPattern = (text) => SSN_RE.test(String(text));

// ---------------------------------------------------------------------------------------------
// CSV + manifest
// ---------------------------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, "" escapes, CRLF/LF, optional BOM. Returns rows with line numbers. */
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells: row });
    row = [];
  };
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") endField();
    else if (ch === "\r" && s[i + 1] === "\n") {
      endRow();
      i++;
      line++;
      rowLine = line;
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      line++;
      rowLine = line;
    } else field += ch;
    i++;
  }
  if (quoted) throw new Error(`Unterminated quoted field starting on line ${rowLine}`);
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

const csvCell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`;

/** "$12,500.50" / "12500.5" / "12500" -> cents. Throws on anything else. */
export function dollarsToCents(input) {
  const s = String(input).trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error(`"${input}" is not a dollar amount like 12500 or 12,500.00`);
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS)
    throw new Error(`"${input}" is too large`);
  return cents;
}

/**
 * Parse a manifest CSV (header row required; `path` column required; other columns optional).
 * Blank cells mean "infer / not set". Returns every problem rather than stopping at the first.
 * @returns {{ entries: Map<string, object>, errors: string[], warnings: string[] }}
 */
export function parseManifest(text) {
  const errors = [];
  const warnings = [];
  const entries = new Map();
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { entries, errors: [e.message], warnings };
  }
  if (rows.length === 0) return { entries, errors: ["Manifest is empty"], warnings };

  const byLower = new Map(MANIFEST_COLUMNS.map((c) => [c.toLowerCase(), c]));
  const header = rows[0].cells.map((h) => {
    const canonical = byLower.get(h.trim().toLowerCase());
    if (!canonical && h.trim() !== "")
      errors.push(
        `Unknown manifest column "${h.trim()}" (expected: ${MANIFEST_COLUMNS.join(", ")})`,
      );
    return canonical;
  });
  if (!header.includes("path")) errors.push('Manifest needs a "path" column');
  if (errors.length) return { entries, errors, warnings };

  for (const { line, cells } of rows.slice(1)) {
    const raw = {};
    header.forEach((col, idx) => {
      if (col) raw[col] = (cells[idx] ?? "").trim();
    });
    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim() !== "")) {
      errors.push(`Line ${line}: more cells than header columns (unquoted comma?)`);
      continue;
    }
    const at = (msg) => errors.push(`Line ${line}: ${msg}`);
    const path = normalizeRelPath(raw.path);
    if (!path) {
      at(`invalid path "${raw.path ?? ""}" (use a path relative to the import folder)`);
      continue;
    }
    if (entries.has(path)) {
      at(`duplicate path "${path}"`);
      continue;
    }
    const entry = { path, line };
    let bad = false;
    if (raw.kind) {
      const k = raw.kind.toLowerCase();
      if (k === SKIP_KIND || DOCUMENT_KINDS.includes(k)) entry.kind = k;
      else {
        at(
          `unknown kind "${raw.kind}" (use one of: ${DOCUMENT_KINDS.join(", ")}, or ${SKIP_KIND})`,
        );
        bad = true;
      }
    }
    if (raw.title) {
      if (raw.title.length > LIMITS.title) {
        at(`title is longer than ${LIMITS.title} characters`);
        bad = true;
      } else entry.title = raw.title;
    }
    if (raw.pastOutcome) {
      const o = raw.pastOutcome.toLowerCase();
      if (PAST_OUTCOMES.includes(o)) entry.pastOutcome = o;
      else {
        at(`unknown pastOutcome "${raw.pastOutcome}" (use one of: ${PAST_OUTCOMES.join(", ")})`);
        bad = true;
      }
    }
    if (raw.pastFunder) {
      if (raw.pastFunder.length > LIMITS.pastFunder) {
        at(`pastFunder is longer than ${LIMITS.pastFunder} characters`);
        bad = true;
      } else entry.pastFunder = raw.pastFunder;
    }
    if (raw.pastAmountUSD) {
      try {
        entry.pastAmountCents = dollarsToCents(raw.pastAmountUSD);
      } catch (e) {
        at(`pastAmountUSD: ${e.message}`);
        bad = true;
      }
    }
    if (raw.pastYear) {
      const y = Number(raw.pastYear);
      if (/^\d{4}$/.test(raw.pastYear) && y >= 1900 && y <= 2100) entry.pastYear = y;
      else {
        at(`pastYear "${raw.pastYear}" must be a 4-digit year between 1900 and 2100`);
        bad = true;
      }
    }
    if (raw.notes) {
      if (raw.notes.length > LIMITS.notes) {
        at(`notes are longer than ${LIMITS.notes} characters`);
        bad = true;
      } else entry.notes = raw.notes;
    }
    const hasPast = ["pastOutcome", "pastFunder", "pastAmountCents", "pastYear"].some(
      (k) => k in entry,
    );
    if (
      hasPast &&
      entry.kind &&
      !["past_application", "award_letter", "rejection_letter"].includes(entry.kind)
    ) {
      warnings.push(`Line ${line}: past* columns are set but kind is ${entry.kind}`);
    }
    if (!bad) entries.set(path, entry);
  }
  return { entries, errors, warnings };
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

/**
 * Combine walked files, an optional manifest and the inference rules into an upload plan.
 * @param {{ path: string, size: number, ssnHit?: boolean }[]} files paths relative to the folder
 * @param {Map<string, object> | null} manifest from parseManifest().entries
 * @returns {{ items: object[], errors: string[] }} errors = manifest rows that match no file
 */
export function planImport(files, manifest = null) {
  const items = [];
  const seen = new Set();
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const path = normalizeRelPath(f.path) ?? f.path;
    const entry = manifest?.get(path);
    if (entry) seen.add(path);
    const inferred = inferKind(path);
    const item = {
      path,
      sizeBytes: f.size,
      kind: entry?.kind ?? inferred.kind,
      kindSource: entry?.kind ? "manifest" : inferred.kindSource,
      warnings: [],
    };
    const pastOutcome =
      entry?.pastOutcome ?? (item.kind === "past_application" ? inferred.pastOutcome : undefined);
    if (pastOutcome) item.pastOutcome = pastOutcome;
    for (const k of ["title", "pastFunder", "pastAmountCents", "pastYear", "notes"]) {
      if (entry?.[k] !== undefined) item[k] = entry[k];
    }
    // Markers written by --make-manifest are instructions to the developer, not document notes.
    if (item.notes && TEMPLATE_NOTE_RE.test(item.notes)) delete item.notes;

    if (item.kind === SKIP_KIND) {
      item.action = "excluded";
      item.reason = "kind=skip in manifest";
      items.push(item);
      continue;
    }
    const v = validateFile({ name: path, size: f.size });
    if (!v.ok) {
      item.action = "invalid";
      item.reason = v.reason;
      item.errorCode = v.code;
      items.push(item);
      continue;
    }
    // Personal-data backstop: blocked unless a human listed the file in the manifest with a kind.
    const sensitive = f.ssnHit
      ? "contains a number shaped like an SSN (NNN-NN-NNNN)"
      : sensitiveNameReason(path);
    if (sensitive && !(entry?.kind && entry.kind !== SKIP_KIND)) {
      item.action = "blocked";
      item.reason = `${sensitive}; review it, then list it in the manifest with a kind to upload anyway`;
      items.push(item);
      continue;
    }
    if (sensitive) item.warnings.push(`${sensitive} (allowed by manifest)`);
    if (manifest && !entry) item.warnings.push("not in manifest; kind inferred");
    if (item.kindSource === "default")
      item.warnings.push('no folder/filename rule matched; using "other"');
    if (item.kind === "past_application" && !item.pastOutcome)
      item.warnings.push("past application without pastOutcome");
    item.action = "upload";
    items.push(item);
  }
  const errors = [];
  if (manifest) {
    for (const [path, entry] of manifest) {
      if (!seen.has(path))
        errors.push(`Manifest line ${entry.line}: "${path}" matches no file in the folder`);
    }
  }
  return { items, errors };
}

const SOURCE_RANK = { manifest: 3, folder: 2, filename: 1, default: 0 };
const keepScore = (it) =>
  (it.kindSource === "manifest" ? 100 : 0) +
  (it.kind === "other" ? 0 : 10) +
  (SOURCE_RANK[it.kindSource] ?? 0);

/**
 * Identical files (same sha256) would be rejected by the server as duplicates after the first.
 * Keep the best-classified copy (manifest first, then a specific kind over "other", then folder >
 * filename > default) and
 * mark the rest action "duplicate" so they are not uploaded. Mutates and returns the items.
 */
export function markLocalDuplicates(items) {
  const groups = new Map();
  for (const it of items) {
    if (it.action !== "upload" || !it.sha256) continue;
    if (!groups.has(it.sha256)) groups.set(it.sha256, []);
    groups.get(it.sha256).push(it);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.reduce((best, it) => (keepScore(it) > keepScore(best) ? it : best));
    for (const it of group) {
      if (it === keep) continue;
      it.action = "duplicate";
      it.reason = `identical to ${keep.path}`;
    }
  }
  return items;
}

const TEMPLATE_NOTE_RE = /^(REVIEW|CANNOT UPLOAD):/;

/** Rows for --make-manifest: every file, with the inferred kind; flagged files start as "skip". */
export function manifestTemplateRows(files) {
  const { items } = planImport(files, null);
  const rows = [MANIFEST_COLUMNS];
  for (const it of items) {
    const flagged = it.action === "blocked";
    const kind = it.action === "invalid" ? SKIP_KIND : flagged ? SKIP_KIND : it.kind;
    const notes = flagged
      ? `REVIEW: ${it.reason.split(";")[0]}`
      : it.action === "invalid"
        ? `CANNOT UPLOAD: ${it.reason}`
        : "";
    rows.push([it.path, kind, "", it.pastOutcome ?? "", "", "", "", notes]);
  }
  return rows;
}

/** Multipart text fields for POST /documents (the file itself is appended by the caller). */
export function uploadFields(item) {
  const f = { kind: item.kind, consent: "true" };
  if (item.title) f.title = item.title;
  if (item.pastOutcome) f.pastOutcome = item.pastOutcome;
  if (item.pastFunder) f.pastFunder = item.pastFunder;
  if (item.pastAmountCents !== undefined) f.pastAmountCents = String(item.pastAmountCents);
  if (item.pastYear !== undefined) f.pastYear = String(item.pastYear);
  if (item.notes) f.notes = item.notes;
  return f;
}

/** "a@x.org:reviewer,b@y.org:editor" -> [{ email, role }]. Owner can't be invited. */
export function parseInviteList(spec) {
  const out = [];
  const errors = [];
  for (const raw of String(spec ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const idx = raw.lastIndexOf(":");
    const email = (idx === -1 ? raw : raw.slice(0, idx)).trim().toLowerCase();
    const role = (idx === -1 ? "viewer" : raw.slice(idx + 1)).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`"${raw}": not an email address`);
    else if (!MEMBER_ROLES.includes(role) || role === "owner")
      errors.push(
        `"${raw}": role must be one of ${MEMBER_ROLES.filter((r) => r !== "owner").join(", ")}`,
      );
    else if (out.some((i) => i.email === email)) errors.push(`"${raw}": listed twice`);
    else out.push({ email, role });
  }
  return { invites: out, errors };
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Plain-text table; columns = [{ key, label, max? }]. */
export function formatTable(rows, columns) {
  const cell = (r, c) => {
    const s = String(r[c.key] ?? "");
    return c.max && s.length > c.max ? `${s.slice(0, c.max - 1)}…` : s;
  };
  const widths = columns.map((c) =>
    Math.max(c.label.length, ...rows.map((r) => cell(r, c).length)),
  );
  const line = (vals) =>
    vals
      .map((v, i) => v.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [
    line(columns.map((c) => c.label)),
    line(widths.map((n) => "-".repeat(n))),
    ...rows.map((r) => line(columns.map((c) => cell(r, c)))),
  ].join("\n");
}

/** Backoff for 429/5xx: Retry-After (seconds or HTTP date) when given, else exponential + jitter. */
export function retryDelayMs(attempt, retryAfter, { random = Math.random, now = Date.now } = {}) {
  const cap = 120_000;
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(cap, Math.ceil(secs * 1000) + 250);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(cap, Math.max(1000, at - now()));
  }
  const base = Math.min(60_000, 1000 * 2 ** attempt);
  return Math.round(base / 2 + random() * (base / 2));
}

// ---------------------------------------------------------------------------------------------
// HTTP client (shared by both CLIs; not pure)
// ---------------------------------------------------------------------------------------------

/** Validates --base: https, or http only for localhost (a password must never cross the wire in clear). */
export function parseBaseUrl(base) {
  let u;
  try {
    u = new URL(base);
  } catch {
    throw new Error(`--base "${base}" is not a URL`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new Error("--base must be https:// (plain http is only allowed for localhost)");
  }
  return u.origin;
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Minimal cookie-session API client. Every request carries Origin = base (the Worker's CSRF check)
 * and the session cookie from sign-in. 429/502/503/504 and network errors are retried with
 * backoff; for uploads that is safe because the server rejects identical content with 409.
 * `body` may be a function so FormData is rebuilt on each attempt.
 */
export function createApiClient({
  base,
  fetchImpl = globalThis.fetch,
  sleep,
  maxRetries = 6,
  onRetry,
} = {}) {
  const origin = parseBaseUrl(base);
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const cookies = new Map();

  const storeCookies = (res) => {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const pair = c.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || /max-age=0\b/i.test(c)) cookies.delete(name);
      else cookies.set(name, value);
    }
  };

  async function request(method, path, { json, body, headers = {} } = {}) {
    for (let attempt = 0; ; attempt++) {
      const h = { Origin: origin, Accept: "application/json", ...headers };
      if (cookies.size) h.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      let payload;
      if (json !== undefined) {
        h["Content-Type"] = "application/json";
        payload = JSON.stringify(json);
      } else if (body !== undefined) payload = typeof body === "function" ? await body() : body;

      let res;
      try {
        res = await fetchImpl(new URL(path, `${origin}/`), {
          method,
          headers: h,
          body: payload,
          redirect: "manual",
        });
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        const ms = retryDelayMs(attempt, null);
        onRetry?.({ path, status: "network", attempt, ms });
        await wait(ms);
        continue;
      }
      storeCookies(res);
      if (RETRY_STATUSES.has(res.status) && attempt < maxRetries) {
        await res.arrayBuffer().catch(() => {});
        const ms = retryDelayMs(attempt, res.headers.get("retry-after"));
        onRetry?.({ path, status: res.status, attempt, ms });
        await wait(ms);
        continue;
      }
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      return { status: res.status, ok: res.ok, data, headers: res.headers };
    }
  }

  return {
    origin,
    request,
    hasSession: () => cookies.size > 0,
    async signIn(email, password) {
      const r = await request("POST", "/api/auth/sign-in/email", {
        json: { email, password, rememberMe: false },
      });
      if (!r.ok || cookies.size === 0) {
        const msg = r.data?.message ?? r.data?.error?.message ?? `HTTP ${r.status}`;
        throw new Error(`Sign-in failed: ${msg}`);
      }
      return r.data?.user ?? null;
    },
    async signOut() {
      if (cookies.size === 0) return;
      await request("POST", "/api/auth/sign-out", { json: {} }).catch(() => {});
      cookies.clear();
    },
  };
}

/** `{ error: { code, message } }` -> "code: message" (falls back to the HTTP status). */
export const apiErrorText = (r) =>
  r.data?.error
    ? `${r.data.error.code}: ${r.data.error.message}`
    : (r.data?.message ?? `HTTP ${r.status}`);

/** Lines of a piped (non-TTY) stdin, read once and handed out in order (one per prompt). */
const pipedLines = new WeakMap();
function nextPipedLine(stdin) {
  if (!pipedLines.has(stdin)) {
    pipedLines.set(
      stdin,
      (async () => {
        let s = "";
        stdin.setEncoding("utf8");
        for await (const chunk of stdin) s += chunk;
        return s.split(/\r?\n/);
      })(),
    );
  }
  return pipedLines.get(stdin).then((lines) => lines.shift() ?? "");
}

/**
 * Read a password from stdin without echo. On a TTY, raw mode hides keystrokes; when stdin is a
 * pipe (e.g. `op read ... | node scripts/...`) the next line is used. Never accept it as a flag.
 */
export function promptPassword(
  prompt = "Password: ",
  { stdin = process.stdin, out = process.stderr } = {},
) {
  if (!stdin.isTTY) return nextPipedLine(stdin);
  return new Promise((resolve, reject) => {
    out.write(prompt);
    let pw = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      out.write("\n");
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          cleanup();
          resolve(pw);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") pw = pw.slice(0, -1);
        else if (ch >= " ") pw += ch;
      }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

/** Ask a yes/no question on the TTY (stderr prompt). Resolves false when stdin isn't a TTY. */
export async function confirm(question, { stdin = process.stdin, out = process.stderr } = {}) {
  if (!stdin.isTTY) return false;
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: stdin, output: out });
  try {
    const a = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(a.trim());
  } finally {
    rl.close();
  }
}
