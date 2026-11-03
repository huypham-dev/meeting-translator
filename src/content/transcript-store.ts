import { isExtensionMessage, MessageType } from "@/shared/messages";

export interface TranscriptEntry {
  source: string;
  translated: string;
  timestamp: number;
}

/**
 * Session-scoped rolling transcript (source EN + translated VI, timestamped),
 * kept purely as context for the "Ask AI about current meeting" sidebar.
 * Independent of CaptionOverlay's own on-screen history - both listen to the
 * same TRANSLATION_UPDATE broadcast.
 */
let entries: TranscriptEntry[] = [];
let live: TranscriptEntry | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

/** Finalized entries, oldest first. Re-read after the callback below fires. */
export function getTranscriptEntries(): readonly TranscriptEntry[] {
  return entries;
}

export function subscribeTranscript(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isExtensionMessage(message)) return;

  if (message.type === MessageType.TRANSLATION_UPDATE) {
    const { source, translated, isFinal } = message.payload;

    if (isFinal) {
      if (translated.trim()) entries = [...entries, { source, translated, timestamp: Date.now() }];
      live = null;
      notify();
    } else {
      live = { source, translated, timestamp: Date.now() };
    }
  }

  if (message.type === MessageType.CLEAR_CAPTION) {
    entries = [];
    live = null;
    notify();
  }
});

/** Transcript from the last `minutes`, formatted as plain-text AI context. */
export function getRecentTranscriptText(minutes: number): string {
  const cutoff = Date.now() - minutes * 60_000;
  const recent = entries.filter((e) => e.timestamp >= cutoff);
  const withLive = live ? [...recent, live] : recent;
  return withLive.map((e) => `EN: ${e.source}\nVI: ${e.translated}`).join("\n\n");
}
