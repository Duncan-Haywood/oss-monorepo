import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { isValidBucketName, bucketUrl, fetchBucketPath, fetchBucketPathWithRegionRetry, checkBucket } from './probe.mjs';

// A tiny local HTTP server standing in for S3's REST endpoint -- every
// request in this file goes to 127.0.0.1 only, nothing external, so these
// tests are deterministic and never touch a real AWS account.
function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        // The real fetch layer builds a bucket.s3.amazonaws.com URL; tests
        // instead inject a fetchImpl that ignores the URL's host and hits
        // this local server, so bucketUrl()'s own shape is exercised
        // separately (below) from the request/response plumbing here.
        const fetchImpl = (url, init) => {
          const u = new URL(url);
          return fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, init);
        };
        await fn(fetchImpl);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

const LISTING_XML =
  '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>demo</Name>' +
  '<Contents><Key>backup-2026-01.sql</Key></Contents>' +
  '<Contents><Key>customer-export.csv</Key></Contents></ListBucketResult>';

const ACCESS_DENIED_XML =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code>' +
  '<Message>Access Denied</Message></Error>';

const NO_SUCH_BUCKET_XML =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code>' +
  '<Message>The specified bucket does not exist</Message></Error>';

test('isValidBucketName accepts real bucket shapes and rejects garbage', () => {
  assert.equal(isValidBucketName('my-company-backups'), true);
  assert.equal(isValidBucketName('assets.example.com'), true);
  assert.equal(isValidBucketName('a1'), false); // too short
  assert.equal(isValidBucketName('Has-Upper-Case'), false);
  assert.equal(isValidBucketName('has spaces'), false);
  assert.equal(isValidBucketName(''), false);
  assert.equal(isValidBucketName(null), false);
});

test('bucketUrl builds the global endpoint with no region', () => {
  assert.equal(bucketUrl('demo'), 'https://demo.s3.amazonaws.com/');
});

test('bucketUrl builds a regional endpoint when a region is given', () => {
  assert.equal(bucketUrl('demo', { region: 'eu-west-1' }), 'https://demo.s3.eu-west-1.amazonaws.com/');
});

test('bucketUrl includes the query string unmodified', () => {
  assert.equal(bucketUrl('demo', { query: '?acl' }), 'https://demo.s3.amazonaws.com/?acl');
});

test('fetchBucketPath reports a real listing body for a public bucket', () =>
  withServer(
    (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(LISTING_XML); },
    async (fetchImpl) => {
      const result = await fetchBucketPath('demo', '?max-keys=10', { fetchImpl });
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.match(result.text, /ListBucketResult/);
    },
  ));

test('fetchBucketPath reports ok:false with AccessDenied for a private bucket', () =>
  withServer(
    (req, res) => { res.writeHead(403, { 'content-type': 'application/xml' }); res.end(ACCESS_DENIED_XML); },
    async (fetchImpl) => {
      const result = await fetchBucketPath('demo', '?max-keys=10', { fetchImpl });
      assert.equal(result.ok, false);
      assert.equal(result.status, 403);
      assert.match(result.text, /AccessDenied/);
    },
  ));

test('fetchBucketPath reports NoSuchBucket for a name that does not exist', () =>
  withServer(
    (req, res) => { res.writeHead(404, { 'content-type': 'application/xml' }); res.end(NO_SUCH_BUCKET_XML); },
    async (fetchImpl) => {
      const result = await fetchBucketPath('nope-not-real', '?max-keys=10', { fetchImpl });
      assert.equal(result.ok, false);
      assert.equal(result.status, 404);
      assert.match(result.text, /NoSuchBucket/);
    },
  ));

test('fetchBucketPath reports an error (not a status) for an unreachable host', async () => {
  const result = await fetchBucketPath('demo', '?max-keys=10', {
    timeoutMs: 500,
    fetchImpl: () => { throw new Error('getaddrinfo ENOTFOUND'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.ok(result.error);
});

test('fetchBucketPath surfaces the x-amz-bucket-region header when present', () =>
  withServer(
    (req, res) => {
      res.writeHead(400, { 'content-type': 'application/xml', 'x-amz-bucket-region': 'eu-west-1' });
      res.end('<Error><Code>AuthorizationHeaderMalformed</Code></Error>');
    },
    async (fetchImpl) => {
      const result = await fetchBucketPath('demo', '?max-keys=10', { fetchImpl });
      assert.equal(result.regionHint, 'eu-west-1');
    },
  ));

test('fetchBucketPathWithRegionRetry retries once against the hinted region', () => {
  const calls = [];
  return withServer(
    (req, res) => {
      calls.push(req.url);
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(LISTING_XML);
    },
    async (localFetch) => {
      let call = 0;
      const fetchImpl = async (url, init) => {
        call += 1;
        if (call === 1) {
          return new Response('<Error><Code>PermanentRedirect</Code></Error>', {
            status: 400,
            headers: { 'x-amz-bucket-region': 'eu-west-1' },
          });
        }
        return localFetch(url, init);
      };
      const result = await fetchBucketPathWithRegionRetry('demo', '?max-keys=10', { fetchImpl });
      assert.equal(result.status, 200);
      assert.equal(call, 2);
    },
  );
});

test('checkBucket throws a clear error with no bucket name', async () => {
  await assert.rejects(() => checkBucket(null), /bucket name is required/);
});

test('checkBucket throws a clear error for a malformed bucket name', async () => {
  await assert.rejects(() => checkBucket('Not Valid!'), /not a syntactically valid/);
});

test('checkBucket fetches both the listing and the ACL', () =>
  withServer(
    (req, res) => {
      if (req.url.includes('acl')) {
        res.writeHead(403, { 'content-type': 'application/xml' });
        res.end(ACCESS_DENIED_XML);
      } else {
        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end(LISTING_XML);
      }
    },
    async (fetchImpl) => {
      const raw = await checkBucket('demo', { fetchImpl });
      assert.equal(raw.listing.ok, true);
      assert.equal(raw.acl.ok, false);
      assert.equal(raw.acl.status, 403);
    },
  ));
