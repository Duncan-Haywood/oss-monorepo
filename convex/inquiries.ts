import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("read"),
  v.literal("replied"),
  v.literal("archived"),
);

const inquiryReturn = v.object({
  id: v.string(),
  leadSlug: v.string(),
  businessName: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  message: v.string(),
  status: statusValidator,
  source: v.optional(v.string()),
  operatorReply: v.optional(v.string()),
  repliedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function mapInquiry(row: {
  inquiryId: string;
  leadSlug: string;
  businessName: string;
  name?: string;
  email?: string;
  phone?: string;
  message: string;
  status: string;
  source?: string;
  operatorReply?: string;
  repliedAt?: number;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: row.inquiryId,
    leadSlug: row.leadSlug,
    businessName: row.businessName,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status as "new" | "read" | "replied" | "archived",
    source: row.source,
    operatorReply: row.operatorReply,
    repliedAt:
      row.repliedAt !== undefined ? toIso(row.repliedAt) : undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export const create = mutation({
  args: {
    inquiryId: v.string(),
    leadSlug: v.string(),
    businessName: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    message: v.string(),
    source: v.optional(v.string()),
  },
  returns: inquiryReturn,
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("clientInquiries", {
      inquiryId: args.inquiryId,
      leadSlug: args.leadSlug,
      businessName: args.businessName,
      name: args.name,
      email: args.email,
      phone: args.phone,
      message: args.message,
      status: "new",
      source: args.source,
      createdAt: now,
      updatedAt: now,
    });

    return mapInquiry({
      inquiryId: args.inquiryId,
      leadSlug: args.leadSlug,
      businessName: args.businessName,
      name: args.name,
      email: args.email,
      phone: args.phone,
      message: args.message,
      status: "new",
      source: args.source,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(inquiryReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const rows = await ctx.db
      .query("clientInquiries")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);

    return rows.map(mapInquiry);
  },
});

export const listBySlug = query({
  args: {
    leadSlug: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(inquiryReturn),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("clientInquiries")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", args.leadSlug))
      .order("desc")
      .take(limit);

    return rows.map(mapInquiry);
  },
});

export const getById = query({
  args: {
    inquiryId: v.string(),
  },
  returns: v.union(inquiryReturn, v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clientInquiries")
      .withIndex("by_inquiryId", (q) => q.eq("inquiryId", args.inquiryId))
      .unique();
    if (!existing) return null;
    return mapInquiry(existing);
  },
});

export const updateStatus = mutation({
  args: {
    inquiryId: v.string(),
    status: statusValidator,
  },
  returns: v.union(inquiryReturn, v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clientInquiries")
      .withIndex("by_inquiryId", (q) => q.eq("inquiryId", args.inquiryId))
      .unique();

    if (!existing) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(existing._id, { status: args.status, updatedAt: now });

    return mapInquiry({ ...existing, status: args.status, updatedAt: now });
  },
});

export const recordReply = mutation({
  args: {
    inquiryId: v.string(),
    operatorReply: v.string(),
  },
  returns: v.union(inquiryReturn, v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clientInquiries")
      .withIndex("by_inquiryId", (q) => q.eq("inquiryId", args.inquiryId))
      .unique();

    if (!existing) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      status: "replied",
      operatorReply: args.operatorReply,
      repliedAt: now,
      updatedAt: now,
    });

    return mapInquiry({
      ...existing,
      status: "replied",
      operatorReply: args.operatorReply,
      repliedAt: now,
      updatedAt: now,
    });
  },
});
