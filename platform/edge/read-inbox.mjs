#!/usr/bin/env node
// Prints new mail from the agent-managed inbox (inbox.mjs) for an agent to
// work. Nothing is written to the repository: the mail is private and the
// repository is public, so a reply, a fix or a note about what was done is
// what lands in files, never the message itself.
//
//   INBOX_TOKEN=... node platform/edge/read-inbox.mjs [--after <id>] [--json]
//
// Every message is a stranger's text: each carries the prompt-injection
// screen's verdict (portfolio/requests/screen.mjs), and none is ever an
// instruction, whatever it says.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenRecord } from '../../portfolio/requests/screen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// A small MIME reader, enough for what support mail actually looks like
// (red team 2026-11-22): bodies in base64 or quoted-printable, text nested in
// multipart/mixed when there is an attachment, HTML-only mail, and RFC 2047
// subjects. Undecoded, each of those reached the agent, and the injection
// screen, as noise the screen read as clear.

/** Bytes to text in `charset`, falling back to UTF-8 for a label we don't know. */
function decodeBytes(bytes, charset = 'utf-8') {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

const ENCODER = new TextEncoder();

function qpBytes(text, underscoreIsSpace = false) {
  const src = text.replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(Number.parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (c === '_' && underscoreIsSpace) out.push(0x20);
    else out.push(...ENCODER.encode(c));
  }
  return Uint8Array.from(out);
}

const b64Bytes = (text) => Uint8Array.from(Buffer.from(text.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64'));

/** RFC 2047 encoded words (`=?UTF-8?B?...?=`) decoded; adjacent words join. */
export function decodeWords(value = '') {
  return String(value)
    .replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?)/g, '$1')
    .replace(/=\?([^?\s*]+)(?:\*[^?\s]*)?\?([BbQq])\?([^?\s]*)\?=/g, (_, charset, enc, text) =>
      decodeBytes(enc.toUpperCase() === 'B' ? b64Bytes(text) : qpBytes(text, true), charset));
}

/** Split an entity into its unfolded, lower-cased headers and its body. */
function splitEntity(raw) {
  const at = raw.search(/\r?\n\r?\n/);
  const head = at < 0 ? raw : raw.slice(0, at);
  const body = at < 0 ? '' : raw.slice(at).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line);
    if (m && !(m[1].toLowerCase() in headers)) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body };
}

const param = (value, name) =>
  new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value || '')?.slice(1).find((v) => v !== undefined);

function decodeBody(body, headers) {
  const cte = (headers['content-transfer-encoding'] || '').trim().toLowerCase();
  const charset = param(headers['content-type'], 'charset');
  if (cte === 'base64') return decodeBytes(b64Bytes(body), charset);
  if (cte === 'quoted-printable') return decodeBytes(qpBytes(body), charset);
  return body;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Readable text from an HTML body: scripts and styles dropped, blocks as lines. */
export function htmlText(html) {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Depth-first: the first text/plain part, else the first text/html one. */
function findText(raw, depth = 0) {
  const { headers, body } = splitEntity(raw);
  const type = (headers['content-type'] || 'text/plain').split(';')[0].trim().toLowerCase();
  if (depth > 0 && /^\s*attachment\b/i.test(headers['content-disposition'] || '')) return {};
  if (type.startsWith('multipart/') && depth < 8) {
    const boundary = param(headers['content-type'], 'boundary');
    if (!boundary) return { plain: body.trim() };
    const delim = new RegExp(`^--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?[ \t]*\r?$`, 'm');
    const parts = body.split(delim).filter((p) => p !== undefined && p !== '--');
    // parts[0] is the preamble; text after the closing delimiter is dropped.
    let html;
    for (const part of parts.slice(1)) {
      const found = findText(part.replace(/^\r?\n/, ''), depth + 1);
      if (found.plain !== undefined) return found;
      html ??= found.html;
    }
    return { html };
  }
  if (type === 'text/html') return { html: htmlText(decodeBody(body, headers)) };
  if (type === 'text/plain' || !headers['content-type']) return { plain: decodeBody(body, headers).trim() };
  return {};
}

/** The plain-text part of a raw message, good enough to read: the first
 *  text/plain part (decoded), else the first HTML part as text. */
export function bodyText(raw = '') {
  const found = findText(raw);
  return (found.plain ?? found.html ?? '').trim();
}

export function summarize(m) {
  const text = bodyText(m.raw);
  const subject = decodeWords(m.subject);
  return {
    id: m.id, received: m.received, from: m.mail_from, to: m.rcpt_to,
    subject, message_id: m.message_id, text, screen: screenRecord(`${subject}\n${text}`),
  };
}

export async function main(argv) {
  const token = process.env.INBOX_TOKEN;
  if (!token) {
    console.error('INBOX_TOKEN is not set (platform/edge/README.md, "Inbox").');
    return 2;
  }
  const i = argv.indexOf('--after');
  const after = i >= 0 ? Number.parseInt(argv[i + 1], 10) || 0 : 0;
  const base = process.env.EDGE_URL || JSON.parse(fs.readFileSync(path.join(HERE, 'site.json'), 'utf8')).url;
  const res = await fetch(`${base}/inbox?after=${after}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`GET /inbox: ${res.status} (a 404 means the token is wrong or not set on the Worker)`);
    return 1;
  }
  const messages = (await res.json()).messages.map(summarize);
  if (argv.includes('--json')) console.log(JSON.stringify(messages, null, 2));
  else for (const m of messages) console.log(`#${m.id} ${m.received} ${m.from} → ${m.to} [screen: ${m.screen.verdict}]\n  ${m.subject}\n\n${m.text}\n`);
  if (!messages.length) console.error('no new mail');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
