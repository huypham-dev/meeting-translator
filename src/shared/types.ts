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

export interface CaptionState {
  source: string;
  translated: string;
  isFinal: boolean;
}

export interface StatusUpdate {
  status: TranslationStatus;
  message?: string;
}

/** Audio format produced by the AudioWorklet and consumed by STT providers. */
export const PCM_SAMPLE_RATE = 16000;
export const PCM_CHANNELS = 1;
export const PCM_CHUNK_MS = 100;
