import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/query";
import { browserStore, rememberSignupSource } from "./lib/signup-source";
import { router } from "./router";
import "./styles.css";

// Which of our pages sent this visit (`?signup&from=...`), kept until sign-in (lib/signup-source.ts).
rememberSignupSource(window.location.search, browserStore());

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
