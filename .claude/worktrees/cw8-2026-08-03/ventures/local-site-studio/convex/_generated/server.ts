import {
  queryGeneric,
  mutationGeneric,
  actionGeneric,
  GenericQueryCtx,
  GenericMutationCtx,
  GenericActionCtx,
} from "convex/server";

export const query = queryGeneric;
export const mutation = mutationGeneric;
export const action = actionGeneric;

export type QueryCtx = GenericQueryCtx<any>;
export type MutationCtx = GenericMutationCtx<any>;
export type ActionCtx = GenericActionCtx<any>;
