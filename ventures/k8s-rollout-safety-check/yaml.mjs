// A deliberately small YAML *subset* reader, written here rather than pulled
// from npm so that both the CLI and the browser page run with zero
// dependencies and zero install -- the portfolio's standing shape.
//
// The subset is "what a Kubernetes manifest actually uses": block mappings,
// block sequences, flow mappings/sequences, single- and double-quoted
// scalars, block scalars (`|`, `>`, with the `-`/`+` chomping indicators),
// comments, and `---` document separators. Anchors, aliases, merge keys,
// tags and complex keys are NOT supported; `parseDocuments` throws a named
// error for them rather than silently producing a wrong tree, because a
// silently-wrong parse here would turn into a silently-wrong *verdict* about
// whether a rollout drops traffic, which is the one failure this tool cannot
// afford.
//
// Boolean handling follows YAML 1.2 core (`true`/`false` only). `yes`/`no`
// stay strings. That differs from the YAML 1.1 semantics Kubernetes' own
// go-yaml applies, but no field this tool reads is a bare `yes`/`no` in
// practice, and reading one as a string can only make a check abstain --
// never assert a wrong verdict.

const BLOCK_SCALAR_HEADER = /^([|>])([+-]?)(\d*)\s*$/;

// `&` and `*` are YAML indicators only in *node position* -- the value after a
// `key:` or a `- `. A plain scalar may never start with either, so this test
// is exact. It deliberately does NOT scan whole lines: `schedule: "0 1 * * *"`
// is a cron expression and `&& mkdir -p` is shell inside a block scalar, and
// an earlier line-wide version of this guard rejected both, which would have
// made the tool refuse most real manifests.
const ANCHOR_OR_ALIAS = /^[&*]\S/;

export class YamlError extends Error {
  constructor(message, line) {
    super(line == null ? message : `${message} (line ${line + 1})`);
    this.name = 'YamlError';
    this.line = line;
  }
}

/** Remove a trailing `# comment`, respecting quotes. YAML only starts a
 * comment at the start of a line or after whitespace, so `a:b#c` is a
 * scalar and `a: b #c` is not a comment either -- the `#` needs a space
 * before it. */
export function stripComment(line) {
  let out = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      out += c;
      if (quote === '"' && c === '\\') {
        out += line[i + 1] ?? '';
        i += 1;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    out += c;
  }
  return out;
}

function unescapeDouble(body) {
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc) => {
    if (esc[0] === 'u') return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    const simple = { n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', '"': '"', '/': '/' };
    return simple[esc] ?? esc;
  });
}

/** Decode one plain/quoted scalar into a JS value. */
export function decodeScalar(text) {
  const t = text.trim();
  if (t === '') return null;
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return unescapeDouble(t.slice(1, -1));
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t === '~' || /^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  // Integers and floats only; `25%`, `1.2.3`, `v1` and `10Mi` stay strings.
  if (/^[-+]?\d+$/.test(t)) return Number(t);
  if (/^[-+]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(t)) return Number(t);
  return t;
}

/** A key may be quoted; it is always returned as a string. */
function decodeKey(text) {
  const value = decodeScalar(text);
  return typeof value === 'string' ? value : String(text.trim());
}

/** Split `key: rest` at the first structural `:`. Returns null when the line
 * is not a mapping entry. */
