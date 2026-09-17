// A deliberately small YAML reader, scoped to the subset GitHub Actions
// workflow files actually use.
//
// Why not a library: every venture here ships zero-dependency and runs the
// same code in a browser tab and in `node cli.mjs`, so a parser has to be
// something we carry. Why not the line-by-line regex scan the `actions-*`
// checkers in this portfolio use: those answer a question about one key
// (`permissions:`, `uses:`) and can afford to look at lines in isolation.
// This tool has to know that a `matrix:` belongs to a `strategy:` that
// belongs to a *particular* job, and that `timeout-minutes` two levels down
// is the step's and not the job's -- which is structure, not text.
//
// What it supports: block mappings, block sequences, flow sequences
// (`[a, b]`), flow mappings (`{a: 1}`), quoted and bare scalars, comments,
// and block scalars (`|`, `>`), whose body is captured as text.
//
// What it does NOT support, and refuses rather than guesses: anchors and
// aliases (`&x` / `*x`), merge keys, and multi-document streams. A workflow
// using them is rare; silently mis-reading one would put a wrong number in
// front of someone deciding what their CI costs, which is worse than saying
// so. See `UnsupportedYamlError`.
//
// One deliberate divergence from the YAML 1.1 spec, and it is the right one
// here: `on` stays the string key `"on"`. A spec-compliant 1.1 loader reads
// the bare word `on` as boolean true, so `workflow["on"]` comes back
// undefined and the triggers vanish -- a real and well-known trap for tools
// that read workflow files. Keys are always strings in this reader.

export class UnsupportedYamlError extends Error {}

const UNSUPPORTED = [
  { re: /(^|\s)[&*][A-Za-z0-9_-]+(\s|$)/, what: 'YAML anchors or aliases (& / *)' },
  { re: /^\s*<<\s*:/, what: 'YAML merge keys (<<:)' },
];

/** Strip a trailing `# comment`, respecting quotes. Returns the code part. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    // A `#` only starts a comment at the start of the line or after a space.
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function indentOf(line) {
  return line.length - line.replace(/^ +/, '').length;
}

/** Parse a scalar token: quoted string, number, boolean, null, or bare text. */
function parseScalar(raw) {
  const text = String(raw).trim();
  if (text === '') return null;
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    const inner = text.slice(1, -1);
    // Single-quoted YAML escapes a quote by doubling it.
    return text[0] === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"');
  }
  if (text === 'true' || text === 'True') return true;
  if (text === 'false' || text === 'False') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d*\.\d+$/.test(text)) return Number(text);
  return text;
}

/** Split a flow collection body on commas at depth 0, respecting quotes. */
function splitFlow(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') parts.push(current);
  return parts.map((p) => p.trim());
}

