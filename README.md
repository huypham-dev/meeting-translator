# Meet Live Translator (EN → VI)

A Chrome extension that shows **live Vietnamese captions** for English speech in
**Google Meet** and **YouTube** tabs, and keeps **notes** of every meeting
(transcript, AI summary, Markdown export).

- Live captions that update as people speak (about 0.5–1.5 s behind the audio)
- Optional English source line under each caption
- **Notes**: each session is saved with a timestamped transcript
- **AI summary**: key points, decisions, action items, in the transcript's language
- **Ask AI**: ask questions about the meeting in progress
- Download any meeting as a `.md` file
- Captures tab audio only, never your microphone. Your keys stay in your browser.

## Quick start (run it locally)

You need Node.js 18+ and Google Chrome.

```bash
git clone https://github.com/huypham-dev/meeting-translator.git
cd meeting-translator
npm install
npm run build
```

Load the build into Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Pin the extension, click its icon, then **Settings (API keys)** and add your keys (see below)

## API keys

The extension has no backend. You bring your own keys, and they are stored only
in your browser (`chrome.storage.local`). Nothing is compiled into the build.

| Key | Required | What it is used for | Where to get it |
|---|---|---|---|
| **Deepgram** | Yes | Speech-to-text (streaming) | [console.deepgram.com](https://console.deepgram.com/) → API Keys → Create. New accounts get free credit. |
| **OpenAI** | No | OpenAI translation, Ask AI, meeting summaries | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new secret key. Needs billing enabled. |

Minimal setup, no OpenAI: add the Deepgram key and keep the translation
provider on **MyMemory (free, no key)**. Captions and Notes transcripts work.
The Generate summary button and Ask AI need an OpenAI key.

For better translation quality, add an OpenAI key and switch the provider to
**OpenAI** in Settings.

## Using it

1. Join a Google Meet call, or open a YouTube video.
2. Click the extension icon, optionally add context (names, topic, terms), then **Start Translation**.
3. Vietnamese captions appear near the bottom of the page. Use the popup switch to also show the English line.
4. Click the round **AI** button on the page:
   - **Lịch sử**: Vietnamese translation of the current meeting
   - **Hỏi AI**: ask questions about what was just said
   - **Notes**: saved meetings. Open one to read the transcript, **Generate summary**, rename, download as `.md`, or delete it
5. Click **Stop** to end the meeting. You can Start again without reloading the page.

Each Start → Stop is one meeting. Notes keep only the English that was heard,
not the translation, and stay on your device until you delete them.

## Privacy

No server of ours is involved. While you translate, tab audio goes to Deepgram,
and caption text goes to your chosen translation provider. Summaries and Ask AI
send transcript text to OpenAI. Details in [PRIVACY.md](PRIVACY.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Add your Deepgram API key in Settings first." | Open Settings from the popup and save a Deepgram key. |
| "Open a Google Meet call or a YouTube tab first" | Switch to a Meet or YouTube tab, then click Start. |
| No captions, status says Listening | Make sure someone is speaking and the tab is not muted. Only that tab's audio is captured. |
| Summary or Ask AI says it needs an OpenAI key | Add an OpenAI key in Settings. |
| Changes not showing after a rebuild | Reload the extension in `chrome://extensions` and refresh the Meet tab. |

## Development

```bash
npm run dev         # vite build --watch (no HMR: reload the extension after each rebuild)
npm run typecheck   # tsc --noEmit
npm run build       # production build into dist/
npm run package     # build and zip dist/ as meet-live-translator.zip for the Chrome Web Store
```

There is no test runner or linter configured. Store listing text and permission
justifications are in [docs/store-listing.md](docs/store-listing.md).

### How it works

```
Meet / YouTube tab
  → chrome.tabCapture
  → Offscreen document (AudioContext + AudioWorklet, 16 kHz mono PCM16, ~100 ms chunks)
  → WebSocket → Deepgram streaming STT (interim + final transcripts)
  → IncrementalTranslator (debounced, versioned, EN → VI)
  → background service worker
  → content script
  → React overlay and sidebar (Shadow DOM)
```

```
src/
├── background/service-worker.ts   Start/stop, offscreen doc, tab discovery, message relay, AI calls
├── offscreen/                     Audio capture pipeline: MediaStream, AudioContext, STT, translation
├── content/
│   ├── CaptionOverlay.tsx         Live captions
│   ├── AskAiSidebar.tsx           Sidebar with Lịch sử / Hỏi AI / Notes tabs
│   ├── NotesTab.tsx, notes-store.ts   Saved meetings (chrome.storage.local)
│   └── transcript-store.ts        In-memory rolling transcript used as Ask AI context
├── popup/                         Start/Stop, context, source-line toggle
├── options/                       Settings page for API keys
├── services/
│   ├── stt/                       StreamingSTTProvider + Deepgram
│   ├── translation/               TranslationProvider, providers, IncrementalTranslator
│   └── ai/                        Ask AI (gpt-4o-mini) and meeting summary (gpt-4.1)
└── shared/                        Typed messages, shared types, settings, logger

public/worklets/audio-processor.js   AudioWorkletProcessor (plain JS, loaded at runtime)
manifest.config.ts                   MV3 manifest (via @crxjs/vite-plugin)
```

Swapping providers: implement `StreamingSTTProvider` (`src/services/stt/types.ts`)
or `TranslationProvider` (`src/services/translation/types.ts`) and register it in
`createTranslationProvider` (`src/services/translation/providers.ts`).

### Latency

| Stage | Typical cost |
|---|---|
| AudioWorklet buffering | ~100 ms (deliberate chunk size) |
| Deepgram interim transcript | ~150–400 ms from speech onset |
| Translation debounce | 150 ms for interim, 0 ms for final |
| Translation API round trip | ~100–500 ms (MyMemory free tier is the largest variable) |
| Message relay and overlay update | under 30 ms |

Expect about 400 ms–1.2 s end to end. A faster translation provider is the
single biggest improvement.

## Limitations

English → Vietnamese only. No speaker identification, no audio recording, one
translating tab at a time. Google Meet's own caption DOM is never used as a
transcript source.
