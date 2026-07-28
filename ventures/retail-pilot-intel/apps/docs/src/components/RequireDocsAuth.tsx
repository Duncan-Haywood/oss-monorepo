import { useCallback, useState, type ReactNode } from "react";
import { isDocsGateEnabled, readDocsSession } from "../auth/docsAuth";
import { DocsLoginGate } from "./DocsLoginGate";

export function RequireDocsAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => readDocsSession() !== null);
  const refresh = useCallback(() => setAuthed(readDocsSession() !== null), []);

  if (!isDocsGateEnabled()) {
    return <>{children}</>;
  }

  if (!authed) {
    return <DocsLoginGate onAuthenticated={refresh} />;
  }

  return <>{children}</>;
}
