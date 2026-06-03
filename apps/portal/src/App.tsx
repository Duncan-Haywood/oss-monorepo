import { useCallback, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { readSession } from "./auth/demoAuth";
import { LoginGate } from "./components/LoginGate";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { FunnelPage } from "./pages/FunnelPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProductsPage } from "./pages/ProductsPage";
import { TrustPage } from "./pages/TrustPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(() => readSession() !== null);
  const refresh = useCallback(() => setAuthed(readSession() !== null), []);

  if (!authed) {
    return <LoginGate onAuthenticated={refresh} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <OverviewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/funnel"
        element={
          <RequireAuth>
            <FunnelPage />
          </RequireAuth>
        }
      />
      <Route
        path="/products"
        element={
          <RequireAuth>
            <ProductsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/experiments"
        element={
          <RequireAuth>
            <ExperimentsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/trust"
        element={
          <RequireAuth>
            <TrustPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
