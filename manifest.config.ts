import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Meet Live Translator (EN → VI)",
  description: "Live English to Vietnamese captions for Google Meet and YouTube, with saved meeting notes and AI summaries.",
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
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://meet.google.com/*", "https://www.youtube.com/*"],
      js: ["src/content/content-script.tsx"],
      run_at: "document_idle",
    },
  ],
  permissions: ["tabCapture", "offscreen", "activeTab", "storage", "unlimitedStorage"],
  host_permissions: [
    "https://meet.google.com/*",
    "https://www.youtube.com/*",
    "https://api.deepgram.com/*",
    "wss://api.deepgram.com/*",
    "https://api.mymemory.translated.net/*",
    "https://api.openai.com/*",
  ],
});
