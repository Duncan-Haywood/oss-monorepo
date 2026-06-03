/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
