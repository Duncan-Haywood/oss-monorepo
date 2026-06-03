/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_PASSCODE?: string;
  readonly VITE_DOCS_GATE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
