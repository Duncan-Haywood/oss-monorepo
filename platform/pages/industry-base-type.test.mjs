// Every industry page sets its own body font, background and measure.
// pf-site.css draws the header, hero and footer but no body font, so the
// e-invoicing (bet #3) and manufacturing (bets #2 and #4) front doors rendered
// in Times New Roman, e-invoicing at the window's full width (1,264 px lines
// at 1280): polish-2026-11-26-industry-base-type.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConstructionPage } from './industry-construction.mjs';
import { renderEInvoicingIndustryPage } from './industry-e-invoicing.mjs';
import { renderManufacturingPage } from './industry-manufacturing.mjs';
import { renderNonprofitsPage } from './industry-nonprofits.mjs';

const PAGES = {
  construction: renderConstructionPage({ baseUrl: 'https://example.test/' }),
  'eu-e-invoicing': renderEInvoicingIndustryPage({ baseUrl: 'https://example.test/' }),
  manufacturing: renderManufacturingPage({ baseUrl: 'https://example.test/' }),
  nonprofits: renderNonprofitsPage({ baseUrl: 'https://example.test/' }),
};

const css = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

for (const [slug, html] of Object.entries(PAGES)) {
  test(`${slug}: body has a sans-serif font, a colour and a background, also in dark mode`, () => {
    const style = css(html);
    const body = style.match(/(?:^|[}\s])body\{([^}]*)\}/);
    assert.ok(body, 'a body rule');
    assert.match(body[1], /font(?:-family)?:[^;]*sans-serif/);
    assert.match(body[1], /(?:^|;)color:/);
    assert.match(body[1], /background:/);
    assert.match(style, /@media \(prefers-color-scheme:dark\)\{[^@]*(?:body\{background|--[a-z-]*bg:)/, 'a dark background');
  });

  test(`${slug}: the text column has a max-width`, () => {
    assert.match(css(html), /\{[^}]*max-width:\s*(?:[4-9]\d0px|[3-6]\d(?:\.\d+)?rem)[;}]/);
  });
}