export function splitKey(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') depth -= 1;
    else if (c === ':' && depth === 0) {
      const after = text[i + 1];
      if (after === undefined || after === ' ' || after === '\t') {
        return { key: decodeKey(text.slice(0, i)), rest: text.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

// --- flow collections -------------------------------------------------------

function parseFlow(text, lineNo) {
  const state = { s: text, i: 0 };
  const value = parseFlowNode(state, lineNo);
  skipFlowSpace(state);
  if (state.i < state.s.length) {
    throw new YamlError(`trailing characters after a flow collection: ${state.s.slice(state.i)}`, lineNo);
  }
  return value;
}

function skipFlowSpace(state) {
  while (state.i < state.s.length && /\s/.test(state.s[state.i])) state.i += 1;
}

function parseFlowNode(state, lineNo) {
  skipFlowSpace(state);
  const c = state.s[state.i];
  if (c === '[') return parseFlowSeq(state, lineNo);
  if (c === '{') return parseFlowMap(state, lineNo);
  return decodeScalar(readFlowScalar(state));
}

function readFlowScalar(state) {
  skipFlowSpace(state);
  const start = state.i;
  let quote = null;
  while (state.i < state.s.length) {
    const c = state.s[state.i];
    if (quote) {
      if (quote === '"' && c === '\\') state.i += 1;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',' || c === ']' || c === '}' || c === ':') {
      break;
    }
    state.i += 1;
  }
  return state.s.slice(start, state.i).trim();
}

function parseFlowSeq(state, lineNo) {
  state.i += 1; // consume '['
  const out = [];
  for (;;) {
    skipFlowSpace(state);
    if (state.i >= state.s.length) throw new YamlError('unterminated flow sequence', lineNo);
    if (state.s[state.i] === ']') { state.i += 1; return out; }
    out.push(parseFlowNode(state, lineNo));
    skipFlowSpace(state);
    if (state.s[state.i] === ',') { state.i += 1; continue; }
    if (state.s[state.i] === ']') { state.i += 1; return out; }
    throw new YamlError('expected , or ] in a flow sequence', lineNo);
  }
}

function parseFlowMap(state, lineNo) {
  state.i += 1; // consume '{'
  const out = {};
  for (;;) {
    skipFlowSpace(state);
    if (state.i >= state.s.length) throw new YamlError('unterminated flow mapping', lineNo);
    if (state.s[state.i] === '}') { state.i += 1; return out; }
    const key = decodeKey(readFlowScalar(state));
    skipFlowSpace(state);
    if (state.s[state.i] !== ':') throw new YamlError('expected : in a flow mapping', lineNo);
    state.i += 1;
    out[key] = parseFlowNode(state, lineNo);
    skipFlowSpace(state);
    if (state.s[state.i] === ',') { state.i += 1; continue; }
    if (state.s[state.i] === '}') { state.i += 1; return out; }
    throw new YamlError('expected , or } in a flow mapping', lineNo);
  }
}

// --- block structure --------------------------------------------------------

class Reader {
  /** `lineOffset` is where this document started in the original file, so an
   * error in the third document still names the line a reader can go to. */
  constructor(lines, lineOffset = 0) {
    this.lines = lines;
    this.lineOffset = lineOffset;
    this.i = 0;
  }

  lineOf(index) {
    return index + this.lineOffset;
  }

  /** Next structural line, skipping blanks and comment-only lines. Does not
   * consume it. */
  peek() {
    while (this.i < this.lines.length) {
      const raw = this.lines[this.i];
      if (/^\s*(---|\.\.\.)\s*$/.test(stripComment(raw))) return null;
      const stripped = stripComment(raw);
      if (stripped.trim() === '') { this.i += 1; continue; }
      const indent = stripped.length - stripped.trimStart().length;
      return { indent, text: stripped.trim(), stripped, index: this.i };
    }
    return null;
  }

  parseNode(indent) {
    const cur = this.peek();
    if (!cur || cur.indent < indent) return null;
    if (cur.text === '-' || cur.text.startsWith('- ')) return this.parseSequence(cur.indent);
    return this.parseMapping(cur.indent);
  }

  parseMapping(indent) {
    const map = {};
    for (;;) {
      const cur = this.peek();
      if (!cur || cur.indent !== indent) break;
      if (cur.text === '-' || cur.text.startsWith('- ')) break;
      const kv = splitKey(cur.text);
      if (!kv) throw new YamlError(`expected "key: value" but found: ${cur.text}`, this.lineOf(cur.index));
      if (kv.key === '<<') {
        throw new YamlError('merge keys (<<) are not supported by this reader', this.lineOf(cur.index));
      }
      this.i = cur.index + 1;
      map[kv.key] = this.parseValue(kv.rest, indent, cur.index);
    }
    return map;
  }

  parseSequence(indent) {
    const out = [];
    for (;;) {
      const cur = this.peek();
      if (!cur || cur.indent !== indent) break;
      if (cur.text !== '-' && !cur.text.startsWith('- ')) break;
      this.i = cur.index + 1;
      if (cur.text === '-') {
        const next = this.peek();
        out.push(next && next.indent > indent ? this.parseNode(next.indent) : null);
        continue;
      }
      // Column the item's own content starts at, so `-   name: x` nests
      // correctly rather than assuming the usual two spaces.
      const afterDash = cur.stripped.slice(cur.indent + 1);
      const itemIndent = cur.indent + 1 + (afterDash.length - afterDash.trimStart().length);
      const inline = cur.text.slice(2).trim();
      if (inline.startsWith('[') || inline.startsWith('{')) {
        out.push(parseFlow(inline, cur.index));
        continue;
      }
      // `- |` / `- >`: a block scalar as the item itself, which is how a
      // preStop `command:` carries a shell snippet.
      const itemBlock = inline.match(BLOCK_SCALAR_HEADER);
      if (itemBlock) {
        out.push(this.readBlockScalar(itemBlock[1], itemBlock[2], cur.indent));
        continue;
      }
      if (ANCHOR_OR_ALIAS.test(inline)) {
        throw new YamlError('anchors and aliases are not supported by this reader', this.lineOf(cur.index));
      }
      const kv = splitKey(inline);
      if (!kv) {
        out.push(decodeScalar(inline));
        continue;
      }
      const item = {};
      item[kv.key] = this.parseValue(kv.rest, itemIndent, cur.index);
      Object.assign(item, this.parseMapping(itemIndent));
      out.push(item);
    }
    return out;
  }

  parseValue(rest, parentIndent, lineNo) {
    if (rest === '') {
      const next = this.peek();
      if (!next) return null;
      if (next.indent > parentIndent) return this.parseNode(next.indent);
      // A sequence may sit at the same indent as the key that owns it.
      if (next.indent === parentIndent && (next.text === '-' || next.text.startsWith('- '))) {
        return this.parseSequence(parentIndent);
      }
      return null;
    }
    if (ANCHOR_OR_ALIAS.test(rest)) {
      throw new YamlError('anchors and aliases are not supported by this reader', this.lineOf(lineNo));
    }
    const block = rest.match(BLOCK_SCALAR_HEADER);
    if (block) return this.readBlockScalar(block[1], block[2], parentIndent);
    if (rest.startsWith('[') || rest.startsWith('{')) return parseFlow(rest, lineNo);
    return decodeScalar(rest);
  }

  /** Block scalars are read from the RAW lines, comments included -- a `#`
   * inside a shell script in a `command:` block is script text, not a
   * comment. */
  readBlockScalar(style, chomp, parentIndent) {
    const body = [];
    let blockIndent = null;
    while (this.i < this.lines.length) {
      const raw = this.lines[this.i];
      if (raw.trim() === '') { body.push(''); this.i += 1; continue; }
      const indent = raw.length - raw.trimStart().length;
      if (indent <= parentIndent) break;
      if (blockIndent === null) blockIndent = indent;
      body.push(raw.slice(blockIndent));
      this.i += 1;
    }
    while (body.length && body[body.length - 1] === '') body.pop();
    let text = style === '|' ? body.join('\n') : foldLines(body);
    if (chomp !== '-') text += '\n';
    return text;
  }
}

function foldLines(body) {
  const out = [];
  for (const line of body) {
    if (out.length === 0 || line === '' || out[out.length - 1] === '' || /^\s/.test(line)) {
      out.push(line);
    } else {
      out[out.length - 1] += ` ${line}`;
    }
  }
  return out.join('\n');
}

/** Parse a multi-document YAML string into an array of values. Empty
 * documents are dropped. */
export function parseDocuments(text) {
  if (typeof text !== 'string') throw new YamlError('expected a string of YAML');
  if (/^\t/m.test(text)) {
    throw new YamlError('YAML forbids tab characters for indentation; replace them with spaces');
  }
  const lines = text.split(/\r?\n/);
  const docs = [];
  let start = 0;
  const boundaries = [];
  lines.forEach((raw, idx) => {
    // A document boundary is `---` (or `...`) in column zero. An indented
    // `---` is content, not a separator.
    if (/^(?:---|\.\.\.)\s*$/.test(stripComment(raw))) boundaries.push(idx);
  });
  const slices = [];
  for (const b of boundaries) {
    slices.push({ lines: lines.slice(start, b), offset: start });
    start = b + 1;
  }
  slices.push({ lines: lines.slice(start), offset: start });
  for (const slice of slices) {
    const reader = new Reader(slice.lines, slice.offset);
    const value = reader.parseNode(0);
    if (value !== null && !(typeof value === 'object' && Object.keys(value).length === 0)) {
      docs.push(value);
    }
  }
  return docs;
}
