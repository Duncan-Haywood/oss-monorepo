// A small MIME reader for inbound RFQ email (RFC 5322 headers, RFC 2045-2047 bodies and encoded
// words, RFC 2231 parameters). Pure: bytes in, the message text and attachments out. It reads what
// estimators are sent (plain or HTML bodies, PDF/STEP/DXF attachments, forwarded .eml) and reports
// what it could not read as notes instead of guessing. No dependency.

export interface MimeAttachment {
  fileName: string;
  /** Lower-case media type without parameters, e.g. "application/pdf". */
  contentType: string;
  bytes: Uint8Array;
  /** Content-Disposition inline (signature logos, embedded images). */
  inline: boolean;
  contentId: string | null;
}

export interface ParsedEmail {
  subject: string | null;
  from: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  /** The References header (RFC 5322 § 3.6.4), unfolded, or null. */
  references: string | null;
  date: string | null;
  /**
   * The first Authentication-Results header as written (not decoded). Cloudflare Email Routing
   * prepends its own, so the first is Cloudflare's when it is there (shared/sender-auth.ts).
   */
  authenticationResults: string | null;
  /** The readable body: the first text/plain part, else the first HTML part as text. */
  text: string;
  attachments: MimeAttachment[];
  /** Parts skipped or read with a fallback, in plain words for the estimator. */
  notes: string[];
}

/** Nesting deeper than this (multipart in multipart in forwarded mail...) is not read. */
export const MAX_DEPTH = 8;
/** Parts beyond this are not read (a mail bomb guard). */
export const MAX_PARTS = 200;

type Headers = Map<string, string[]>;

interface Part {
  headers: Headers;
  /** Body as a binary string (one char per byte). */
  body: string;
}

// ---------------------------------------------------------------------------------------------
// Bytes and strings

/** One char per byte, so slicing and searching keep the original bytes. */
export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

export function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Decode bytes in a declared charset; unknown labels fall back to UTF-8 (and say so). */
export function decodeCharset(bytes: Uint8Array, charset: string | null, notes?: string[]) {
  const label = (charset ?? "utf-8").trim().toLowerCase() || "utf-8";
  try {
    return new TextDecoder(label === "us-ascii" ? "utf-8" : label).decode(bytes);
  } catch {
    notes?.push(`Text in an unknown character set (${label.slice(0, 40)}) was read as UTF-8.`);
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Header bytes: UTF-8 when valid (RFC 6532), otherwise Latin-1 as received. */
function decodeHeaderBytes(binary: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(binaryToBytes(binary));
  } catch {
    return binary;
  }
}

export function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const usable = clean.slice(0, clean.length - (clean.length % 4 === 1 ? 1 : 0));
  const padded = usable + "=".repeat((4 - (usable.length % 4)) % 4);
  return binaryToBytes(atob(padded));
}

/** Quoted-printable to bytes (RFC 2045 6.7); `header` also turns "_" into a space (RFC 2047). */
export function decodeQuotedPrintable(s: string, header = false): Uint8Array {
  const out: number[] = [];
  const src = header ? s.replace(/_/g, " ") : s;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "=") {
      const next2 = src.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(next2)) {
        out.push(Number.parseInt(next2, 16));
        i += 2;
        continue;
      }
      // Soft line break: "=" at the end of a line (CRLF or LF, trailing spaces allowed).
      const rest = /^[ \t]*\r?\n/.exec(src.slice(i + 1, i + 80));
      if (rest) {
        i += rest[0].length;
        continue;
      }
      out.push(0x3d);
      continue;
    }
    out.push(src.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------------------------
// Headers

/** RFC 2047 encoded words (=?charset?B|Q?text?=); whitespace between two encoded words is dropped. */
export function decodeEncodedWords(value: string): string {
  const re = /=\?([^?\s]+)\?([BbQq])\?([^?]*)\?=/g;
  let out = "";
  let last = 0;
  let prevWasWord = false;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    const between = value.slice(last, m.index);
    if (!(prevWasWord && /^[ \t\r\n]*$/.test(between))) out += between;
    const charset = (m[1] ?? "utf-8").split("*")[0] ?? "utf-8";
    const enc = (m[2] ?? "B").toUpperCase();
    const text = m[3] ?? "";
    try {
      const bytes = enc === "B" ? decodeBase64(text) : decodeQuotedPrintable(text, true);
      out += decodeCharset(bytes, charset);
    } catch {
      out += m[0];
    }
    last = m.index + m[0].length;
    prevWasWord = true;
  }
  return out + value.slice(last);
}

