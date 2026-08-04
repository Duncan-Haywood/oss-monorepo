// Enough of a browser to answer one question: at this viewport width, can a
// visitor still get there?
//
// The homepage ships no dependencies and no build, so there is no headless
// browser here to ask. What broke without one was invisible to every existing
// test: `@media (max-width: 760px) { .nav-links { display: none } }` removed
// the entire navigation — and the studio's only contact route above the fold —
// from every phone, while the markup still contained all four links and the
// suite still passed. A contract that reads the markup alone cannot see it,
// because the markup is not what is wrong.
//
// So this models exactly two things and refuses everything else: the element
// tree, and the cascade for the single `display` property. Every construct it
// cannot resolve throws rather than being skipped — a responsive contract that
// silently ignores the one rule it does not understand is worse than none,
// because it reports PASSED over the gap.

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/* -------------------------------------------------------------- markup --- */

const TAG = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR = /([a-zA-Z_:@][-\w:.]*)\s*=\s*"([^"]*)"/g;

function attributesOf(text) {
  const attributes = {};
  for (const [, name, value] of text.matchAll(ATTR)) attributes[name] = value;
  return attributes;
}

/**
 * Parse index.html into a tree of `{ tag, id, classes, attributes, children,
 * parent }`. Throws on a tag that never closes or closes out of order, so a
 * malformed page fails here rather than being silently modelled as flat.
 */
export function parseDocument(html) {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[^>]*>/i, '');

  // An external <script src>/<link rel=stylesheet> is the shape this page
  // ships. Inline bodies are refused rather than parsed as markup, because
  // a `<` inside them would derail the scanner below.
  for (const [, , body] of cleaned.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if (body.trim()) {
      throw new Error(
        'this model does not resolve inline <script>/<style>; the page is meant ' +
          'to ship its script and stylesheet as separate files'
      );
    }
  }

  const root = makeNode('#document', {}, null);
  let current = root;
  let cursorIndex = 0;

  for (const match of cleaned.matchAll(TAG)) {
    const [, closing, rawTag, attributeText] = match;
    const tag = rawTag.toLowerCase();

    current.text += cleaned.slice(cursorIndex, match.index);
    cursorIndex = match.index + match[0].length;

    if (closing) {
      if (VOID_ELEMENTS.has(tag)) continue;
      if (current.tag !== tag) {
        throw new Error(`</${tag}> closes <${current.tag}>, so the markup is not well formed`);
      }
      current = current.parent;
      continue;
    }

    const node = makeNode(tag, attributesOf(attributeText), current);
    current.children.push(node);
    if (!VOID_ELEMENTS.has(tag) && !attributeText.trimEnd().endsWith('/')) current = node;
  }

  if (current !== root) throw new Error(`<${current.tag}> is never closed`);
  return root;
}

function makeNode(tag, attributes, parent) {
  return {
    tag,
    parent,
    attributes,
    id: attributes.id ?? null,
    classes: new Set((attributes.class ?? '').split(/\s+/).filter(Boolean)),
    children: [],
    text: '',
  };
}

/** The visible text of an element, ignoring anything marked aria-hidden. */
export function textOf(node) {
  if (node.attributes['aria-hidden'] === 'true') return '';
  return [node.text, ...node.children.map(textOf)].join(' ').replace(/\s+/g, ' ').trim();
}

/** The name assistive technology announces for a control. */
export function accessibleName(node) {
  return (node.attributes['aria-label'] ?? '').trim() || textOf(node);
}

/** Every element in the tree, in document order. */
export function elements(node) {
  const found = [];
  for (const child of node.children) {
    found.push(child, ...elements(child));
  }
  return found;
}

/** The first element matching a predicate, in document order. */
export function findElement(root, predicate) {
  return elements(root).find(predicate) ?? null;
}

/** The chain from an element up to (and excluding) the document. */
export function ancestry(node) {
  const chain = [];
  for (let cursor = node; cursor && cursor.tag !== '#document'; cursor = cursor.parent) {
    chain.push(cursor);
  }
  return chain;
}

/** Whether `node` is `ancestor` or sits inside it. */
export function isWithin(node, ancestor) {
  return ancestry(node).includes(ancestor);
}

/* ---------------------------------------------------------------- css ---- */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Split a stylesheet body into `{ prelude, body }` at brace depth zero. */
function blocks(css) {
  const found = [];
  let index = 0;

  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open === -1) break;

    let depth = 1;
    let cursor = open + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) throw new Error('unbalanced braces in the stylesheet');

    found.push({ prelude: css.slice(index, open).trim(), body: css.slice(open + 1, cursor - 1) });
    index = cursor;
  }
  return found;
}

function declaredDisplay(body) {
  // Only this block's own declarations: a nested block's braces are gone by the
  // time a rule body reaches here, so any `display:` found belongs to it.
  const matches = [...body.matchAll(/(?:^|;)\s*display\s*:\s*([^;}]+)/g)];
  return matches.length ? matches.at(-1)[1].trim() : null;
}