function parseFlow(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return splitFlow(trimmed.slice(1, -1)).map((item) =>
      /^[[{]/.test(item) ? parseFlow(item) : parseScalar(item),
    );
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const out = {};
    for (const entry of splitFlow(trimmed.slice(1, -1))) {
      const idx = entry.indexOf(':');
      if (idx === -1) continue;
      const key = parseScalar(entry.slice(0, idx));
      const value = entry.slice(idx + 1).trim();
      out[String(key)] = /^[[{]/.test(value) ? parseFlow(value) : parseScalar(value);
    }
    return out;
  }
  return parseScalar(trimmed);
}

/** True when `text` opens a flow collection that is not closed on this line. */
function isUnclosedFlow(text) {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  let depth = 0;
  let quote = null;
  for (const ch of trimmed) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
  }
  return depth > 0;
}

const KEY_RE = /^(?:("(?:[^"\\]|\\.)*")|('(?:[^']|'')*')|([^:#]+?))\s*:(?:\s+([\s\S]*))?$/;

/**
 * Parse a block starting at `lines[start]`, consuming every line indented at
 * least `indent`. Returns `[value, nextIndex]`.
 */
function parseBlock(lines, start, indent) {
  let i = start;
  // Skip blanks and comment-only lines.
  while (i < lines.length && lines[i].code.trim() === '') i++;
  if (i >= lines.length) return [null, i];

  const first = lines[i];
  if (first.indent < indent) return [null, i];

  if (/^-(\s|$)/.test(first.code.trim())) return parseSequence(lines, i, first.indent);
  return parseMapping(lines, i, first.indent);
}

function parseSequence(lines, start, indent) {
  const out = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.code.trim() === '') {
      i++;
      continue;
    }
    if (line.indent < indent) break;
    if (line.indent > indent || !/^-(\s|$)/.test(line.code.trim())) break;

    const rest = line.code.trim().replace(/^-\s*/, '');
    if (rest === '') {
      // `-` alone: the item is the nested block beneath it.
      const [value, next] = parseBlock(lines, i + 1, indent + 1);
      out.push(value);
      i = next;
      continue;
    }
    // `- key: value` starts a mapping whose keys align after the dash.
    const dashOffset = line.code.indexOf('-');
    const itemIndent = dashOffset + line.code.trim().indexOf(rest) - line.code.trim().indexOf('-');
    if (KEY_RE.test(rest) && !/^[[{]/.test(rest)) {
      const synthetic = lines.slice();
      synthetic[i] = { indent: itemIndent, code: ' '.repeat(itemIndent) + rest };
      const [value, next] = parseMapping(synthetic, i, itemIndent);
      out.push(value);
      i = next;
      continue;
    }
    out.push(/^[[{]/.test(rest) ? parseFlow(rest) : parseScalar(rest));
    i++;
  }
  return [out, i];
}

function parseMapping(lines, start, indent) {
  const out = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.code.trim() === '') {
      i++;
      continue;
    }
    if (line.indent < indent) break;
    if (line.indent > indent) break;
    if (/^-(\s|$)/.test(line.code.trim())) break;

    const match = KEY_RE.exec(line.code.trim());
    if (!match) {
      i++;
      continue;
    }
    const rawKey = match[1] ?? match[2] ?? match[3];
    const key = String(parseScalar(rawKey));
    const inline = (match[4] ?? '').trim();
    i++;

    if (inline === '' ) {
      const [value, next] = parseBlock(lines, i, indent + 1);
      out[key] = value;
      i = next;
      continue;
    }
    if (/^[|>]/.test(inline)) {
      // Block scalar: take every following line more indented than the key.
      const body = [];
      while (i < lines.length && (lines[i].code.trim() === '' || lines[i].indent > indent)) {
        body.push(lines[i].raw.slice(Math.min(lines[i].indent, indent + 1)));
        i++;
      }
      out[key] = body.join('\n').trim();
      continue;
    }
    if (isUnclosedFlow(inline)) {
      // A flow collection wrapped across lines.
      let buffer = inline;
      while (i < lines.length && isUnclosedFlow(buffer)) {
        buffer += ' ' + lines[i].code.trim();
        i++;
      }
      out[key] = parseFlow(buffer);
      continue;
    }
    out[key] = /^[[{]/.test(inline) ? parseFlow(inline) : parseScalar(inline);
  }
  return [out, i];
}

/**
 * Parse a YAML document into plain JS values.
 *
 * @throws {UnsupportedYamlError} when the document uses a feature this reader
 *   would have to guess at (anchors, aliases, merge keys, multiple documents).
 */
export function parseYaml(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  if (/^---\s*$/m.test(source.replace(/^---\s*\n/, ''))) {
    throw new UnsupportedYamlError('multi-document YAML streams are not supported');
  }
  const lines = source
    .replace(/^---\s*\n/, '')
    .split('\n')
    .map((raw) => {
      const code = stripComment(raw).replace(/\s+$/, '');
      return { raw, code, indent: indentOf(code) };
    });

  for (const { code } of lines) {
    for (const { re, what } of UNSUPPORTED) {
      if (re.test(code)) throw new UnsupportedYamlError(`${what} are not supported`);
    }
  }

  const [value] = parseBlock(lines, 0, 0);
  return value;
}
