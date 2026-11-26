// R2 helpers scoped to one org's prefix (orgs/{orgId}/).
export const orgPrefix = (orgId: string) => `orgs/${orgId}/`;
export const exportKey = (orgId: string, exportId: string) =>
  `${orgPrefix(orgId)}exports/${exportId}.zip`;

/** Every object key under `prefix`, following R2's paginated list. */
export async function listKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) keys.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/** Deletes keys in batches of 1000 (R2's per-call limit). Returns how many were requested. */
export async function deleteKeys(bucket: R2Bucket, keys: string[]): Promise<number> {
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 1000) {
    await bucket.delete(unique.slice(i, i + 1000));
  }
  return unique.length;
}
