// A small MIME reader that runs in a Worker, in Lambda and in Node: no
// Buffer, no dependencies. It reads what support mail looks like (bodies in
// base64 or quoted-printable, text nested in multipart/*, HTML-only mail,
// RFC 2047 subjects and names) and lists attachments without decoding them.
// Grown from platform/edge/read-inbox.mjs, which keeps its own copy for the
// old /inbox route.

const ENC = new TextEncoder();

function decodeBytes(bytes, charset = 'utf-8') {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function qpBytes(text, underscoreIsSpace = false) {
  const src = text.replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(Number.parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (c === '_' && underscoreIsSpace) out.push(0x20);
    else out.push(...ENC.encode(c));
  }
  return Uint8Array.from(out);
}

function b64Bytes(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

/** RFC 2047 encoded words decoded; adjacent words join. */
export function decodeWords(value = '') {
  return String(value)
    .replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?)/g, '$1')
    .replace(/=\?([^?\s*]+)(?:\*[^?\s]*)?\?([BbQq])\?([^?\s]*)\?=/g, (_, charset, enc, text) =>
      decodeBytes(enc.toUpperCase() === 'B' ? b64Bytes(text) : qpBytes(text, true), charset));
}

/** Headers (unfolded, names lower-cased, every value kept) and the body. */
export function splitEntity(raw) {
  const at = raw.search(/\r?\n\r?\n/);
  const head = at < 0 ? raw : raw.slice(0, at);
  const body = at < 0 ? '' : raw.slice(at).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line);
    if (m) (headers[m[1].toLowerCase()] ||= []).push(m[2]);
  }
  return { headers, body };
}

const first = (headers, name) => (headers[name] || [])[0] || '';

