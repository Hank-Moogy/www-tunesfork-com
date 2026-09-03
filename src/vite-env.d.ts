/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PAYMENTS_CLIENT_TOKEN?: string;
  readonly VITE_FOUNDING_PRICES_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
