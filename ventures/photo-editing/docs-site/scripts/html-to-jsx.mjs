/**
 * HTML to JSX converter for the documentation build.
 *
 * This replaces the abandoned `htmltojsx` package (last published 2016), which
 * reached us through a dependency chain containing two CRITICAL advisories:
 * `request` (SSRF, deprecated and unfixable) and `form-data` (CRLF injection),
 * both pulled in via `jsdom-no-contextify`. It also dragged React 15 and
 * yargs 4 into a React 19 project. See SECURITY_ROADMAP.md.
 *
 * The conversion semantics below are a deliberate, behaviour-preserving port of
 * htmltojsx's DOM traversal (BSD-licensed, Facebook, 2014) onto `parse5` — a
 * maintained, spec-compliant parser with no vulnerable dependencies. Output is
 * byte-identical to the previous implementation for this repository's
 * documentation set, which `scripts/test-html-to-jsx.mjs` asserts against
 * committed golden files.
 *
 * Only the behaviour actually reachable from `build-docs.mjs` is ported. The
 * upstream `createClass` mode, its CLI, and its browser entry point are not.
 */
import { parseFragment } from 'parse5';

const INDENT = '  ';

/**
 * Attribute renames, frozen from what htmltojsx derived at load time from
 * React 15's HTMLDOMPropertyConfig and SVGDOMPropertyConfig. Only entries whose
 * React name differs from the HTML attribute name are listed; every other
 * attribute passes through unchanged, which is what the original did by
 * falling through to the raw attribute name.
 */
const ATTRIBUTE_MAPPING = {
  for: 'htmlFor',
  class: 'className',
  'accept-charset': 'acceptCharset',
  accesskey: 'accessKey',
  allowfullscreen: 'allowFullScreen',
  allowtransparency: 'allowTransparency',
  autocomplete: 'autoComplete',
  autoplay: 'autoPlay',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  charset: 'charSet',
  classid: 'classID',
  colspan: 'colSpan',
  contenteditable: 'contentEditable',
  contextmenu: 'contextMenu',
  crossorigin: 'crossOrigin',
  datetime: 'dateTime',
  enctype: 'encType',
  formaction: 'formAction',
  formenctype: 'formEncType',
  formmethod: 'formMethod',
  formnovalidate: 'formNoValidate',
  formtarget: 'formTarget',
  frameborder: 'frameBorder',
  hreflang: 'hrefLang',
  'http-equiv': 'httpEquiv',
  inputmode: 'inputMode',
  keyparams: 'keyParams',
  keytype: 'keyType',
  marginheight: 'marginHeight',
  marginwidth: 'marginWidth',
  maxlength: 'maxLength',
  mediagroup: 'mediaGroup',
  minlength: 'minLength',
  novalidate: 'noValidate',
  playsinline: 'playsInline',
  radiogroup: 'radioGroup',
  readonly: 'readOnly',
  referrerpolicy: 'referrerPolicy',
  rowspan: 'rowSpan',
  spellcheck: 'spellCheck',
  srcdoc: 'srcDoc',
  srclang: 'srcLang',
  srcset: 'srcSet',
  tabindex: 'tabIndex',
  usemap: 'useMap',
  autocapitalize: 'autoCapitalize',
  autocorrect: 'autoCorrect',
  autosave: 'autoSave',
  itemprop: 'itemProp',
  itemscope: 'itemScope',
  itemtype: 'itemType',
  itemid: 'itemID',
  itemref: 'itemRef',
  'accent-height': 'accentHeight',
  'alignment-baseline': 'alignmentBaseline',
  'arabic-form': 'arabicForm',
  'baseline-shift': 'baselineShift',
  'cap-height': 'capHeight',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'color-interpolation': 'colorInterpolation',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'color-profile': 'colorProfile',
  'color-rendering': 'colorRendering',
  'dominant-baseline': 'dominantBaseline',
  'enable-background': 'enableBackground',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'flood-color': 'floodColor',
  'flood-opacity': 'floodOpacity',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-size-adjust': 'fontSizeAdjust',
  'font-stretch': 'fontStretch',
  'font-style': 'fontStyle',
  'font-variant': 'fontVariant',
  'font-weight': 'fontWeight',
  'glyph-name': 'glyphName',
  'glyph-orientation-horizontal': 'glyphOrientationHorizontal',
  'glyph-orientation-vertical': 'glyphOrientationVertical',
  'horiz-adv-x': 'horizAdvX',
  'horiz-origin-x': 'horizOriginX',
  'image-rendering': 'imageRendering',
  'letter-spacing': 'letterSpacing',
  'lighting-color': 'lightingColor',
  'marker-end': 'markerEnd',
  'marker-mid': 'markerMid',
  'marker-start': 'markerStart',
  'overline-position': 'overlinePosition',
  'overline-thickness': 'overlineThickness',
  'paint-order': 'paintOrder',
  'panose-1': 'panose1',
  'pointer-events': 'pointerEvents',
  'rendering-intent': 'renderingIntent',
  'shape-rendering': 'shapeRendering',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'strikethrough-position': 'strikethroughPosition',
  'strikethrough-thickness': 'strikethroughThickness',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'text-anchor': 'textAnchor',
  'text-decoration': 'textDecoration',
  'text-rendering': 'textRendering',
  'underline-position': 'underlinePosition',
  'underline-thickness': 'underlineThickness',
  'unicode-bidi': 'unicodeBidi',
  'unicode-range': 'unicodeRange',
  'units-per-em': 'unitsPerEm',
  'v-alphabetic': 'vAlphabetic',
  'v-hanging': 'vHanging',
  'v-ideographic': 'vIdeographic',
  'v-mathematical': 'vMathematical',
  'vector-effect': 'vectorEffect',
  'vert-adv-y': 'vertAdvY',
  'vert-origin-x': 'vertOriginX',
  'vert-origin-y': 'vertOriginY',
  'word-spacing': 'wordSpacing',
  'writing-mode': 'writingMode',
  'x-height': 'xHeight',
  'xlink:actuate': 'xlinkActuate',
  'xlink:arcrole': 'xlinkArcrole',
  'xlink:href': 'xlinkHref',
  'xlink:role': 'xlinkRole',
  'xlink:show': 'xlinkShow',
  'xlink:title': 'xlinkTitle',
  'xlink:type': 'xlinkType',
  'xml:base': 'xmlBase',
  'xmlns:xlink': 'xmlnsXlink',
  'xml:lang': 'xmlLang',
  'xml:space': 'xmlSpace',
};