export const param = (value, name) =>
  new RegExp(`(?:^|;)\\s*${name}\\*?\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value || '')?.slice(1).find((v) => v !== undefined);

function decodeBody(body, headers) {
  const cte = first(headers, 'content-transfer-encoding').trim().toLowerCase();
  const charset = param(first(headers, 'content-type'), 'charset');
  if (cte === 'base64') return decodeBytes(b64Bytes(body), charset);
  if (cte === 'quoted-printable') return decodeBytes(qpBytes(body), charset);
  return body;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Readable text from HTML: scripts, styles and head dropped, blocks as lines. */
export function htmlText(html) {
  const untilStable = (s, re, by) => {
    let prev;
    let out = s;
    do { prev = out; out = out.replace(re, by); } while (out !== prev);
    return out;
  };
  const noRaw = untilStable(html, /<(script|style|head)\b[\s\S]*?<\/\1\b[^>]*>/gi, '');
  const lines = noRaw.replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, '\n');
  return untilStable(lines, /<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

function walk(raw, acc, depth = 0) {
  const { headers, body } = splitEntity(raw);
  const ctype = first(headers, 'content-type') || 'text/plain';
  const type = ctype.split(';')[0].trim().toLowerCase();
  const disp = first(headers, 'content-disposition');
  const filename = decodeWords(param(disp, 'filename') || param(ctype, 'name') || '');
  if (type.startsWith('multipart/') && depth < 8) {
    const boundary = param(ctype, 'boundary');
    if (!boundary) { acc.plain ??= body.trim(); return; }
    const delim = new RegExp(`^--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?[ \t]*\r?$`, 'm');
    // split() with the capture group gives [preamble, cap, part1, cap, part2, cap, ...]; a '--' capture closes the
    // body, and RFC 2046 5.1.1 says the epilogue after it is ignored (it used to parse as an empty text/plain part).
    const pieces = body.split(delim);
    for (let i = 2; i < pieces.length; i += 2) {
      walk(pieces[i].replace(/^\r?\n/, ''), acc, depth + 1);
      if (pieces[i + 1] === '--') break;
    }
    return;
  }
  const isAttachment = depth > 0 && (/^\s*attachment\b/i.test(disp) || (filename && !type.startsWith('text/')));
  if (isAttachment) {
    const cte = first(headers, 'content-transfer-encoding').trim().toLowerCase();
    const size = cte === 'base64' ? Math.floor(body.replace(/[^A-Za-z0-9+/]/g, '').length * 3 / 4) : body.length;
    if (acc.attachments.length < 50) acc.attachments.push({ filename: filename.slice(0, 200), type: type.slice(0, 100), size });
    return;
  }
  if (type === 'text/html') { acc.htmlPresent = true; acc.html ??= htmlText(decodeBody(body, headers)); return; }
  if (type === 'text/plain' || !first(headers, 'content-type')) acc.plain ??= decodeBody(body, headers).trim();
}

/** Addresses in a header value: `Name <a@b>, c@d` → [{name, address}]. */
export function parseAddressList(value = '') {
  const out = [];
  const decoded = decodeWords(value);
  // Split on commas that are outside quotes and angle brackets.
  let depth = 0, quoted = false, cur = '';
  const parts = [];
  for (const ch of decoded) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '<') depth++;
    else if (!quoted && ch === '>') depth = Math.max(0, depth - 1);
    if (ch === ',' && !quoted && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  for (const p of parts) {
    const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(p);
    const bare = /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(p);
    const address = (angle?.[1] || bare?.[1] || '').toLowerCase();
    if (!address) continue;
    const name = angle ? p.slice(0, p.indexOf('<')).replace(/["']/g, '').trim() : '';
    out.push({ name: name.slice(0, 200), address: address.slice(0, 320) });
  }
  return out;
}

const msgIds = (value = '') => (String(value).match(/<[^<>\s]+>/g) || []).slice(0, 50);

/** Is this mail a machine's (an auto-reply, a bounce, a list)? RFC 3834 says
 *  never answer those automatically, and answering them is how mail loops start. */
export function isAutomated(headers, from = '') {
  const auto = first(headers, 'auto-submitted').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (headers['list-id'] || headers['list-unsubscribe']) return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(first(headers, 'precedence').trim())) return true;
  if (headers['x-autoreply'] || headers['x-autorespond']) return true;
  return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?)([+@.-]|$)/i.test(String(from));
}

/** Everything the store keeps about one message, parsed from raw text. */
export function parseMessage(raw, { maxText = 64 * 1024 } = {}) {
  const { headers } = splitEntity(raw);
  const acc = { attachments: [], htmlPresent: false };
  walk(raw, acc);
  const from = parseAddressList(first(headers, 'from'))[0] || { name: '', address: '' };
  const replyTo = parseAddressList(first(headers, 'reply-to'))[0]?.address || '';
  const text = (acc.plain ?? acc.html ?? '').trim();
  return {
    from: from.address,
    fromName: from.name,
    replyTo,
    to: parseAddressList((headers.to || []).join(', ')).map((a) => a.address),
    cc: parseAddressList((headers.cc || []).join(', ')).map((a) => a.address),
    subject: decodeWords(first(headers, 'subject')).replace(/[\r\n]+/g, ' ').trim().slice(0, 300),
    messageId: msgIds(first(headers, 'message-id'))[0] || '',
    inReplyTo: msgIds(first(headers, 'in-reply-to'))[0] || '',
    references: msgIds((headers.references || []).join(' ')),
    date: first(headers, 'date').slice(0, 100),
    text: text.slice(0, maxText),
    textTruncated: text.length > maxText,
    htmlPresent: acc.htmlPresent,
    attachments: acc.attachments,
    automated: isAutomated(headers, from.address),
    authResults: (headers['authentication-results'] || []).join(' | ').slice(0, 1000),
  };
}

/** Subject with reply/forward prefixes removed, for matching a thread. */
export function baseSubject(subject = '') {
  let s = String(subject).trim();
  for (;;) {
    const next = s.replace(/^\s*(re|fw|fwd|aw|sv|antw)\s*(\[\d+\])?\s*:\s*/i, '').replace(/^\[[^\]]{1,40}\]\s*/, '');
    if (next === s) return s.toLowerCase();
    s = next;
  }
}

/** Build a plain-text RFC 5322 message. Header values are stripped of CR/LF,
 *  so a draft's subject cannot inject headers. */
export function buildMime({ from, fromName = '', to, subject, text, messageId, inReplyTo = '', references = [], extraHeaders = {}, date = new Date() }) {
  const clean = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  const enc = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${btoa(String.fromCharCode(...ENC.encode(v)))}?=`);
  const lines = [
    `From: ${fromName ? `${enc(clean(fromName))} <${clean(from)}>` : clean(from)}`,
    `To: ${clean(to)}`,
    `Subject: ${enc(clean(subject))}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${clean(messageId)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${clean(inReplyTo)}`);
  if (references.length) lines.push(`References: ${clean(references.join(' '))}`);
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (/^[A-Za-z0-9-]+$/.test(k)) lines.push(`${k}: ${clean(v)}`);
  }
  const bytes = ENC.encode(String(text).replace(/\r?\n/g, '\r\n'));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin).replace(/.{1,76}/g, '$&\r\n');
  return `${lines.join('\r\n')}\r\n\r\n${b64}`;
}
