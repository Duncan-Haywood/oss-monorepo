import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProbeUrl, detectTargetFromUrl, buildReport } from './engine.mjs';

// -- buildProbeUrl --------------------------------------------------------

test('buildProbeUrl: S3 uses the path-style endpoint (works for dotted names, no region needed)', () => {
  const r = buildProbeUrl({ provider: 's3', bucket: 'my-example-bucket' });
  assert.equal(r.ok, true);
  assert.equal(r.probeUrl, 'https://s3.amazonaws.com/my-example-bucket');
});

test('buildProbeUrl: GCS uses the XML API root', () => {
  const r = buildProbeUrl({ provider: 'gcs', bucket: 'my-example-bucket' });
  assert.equal(r.ok, true);
  assert.equal(r.probeUrl, 'https://storage.googleapis.com/my-example-bucket');
});

test('buildProbeUrl: Azure needs an account and appends the container-listing query', () => {
  const r = buildProbeUrl({ provider: 'azure', bucket: 'mycontainer', account: 'mystorageacct' });
  assert.equal(r.ok, true);
  assert.equal(r.probeUrl, 'https://mystorageacct.blob.core.windows.net/mycontainer?restype=container&comp=list');
});

test('buildProbeUrl: Azure without an account is rejected', () => {
  const r = buildProbeUrl({ provider: 'azure', bucket: 'mycontainer' });
  assert.equal(r.ok, false);
  assert.match(r.error, /storage account/);
});

test('buildProbeUrl: unknown provider is rejected', () => {
  const r = buildProbeUrl({ provider: 'digitalocean', bucket: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown provider/);
});

test('buildProbeUrl: an implausible bucket name is rejected rather than silently probed', () => {
  const r = buildProbeUrl({ provider: 's3', bucket: 'a b/c' });
  assert.equal(r.ok, false);
});

// -- detectTargetFromUrl ---------------------------------------------------

test('detectTargetFromUrl: S3 virtual-hosted style', () => {
  const r = detectTargetFromUrl('https://my-example-bucket.s3.amazonaws.com/');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 's3');
  assert.equal(r.bucket, 'my-example-bucket');
});

test('detectTargetFromUrl: S3 virtual-hosted style with a region', () => {
  const r = detectTargetFromUrl('https://my-example-bucket.s3.us-west-2.amazonaws.com/');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 's3');
  assert.equal(r.bucket, 'my-example-bucket');
});

test('detectTargetFromUrl: S3 path style', () => {
  const r = detectTargetFromUrl('https://s3.amazonaws.com/my-example-bucket/');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 's3');
  assert.equal(r.bucket, 'my-example-bucket');
});

test('detectTargetFromUrl: GCS path style', () => {
  const r = detectTargetFromUrl('https://storage.googleapis.com/my-example-bucket/');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'gcs');
  assert.equal(r.bucket, 'my-example-bucket');
});

test('detectTargetFromUrl: GCS virtual-hosted style', () => {
  const r = detectTargetFromUrl('https://my-example-bucket.storage.googleapis.com/');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'gcs');
});

test('detectTargetFromUrl: Azure blob container URL', () => {
  const r = detectTargetFromUrl('https://mystorageacct.blob.core.windows.net/mycontainer');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'azure');
  assert.equal(r.bucket, 'mycontainer');
  assert.equal(r.account, 'mystorageacct');
  assert.match(r.probeUrl, /\?restype=container&comp=list$/);
});

test('detectTargetFromUrl: an unrecognised host is rejected, not guessed at', () => {
  const r = detectTargetFromUrl('https://example.com/some-bucket/');
  assert.equal(r.ok, false);
  assert.match(r.error, /unrecognised host/);
});

test('detectTargetFromUrl: a non-URL string is rejected', () => {
  const r = detectTargetFromUrl('not a url');
  assert.equal(r.ok, false);
});

test('detectTargetFromUrl: a path-style S3 URL missing the bucket path is rejected', () => {
  const r = detectTargetFromUrl('https://s3.amazonaws.com/');
  assert.equal(r.ok, false);
});

// -- buildReport: S3 / GCS (shared ListBucketResult shape) ----------------

