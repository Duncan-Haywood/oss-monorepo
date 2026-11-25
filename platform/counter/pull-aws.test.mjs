import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricQueries, metricDays, insightsRows, pull, pullWindow, summarise } from './pull-aws.mjs';
import { mergeDays } from './pull-cloudflare.mjs';

const ts = (day) => Date.parse(`${day}T00:00:00Z`) / 1000;

test('metricQueries builds only the sections it has names for, with daily periods', () => {
  assert.equal(metricQueries({}).length, 0);
  const q = metricQueries({ distributionId: 'E1', functionName: 'edge-api', webAclName: 'site' });
  assert.deepEqual(q.map((x) => x.Id), ['edge_requests', 'edge_bytes', 'edge_error4xx_pct', 'edge_error5xx_pct', 'lambda_invocations', 'lambda_errors', 'lambda_throttles', 'lambda_duration_ms', 'waf_allowed', 'waf_blocked']);
  assert.ok(q.every((x) => x.MetricStat.Period === 86400));
  assert.deepEqual(q[0].MetricStat.Metric.Dimensions, [{ Name: 'DistributionId', Value: 'E1' }, { Name: 'Region', Value: 'Global' }]);
});

test('metricDays groups results by day and section, rounding counts and keeping rates', () => {
  const out = metricDays([
    { Id: 'edge_requests', Timestamps: [ts('2026-11-01'), ts('2026-11-02')], Values: [120.0, 80] },
    { Id: 'edge_error4xx_pct', Timestamps: [ts('2026-11-01')], Values: [1.2345] },
    { Id: 'lambda_errors', Timestamps: ['2026-11-01T00:00:00Z'], Values: [-3] },
    { Id: 'junk', Timestamps: [ts('2026-11-01')], Values: [1] },
  ]);
  assert.deepEqual(out, {
    '2026-11-01': { edge: { requests: 120, error4xx_pct: 1.23 }, lambda: { errors: 0 } },
    '2026-11-02': { edge: { requests: 80 } },
  });
});

test('insightsRows feed classifyDay: crawlers and probes are classed, no browser string kept', async () => {
  const results = [
    [{ field: 'ua', value: 'Mozilla/5.0%20(compatible;%20GPTBot/1.2)' }, { field: 'path', value: '/roof-bid/' }, { field: 'status', value: '200' }, { field: 'n', value: '4' }],
    [{ field: 'ua', value: 'Mozilla/5.0%20(Windows%20NT%2010.0)' }, { field: 'path', value: '/' }, { field: 'status', value: '200' }, { field: 'n', value: '10' }],
    [{ field: 'ua', value: '-' }, { field: 'path', value: '/wp-login.php' }, { field: 'status', value: '404' }, { field: 'n', value: '3' }],
  ];
  const rows = insightsRows(results);
  assert.deepEqual(rows[0], { count: 4, dimensions: { userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', clientRequestPath: '/roof-bid/', edgeResponseStatus: 200 } });
  let call = 0;
  const logs = async (op) => {
    if (op === 'StartQuery') return { queryId: 'q' };
    call += 1;
    return call === 1 ? { status: 'Running' } : { status: 'Complete', results };
  };
  const { pulled, errors } = await pull({ cloudwatch: async () => ({}), logs, config: { logGroup: 'g' }, since: '2026-11-01', until: '2026-11-01', sleep: async () => {} });
  assert.deepEqual(errors, ['metrics: set CLOUDFRONT_DISTRIBUTION_ID, EDGE_FUNCTION_NAME or WAF_WEB_ACL_NAME']);
  const t = pulled['2026-11-01'].traffic;
  assert.equal(t.classes.gptbot, 4);
  assert.equal(t.classes.browser, 10);
  assert.equal(t.classes.probe, 3);
  assert.ok(!JSON.stringify(pulled).includes('Windows'), 'browser strings are dropped');
});

test('pull pages GetMetricData, records errors per dataset and stops the log loop on the first failure', async () => {
  const seen = [];
  const cloudwatch = async (op, input) => {
    seen.push(input);
    return input.NextToken
      ? { MetricDataResults: [{ Id: 'lambda_invocations', Timestamps: [ts('2026-11-02')], Values: [7] }] }
      : { MetricDataResults: [{ Id: 'edge_requests', Timestamps: [ts('2026-11-01')], Values: [5] }], NextToken: 'n' };
  };
  let starts = 0;
  const logs = async () => { starts += 1; throw new Error('AccessDeniedException'); };
  const { pulled, errors } = await pull({ cloudwatch, logs, config: { distributionId: 'E1', functionName: 'f', logGroup: 'g' }, since: '2026-11-01', until: '2026-11-03' });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].StartTime, ts('2026-11-01'));
  assert.equal(seen[0].EndTime, ts('2026-11-04'));
  assert.deepEqual(pulled, { '2026-11-01': { edge: { requests: 5 } }, '2026-11-02': { lambda: { invocations: 7 } } });
  assert.deepEqual(errors, ['logs insights 2026-11-01: AccessDeniedException']);
  assert.equal(starts, 1);
});

test('pullWindow, merge never shrinks a day, summarise', () => {
  assert.deepEqual(pullWindow({}, '2026-11-24'), { since: '2026-11-10', until: '2026-11-23' });
  assert.deepEqual(pullWindow({ '2026-11-20': { edge: { requests: 1 } } }, '2026-11-24'), { since: '2026-11-18', until: '2026-11-23' });
  const merged = mergeDays({ '2026-11-01': { edge: { requests: 9 } } }, { '2026-11-01': { edge: { requests: 3 } } });
  assert.equal(merged['2026-11-01'].edge.requests, 9);
  assert.deepEqual(summarise({ '2026-11-01': { edge: { requests: 9 }, lambda: { invocations: 2, errors: 0, throttles: 0 }, waf: { blocked: 1 } } }),
    ['2026-11-01: 9 CloudFront requests; edge API 2 invocations, 0 errors, 0 throttled; WAF blocked 1']);
});
