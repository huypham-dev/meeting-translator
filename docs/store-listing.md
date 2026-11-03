# Chrome Web Store listing

## Name
Meet Live Translator (EN → VI)

## Short description (max 132 chars)
Live English to Vietnamese captions for Google Meet and YouTube, with saved meeting notes and AI summaries.

## Detailed description
Understand English meetings in real time. Meet Live Translator listens to the audio of your Google Meet or YouTube tab and shows Vietnamese captions as people speak.

- Live captions that update as sentences form
- Optional English source line under each caption
- Notes: every session is saved with a timestamped transcript
- One-click AI summary: key points, decisions, action items
- Download any meeting as a Markdown file
- Ask AI questions about the meeting in progress

Bring your own keys: you enter a Deepgram key (speech-to-text) and optionally an OpenAI key in Settings. Keys stay in your browser.

## Single purpose
Show live English to Vietnamese captions for the audio of the current meeting or video tab, and keep notes of what was said.

## Permission justifications
- **tabCapture**: capture the audio of the Meet/YouTube tab for speech-to-text.
- **offscreen**: host the audio pipeline (AudioContext, WebSocket) that a service worker cannot run.
- **activeTab**: start capture on the tab the user is viewing when they click Start.
- **storage / unlimitedStorage**: save settings and meeting notes; long meetings can exceed the default quota.
- **Host `meet.google.com`, `www.youtube.com`**: inject the caption overlay and Notes sidebar.
- **Host `api.deepgram.com`**: speech-to-text.
- **Host `api.mymemory.translated.net`**: free translation provider.
- **Host `api.openai.com`**: optional translation, Ask AI, and summaries with the user's key.

## Data disclosure (Privacy practices tab)
- Collects: website content (audio and caption text) and authentication information (user-entered API keys).
- Purpose: app functionality only. Not sold, not used for unrelated purposes, not used for creditworthiness.
- Privacy policy URL: link to PRIVACY.md on GitHub.

## Assets still needed
Screenshots (1280x800) and a 440x280 promo tile. Icons exist in `public/icons`.
