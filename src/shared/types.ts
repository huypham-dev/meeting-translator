export type TranslationStatus =
  | "idle"
  | "starting"
  | "listening"
  | "error"
  | "stopping";

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

/** Language being spoken in the meeting. Vietnamese is notes-only (no captions, no translation). */
export type SourceLanguage = "en" | "vi";

export interface CaptionState {
  source: string;
  translated: string;
  isFinal: boolean;
  /** Language of `source`. Absent on messages from older sessions; treat as English. */
  language?: SourceLanguage;
}

export interface StatusUpdate {
  status: TranslationStatus;
  message?: string;
}

/** Audio format produced by the AudioWorklet and consumed by STT providers. */
export const PCM_SAMPLE_RATE = 16000;
export const PCM_CHANNELS = 1;
export const PCM_CHUNK_MS = 100;

/** chrome.storage.local key: show the English source line above each caption. */
export const SHOW_SOURCE_STORAGE_KEY = "showSourceCaption";

/** One finalized spoken sentence, in the language that was heard. */
export interface NoteLine {
  text: string;
  timestamp: number;
}

/** A saved translation session: transcript plus an optional AI summary. */
export interface Meeting {
  id: string;
  /** document.title of the tab when the meeting started. */
  title: string;
  /** User-chosen name; overrides the default title + date label. */
  name?: string;
  startedAt: number;
  endedAt?: number;
  lines: NoteLine[];
  summary?: { text: string; generatedAt: number };
}

/** chrome.storage.local key prefix: each Meeting lives under `${prefix}${id}`. */
export const MEETING_STORAGE_PREFIX = "meeting:";
