import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("read"),
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
  createdAt: v.string(),
  updatedAt: v.string(),
});

function toIso(ms: number): string {
  return new Date(ms).toISOString();
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

    return {
      id: args.inquiryId,
      leadSlug: args.leadSlug,
      businessName: args.businessName,
      name: args.name,
      email: args.email,
      phone: args.phone,
      message: args.message,
      status: "new" as const,
      source: args.source,
      createdAt: toIso(now),
      updatedAt: toIso(now),
    };
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

    return rows.map((row) => ({
      id: row.inquiryId,
      leadSlug: row.leadSlug,
      businessName: row.businessName,
      name: row.name,
      email: row.email,
      phone: row.phone,
      message: row.message,
      status: row.status as "new" | "read" | "archived",
      source: row.source,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }));
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

    return rows.map((row) => ({
      id: row.inquiryId,
      leadSlug: row.leadSlug,
      businessName: row.businessName,
      name: row.name,
      email: row.email,
      phone: row.phone,
      message: row.message,
      status: row.status as "new" | "read" | "archived",
      source: row.source,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }));
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

    return {
      id: existing.inquiryId,
      leadSlug: existing.leadSlug,
      businessName: existing.businessName,
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
      message: existing.message,
      status: args.status,
      source: existing.source,
      createdAt: toIso(existing.createdAt),
      updatedAt: toIso(now),
    };
  },
});
