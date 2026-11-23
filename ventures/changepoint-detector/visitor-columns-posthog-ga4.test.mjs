// PostHog users and GA4 activeUsers under a partial snippet loss (README "PostHog users and GA4 activeUsers under a
// snippet loss"; eval/visitor-columns-posthog-ga4.mjs, pre-registered, 40 seeds a cell in its .out.txt). Here: the
// simulation's mechanism on a few sites, one faulted GA4 site heard by the middle setting and missed by the count
// default, and the workflow defaults that the verdict changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { site, watched, SOURCES, MIDDLE, PV_OFF } from './eval/visitor-columns-posthog-ga4.mjs';

const fallOf = (days, key) => {
  let before = 0, after = 0;
  for (const d of days) {
    if (d.date >= '2026-02-16' && d.date < PV_OFF) before += d[key];
    else if (d.date >= PV_OFF && d.date < '2026-04-13') after += d[key];
  }
  return after / before;
};

test('people and sessions fall far less than page views when half the page views go untracked', () => {
  const days = site({ wk: 0.5, share: 0.5, fault: true, seed: 8001 });
  const pv = fallOf(days, 'pageviews'), se = fallOf(days, 'sessions'), pe = fallOf(days, 'people'), ph = fallOf(days, 'phUsers');
  assert.ok(Math.abs(pv - 0.5) < 0.03, `page views to ${pv}`);
  assert.ok(se > 0.68 && se < 0.78, `sessions to ${se}`);
  assert.ok(pe > 0.71 && pe < 0.81, `people to ${pe}`);
  assert.ok(ph >= pe, 'PostHog users also count people who only signed up');
  const healthy = site({ wk: 0.5, share: 1, fault: false, seed: 9001 });
  assert.ok(Math.abs(fallOf(healthy, 'people') - 1) < 0.05);
});

test('a GA4 site that lost the tag from half its pages: the middle setting hears activeUsers, the count default does not', async () => {
  const S = SOURCES.ga4;
  const rows = site({ wk: 0.5, share: 0.5, fault: true, seed: 8002 }).map((d) => ({ date: d.date, values: S.values(d) }));
  const near = (d) => Math.abs(Date.parse(d) - Date.parse(PV_OFF)) <= 7 * 86400000;
  const plain = await watched(rows, S.all, ['activeUsers']);
  const middle = await watched(rows, S.all, ['activeUsers', 'screenPageViews'], MIDDLE);
  assert.ok(!(plain.activeUsers ?? []).some(near), `count default dated ${plain.activeUsers}`);
  assert.ok((middle.activeUsers ?? []).some(near), `middle dated ${middle.activeUsers}`);
  assert.ok((middle.screenPageViews ?? []).some(near), `page views dated ${middle.screenPageViews}`);
});

test('the workflow watches GA4 (page views included) and PostHog with the middle setting', () => {
  const yml = readFileSync(new URL('./deploy/watch-metric.yml', import.meta.url), 'utf8');
  const branch = (csv) => yml.slice(yml.indexOf(`METRIC_CSV=${csv}`), yml.indexOf('elif', yml.indexOf(`METRIC_CSV=${csv}`)));
  assert.match(branch('data/ga4.csv'), /W="--columns \$\(cols 'sessions\|activeUsers\|screenPageViews\|keyEvents'\) \$MIDDLE"/);
  assert.match(branch('data/posthog.csv'), /W="--columns \$\(cols 'event_\.\*\|users'\) \$MIDDLE"/);
  assert.match(yml, /MIDDLE="--detector pelt --overdispersion nb --trend gated"/);
});
