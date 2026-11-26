import { integer, text } from "drizzle-orm/sqlite-core";

/** Epoch-ms timestamp column surfaced as a JS Date. */
export const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const createdAt = () =>
  ts("created_at")
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export const bool = (name: string) => integer(name, { mode: "boolean" });

export const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

/** Money is always integer US cents. */
export const cents = (name: string) => integer(name);