const S3_PUBLIC_LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>leaky-example-bucket</Name>
  <Prefix></Prefix>
  <Marker></Marker>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Contents><Key>2024-q1-customer-export.csv</Key><LastModified>2024-03-01T00:00:00.000Z</LastModified><ETag>"abc"</ETag><Size>48213</Size><StorageClass>STANDARD</StorageClass></Contents>
  <Contents><Key>backup-2024-01-15.sql.gz</Key><LastModified>2024-01-15T00:00:00.000Z</LastModified><ETag>"def"</ETag><Size>102400</Size><StorageClass>STANDARD</StorageClass></Contents>
  <Contents><Key>logo.png</Key><LastModified>2023-06-01T00:00:00.000Z</LastModified><ETag>"ghi"</ETag><Size>2048</Size><StorageClass>STANDARD</StorageClass></Contents>
</ListBucketResult>`;

const S3_ACCESS_DENIED = `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>Access Denied</Message><RequestId>ABCD1234</RequestId><HostId>xyz</HostId></Error>`;

const S3_NO_SUCH_BUCKET = `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message><BucketName>nope</BucketName><RequestId>ABCD1234</RequestId><HostId>xyz</HostId></Error>`;

test('buildReport: an S3 ListBucketResult body is a danger finding, with sample keys and count', () => {
  const r = buildReport('https://s3.amazonaws.com/leaky-example-bucket', {
    ok: true,
    status: 200,
    provider: 's3',
    bodySample: S3_PUBLIC_LISTING,
    error: null,
  });
  assert.equal(r.state, 'public-listing');
  assert.equal(r.ok, false);
  assert.equal(r.dangerCount, 1);
  const [f] = r.findings;
  assert.equal(f.id, 'bucket-publicly-listable');
  assert.equal(f.objectCount, 3);
  assert.deepEqual(f.sampleKeys, ['2024-q1-customer-export.csv', 'backup-2024-01-15.sql.gz', 'logo.png']);
  assert.equal(f.truncated, false);
});

test('buildReport: same ListBucketResult shape is read identically for GCS', () => {
  const r = buildReport('https://storage.googleapis.com/leaky-example-bucket', {
    ok: true,
    status: 200,
    provider: 'gcs',
    bodySample: S3_PUBLIC_LISTING,
    error: null,
  });
  assert.equal(r.state, 'public-listing');
  assert.equal(r.findings[0].objectCount, 3);
});

test('buildReport: AccessDenied is read as private (the good outcome), no finding', () => {
  const r = buildReport('https://s3.amazonaws.com/private-bucket', {
    ok: true,
    status: 403,
    provider: 's3',
    bodySample: S3_ACCESS_DENIED,
    error: null,
  });
  assert.equal(r.state, 'private');
  assert.equal(r.ok, true);
  assert.equal(r.findings.length, 0);
});

test('buildReport: NoSuchBucket is read as not-found, not a finding', () => {
  const r = buildReport('https://s3.amazonaws.com/nope', {
    ok: true,
    status: 404,
    provider: 's3',
    bodySample: S3_NO_SUCH_BUCKET,
    error: null,
  });
  assert.equal(r.state, 'not-found');
  assert.equal(r.ok, true);
  assert.equal(r.findings.length, 0);
});

test('buildReport: a bare 403 with no parseable body is still read as private', () => {
  const r = buildReport('https://s3.amazonaws.com/private-bucket', {
    ok: true,
    status: 403,
    provider: 's3',
    bodySample: '',
    error: null,
  });
  assert.equal(r.state, 'private');
  assert.equal(r.ok, true);
});

test('buildReport: IsTruncated=true is surfaced as "at least N, possibly more"', () => {
  const truncated = S3_PUBLIC_LISTING.replace('<IsTruncated>false</IsTruncated>', '<IsTruncated>true</IsTruncated>');
  const r = buildReport('https://s3.amazonaws.com/leaky-example-bucket', {
    ok: true,
    status: 200,
    provider: 's3',
    bodySample: truncated,
    error: null,
  });
  assert.equal(r.findings[0].truncated, true);
});

test('buildReport: an unrecognised body/status pair is "unknown", never guessed either way', () => {
  const r = buildReport('https://s3.amazonaws.com/weird', {
    ok: true,
    status: 500,
    provider: 's3',
    bodySample: '<html><body>Internal error</body></html>',
    error: null,
  });
  assert.equal(r.state, 'unknown');
  assert.equal(r.ok, false);
  assert.equal(r.findings.length, 0);
});

test('buildReport: a network failure is incomplete, not "private"', () => {
  const r = buildReport('https://s3.amazonaws.com/unreachable', {
    ok: false,
    status: null,
    provider: 's3',
    bodySample: '',
    error: 'ECONNREFUSED',
  });
  assert.equal(r.incomplete, true);
  assert.equal(r.ok, false);
});

// -- buildReport: Azure (EnumerationResults shape) -------------------------

const AZURE_PUBLIC_LISTING = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://mystorageacct.blob.core.windows.net/" ContainerName="mycontainer">
  <Blobs>
    <Blob><Name>invoices/2024-01.pdf</Name><Properties><Last-Modified>Mon, 01 Jan 2024 00:00:00 GMT</Last-Modified><Content-Length>10240</Content-Length></Properties></Blob>
    <Blob><Name>invoices/2024-02.pdf</Name><Properties><Last-Modified>Mon, 01 Feb 2024 00:00:00 GMT</Last-Modified><Content-Length>10240</Content-Length></Properties></Blob>
  </Blobs>
  <NextMarker/>
</EnumerationResults>`;