/** Per-element attribute renames. Mirrors htmltojsx's ELEMENT_ATTRIBUTE_MAPPING. */
const ELEMENT_ATTRIBUTE_MAPPING = {
  input: { checked: 'defaultChecked', value: 'defaultValue' },
};

/**
 * SVG element names whose JSX spelling is camelCased. HTML element names are
 * already lowercase coming out of parse5 and map to themselves.
 */
const ELEMENT_TAG_NAME_MAPPING = {
  altglyph: 'altGlyph',
  altglyphdef: 'altGlyphDef',
  altglyphitem: 'altGlyphItem',
  animatecolor: 'animateColor',
  animatemotion: 'animateMotion',
  animatetransform: 'animateTransform',
  clippath: 'clipPath',
  'color-profile': 'colorProfile',
  fedropshadow: 'feDropShadow',
  feblend: 'feBlend',
  fecolormatrix: 'feColorMatrix',
  fecomponenttransfer: 'feComponentTransfer',
  fecomposite: 'feComposite',
  feconvolvematrix: 'feConvolveMatrix',
  fediffuselighting: 'feDiffuseLighting',
  fedisplacementmap: 'feDisplacementMap',
  fedistantlight: 'feDistantLight',
  feflood: 'feFlood',
  fefunca: 'feFuncA',
  fefuncb: 'feFuncB',
  fefuncg: 'feFuncG',
  fefuncr: 'feFuncR',
  fegaussianblur: 'feGaussianBlur',
  feimage: 'feImage',
  femerge: 'feMerge',
  femergenode: 'feMergeNode',
  femorphology: 'feMorphology',
  feoffset: 'feOffset',
  fepointlight: 'fePointLight',
  fespecularlighting: 'feSpecularLighting',
  fespotlight: 'feSpotLight',
  fetile: 'feTile',
  feturbulence: 'feTurbulence',
  'font-face': 'fontFace',
  'font-face-format': 'fontFaceFormat',
  'font-face-name': 'fontFaceName',
  'font-face-src': 'fontFaceSrc',
  'font-face-uri': 'fontFaceUri',
  foreignobject: 'foreignObject',
  glyphref: 'glyphRef',
  lineargradient: 'linearGradient',
  'missing-glyph': 'missingGlyph',
  radialgradient: 'radialGradient',
  textpath: 'textPath',
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function jsxTagName(tagName) {
  const name = tagName.toLowerCase();
  return Object.prototype.hasOwnProperty.call(ELEMENT_TAG_NAME_MAPPING, name)
    ? ELEMENT_TAG_NAME_MAPPING[name]
    : name;
}

function hyphenToCamelCase(string) {
  return string.replace(/-(.)/g, (_match, chr) => chr.toUpperCase());
}

function isEmptyText(string) {
  return !/[^\s]/.test(string);
}

function isConvertiblePixelValue(value) {
  return /^\d+px$/.test(value);
}

/**
 * Matches htmltojsx's `isNumeric`: a value is numeric when `parseInt` round
 * trips it. `"720"` qualifies, `"1.5rem"` and `""` do not.
 */
function isNumeric(input) {
  return (
    input !== undefined &&
    input !== null &&
    (typeof input === 'number' || String(parseInt(input, 10)) === String(input))
  );
}

/**
 * Escapes text exactly as the HTML fragment serializer does, which is what the
 * original achieved by round-tripping through `textContent` / `innerHTML`.
 */
function escapeSpecialChars(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/\u00A0/g, '&nbsp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trimEnd(haystack, needle) {
  return haystack.endsWith(needle) ? haystack.slice(0, -needle.length) : haystack;
}

function isElement(node) {
  return typeof node.tagName === 'string';
}

function isText(node) {
  return node.nodeName === '#text';
}

function isComment(node) {
  return node.nodeName === '#comment';
}

function textContentOf(node) {
  if (isText(node)) return node.value;
  if (!node.childNodes) return '';
  return node.childNodes.map(textContentOf).join('');
}

/** Parses a CSS declaration list into a JSX style object body. */
function styleToJSXString(rawStyle) {
  const styles = new Map();
  for (const declaration of rawStyle.split(';')) {
    const trimmed = declaration.trim();
    const firstColon = trimmed.indexOf(':');
    const key = trimmed.slice(0, firstColon);
    const value = trimmed.slice(firstColon + 1).trim();
    if (key !== '') {
      styles.set(key.toLowerCase(), value);
    }
  }

  const parts = [];
  for (const [key, value] of styles) {
    // A leading `-ms-` keeps its lowercase `ms` prefix in React.
    const jsxKey = hyphenToCamelCase(/^-ms-/.test(key) ? key.slice(1) : key);
    let jsxValue;
    if (isNumeric(value)) {
      jsxValue = value;
    } else if (isConvertiblePixelValue(value)) {
      jsxValue = trimEnd(value, 'px');
    } else {
      jsxValue = `'${value.replace(/'/g, '"')}'`;
    }
    parts.push(`${jsxKey}: ${jsxValue}`);
  }
  return parts.join(', ');
}

class Converter {
  constructor() {
    this.output = '';
    this.level = 0;
    this.inPreTag = false;
  }

  indentedNewline() {
    return '\n' + INDENT.repeat(this.level + 2);
  }

  visit(node) {
    if (isElement(node)) {
      this.beginVisitElement(node);
      this.traverse(node);
      this.endVisitElement(node);
    } else if (isText(node)) {
      this.visitText(node);
    } else if (isComment(node)) {
      this.output += '{/*' + node.data.replace('*/', '* /') + '*/}';
    }
  }

  traverse(node) {
    this.level++;
    for (const child of node.childNodes ?? []) {
      this.visit(child);
    }
    this.level--;
  }

  /**
   * A node renders self-closing when it has no children. `style` is forced
   * closed because its text is hoisted into dangerouslySetInnerHTML, and
   * `textarea` because its text is hoisted into defaultValue.
   */
  isSelfClosing(node) {
    const tagName = jsxTagName(node.tagName);
    const hasChildren = (node.childNodes ?? []).length > 0;
    return !hasChildren || tagName === 'textarea' || tagName === 'style';
  }

  beginVisitElement(node) {
    const tagName = jsxTagName(node.tagName);
    const attributes = [];
    for (const attr of node.attrs ?? []) {
      attributes.push(this.elementAttribute(tagName, attr));
    }

    if (tagName === 'textarea') {
      // Textarea children are not valid JSX children; hoist them to defaultValue.
      attributes.push('defaultValue={' + JSON.stringify(textContentOf(node)) + '}');
    }
    if (tagName === 'style') {
      // Style bodies use curly braces liberally, so they cannot be JSX children.
      attributes.push(
        'dangerouslySetInnerHTML={{__html: ' + JSON.stringify(textContentOf(node)) + ' }}',
      );
    }
    if (tagName === 'pre') {
      this.inPreTag = true;
    }

    this.output += '<' + tagName;
    if (attributes.length > 0) {
      this.output += ' ' + attributes.join(' ');
    }
    if (!this.isSelfClosing(node)) {
      this.output += '>';
    }
  }

  endVisitElement(node) {
    const tagName = jsxTagName(node.tagName);
    // De-indent by one level: the closing tag sits at the parent's depth.
    this.output = trimEnd(this.output, INDENT);
    this.output += this.isSelfClosing(node) ? ' />' : '</' + tagName + '>';
    if (tagName === 'pre') {
      this.inPreTag = false;
    }
  }

  visitText(node) {
    const parent = node.parentNode;
    const parentTag = parent && isElement(parent) ? jsxTagName(parent.tagName) : null;
    if (parentTag === 'textarea' || parentTag === 'style') {
      // Already hoisted into an attribute by beginVisitElement.
      return;
    }

    let text = escapeSpecialChars(node.value);

    if (this.inPreTag) {
      // Inside <pre>, JSX would collapse runs of whitespace, so significant
      // whitespace is emitted as string expressions instead.
      text = text
        .replace(/\r/g, '')
        .replace(/( {2,}|\n|\t|\{|\})/g, (whitespace) => '{' + JSON.stringify(whitespace) + '}');
    } else {
      text = text.replace(/(\{|\})/g, (brace) => "{'" + brace + "'}");
      if (text.indexOf('\n') > -1) {
        text = text.replace(/\n\s*/g, this.indentedNewline());
      }
    }
    this.output += text;
  }
}

/**
 * Determines whether the fragment has exactly one element at the top level and
 * no non-whitespace text beside it, in which case no wrapper div is needed.
 */
function onlyOneTopLevel(fragment) {
  const children = fragment.childNodes ?? [];
  if (children.length === 1 && isElement(children[0])) {
    return true;
  }
  let foundElement = false;
  for (const child of children) {
    if (isElement(child)) {
      if (foundElement) return false;
      foundElement = true;
    } else if (isText(child) && !isEmptyText(child.value)) {
      return false;
    }
  }
  return true;
}

function cleanInput(html) {
  // Script tags are dropped rather than converted; they cannot be represented
  // as JSX children and have no place in generated documentation.
  return html.trim().replace(/<script([\s\S]*?)<\/script>/g, '');
}

Converter.prototype.elementAttribute = function elementAttribute(tagName, attr) {
  if (attr.name === 'style') {
    return 'style={{' + styleToJSXString(attr.value) + '}}';
  }
  const name =
    (ELEMENT_ATTRIBUTE_MAPPING[tagName] && ELEMENT_ATTRIBUTE_MAPPING[tagName][attr.name]) ||
    ATTRIBUTE_MAPPING[attr.name] ||
    attr.name;

  if (isNumeric(attr.value)) {
    return name + '={' + attr.value + '}';
  }
  if (attr.value.length > 0) {
    return name + '="' + attr.value.replace(/"/gm, '&quot;') + '"';
  }
  return name;
};

/**
 * Converts an HTML fragment into JSX source text.
 *
 * @param {string} html Well-formed HTML fragment.
 * @returns {string} JSX source, with a wrapping <div> only when the fragment
 *   has more than one top-level node.
 */
export function convert(html) {
  const converter = new Converter();
  // The surrounding newlines match how the original assigned to innerHTML, and
  // they affect where the traversal inserts indentation.
  const source = '\n' + cleanInput(html) + '\n';
  // parse5 parses fragments in a <template> context by default, which does not
  // apply the in-table insertion modes. `div` reproduces the innerHTML context
  // the original relied on, so table markup nests the same way.
  const fragment = parseFragment({ nodeName: 'div', tagName: 'div', attrs: [], namespaceURI: 'http://www.w3.org/1999/xhtml' }, source);

  if (onlyOneTopLevel(fragment)) {
    converter.traverse(fragment);
  } else {
    converter.output += INDENT.repeat(3);
    converter.level++;
    converter.output += '<div>';
    converter.traverse(fragment);
    converter.output = trimEnd(converter.output, INDENT) + '</div>';
  }

  converter.output = converter.output.trim() + '\n';
  // Strip the indentation the original reserved for a React.createClass body.
  return converter.output.replace(new RegExp('\\n' + INDENT + INDENT + INDENT, 'g'), '\n');
}

export const __testing = {
  escapeSpecialChars,
  styleToJSXString,
  isNumeric,
  jsxTagName,
  ATTRIBUTE_MAPPING,
  VOID_ELEMENTS,
};
