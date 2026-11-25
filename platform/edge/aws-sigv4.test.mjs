import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signRequest, amzDate, envCredentials, jsonProtocol } from './aws/sigv4.mjs';

// AWS's published SigV4 test suite, case "get-vanilla".
const SUITE = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
const WHEN = new Date('2015-08-30T12:36:00Z');

test('signs AWS test-suite get-vanilla exactly', () => {
  const h = signRequest({ method: 'GET', url: 'https://example.amazonaws.com/', region: 'us-east-1', service: 'service', credentials: SUITE, now: WHEN });
  assert.equal(h.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  assert.equal(h['x-amz-date'], '20150830T123600Z');
});

test('signs AWS test-suite get-vanilla-query-order-key-case exactly', () => {
  const h = signRequest({ method: 'GET', url: 'https://example.amazonaws.com/?Param2=value2&Param1=value1', region: 'us-east-1', service: 'service', credentials: SUITE, now: WHEN });
  assert.match(h.authorization, /Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500$/);
});

test('a session token is signed, and s3 gets a payload hash header', () => {
  const h = signRequest({ method: 'GET', url: 'https://b.s3.us-east-1.amazonaws.com/k', region: 'us-east-1', service: 's3', credentials: { ...SUITE, sessionToken: 'tok' }, now: WHEN });
  assert.equal(h['x-amz-security-token'], 'tok');
  assert.equal(h['x-amz-content-sha256'], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.match(h.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token,/);
});

test('helpers: amzDate and envCredentials', () => {
  assert.equal(amzDate(WHEN), '20150830T123600Z');
  assert.equal(envCredentials({}), null);
  assert.deepEqual(envCredentials({ AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }), { accessKeyId: 'a', secretAccessKey: 'b', sessionToken: '' });
});

test('jsonProtocol sends the target header and turns an error body into a coded Error', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ __type: 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException', message: 'no' }), { status: 400 });
  };
  const call = jsonProtocol({ target: 'DynamoDB_20120810', region: 'us-east-1', service: 'dynamodb', credentials: SUITE, fetchImpl });
  await assert.rejects(call('UpdateItem', {}), (e) => e.code === 'ConditionalCheckFailedException');
  assert.equal(seen[0].url, 'https://dynamodb.us-east-1.amazonaws.com/');
  assert.equal(seen[0].init.headers['x-amz-target'], 'DynamoDB_20120810.UpdateItem');
});
