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
      if (source.trim()) entries = [...entries, { source, translated, timestamp: Date.now() }];
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

/** Upper bound on context size (~15k tokens) so a very long meeting never overflows the model. */
const MAX_CONTEXT_CHARS = 60_000;

/**
 * Transcript from the last `minutes` (`Infinity` = the whole meeting), formatted as
 * plain-text AI context. If it exceeds the size cap, the oldest lines are dropped.
 */
export function getRecentTranscriptText(minutes: number): string {
  const cutoff = Date.now() - minutes * 60_000;
  const recent = entries.filter((e) => e.timestamp >= cutoff);
  const withLive = live ? [...recent, live] : recent;
  const text = withLive
    .map((e) => (e.translated ? `EN: ${e.source}\nVI: ${e.translated}` : `EN: ${e.source}`))
    .join("\n\n");
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  const tail = text.slice(-MAX_CONTEXT_CHARS);
  // Start at a line boundary so the first line is not cut in half.
  const firstBreak = tail.indexOf("\n\n");
  return firstBreak === -1 ? tail : tail.slice(firstBreak + 2);
}
