// Sales Agent M4b: a minimal SMTP submission client (RFC 5321/4954/3207 subset) and the outgoing message builder.
// No dependencies. Implicit TLS (port 465) or STARTTLS (587); AUTH PLAIN or LOGIN. One message per connection.
// It sends only what the caller hands it; the agent calls it for a draft a person approved, never on its own.
import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";

const hdrSafe = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const addrOf = (s) => (String(s).match(/[\w.+'-]+@[\w.-]+\.[A-Za-z]{2,}/) || [""])[0];

/**
 * Build an RFC 5322 reply with the unsubscribe plumbing a cold-outreach reply needs: a List-Unsubscribe mailto header
 * and a one-line footer that says how to stop and carries the sender's postal address (CAN-SPAM). Body lines are
 * dot-stuffed by the client, not here.
 */
export function buildMessage({ from, to, subject, body, inReplyTo = "", references = "", address = "", unsubscribeTo = "", now = Date.now(), host = "" }) {
  const f = addrOf(from), t = addrOf(to);
  if (!f || !t) throw new Error("need a valid From and To address");
  const domain = f.split("@")[1];
  const mid = `<${now.toString(36)}.${randomBytes(6).toString("hex")}@${host || domain}>`;
  const unsub = addrOf(unsubscribeTo) || f;
  const re = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const footer = `\n\n--\nNot interested? Reply "unsubscribe" and I will not email again.${address ? `\n${hdrSafe(address)}` : ""}`;
  const text = (String(body).replace(/\r?\n/g, "\r\n").trimEnd() + footer.replace(/\n/g, "\r\n")) + "\r\n";
  const lines = [
    `From: ${hdrSafe(from)}`, `To: ${hdrSafe(to)}`, `Subject: ${encWord(hdrSafe(re))}`,
    `Date: ${new Date(now).toUTCString().replace("GMT", "+0000")}`, `Message-ID: ${mid}`,
    ...(inReplyTo ? [`In-Reply-To: ${hdrSafe(inReplyTo)}`, `References: ${hdrSafe(references || inReplyTo)}`] : []),
    `List-Unsubscribe: <mailto:${unsub}?subject=unsubscribe>`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "",
  ];
  const b64 = Buffer.from(text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return { raw: lines.join("\r\n") + "\r\n" + b64 + "\r\n", messageId: mid, from: f, to: t };
}

export class Smtp {
  constructor({ host, port = 465, secure = true, starttls = false, timeoutMs = 20000, ehlo = "localhost", allowClear = false }) { Object.assign(this, { host, port, secure, starttls, timeoutMs, ehlo, allowClear }); this.buf = ""; }
  connect() {
    return new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      const s = (this.secure ? tls : net).connect({ host: this.host, port: this.port, servername: this.host }, () => s.off("error", onErr));
      s.once("error", onErr); s.setTimeout(this.timeoutMs, () => s.destroy(new Error("SMTP timeout")));
      this.attach(s);
      this.reply().then((r) => (r.code === 220 ? resolve() : reject(new Error("bad greeting: " + r.text))), reject);
    });
  }
  attach(s) {
    this.sock = s; this.buf = "";
    s.setEncoding("utf8");
    s.on("data", (d) => { this.buf += d; this.pump?.(); });
    s.on("error", (e) => this.fail?.(e)); s.on("close", () => this.fail?.(new Error("connection closed")));
  }
  /** Read one (possibly multi-line) reply: "250-x" lines continue, "250 x" ends. */
  reply() {
    return new Promise((resolve, reject) => {
      this.fail = reject;
      this.pump = () => {
        const lines = this.buf.split("\r\n");
        const end = lines.findIndex((l) => /^\d{3} /.test(l) || /^\d{3}$/.test(l));
        if (end < 0) return;
        const got = lines.slice(0, end + 1);
        this.buf = lines.slice(end + 1).join("\r\n"); this.pump = null;
        resolve({ code: Number(got[end].slice(0, 3)), text: got.map((l) => l.slice(4)).join("\n") });
      };
      this.pump();
    });
  }
  async cmd(line, ok = [250]) {
    this.sock.write(line + "\r\n");
    const r = await this.reply();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text}`);
    return r;
  }
  async hello() {
    const r = await this.cmd(`EHLO ${this.ehlo}`);
    if (this.starttls && !this.secure) {
      if (!/STARTTLS/i.test(r.text)) throw new Error("server does not offer STARTTLS; refusing to send credentials in clear text");
      await this.cmd("STARTTLS", [220]);
      const plain = this.sock; plain.removeAllListeners("data"); plain.removeAllListeners("close"); plain.removeAllListeners("error");
      await new Promise((res, rej) => { const s = tls.connect({ socket: plain, servername: this.host }, res); s.once("error", rej); this.attach(s); });
      return (await this.cmd(`EHLO ${this.ehlo}`)).text;
    }
    return r.text;
  }
  async auth(user, pass, caps) {
    if (/AUTH[^\n]*PLAIN/i.test(caps)) return void (await this.cmd("AUTH PLAIN " + Buffer.from(`\0${user}\0${pass}`).toString("base64"), [235]));
    if (/AUTH[^\n]*LOGIN/i.test(caps)) {
      await this.cmd("AUTH LOGIN", [334]); await this.cmd(Buffer.from(user).toString("base64"), [334]);
      return void (await this.cmd(Buffer.from(pass).toString("base64"), [235]));
    }
    throw new Error("server offers no AUTH PLAIN or LOGIN");
  }
  /** Send one message: { from, to, raw } as built by buildMessage. Returns the server's final reply text. */
  async send({ user, pass, from, to, raw }) {
    const caps = await this.hello();
    if (user) {
      if (!this.secure && !this.starttls && !this.allowClear) throw new Error("refusing to send credentials in clear text (use SMTP_SECURE=true or SMTP_STARTTLS=true)");
      await this.auth(user, pass, caps);
    }
    await this.cmd(`MAIL FROM:<${from}>`); await this.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await this.cmd("DATA", [354]);
    const stuffed = raw.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    this.sock.write(stuffed + (stuffed.endsWith("\r\n") ? "" : "\r\n") + ".\r\n");
    const r = await this.reply();
    if (r.code !== 250) throw new Error(`SMTP ${r.code}: ${r.text}`);
    return r.text;
  }
  async quit() { try { await this.cmd("QUIT", [221]); } catch {} this.sock?.destroy(); }
}