function parseHeaderBlock(block: string): Headers {
  const headers: Headers = new Map();
  const lines = block.split(/\r?\n/);
  let current: string | null = null;
  const flush = () => {
    if (current === null) return;
    const colon = current.indexOf(":");
    if (colon > 0) {
      const name = current.slice(0, colon).trim().toLowerCase();
      const value = current.slice(colon + 1).trim();
      const list = headers.get(name) ?? [];
      list.push(value);
      headers.set(name, list);
    }
    current = null;
  };
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current !== null) {
      current += ` ${line.trim()}`; // folded continuation (RFC 5322 2.2.3)
    } else {
      flush();
      current = line;
    }
  }
  flush();
  return headers;
}

const header = (h: Headers, name: string) => h.get(name)?.[0] ?? null;

export interface HeaderValue {
  value: string;
  params: Record<string, string>;
}

/** `type/subtype; a=b; c="d e"; name*=utf-8''%E2%82%AC.pdf; f*0=x; f*1=y` (RFC 2045, 2231). */
export function parseHeaderValue(raw: string): HeaderValue {
  const parts: string[] = [];
  let buf = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') quoted = !quoted;
    if (c === "\\" && quoted && i + 1 < raw.length) {
      buf += c + raw[i + 1];
      i++;
      continue;
    }
    if (c === ";" && !quoted) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  parts.push(buf);
  const value = (parts.shift() ?? "").trim().toLowerCase();
  const simple: Record<string, string> = {};
  const continued: Record<string, { index: number; text: string; encoded: boolean }[]> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    let val = p.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    const m = /^([^*]+)\*(?:(\d+)\*?)?$/.exec(key);
    if (m?.[1]) {
      const list = continued[m[1]] ?? [];
      list.push({ index: m[2] ? Number(m[2]) : 0, text: val, encoded: key.endsWith("*") });
      continued[m[1]] = list;
    } else {
      simple[key] = val;
    }
  }
  for (const [name, list] of Object.entries(continued)) {
    list.sort((a, b) => a.index - b.index);
    let charset = "utf-8";
    let binary = "";
    list.forEach((seg, i) => {
      let text = seg.text;
      if (seg.encoded && i === 0) {
        const m = /^([^']*)'[^']*'(.*)$/.exec(text);
        if (m) {
          charset = m[1] || "utf-8";
          text = m[2] ?? "";
        }
      }
      binary += seg.encoded
        ? text.replace(/%([0-9A-Fa-f]{2})/g, (_x, h: string) =>
            String.fromCharCode(Number.parseInt(h, 16)),
          )
        : text;
    });
    simple[name] = decodeCharset(binaryToBytes(binary), charset);
  }
  return { value, params: simple };
}

/** The address in `"Name" <a@b.c>` or `a@b.c`, lower-cased; null when there is none. */
export function addressOf(raw: string | null): string | null {
  if (!raw) return null;
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const bare = angle?.[1] ?? /([^\s<>"',;:]+@[^\s<>"',;:]+)/.exec(raw)?.[1];
  return bare ? bare.toLowerCase() : null;
}

// ---------------------------------------------------------------------------------------------
// Bodies

function splitHeadersBody(binary: string): Part {
  const m = /\r?\n\r?\n/.exec(binary);
  if (!m) return { headers: parseHeaderBlock(decodeHeaderBytes(binary)), body: "" };
  return {
    headers: parseHeaderBlock(decodeHeaderBytes(binary.slice(0, m.index))),
    body: binary.slice(m.index + m[0].length),
  };
}

function decodeTransfer(body: string, encoding: string | null): Uint8Array {
  switch ((encoding ?? "7bit").trim().toLowerCase()) {
    case "base64":
      return decodeBase64(body);
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return binaryToBytes(body);
  }
}

function splitMultipart(body: string, boundary: string): string[] | null {
  const delim = `--${boundary}`;
  const parts: string[] = [];
  let pos = body.startsWith(delim) ? 0 : body.indexOf(`\n${delim}`);
  if (pos < 0) return null;
  if (pos > 0) pos += 1;
  while (pos >= 0) {
    const lineEnd = body.indexOf("\n", pos);
    const marker = body.slice(pos + delim.length, pos + delim.length + 2);
    if (marker === "--" || lineEnd < 0) break; // closing delimiter
    const start = lineEnd + 1;
    const next = body.indexOf(`\n${delim}`, start);
    const end = next < 0 ? body.length : next;
    // The CRLF before the delimiter belongs to the delimiter (RFC 2046 5.1.1).
    parts.push(body.slice(start, end).replace(/\r$/, ""));
    if (next < 0) break;
    pos = next + 1;
  }
  return parts;
}

/** HTML to readable text with a character scanner (no regex over markup): tags dropped, block tags
 *  as line breaks, script/style content skipped, common entities decoded. Output is plain text and is
 *  only ever rendered as text. */
export function htmlToText(html: string): string {
  const BLOCK = new Set([
    "br",
    "p",
    "div",
    "tr",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "table",
  ]);
  let out = "";
  let i = 0;
  let skipUntil: string | null = null;
  while (i < html.length) {
    const c = html[i];
    if (c === "<") {
      const close = html.indexOf(">", i + 1);
      if (close < 0) break;
      const tag = html.slice(i + 1, close).trim();
      const name = (/^\/?\s*([a-zA-Z0-9]+)/.exec(tag)?.[1] ?? "").toLowerCase();
      const closing = tag.startsWith("/");
      if (skipUntil) {
        if (closing && name === skipUntil) skipUntil = null;
      } else if (!closing && (name === "script" || name === "style" || name === "head")) {
        skipUntil = name;
      } else if (BLOCK.has(name)) {
        out += "\n";
      } else if (name === "td" || name === "th") {
        if (!closing) out += "\t";
      }
      i = close + 1;
      continue;
    }
    if (!skipUntil) out += c;
    i++;
  }
  return decodeEntities(out)
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  deg: "°",
  plusmn: "±",
  times: "×",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  oslash: "ø",
  Oslash: "Ø",
  micro: "µ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+[0-9]*);/g, (m, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const n = Number.parseInt(body.slice(2), 16);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    if (body.startsWith("#")) {
      const n = Number.parseInt(body.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[body] ?? m;
  });
}

// ---------------------------------------------------------------------------------------------
// The walk

interface Walk {
  plain: string[];
  html: string[];
  attachments: MimeAttachment[];
  notes: string[];
  parts: number;
}

function fileNameOf(h: Headers): string | null {
  const disp = header(h, "content-disposition");
  const type = header(h, "content-type");
  const name =
    (disp ? parseHeaderValue(disp).params.filename : undefined) ??
    (type ? parseHeaderValue(type).params.name : undefined);
  if (!name) return null;
  const decoded = decodeEncodedWords(name)
    .replace(/[\\/]/g, "_")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return decoded.slice(0, 200) || null;
}

function walk(part: Part, w: Walk, depth: number) {
  w.parts++;
  if (w.parts > MAX_PARTS) {
    if (w.parts === MAX_PARTS + 1) w.notes.push(`Only the first ${MAX_PARTS} parts were read.`);
    return;
  }
  const ct = parseHeaderValue(header(part.headers, "content-type") ?? "text/plain");
  const type = ct.value || "text/plain";
  const disposition = parseHeaderValue(header(part.headers, "content-disposition") ?? "");
  const fileName = fileNameOf(part.headers);
  const isAttachment =
    disposition.value === "attachment" || (fileName !== null && !type.startsWith("multipart/"));

  if (type.startsWith("multipart/")) {
    if (depth >= MAX_DEPTH) {
      w.notes.push("A deeply nested part of the email was not read.");
      return;
    }
    const boundary = ct.params.boundary;
    const children = boundary ? splitMultipart(part.body, boundary) : null;
    if (!children) {
      w.notes.push("A multipart section had no readable boundary and was skipped.");
      return;
    }
    for (const child of children) walk(splitHeadersBody(child), w, depth + 1);
    return;
  }

  const encoding = header(part.headers, "content-transfer-encoding");
  let bytes: Uint8Array;
  try {
    bytes = decodeTransfer(part.body, encoding);
  } catch {
    w.notes.push(`${fileName ?? "A part"} could not be decoded and was skipped.`);
    return;
  }

  // A forwarded message attached whole: read its body and attachments too.
  if (type === "message/rfc822" && depth < MAX_DEPTH) {
    const inner = splitHeadersBody(bytesToBinary(bytes));
    const subject = header(inner.headers, "subject");
    const from = header(inner.headers, "from");
    const intro = ["--- Attached message ---"];
    if (from) intro.push(`From: ${decodeEncodedWords(from)}`);
    if (subject) intro.push(`Subject: ${decodeEncodedWords(subject)}`);
    const nested: Walk = {
      plain: [],
      html: [],
      attachments: w.attachments,
      notes: w.notes,
      parts: w.parts,
    };
    walk(inner, nested, depth + 1);
    w.parts = nested.parts;
    const body = nested.plain.join("\n\n") || nested.html.map(htmlToText).join("\n\n");
    w.plain.push(`${intro.join("\n")}\n${body}`.trim());
    return;
  }

  if (!isAttachment && type === "text/plain") {
    w.plain.push(decodeCharset(bytes, ct.params.charset ?? null, w.notes));
    return;
  }
  if (!isAttachment && type === "text/html") {
    w.html.push(decodeCharset(bytes, ct.params.charset ?? null, w.notes));
    return;
  }
  if (type === "application/ms-tnef" || fileName?.toLowerCase() === "winmail.dat") {
    w.notes.push(
      "winmail.dat (an Outlook rich-text wrapper) can't be read: ask the sender to resend the attachments as plain files.",
    );
    return;
  }
  w.attachments.push({
    fileName: fileName ?? `attachment-${w.attachments.length + 1}${extensionFor(type)}`,
    contentType: type,
    bytes,
    inline: disposition.value === "inline",
    contentId: header(part.headers, "content-id")?.replace(/^<|>$/g, "") ?? null,
  });
}

function extensionFor(type: string): string {
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "text/plain": ".txt",
    "text/csv": ".csv",
  };
  return map[type] ?? "";
}

/** Parse one raw RFC 5322 message. Never throws on malformed input; problems become notes. */
export function parseEmail(raw: Uint8Array): ParsedEmail {
  const top = splitHeadersBody(bytesToBinary(raw));
  const w: Walk = { plain: [], html: [], attachments: [], notes: [], parts: 0 };
  walk(top, w, 0);
  const get = (name: string) => {
    const v = header(top.headers, name);
    return v === null ? null : decodeEncodedWords(v).trim() || null;
  };
  const text = (w.plain.length > 0 ? w.plain.join("\n\n") : w.html.map(htmlToText).join("\n\n"))
    .replace(/\r\n/g, "\n")
    .trim();
  return {
    subject: get("subject"),
    from: get("from"),
    messageId: get("message-id"),
    inReplyTo: get("in-reply-to"),
    references: get("references"),
    date: get("date"),
    authenticationResults: header(top.headers, "authentication-results"),
    text,
    attachments: w.attachments,
    notes: w.notes,
  };
}
