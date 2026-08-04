// A DOM small enough to read, built from the real index.html.
//
// The homepage ships no dependencies and is served as three static files, so
// there is no test runner or DOM library here to lean on. What matters is that
// app.js is *executed* rather than pattern-matched: a suite that greps the
// source for `addEventListener` proves the string is present, not that clicking
// a filter hides the right cards.
//
// The fixture is derived from index.html — the filter values, the venture
// cards and their categories, and the ids app.js looks up are all read off the
// real markup — so it cannot drift into testing a page that does not exist.
// markup-contract.test.mjs covers the other direction: that index.html still
// contains the structure this fixture models.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const SITE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function readSiteFile(name) {
  return fs.readFileSync(path.join(SITE_ROOT, name), 'utf8');
}

/** Every `attr="value"` on the page, in document order. */
export function attributeValues(html, attribute) {
  const pattern = new RegExp(`${attribute}="([^"]*)"`, 'g');
  return [...html.matchAll(pattern)].map((m) => m[1]);
}

/** The keys the page asks openModal() for, e.g. onclick="openModal('print')". */
export function modalKeysInMarkup(html) {
  return [...html.matchAll(/openModal\('([^']+)'\)/g)].map((m) => m[1]);
}

/** The markup between `<header …>` and `</header>`. */
export function headerMarkup(html) {
  const match = html.match(/<header[\s\S]*?<\/header>/);
  if (!match) throw new Error('index.html has no <header> element');
  return match[0];
}

/** The single open tag carrying `id="…"`, so its attributes can be read off. */
export function openTagWithId(html, id) {
  const matches = [...html.matchAll(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`, 'g'))];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one element with id="${id}", found ${matches.length}`);
  }
  return matches[0][0];
}

/** The destinations the header nav offers, in document order. */
export function navLinkHrefs(html) {
  return [...headerMarkup(html).matchAll(/<a class="nav-link" href="([^"]+)"/g)].map((m) => m[1]);
}

class ClassList {
  constructor(initial) {
    this.set = new Set(initial.split(/\s+/).filter(Boolean));
  }
  add(name) {
    this.set.add(name);
  }
  remove(name) {
    this.set.delete(name);
  }
  contains(name) {
    return this.set.has(name);
  }
  get value() {
    return [...this.set].join(' ');
  }
}

class FakeElement {
  constructor(doc, { id = null, className = '', attributes = {}, children = [] } = {}) {
    this.ownerDocument = doc;
    this.id = id;
    this.classList = new ClassList(className);
    this.attributes = { ...attributes };
    this.children = children;
    this.style = {};
    this.innerText = '';
    this.innerHTML = '';
    this.listeners = new Map();
    this.focusCount = 0;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  /** Dispatch to this element's own handlers; there is no bubbling to model. */
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler({ target: this, ...event });
    }
  }

  querySelector(selector) {
    return this.matchAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    return this.matchAll(selector);
  }

  matchAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.matchAll(selector));
    }
    return matches;
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    throw new Error(`fixture supports class and id selectors only, got: ${selector}`);
  }

  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.root = new FakeElement(this, { className: 'root' });
    this.body = new FakeElement(this, { className: 'body' });
    this.activeElement = this.body;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }

  getElementById(id) {
    return this.root.matchAll(`#${id}`)[0] ?? null;
  }

  querySelector(selector) {
    return this.root.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  }
}

/**
 * Build the page app.js interacts with, using the values index.html declares.
 * Returns the document plus direct handles on the pieces the tests drive.
 */
export function buildFixture(html = readSiteFile('index.html')) {
  const doc = new FakeDocument();

  const filters = attributeValues(html, 'data-filter');
  const categories = attributeValues(html, 'data-category');
  const modalKeys = modalKeysInMarkup(html);

  const filterButtons = filters.map((filter, index) =>
    new FakeElement(doc, {
      className: index === 0 ? 'filter-btn active' : 'filter-btn',
      attributes: {
        'data-filter': filter,
        'aria-pressed': index === 0 ? 'true' : 'false',
      },
    })
  );

  // One card per data-category, each with the brief button that sits inside it
  // in the real markup, so a click on the card's button can be traced back.
  const detailButtons = [];
  const ventureCards = categories.map((category, index) => {
    const button = new FakeElement(doc, {
      className: 'btn-details',
      attributes: { 'data-modal-key': modalKeys[index] ?? '' },
    });
    detailButtons.push(button);
    return new FakeElement(doc, {
      className: index === 0 ? 'venture-card featured' : 'venture-card',
      attributes: { 'data-category': category },
      children: [button],
    });
  });

  const closeButton = new FakeElement(doc, { className: 'close-modal' });
  const modal = new FakeElement(doc, {
    id: 'techModal',
    className: 'modal',
    children: [
      closeButton,
      new FakeElement(doc, { id: 'modalTitle' }),
      new FakeElement(doc, { id: 'modalDescription' }),
      new FakeElement(doc, { id: 'modalDetails' }),
    ],
  });
  // The stylesheet hides .modal by default; the fixture starts from that state
  // rather than from app.js's first write, so "closed" is the initial condition.
  modal.style.display = 'none';

  // The header, with the nav the menu button discloses. aria-expanded is read
  // off the real markup rather than assumed closed, so a page that shipped the
  // panel already expanded would show up here as a failing starting state.
  const navLinks = navLinkHrefs(html).map(
    (href) => new FakeElement(doc, { className: 'nav-link', attributes: { href } })
  );
  const nav = new FakeElement(doc, {
    id: 'siteNav',
    className: 'nav-links',
    children: navLinks,
  });
  const toggleTag = openTagWithId(html, 'navToggle');
  const navToggle = new FakeElement(doc, {
    id: 'navToggle',
    className: 'nav-toggle',
    attributes: {
      'aria-expanded': toggleTag.match(/aria-expanded="([^"]*)"/)?.[1] ?? '',
      'aria-controls': toggleTag.match(/aria-controls="([^"]*)"/)?.[1] ?? '',
    },
  });
  const header = new FakeElement(doc, {
    className: 'site-header',
    children: [nav, navToggle],
  });

  doc.root.children = [header, ...filterButtons, ...ventureCards, modal];

  return {
    document: doc,
    header,
    nav,
    navLinks,
    navToggle,
    filterButtons,
    ventureCards,
    detailButtons,
    modal,
    closeButton,
    modalTitle: doc.getElementById('modalTitle'),
    modalDescription: doc.getElementById('modalDescription'),
    modalDetails: doc.getElementById('modalDetails'),
  };
}

/**
 * Run app.js against a fixture and hand back its globals. openModal/closeModal
 * are script-scoped function declarations, so they are only reachable by
 * evaluating the file — which is the point: the tests exercise the shipped
 * source, not a copy of it.
 */
export function loadApp(fixture = buildFixture()) {
  const window = {};
  const context = vm.createContext({ document: fixture.document, window, console });
  vm.runInContext(readSiteFile('app.js'), context, { filename: 'app.js' });

  // The page wires its filters on DOMContentLoaded; nothing has fired it yet.
  fixture.document.dispatch('DOMContentLoaded');

  return {
    ...fixture,
    window,
    openModal: context.openModal,
    closeModal: context.closeModal,
    pressKey: (key) => fixture.document.dispatch('keydown', { key }),
    clickOutside: (target) => window.onclick?.({ target }),
  };
}
