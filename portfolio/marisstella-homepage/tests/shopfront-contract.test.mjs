// The homepage is the studio's only public surface, so it is the only place a
// visitor can be sent to a product or can reach a human. Every other contract
// in this directory asks whether the page is internally consistent; this one
// asks whether the page still matches the portfolio behind it, and whether a
// visitor who wants to buy something has anywhere to go.
//
// The portfolio is the source of truth: `ventures/*/VENTURE.yaml` records each
// venture's `links.production`. A venture that is live and unlinked here earns
// nothing from the studio's own front door, and nothing else in the repository
// compares the two.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SITE_ROOT, readSiteFile } from './fixture.mjs';

const html = readSiteFile('index.html');
const REPO_ROOT = path.dirname(path.dirname(SITE_ROOT));
const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');

// Hosts the page may link that are not products: the studio's own domains and
// the font CDN the stylesheet needs. Anything else has to be a venture the
// portfolio declares, so the shopfront cannot quietly start advertising a URL
// no VENTURE.yaml tracks.
const NON_PRODUCT_HOSTS = new Set([
  'marisstella.dev',
  'duncanhaywood.dev',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/**
 * Each venture's declared production link. No YAML parser ships with this
 * package — it has no dependencies by design — so the `links:` block is read
 * directly, and a file whose shape stops matching fails rather than being
 * silently read as "declares nothing".
 */
function declaredVentures() {
  const dirs = fs
    .readdirSync(VENTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert.ok(dirs.length > 0, 'no ventures found; this test would pass vacuously');

  return dirs.map((dir) => {
    const file = path.join(VENTURES_DIR, dir, 'VENTURE.yaml');
    assert.ok(fs.existsSync(file), `ventures/${dir} has no VENTURE.yaml`);
    const yaml = fs.readFileSync(file, 'utf8');

    const links = yaml.match(/^links:\n((?:[ \t]+.*\n?)*)/m);
    assert.ok(links, `ventures/${dir}/VENTURE.yaml has no links: block`);

    const production = links[1].match(/^[ \t]+production:[ \t]*(.+?)[ \t]*$/m);
    assert.ok(production, `ventures/${dir}/VENTURE.yaml declares no links.production`);

    const value = production[1];
    return { dir, production: value === 'null' || value === '~' ? null : value };
  });
}

/** Absolute URLs the page links, deduplicated. */
function externalHrefs() {
  return [...new Set([...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))];
}

test('every venture that is live is reachable from the homepage', () => {
  // A production URL in VENTURE.yaml means the venture is serving customers.
  // If the studio's front door does not link it, the only visitors it gets are
  // the ones who already knew the address.
  const live = declaredVentures().filter((venture) => venture.production);
  assert.ok(live.length > 0, 'no venture declares a production link; update this test if that is real');

  const unlinked = live
    .filter((venture) => !html.includes(venture.production))
    .map((venture) => `${venture.dir} (${venture.production})`);

  assert.deepEqual(
    unlinked,
    [],
    'venture is live and declared, and the homepage sends nobody to it'
  );
});

test('every product the homepage links is a venture the portfolio declares', () => {
  // The other direction. A link here that matches no VENTURE.yaml is either a
  // venture that was retired without the page being updated, or a destination
  // nothing in the repository owns.
  const declared = new Set(
    declaredVentures()
      .map((venture) => venture.production)
      .filter(Boolean)
  );

  const undeclared = externalHrefs().filter((href) => {
    if (declared.has(href)) return false;
    const { hostname } = new URL(href);
    return !NON_PRODUCT_HOSTS.has(hostname);
  });

  assert.deepEqual(
    undeclared,
    [],
    'the homepage advertises a destination no VENTURE.yaml declares as production'
  );
});

test('a visitor who wants to buy something can reach a human', () => {
  // A venture studio front page with no contact route converts nobody: the
  // visitor who reads every brief and wants to hire the studio has to leave to
  // find an address. This is the cheapest revenue defect on the site and the
  // only one no other contract here can see.
  const mailtos = [...html.matchAll(/href="mailto:([^"?]+)[^"]*"/g)].map((m) => m[1]);

  assert.ok(
    mailtos.length > 0,
    'the homepage offers no contact route at all — no mailto, so no enquiry can start here'
  );
  for (const address of mailtos) {
    assert.match(address, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, `contact address is not deliverable: ${address}`);
  }
});

test('no link on the page is a placeholder that goes nowhere', () => {
  // `href="#"` renders as a link, takes the pointer cursor, takes keyboard
  // focus, and does nothing. The existing anchor contract matches
  // `href="#<target>"`, so an empty fragment slips past it.
  const dead = [...html.matchAll(/<a\s[^>]*href="(#|)"[^>]*>/g)].map((m) => m[0]);

  assert.deepEqual(dead, [], 'anchor with an empty href — looks clickable, does nothing');
});

test('the footer offers ventures as products, not as scrolls back up the page', () => {
  // The footer's "Ventures" column reads as a list of products. An entry there
  // pointing at this page's own #ventures anchor is indistinguishable from the
  // one real product link beside it, so a visitor clicking it believes they
  // asked for the product and got nothing.
  const column = html.match(/<div class="footer-col">\s*<h4>Ventures<\/h4>([\s\S]*?)<\/div>/);
  assert.ok(column, 'the footer no longer has a Ventures column; update this test with the copy');

  const selfReferencing = [...column[1].matchAll(/<a\s[^>]*href="(#[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (m) => `${m[2].replace(/<[^>]*>/g, '').trim()} -> ${m[1]}`
  );

  assert.deepEqual(
    selfReferencing,
    [],
    'a venture is listed as a link but only scrolls this page; link the product or do not link it'
  );
});
