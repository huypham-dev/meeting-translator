# Meet Live Translator (EN → VI)

Chrome extension (Manifest V3) that captures **Google Meet tab audio** (not
your microphone) and shows a live Vietnamese caption overlay translated from
streaming English speech-to-text, targeting ~0.5–1.5s perceived latency.

```
Google Meet Tab
  → chrome.tabCapture
  → Offscreen Document
  → AudioWorklet (resample to 16kHz mono PCM16, ~100ms chunks)
  → WebSocket → Deepgram streaming STT (interim + final transcripts)
  → Incremental translator (debounced, versioned, EN → VI)
  → background service worker
  → content script
  → React caption overlay (Shadow DOM) inside Google Meet
```

## Project structure

```
src/
├── background/service-worker.ts   Orchestrates start/stop, offscreen doc, tab discovery, messaging
├── offscreen/
│   ├── offscreen.html / offscreen.ts   Capture pipeline: MediaStream, AudioContext, STT, translation
│   └── audio-worklet.ts                Constants shared with the worklet processor
├── content/
│   ├── content-script.tsx    Mounts the overlay into a Shadow DOM on meet.google.com
│   ├── CaptionOverlay.tsx    Caption state + rendering
│   └── styles.css
├── popup/                    Start/Stop UI + status
├── services/
│   ├── stt/                  StreamingSTTProvider interface + Deepgram implementation
│   └── translation/          TranslationProvider interface + providers + IncrementalTranslator
└── shared/                   Typed messages, shared types, logger

public/worklets/audio-processor.js   AudioWorkletProcessor (plain JS, loaded at runtime)
manifest.config.ts                   MV3 manifest (via @crxjs/vite-plugin)
```

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set VITE_DEEPGRAM_API_KEY
npm run build
```

Then load it in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the generated `dist/` folder

For iterative development, `npm run dev` runs `vite build --watch`; reload the
extension (and refresh the Meet tab) after each rebuild.

## Using it

1. Join a Google Meet call.
2. Click the extension icon → **Start Translation**.
3. Vietnamese captions appear near the bottom of the Meet window as remote
   participants speak. Click **Stop** to end the session (audio, WebSocket,
   and AudioContext are fully torn down). You can Start/Stop repeatedly
   without reloading Meet.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `VITE_DEEPGRAM_API_KEY` | [Deepgram](https://console.deepgram.com/) streaming STT key |
| `VITE_TRANSLATION_PROVIDER` | `mymemory` (free, keyless, default) or `openai` |
| `VITE_OPENAI_API_KEY` | Only needed if `VITE_TRANSLATION_PROVIDER=openai` |

### ⚠️ Security note

`.env` values are compiled directly into the extension bundle (`import.meta.env`)
and are **readable by anyone who inspects the unpacked/`.crx` bundle**. This is
acceptable for local development only. **Do not publish a build containing a
real API key to the Chrome Web Store or anywhere public.**

For a real release, remove provider keys from the extension entirely and
proxy through your own backend instead:

```
Extension → your backend (holds secrets) → Deepgram / translation provider
```

The `StreamingSTTProvider` and `TranslationProvider` interfaces
(`src/services/stt/types.ts`, `src/services/translation/types.ts`) are
designed so you can swap in a backend-proxied implementation without
touching `offscreen.ts`, the popup, or the overlay.

## Swapping providers

- **STT**: implement `StreamingSTTProvider` (`src/services/stt/types.ts`) and use it in `offscreen.ts` instead of `DeepgramSTTProvider`.
- **Translation**: implement `TranslationProvider` (`src/services/translation/types.ts`) and register it in `createTranslationProvider` (`src/services/translation/providers.ts`). `OpenAITranslationProvider` is included as a higher-quality option; DeepL/Google Translate/local models follow the same shape.

## MVP limitations

English → Vietnamese only, no speaker diarization, no transcript history or
recording, no auth/database, one Meet tab at a time. Google Meet's own
caption DOM is never used as a transcription source.

## Latency review

See below for a breakdown of where time is spent in the pipeline and what
was done to keep each stage under ~200ms.

| Stage | Typical cost | Notes |
|---|---|---|
| AudioWorklet buffering | ~100ms | Chunk size is the dominant, deliberate latency source (trade-off vs. STT context); could drop to 50ms chunk size for ~50ms less latency at the cost of more WebSocket frames. |
| Tab→Worklet→WebSocket handoff | <5ms | Worklet posts transferable `ArrayBuffer`s (zero-copy) directly off the audio render thread; no MediaRecorder/blob buffering. |
| Deepgram interim transcript | ~150–400ms from speech onset | Server-side STT latency (`endpointing: 300`, `interim_results: true`, `model: nova-2`); not controllable client-side beyond provider/model choice. |
| Translation debounce | 150ms (interim) / 0ms (final) | Intentional coalescing so bursts of interim transcripts don't fire one translation request each; finals bypass the debounce. |
| Translation API round trip | ~100–500ms (MyMemory, free tier) | **Largest optimizable risk.** MyMemory is a plain REST call with no streaming and no SLA. For production, prefer a low-latency provider (DeepL API, or a small dedicated translation model) and consider sentence-level speculative decoding. This is called out explicitly in code comments (`providers.ts`) as the swappable seam. |
| Message relay (offscreen → background → content script) | <10ms | Local `chrome.runtime`/`chrome.tabs` messaging, no network. |
| React overlay update | <16ms | Single state update, CSS transition only (no layout thrash); stale translations are dropped via the `translationVersion` counter so a slow response never overwrites a newer caption. |

**Net assessment**: with Deepgram + MyMemory, expect roughly 400ms–1.2s
end-to-end for interim captions, which is within the target range but close
to the upper bound almost entirely because of the free translation API. The
single highest-leverage change for latency is swapping `mymemory` for a
paid, low-latency translation provider (OpenAI streaming, DeepL, or a
self-hosted model) — everything else in the pipeline (worklet chunking,
messaging, debounce, rendering) is already sub-200ms per stage.
