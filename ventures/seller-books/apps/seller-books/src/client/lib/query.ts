import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/**
 * True for the API's 403 when the signed-in user has not accepted the current legal documents
 * (worker/middleware/legal.ts), e.g. a tab left open across a policy change.
 */
export const isTermsNotAccepted = (error: unknown) =>
  error instanceof ApiError && error.code === "terms_not_accepted";

// On that 403, refetch /api/me: its `legal.acceptedAt` is then null and LegalGate shows the
// "Before you continue" card in place of the page. Not retried: the answer will not change.
const onError = (error: unknown) => {
  if (isTermsNotAccepted(error)) void queryClient.invalidateQueries({ queryKey: ["me"] });
};

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => !isTermsNotAccepted(error) && failures < 1,
    },
  },
});
