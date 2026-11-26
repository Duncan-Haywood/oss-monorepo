// Reading the audit log: newest first, keyset (cursor) pagination.
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { auditLog } from "../../db/schema";
import { badRequest } from "../../lib/errors";

interface Cursor {
  t: number;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return btoa(`${c.t}.${c.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(s: string): Cursor {
  try {
    const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const dot = raw.indexOf(".");
    const t = Number(raw.slice(0, dot));
    const id = raw.slice(dot + 1);
    if (dot < 1 || !Number.isFinite(t) || !id) throw new Error("bad cursor");
    return { t, id };
  } catch {
    throw badRequest("Invalid cursor");
  }
}

export async function listAuditLog(
  ctx: AppContext,
  orgId: string,
  opts: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const cur = opts.cursor ? decodeCursor(opts.cursor) : null;
  const where = cur
    ? and(
        eq(auditLog.orgId, orgId),
        or(
          lt(auditLog.createdAt, new Date(cur.t)),
          and(eq(auditLog.createdAt, new Date(cur.t)), lt(auditLog.id, cur.id)),
        ),
      )
    : eq(auditLog.orgId, orgId);
  const rows = await ctx.db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last ? encodeCursor({ t: last.createdAt.getTime(), id: last.id }) : null;
  return { items, nextCursor };
}
