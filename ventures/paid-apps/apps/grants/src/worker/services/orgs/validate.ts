// zValidator wrapper that renders failures in the API error shape ({ error: { code, message, details } }).
import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { AppError } from "../../lib/errors";

export const jsonBody = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result) => {
    if (!result.success) {
      throw new AppError(400, "validation_error", "Invalid request", result.error.issues);
    }
  });
