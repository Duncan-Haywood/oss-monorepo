import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/query";
import { router } from "./router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

// #root may hold prerendered HTML for public pages; createRoot (not hydrateRoot) replaces it on first commit.
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
