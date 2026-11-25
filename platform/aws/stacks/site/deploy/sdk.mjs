// The AWS SDK half of publish.mjs, kept apart so the tests (which use a fake
// client) need no SDK installed. Dependencies are pinned in package.json and
// package-lock.json beside this file: `npm ci` here before publishing.

export async function sdkClient({ region = 'us-east-1' } = {}) {
  const s3sdk = await import('@aws-sdk/client-s3');
  const cfsdk = await import('@aws-sdk/client-cloudfront');
  const s3 = new s3sdk.S3Client({ region });
  const cf = new cfsdk.CloudFrontClient({ region });
  return {
    async list(bucket) {
      const out = new Map();
      let token;
      do {
        const r = await s3.send(new s3sdk.ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const o of r.Contents ?? []) out.set(o.Key, String(o.ETag ?? '').replaceAll('"', ''));
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    async put(bucket, key, body, { contentType, cacheControl, metadata }) {
      await s3.send(new s3sdk.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
        Metadata: metadata,
      }));
    },
    async remove(bucket, keys) {
      const r = await s3.send(new s3sdk.DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }));
      if (r.Errors?.length) throw new Error(`delete failed for ${r.Errors.length} key(s), first: ${r.Errors[0].Key} ${r.Errors[0].Code}`);
    },
    async invalidate(distributionId, paths) {
      const r = await cf.send(new cfsdk.CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: { CallerReference: `publish-${Date.now()}`, Paths: { Quantity: paths.length, Items: paths } },
      }));
      return r.Invalidation?.Id ?? null;
    },
  };
}