const AZURE_PUBLIC_ACCESS_NOT_PERMITTED = `<?xml version="1.0" encoding="utf-8"?>
<Error><Code>PublicAccessNotPermitted</Code><Message>Public access is not permitted on this storage account.</Message></Error>`;

const AZURE_CONTAINER_NOT_FOUND = `<?xml version="1.0" encoding="utf-8"?>
<Error><Code>ContainerNotFound</Code><Message>The specified container does not exist.</Message></Error>`;

test('buildReport: an Azure EnumerationResults body is a danger finding', () => {
  const r = buildReport('https://mystorageacct.blob.core.windows.net/mycontainer', {
    ok: true,
    status: 200,
    provider: 'azure',
    bodySample: AZURE_PUBLIC_LISTING,
    error: null,
  });
  assert.equal(r.state, 'public-listing');
  assert.equal(r.findings[0].objectCount, 2);
  assert.deepEqual(r.findings[0].sampleKeys, ['invoices/2024-01.pdf', 'invoices/2024-02.pdf']);
});

test('buildReport: Azure PublicAccessNotPermitted is private, no finding', () => {
  const r = buildReport('https://mystorageacct.blob.core.windows.net/mycontainer', {
    ok: true,
    status: 403,
    provider: 'azure',
    bodySample: AZURE_PUBLIC_ACCESS_NOT_PERMITTED,
    error: null,
  });
  assert.equal(r.state, 'private');
  assert.equal(r.ok, true);
});

test('buildReport: Azure ContainerNotFound is not-found', () => {
  const r = buildReport('https://mystorageacct.blob.core.windows.net/nope', {
    ok: true,
    status: 404,
    provider: 'azure',
    bodySample: AZURE_CONTAINER_NOT_FOUND,
    error: null,
  });
  assert.equal(r.state, 'not-found');
  assert.equal(r.ok, true);
});

test('buildReport: an S3 listing body is never misread as an Azure listing (provider gates the parse)', () => {
  const r = buildReport('https://mystorageacct.blob.core.windows.net/mycontainer', {
    ok: true,
    status: 200,
    provider: 'azure',
    bodySample: S3_PUBLIC_LISTING, // wrong shape for this provider
    error: null,
  });
  assert.notEqual(r.state, 'public-listing');
});

test('buildReport: this tool never reads more than 5 sample keys even when more are present', () => {
  const many = `<?xml version="1.0"?><ListBucketResult>${Array.from({ length: 20 }, (_, i) => `<Contents><Key>file-${i}.txt</Key></Contents>`).join('')}</ListBucketResult>`;
  const r = buildReport('https://s3.amazonaws.com/big-bucket', {
    ok: true,
    status: 200,
    provider: 's3',
    bodySample: many,
    error: null,
  });
  assert.equal(r.findings[0].objectCount, 20);
  assert.equal(r.findings[0].sampleKeys.length, 5);
});
