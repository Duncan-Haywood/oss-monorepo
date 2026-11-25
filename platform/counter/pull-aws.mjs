// Copies the site's AWS edge analytics into the repository: the AWS twin of
// `pull-cloudflare.mjs`, for after the site and the edge API move to
// CloudFront and Lambda (`platform/aws/stacks/site/`, `platform/aws/stacks/edge-api/`).
//
//   AWS_REGION=us-east-1 CLOUDFRONT_DISTRIBUTION_ID=E... EDGE_FUNCTION_NAME=edge-api \
//   CLOUDFRONT_LOG_GROUP=/aws/cloudfront/site WAF_WEB_ACL_NAME=site \
//     node platform/counter/pull-aws.mjs
//
// Writes `portfolio/usage/aws-analytics.json`, per UTC day (aggregates only;
// `portfolio/usage/README.md`, rule 1):
//
//   edge      CloudFront requests, bytes out, 4xx and 5xx rates (CloudWatch
//             AWS/CloudFront, daily sums).
//   lambda    edge API invocations, errors, throttles and mean duration
//             (AWS/Lambda): how close it runs to its reserved concurrency.
//   waf       requests the web ACL allowed and blocked (AWS/WAFV2).
//   traffic   requests by kind of client and the top pages per kind, from the
//             CloudFront access log in CloudWatch Logs (Logs Insights), with
//             the same `classifyDay` as the Cloudflare pull: a browser string
//             becomes a class and is dropped; no IP, string or referrer is kept.
//
// Credentials: the standard AWS environment variables, set in CI by GitHub
// OIDC (a read-only role: cloudwatch:GetMetricData, logs:StartQuery,
// logs:GetQueryResults on the one log group; `platform/aws/stacks/edge-api/README.md`).
// A dataset that cannot be read goes under `last_pull.errors` and the script
// exits 0, as the Cloudflare pull does, so the gap stays visible.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyDay, mergeDays, addDays } from './pull-cloudflare.mjs';
import { jsonProtocol, envCredentials } from '../edge/aws/sigv4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '..', '..', 'portfolio', 'usage', 'aws-analytics.json');
const UNIT = 'AWS edge requests to the site per UTC day: every CloudFront request, crawlers and scripts included, so not page loads and not people. `traffic.classes` splits them by kind of client (a browser string reduced to a class, then dropped); `pages` lists the most-requested 200/304 paths per class';
const SOURCE = 'Amazon CloudWatch GetMetricData (AWS/CloudFront, AWS/Lambda, AWS/WAFV2) and CloudWatch Logs Insights over the CloudFront access log, via platform/counter/pull-aws.mjs';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (n) => (Number.isFinite(n) && n >= 0 ? Math.round(n) : 0);
const ratio = (n) => (Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0);

/** The metric queries for one pull, each `Id` naming `<section>_<field>`. */
export function metricQueries({ distributionId, functionName, webAclName }) {
  const q = [];
  const add = (id, Namespace, MetricName, Dimensions, Stat = 'Sum') =>
    q.push({ Id: id, MetricStat: { Metric: { Namespace, MetricName, Dimensions }, Period: 86400, Stat }, ReturnData: true });
  if (distributionId) {
    const d = [{ Name: 'DistributionId', Value: distributionId }, { Name: 'Region', Value: 'Global' }];
    add('edge_requests', 'AWS/CloudFront', 'Requests', d);
    add('edge_bytes', 'AWS/CloudFront', 'BytesDownloaded', d);
    add('edge_error4xx_pct', 'AWS/CloudFront', '4xxErrorRate', d, 'Average');
    add('edge_error5xx_pct', 'AWS/CloudFront', '5xxErrorRate', d, 'Average');
  }
  if (functionName) {
    const d = [{ Name: 'FunctionName', Value: functionName }];
    add('lambda_invocations', 'AWS/Lambda', 'Invocations', d);
    add('lambda_errors', 'AWS/Lambda', 'Errors', d);
    add('lambda_throttles', 'AWS/Lambda', 'Throttles', d);
    add('lambda_duration_ms', 'AWS/Lambda', 'Duration', d, 'Average');
  }
  if (webAclName) {
    const d = [{ Name: 'WebACL', Value: webAclName }, { Name: 'Rule', Value: 'ALL' }];
    add('waf_allowed', 'AWS/WAFV2', 'AllowedRequests', d);
    add('waf_blocked', 'AWS/WAFV2', 'BlockedRequests', d);
  }
  return q;
}

/** `MetricDataResults` into `{day: {edge: {...}, lambda: {...}, waf: {...}}}`. */
export function metricDays(results = []) {
  const out = {};
  for (const r of results) {
    const m = String(r?.Id || '').match(/^(edge|lambda|waf)_(\w+)$/);
    if (!m) continue;
    const [, section, field] = m;
    (r.Timestamps || []).forEach((ts, i) => {
      const day = new Date((typeof ts === 'number' ? ts * 1000 : Date.parse(ts))).toISOString().slice(0, 10);
      if (!DAY.test(day)) return;
      const v = r.Values?.[i];
      ((out[day] ||= {})[section] ||= {})[field] = /_pct$|_ms$/.test(field) ? ratio(v) : int(v);
    });
  }
  return out;
}

// One day of the CloudFront access log, grouped like Cloudflare's adaptive
// query. Field names are CloudFront standard logging (v2) JSON fields.
export const TRAFFIC_QUERY = 'stats count(*) as n by `cs(User-Agent)` as ua, `cs-uri-stem` as path, `sc-status` as status | sort n desc | limit 10000';

