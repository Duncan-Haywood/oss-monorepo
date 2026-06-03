import { useCallback, useState, type ReactNode } from "react";
import { isDocsGateEnabled, readSession } from "../auth/docsAuth";
import { DocsGate } from "./DocsGate";

export function RequireDocsAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => readSession() !== null);
  const refresh = useCallback(() => setAuthed(readSession() !== null), []);

  if (!isDocsGateEnabled()) {
    return <>{children}</>;
  }

  if (!authed) {
    return <DocsGate onAuthenticated={refresh} />;
  }

  return <>{children}</>;
}
