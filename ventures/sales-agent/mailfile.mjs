// Read exported mail files (.eml, or .mbox from Gmail Takeout, Thunderbird, Apple Mail and most other clients) into the
// reply blocks the inbox agent reads, with the same MIME reader the self-host server uses (mime.mjs). Runs in the
// browser and in Node; no dependencies. Nothing is uploaded: the page streams the file from disk in the browser.
//
//   const c = createCollector({ own: ["me@mycompany.com"] });
//   const s = new MboxSplitter((raw) => c.add(raw)); s.push(text); s.end();    // or c.add(emlText) for one message
//   const { replies, stats } = c.finish();                                    // replies goes to runInbox({ replies })
//
// What is kept: messages that read as a reply (In-Reply-To or References header, a reply prefix on the subject in
// several languages), delivery failures and auto-replies. What is dropped, and counted: your own mail (an address you
// list, or Gmail's "Sent" label), messages that are not replies (newsletters, first emails), the same Message-ID twice,
// and messages with no readable text. Each message is read up to MAX_BYTES, as the IMAP poller does.
import { parseMessage, replyBlocks, headerMap, splitHead } from "./mime.mjs";
import { parseReplies } from "./engine.mjs";

// The self-host server reads each message as parseReplies(block)[0]: quoted history after an Outlook "From: / Sent:"
// block is cut there, and so is everything after a "---" line. Pasted blocks joined by "---" would not be cut that way
// (quoted history could then carry our own footer's "reply stop" into the reply), so each block is read as the server
// reads it and written back in the pasted form.
const asServerReads = (block) => {
  const r = parseReplies(block)[0];
  if (!r) return block;
  const head = [`From: ${r.name ? `${r.name} <${r.from}>` : r.from}`, `Subject: ${r.subject}`, `Date: ${r.date}`, r.signal ? `X-Signal: ${r.signal}` : "", r.failed ? `X-Failed-Recipient: ${r.failed}` : ""].filter(Boolean);
  return `${head.join("\n")}\n\n${r.body.replace(/(\n\s*-{3,}\s*)+$/, "")}`; // a closing "---" line would read as a separator
};