/** Logs Insights result rows into the rows `classifyDay` reads. */
export function insightsRows(results = []) {
  return results.map((fields) => {
    const f = Object.fromEntries(fields.map(({ field, value }) => [field, value]));
    return { count: Number(f.n) || 0, dimensions: { userAgent: decodeURIComponent(f.ua || '').replace(/^-$/, ''), clientRequestPath: f.path || '', edgeResponseStatus: Number(f.status) } };
  });
}

/** Days to pull: two days before the last one on file (or `backfill` back), to yesterday; at most 30. */
export function pullWindow(days, today, backfill = 14) {
  const until = addDays(today, -1);
  const have = Object.keys(days).filter((k) => days[k].edge).sort();
  let since = have.length ? addDays(have[have.length - 1], -2) : addDays(today, -backfill);
  if (since < addDays(today, -30)) since = addDays(today, -30);
  return { since, until };
}

/** The whole pull with injected clients; returns `{ pulled, errors }`. */
export async function pull({ cloudwatch, logs, config, since, until, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const pulled = {};
  const errors = [];
  const put = (day, name, value) => { (pulled[day] ||= {})[name] = value; };
  const queries = metricQueries(config);
  if (!queries.length) errors.push('metrics: set CLOUDFRONT_DISTRIBUTION_ID, EDGE_FUNCTION_NAME or WAF_WEB_ACL_NAME');
  else {
    try {
      const results = [];
      let NextToken;
      do {
        const out = await cloudwatch('GetMetricData', {
          MetricDataQueries: queries,
          StartTime: Date.parse(`${since}T00:00:00Z`) / 1000,
          EndTime: Date.parse(`${addDays(until, 1)}T00:00:00Z`) / 1000,
          ScanBy: 'TimestampAscending',
          ...(NextToken ? { NextToken } : {}),
        });
        results.push(...(out.MetricDataResults || []));
        NextToken = out.NextToken;
      } while (NextToken);
      for (const [day, sections] of Object.entries(metricDays(results))) {
        for (const [name, value] of Object.entries(sections)) put(day, name, value);
      }
    } catch (e) { errors.push(`GetMetricData: ${e.message}`); }
  }
  if (!config.logGroup) errors.push('traffic: CLOUDFRONT_LOG_GROUP is not set');
  else {
    for (let day = since; day <= until; day = addDays(day, 1)) {
      try {
        const { queryId } = await logs('StartQuery', {
          logGroupName: config.logGroup,
          startTime: Date.parse(`${day}T00:00:00Z`) / 1000,
          endTime: Date.parse(`${addDays(day, 1)}T00:00:00Z`) / 1000 - 1,
          queryString: TRAFFIC_QUERY,
          limit: 10000,
        });
        let res;
        for (let i = 0; i < 60; i++) {
          res = await logs('GetQueryResults', { queryId });
          if (!['Scheduled', 'Running'].includes(res.status)) break;
          await sleep(1000);
        }
        if (res.status !== 'Complete') throw new Error(`query ${res.status}`);
        const rows = insightsRows(res.results);
        if (rows.length) put(day, 'traffic', classifyDay(rows));
      } catch (e) {
        errors.push(`logs insights ${day}: ${e.message}`);
        break; // a permission error repeats for every day
      }
    }
  }
  return { pulled, errors };
}

/** One line per day. */
export function summarise(days) {
  return Object.entries(days).map(([day, d]) => {
    const e = d.edge ? `${d.edge.requests} CloudFront requests` : 'no CloudFront totals';
    const l = d.lambda ? `; edge API ${d.lambda.invocations} invocations, ${d.lambda.errors} errors, ${d.lambda.throttles} throttled` : '';
    const w = d.waf ? `; WAF blocked ${d.waf.blocked}` : '';
    return `${day}: ${e}${l}${w}`;
  });
}

async function main(env = process.env) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const days = existing.days || {};
  const { since, until } = pullWindow(days, today, Number(env.AWS_BACKFILL_DAYS) || 14);
  const config = {
    distributionId: env.CLOUDFRONT_DISTRIBUTION_ID || '',
    functionName: env.EDGE_FUNCTION_NAME || '',
    webAclName: env.WAF_WEB_ACL_NAME || '',
    logGroup: env.CLOUDFRONT_LOG_GROUP || '',
  };
  let pulled = {};
  let errors = [];
  if (!envCredentials(env)) errors.push('no AWS credentials in the environment (the OIDC step did not run)');
  else {
    // CloudFront's metrics and its WAF live in us-east-1 whatever the home region.
    const region = 'us-east-1';
    const cloudwatch = jsonProtocol({ target: 'GraniteServiceVersion20100801', version: '1.0', region, service: 'monitoring' });
    const logs = jsonProtocol({ target: 'Logs_20140328', version: '1.1', region, service: 'logs' });
    ({ pulled, errors } = await pull({ cloudwatch, logs, config, since, until }));
  }
  const merged = mergeDays(days, pulled);
  const out = { unit: UNIT, source: SOURCE, last_pull: { on: today, window: [since, until], days_pulled: Object.keys(pulled).length, errors }, days: merged };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  for (const line of summarise(merged).slice(-7)) console.log(line);
  for (const e of errors) console.log(`::warning::${e}`);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(pulled).length} day(s) pulled, ${errors.length} dataset error(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