function refuseDisplayIn(prelude, body) {
  if (declaredDisplay(body) !== null || /[{;]\s*display\s*:/.test(body)) {
    throw new Error(`this contract cannot resolve display rules inside "${prelude}"`);
  }
}

/** `(max-width: 760px)` -> 760. Anything else -> null. */
function mediaMaxWidth(prelude) {
  const match = prelude.match(/^@media\s*\(\s*max-width:\s*(\d+)px\s*\)$/);
  return match ? Number(match[1]) : null;
}

const COMPOUND = /^([a-z][\w-]*|\*)?((?:[.#][A-Za-z][\w-]*)*)$/;

function parseCompound(part, selector) {
  const match = part.match(COMPOUND);
  if (!match) throw new Error(`this contract cannot resolve the selector "${selector}"`);

  const tokens = match[2].match(/[.#][A-Za-z][\w-]*/g) ?? [];
  const ids = tokens.filter((t) => t.startsWith('#')).map((t) => t.slice(1));
  if (ids.length > 1) throw new Error(`two ids in one compound: "${selector}"`);

  return {
    tag: match[1] && match[1] !== '*' ? match[1] : null,
    id: ids[0] ?? null,
    classes: tokens.filter((t) => t.startsWith('.')).map((t) => t.slice(1)),
  };
}

/** Descendant combinators only; a combinator we cannot model throws. */
function parseSelector(selector) {
  if (/[>+~]|::|:[a-z]/i.test(selector)) {
    throw new Error(`this contract cannot resolve the selector "${selector}"`);
  }
  const compounds = selector.trim().split(/\s+/).map((part) => parseCompound(part, selector));
  const specificity = compounds.reduce(
    (total, c) => [total[0] + (c.id ? 1 : 0), total[1] + c.classes.length, total[2] + (c.tag ? 1 : 0)],
    [0, 0, 0]
  );
  return { selector, compounds, specificity };
}

/**
 * Every rule in the stylesheet that sets `display`, in source order, with the
 * viewport width above which it stops applying.
 */
export function displayRules(css) {
  const rules = [];
  let order = 0;

  const collect = (prelude, body, maxWidth) => {
    const display = declaredDisplay(body);
    if (display === null) return;
    for (const selector of prelude.split(',')) {
      if (!selector.trim()) continue;
      rules.push({ ...parseSelector(selector), display, maxWidth, order: order++ });
    }
  };

  for (const block of blocks(stripComments(css))) {
    if (!block.prelude.startsWith('@')) {
      collect(block.prelude, block.body, Infinity);
      continue;
    }

    const maxWidth = mediaMaxWidth(block.prelude);
    if (maxWidth === null) {
      // A media query keyed on something other than width — print, colour
      // scheme, reduced motion. Harmless while it sets no `display`; if it ever
      // does, this model would silently resolve the wrong value.
      refuseDisplayIn(block.prelude, block.body);
      continue;
    }
    for (const inner of blocks(block.body)) {
      if (inner.prelude.startsWith('@')) {
        throw new Error(`this contract cannot resolve nested "${inner.prelude}"`);
      }
      collect(inner.prelude, inner.body, maxWidth);
    }
  }

  return rules;
}

/* ------------------------------------------------------------ cascade ---- */

function compoundMatches(compound, node, extraClasses) {
  if (compound.tag && compound.tag !== node.tag) return false;
  if (compound.id && compound.id !== node.id) return false;
  const active = extraClasses.get(node);
  return compound.classes.every((name) => node.classes.has(name) || active?.has(name));
}

function selectorMatches(rule, node, extraClasses) {
  const compounds = rule.compounds;
  if (!compoundMatches(compounds.at(-1), node, extraClasses)) return false;

  let remaining = compounds.length - 2;
  for (let cursor = node.parent; cursor && remaining >= 0; cursor = cursor.parent) {
    if (compoundMatches(compounds[remaining], cursor, extraClasses)) remaining -= 1;
  }
  return remaining < 0;
}

function beats(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a.specificity[i] !== b.specificity[i]) return a.specificity[i] > b.specificity[i];
  }
  return a.order > b.order;
}

/**
 * The `display` this element resolves to at `width`, or null when no rule sets
 * it. `state` maps an element to classes a script has added at runtime, so the
 * opened panel can be asked about as well as the closed one.
 */
export function displayAt(node, { rules, width, state = new Map() }) {
  let winner = null;
  for (const rule of rules) {
    if (width > rule.maxWidth) continue;
    if (!selectorMatches(rule, node, state)) continue;
    if (!winner || beats(rule, winner)) winner = rule;
  }
  return winner ? winner.display : null;
}

/** An element is on screen when neither it nor any ancestor is display:none. */
export function isVisibleAt(node, options) {
  return ancestry(node).every((cursor) => displayAt(cursor, options) !== 'none');
}

/** The nearest ancestor-or-self that `display:none` removes, if any. */
export function hiddenBy(node, options) {
  return ancestry(node).find((cursor) => displayAt(cursor, options) === 'none') ?? null;
}
