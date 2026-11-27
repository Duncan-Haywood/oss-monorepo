// Files kept in D1 while the R2 bucket is not bound (ports/file-store.ts): one row per 1 MiB chunk.
// Read and written with raw D1 statements; declared here so migrations stay generated. Not a tenant
// table: the key carries the org (`orgs/{orgId}/...`), and each file's own row (pay_app_attachments
// and the like) is what tenant checks read before a key is ever used.
import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fileBlobs = sqliteTable(
  "file_blobs",
  {
    key: text("key").notNull(),
    chunk: integer("chunk").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    contentType: text("content_type"),
    customMetadata: text("custom_metadata"),
    /** The whole file's size, repeated on every chunk; totals read chunk 0. */
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.chunk] })],
);
