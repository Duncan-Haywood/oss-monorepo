/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_PASSCODE?: string;
  readonly VITE_DOCS_SKIP_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
