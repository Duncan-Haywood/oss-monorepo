// Turns a parsed PDF object graph into an accessibility-evidence report.
//
// Pure logic, no I/O -- both the CLI (check.mjs, reading real files with
// Node's zlib) and the browser page (index.html, reading a File the visitor
// chose with the native DecompressionStream API) call analyzePdf() with the
// same bytes and an environment-specific inflate() function, so a PDF never
// leaves whichever process reads it and both surfaces can never silently
// disagree about what a given file means.
//
// What this checks, and why each one is evidence rather than a
// certification, is in README.md and the page's own FAQ -- summarized here
// because the finding text repeats it: this reads PDF *structure* (is a
// StructTreeRoot present, is a language declared, do Figure structure
// elements carry /Alt, do Widget annotations carry /TU), which is what
// PDF/UA and Section 508's "tagged PDF" requirement are actually made of.
// It never renders the page, so it cannot judge reading order, whether an
// alt-text string is *accurate*, or a visual contrast problem -- that is
// exactly the gap a human reviewer (or an assistive-technology test pass)
// still has to close, and every finding below says so.

import {
  scanObjects, findTrailer, expandObjectStreams, decodeStream, resolve,
  isDict, isName, bytesToBinaryString, PName, PDict,
} from './pdf-parser.mjs';

const TEXT_SHOW_RE = /(\)\s*Tj\b)|(\]\s*TJ\b)/;

function dictGet(dict, key) { return isDict(dict) ? dict.get(key) : undefined; }

function asArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }

function collectKids(pagesNode, objects, out, seen, depth = 0) {
  if (depth > 64 || !isDict(pagesNode)) return;
  const kids = resolve(pagesNode.get('Kids'), objects);
  if (!Array.isArray(kids)) {
    // Leaf reached with no Kids array: treat as a page if it looks like one.
    if (pagesNode.has('Contents') || isName(pagesNode.get('Type'), 'Page')) out.push(pagesNode);
    return;
  }
  for (const kidRef of kids) {
    const key = kidRef && typeof kidRef.num === 'number' ? kidRef.num : null;
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const kid = resolve(kidRef, objects);
    if (!isDict(kid)) continue;
    if (isName(kid.get('Type'), 'Pages')) collectKids(kid, objects, out, seen, depth + 1);
    else out.push(kid);
  }
}

function inheritedResources(pageDict, objects, depth = 0) {
  if (!isDict(pageDict) || depth > 32) return null;
  const own = resolve(pageDict.get('Resources'), objects);
  if (isDict(own)) return own;
  const parent = resolve(pageDict.get('Parent'), objects);
  return inheritedResources(parent, objects, depth + 1);
}

/** Walks a structure-tree node (StructTreeRoot or a StructElem) collecting
 * every /Alt string it finds, and counting Figure-ish elements separately
 * from the total so "an image has alt text" and "something in the doc has
 * alt text" don't get conflated. */
function walkStructTree(node, objects, altElements, seen, depth = 0) {
  if (!isDict(node) || depth > 64) return;
  const alt = node.get('Alt');
  if (alt && typeof alt.text === 'string' && alt.text.trim() !== '') altElements.push(node);
  const kids = asArray(resolve(node.get('K'), objects));
  for (const kidRaw of kids) {
    if (kidRaw && typeof kidRaw === 'object' && 'num' in kidRaw) {
      if (seen.has(kidRaw.num)) continue;
      seen.add(kidRaw.num);
    }
    const kid = resolve(kidRaw, objects);
    if (isDict(kid)) walkStructTree(kid, objects, altElements, seen, depth + 1);
    // A bare marked-content-reference (an integer MCID, or a dict without
    // /K) carries no alt text of its own -- nothing further to walk.
  }
}

