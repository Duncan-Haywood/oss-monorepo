import { Lock } from "lucide-react";
import type { OperatorFetchResult } from "@/lib/operator-client";

/**
 * The banner a panel shows instead of numbers when the operator API refuses it.
 *
 * Rendering nothing, or rendering zeros, was the old behaviour and it was the
 * misleading one — a reader cannot tell a denied request from an empty dataset.
 */
export default function OperatorAccessNotice({
  result,
}: {
  result: OperatorFetchResult<unknown> | null;
}) {
  if (result === null || result.state === "ok") {
    return null;
  }

  const heading =
    result.state === "unauthorized"
      ? "Operator access required"
      : result.state === "unconfigured"
        ? "Operator API not configured"
        : "Could not load this panel";

  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-stone-300 bg-stone-50 p-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
      <div>
        <p className="text-sm font-semibold text-stone-800">{heading}</p>
        <p className="mt-0.5 text-xs text-stone-600">
          {result.hint} The figures below are not live.
        </p>
      </div>
    </div>
  );
}
