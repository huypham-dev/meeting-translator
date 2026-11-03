# Privacy Policy

_Meet Live Translator (EN → VI). Last updated: 2026-11-03._

Meet Live Translator has no server of its own and collects no data. Everything below happens in your browser or goes directly from your browser to the provider you configured.

## What the extension processes

- **Tab audio**: while you press Start, audio of the Google Meet or YouTube tab is captured and streamed to **Deepgram** for speech-to-text. Audio is never recorded or stored by the extension.
- **Caption text**: the recognized English text is sent to your chosen translation provider (**MyMemory** by default, or **OpenAI**) to be translated into Vietnamese.
- **Notes**: finalized English sentences of each meeting are saved in your browser (`chrome.storage.local`) so you can read, summarize, download, or delete them. They are never uploaded unless you use an OpenAI feature below.
- **AI features**: when you use Ask AI or Generate summary, the relevant transcript text is sent to **OpenAI** using your key.
- **Settings**: your API keys and options are stored in `chrome.storage.local` on your device and are sent only to the provider they belong to.

## What we do not do

We do not run servers, collect analytics, sell data, or share data with anyone other than the providers you configure. Those providers handle data under their own policies:

- Deepgram: https://deepgram.com/privacy
- MyMemory: https://mymemory.translated.net/doc/privacy.php
- OpenAI: https://openai.com/policies/privacy-policy

## Your control

You can delete any saved meeting in the Notes tab, remove your API keys in Settings, or uninstall the extension to remove all stored data.

## Contact

Open an issue at https://github.com/huypham-dev/meeting-translator/issues
