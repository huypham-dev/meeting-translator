import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Meet Live Translator (EN → VI)",
  description: "Low-latency English to Vietnamese live captions for Google Meet.",
  version: pkg.version,
  icons: {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://meet.google.com/*"],
      js: ["src/content/content-script.tsx"],
      run_at: "document_idle",
    },
  ],
  permissions: ["tabCapture", "offscreen", "activeTab", "storage"],
  host_permissions: [
    "https://meet.google.com/*",
    "https://api.deepgram.com/*",
    "wss://api.deepgram.com/*",
    "https://api.mymemory.translated.net/*",
    "https://api.openai.com/*",
  ],
});
