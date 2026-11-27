import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/query";
import { router } from "./router";
import "./styles.css";

// Pages load as separate chunks (router.tsx). A tab left open across a deploy asks for chunk names
// the new deploy no longer has; reload once to pick up the new build instead of showing a blank
// page. The timestamp stops a reload loop if the chunk is missing for some other reason.
window.addEventListener("vite:preloadError", (event) => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem("payapps:chunk-reload") ?? 0);
    sessionStorage.setItem("payapps:chunk-reload", String(Date.now()));
  } catch {
    return;
  }
  if (Date.now() - last < 10_000) return;
  event.preventDefault();
  window.location.reload();
});

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