function collectImageXObjects(resources, objects, seen) {
  const images = [];
  if (!isDict(resources)) return images;
  const xobjDict = resolve(resources.get('XObject'), objects);
  if (isDict(xobjDict)) {
    for (const [, ref] of xobjDict.map) {
      const key = ref && typeof ref.num === 'number' ? ref.num : Symbol();
      if (seen.has(key)) continue;
      seen.add(key);
      const xobj = resolve(ref, objects);
      if (isDict(xobj) && isName(xobj.get('Subtype'), 'Image')) images.push(xobj);
    }
  }
  return images;
}

async function pageHasTextLayer(pageDict, objects, binaryStr, inflate) {
  const contents = pageDict.get('Contents');
  const refs = Array.isArray(contents) ? contents : contents == null ? [] : [contents];
  for (const ref of refs) {
    const num = ref && typeof ref.num === 'number' ? ref.num : null;
    if (num === null) continue;
    const entry = objects.get(num);
    if (!entry) continue;
    // eslint-disable-next-line no-await-in-loop
    const decoded = await decodeStream(entry, binaryStr, inflate);
    if (!decoded) continue; // could not decode -- not evidence either way
    const text = bytesToBinaryString(decoded);
    if (TEXT_SHOW_RE.test(text)) return true;
  }
  return false;
}

function widgetLabel(widget, objects, depth = 0) {
  if (!isDict(widget) || depth > 8) return null;
  const tu = widget.get('TU');
  if (tu && typeof tu.text === 'string' && tu.text.trim() !== '') return tu.text;
  const parent = resolve(widget.get('Parent'), objects);
  return widgetLabel(parent, objects, depth + 1);
}

/**
 * @param {Uint8Array} bytes - the whole PDF file
 * @param {(bytes: Uint8Array) => Promise<Uint8Array|null>} inflate
 * @returns {Promise<Report>}
 */
