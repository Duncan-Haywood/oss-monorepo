// Behavioural tests: app.js is executed against the fixture in fixture.mjs.
//
// Everything here would still pass if the assertions were deleted, which is why
// each one is written as an observable consequence a visitor would notice —
// a card that disappears, a brief that opens empty, focus landing nowhere.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFixture, loadApp, modalKeysInMarkup, readSiteFile } from './fixture.mjs';

const html = readSiteFile('index.html');

function categoriesOf(card) {
  return (card.getAttribute('data-category') || '').split(/\s+/).filter(Boolean);
}

function visibleCards(app) {
  return app.ventureCards.filter((card) => card.style.display !== 'none');
}

test('filtering shows every card in the chosen category and hides the rest', () => {
  const app = loadApp();

  for (const [index, button] of app.filterButtons.entries()) {
    const filter = button.getAttribute('data-filter');
    button.dispatch('click');

    const expected = app.ventureCards.filter(
      (card) => filter === 'all' || categoriesOf(card).includes(filter)
    );
    assert.deepEqual(
      visibleCards(app),
      expected,
      `filter "${filter}" (button ${index}) shows the wrong set of ventures`
    );
    assert.ok(expected.length > 0, `filter "${filter}" matches no venture card`);
  }
});

test('the "all" filter restores every card a narrower filter hid', () => {
  const app = loadApp();
  const narrow = app.filterButtons.find((b) => b.getAttribute('data-filter') !== 'all');
  const all = app.filterButtons.find((b) => b.getAttribute('data-filter') === 'all');

  narrow.dispatch('click');
  assert.notEqual(
    visibleCards(app).length,
    app.ventureCards.length,
    'a narrower filter should hide at least one venture, or the filter bar is decorative'
  );

  all.dispatch('click');
  assert.equal(visibleCards(app).length, app.ventureCards.length);
});

test('exactly one filter is marked active and pressed at a time', () => {
  const app = loadApp();

  for (const button of app.filterButtons) {
    button.dispatch('click');

    const active = app.filterButtons.filter((b) => b.classList.contains('active'));
    assert.deepEqual(active, [button], 'more than one filter reads as active');

    const pressed = app.filterButtons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    assert.deepEqual(
      pressed,
      [button],
      'aria-pressed disagrees with the visual active state, so the filter bar lies to a screen reader'
    );
  }
});

test('every venture brief the page offers opens with its own content', () => {
  const app = loadApp();
  const keys = modalKeysInMarkup(html);
  assert.ok(keys.length > 0, 'no venture brief buttons found in index.html');

  const seen = new Set();
  for (const key of keys) {
    app.closeModal();
    app.openModal(key);

    assert.equal(app.modal.style.display, 'flex', `brief "${key}" did not open`);
    assert.ok(app.modalTitle.innerText.trim(), `brief "${key}" opened with no title`);
    assert.ok(app.modalDescription.innerText.trim(), `brief "${key}" opened with no description`);
    assert.match(
      app.modalDetails.innerHTML,
      /<li>/,
      `brief "${key}" opened with an empty body`
    );

    const signature = `${app.modalTitle.innerText}|${app.modalDescription.innerText}`;
    assert.ok(!seen.has(signature), `brief "${key}" repeats another venture's content`);
    seen.add(signature);
  }
});

test('an unknown brief key leaves the page untouched rather than opening an empty modal', () => {
  const app = loadApp();
  app.openModal('no-such-venture');

  assert.equal(app.modal.style.display, 'none');
  assert.equal(app.modalTitle.innerText, '');
  assert.equal(app.document.body.style.overflow, undefined);
});

test('opening a brief locks background scroll and closing releases it', () => {
  const app = loadApp();
  const key = modalKeysInMarkup(html)[0];

  app.openModal(key);
  assert.equal(app.document.body.style.overflow, 'hidden');

  app.closeModal();
  assert.equal(app.modal.style.display, 'none');
  assert.equal(
    app.document.body.style.overflow,
    '',
    'the page stays unscrollable after the brief closes'
  );
});

test('Escape and a backdrop click both dismiss the brief', () => {
  const key = modalKeysInMarkup(html)[0];

  const byEscape = loadApp();
  byEscape.openModal(key);
  byEscape.pressKey('Escape');
  assert.equal(byEscape.modal.style.display, 'none', 'Escape did not close the brief');

  const byBackdrop = loadApp();
  byBackdrop.openModal(key);
  byBackdrop.clickOutside(byBackdrop.modal);
  assert.equal(byBackdrop.modal.style.display, 'none', 'clicking the backdrop did not close the brief');
});

test('a click inside the brief does not dismiss it', () => {
  const app = loadApp();
  app.openModal(modalKeysInMarkup(html)[0]);

  app.clickOutside(app.modalTitle);
  assert.equal(app.modal.style.display, 'flex', 'clicking the brief content closed it');
});

test('a key other than Escape does not dismiss the brief', () => {
  const app = loadApp();
  app.openModal(modalKeysInMarkup(html)[0]);

  app.pressKey('Enter');
  assert.equal(app.modal.style.display, 'flex');
});

test('keyboard focus enters the brief and returns to the control that opened it', () => {
  const app = loadApp();
  const opener = app.detailButtons[1];
  opener.focus();

  app.openModal(modalKeysInMarkup(html)[1]);
  assert.equal(
    app.document.activeElement,
    app.closeButton,
    'focus stayed behind the open brief, so a keyboard visitor cannot reach it'
  );

  app.closeModal();
  assert.equal(
    app.document.activeElement,
    opener,
    'focus did not return to the brief button, stranding a keyboard visitor at the top of the page'
  );
});

test('Escape with no brief open does not move focus', () => {
  const app = loadApp();
  const resting = app.detailButtons[0];
  resting.focus();

  app.pressKey('Escape');
  assert.equal(app.document.activeElement, resting);
  assert.equal(resting.focusCount, 1, 'a stray Escape re-focused the last brief button');
});

test('the fixture models the page, not a page of its own invention', () => {
  // Guards the suite itself: if index.html loses its filters or its cards, the
  // behavioural tests above would keep passing over an empty fixture.
  const fixture = buildFixture(html);
  assert.ok(fixture.filterButtons.length >= 2, 'index.html declares fewer than two filters');
  assert.ok(fixture.ventureCards.length >= 2, 'index.html declares fewer than two venture cards');
  assert.equal(
    fixture.detailButtons.length,
    modalKeysInMarkup(html).length,
    'every venture card should carry exactly one brief button'
  );
});
