// Evidence files kept in D1 while the R2 bucket is not bound (ports/file-store.ts): one row per 1 MiB
// chunk. Read and written with raw D1 statements; declared here so migrations stay generated.
import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fileBlobs = sqliteTable(
  "file_blobs",
  {
    key: text("key").notNull(),
    chunk: integer("chunk").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    contentType: text("content_type"),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.chunk] })],
);
