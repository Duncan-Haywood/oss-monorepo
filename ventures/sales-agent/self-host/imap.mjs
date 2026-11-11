// Minimal read-only IMAP client (RFC 3501 subset) plus a small MIME reader. No dependencies. It can LOGIN, SELECT
// read-only (EXAMINE), SEARCH and FETCH with BODY.PEEK, so it never marks mail read, never deletes, never sends.
import net from "node:net";
import tls from "node:tls";

// SNI must be a hostname: Node warns on an IP literal and some servers then refuse the handshake.
export const servername = (h) => (/^[\d.]+$|:/.test(h) ? undefined : h);

const q = (s) => `"${String(s).replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, "")}"`;

/** One connection, one command at a time. Resolves { lines, literals } per tagged response. */
export class Imap {
  constructor({ host, port = 993, secure = true, timeoutMs = 20000, ca }) { Object.assign(this, { host, port, secure, timeoutMs, ca }); this.buf = Buffer.alloc(0); this.n = 0; }
  connect() {
    return new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      const s = (this.secure ? tls : net).connect({ host: this.host, port: this.port, ...(this.secure ? { servername: servername(this.host), ca: this.ca } : {}) }, () => { s.off("error", onErr); });
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
  // SASL XOAUTH2 (Gmail, Microsoft 365). On failure the server sends a "+ <base64 json>" challenge and waits for an empty line before the NO.
  async loginXoauth2(user, token) {
    const tag = `A${++this.n}`;
    this.sock.write(`${tag} AUTHENTICATE XOAUTH2 ${Buffer.from(`user=${user}\x01auth=Bearer ${token}\x01\x01`).toString("base64")}\r\n`);
    let r = await this.read((l) => l.startsWith("+") || l.startsWith(tag + " "));
    if (r.lines.at(-1).startsWith("+")) { this.sock.write("\r\n"); r = await this.read((l) => l.startsWith(tag + " ")); }
    const last = r.lines.at(-1);
    if (!new RegExp(`^${tag} OK`, "i").test(last)) throw new Error("XOAUTH2 " + last.replace(/^A\d+ /, "").slice(0, 200));
  }
  async examine(box = "INBOX") { await this.cmd(`EXAMINE ${q(box)}`); }
  async search(criteria) { const r = await this.cmd(`UID SEARCH ${criteria}`); const l = r.lines.find((x) => x.startsWith("* SEARCH")); return l ? l.slice(8).trim().split(/\s+/).filter(Boolean).map(Number) : []; }
  async fetchRaw(uid, maxBytes = 200000) {
    const r = await this.cmd(`UID FETCH ${uid} (BODY.PEEK[]<0.${maxBytes}>)`);
    return r.literals[0] || "";
  }
  async logout() { try { await this.cmd("LOGOUT"); } catch {} this.sock?.destroy(); }
}

// ---------- MIME ----------
// The MIME reader lives in ../mime.mjs (no Node built-ins) so the browser page reads .eml and .mbox files with the same code.
export { parseMessage, toReplyBlock, replyBlocks } from "../mime.mjs";
