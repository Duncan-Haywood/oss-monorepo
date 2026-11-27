// Request validation for every router: @hono/zod-validator with a hook that renders failures in the
// standard API error shape `{ error: { code: "validation_error", message, details: ZodIssue[] } }`
// (via app.onError) instead of the library's default `{ success: false, error }` body.
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

export const validationError = (issues: unknown) =>
  new AppError(400, "validation_error", "Invalid request", issues);

/** `zValidator(target, schema)` whose failures are our standard 400 `validation_error`. */
export const validate = <T extends keyof ValidationTargets, S extends z.ZodType>(
  target: T,
  schema: S,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw validationError(result.error.issues);
  });
