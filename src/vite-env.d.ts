/// <reference types="vite/client" />

declare module "*.css?inline" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_DEEPGRAM_API_KEY: string;
  readonly VITE_TRANSLATION_PROVIDER: "mymemory" | "openai";
  readonly VITE_OPENAI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