export const MAX_BYTES = 200000;
const REPLY_SUBJECT = /^\s*(re|aw|sv|vs|antw|antwort|r|rif|res|resp|odp)\s*(\[\d+\])?\s*:/i;
const MACHINE_FROM = /^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@/i;
export const addressOf = (from) => ((String(from || "").match(/<([^>]+)>/) || [])[1] || (String(from || "").match(/[^\s<>"',;]+@[^\s<>"',;]+/) || [""])[0]).trim().toLowerCase();

/** True when a text looks like an mbox file (first non-empty line is a "From " envelope line). */
export const isMbox = (text) => /^\s*From \S+/.test(String(text || "").slice(0, 1000));

// A header field line (RFC 5322 field name, then a colon) and an mbox envelope line ("From 1538...@xxx Thu Jun 30
// 12:31:44 +0000 2016" from Takeout, "From - Thu Feb 23 19:37:30 2017" from Thunderbird, "From a@b Mon Jan  1 2001").
const HEADER_LINE = /^[\x21-\x39\x3b-\x7e]+:(?:[ \t]|$)/; // not "http://..."
const ENVELOPE = /^From \S+ +(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\b(?:19|20)\d\d\b|.*\b\d{1,2}:\d\d(?::\d\d)?\b.*\b(?:19|20)\d\d\b)/;
// Header fields an exporter writes first, after its envelope line. Any "Word:" line is not enough: a body paragraph
// "From our side ..." followed by "Note: ..." split a reply in two and dropped its second half.
const FIRST_HEADER = /^(?:x-[\w-]+|arc-[\w-]+|return-path|received|delivered-to|envelope-to|from|sender|to|cc|reply-to|date|subject|message-id|mime-version|content-type|dkim-signature|authentication-results|status):/i;

/**
 * Splits an mbox stream into raw messages. push() takes text chunks of any size, end() flushes the last message.
 * A new message starts at a "From " line at the start of the file or after a blank line; ">From " lines are unescaped
 * (mboxrd). Lines past MAX_BYTES of a message are dropped and counted.
 *
 * Some exporters write mboxo without escaping a body line that starts with "From " (one on GitHub split a reply in two
 * at "From a security standpoint, ...", as Python's mailbox module also does). So a candidate line only starts a message
 * when the line after it is a header an exporter writes first ("X-GM-THRID: ...", "X-Mozilla-Status: ...", "Return-Path:
 * ...", not just any "Note: ..."), or the line itself reads as an envelope (a token, then a date with a weekday or a
 * clock time and a year) and a header-shaped or blank line follows it. Otherwise it stays body text; unescapedFrom
 * counts how many did.
 */
export class MboxSplitter {
  constructor(onMessage, { maxBytes = MAX_BYTES } = {}) { Object.assign(this, { onMessage, maxBytes, carry: "", lines: [], size: 0, prevBlank: true, truncated: 0, cut: false, pending: null, unescapedFrom: 0 }); }
  push(chunk) {
    const text = this.carry + chunk, parts = text.split("\n");
    this.carry = parts.pop();
    for (const p of parts) this.line(p.endsWith("\r") ? p.slice(0, -1) : p);
  }
  line(l) {
    if (this.pending !== null) {
      const p = this.pending; this.pending = null;
      if (FIRST_HEADER.test(l) || (ENVELOPE.test(p) && (HEADER_LINE.test(l) || l === ""))) { this.flush(); this.prevBlank = false; }
      else { this.unescapedFrom++; this.body(p); }
    } else if (this.prevBlank && /^From \S/.test(l)) {
      if (!this.lines.length) { this.flush(); this.prevBlank = false; return; } // the first line of the file, or after blank lines only
      this.pending = l; return;
    }
    this.body(l);
  }
  body(l) {
    this.prevBlank = l === "";
    const u = /^>+From /.test(l) ? l.slice(1) : l;
    if (this.cut || this.size + u.length + 2 > this.maxBytes) { if (!this.cut) { this.cut = true; this.truncated++; } return; }
    this.lines.push(u); this.size += u.length + 2;
  }
  flush() {
    if (this.lines.some((l) => l.trim())) this.onMessage(this.lines.join("\r\n"));
    this.lines = []; this.size = 0; this.cut = false;
  }
  end() {
    if (this.carry) { this.line(this.carry.endsWith("\r") ? this.carry.slice(0, -1) : this.carry); this.carry = ""; }
    if (this.pending !== null) { if (!ENVELOPE.test(this.pending)) { this.unescapedFrom++; this.body(this.pending); } this.pending = null; }
    this.flush();
  }
}

/**
 * Collects raw messages and keeps the replies. own: your addresses (lowercase or not), whose mail is dropped.
 * repliesOnly (default true): drop messages with no reply sign (see the file comment).
 */
export function createCollector({ own = [], repliesOnly = true, maxBytes = MAX_BYTES } = {}) {
  const mine = new Set(own.map((a) => addressOf(a) || String(a).trim().toLowerCase()).filter(Boolean));
  const seen = new Set(), kept = [], senders = new Map(), sent = [];
  const stats = { messages: 0, kept: 0, own: 0, notReply: 0, duplicates: 0, noText: 0, truncated: 0 };
  let order = 0;
  return {
    stats,
    add(raw) {
      stats.messages++;
      if (raw.length > maxBytes) { raw = raw.slice(0, maxBytes); stats.truncated++; }
      const top = headerMap(splitHead(raw)[0]);
      const m = parseMessage(raw), hd = m.headers, from = addressOf(hd.from);
      if (from) senders.set(from, (senders.get(from) || 0) + 1);
      const id = hd.messageId.toLowerCase();
      if (id && seen.has(id)) { stats.duplicates++; return; }
      if (id) seen.add(id);
      if ((from && mine.has(from)) || /(^|,)\s*"?sent"?\s*(,|$)/i.test(top["x-gmail-labels"] || "")) {
        stats.own++;
        // Your own mail is not a reply, but it is a record of the touches you already made: the daily run reads it as
        // the done list (daily.mjs, input.sent), so a step you sent by hand is not queued again.
        // An apostrophe is legal in a local part (o'neal.winfree@...: 64 of 7,836 Enron sent messages), so it is kept
        // inside an address and trimmed only where it quotes one ('a@b').
        const to = [...new Set((`${top.to || ""},${top.cc || ""}`.match(/[^\s<>",;:()]+@[^\s<>"',;:()]+/g) || []).map((a) => a.replace(/^'+/, "").toLowerCase()))];
        const t = Date.parse(hd.date);
        if (to.length && Number.isFinite(t)) sent.push({ date: new Date(t).toISOString().slice(0, 10), to, subject: hd.subject });
        return;
      }
      const machine = !!m.dsn || MACHINE_FROM.test(from) || /^auto-(replied|generated|notified)/i.test(hd.autoSubmitted) || !!hd.xAutoreply || /^auto[_-]?reply\b/i.test(hd.precedence);
      const reply = !!(hd.inReplyTo || top.references) || REPLY_SUBJECT.test(hd.subject);
      if (repliesOnly && !reply && !machine) { stats.notReply++; return; }
      if (!m.text && !m.dsn) { stats.noText++; return; }
      const t = Date.parse(hd.date);
      kept.push({ t: Number.isFinite(t) ? t : Infinity, order: order++, block: replyBlocks(m).map(asServerReads).join("\n---\n"), from, subject: hd.subject });
      stats.kept++;
    },
    /** { replies: blocks joined by "---" lines, oldest first; stats; topSender: the most frequent From address and its count;
     *  sent: your own messages as { date, to: [addresses], subject }, oldest first, for runDaily({ sent }) }. */
    finish() {
      kept.sort((a, b) => a.t - b.t || a.order - b.order);
      const top = [...senders].sort((a, b) => b[1] - a[1])[0];
      return { replies: kept.map((k) => k.block).join("\n---\n"), stats: { ...stats }, topSender: top ? { address: top[0], count: top[1] } : null, items: kept.map(({ from, subject }) => ({ from, subject })), sent: sent.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) };
    },
  };
}

/** One call for files already in memory: [{ name, text }] to the collector's result. */
export function readMailTexts(files, opts = {}) {
  const c = createCollector(opts);
  let truncated = 0;
  for (const f of files) {
    if (isMbox(f.text)) { const s = new MboxSplitter((raw) => c.add(raw), opts); s.push(f.text); s.end(); truncated += s.truncated; }
    else c.add(f.text.replace(/^﻿/, ""));
  }
  const r = c.finish();
  r.stats.truncated += truncated;
  return r;
}

/** Plain-English line for the page and CLI. */
export function describe(r) {
  const s = r.stats, bits = [];
  if (s.own) bits.push(`${s.own} of your own${r.sent?.length ? ` (${r.sent.length} kept as touches already made)` : ""}`);
  if (s.notReply) bits.push(`${s.notReply} not ${s.notReply === 1 ? "a reply" : "replies"}`);
  if (s.duplicates) bits.push(`${s.duplicates} duplicate${s.duplicates === 1 ? "" : "s"}`);
  if (s.noText) bits.push(`${s.noText} with no text`);
  return `${s.messages} message${s.messages === 1 ? "" : "s"} read, ${s.kept} kept as replies${bits.length ? "; left out: " + bits.join(", ") : ""}${s.truncated ? `; ${s.truncated} cut at ${Math.round(MAX_BYTES / 1000)} KB` : ""}.`;
}
