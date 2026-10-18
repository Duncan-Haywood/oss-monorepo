#!/usr/bin/env node
// Self-hosted RFP compliance-matrix service. Zero dependencies.
//   node server.mjs                       # page + deterministic API on :8080
//   API_KEY=... ANTHROPIC_API_KEY=... node server.mjs   # also enables the LLM pass
// The page is the same private browser tool; the API lets a team script it.
// The LLM pass spends the deployer's own Anthropic key, so it needs API_KEY.
import http from 'node:http';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { extract, toCsv, toMarkdown, csvCell } from './extract.mjs';
import { outline, toOutlineMarkdown, coverage, coverageToCsv } from './shred.mjs';
import { refine } from './llm.mjs';

const MAX_BODY = 2_000_000;
const MAX_TEXT = 1_500_000;
const PAGE_FILES = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/extract.mjs': ['extract.mjs', 'text/javascript'], '/sample.mjs': ['sample.mjs', 'text/javascript'], '/usage.mjs': ['usage.mjs', 'text/javascript'], '/shred.mjs': ['shred.mjs', 'text/javascript'], '/LICENSE': ['LICENSE', 'text/plain'] };

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('request too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});
const bearerOk = (req, key) => {
  if (!key) return false;
  const a = Buffer.from(req.headers.authorization || ''), b = Buffer.from(`Bearer ${key}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

// cfg: {apiKey, anthropicKey, model, fetchImpl, now, refineLimit, dir}
export function handler(cfg = {}) {
  const now = cfg.now || Date.now;
  const dir = cfg.dir || new URL('.', import.meta.url);
  const limit = cfg.refineLimit ?? 20; // LLM calls per hour in total
  let stamps = [];
  return async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json', extra = {}) => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', ...extra });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    try {
      if (url.pathname === '/healthz') return send(200, 'ok\n', 'text/plain');
      if (req.method === 'GET' && PAGE_FILES[url.pathname]) {
        const [file, type] = PAGE_FILES[url.pathname];
        return send(200, fs.readFileSync(new URL(file, dir)).toString('utf8'), type, { 'cache-control': 'public, max-age=300' });
      }
      if (url.pathname.startsWith('/v1/')) {
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        // With no API_KEY the deterministic endpoints are open (they cost nothing); with one, everything needs it.
        if (cfg.apiKey && !bearerOk(req, cfg.apiKey)) return send(401, { error: 'bearer API_KEY required' });
        let body;
        try { body = JSON.parse((await readBody(req)) || '{}'); } catch (e) { if (e.status) throw e; return send(400, { error: 'body must be JSON' }); }
        const text = typeof body.text === 'string' ? body.text : '';
        if (!text.trim()) return send(400, { error: 'text (the solicitation) is required' });
        if (text.length > MAX_TEXT) return send(413, { error: 'text too large' });
        let result = extract(text);
        const format = body.format || 'json';
        if (body.refine) {
          if (!cfg.apiKey) return send(403, { error: 'refine needs API_KEY set on the server so only you can spend your Anthropic key' });
          if (!cfg.anthropicKey) return send(501, { error: 'refine is not configured: set ANTHROPIC_API_KEY' });
          const t = now(); stamps = stamps.filter((s) => t - s < 3600_000);
          if (stamps.length >= limit) return send(429, { error: `refine limit of ${limit} per hour reached` });
          stamps.push(t);
          result = await refine(result, { apiKey: cfg.anthropicKey, model: cfg.model, fetchImpl: cfg.fetchImpl });
        }
        if (url.pathname === '/v1/matrix') {
          if (format === 'csv') return send(200, toCsv(result), 'text/csv; charset=utf-8');
          if (format === 'md') return send(200, toMarkdown(result), 'text/markdown; charset=utf-8');
          return send(200, result);
        }
        if (url.pathname === '/v1/outline') {
          if (format === 'md') return send(200, toOutlineMarkdown(result), 'text/markdown; charset=utf-8');
          return send(200, { volumes: outline(result).map(({ rows, ...v }) => v) });
        }
        if (url.pathname === '/v1/coverage') {
          if (typeof body.draft !== 'string' || !body.draft.trim()) return send(400, { error: 'draft (your response text) is required' });
          const cov = coverage(result, body.draft);
          if (format === 'csv') return send(200, coverageToCsv(cov, csvCell), 'text/csv; charset=utf-8');
          return send(200, cov);
        }
      }
      return send(404, 'not found\n', 'text/plain');
    } catch (e) {
      if (!e.status) console.error('request failed:', e.message);
      return send(e.status || 500, { error: e.status ? e.message : 'Something went wrong.' });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  const cfg = { apiKey: env.API_KEY, anthropicKey: env.ANTHROPIC_API_KEY, model: env.LLM_MODEL || undefined, refineLimit: env.REFINE_PER_HOUR ? Number(env.REFINE_PER_HOUR) : undefined };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () =>
    console.log(`rfp-compliance-matrix on :${env.PORT || 8080} (LLM pass ${cfg.apiKey && cfg.anthropicKey ? 'on' : 'off'})`));
}
