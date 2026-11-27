import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
    },
  },
});
