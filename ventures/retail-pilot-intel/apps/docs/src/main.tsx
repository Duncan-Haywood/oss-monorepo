import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { RequireDocsAuth } from "./components/RequireDocsAuth";
import "./styles/docs.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <RequireDocsAuth>
        <App />
      </RequireDocsAuth>
    </HashRouter>
  </StrictMode>,
);
