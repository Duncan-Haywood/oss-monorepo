// Minimal read-only IMAP client (RFC 3501 subset) plus a small MIME reader. No dependencies. It can LOGIN, SELECT
// read-only (EXAMINE), SEARCH and FETCH with BODY.PEEK, so it never marks mail read, never deletes, never sends.
import net from "node:net";
import tls from "node:tls";

const q = (s) => `"${String(s).replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, "")}"`;

/** One connection, one command at a time. Resolves { lines, literals } per tagged response. */
export class Imap {
  constructor({ host, port = 993, secure = true, timeoutMs = 20000 }) { Object.assign(this, { host, port, secure, timeoutMs }); this.buf = Buffer.alloc(0); this.n = 0; }
  connect() {
    return new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      const s = (this.secure ? tls : net).connect({ host: this.host, port: this.port, servername: this.host }, () => { s.off("error", onErr); });
      s.once("error", onErr); s.setTimeout(this.timeoutMs, () => s.destroy(new Error("IMAP timeout")));
      s.on("data", (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump?.(); });
      s.on("error", (e) => this.fail?.(e)); s.on("close", () => this.fail?.(new Error("connection closed")));
      this.sock = s;
      this.waitGreeting().then(resolve, reject);
    });
  }
  waitGreeting() { return this.read((line) => (/^\* (OK|PREAUTH)/i.test(line) ? true : (() => { throw new Error("bad greeting: " + line); })())); }
  // Reads until `done(line)` returns true; collects literals ({n}\r\n + n bytes) attached to the preceding line.
  read(done) {
    return new Promise((resolve, reject) => {
      const lines = [], literals = [];
      this.fail = reject;
      this.pump = () => {
        for (;;) {
          const i = this.buf.indexOf("\r\n");
          if (i < 0) return;
          let line = this.buf.subarray(0, i).toString("utf8");
          const m = line.match(/\{(\d+)\}$/);
          if (m) {
            const n = Number(m[1]);
            if (this.buf.length < i + 2 + n) return;
            literals.push(this.buf.subarray(i + 2, i + 2 + n).toString("utf8"));
            this.buf = this.buf.subarray(i + 2 + n);
            // the rest of the line (after the literal) arrives as the next line; keep the marker so callers can pair them
            lines.push(line);
            continue;
          }
          this.buf = this.buf.subarray(i + 2);
          lines.push(line);
          try { if (done(line)) { this.pump = null; resolve({ lines, literals }); return; } } catch (e) { this.pump = null; reject(e); return; }
        }
      };
      this.pump();
    });
  }
  async cmd(text) {
    const tag = `A${++this.n}`;
    this.sock.write(`${tag} ${text}\r\n`);
    const r = await this.read((l) => l.startsWith(tag + " "));
    const last = r.lines[r.lines.length - 1];
    if (!new RegExp(`^${tag} OK`, "i").test(last)) throw new Error(last.replace(/^A\d+ /, "").slice(0, 200));
    return r;
  }
  async login(user, pass) { await this.cmd(`LOGIN ${q(user)} ${q(pass)}`); }
  async examine(box = "INBOX") { await this.cmd(`EXAMINE ${q(box)}`); }
  async search(criteria) { const r = await this.cmd(`UID SEARCH ${criteria}`); const l = r.lines.find((x) => x.startsWith("* SEARCH")); return l ? l.slice(8).trim().split(/\s+/).filter(Boolean).map(Number) : []; }
  async fetchRaw(uid, maxBytes = 200000) {
    const r = await this.cmd(`UID FETCH ${uid} (BODY.PEEK[]<0.${maxBytes}>)`);
    return r.literals[0] || "";
  }
  async logout() { try { await this.cmd("LOGOUT"); } catch {} this.sock?.destroy(); }
}

// ---------- MIME ----------
const unfold = (h) => h.replace(/\r?\n[ \t]+/g, " ");
function decodeWords(s) {
  return s.replace(/=\?([\w-]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, enc, txt) => {
    try { const buf = enc.toLowerCase() === "b" ? Buffer.from(txt, "base64") : Buffer.from(txt.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))), "latin1"); return new TextDecoder(/utf-?8/i.test(cs) ? "utf-8" : cs.toLowerCase()).decode(buf); } catch { return txt; }
  }).replace(/(\S)\s+(?=\S)/g, "$1 ").trim();
}
function decodeBody(body, enc, charset) {
  let buf;
  const e = String(enc || "").toLowerCase();
  if (e === "base64") buf = Buffer.from(body.replace(/\s+/g, ""), "base64");
  else if (e === "quoted-printable") buf = Buffer.from(body.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
  else buf = Buffer.from(body, "utf8");
  try { return new TextDecoder(/utf-?8|^$/i.test(charset || "") ? "utf-8" : charset.toLowerCase()).decode(buf); } catch { return buf.toString("utf8"); }
}
const headerMap = (block) => { const h = {}; for (const l of unfold(block).split(/\r?\n/)) { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m && !(m[1].toLowerCase() in h)) h[m[1].toLowerCase()] = m[2]; } return h; };
const param = (v, k) => (String(v || "").match(new RegExp(`${k}="?([^";]+)"?`, "i")) || [])[1] || "";
const htmlToText = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Parse a raw RFC 822 message into { headers, text }. Prefers text/plain, falls back to stripped text/html. */
export function parseMessage(raw) {
  const split = (s) => { const m = s.match(/\r?\n\r?\n/); return m ? [s.slice(0, m.index), s.slice(m.index + m[0].length)] : [s, ""]; };
  const walk = (src) => {
    const [hb, body] = split(src), h = headerMap(hb), ct = h["content-type"] || "text/plain";
    if (/^multipart\//i.test(ct)) {
      const b = param(ct, "boundary");
      const parts = b ? body.split(new RegExp(`\\r?\\n?--${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*\\r?\\n?`)).slice(1) : [];
      const found = parts.map(walk).filter((p) => p.text);
      return { h, text: (found.find((p) => p.kind === "plain") || found[0] || { text: "" }).text, kind: found.find((p) => p.kind === "plain") ? "plain" : "html" };
    }
    if (/^(text\/html)/i.test(ct)) return { h, kind: "html", text: htmlToText(decodeBody(body, h["content-transfer-encoding"], param(ct, "charset"))) };
    if (/^text\//i.test(ct)) return { h, kind: "plain", text: decodeBody(body, h["content-transfer-encoding"], param(ct, "charset")).trim() };
    return { h, kind: "other", text: "" };
  };
  const top = walk(raw), h = top.h;
  return { headers: { from: decodeWords(h.from || ""), subject: decodeWords(h.subject || ""), date: h.date || "", messageId: (h["message-id"] || "").trim(), autoSubmitted: h["auto-submitted"] || "", contentType: h["content-type"] || "", inReplyTo: h["in-reply-to"] || "" }, text: top.text };
}

/** Turn a parsed message into the `From:` block the engine's parseReplies reads (and keep the quoted history out). */
export const toReplyBlock = (m) => `From: ${m.headers.from}\nSubject: ${m.headers.subject}\nDate: ${m.headers.date}\n\n${m.text}`;
