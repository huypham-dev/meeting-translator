# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run build       # vite build -> dist/ (load unpacked in chrome://extensions)
npm run dev         # vite build --watch (no HMR: reload the extension + refresh the Meet tab after each rebuild)
npm run typecheck   # tsc --noEmit
```

There is no test runner or linter configured. Config lives in `.env` (copy from `.env.example`): `VITE_DEEPGRAM_API_KEY`, `VITE_TRANSLATION_PROVIDER` (`mymemory` | `openai`), `VITE_OPENAI_API_KEY` (also required by the Ask AI sidebar). These are inlined into the bundle at build time, so changing `.env` requires a rebuild; never ship a build containing real keys.

## Architecture

Chrome MV3 extension (Vite + `@crxjs/vite-plugin`, React 18, manifest in `manifest.config.ts`) that captures Meet/YouTube tab audio and shows live EN → VI captions. Pipeline:

`chrome.tabCapture` → **offscreen document** (AudioContext + AudioWorklet, 16kHz PCM16 ~100ms chunks) → Deepgram WebSocket STT (interim + final) → `IncrementalTranslator` (debounced, versioned) → message to **background service worker** → relayed to the tab's **content script** → React overlay in a Shadow DOM.

Key points that span files:

- **Four execution contexts** talk only via `chrome.runtime` messages. All message types and the `ExtensionMessage` union live in `src/shared/messages.ts` (use `MessageType` constants and `isExtensionMessage`; no raw strings). Add new message types there.
- **Service worker** (`src/background/service-worker.ts`) only orchestrates: gets the tabCapture stream id, creates/tears down the offscreen doc, relays offscreen → content script, and handles `ASK_AI`. Heavy audio/network work must stay in the offscreen doc (`src/offscreen/offscreen.ts`) since MV3 workers are ephemeral and can't hold an AudioContext.
- **AudioWorklet** is plain JS in `public/worklets/audio-processor.js`, loaded at runtime; `src/offscreen/audio-worklet.ts` only holds shared constants — keep them in sync.
- **Provider seams**: `StreamingSTTProvider` (`src/services/stt/types.ts`, Deepgram impl) and `TranslationProvider` (`src/services/translation/types.ts`, registered in `createTranslationProvider` in `providers.ts`). Swap implementations without touching offscreen/popup/overlay.
- **Stale-translation protection**: `IncrementalTranslator` uses a version counter so slow responses never overwrite newer captions; interim results are debounced (~150ms), finals bypass the debounce.
- **Content script** (`src/content/content-script.tsx`) mounts both `CaptionOverlay` and `AskAiSidebar` into Shadow DOM (styles in `styles.css`). `transcript-store.ts` independently listens to `TRANSLATION_UPDATE` to keep a rolling transcript used as context for `src/services/ai/meeting-assistant.ts` (OpenAI `gpt-4o-mini` Q&A).
- Host matches (content script + `host_permissions`) are in `manifest.config.ts`; any new API domain must be added there.
- Path alias `@/` → `src/` (see `tsconfig.json` / `vite.config.ts`).

Scope is English → Vietnamese only; Meet's own caption DOM is intentionally not used as a transcript source.