export async function analyzePdf(bytes, { inflate }) {
  const binaryStr = bytesToBinaryString(bytes);
  if (!binaryStr.includes('%PDF-')) {
    return notAPdfReport();
  }
  const objects = scanObjects(binaryStr);
  await expandObjectStreams(objects, binaryStr, inflate);
  const trailer = findTrailer(binaryStr, objects);

  let catalog = trailer ? resolve(trailer.get('Root'), objects) : null;
  if (!isDict(catalog)) {
    for (const { dict } of objects.values()) {
      if (isDict(dict) && isName(dict.get('Type'), 'Catalog')) { catalog = dict; break; }
    }
  }
  let info = trailer ? resolve(trailer.get('Info'), objects) : null;
  if (!isDict(info)) {
    for (const { dict } of objects.values()) {
      if (isDict(dict) && !dict.has('Type') && (dict.has('Title') || dict.has('Producer') || dict.has('Creator'))) {
        info = dict;
        break;
      }
    }
  }
  const encrypted = !!(trailer && trailer.has('Encrypt'));

  const findings = [];
  const notes = [];

  // --- Tagged PDF: /MarkInfo /Marked true AND a /StructTreeRoot ---------
  const markInfo = catalog ? resolve(catalog.get('MarkInfo'), objects) : null;
  const markedTrue = isDict(markInfo) && markInfo.get('Marked') === true;
  const structTreeRoot = catalog ? resolve(catalog.get('StructTreeRoot'), objects) : null;
  const hasStructTree = isDict(structTreeRoot);
  if (!markedTrue || !hasStructTree) {
    findings.push({
      id: 'not-tagged',
      severity: 'danger',
      title: 'Not a tagged PDF',
      detail:
        'PDF/UA and Section 508 both require a "tagged" PDF: a structure tree that tells assistive ' +
        'technology the reading order, headings, tables, and roles of the content. ' +
        (!hasStructTree
          ? 'This file has no /StructTreeRoot at all, so a screen reader has no structure to read from.'
          : 'This file has a structure tree but its catalog does not declare /MarkInfo /Marked true, ' +
            'so a reader cannot rely on the tree being complete or current.'),
      evidence: hasStructTree ? 'MarkInfo/Marked is not true' : 'no /StructTreeRoot in the document catalog',
    });
  }

  // --- Document title -----------------------------------------------------
  const titleVal = info ? info.get('Title') : null;
  const hasTitle = !!(titleVal && typeof titleVal.text === 'string' && titleVal.text.trim() !== '');
  if (!hasTitle) {
    findings.push({
      id: 'missing-title',
      severity: 'danger',
      title: 'No document title set',
      detail:
        'WCAG 2.4.2 (Page Titled) requires a clear, descriptive title. Without one, a screen reader ' +
        'announces the file name instead, and a browser tab shows it too -- neither helps someone ' +
        'confirm they opened the right document.',
      evidence: 'Document Information dictionary has no non-empty /Title',
    });
  }
  const viewerPrefs = catalog ? resolve(catalog.get('ViewerPreferences'), objects) : null;
  const displayDocTitle = isDict(viewerPrefs) && viewerPrefs.get('DisplayDocTitle') === true;
  if (hasTitle && !displayDocTitle) {
    findings.push({
      id: 'display-doc-title-off',
      severity: 'notice',
      title: 'Viewer preference does not show the document title',
      detail:
        'A title is set, but ViewerPreferences/DisplayDocTitle is not true, so some PDF viewers will ' +
        'still show the file name in the window/tab instead of the title.',
      evidence: 'ViewerPreferences/DisplayDocTitle is not true',
    });
  }

  // --- Language ------------------------------------------------------------
  const langVal = catalog ? catalog.get('Lang') : null;
  const lang = langVal && typeof langVal.text === 'string' ? langVal.text.trim() : '';
  if (!lang) {
    findings.push({
      id: 'missing-lang',
      severity: 'danger',
      title: 'No document language declared',
      detail:
        'WCAG 3.1.1 (Language of Page) requires the primary language to be identified so a screen ' +
        'reader loads the right pronunciation rules. The document catalog has no /Lang entry.',
      evidence: 'Catalog has no /Lang value',
    });
  } else if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang)) {
    findings.push({
      id: 'invalid-lang',
      severity: 'notice',
      title: 'Document language does not look like a valid tag',
      detail: `/Lang is set to "${lang}", which does not look like a well-formed BCP 47 language tag ` +
        '(e.g. "en" or "en-US"). Some assistive technology will not recognize it.',
      evidence: `Catalog /Lang = "${lang}"`,
    });
  }

  // --- Pages, images, alt text, text layer ---------------------------------
  const pages = [];
  if (catalog) {
    const pagesRoot = resolve(catalog.get('Pages'), objects);
    collectKids(pagesRoot, objects, pages, new Set());
  }

  const imageSeen = new Set();
  const perPageImages = [];
  for (const page of pages) {
    const resources = inheritedResources(page, objects);
    perPageImages.push(collectImageXObjects(resources, objects, imageSeen));
  }
  const totalImages = imageSeen.size;

  let altCount = 0;
  if (isDict(structTreeRoot)) {
    const altElements = [];
    walkStructTree(structTreeRoot, objects, altElements, new Set());
    altCount = altElements.length;
  }

  if (totalImages > 0 && altCount === 0) {
    findings.push({
      id: 'images-no-alt',
      severity: 'danger',
      title: 'Images have no alternate text',
      detail:
        `Found ${totalImages} image${totalImages === 1 ? '' : 's'} and zero structure elements ` +
        'carrying /Alt text anywhere in the document. A screen reader user gets nothing for any of them.',
      evidence: `${totalImages} image XObject(s), 0 structure elements with a non-empty /Alt`,
    });
  } else if (totalImages > 0 && altCount > 0 && altCount < totalImages) {
    notes.push({
      id: 'images-alt-partial',
      severity: 'notice',
      title: 'Some images may be missing alternate text',
      detail:
        `Approximate: ${totalImages} image XObject(s) found, but only ${altCount} structure element(s) ` +
        'carry non-empty /Alt text anywhere in the document. This is a document-wide count, not a ' +
        'confirmed per-image match, because mapping a specific structure element to the exact image it ' +
        "labels needs the marked-content ID chain this tool does not walk -- treat it as \"probably not " +
        'every image", not a precise count of which ones.',
      evidence: `${totalImages} image XObject(s), ${altCount} structure element(s) with /Alt`,
    });
  }

  let scannedPages = 0;
  const scannedPageList = [];
  for (let i = 0; i < pages.length; i++) {
    const images = perPageImages[i];
    if (images.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const hasText = await pageHasTextLayer(pages[i], objects, binaryStr, inflate);
    if (!hasText) { scannedPages++; scannedPageList.push(i + 1); }
  }
  if (scannedPages > 0) {
    findings.push({
      id: 'scanned-no-text-layer',
      severity: 'danger',
      title: `${scannedPages} page(s) appear to have no text layer`,
      detail:
        `Page${scannedPages === 1 ? '' : 's'} ${scannedPageList.join(', ')} contain image content but no ` +
        'extractable text operators -- consistent with a scanned page that was never OCR\'d. A screen ' +
        'reader, search, and copy-paste all get nothing from a page like this.',
      evidence: `page(s) ${scannedPageList.join(', ')}: image content present, no Tj/TJ text-show operator found`,
    });
  }

  // --- Form field widgets ---------------------------------------------------
  const widgets = [];
  for (const { dict } of objects.values()) {
    if (isDict(dict) && isName(dict.get('Subtype'), 'Widget')) widgets.push(dict);
  }
  const unlabeled = widgets.filter((w) => !widgetLabel(w, objects));
  if (widgets.length > 0 && unlabeled.length > 0) {
    findings.push({
      id: 'unlabeled-form-fields',
      severity: 'danger',
      title: 'Form fields without an accessible name',
      detail:
        `${unlabeled.length} of ${widgets.length} form field widget(s) have no /TU (alternate field name) ` +
        'set on themselves or an ancestor field, so a screen reader announces them with no label at all ' +
        '-- Section 508 and PDF/UA both require an accessible name on every interactive form field.',
      evidence: `${unlabeled.length}/${widgets.length} Widget annotation(s) missing a resolvable /TU`,
    });
  }

  if (encrypted) {
    notes.push({
      id: 'encrypted',
      severity: 'info',
      title: 'This PDF is encrypted',
      detail:
        'Content and some string values are encrypted, so the image/alt-text and scanned-page checks ' +
        'above may be incomplete or unreliable -- they report what could still be read, not a full scan. ' +
        'Structural findings (tagging, title, language, form-field labels) are less affected but still ' +
        'worth re-checking on a decrypted copy if you can produce one.',
      evidence: 'trailer has an /Encrypt entry',
    });
  }

  const danger = findings.filter((f) => f.severity === 'danger').length;

  return {
    ok: danger === 0,
    parsed: true,
    pageCount: pages.length,
    stats: {
      tagged: markedTrue && hasStructTree,
      hasStructTreeRoot: hasStructTree,
      markedTrue,
      title: hasTitle ? titleVal.text : null,
      lang: lang || null,
      displayDocTitle,
      totalImages,
      altCount,
      widgetCount: widgets.length,
      unlabeledWidgetCount: unlabeled.length,
      scannedPages,
      encrypted,
    },
    findings,
    notes,
    dangerCount: danger,
    noticeCount: findings.filter((f) => f.severity === 'notice').length + notes.filter((n) => n.severity === 'notice').length,
  };
}

function notAPdfReport() {
  return {
    ok: false,
    parsed: false,
    pageCount: 0,
    stats: {},
    findings: [{
      id: 'not-a-pdf',
      severity: 'danger',
      title: 'This does not look like a PDF file',
      detail: 'No "%PDF-" header was found in the file.',
      evidence: 'missing %PDF- header',
    }],
    notes: [],
    dangerCount: 1,
    noticeCount: 0,
  };
}

// Re-exported so tests can build fixtures without also importing the parser.
export { PName, PDict };
