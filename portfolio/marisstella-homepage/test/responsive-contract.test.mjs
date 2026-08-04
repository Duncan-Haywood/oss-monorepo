// Can a visitor on a phone still get where the desktop page offers to take
// them?
//
// marisstella.dev is the only live, public, revenue-facing page in the
// repository — the top of funnel for every venture. Between its first release
// and 2026-08-04 it answered "no": `@media (max-width: 760px)` set the whole
// header nav to `display: none` with nothing in its place, so on a phone the
// page offered no navigation and no contact route above the fold. Nothing
// caught it. Every link was still in the markup, so the markup contract passed;
// every handler still fired, so the behavioural suite passed; the CSS that
// removed them was read by no test at all.
//
// These assertions are written against resolved `display` at a viewport width
// (see viewport.mjs), which is the only place that defect exists. They are
// deliberately about destinations rather than about this particular menu:
// hiding a control is allowed, losing the place it went is not.

import assert from 'node:assert/strict';
import test from 'node:test';

import { readSiteFile } from './fixture.mjs';
import {
  accessibleName,
  ancestry,
  displayAt,
  displayRules,
  elements,
  findElement,
  hiddenBy,
  isVisibleAt,
  isWithin,
  parseDocument,
} from './viewport.mjs';

const html = readSiteFile('index.html');
const css = readSiteFile('style.css');
const js = readSiteFile('app.js');

const rules = displayRules(css);
const document = parseDocument(html);
const header = findElement(document, (node) => node.tag === 'header');

const DESKTOP = 1440;
const PHONE = 375;

/** Every breakpoint the stylesheet declares, sampled on both sides. */
const WIDTHS = [
  ...new Set(
    rules
      .map((rule) => rule.maxWidth)
      .filter(Number.isFinite)
      .flatMap((edge) => [edge, edge + 1])
      .concat([DESKTOP, PHONE])
  ),
].sort((a, b) => b - a);

const at = (width, state) => ({ rules, width, state });

function anchors(root = document) {
  return elements(root).filter((node) => node.tag === 'a' && node.attributes.href);
}

/**
 * The elements a visitor can open at this width: hidden panels named by an
 * `aria-controls` on a control that is itself on screen and has a name. A
 * disclosure the visitor cannot see or cannot identify discloses nothing.
 */
function openableAt(width) {
  const openable = new Map();
  for (const control of elements(document)) {
    const target = control.attributes['aria-controls'];
    if (!target) continue;

    const panel = findElement(document, (node) => node.id === target);
    assert.ok(panel, `a control names aria-controls="${target}", which no element declares`);
    if (!isVisibleAt(control, at(width)) || !accessibleName(control)) continue;
    openable.set(panel, control);
  }
  return openable;
}

/** Every destination reachable at this width, directly or by opening a panel. */
function reachableAt(width) {
  const openable = openableAt(width);
  const reachable = new Set();

  for (const anchor of anchors()) {
    const hidden = hiddenBy(anchor, at(width));
    if (!hidden || openable.has(hidden)) reachable.add(anchor.attributes.href);
  }
  return reachable;
}

test('the model still fits the page it is asserting about', () => {
  // If the parse silently produced an empty page, every test below would pass
  // over nothing. These are the shapes the assertions depend on.
  assert.ok(header, 'index.html has no <header>');
  assert.ok(rules.length > 20, `only ${rules.length} display rules parsed from style.css`);
  assert.ok(anchors().length > 15, `only ${anchors().length} links parsed from index.html`);
  assert.ok(
    rules.some((rule) => Number.isFinite(rule.maxWidth)),
    'no responsive display rule found, so this contract is asserting about nothing'
  );
  assert.ok(anchors(header).length >= 4, 'the header offers fewer than four destinations');
});

test('every destination the header offers on a desktop is reachable at every width', () => {
  const offered = anchors(header)
    .filter((anchor) => isVisibleAt(anchor, at(DESKTOP)))
    .map((anchor) => anchor.attributes.href);
  assert.ok(offered.length >= 4, 'fewer than four header destinations are visible on a desktop');

  for (const width of WIDTHS) {
    const reachable = reachableAt(width);
    for (const href of offered) {
      assert.ok(
        reachable.has(href),
        `at ${width}px a visitor cannot reach "${href}" — the header offers it on a desktop, ` +
          'and at this width it is hidden with no disclosure and no second route to the same place'
      );
    }
  }
});

