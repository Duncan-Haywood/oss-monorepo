import { useCallback, useState, type ReactNode } from "react";
import { readSession } from "../auth/docsAuth";
import { DocsLoginGate } from "./DocsLoginGate";

export function RequireDocsAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => readSession() !== null);
  const refresh = useCallback(() => setAuthed(readSession() !== null), []);

  if (!authed) {
    return <DocsLoginGate onAuthenticated={refresh} />;
  }
  return <>{children}</>;
}