test('a visitor can always reach a human without scrolling past the header', () => {
  // The studio sells things. The contact address is the one destination that
  // has no substitute further down the page for someone who decided in the
  // first screenful, and it is the destination the collapsed nav removed.
  for (const width of WIDTHS) {
    const reachable = [...reachableAt(width)];
    assert.ok(
      reachable.some((href) => href.startsWith('mailto:')),
      `at ${width}px the page offers no reachable contact address`
    );
  }
});

test('the menu is disclosed exactly where it is hidden', () => {
  // Both directions are defects: a hidden nav with no button strands the
  // visitor, and a button beside an already-open nav is a control that does
  // nothing visible.
  const nav = findElement(document, (node) => node.tag === 'nav');
  assert.ok(nav, 'index.html has no <nav>');

  const control = findElement(
    document,
    (node) => node.attributes['aria-controls'] === nav.id
  );
  assert.ok(control, `nothing declares aria-controls="${nav.id}", so a collapsed nav cannot be opened`);

  for (const width of WIDTHS) {
    const navShown = isVisibleAt(nav, at(width));
    const controlShown = isVisibleAt(control, at(width));
    assert.notEqual(
      navShown,
      controlShown,
      navShown
        ? `at ${width}px the menu button sits beside a nav that is already open`
        : `at ${width}px the nav is hidden and its menu button is hidden too`
    );
  }
});

test('the class the script toggles is a class the stylesheet reveals the panel with', () => {
  // The defect this closes: app.js adds a class, the stylesheet styles a
  // different one, and the button "works" — aria-expanded flips, the tests
  // pass — while nothing appears on screen.
  const toggled = [...js.matchAll(/classList\.add\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(toggled.length > 0, 'app.js adds no class; update this test if the menu changed shape');

  const nav = findElement(document, (node) => node.tag === 'nav');
  const control = findElement(document, (node) => node.attributes['aria-controls'] === nav.id);
  const owner = ancestry(control).find((node) => node.tag === 'header');
  assert.ok(owner, 'the menu button is not inside the header the script writes the class onto');

  const collapsedWidths = WIDTHS.filter((width) => !isVisibleAt(nav, at(width)));
  assert.ok(collapsedWidths.length > 0, 'the nav is never collapsed, so nothing needs disclosing');

  for (const width of collapsedWidths) {
    const opened = new Map([[owner, new Set(toggled)]]);
    assert.ok(
      isVisibleAt(nav, at(width, opened)),
      `at ${width}px, adding ${toggled.map((c) => `.${c}`).join('/')} to <header> still leaves the ` +
        'nav display:none — the button changes state that no stylesheet rule reads'
    );
  }
});

test('the panel a control opens contains the destinations it promises', () => {
  for (const [panel, control] of openableAt(PHONE)) {
    assert.ok(
      anchors(panel).length > 0,
      `the "${accessibleName(control)}" control opens a panel with no destinations in it`
    );
    assert.ok(
      !isWithin(control, panel),
      `the "${accessibleName(control)}" control is inside the panel it opens, so once closed ` +
        'it cannot be reopened'
    );
  }
});

test('nothing is hidden at a wide viewport and shown at a narrow one by accident', () => {
  // max-width queries stack downwards: a rule that shows an element at 760px
  // is also in force at 375px unless something narrower overrides it. This
  // catches the ordering mistake where a phone gets a control a tablet does not.
  const control = findElement(document, (node) => node.attributes['aria-controls']);
  assert.ok(control, 'no disclosure control found');

  const shown = WIDTHS.filter((width) => isVisibleAt(control, at(width)));
  const hidden = WIDTHS.filter((width) => !isVisibleAt(control, at(width)));
  assert.ok(shown.length > 0 && hidden.length > 0, 'the menu button is never shown, or never hidden');
  assert.ok(
    Math.max(...shown) < Math.min(...hidden),
    'the menu button appears at some widths and reappears at others, which no breakpoint intends'
  );
});

test('the stylesheet hides nothing this contract cannot resolve', () => {
  // displayRules() throws on a selector or media query it cannot model, so
  // reaching this line at all is the assertion. Naming it keeps the guarantee
  // visible in the test output rather than implicit in a helper.
  assert.doesNotThrow(() => displayRules(css));
  const unresolved = rules.filter((rule) => !rule.display);
  assert.deepEqual(unresolved, [], 'a display rule parsed to an empty value');

  for (const node of [header, ...elements(header)]) {
    assert.notEqual(
      displayAt(node, at(PHONE)),
      undefined,
      `no resolved display for <${node.tag}> in the header`
    );
  }
});
